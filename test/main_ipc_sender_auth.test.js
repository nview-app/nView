const test = require("node:test");
const assert = require("node:assert/strict");

const fromHex = (hex) => Buffer.from(hex, "hex").toString("utf8");

const { registerMainIpcHandlers, MAIN_IPC_REQUIRED_CONTEXT_KEYS } = require("../main/ipc/register_main_ipc");

function buildContext(handlerMap, roleById) {
  const base = {
    ipcMain: {
      handle(channel, handler) {
        handlerMap.set(channel, handler);
      },
    },
    getWebContentsRole: (id) => roleById.get(id) || "unknown",
    settingsManager: { getSettings: () => ({ startPage: "" }), updateSettings: () => ({}), reloadSettings: () => ({}) },
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => {},
    emitDownloadCount: () => {},
    ensureImporterWindow: () => {},
    ensureExporterWindow: () => {},
    ensureGalleryWindow: () => {},
    getGalleryWin: () => null,
    sendToGallery: () => {},
    getBrowserView: () => ({ webContents: { id: 200, isDestroyed: () => false, getURL: () => fromHex("68747470733a2f2f6e68656e7461692e6e65742f672f31323334352f"), send: () => {} } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({ ok: true, imageUrls: ["https://example.com/a.jpg"], meta: {}, context: {} }),
    dl: {
      listJobs: () => [],
      cancelJob: async () => ({ ok: true }),
      removeJob: async () => ({ ok: true }),
      stopJob: async () => ({ ok: true }),
      startJobFromStop: async () => ({ ok: true }),
      clearCompletedJobs: async () => ({ ok: true }),
      addDirectDownload: async () => ({ ok: true, jobId: "job-1" }),
      hasInProgressDownloads: () => false,
      hasActiveDownloads: () => false,
    },
    sendToDownloader: () => {},
    LIBRARY_ROOT: () => "/library",
    DEFAULT_LIBRARY_ROOT: () => "/library",
    resolveConfiguredLibraryRoot: () => ({ preferredRoot: "/library", usedFallback: false }),
    validateWritableDirectory: () => ({ ok: true }),
    validateWritableDirectoryAsync: async () => ({ ok: true }),
    isDirectoryEmpty: () => ({ ok: true, empty: true }),
    isDirectoryEmptyAsync: async () => ({ ok: true, empty: true }),
    isSameOrChildPath: () => false,
    migrateLibraryContentsBatched: async () => ({ ok: true, copiedFiles: 0 }),
    issueLibraryCleanupToken: () => "token",
    applyConfiguredLibraryRoot: () => ({ usedFallback: false }),
    sendToBrowser: () => {},
    scanLibraryContents: () => ({ ok: true, fileCount: 0, totalBytes: 0 }),
    scanLibraryContentsAsync: async () => ({ ok: true, fileCount: 0, totalBytes: 0 }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getDownloaderWin: () => null,
    isProtectedCleanupPath: () => false,
    consumeLibraryCleanupToken: () => ({ ok: true }),
    cleanupHelpers: { removePathSafely: async () => ({ ok: true }), removeFileSafely: async () => ({ ok: true }) },
    getVaultPolicy: () => ({}),
    validateVaultPassphrase: () => ({ ok: true, passphrase: "pw" }),
    vaultManager: { vaultStatus: () => ({ enabled: true, unlocked: true }), isInitialized: () => false, vaultInit: () => ({ ok: true }), vaultLock: () => ({ ok: true }) },
    encryptLibraryForVault: async () => ({ ok: true }),
    shell: { openPath: async () => "", showItemInFolder: () => {} },
    loadBookmarksFromDisk: () => ({ ok: true, bookmarks: [] }),
    addBookmarkForPage: () => ({ ok: true }),
    removeBookmarkById: () => ({ ok: true }),
    getInProgressDownloadCount: () => 0,
    ensureDirs: () => {},
    isUnderLibraryRoot: () => true,
    normalizeOpenPathResult: () => ({ ok: true }),
    fs: { promises: { readdir: async () => [], stat: async () => ({ isDirectory: () => true }), statfs: async () => ({ bavail: 1, bsize: 1 }) } },
    path: { join: (...parts) => parts.join("/"), resolve: (value) => value, basename: () => "", extname: () => "", dirname: () => "" },
    buildComicEntry: async () => ({ mtimeMs: 0 }),
    scanImportRoot: async () => ({}),
    scanSingleManga: async () => ({}),
    normalizeImportItemsPayload: () => ({ ok: true, items: [] }),
    importLibraryCandidates: async () => ({ ok: true, imported: [] }),
    getVaultRelPath: () => "",
    movePlainDirectImagesToVault: async () => ({ ok: true }),
    normalizeGalleryId: (value) => String(value || ""),
    normalizeTagsInput: () => [],
    writeLibraryIndexEntry: async () => {},
    getExporterWin: () => null,
    getImporterWin: () => null,
    buildSelectedEntries: async () => ({ ok: true, entries: [], missingIds: [] }),
    listLibraryEntriesForExport: async () => [],
    estimateExportBytes: async () => ({ bytes: 0 }),
    mapExportResult: () => ({}),
    exportSingleManga: async () => ({ ok: true }),
    loadLibraryIndexCache: () => ({ entries: {} }),
    readLibraryIndexEntry: async () => null,
    listEncryptedImagesRecursiveSorted: async () => [],
    deleteLibraryIndexEntry: async () => {},
    nativeImage: { createFromDataURL: () => ({ isEmpty: () => true }) },
    ensureThumbCacheDir: () => "/tmp",
    resolveThumbCacheKeyPayload: () => ({ ok: false }),
    normalizeGalleryIdInput: () => "",
    app: { getPath: () => "/tmp" },
    THUMB_CACHE_MAX_BYTES: 1,
    getBrowserSidePanelWidth: () => 0,
    setBrowserSidePanelWidth: () => {},
    listFilesRecursive: async () => [],
    groupsStore: {
      listGroups: () => ({ ok: true, groups: [] }),
      getGroup: () => ({ ok: true, group: null }),
      createGroup: () => ({ ok: true, group: { groupId: "grp_1" } }),
      updateGroupMeta: () => ({ ok: true, group: { groupId: "grp_1" } }),
      updateGroupMembership: () => ({ ok: true, group: { groupId: "grp_1" } }),
      deleteGroup: () => ({ ok: true }),
      resolveForReader: () => ({ ok: true, resolvedMangaIds: [] }),
    },
  };

  for (const key of MAIN_IPC_REQUIRED_CONTEXT_KEYS) {
    if (!(key in base)) {
      base[key] = () => {};
    }
  }
  return base;
}

test("critical IPC channel rejects unauthorized sender role", async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  const handlers = new Map();
  const roleById = new Map([[101, "browser-ui"]]);
  try {
    registerMainIpcHandlers(buildContext(handlers, roleById));

    const handler = handlers.get("vault:enable");
    const result = await handler({ sender: { id: 101 } }, "pw");
    assert.deepEqual(result, { ok: false, error: "Unauthorized IPC caller" });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Unauthorized IPC caller/);
    assert.match(warnings[0], /channel=vault:enable/);
  } finally {
    console.warn = previousWarn;
  }
});

test("browser:altDownload only allows browser-view sender role", async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  const handlers = new Map();
  const roleById = new Map([
    [201, "browser-ui"],
    [200, "browser-view"],
  ]);
  try {
    registerMainIpcHandlers(buildContext(handlers, roleById));

    const handler = handlers.get("browser:altDownload");
    const unauthorized = await handler({ sender: { id: 201 } }, {});
    assert.deepEqual(unauthorized, { ok: false, error: "Unauthorized IPC caller" });

    const authorized = await handler({ sender: { id: 200 } }, {});
    assert.equal(authorized.ok, true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Unauthorized IPC caller/);
    assert.match(warnings[0], /channel=browser:altDownload/);
  } finally {
    console.warn = previousWarn;
  }
});


