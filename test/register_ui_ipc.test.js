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
    ensureGroupManagerWindow: () => {},
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
    ensureGroupManagerWindow: () => {},
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
    { channel: "reader:openComicsBatch", payload: { comicDirs: ["/library/comic-a"], focusComicDir: "/library/comic-a" } },
  ]);
});



test("ui:openComicViewer coalesces same-tick opens into one batched reader event", async () => {
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
    ensureGroupManagerWindow: () => {},
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
  await Promise.all([
    openViewerHandler({}, "/library/comic-a"),
    openViewerHandler({}, "/library/comic-b"),
  ]);

  const readerEvents = calls.filter((item) => typeof item === "object");
  assert.equal(readerEvents.length, 1);
  assert.deepEqual(readerEvents[0], {
    channel: "reader:openComicsBatch",
    payload: { comicDirs: ["/library/comic-a", "/library/comic-b"], focusComicDir: "/library/comic-b" },
  });
});

test("ui:openComicViewer coalescing keeps latest focus even when dirs were already queued", async () => {
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
    ensureGroupManagerWindow: () => {},
    ensureReaderWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => {},
      focus: () => {},
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
  const openBatchHandler = handlers.get("ui:openReaderBatch");
  await Promise.all([
    openBatchHandler({}, ["/library/comic-a", "/library/comic-b"]),
    openBatchHandler({}, ["/library/comic-a"]),
  ]);

  const readerEvents = calls.filter((item) => item.channel === "reader:openComicsBatch");
  assert.equal(readerEvents.length, 1);
  assert.deepEqual(readerEvents[0].payload, {
    comicDirs: ["/library/comic-a", "/library/comic-b"],
    focusComicDir: "/library/comic-a",
  });
});

