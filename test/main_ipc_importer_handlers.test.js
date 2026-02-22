const test = require("node:test");
const assert = require("node:assert/strict");

const { registerImporterIpcHandlers } = require("../main/ipc/register_importer_ipc");

test("importer:getMetadataSuggestions logs warning and returns empty suggestions when readdir fails", async () => {
  const handlers = new Map();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  try {
    registerImporterIpcHandlers({
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      getImporterWin: () => null,
      getGalleryWin: () => null,
      getBrowserWin: () => null,
      getDownloaderWin: () => null,
      scanImportRoot: async () => ({}),
      scanSingleManga: async () => ({}),
      normalizeImportItemsPayload: () => ({ items: [] }),
      importLibraryCandidates: async () => ({ imported: 0 }),
      sendToGallery: () => {},
      ensureDirs: () => {},
      vaultManager: {
        vaultStatus: () => ({ enabled: true, unlocked: true }),
      },
      fs: {
        promises: {
          readdir: async () => {
            throw Object.assign(new Error("read blocked"), { code: "EACCES" });
          },
        },
      },
      LIBRARY_ROOT: () => "/library",
      path: { join: (...parts) => parts.join("/") },
      buildComicEntry: async () => ({}),
      getVaultRelPath: () => "",
      movePlainDirectImagesToVault: async () => {},
      normalizeGalleryId: () => "",
      writeLibraryIndexEntry: () => {},
    });

    const handler = handlers.get("importer:getMetadataSuggestions");
    assert.equal(typeof handler, "function");

    const result = await handler();
    assert.deepEqual(result, { ok: true, artists: [], languages: [], tags: [] });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /importer:getMetadataSuggestions readdir/);
    assert.match(warnings[0], /EACCES/);
  } finally {
    console.warn = originalWarn;
  }
});


test("importer:run emits targeted update events for imported entries", async () => {
  const handlers = new Map();
  const sent = [];

  registerImporterIpcHandlers({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getImporterWin: () => null,
    getGalleryWin: () => null,
    getBrowserWin: () => null,
    getDownloaderWin: () => null,
    scanImportRoot: async () => ({}),
    scanSingleManga: async () => ({}),
    normalizeImportItemsPayload: () => ({ items: [{ key: "a" }] }),
    importLibraryCandidates: async () => ({
      imported: 1,
      skipped: 0,
      failed: 0,
      results: [{ status: "imported", finalDir: "/library/comic_1" }],
    }),
    sendToGallery: (channel, payload) => sent.push({ channel, payload }),
    ensureDirs: () => {},
    vaultManager: {
      vaultStatus: () => ({ enabled: true, unlocked: true }),
    },
    fs: { promises: { readdir: async () => [] } },
    LIBRARY_ROOT: () => "/library",
    path: { join: (...parts) => parts.join("/") },
    buildComicEntry: async (comicDir) => ({ dir: comicDir, title: "Imported" }),
    getVaultRelPath: () => "",
    movePlainDirectImagesToVault: async () => {},
    normalizeGalleryId: () => "",
    writeLibraryIndexEntry: () => {},
  });

  const handler = handlers.get("importer:run");
  assert.equal(typeof handler, "function");

  const result = await handler({ sender: { isDestroyed: () => true, send: () => {} } }, {});

  assert.equal(result.ok, true);
  const evt = sent.find((item) => item.channel === "library:changed");
  assert.equal(Boolean(evt), true);
  assert.equal(evt.payload.action, "update");
  assert.equal(evt.payload.comicDir, "/library/comic_1");
  assert.deepEqual(evt.payload.entry, { dir: "/library/comic_1", title: "Imported" });
});
