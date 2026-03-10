const test = require("node:test");
const assert = require("node:assert/strict");

const fromHex = (hex) => Buffer.from(hex, "hex").toString("utf8");

const { registerSettingsLibraryIpcHandlers } = require("../main/ipc/register_settings_library_ipc");

test("library:validateMoveTarget reports free space when statfs is available", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({}) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 1024, fileCount: 1 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
      },
    },
    path: {
      resolve: (value) => String(value || ""),
    },
    shell: {
      trashItem: async () => {},
    },
  });

  const handler = handlers.get("library:validateMoveTarget");
  assert.equal(typeof handler, "function");

  const result = await handler(null, { toPath: "/new-library" });
  assert.equal(result.ok, true);
  assert.equal(result.permissionOk, true);
  assert.equal(result.emptyFolderOk, true);
  assert.equal(result.freeSpaceOk, true);
  assert.equal(result.freeSpaceMessage, "Enough free space.");
});


test("library:currentStats prefers async scanner and passes fs context", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  let syncCalled = false;
  let asyncCalled = false;

  const fsContext = {
    promises: {
      statfs: async () => ({ bavail: 1024, bsize: 1024 }),
      stat: async () => ({}),
    },
  };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({}) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    validateWritableDirectoryAsync: async () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isDirectoryEmptyAsync: async () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    scanLibraryContents: () => {
      syncCalled = true;
      return { ok: false, error: "sync scanner should not be used" };
    },
    scanLibraryContentsAsync: async (_rootPath, options = {}) => {
      asyncCalled = true;
      assert.equal(options.fsModule, fsContext);
      return { ok: true, totalBytes: 44, fileCount: 2 };
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    fs: fsContext,
    path: {
      resolve: (value) => String(value || ""),
    },
    shell: {
      trashItem: async () => {},
    },
  });

  const handler = handlers.get("library:currentStats");
  assert.equal(typeof handler, "function");

  const result = await handler(null, {});
  assert.equal(result.ok, true);
  assert.equal(result.fileCount, 2);
  assert.equal(result.totalBytes, 44);
  assert.equal(asyncCalled, true);
  assert.equal(syncCalled, false);
});


test("settings:validateStartPageUrl accepts supported source root URLs", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({}) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
      },
    },
    path: { resolve: (value) => String(value || "") },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("settings:validateStartPageUrl");
  assert.equal(typeof handler, "function");

  const eHentai = await handler(null, fromHex("68747470733a2f2f652d68656e7461692e6f7267"));
  assert.equal(eHentai.ok, true);
  assert.equal(eHentai.isValid, true);
  assert.equal(eHentai.sourceId, "e-hentai");

  const doujins = await handler(null, fromHex("68747470733a2f2f646f756a696e732e636f6d"));
  assert.equal(doujins.ok, true);
  assert.equal(doujins.isValid, true);
  assert.equal(doujins.sourceId, "doujins");
});

test("library:choosePathForLogin returns canonical absolute path", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({ libraryPath: "/library" }) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["/picked/../picked/library"] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:choosePathForLogin");
  assert.equal(typeof handler, "function");

  const result = await handler(null, { currentPath: "/library" });
  assert.deepEqual(result, { ok: true, canceled: false, path: "/picked/library" });
});

test("library:choosePathForLogin returns explicit cancel result", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({ libraryPath: "/library" }) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:choosePathForLogin");
  const result = await handler(null, { currentPath: "/library" });
  assert.deepEqual(result, { ok: false, canceled: true });
});

test("library:choosePathForLogin rejects malformed payload", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({ libraryPath: "/library" }) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["/picked/library"] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:choosePathForLogin");
  const result = await handler(null, { currentPath: "/library", injectedPath: "/evil" });
  assert.equal(result.ok, false);
  assert.equal(result.canceled, false);
  assert.match(result.error, /Invalid folder chooser payload/);
});

