function registerExporterIpcHandlers(context) {
  const {
    ipcMain, dialog, getExporterWin, getGalleryWin, getBrowserWin, getDownloaderWin, fs, path, LIBRARY_ROOT, buildSelectedEntries, listLibraryEntriesForExport, estimateExportBytes, mapExportResult, exportSingleManga, validateWritableDirectory, isDirectoryEmpty, ensureDirs, vaultManager
  } = context;

  const readAvailableBytes = async (targetPath) => {
    const stats = await fs.promises.statfs(targetPath);
    return Number(stats.bavail || 0) * Number(stats.bsize || 0);
  };

ipcMain.handle("exporter:chooseDestination", async (_e, options = {}) => {
  const targetWindow = getExporterWin() && !getExporterWin().isDestroyed() ? getExporterWin() : getGalleryWin();
  const result = await dialog.showOpenDialog(targetWindow ?? null, {
    properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    title: "Select export destination folder",
    defaultPath: String(options.defaultPath || "").trim() || undefined,
  });
  if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, destinationPath: result.filePaths[0] };
});

ipcMain.handle("exporter:checkDestination", async (_e, payload = {}) => {
  const destinationPath = path.resolve(String(payload.destinationPath || "").trim());
  const selectedMangaIds = Array.isArray(payload.selectedMangaIds)
    ? payload.selectedMangaIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!destinationPath) {
    return {
      ok: false,
      error: "Select a destination folder.",
    };
  }

  if (!selectedMangaIds.length) {
    return {
      ok: true,
      destinationPath,
      checks: {
        permission: { ok: false, message: "Select at least one manga before exporting." },
        emptyFolder: { ok: false, message: "Select at least one manga before exporting." },
        freeSpace: {
          ok: false,
          requiredBytes: 0,
          availableBytes: 0,
          message: "Select at least one manga before exporting.",
        },
      },
      allOk: false,
    };
  }

  const permission = validateWritableDirectory(destinationPath);
  if (!permission.ok) {
    return {
      ok: true,
      destinationPath,
      checks: {
        permission: { ok: false, message: "Selected folder is not writable." },
        emptyFolder: { ok: false, message: "Unable to verify folder contents." },
        freeSpace: { ok: false, requiredBytes: 0, availableBytes: 0, message: "Unable to verify free space." },
      },
      allOk: false,
      error: permission.error,
    };
  }

  const emptyState = isDirectoryEmpty(destinationPath);
  if (!emptyState.ok) {
    return {
      ok: true,
      destinationPath,
      checks: {
        permission: { ok: true, message: "Selected folder is writable." },
        emptyFolder: { ok: false, message: "Unable to inspect destination folder." },
        freeSpace: { ok: false, requiredBytes: 0, availableBytes: 0, message: "Unable to verify free space." },
      },
      allOk: false,
      error: emptyState.error,
    };
  }

  const selected = await buildSelectedEntries({
    selectedMangaIds,
    listLibraryEntries: listLibraryEntriesForExport,
  });
  const entries = selected.map((item) => item.entry).filter(Boolean);
  const requiredBytes = await estimateExportBytes(entries);

  let availableBytes = 0;
  let freeSpaceOk = false;
  let freeSpaceMessage = "Unable to verify free space.";
  try {
    availableBytes = await readAvailableBytes(destinationPath);
    freeSpaceOk = availableBytes >= requiredBytes;
    freeSpaceMessage = freeSpaceOk ? "Enough free space." : "Not enough free space.";
  } catch (err) {
    freeSpaceMessage = `Unable to verify free space: ${String(err)}`;
  }

  const checks = {
    permission: { ok: true, message: "Selected folder is writable." },
    emptyFolder: {
      ok: emptyState.empty,
      message: emptyState.empty ? "Destination folder is empty." : "Destination folder must be empty.",
    },
    freeSpace: {
      ok: freeSpaceOk,
      requiredBytes,
      availableBytes,
      message: freeSpaceMessage,
    },
  };
  return {
    ok: true,
    destinationPath,
    checks,
    allOk: checks.permission.ok && checks.emptyFolder.ok && checks.freeSpace.ok,
  };
});

ipcMain.handle("exporter:run", async (_e, payload = {}) => {
  ensureDirs();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) return { ok: false, error: "Vault required", requiresVault: true };
  if (!vaultStatus.unlocked) return { ok: false, error: "Vault locked", locked: true };

  const destinationPath = path.resolve(String(payload.destinationPath || "").trim());
  const selectedMangaIds = Array.isArray(payload.items)
    ? payload.items.map((item) => String(item?.mangaId || "").trim()).filter(Boolean)
    : [];
  if (!destinationPath || !selectedMangaIds.length) {
    return { ok: false, error: "Destination and selected manga are required." };
  }

  const destinationCheck = await (async () => {
    const permission = validateWritableDirectory(destinationPath);
    if (!permission.ok) return { ok: false, error: `Destination folder is not writable: ${permission.error}` };
    const emptyState = isDirectoryEmpty(destinationPath);
    if (!emptyState.ok) return { ok: false, error: `Unable to inspect destination folder: ${emptyState.error}` };
    if (!emptyState.empty) return { ok: false, error: "Destination folder must be empty before export." };
    return { ok: true };
  })();
  if (!destinationCheck.ok) return destinationCheck;

  const selected = await buildSelectedEntries({
    selectedMangaIds,
    listLibraryEntries: listLibraryEntriesForExport,
  });

  const results = [];
  let exported = 0;
  let skipped = 0;
  let failed = 0;
  const total = selected.length;
  let globalFailureMessage = "";

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const progressBase = {
      current: index + 1,
      total,
      mangaId: item.id,
    };

    if (globalFailureMessage) {
      failed += 1;
      const row = mapExportResult({
        mangaId: item.id,
        title: item.entry?.title || item.id,
        status: "failed",
        message: globalFailureMessage,
      });
      results.push(row);
      _e.sender.send("exporter:progress", { ...progressBase, status: row.status, message: row.message });
      continue;
    }

    if (!item.entry) {
      skipped += 1;
      const row = mapExportResult({
        mangaId: item.id,
        title: item.id,
        status: "skipped",
        message: "Manga not found in library.",
      });
      results.push(row);
      _e.sender.send("exporter:progress", { ...progressBase, status: row.status, message: row.message });
      continue;
    }

    try {
      await fs.promises.access(destinationPath, fs.constants.W_OK);
      const outPath = await exportSingleManga({ entry: item.entry, destinationPath });
      exported += 1;
      const row = mapExportResult({
        mangaId: item.id,
        title: item.entry.title || item.id,
        status: "exported",
        outputPath: outPath,
        message: "Exported successfully.",
      });
      results.push(row);
      _e.sender.send("exporter:progress", { ...progressBase, status: row.status, message: row.message });
    } catch (err) {
      const errorMessage = String(err);
      if (/ENOENT|ENOTDIR|EACCES|EPERM|EROFS/i.test(errorMessage)) {
        globalFailureMessage = `Destination became unavailable: ${errorMessage}`;
      }
      failed += 1;
      const row = mapExportResult({
        mangaId: item.id,
        title: item.entry.title || item.id,
        status: "failed",
        message: globalFailureMessage || errorMessage,
      });
      results.push(row);
      _e.sender.send("exporter:progress", { ...progressBase, status: row.status, message: row.message });
    }
  }

  return { ok: true, exported, skipped, failed, results };
});

}

module.exports = { registerExporterIpcHandlers };
