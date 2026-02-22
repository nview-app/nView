const test = require("node:test");
const assert = require("node:assert/strict");

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