test("browser:directDownload:trigger only allows browser-ui sender role", async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  const handlers = new Map();
  const roleById = new Map([[200, "browser-view"], [201, "browser-ui"]]);
  try {
    registerMainIpcHandlers(buildContext(handlers, roleById));

    const handler = handlers.get("browser:directDownload:trigger");
    const unauthorized = await handler({ sender: { id: 200 } }, {});
    assert.deepEqual(unauthorized, { ok: false, error: "Unauthorized IPC caller" });

    const authorized = await handler({ sender: { id: 201 } }, {});
    assert.notDeepEqual(authorized, { ok: false, error: "Unauthorized IPC caller" });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /channel=browser:directDownload:trigger/);
  } finally {
    console.warn = previousWarn;
  }
});

test("ui:getSecureMemoryStatus only allows gallery sender role", async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  const handlers = new Map();
  const roleById = new Map([[200, "downloader"], [201, "gallery"]]);
  try {
    registerMainIpcHandlers(buildContext(handlers, roleById));

    const handler = handlers.get("ui:getSecureMemoryStatus");
    const unauthorized = await handler({ sender: { id: 200 } });
    assert.deepEqual(unauthorized, { ok: false, error: "Unauthorized IPC caller" });

    const authorized = await handler({ sender: { id: 201 } });
    assert.equal(typeof authorized.ok, "boolean");
    assert.notDeepEqual(authorized, { ok: false, error: "Unauthorized IPC caller" });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /channel=ui:getSecureMemoryStatus/);
  } finally {
    console.warn = previousWarn;
  }
});

test("groups:create only allows gallery sender role", async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  const handlers = new Map();
  const roleById = new Map([[200, "downloader"], [201, "gallery"]]);
  try {
    registerMainIpcHandlers(buildContext(handlers, roleById));

    const handler = handlers.get("groups:create");
    const unauthorized = await handler({ sender: { id: 200 } }, { name: "A", description: "B" });
    assert.deepEqual(unauthorized, { ok: false, error: "Unauthorized IPC caller" });

    const authorized = await handler({ sender: { id: 201 } }, { name: "A", description: "B" });
    assert.notDeepEqual(authorized, { ok: false, error: "Unauthorized IPC caller" });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /channel=groups:create/);
  } finally {
    console.warn = previousWarn;
  }
});
