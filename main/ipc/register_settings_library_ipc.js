const {
  resolveSourceAdapterForStartPage,
  getSourceAdapterById,
  listSourceAdapterSlots,
} = require("../../preload/source_adapters/registry");

function registerSettingsLibraryIpcHandlers(context) {
  const {
    ipcMain, settingsManager, dl, LIBRARY_ROOT, DEFAULT_LIBRARY_ROOT, resolveConfiguredLibraryRoot, validateWritableDirectory, validateWritableDirectoryAsync, isDirectoryEmpty, isDirectoryEmptyAsync, isSameOrChildPath, migrateLibraryContentsBatched, issueLibraryCleanupToken, applyConfiguredLibraryRoot, sendToGallery, sendToDownloader, sendToBrowser, sendToReader, scanLibraryContents, scanLibraryContentsAsync, dialog, getGalleryWin, getBrowserWin, getDownloaderWin, isProtectedCleanupPath, consumeLibraryCleanupToken, cleanupHelpers, fs, path, shell
  } = context;

  const validateWritableDirectorySafe = async (targetPath) => {
    if (typeof validateWritableDirectoryAsync === "function") {
      return validateWritableDirectoryAsync(targetPath, fs);
    }
    return validateWritableDirectory(targetPath, fs);
  };

  const isDirectoryEmptySafe = async (targetPath) => {
    if (typeof isDirectoryEmptyAsync === "function") {
      return isDirectoryEmptyAsync(targetPath, fs);
    }
    return isDirectoryEmpty(targetPath, fs);
  };

  const scanLibraryContentsSafe = async (targetPath, options = {}) => {
    const scanOptions = {
      ...options,
      fsModule: fs,
    };
    if (typeof scanLibraryContentsAsync === "function") {
      return scanLibraryContentsAsync(targetPath, scanOptions);
    }
    return scanLibraryContents(targetPath, scanOptions);
  };


  const readAvailableBytes = async (targetPath) => {
    const stats = await fs.promises.statfs(targetPath);
    return Number(stats.bavail || 0) * Number(stats.bsize || 0);
  };

ipcMain.handle("settings:get", async () => ({ ok: true, settings: settingsManager.getSettings() }));


ipcMain.handle("settings:listSourceAdapters", async () => ({
  ok: true,
  adapters: listSourceAdapterSlots(),
}));

ipcMain.handle("settings:validateStartPageUrl", async (_e, value, sourceId = "") => {
  const urlValue = String(value || "").trim();
  if (!urlValue) return { ok: true, isValid: false, sourceId: null };
  const adapter = resolveSourceAdapterForStartPage(urlValue);
  const requestedSourceId = String(sourceId || "").trim();
  const expectedAdapter = requestedSourceId ? getSourceAdapterById(requestedSourceId) : null;
  const matchesExpected = expectedAdapter ? adapter?.sourceId === expectedAdapter.sourceId : true;
  return {
    ok: true,
    isValid: Boolean(adapter) && matchesExpected,
    sourceId: adapter?.sourceId || null,
    expectedSourceId: expectedAdapter?.sourceId || null,
  };
});

ipcMain.handle("settings:update", async (_e, payload) => {
  const partial = payload && typeof payload === "object" ? { ...payload } : {};
  const moveLibraryContent = Boolean(partial.moveLibraryContent);
  delete partial.moveLibraryContent;

  const currentSettings = settingsManager.getSettings();
  const requestedLibraryPath = Object.prototype.hasOwnProperty.call(partial, "libraryPath")
    ? partial.libraryPath
    : currentSettings.libraryPath;
  const pathChanged = String(requestedLibraryPath || "") !== String(currentSettings.libraryPath || "");

  if (pathChanged && dl.hasInProgressDownloads()) {
    return {
      ok: false,
      error: "Cannot change library location while downloads are in progress.",
    };
  }

  let migration = { attempted: false, moved: false };
  const sendMoveProgress = (progress) => {
    if (!_e?.sender?.isDestroyed?.()) {
      _e.sender.send("library:moveProgress", progress);
    }
  };
  if (pathChanged && moveLibraryContent) {
    const previousRoot = LIBRARY_ROOT();
    const resolved = resolveConfiguredLibraryRoot(requestedLibraryPath, DEFAULT_LIBRARY_ROOT());
    const validation = await validateWritableDirectorySafe(resolved.preferredRoot);
    if (!validation.ok) {
      return {
        ok: false,
        error: `Selected folder is not writable: ${validation.error}`,
      };
    }
    if (isSameOrChildPath(previousRoot, resolved.preferredRoot)) {
      return {
        ok: false,
        error: "Destination folder cannot be the same as or nested inside the current library.",
      };
    }

    migration.attempted = true;
    sendMoveProgress({ stage: "scan", label: "Preparing library move…", percent: 0 });
    const migrateRes = await migrateLibraryContentsBatched({
      fromRoot: previousRoot,
      toRoot: resolved.preferredRoot,
      onProgress: sendMoveProgress,
    });
    if (!migrateRes.ok) {
      sendMoveProgress({ stage: "error", label: "Move failed.", percent: 0 });
      return {
        ok: false,
        error: migrateRes.error || "Library migration failed.",
        migration: migrateRes,
      };
    }
    migration = {
      attempted: true,
      moved: migrateRes.copiedFiles > 0,
      fromRoot: previousRoot,
      toRoot: resolved.preferredRoot,
      fileCount: migrateRes.fileCount,
      copiedFiles: migrateRes.copiedFiles,
      skippedFiles: migrateRes.skippedFiles,
      totalBytes: migrateRes.totalBytes,
      skippedSymlinks: migrateRes.skippedSymlinks || 0,
      cleanupToken:
        migrateRes.copiedFiles > 0
          ? issueLibraryCleanupToken(previousRoot, resolved.preferredRoot)
          : "",
    };
    sendMoveProgress({ stage: "done", label: "Move completed.", percent: 100 });
  }

  let next = settingsManager.updateSettings(partial);
  const libraryPathResult = applyConfiguredLibraryRoot(next.libraryPath);
  if (libraryPathResult.usedFallback && next.libraryPath) {
    console.warn("[library path] configured path is not accessible. Reverting to default path.");
    next = settingsManager.updateSettings({ libraryPath: "" });
  }
  sendToGallery("settings:updated", next);
  sendToDownloader("settings:updated", next);
  sendToBrowser("settings:updated", next);
  sendToReader("settings:updated", next);
  return {
    ok: true,
    settings: next,
    activeLibraryPath: LIBRARY_ROOT(),
    warning: libraryPathResult.warning || "",
    migration,
  };
});

ipcMain.handle("library:pathInfo", async () => ({
  ok: true,
  configuredPath: settingsManager.getSettings().libraryPath || "",
  activePath: LIBRARY_ROOT(),
  defaultPath: DEFAULT_LIBRARY_ROOT(),
}));

ipcMain.handle("library:currentStats", async () => {
  const scan = await scanLibraryContentsSafe(LIBRARY_ROOT());
  if (!scan.ok) {
    return { ok: false, error: scan.error || "Failed to scan current library." };
  }
  return {
    ok: true,
    activePath: LIBRARY_ROOT(),
    fileCount: scan.fileCount,
    totalBytes: scan.totalBytes,
  };
});

ipcMain.handle("library:choosePath", async (_e, options = {}) => {
  const defaultPath = DEFAULT_LIBRARY_ROOT();
  const configuredPath = settingsManager.getSettings().libraryPath || "";
  const currentPath = String(options.currentPath || "").trim() || configuredPath || defaultPath;
  const res = await dialog.showOpenDialog(getGalleryWin() || getBrowserWin() || getDownloaderWin() || null, {
    title: "Choose library folder",
    defaultPath: currentPath,
    properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
  });
  if (res.canceled || !res.filePaths?.length) {
    return { ok: false, canceled: true };
  }
  const selectedPath = res.filePaths[0];
  return { ok: true, path: selectedPath };
});

ipcMain.handle("library:estimateMove", async (_e, options = {}) => {
  if (dl.hasInProgressDownloads()) {
    return {
      ok: false,
      error: "Cannot move library while downloads are in progress.",
      blockedByDownloads: true,
    };
  }
  const fromRoot = LIBRARY_ROOT();
  const requestedPath = String(options.toPath || "").trim();
  const resolved = resolveConfiguredLibraryRoot(requestedPath, DEFAULT_LIBRARY_ROOT());
  const validation = await validateWritableDirectorySafe(resolved.preferredRoot);
  if (!validation.ok) {
    return {
      ok: false,
      error: `Selected folder is not writable: ${validation.error}`,
    };
  }
  if (isSameOrChildPath(fromRoot, resolved.preferredRoot)) {
    return {
      ok: false,
      error: "Destination folder cannot be the same as or nested inside the current library.",
    };
  }
  const scan = await scanLibraryContentsSafe(fromRoot, { skipPaths: [resolved.preferredRoot] });
  if (!scan.ok) {
    return {
      ok: false,
      error: scan.error || "Failed to scan library contents.",
    };
  }
  return {
    ok: true,
    fromRoot,
    toRoot: resolved.preferredRoot,
    fileCount: scan.fileCount,
    totalBytes: scan.totalBytes,
  };
});

ipcMain.handle("library:validateMoveTarget", async (_e, options = {}) => {
  if (dl.hasInProgressDownloads()) {
    return {
      ok: false,
      error: "Cannot move library while downloads are in progress.",
      blockedByDownloads: true,
    };
  }
  const fromRoot = LIBRARY_ROOT();
  const requestedPath = String(options.toPath || "").trim();
  const resolved = resolveConfiguredLibraryRoot(requestedPath, DEFAULT_LIBRARY_ROOT());
  if (!requestedPath) {
    return {
      ok: false,
      error: "Select a destination folder.",
      permissionMessage: "Waiting for folder selection.",
      emptyFolderMessage: "Waiting for folder selection.",
      freeSpaceMessage: "Waiting for folder selection.",
    };
  }
  if (isSameOrChildPath(fromRoot, resolved.preferredRoot)) {
    return {
      ok: true,
      permissionOk: false,
      emptyFolderOk: false,
      freeSpaceOk: false,
      error: "Destination folder cannot be the same as or nested inside the current library.",
      permissionMessage: "Destination folder is invalid.",
      emptyFolderMessage: "Destination folder is invalid.",
      freeSpaceMessage: "Destination folder is invalid.",
      requiredBytes: 0,
      availableBytes: 0,
    };
  }

  const permission = await validateWritableDirectorySafe(resolved.preferredRoot);
  if (!permission.ok) {
    return {
      ok: true,
      permissionOk: false,
      emptyFolderOk: false,
      freeSpaceOk: false,
      requiredBytes: 0,
      availableBytes: 0,
      error: `Selected folder is not writable: ${permission.error}`,
      permissionMessage: "Selected folder is not writable.",
      emptyFolderMessage: "Unable to verify folder emptiness.",
      freeSpaceMessage: "Unable to verify available space.",
    };
  }

  const destinationState = await isDirectoryEmptySafe(resolved.preferredRoot);
  if (!destinationState.ok) {
    return {
      ok: true,
      permissionOk: true,
      emptyFolderOk: false,
      freeSpaceOk: false,
      requiredBytes: 0,
      availableBytes: 0,
      error: `Failed to inspect destination folder: ${destinationState.error}`,
      permissionMessage: "Selected folder is writable.",
      emptyFolderMessage: "Unable to inspect destination folder.",
      freeSpaceMessage: "Unable to verify available space.",
    };
  }
  if (!destinationState.empty) {
    return {
      ok: true,
      permissionOk: true,
      emptyFolderOk: false,
      freeSpaceOk: false,
      requiredBytes: 0,
      availableBytes: 0,
      error: "Destination folder must be empty before moving the library.",
      permissionMessage: "Selected folder is writable.",
      emptyFolderMessage: "Destination folder must be empty.",
      freeSpaceMessage: "Destination folder must be empty.",
    };
  }

  const scan = await scanLibraryContentsSafe(fromRoot, { skipPaths: [resolved.preferredRoot] });
  if (!scan.ok) {
    return { ok: false, error: scan.error || "Failed to scan library contents." };
  }

  let availableBytes = 0;
  try {
    availableBytes = await readAvailableBytes(resolved.preferredRoot);
  } catch (err) {
    return {
      ok: true,
      permissionOk: true,
      emptyFolderOk: true,
      freeSpaceOk: false,
      requiredBytes: Number(scan.totalBytes || 0),
      availableBytes: 0,
      error: `Failed to read free space: ${String(err)}`,
      permissionMessage: "Selected folder is writable.",
      emptyFolderMessage: "Destination folder is empty.",
      freeSpaceMessage: "Unable to verify available space.",
    };
  }

  const requiredBytes = Number(scan.totalBytes || 0);
  const freeSpaceOk = availableBytes >= requiredBytes;

  return {
    ok: true,
    permissionOk: true,
    emptyFolderOk: true,
    freeSpaceOk,
    requiredBytes,
    availableBytes,
    permissionMessage: "Selected folder is writable.",
    emptyFolderMessage: "Destination folder is empty.",
    freeSpaceMessage: freeSpaceOk ? "Enough free space." : "Not enough free space.",
    fromRoot,
    toRoot: resolved.preferredRoot,
  };
});

ipcMain.handle("library:cleanupOldPath", async (_e, options = {}) => {
  const oldPath = path.resolve(String(options.path || ""));
  if (!oldPath) return { ok: false, error: "Invalid cleanup path." };

  const auth = consumeLibraryCleanupToken(oldPath, options.token);
  if (!auth.ok) return auth;

  if (isProtectedCleanupPath(oldPath)) {
    return { ok: false, error: "Refusing to clean up a protected system path." };
  }
  try {
    await fs.promises.stat(oldPath);
  } catch (err) {
    if (err?.code === "ENOENT") return { ok: true, removed: false };
    return { ok: false, error: `Failed to inspect cleanup path: ${String(err)}` };
  }
  if (oldPath === path.resolve(LIBRARY_ROOT())) {
    return { ok: false, error: "Cannot clean up the active library path." };
  }
  try {
    await shell.trashItem(oldPath);
    return { ok: true, removed: true };
  } catch (err) {
    return { ok: false, error: `Failed to move old library to trash: ${String(err)}` };
  }
});

}

module.exports = { registerSettingsLibraryIpcHandlers };
