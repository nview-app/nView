const test = require("node:test");
const assert = require("node:assert/strict");

const { registerLibraryContentIpcHandlers } = require("../main/ipc/register_library_content_ipc");

function buildContext(overrides = {}) {
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
    buildComicEntry: async (comicDir) => ({ dir: comicDir, title: "Title", contentDir: comicDir }),
    fs: {
      existsSync: () => false,
      readFileSync: () => Buffer.from("{}", "utf8"),
      promises: {
        writeFile: async () => {},
        readFile: async () => Buffer.from("{}", "utf8"),
        rename: async () => {},
        stat: async () => ({ mtimeMs: 0, size: 0 }),
        unlink: async () => {},
      },
    },
    path: {
      join: (...parts) => parts.join("/"),
      basename: (value, ext = "") => {
        const base = String(value || "").split("/").pop() || "";
        return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
      },
      extname: (value) => {
        const base = String(value || "").split("/").pop() || "";
        const idx = base.lastIndexOf(".");
        return idx > 0 ? base.slice(idx) : "";
      },
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
    ...overrides,
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

test("library:listComicPages includes sanitized marks from index", async () => {
  const indexPayload = { pageMarks: { "001.jpg": "❤", "002.jpg": "bad" } };
  const { handlers } = buildContext({
    fs: {
      existsSync: () => true,
      readFileSync: () => Buffer.from(JSON.stringify(indexPayload), "utf8"),
      promises: {
        writeFile: async () => {},
        readFile: async () => Buffer.from(JSON.stringify(indexPayload), "utf8"),
        rename: async () => {},
        stat: async () => ({ mtimeMs: 0, size: 0 }),
        unlink: async () => {},
      },
    },
    listEncryptedImagesRecursiveSorted: async () => ["/library/comic_a/001.jpg.enc", "/library/comic_a/002.jpg.enc"],
  });
  const result = await handlers.get("library:listComicPages")({}, "/library/comic_a");
  assert.equal(result.ok, true);
  assert.equal(result.pages[0].mark, "❤");
  assert.equal(result.pages[1].mark, "");
});

test("library:updateComicPages persists only valid marks", async () => {
  const writes = [];
  const { handlers } = buildContext({
    listEncryptedImagesRecursiveSorted: async () => ["/library/comic_a/001.jpg.enc", "/library/comic_a/002.jpg.enc"],
    fs: {
      existsSync: () => false,
      readFileSync: () => Buffer.from("{}", "utf8"),
      promises: {
        writeFile: async (_path, buffer) => writes.push(buffer.toString("utf8")),
        readFile: async () => Buffer.from("{}", "utf8"),
        rename: async () => {},
        stat: async () => ({ mtimeMs: 0, size: 0 }),
        unlink: async () => {},
      },
    },
  });

  const result = await handlers.get("library:updateComicPages")({}, "/library/comic_a", {
    pageOrder: ["001.jpg", "002.jpg"],
    pageMarks: { "001.jpg": "❤", "002.jpg": "invalid", "../escape.jpg": "✂" },
  });

  assert.equal(result.ok, true);
  const persisted = writes.join("\n");
  assert.match(persisted, /"pageMarks"/);
  assert.match(persisted, /"001.jpg"\s*:\s*"❤"/);
  assert.doesNotMatch(persisted, /invalid/);
  assert.doesNotMatch(persisted, /escape\.jpg/);
});