test("library:applyPathForLogin persists, reloads, and returns vault mode", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  let persistedPath = "/library";
  let reloadCalls = 0;
  let applyConfiguredPath = "";
  const updateOptions = [];

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
      updateSettings: (partial, options = {}) => {
        updateOptions.push(options);
        persistedPath = String(partial.libraryPath || "");
        return { libraryPath: persistedPath, darkMode: true };
      },
      reloadSettings: () => {
        reloadCalls += 1;
        return { libraryPath: persistedPath, darkMode: true };
      },
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: (candidate) => {
      applyConfiguredPath = candidate;
      return { usedFallback: false, warning: "" };
    },
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: false, unlocked: true }) },
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "init");
  assert.equal(result.configuredPath, "/picked/library");
  assert.equal(result.activePath, "/active-library");
  assert.equal(applyConfiguredPath, "/picked/library");
  assert.equal(reloadCalls, 1);
  assert.equal(updateOptions.length, 1);
  assert.equal(updateOptions[0].suppressVaultLockedWarning, true);
  assert.equal(updateOptions[0].persistBasicOnlyWhenVaultLocked, true);
  assert.equal(updateOptions[0].persistBasicOnly, true);
});


test("library:applyPathForLogin rejects malformed payload", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({ libraryPath: "/library" }) },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: false }) },
    fs: {
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library", injected: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid login library payload/);
});


test("library:applyPathForLogin rejects system root targets", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: "/library", darkMode: true }),
      updateSettings: () => ({ libraryPath: "/library", darkMode: true }),
      reloadSettings: () => ({ libraryPath: "/library", darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: false, unlocked: true }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/",
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      parse: (value) => ({ root: value === "/" ? "/" : "" }),
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/" });
  assert.equal(result.ok, false);
  assert.match(result.error, /not allowed/i);
});

test("library:applyPathForLogin returns library marker assessment", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  let persistedPath = "/library";
  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
      updateSettings: (partial) => {
        persistedPath = String(partial.libraryPath || "");
        return { libraryPath: persistedPath, darkMode: true };
      },
      reloadSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: false }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: false }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async (targetPath) => {
          if (String(targetPath).endsWith('.vault.json')) return;
          throw new Error('missing');
        },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/\/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.equal(result.pathAssessment.isExistingLibrary, true);
  assert.equal(result.pathAssessment.modeHint, "unlock");
  assert.equal(result.pathAssessment.markerSummary.hasVault, true);
});


test("library:applyPathForLogin keeps existing path when candidate is unreadable", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  let persistedPath = "/library";
  let updateCalls = 0;
  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
      updateSettings: (partial) => {
        updateCalls += 1;
        persistedPath = String(partial.libraryPath || "");
        return { libraryPath: persistedPath, darkMode: true };
      },
      reloadSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: false, error: "EACCES" }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: false }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async () => { throw new Error("missing"); },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/\/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, false);
  assert.match(result.error, /not accessible/i);
  assert.equal(updateCalls, 0);
  assert.equal(persistedPath, "/library");
});



test("library:applyPathForLogin returns init mode for empty candidate even if vault status is stale unlock", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  let persistedPath = "/library";

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
      updateSettings: (partial) => {
        persistedPath = String(partial.libraryPath || "");
        return { libraryPath: persistedPath, darkMode: true };
      },
      reloadSettings: () => ({ libraryPath: persistedPath, darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => persistedPath || "/default-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: false }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async () => { throw new Error("missing"); },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/\/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "init");
  assert.equal(result.pathAssessment.modeHint, "init");
});
test("library:applyPathForLogin returns unchanged=true for identical selected path", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  let updateCalls = 0;
  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: "/picked/library", darkMode: true }),
      updateSettings: () => {
        updateCalls += 1;
        return { libraryPath: "/picked/library", darkMode: true };
      },
      reloadSettings: () => ({ libraryPath: "/picked/library", darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: false }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: false }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async () => { throw new Error("missing"); },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/\/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal(updateCalls, 0);
  assert.equal(result.pathAssessment.modeHint, "init");
});

