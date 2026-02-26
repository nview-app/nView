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

test("browser:altDownload rejects sender mismatch", async () => {
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
    ensureReaderWindow: () => ({ isDestroyed: () => false, isMinimized: () => false, restore: () => {}, show: () => {}, focus: () => {}, once: () => {}, webContents: { isLoadingMainFrame: () => false, once: () => {} } }),
    sendToGallery: () => {},
    sendToReader: () => {},
    getBrowserView: () => ({ webContents: { isDestroyed: () => false, id: 9 } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({ ok: true, imageUrls: ["https://img/a.jpg"], meta: {}, context: {} }),
    dl: { addDirectDownload: async () => ({ ok: true, jobId: "job-1" }) },
    sendToDownloader: () => {},
    app: { getVersion: () => "1.2.3" },
  };

  registerUiIpcHandlers(context);
  const handler = handlers.get("browser:altDownload");

  const res = await handler({ sender: { id: 22 } }, {});
  assert.deepEqual(res, { ok: false, error: "Unauthorized alt download request." });
});

test("browser:altDownload uses sanitized payload and allowlisted headers", async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  const calls = [];
  const toasts = [];
  const context = {
    ipcMain,
    settingsManager: { getSettings: () => ({ startPage: "https://example.test" }) },
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => calls.push("ensureDownloaderWindow"),
    emitDownloadCount: () => {},
    ensureImporterWindow: () => {},
    ensureExporterWindow: () => {},
    ensureReaderWindow: () => ({ isDestroyed: () => false, isMinimized: () => false, restore: () => {}, show: () => {}, focus: () => {}, once: () => {}, webContents: { isLoadingMainFrame: () => false, once: () => {} } }),
    sendToGallery: () => {},
    sendToReader: () => {},
    getBrowserView: () => ({ webContents: { isDestroyed: () => false, id: 9 } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({
      ok: true,
      imageUrls: ["https://img/a.jpg"],
      meta: { galleryId: "1" },
      context: {
        referer: "https://source.test/g/1",
        origin: "https://source.test",
        userAgent: "ua-test",
      },
    }),
    dl: {
      addDirectDownload: async (payload) => {
        calls.push(payload);
        return { ok: true, jobId: "job-1" };
      },
    },
    sendToDownloader: (channel, payload) => toasts.push({ channel, payload }),
    app: { getVersion: () => "1.2.3" },
  };

  registerUiIpcHandlers(context);
  const handler = handlers.get("browser:altDownload");

  const res = await handler({ sender: { id: 9 } }, {});
  assert.deepEqual(res, { ok: true, jobId: "job-1" });
  assert.deepEqual(calls[1], {
    imageUrls: ["https://img/a.jpg"],
    meta: { galleryId: "1" },
    requestHeaders: {
      referer: "https://source.test/g/1",
      origin: "https://source.test",
      "user-agent": "ua-test",
    },
  });
  assert.deepEqual(toasts, [{ channel: "dl:toast", payload: { message: "Alternate download queued." } }]);
});
