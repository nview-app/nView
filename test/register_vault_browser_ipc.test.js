const test = require("node:test");
const assert = require("node:assert/strict");

const fromHex = (hex) => Buffer.from(hex, "hex").toString("utf8");

const { registerVaultBrowserIpcHandlers } = require("../main/ipc/register_vault_browser_ipc");

function buildContext(overrides = {}) {
  const handlers = new Map();
  const sentMessages = [];
  const dlCalls = [];
  const toasts = [];
  const browserView = {
    webContents: {
      id: 77,
      isDestroyed: () => false,
      getURL: () => fromHex("68747470733a2f2f6e68656e7461692e6e65742f672f31323334352f"),
      send: (channel, payload) => sentMessages.push({ channel, payload }),
      loadURL: async () => {},
      reload: () => {},
      getTitle: () => "Title",
    },
    setBounds: () => {},
  };
  const context = {
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    vaultManager: { vaultStatus: () => ({}), isInitialized: () => false, vaultInit: () => ({ ok: true }), vaultUnlock: () => ({ ok: true }), vaultLock: () => ({ ok: true }) },
    getVaultPolicy: () => ({}),
    validateVaultPassphrase: () => ({ ok: true, passphrase: "pw" }),
    encryptLibraryForVault: async () => ({ ok: true }),
    sendToGallery: () => {},
    sendToDownloader: (channel, payload) => toasts.push({ channel, payload }),
    sendToBrowser: () => {},
    ensureBrowserWindow: () => {},
    ensureDownloaderWindow: () => {},
    getBrowserView: () => browserView,
    getBrowserWin: () => ({ isDestroyed: () => false, getContentBounds: () => ({ width: 1200, height: 800 }), close: () => {} }),
    shell: {},
    loadBookmarksFromDisk: () => ({ ok: true, bookmarks: [] }),
    addBookmarkForPage: () => ({ ok: true }),
    removeBookmarkById: () => ({ ok: true }),
    getBrowserSidePanelWidth: () => 0,
    setBrowserSidePanelWidth: () => {},
    dl: {
      hasActiveDownloads: () => false,
      addDirectDownload: async (payload) => {
        dlCalls.push(payload);
        return { ok: true, jobId: "job-1" };
      },
    },
    settingsManager: { reloadSettings: () => ({}) },
    applyConfiguredLibraryRoot: () => {},
    sanitizeAltDownloadPayload: (payload) => ({
      ok: true,
      imageUrls: payload.imageUrls,
      meta: payload.meta,
      context: {
        referer: payload.referer,
        origin: payload.origin,
        userAgent: payload.userAgent,
      },
    }),
    fs: { promises: { unlink: async () => {} } },
    ...overrides,
  };

  registerVaultBrowserIpcHandlers(context);
  return { handlers, sentMessages, browserView, dlCalls, toasts };
}

test("browser:directDownload:state reports supported gallery URL", async () => {
  const { handlers } = buildContext();
  const handler = handlers.get("browser:directDownload:state");
  const result = await handler({ sender: { id: 10 } });
  assert.deepEqual(result, { ok: true, supported: true, sourceId: "nhentai", alreadyDownloaded: false });
});

test("browser:directDownload:state marks alreadyDownloaded when current URL matches library sourceUrl", async () => {
  const { handlers } = buildContext({
    loadLibraryIndexCache: () => ({
      entries: {
        existing: { sourceUrl: "https://nhentai.net/g/12345/?from=index#reader" },
      },
    }),
  });
  const handler = handlers.get("browser:directDownload:state");
  const result = await handler({ sender: { id: 10 } });
  assert.deepEqual(result, { ok: true, supported: true, sourceId: "nhentai", alreadyDownloaded: true });
});

test("browser:directDownload:state marks alreadyDownloaded when cache stores only sourceIdentity canonicalUrl", async () => {
  const { handlers } = buildContext({
    loadLibraryIndexCache: () => ({
      entries: {
        existing: {
          sourceIdentity: {
            canonicalUrl: "https://nhentai.net/g/12345/#reader",
          },
        },
      },
    }),
  });
  const handler = handlers.get("browser:directDownload:state");
  const result = await handler({ sender: { id: 10 } });
  assert.deepEqual(result, { ok: true, supported: true, sourceId: "nhentai", alreadyDownloaded: true });
});