test("ui:openReaderBatch opens reader and dispatches each comic", async () => {
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
    ensureGroupManagerWindow: () => {},
    ensureReaderWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => calls.push("show"),
      focus: () => calls.push("focus"),
      once: () => {},
      webContents: { isLoadingMainFrame: () => false, once: () => {} },
    }),
    sendToGallery: (channel, payload) => calls.push({ channel, payload }),
    sendToReader: (channel, payload) => calls.push({ channel, payload }),
    getBrowserView: () => ({ webContents: { isDestroyed: () => false, id: 9 } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({ ok: false, error: "unused" }),
    dl: { addDirectDownload: async () => ({ ok: true }) },
    sendToDownloader: () => {},
    app: { getVersion: () => "1.2.3" },
  };

  registerUiIpcHandlers(context);
  const handler = handlers.get("ui:openReaderBatch");
  const res = await handler({}, ["/library/comic-a", " /library/comic-b ", "", "/library/comic-a"]);

  assert.deepEqual(res, { ok: true, opened: 2 });
  assert.equal(calls[0], "show");
  assert.equal(calls[1], "focus");
  assert.deepEqual(calls[2], { channel: "reader:openComics", payload: { comicDirs: ["/library/comic-a", "/library/comic-b"] } });
  assert.deepEqual(calls[3], { channel: "reader:openComicsBatch", payload: { comicDirs: ["/library/comic-a", "/library/comic-b"], focusComicDir: "/library/comic-b" } });
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
    ensureGroupManagerWindow: () => {},
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
    ensureGroupManagerWindow: () => {},
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


test("ui:getSecureMemoryStatus returns capability summary", async () => {
  const { handlers } = buildContext();
  const getStatusHandler = handlers.get("ui:getSecureMemoryStatus");

  const res = await getStatusHandler({}, null);
  assert.equal(typeof res.ok, "boolean");
  assert.equal(typeof res.nativeSupported, "boolean");
  assert.equal(typeof res.secureMemoryOperational, "boolean");
  assert.equal(typeof res.summary, "string");
  if (res.ok) {
    assert.equal(typeof res.policy?.enabled, "boolean");
    assert.equal(typeof res.policy?.strict, "boolean");
  }
});


test("ui:openGroupManager opens singleton window", async () => {
  const { handlers } = buildContext();
  let opened = 0;
  const handler = handlers.get("ui:openGroupManager");
  assert.equal(typeof handler, "function");

  const handlers2 = new Map();
  const ipcMain2 = { handle(channel, fn) { handlers2.set(channel, fn); } };
  registerUiIpcHandlers({
    ipcMain: ipcMain2,
    settingsManager: { getSettings: () => ({ startPage: "https://example.test" }) },
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => {},
    emitDownloadCount: () => {},
    ensureImporterWindow: () => {},
    ensureExporterWindow: () => {},
    ensureGroupManagerWindow: () => { opened += 1; },
    ensureReaderWindow: () => ({ isDestroyed: () => false, isMinimized: () => false, restore: () => {}, show: () => {}, focus: () => {}, once: () => {}, webContents: { isLoadingMainFrame: () => false, once: () => {} } }),
    sendToGallery: () => {},
    sendToReader: () => {},
    getBrowserView: () => ({ webContents: { isDestroyed: () => false, id: 9 } }),
    getBrowserWin: () => ({ isDestroyed: () => false }),
    sanitizeAltDownloadPayload: () => ({ ok: false, error: "unused" }),
    dl: { addDirectDownload: async () => ({ ok: true }) },
    sendToDownloader: () => {},
    app: { getVersion: () => "1.2.3" },
  });

  const openHandler = handlers2.get("ui:openGroupManager");
  const res = await openHandler({}, null);
  assert.deepEqual(res, { ok: true });
  assert.equal(opened, 1);
});

test("ui:readerOpenGroupBatch rejects malformed payloads", async () => {
  const { handlers } = buildContext();
  const handler = handlers.get("ui:readerOpenGroupBatch");

  const res = await handler({}, {
    requestId: "req-1",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/library/comic-a"],
    mode: "merge",
    focusPolicy: "preserve-active",
    unexpected: true,
  });

  assert.equal(res.ok, false);
  assert.equal(res.errorCode, "VALIDATION_ERROR");
});

test("ui:readerOpenGroupBatch forwards request to reader and resolves from reader result", async () => {
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
    ensureGroupManagerWindow: () => {},
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
  const openHandler = handlers.get("ui:readerOpenGroupBatch");
  const resultHandler = handlers.get("ui:readerOpenGroupBatch:result");

  const requestPayload = {
    requestId: "req-abc",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/library/comic-a", " /library/comic-a ", "/library/comic-b"],
    mode: "merge",
    focusPolicy: "preserve-active",
  };

  const pending = openHandler({}, requestPayload);

  assert.deepEqual(calls[2], {
    channel: "reader:openGroupBatch",
    payload: {
      requestId: "req-abc",
      source: "group",
      groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
      comicDirs: ["/library/comic-a", "/library/comic-b"],
      mode: "merge",
      focusPolicy: "preserve-active",
    },
  });

  const ack = await resultHandler({}, {
    ok: true,
    requestId: "req-abc",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    mode: "merge",
    focusPolicy: "preserve-active",
    openedCount: 1,
    reusedCount: 1,
    unavailableCount: 0,
    requestedCount: 2,
    truncated: false,
    activatedSessionId: "session-1",
    activatedComicDir: "/library/comic-b",
    dedupedByRequestId: false,
  });

  assert.deepEqual(ack, { ok: true });
  const res = await pending;
  assert.equal(res.ok, true);
  assert.equal(res.requestedCount, 2);
  assert.equal(res.activatedComicDir, "/library/comic-b");
});

test("ui:readerOpenGroupBatch attaches duplicate in-flight request ids", async () => {
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
    ensureGroupManagerWindow: () => {},
    ensureReaderWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => {},
      focus: () => {},
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
  const openHandler = handlers.get("ui:readerOpenGroupBatch");
  const resultHandler = handlers.get("ui:readerOpenGroupBatch:result");
  const payload = {
    requestId: "req-dedupe",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/library/comic-a"],
    mode: "merge",
    focusPolicy: "preserve-active",
  };

  const pendingA = openHandler({}, payload);
  const pendingB = openHandler({}, payload);

  const readerEvents = calls.filter((item) => item.channel === "reader:openGroupBatch");
  assert.equal(readerEvents.length, 1);

  await resultHandler({}, {
    ok: false,
    requestId: "req-dedupe",
    source: "group",
    errorCode: "READER_UNAVAILABLE",
    message: "reader busy",
  });

  const [resA, resB] = await Promise.all([pendingA, pendingB]);
  assert.deepEqual(resA, resB);
  assert.equal(resA.errorCode, "READER_UNAVAILABLE");
});


test("ui:readerOpenGroupBatch keeps distinct request ids isolated", async () => {
  const calls = [];
  const handlers = new Map();
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  registerUiIpcHandlers({
    ipcMain,
    settingsManager: { getSettings: () => ({ startPage: "https://example.test" }) },
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => {},
    emitDownloadCount: () => {},
    ensureImporterWindow: () => {},
    ensureExporterWindow: () => {},
    ensureGroupManagerWindow: () => {},
    ensureReaderWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => {},
      focus: () => {},
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
  });

  const openHandler = handlers.get("ui:readerOpenGroupBatch");
  const resultHandler = handlers.get("ui:readerOpenGroupBatch:result");

  const pendingA = openHandler({}, {
    requestId: "req-1",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/library/comic-a"],
    mode: "merge",
    focusPolicy: "preserve-active",
  });
  const pendingB = openHandler({}, {
    requestId: "req-2",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/library/comic-b"],
    mode: "merge",
    focusPolicy: "preserve-active",
  });

  const readerEvents = calls.filter((item) => item.channel === "reader:openGroupBatch");
  assert.equal(readerEvents.length, 2);

  await resultHandler({}, {
    ok: true,
    requestId: "req-2",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    mode: "merge",
    focusPolicy: "preserve-active",
    openedCount: 1,
    reusedCount: 0,
    unavailableCount: 0,
    requestedCount: 1,
    truncated: false,
    activatedSessionId: "session:/library/comic-b",
    activatedComicDir: "/library/comic-b",
    dedupedByRequestId: false,
  });

  await resultHandler({}, {
    ok: true,
    requestId: "req-1",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    mode: "merge",
    focusPolicy: "preserve-active",
    openedCount: 1,
    reusedCount: 0,
    unavailableCount: 0,
    requestedCount: 1,
    truncated: false,
    activatedSessionId: "session:/library/comic-a",
    activatedComicDir: "/library/comic-a",
    dedupedByRequestId: false,
  });

  const [resA, resB] = await Promise.all([pendingA, pendingB]);
  assert.equal(resA.requestId, "req-1");
  assert.equal(resB.requestId, "req-2");
  assert.equal(resA.activatedComicDir, "/library/comic-a");
  assert.equal(resB.activatedComicDir, "/library/comic-b");
});