test("library:applyPathForLogin runs library-scoped migration after applying path", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  let migrationCalls = 0;

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: "/old", darkMode: true }),
      updateSettings: (partial) => ({ libraryPath: String(partial.libraryPath || ""), darkMode: true }),
      reloadSettings: () => ({ libraryPath: "/picked/library", darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false, warning: "" }),
    ensureActiveLibraryScopedEncryptedState: () => {
      migrationCalls += 1;
      return { ok: true, migrated: true };
    },
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: true }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async () => { throw new Error("missing"); },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/\/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.equal(migrationCalls, 1);
  assert.equal(result.libraryScopedMigration.ok, true);
});

test("library:applyPathForLogin persists fallback libraryPath when selected path resolves to default", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  const updateCalls = [];

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: "/old", darkMode: true }),
      updateSettings: (partial, options = {}) => {
        updateCalls.push({ partial, options });
        return { libraryPath: String(partial.libraryPath || ""), darkMode: true };
      },
      reloadSettings: () => ({ libraryPath: "", darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: true, warning: "invalid path" }),
    ensureActiveLibraryScopedEncryptedState: () => ({ ok: true, migrated: false }),
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: true }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async () => { throw new Error("missing"); },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.equal(result.configuredPath, "");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].partial.libraryPath, "");
});

test("library:applyPathForLogin applies library root before persisting settings", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };

  const callOrder = [];

  registerSettingsLibraryIpcHandlers({
    ipcMain,
    settingsManager: {
      getSettings: () => ({ libraryPath: "/old", darkMode: true }),
      updateSettings: (partial) => {
        callOrder.push(`update:${String(partial.libraryPath || "")}`);
        return { libraryPath: String(partial.libraryPath || ""), darkMode: true };
      },
      reloadSettings: () => ({ libraryPath: "/picked/library", darkMode: true }),
    },
    dl: { hasInProgressDownloads: () => false },
    LIBRARY_ROOT: () => "/active-library",
    DEFAULT_LIBRARY_ROOT: () => "/default-library",
    resolveConfiguredLibraryRoot: (toPath) => ({ preferredRoot: toPath }),
    validateWritableDirectory: () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => {
      callOrder.push("applyRoot");
      return { usedFallback: false, warning: "" };
    },
    ensureActiveLibraryScopedEncryptedState: () => {
      callOrder.push("migrate");
      return { ok: true, migrated: true };
    },
    sendToGallery: () => {},
    sendToDownloader: () => {},
    sendToBrowser: () => {},
    sendToReader: () => {},
    scanLibraryContents: () => ({ ok: true, totalBytes: 0, fileCount: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: false, error: "no token" }),
    cleanupHelpers: {},
    vaultManager: { vaultStatus: () => ({ initialized: true, unlocked: true }) },
    fs: {
      constants: { F_OK: 0 },
      promises: {
        statfs: async () => ({ bavail: 1024, bsize: 1024 }),
        stat: async () => ({}),
        realpath: async () => "/picked/library",
        access: async () => { throw new Error("missing"); },
      },
    },
    path: {
      resolve: (value) => String(value || ""),
      isAbsolute: (value) => String(value || "").startsWith("/"),
      join: (...parts) => parts.join('/').replace(/\/+/, '/'),
      basename: (value) => String(value || "").split('/').filter(Boolean).pop() || '',
      parse: () => ({ root: "" }),
      dirname: (value) => String(value || "").split('/').slice(0, -1).join('/') || '/',
    },
    shell: { trashItem: async () => {} },
  });

  const handler = handlers.get("library:applyPathForLogin");
  const result = await handler(null, { path: "/picked/library" });

  assert.equal(result.ok, true);
  assert.deepEqual(callOrder.slice(0, 3), ["applyRoot", "migrate", "update:/picked/library"]);
});