test("browser:directDownload:state reports unsupported source with fallback reason", async () => {
  const { handlers } = buildContext({
    getBrowserView: () => ({
      webContents: {
        id: 77,
        isDestroyed: () => false,
        getURL: () => "https://example.com/g/12345/",
        send: () => {},
        loadURL: async () => {},
        reload: () => {},
        getTitle: () => "Title",
      },
      setBounds: () => {},
    }),
  });
  const handler = handlers.get("browser:directDownload:state");
  const result = await handler({ sender: { id: 10 } });
  assert.equal(result.ok, true);
  assert.equal(result.supported, false);
  assert.equal(result.reasonCode, "unsupported-source");
});

test("browser:directDownload:state reports unsupported URL for known source", async () => {
  const { handlers } = buildContext({
    getBrowserView: () => ({
      webContents: {
        id: 77,
        isDestroyed: () => false,
        getURL: () => fromHex("68747470733a2f2f6e68656e7461692e6e65742f72616e646f6d2d70616765"),
        send: () => {},
        loadURL: async () => {},
        reload: () => {},
        getTitle: () => "Title",
      },
      setBounds: () => {},
    }),
  });
  const handler = handlers.get("browser:directDownload:state");
  const result = await handler({ sender: { id: 10 } });
  assert.equal(result.ok, true);
  assert.equal(result.supported, false);
  assert.equal(result.reasonCode, "unsupported-url");
  assert.equal(result.sourceId, "nhentai");
});

test("browser:directDownload:trigger requests scrape and queues sanitized direct download", async () => {
  const { handlers, sentMessages, dlCalls, toasts } = buildContext();
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].channel, "browser:direct-download:scrape-request");

  const requestId = sentMessages[0].payload.requestId;
  const scrapeAck = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: { galleryId: "12345" },
        imageUrls: ["https://i.example/1.jpg"],
        referer: fromHex("68747470733a2f2f6e68656e7461692e6e65742f672f31323334352f"),
        origin: fromHex("68747470733a2f2f6e68656e7461692e6e6574"),
        userAgent: "ua",
      },
    },
  );
  assert.deepEqual(scrapeAck, { ok: true });

  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1" });
  assert.deepEqual(dlCalls, [{
    imageUrls: ["https://i.example/1.jpg"],
    meta: { galleryId: "12345" },
    requestHeaders: {
      referer: fromHex("68747470733a2f2f6e68656e7461692e6e65742f672f31323334352f"),
      origin: fromHex("68747470733a2f2f6e68656e7461692e6e6574"),
      "user-agent": "ua",
    },
  }]);
  assert.deepEqual(toasts, [{ channel: "dl:toast", payload: { message: "Alternate download queued." } }]);
});


test("browser:directDownload:trigger passes resolved sourceId to payload sanitizer", async () => {
  const sanitizeCalls = [];
  const { handlers, sentMessages } = buildContext({
    sanitizeAltDownloadPayload: (payload, options) => {
      sanitizeCalls.push({ payload, options });
      return {
        ok: true,
        imageUrls: payload.imageUrls,
        meta: payload.meta,
        context: { referer: '', origin: '', userAgent: '' },
      };
    },
  });

  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: { galleryId: "12345" },
        imageUrls: ["https://i.example/1.jpg"],
      },
    },
  );
  assert.deepEqual(ack, { ok: true });
  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1" });
  assert.equal(sanitizeCalls.length, 1);
  assert.equal(sanitizeCalls[0].options.resolvedSourceId, "nhentai");
});

