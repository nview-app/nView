const test = require("node:test");
const assert = require("node:assert/strict");

const { registerUiIpcHandlers } = require("../main/ipc/register_ui_ipc");

function buildContext() {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };

  const context = {
    ipcMain,
    settingsManager: { getSettings: () => ({ startPage: "https://example.test" }) },
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => {},
    emitDownloadCount: () => {},
    ensureImporterWindow: () => {},
    ensureExporterWindow: () => {},
    ensureReaderWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => {},
      focus: () => {},
      once: () => {},
      webContents: { isLoadingMainFrame: () => false, once: () => {} },
    }),
    getReaderWin: () => ({ isDestroyed: () => false }),
    sendToGallery: () => {},
    sendToReader: () => {},
    getBrowserView: () => ({ webContents: { isDestroyed: () => false, id: 9 } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({ ok: false, error: "unused" }),
    dl: { addDirectDownload: async () => ({ ok: true }) },
    sendToDownloader: () => {},
    app: { getVersion: () => "1.2.3" },
  };

  registerUiIpcHandlers(context);
  return { handlers };
}

test("ui:logPerfEvent is a no-op when startup perf logging is disabled", async () => {
  const { handlers } = buildContext();
  const logPerfHandler = handlers.get("ui:logPerfEvent");
  assert.equal(typeof logPerfHandler, "function");

  const logLines = [];
  const originalConsoleLog = console.log;
  console.log = (...args) => logLines.push(args.join(" "));
  try {
    const res = await logPerfHandler({}, {
      name: "vault-unlock-library-load",
      durationMs: 123.456,
      meta: { mangaCount: 42 },
    });
    assert.deepEqual(res, { ok: true });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(logLines.length, 0);
});

test("ui:logPerfEvent ignores invalid payloads when startup perf logging is disabled", async () => {
  const { handlers } = buildContext();
  const logPerfHandler = handlers.get("ui:logPerfEvent");

  const res = await logPerfHandler({}, { name: "bad", durationMs: -1 });
  assert.deepEqual(res, { ok: true });
});


test("ui:getVersion returns the app version", async () => {
  const { handlers } = buildContext();
  const getVersionHandler = handlers.get("ui:getVersion");

  const res = await getVersionHandler({}, null);
  assert.deepEqual(res, { ok: true, version: "1.2.3" });
});


test("ui:openComicViewer routes to dedicated reader window", async () => {
  const calls = [];
  const handlers = new Map();
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  const context = {
    ipcMain,
    settingsManager: { getSettings: () => ({ startPage: "https://example.test" }) },
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => {},
    emitDownloadCount: () => {},
    ensureImporterWindow: () => {},
    ensureExporterWindow: () => {},
    ensureReaderWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => calls.push("show"),
      focus: () => calls.push("focus"),
      once: () => {},
      webContents: { isLoadingMainFrame: () => false, once: () => {} },
    }),
    sendToGallery: () => {},
    sendToReader: (channel, payload) => calls.push({ channel, payload }),
    getBrowserView: () => ({ webContents: { isDestroyed: () => false, id: 9 } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({ ok: false, error: "unused" }),
    dl: { addDirectDownload: async () => ({ ok: true }) },
    sendToDownloader: () => {},
    app: { getVersion: () => "1.2.3" },
  };

  registerUiIpcHandlers(context);
  const openViewerHandler = handlers.get("ui:openComicViewer");
  const res = await openViewerHandler({}, "/library/comic-a");

  assert.deepEqual(res, { ok: true });
  assert.deepEqual(calls, [
    "show",
    "focus",
    { channel: "reader:openComic", payload: { comicDir: "/library/comic-a" } },
  ]);
});
