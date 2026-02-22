function registerImporterIpcHandlers(context) {
  const {
    ipcMain, dialog, getImporterWin, getGalleryWin, getBrowserWin, getDownloaderWin, scanImportRoot, scanSingleManga, normalizeImportItemsPayload, importLibraryCandidates, sendToGallery, ensureDirs, vaultManager, fs, LIBRARY_ROOT, path, buildComicEntry, getVaultRelPath, movePlainDirectImagesToVault, normalizeGalleryId, writeLibraryIndexEntry
  } = context;

  const warnIpcFailure = (operation, err) => {
    const code = err?.code ? ` (${String(err.code)})` : "";
    const message = err?.message ? ` ${String(err.message)}` : "";
    console.warn(`[ipc] ${operation} failed${code}.${message}`.trim());
  };

ipcMain.handle("importer:chooseRoot", async (_e, mode = "root") => {
  const targetWindow = getImporterWin() && !getImporterWin().isDestroyed() ? getImporterWin() : getGalleryWin();
  const isSingleMode = mode === "single";
  const result = await dialog.showOpenDialog(targetWindow ?? null, {
    properties: ["openDirectory", "dontAddToRecent"],
    title: isSingleMode ? "Select single manga folder" : "Select library root folder",
  });
  if (result.canceled || !result.filePaths?.length) {
    return { ok: false, canceled: true };
  }
  return { ok: true, rootPath: result.filePaths[0] };
});

ipcMain.handle("importer:scanRoot", async (_e, rootPath) => {
  try {
    const payload = await scanImportRoot(rootPath);
    return { ok: true, ...payload };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("importer:scanSingleManga", async (_e, folderPath) => {
  try {
    const payload = await scanSingleManga(folderPath);
    return { ok: true, ...payload };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("importer:getMetadataSuggestions", async () => {
  ensureDirs();

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) return { ok: false, error: "Vault required", requiresVault: true };
  if (!vaultStatus.unlocked) return { ok: false, error: "Vault locked", locked: true };

  let dirs = [];
  try {
    dirs = (await fs.promises.readdir(LIBRARY_ROOT(), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("comic_"))
      .map((entry) => path.join(LIBRARY_ROOT(), entry.name));
  } catch (err) {
    warnIpcFailure("importer:getMetadataSuggestions readdir", err);
    dirs = [];
  }

  const artists = new Set();
  const languages = new Set();
  const tags = new Set();

  const entries = await Promise.all(dirs.map((dir) => buildComicEntry(dir)));
  for (const entry of entries) {
    const artist = String(entry?.artist || "").trim();
    if (artist) artists.add(artist);

    const languageList = Array.isArray(entry?.languages) ? entry.languages : [];
    for (const language of languageList) {
      const normalized = String(language || "").trim();
      if (normalized) languages.add(normalized);
    }

    const tagList = Array.isArray(entry?.tags) ? entry.tags : [];
    for (const tag of tagList) {
      const normalized = String(tag || "").trim();
      if (normalized) tags.add(normalized);
    }
  }

  const sortStrings = (items) => items.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  return {
    ok: true,
    artists: sortStrings(Array.from(artists)),
    languages: sortStrings(Array.from(languages)),
    tags: sortStrings(Array.from(tags)),
  };
});

ipcMain.handle("importer:run", async (_e, payload = {}) => {
  ensureDirs();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, error: "Vault locked", locked: true };
  }

  try {
    const normalizedPayload = normalizeImportItemsPayload(payload);
    const result = await importLibraryCandidates({
      items: normalizedPayload.items,
      libraryRoot: LIBRARY_ROOT(),
      vaultManager,
      getVaultRelPath,
      movePlainDirectImagesToVault,
      normalizeGalleryId,
      writeLibraryIndexEntry,
      onProgress: (progressPayload) => {
        if (_e?.sender && !_e.sender.isDestroyed()) {
          _e.sender.send("importer:progress", progressPayload);
        }
      },
    });

    if (Array.isArray(result.results)) {
      for (const item of result.results) {
        if (item?.status !== "imported" || !item?.finalDir) continue;
        try {
          const entry = await buildComicEntry(item.finalDir);
          sendToGallery("library:changed", {
            at: Date.now(),
            action: "update",
            comicDir: item.finalDir,
            entry,
            reason: "importer",
          });
        } catch (err) {
          console.warn("[ipc] importer:run buildComicEntry failed", String(err));
          sendToGallery("library:changed", { at: Date.now(), reason: "importer" });
          break;
        }
      }
    } else if (result.imported > 0) {
      sendToGallery("library:changed", { at: Date.now(), reason: "importer" });
    }

    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

}

module.exports = { registerImporterIpcHandlers };