test("browser:directDownload:scrapeResult rejects unauthorized sender", async () => {
  const { handlers, sentMessages } = buildContext();
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 11 } },
    { requestId, ok: true, payload: { imageUrls: ["https://i.example/1.jpg"] } },
  );
  assert.deepEqual(ack, { ok: false, error: "Unauthorized scrape result sender." });

  const successAck = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: { galleryId: "12345" },
        imageUrls: ["https://i.example/1.jpg"],
        referer: fromHex("68747470733a2f2f6e68656e7461692e6e65742f672f31323334352f"),
        origin: fromHex("68747470733a2f2f6e68656e7461692e6e6574"),
        userAgent: "ua",
      },
    },
  );
  assert.deepEqual(successAck, { ok: true });
  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1" });
});

test("browser:directDownload:trigger redacts sensitive URL query fragments from scraper errors", async () => {
  const { handlers, sentMessages } = buildContext();
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 77 } },
    { requestId, ok: false, error: "Fetch failed for https://a.example/path?token=secret#fragment" },
  );
  assert.deepEqual(ack, { ok: true });

  const result = await triggerPromise;
  assert.equal(result.ok, false);
  assert.equal(result.error.includes('token=secret'), false);
  assert.equal(result.error.includes('#fragment'), false);
  assert.equal(result.error.includes('https://a.example/path'), true);
});

test("browser:directDownload:trigger does not mark alreadyDownloaded when only gallery id matches", async () => {
  const { handlers, sentMessages } = buildContext({
    loadLibraryIndexCache: () => ({
      entries: {
        existing: { galleryId: "12345" },
      },
    }),
  });
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: {
          galleryId: "12345",
          sourceUrl: "https://nhentai.net/g/54321/?p=1",
        },
        imageUrls: ["https://i.example/1.jpg"],
      },
    },
  );
  assert.deepEqual(ack, { ok: true });

  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1" });
});

test("browser:directDownload:trigger marks result as alreadyDownloaded when source URL matches library index", async () => {
  const { handlers, sentMessages } = buildContext({
    loadLibraryIndexCache: () => ({
      entries: {
        existing: { sourceUrl: "https://nhentai.net/g/12345/" },
      },
    }),
  });
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: {
          galleryId: null,
          sourceUrl: "https://nhentai.net/g/12345/?p=99",
        },
        imageUrls: ["https://i.example/1.jpg"],
      },
    },
  );
  assert.deepEqual(ack, { ok: true });

  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1", alreadyDownloaded: true });
});


test("browser:directDownload:trigger source URL matching ignores query, hash, and trailing slash differences", async () => {
  const { handlers, sentMessages } = buildContext({
    loadLibraryIndexCache: () => ({
      entries: {
        existing: { sourceUrl: "https://nhentai.net/g/99999/" },
      },
    }),
  });
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: {
          sourceUrl: "https://nhentai.net/g/99999?page=4#viewer",
        },
        imageUrls: ["https://i.example/1.jpg"],
      },
    },
  );
  assert.deepEqual(ack, { ok: true });

  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1", alreadyDownloaded: true });
});

test("browser:directDownload:trigger marks alreadyDownloaded when cache stores canonicalUrl only in sourceIdentity", async () => {
  const { handlers, sentMessages } = buildContext({
    loadLibraryIndexCache: () => ({
      entries: {
        existing: {
          sourceIdentity: {
            canonicalUrl: "https://nhentai.net/g/88888?legacy=1#reader",
          },
        },
      },
    }),
  });
  const triggerHandler = handlers.get("browser:directDownload:trigger");
  const scrapeResultHandler = handlers.get("browser:directDownload:scrapeResult");

  const triggerPromise = triggerHandler({ sender: { id: 10 } });
  const requestId = sentMessages[0].payload.requestId;

  const ack = await scrapeResultHandler(
    { sender: { id: 77 } },
    {
      requestId,
      ok: true,
      payload: {
        meta: {
          sourceUrl: "https://nhentai.net/g/88888/?page=7",
        },
        imageUrls: ["https://i.example/1.jpg"],
      },
    },
  );
  assert.deepEqual(ack, { ok: true });

  const result = await triggerPromise;
  assert.deepEqual(result, { ok: true, jobId: "job-1", alreadyDownloaded: true });
});
