const test = require("node:test");
const assert = require("node:assert/strict");

const { registerLibraryContentIpcHandlers } = require("../main/ipc/register_library_content_ipc");

function buildContext() {
  const handlers = new Map();
  const galleryEvents = [];
  const readerEvents = [];
  const ipcMain = {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };

  const context = {
    ipcMain,
    ensureDirs: () => {},
    normalizeGalleryIdInput: (value) => String(value || "").trim(),
    loadLibraryIndexCache: () => ({ entries: {} }),
    normalizeGalleryId: (value) => String(value || "").trim(),
    readLibraryIndexEntry: () => null,
    buildComicEntry: async (comicDir) => ({ dir: comicDir, title: "Title" }),
    fs: {
      existsSync: () => false,
      readFileSync: () => Buffer.from("{}", "utf8"),
      promises: {
        writeFile: async () => {},
        readFile: async () => Buffer.from("{}", "utf8"),
        rename: async () => {},
        stat: async () => ({ mtimeMs: 0, size: 0 }),
      },
    },
    path: {
      join: (...parts) => parts.join("/"),
      basename: (value) => String(value || "").split("/").pop() || "",
      extname: () => "",
      dirname: () => "/tmp",
    },
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      vaultStatus: () => ({ enabled: true, unlocked: true }),
      decryptFileToBuffer: async () => Buffer.from("{}", "utf8"),
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptBufferWithKey: ({ buffer }) => buffer,
    },
    listEncryptedImagesRecursiveSorted: async () => [],
    nativeImage: {
      createFromBuffer: () => ({
        isEmpty: () => true,
      }),
    },
    ensureThumbCacheDir: async () => {},
    resolveThumbCacheKeyPayload: async () => ({ ok: false, error: "unused" }),
    app: { getPath: () => "/tmp" },
    THUMB_CACHE_MAX_BYTES: 1024,
    getVaultRelPath: () => "",
    movePlainDirectImagesToVault: async () => ({ ok: true }),
    isUnderLibraryRoot: () => true,
    normalizeTagsInput: () => [],
    writeLibraryIndexEntry: () => {},
    cleanupHelpers: {
      purgeFolderBestEffort: async () => ({ ok: true, trashed: false, trashPath: null }),
    },
    deleteLibraryIndexEntry: () => {},
    sendToGallery: (channel, payload) => galleryEvents.push({ channel, payload }),
    sendToReader: (channel, payload) => readerEvents.push({ channel, payload }),
    LIBRARY_ROOT: () => "/library",
    listFilesRecursive: async () => [],
  };

  registerLibraryContentIpcHandlers(context);
  return { handlers, galleryEvents, readerEvents };
}

test("library:toggleFavorite emits library:changed to gallery and reader", async () => {
  const { handlers, galleryEvents, readerEvents } = buildContext();
  const handler = handlers.get("library:toggleFavorite");

  const result = await handler({}, "/library/comic_a", true);
  assert.equal(result.ok, true);
  assert.equal(galleryEvents.length, 1);
  assert.equal(readerEvents.length, 1);
  assert.equal(galleryEvents[0].channel, "library:changed");
  assert.equal(readerEvents[0].channel, "library:changed");
  assert.equal(galleryEvents[0].payload.action, "update");
  assert.equal(readerEvents[0].payload.action, "update");
  assert.equal(galleryEvents[0].payload.comicDir, "/library/comic_a");
  assert.equal(readerEvents[0].payload.comicDir, "/library/comic_a");
});

test("library:deleteComic emits delete event to gallery and reader", async () => {
  const { handlers, galleryEvents, readerEvents } = buildContext();
  const handler = handlers.get("library:deleteComic");

  const result = await handler({}, "/library/comic_b");
  assert.equal(result.ok, true);
  assert.equal(galleryEvents.length, 1);
  assert.equal(readerEvents.length, 1);
  assert.equal(galleryEvents[0].payload.action, "delete");
  assert.equal(readerEvents[0].payload.action, "delete");
  assert.equal(galleryEvents[0].payload.comicDir, "/library/comic_b");
  assert.equal(readerEvents[0].payload.comicDir, "/library/comic_b");
});


test("library:listComicPages includes optional index dimensions", async () => {
  const { handlers } = buildContext();
  const handler = handlers.get("library:listComicPages");
  const result = await handler({}, "/library/comic_a");
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.pages), true);
});
