const {
  resolveSourceAdapterForStartPage,
  getSourceAdapterById,
  listSourceAdapterSlots,
} = require("../../preload/source_adapters/registry");
const nodePath = require("path");
const { ENABLE_LIBRARY_PATH_TRACE_CMD_LOGGING } = require("../../shared/dev_mode");

function registerSettingsLibraryIpcHandlers(context) {
  const {
    ipcMain, settingsManager, dl, LIBRARY_ROOT, DEFAULT_LIBRARY_ROOT, resolveConfiguredLibraryRoot, validateWritableDirectory, validateWritableDirectoryAsync, isDirectoryEmpty, isDirectoryEmptyAsync, isSameOrChildPath, migrateLibraryContentsBatched, issueLibraryCleanupToken, applyConfiguredLibraryRoot, ensureActiveLibraryScopedEncryptedState, sendToGallery, sendToDownloader, sendToBrowser, sendToReader, scanLibraryContents, scanLibraryContentsAsync, dialog, getGalleryWin, getBrowserWin, getDownloaderWin, isProtectedCleanupPath, consumeLibraryCleanupToken, cleanupHelpers, fs, path, shell, vaultManager
  } = context;

  const migrateLibraryScopedStateSafe = async () => {
    if (typeof ensureActiveLibraryScopedEncryptedState !== "function") {
      return { ok: true, skipped: true, reason: "migration_unavailable" };
    }
    const migrationResult = await ensureActiveLibraryScopedEncryptedState();
    if (!migrationResult || typeof migrationResult !== "object") {
      return { ok: true, skipped: true, reason: "migration_noop" };
    }
    return migrationResult;
  };

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

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  const logLibraryPathTrace = (event, details = {}) => {
    if (!ENABLE_LIBRARY_PATH_TRACE_CMD_LOGGING) return;
    try {
      console.info(`[library-path][trace] ${event}`, JSON.stringify(details));
    } catch {
      console.info(`[library-path][trace] ${event}`);
    }
  };

  const normalizeLibraryChooserPayload = (payload = {}) => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "Invalid folder chooser payload." };
    }
    const allowedKeys = new Set(["currentPath"]);
    for (const key of Object.keys(payload)) {
      if (!allowedKeys.has(key)) {
        return { ok: false, error: "Invalid folder chooser payload." };
      }
    }

    if (!hasOwn(payload, "currentPath")) {
      return { ok: true, currentPath: "" };
    }
    if (typeof payload.currentPath !== "string") {
      return { ok: false, error: "Invalid current path hint." };
    }
    return { ok: true, currentPath: payload.currentPath.trim() };
  };

  const normalizeChosenPath = async (selectedPath) => {
    if (typeof selectedPath !== "string") {
      return { ok: false, error: "Selected folder is invalid." };
    }
    const trimmed = selectedPath.trim();
    if (!trimmed) {
      return { ok: false, error: "Selected folder is invalid." };
    }

    const normalized = path.resolve(trimmed);
    if (!path.isAbsolute(normalized)) {
      return { ok: false, error: "Selected folder is invalid." };
    }

    try {
      const canonical = await fs.promises.realpath(normalized);
      if (typeof canonical !== "string" || !canonical || !path.isAbsolute(canonical)) {
        return { ok: false, error: "Selected folder is invalid." };
      }
      return { ok: true, path: canonical };
    } catch (err) {
      return { ok: false, error: `Selected folder is not accessible: ${String(err?.message || err)}` };
    }
  };

  const chooseLibraryPath = async (options = {}) => {
    const payload = normalizeLibraryChooserPayload(options);
    if (!payload.ok) {
      return { ok: false, canceled: false, error: payload.error };
    }

    const defaultPath = DEFAULT_LIBRARY_ROOT();
    const configuredPath = settingsManager.getSettings().libraryPath || "";
    const currentPath = payload.currentPath || configuredPath || defaultPath;
    const dialogRes = await dialog.showOpenDialog(getGalleryWin() || getBrowserWin() || getDownloaderWin() || null, {
      title: "Choose library folder",
      defaultPath: currentPath,
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    });
    if (dialogRes.canceled || !dialogRes.filePaths?.length) {
      return { ok: false, canceled: true };
    }

    const normalized = await normalizeChosenPath(dialogRes.filePaths[0]);
    if (!normalized.ok) {
      return { ok: false, canceled: false, error: normalized.error };
    }

    return { ok: true, canceled: false, path: normalized.path };
  };

  const normalizeLoginLibraryPathPayload = (payload = {}) => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "Invalid login library payload." };
    }
    const allowedKeys = new Set(["path"]);
    for (const key of Object.keys(payload)) {
      if (!allowedKeys.has(key)) {
        return { ok: false, error: "Invalid login library payload." };
      }
    }
    if (typeof payload.path !== "string") {
      return { ok: false, error: "Invalid selected folder." };
    }
    return { ok: true, path: payload.path };
  };

  const safePathBaseName = (targetPath) => {
    const normalized = String(targetPath || "").trim();
    if (!normalized) return "<unknown>";
    const base = (typeof path.basename === "function" ? path.basename(normalized) : nodePath.basename(normalized));
    return base || normalized;
  };

  const isPathSystemRoot = (targetPath) => {
    const resolver = typeof path.resolve === "function" ? path.resolve : nodePath.resolve;
    const resolved = resolver(String(targetPath || "").trim());
    if (!resolved) return false;
    const parseFn = typeof path.parse === "function" ? path.parse : nodePath.parse;
    const parsed = parseFn(resolved);
    return parsed.root && resolved === parsed.root;
  };

  const isPathInsideAppRuntime = (targetPath) => {
    const resolver = typeof path.resolve === "function" ? path.resolve : nodePath.resolve;
    const resolved = resolver(String(targetPath || "").trim());
    if (!resolved) return false;
    const appRuntimeRoots = [
      process.resourcesPath,
      (typeof path.dirname === "function" ? path.dirname(process.execPath) : nodePath.dirname(process.execPath)),
    ]
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean)
      .map((candidate) => (typeof path.resolve === "function" ? path.resolve(candidate) : nodePath.resolve(candidate)));
    return appRuntimeRoots.some((runtimeRoot) => isSameOrChildPath(runtimeRoot, resolved));
  };

  const pathExists = async (targetPath) => {
    const fsp = fs.promises;
    if (!fsp || typeof fsp.access !== "function") {
      if (typeof fs.existsSync === "function") {
        try {
          return Boolean(fs.existsSync(targetPath));
        } catch {
          return false;
        }
      }
      return false;
    }
    try {
      await fsp.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  };

  const getCandidateLibraryPathAssessment = async (candidatePath) => {
    if (isPathSystemRoot(candidatePath)) {
      return {
        ok: false,
        error: "Selected folder is not allowed. Choose a dedicated library folder.",
        reason: "system_root",
      };
    }
    if (isPathInsideAppRuntime(candidatePath)) {
      return {
        ok: false,
        error: "Selected folder is not allowed. Choose a folder outside the application install directory.",
        reason: "app_runtime",
      };
    }

    const writableCheck = await validateWritableDirectorySafe(candidatePath);
    if (!writableCheck.ok) {
      return {
        ok: false,
        error: "Selected folder is not accessible. Choose a different location.",
        reason: "permissions",
      };
    }

    const joinFn = typeof path.join === "function" ? path.join : nodePath.join;
    const vaultFilePath = joinFn(candidatePath, ".vault.json");
    const encryptedIndexPath = joinFn(candidatePath, ".library_index.json.enc");
    const plaintextIndexPath = joinFn(candidatePath, ".library_index.json");

    const [hasVault, hasEncryptedIndex, hasPlaintextIndex] = await Promise.all([
      pathExists(vaultFilePath),
      pathExists(encryptedIndexPath),
      pathExists(plaintextIndexPath),
    ]);
    const hasKnownLibraryMarkers = hasVault || hasEncryptedIndex || hasPlaintextIndex;

    const emptyCheck = await isDirectoryEmptySafe(candidatePath);
    if (!emptyCheck.ok) {
      return {
        ok: false,
        error: "Selected folder is not accessible. Choose a different location.",
        reason: "unreadable",
      };
    }

    return {
      ok: true,
      modeHint: hasVault ? "unlock" : "init",
      isExistingLibrary: hasKnownLibraryMarkers,
      isEmptyOrNonLibrary: !hasKnownLibraryMarkers,
      markerSummary: {
        hasVault,
        hasEncryptedIndex,
        hasPlaintextIndex,
      },
      pathLabel: safePathBaseName(candidatePath),
      isEmptyDirectory: Boolean(emptyCheck.empty),
    };
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
  logLibraryPathTrace("settings:update:received", {
    currentLibraryPath: String(currentSettings.libraryPath || ""),
    requestedLibraryPath: String(requestedLibraryPath || ""),
    pathChanged,
    moveLibraryContent,
  });

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

  let libraryPathResult = { usedFallback: false, warning: "" };
  let libraryScopedMigration = { ok: true, skipped: true, reason: "not_required" };
  if (pathChanged) {
    libraryPathResult = applyConfiguredLibraryRoot(requestedLibraryPath);
    logLibraryPathTrace("settings:update:applyConfiguredLibraryRoot", {
      requestedLibraryPath: String(requestedLibraryPath || ""),
      usedFallback: Boolean(libraryPathResult.usedFallback),
      warning: String(libraryPathResult.warning || ""),
      activeLibraryPath: String(LIBRARY_ROOT() || ""),
    });
    libraryScopedMigration = migrateLibraryScopedStateSafe();
    if (!libraryScopedMigration?.ok) {
      return {
        ok: false,
        error: libraryScopedMigration.error || "Failed to migrate library-scoped settings.",
        migration: libraryScopedMigration,
      };
    }
  }

  const effectiveLibraryPath = pathChanged && libraryPathResult.usedFallback ? "" : requestedLibraryPath;
  logLibraryPathTrace("settings:update:effectiveLibraryPath", {
    effectiveLibraryPath: String(effectiveLibraryPath || ""),
    requestedLibraryPath: String(requestedLibraryPath || ""),
    usedFallback: Boolean(libraryPathResult.usedFallback),
  });
  let next = settingsManager.updateSettings({ ...partial, libraryPath: effectiveLibraryPath });
  const writeError = settingsManager.consumeLastWriteError?.();
  if (writeError) {
    return {
      ok: false,
      error: writeError.message || "Failed to persist settings.",
      errorCode: writeError.code || "SETTINGS_WRITE_FAILED",
    };
  }

  next = settingsManager.reloadSettings();
  logLibraryPathTrace("settings:update:afterReload", {
    persistedLibraryPath: String(next.libraryPath || ""),
    activeLibraryPath: String(LIBRARY_ROOT() || ""),
  });
  if (libraryPathResult.usedFallback && next.libraryPath) {
    logLibraryPathTrace("settings:update:fallbackRevert", {
      persistedLibraryPathBeforeRevert: String(next.libraryPath || ""),
      activeLibraryPath: String(LIBRARY_ROOT() || ""),
    });
    console.warn("[library path] configured path is not accessible. Reverting to default path.");
    next = settingsManager.updateSettings({ libraryPath: "" });
    const fallbackWriteError = settingsManager.consumeLastWriteError?.();
    if (fallbackWriteError) {
      return {
        ok: false,
        error: fallbackWriteError.message || "Failed to persist settings.",
        errorCode: fallbackWriteError.code || "SETTINGS_WRITE_FAILED",
      };
    }
    next = settingsManager.reloadSettings();
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
    libraryScopedMigration,
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
  return chooseLibraryPath(options);
});

ipcMain.handle("library:choosePathForLogin", async (_e, options = {}) => {
  return chooseLibraryPath(options);
});

  ipcMain.handle("library:applyPathForLogin", async (_e, payload = {}) => {
  const normalizedPayload = normalizeLoginLibraryPathPayload(payload);
  if (!normalizedPayload.ok) {
    return { ok: false, error: normalizedPayload.error };
  }

  const selectedPath = await normalizeChosenPath(normalizedPayload.path);
  logLibraryPathTrace("library:applyPathForLogin:normalizedInput", {
    requestedPath: String(normalizedPayload.path || ""),
    normalizedOk: Boolean(selectedPath.ok),
    normalizedPath: String(selectedPath.path || ""),
    normalizedError: String(selectedPath.error || ""),
  });
  if (!selectedPath.ok) {
    return { ok: false, error: "Selected folder is not accessible. Choose a different location." };
  }

  const pathAssessment = await getCandidateLibraryPathAssessment(selectedPath.path);
  if (!pathAssessment.ok) {
    return { ok: false, error: pathAssessment.error };
  }

  const currentSettings = settingsManager.getSettings();
  const currentLibraryPath = String(currentSettings.libraryPath || "").trim();
  if (selectedPath.path === currentLibraryPath) {
    const vaultStatus = vaultManager.vaultStatus();
    return {
      ok: true,
      unchanged: true,
      settings: currentSettings,
      configuredPath: currentLibraryPath,
      activePath: LIBRARY_ROOT(),
      defaultPath: DEFAULT_LIBRARY_ROOT(),
      vaultStatus,
      mode: pathAssessment.modeHint,
      pathAssessment,
    };
  }

  const libraryPathResult = applyConfiguredLibraryRoot(selectedPath.path);
  logLibraryPathTrace("library:applyPathForLogin:applyConfiguredLibraryRoot", {
    selectedPath: String(selectedPath.path || ""),
    usedFallback: Boolean(libraryPathResult.usedFallback),
    warning: String(libraryPathResult.warning || ""),
    activeLibraryPath: String(LIBRARY_ROOT() || ""),
  });
  const libraryScopedMigration = await migrateLibraryScopedStateSafe();
  if (!libraryScopedMigration?.ok) {
    return { ok: false, error: libraryScopedMigration.error || "Failed to migrate library-scoped settings." };
  }

  const effectiveLibraryPath = libraryPathResult.usedFallback ? "" : selectedPath.path;
  logLibraryPathTrace("library:applyPathForLogin:effectiveLibraryPath", {
    effectiveLibraryPath: String(effectiveLibraryPath || ""),
    selectedPath: String(selectedPath.path || ""),
    usedFallback: Boolean(libraryPathResult.usedFallback),
  });
  settingsManager.updateSettings({ libraryPath: effectiveLibraryPath }, {
    suppressVaultLockedWarning: true,
    persistBasicOnlyWhenVaultLocked: true,
    persistBasicOnly: true,
  });
  const loginWriteError = settingsManager.consumeLastWriteError?.();
  if (loginWriteError) {
    return {
      ok: false,
      error: loginWriteError.message || "Failed to persist settings.",
      errorCode: loginWriteError.code || "SETTINGS_WRITE_FAILED",
    };
  }

  let nextSettings = settingsManager.reloadSettings();
  logLibraryPathTrace("library:applyPathForLogin:afterReload", {
    persistedLibraryPath: String(nextSettings.libraryPath || ""),
    activeLibraryPath: String(LIBRARY_ROOT() || ""),
  });

  if (libraryPathResult.usedFallback && nextSettings.libraryPath) {
    logLibraryPathTrace("library:applyPathForLogin:fallbackRevert", {
      persistedLibraryPathBeforeRevert: String(nextSettings.libraryPath || ""),
      activeLibraryPath: String(LIBRARY_ROOT() || ""),
    });
    nextSettings = settingsManager.updateSettings({ libraryPath: "" }, {
      suppressVaultLockedWarning: true,
      persistBasicOnlyWhenVaultLocked: true,
      persistBasicOnly: true,
    });
    const fallbackLoginWriteError = settingsManager.consumeLastWriteError?.();
    if (fallbackLoginWriteError) {
      return {
        ok: false,
        error: fallbackLoginWriteError.message || "Failed to persist settings.",
        errorCode: fallbackLoginWriteError.code || "SETTINGS_WRITE_FAILED",
      };
    }
    nextSettings = settingsManager.reloadSettings();
  }

  const vaultStatus = vaultManager.vaultStatus();
  sendToGallery("settings:updated", nextSettings);
  sendToDownloader("settings:updated", nextSettings);
  sendToBrowser("settings:updated", nextSettings);
  sendToReader("settings:updated", nextSettings);

  return {
    ok: true,
    settings: nextSettings,
    configuredPath: nextSettings.libraryPath || "",
    activePath: LIBRARY_ROOT(),
    defaultPath: DEFAULT_LIBRARY_ROOT(),
    vaultStatus,
    libraryPathWarning: libraryPathResult.warning || "",
    mode: pathAssessment.modeHint,
    pathAssessment,
    libraryScopedMigration,
  };
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
