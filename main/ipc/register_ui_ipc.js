const { ENABLE_STARTUP_PERF_LOGGING } = require("../../shared/dev_mode");
const { runOpsCheck } = require("../../scripts/secure-memory-ops-check");
const {
  validateAndNormalizeReaderOpenGroupBatchRequest,
  sanitizeReaderOpenGroupBatchResult,
} = require("./reader_open_group_batch_contract");

const READER_GROUP_BATCH_TIMEOUT_MS = 30_000;

function registerUiIpcHandlers(context) {
  const {
    ipcMain,
    settingsManager,
    ensureBrowserWindow,
    ensureDownloaderWindow,
    emitDownloadCount,
    ensureImporterWindow,
    ensureExporterWindow,
    ensureGroupManagerWindow,
    ensureReaderWindow,
    sendToGallery,
    sendToReader,
    getBrowserView,
    getBrowserWin,
    sanitizeAltDownloadPayload,
    dl,
    sendToDownloader,
    app,
  } = context;

  const openComicDirs = new Set();
  const pendingReaderGroupBatchRequests = new Map();
  const pendingReaderOpenDirs = [];
  const pendingReaderOpenDirSet = new Set();
  let pendingReaderFocusDir = "";
  let readerOpenFlushScheduled = false;

  function broadcastOpenComics() {
    sendToGallery("reader:openComics", { comicDirs: Array.from(openComicDirs) });
  }

  function emitReaderGroupBatchTelemetry(eventName, details = {}) {
    const safe = {
      event: eventName,
      source: String(details.source || "group").slice(0, 32),
      mode: String(details.mode || "").slice(0, 32),
      focusPolicy: String(details.focusPolicy || "").slice(0, 32),
      requestedCount: Number.isFinite(details.requestedCount) ? Number(details.requestedCount) : 0,
      errorCode: details.errorCode ? String(details.errorCode).slice(0, 64) : undefined,
      reason: details.reason ? String(details.reason).slice(0, 64) : undefined,
    };
    console.info("[ipc][reader-open-group-batch]", safe);
  }

  function resolvePendingReaderGroupBatch(key, payload) {
    const pending = pendingReaderGroupBatchRequests.get(key);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    pendingReaderGroupBatchRequests.delete(key);
    for (const resolve of pending.resolvers) resolve(payload);
    return true;
  }

  function makeGroupBatchRequestKey(payload) {
    return `${payload.source}:${payload.requestId}`;
  }

  function dispatchReaderOpenGroupBatch(readerWindow, requestPayload) {
    if (readerWindow.webContents.isLoadingMainFrame()) {
      if (!readerWindow.__nviewReaderGroupBatchBound) {
        readerWindow.__nviewReaderGroupBatchBound = true;
        readerWindow.webContents.once("did-finish-load", () => {
          readerWindow.__nviewReaderGroupBatchBound = false;
          sendToReader("reader:openGroupBatch", requestPayload);
        });
      }
      return;
    }
    sendToReader("reader:openGroupBatch", requestPayload);
  }

  function flushPendingReaderOpens() {
    readerOpenFlushScheduled = false;
    if (!pendingReaderOpenDirs.length) return;
    const comicDirs = pendingReaderOpenDirs.splice(0, pendingReaderOpenDirs.length);
    pendingReaderOpenDirSet.clear();
    const focusComicDir = pendingReaderFocusDir;
    pendingReaderFocusDir = "";
    sendToReader("reader:openComicsBatch", { comicDirs, focusComicDir });
  }

  function scheduleFlushPendingReaderOpens() {
    if (readerOpenFlushScheduled) return;
    readerOpenFlushScheduled = true;
    queueMicrotask(flushPendingReaderOpens);
  }

  function queueReaderOpenDirs(readerWindow, comicDirs, focusComicDir = "") {
    const normalizedDirs = Array.isArray(comicDirs)
      ? comicDirs.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const normalizedFocusDir = String(focusComicDir || "").trim();
    if (normalizedFocusDir) {
      pendingReaderFocusDir = normalizedFocusDir;
    } else if (normalizedDirs.length) {
      pendingReaderFocusDir = normalizedDirs[normalizedDirs.length - 1];
    }
    for (const comicDir of normalizedDirs) {
      if (!pendingReaderOpenDirSet.has(comicDir)) {
        pendingReaderOpenDirSet.add(comicDir);
        pendingReaderOpenDirs.push(comicDir);
      }
    }
    if (!pendingReaderOpenDirs.length) return;

    if (readerWindow.webContents.isLoadingMainFrame()) {
      if (!readerWindow.__nviewReaderOpenBatchBound) {
        readerWindow.__nviewReaderOpenBatchBound = true;
        readerWindow.webContents.once("did-finish-load", () => {
          readerWindow.__nviewReaderOpenBatchBound = false;
          flushPendingReaderOpens();
        });
      }
      return;
    }

    scheduleFlushPendingReaderOpens();
  }

  function openReaderWindowForComic(comicDir) {
    const targetDir = String(comicDir || "").trim();
    if (!targetDir) return { ok: false, error: "Comic path is required." };

    const readerWindow = ensureReaderWindow();
    if (!readerWindow || readerWindow.isDestroyed()) {
      return { ok: false, error: "Reader window is unavailable." };
    }
    if (readerWindow.isMinimized()) readerWindow.restore();
    readerWindow.show();
    readerWindow.focus();

    if (!readerWindow.__nviewOpenComicsCloseSyncBound) {
      readerWindow.__nviewOpenComicsCloseSyncBound = true;
      readerWindow.once("closed", () => {
        for (const [key, pending] of pendingReaderGroupBatchRequests.entries()) {
          clearTimeout(pending.timeout);
          const source = String(key.split(":")[0] || "group");
          const requestId = String(key.split(":").slice(1).join(":") || "");
          for (const resolve of pending.resolvers) {
            resolve({ ok: false, errorCode: "READER_UNAVAILABLE", message: "Reader window closed.", requestId, source });
          }
        }
        pendingReaderGroupBatchRequests.clear();
        pendingReaderOpenDirs.splice(0, pendingReaderOpenDirs.length);
        pendingReaderOpenDirSet.clear();
        pendingReaderFocusDir = "";
        readerOpenFlushScheduled = false;
        openComicDirs.clear();
        broadcastOpenComics();
      });
    }

    openComicDirs.add(targetDir);
    broadcastOpenComics();

    queueReaderOpenDirs(readerWindow, [targetDir], targetDir);

    return { ok: true };
  }
  function openReaderWindowForComics(comicDirs) {
    const normalizedDirs = Array.from(new Set(
      (Array.isArray(comicDirs) ? comicDirs : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ));
    if (!normalizedDirs.length) return { ok: false, error: "At least one comic path is required." };

    const readerWindow = ensureReaderWindow();
    if (!readerWindow || readerWindow.isDestroyed()) {
      return { ok: false, error: "Reader window is unavailable." };
    }
    if (readerWindow.isMinimized()) readerWindow.restore();
    readerWindow.show();
    readerWindow.focus();

    if (!readerWindow.__nviewOpenComicsCloseSyncBound) {
      readerWindow.__nviewOpenComicsCloseSyncBound = true;
      readerWindow.once("closed", () => {
        for (const [key, pending] of pendingReaderGroupBatchRequests.entries()) {
          clearTimeout(pending.timeout);
          const source = String(key.split(":")[0] || "group");
          const requestId = String(key.split(":").slice(1).join(":") || "");
          for (const resolve of pending.resolvers) {
            resolve({ ok: false, errorCode: "READER_UNAVAILABLE", message: "Reader window closed.", requestId, source });
          }
        }
        pendingReaderGroupBatchRequests.clear();
        pendingReaderOpenDirs.splice(0, pendingReaderOpenDirs.length);
        pendingReaderOpenDirSet.clear();
        pendingReaderFocusDir = "";
        readerOpenFlushScheduled = false;
        openComicDirs.clear();
        broadcastOpenComics();
      });
    }

    const newlyAddedDirs = [];
    for (const targetDir of normalizedDirs) {
      if (!openComicDirs.has(targetDir)) {
        newlyAddedDirs.push(targetDir);
      }
      openComicDirs.add(targetDir);
    }
    broadcastOpenComics();

    const focusComicDir = newlyAddedDirs.length
      ? newlyAddedDirs[newlyAddedDirs.length - 1]
      : normalizedDirs[normalizedDirs.length - 1];
    queueReaderOpenDirs(readerWindow, normalizedDirs, focusComicDir);

    return { ok: true, opened: normalizedDirs.length };
  }


  ipcMain.handle("ui:openBrowser", async (_e, url) => {
    const settings = settingsManager.getSettings();
    const defaultStartPage = Array.isArray(settings.startPages) ? settings.startPages[0] : settings.startPage;
    const resolved = String(url || "").trim() || String(defaultStartPage || "").trim();
    ensureBrowserWindow(resolved);
    return { ok: true };
  });

  ipcMain.handle("ui:openDownloader", async () => {
    ensureDownloaderWindow();
    emitDownloadCount();
    return { ok: true };
  });

  ipcMain.handle("ui:getVersion", async () => {
    const version = app?.getVersion?.();
    if (!version) {
      return { ok: false, error: "Unable to resolve app version." };
    }
    return { ok: true, version };
  });

  ipcMain.handle("ui:getSecureMemoryStatus", async () => {
    try {
      const status = runOpsCheck({ silent: true });
      const secureMemoryOperational = Boolean(
        status?.policy?.enabled &&
        status?.assessment?.nativePathHealthy &&
        status?.assessment?.fallbackObserved !== true,
      );
      return {
        ok: true,
        policy: {
          enabled: Boolean(status?.policy?.enabled),
          strict: Boolean(status?.policy?.strict),
        },
        nativeSupported: Boolean(status?.nativeSupported),
        secureMemoryOperational,
        summary: String(status?.assessment?.summary || "Secure-memory status unavailable"),
      };
    } catch (error) {
      return {
        ok: false,
        nativeSupported: false,
        secureMemoryOperational: false,
        summary: "Secure-memory status unavailable",
        error: error && error.message ? error.message : "secure-memory status check failed",
      };
    }
  });

  ipcMain.handle("ui:logPerfEvent", async (_event, payload) => {
    if (!ENABLE_STARTUP_PERF_LOGGING) {
      return { ok: true };
    }
    const name = String(payload?.name || "renderer-event").trim().slice(0, 120) || "renderer-event";
    const durationMs = Number(payload?.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return { ok: false, error: "durationMs must be a non-negative number." };
    }
    const extra = payload?.meta && typeof payload.meta === "object" ? payload.meta : null;
    const suffix = extra ? ` | meta=${JSON.stringify(extra).slice(0, 500)}` : "";
    console.log(`[perf] ${name}: ${durationMs.toFixed(2)}ms${suffix}`);
    return { ok: true };
  });

  ipcMain.handle("ui:openImporter", async () => {
    ensureImporterWindow();
    return { ok: true };
  });

  ipcMain.handle("ui:openExporter", async () => {
    ensureExporterWindow();
    return { ok: true };
  });

  ipcMain.handle("ui:openGroupManager", async () => {
    ensureGroupManagerWindow();
    return { ok: true };
  });

  ipcMain.handle("ui:openReader", async (_e, comicDir) => openReaderWindowForComic(comicDir));

  ipcMain.handle("ui:openReaderBatch", async (_e, comicDirs) => openReaderWindowForComics(comicDirs));

  ipcMain.handle("ui:readerOpenGroupBatch", async (_event, payload) => {
    const validated = validateAndNormalizeReaderOpenGroupBatchRequest(payload);
    if (!validated.ok) {
      emitReaderGroupBatchTelemetry("rejected", { reason: "validation", errorCode: validated.errorCode });
      return validated;
    }

    const requestPayload = validated.payload;
    const readerWindow = ensureReaderWindow();
    if (!readerWindow || readerWindow.isDestroyed()) {
      emitReaderGroupBatchTelemetry("rejected", { ...requestPayload, reason: "reader-unavailable", errorCode: "READER_UNAVAILABLE" });
      return {
        ok: false,
        errorCode: "READER_UNAVAILABLE",
        message: "Reader window is unavailable.",
        requestId: requestPayload.requestId,
        source: requestPayload.source,
      };
    }
    if (readerWindow.isMinimized()) readerWindow.restore();
    readerWindow.show();
    readerWindow.focus();

    const key = makeGroupBatchRequestKey(requestPayload);
    const existing = pendingReaderGroupBatchRequests.get(key);
    if (existing) {
      emitReaderGroupBatchTelemetry("accepted", { ...requestPayload, reason: "attached-inflight", requestedCount: requestPayload.comicDirs.length });
      return new Promise((resolve) => {
        existing.resolvers.push(resolve);
      });
    }

    emitReaderGroupBatchTelemetry("accepted", { ...requestPayload, requestedCount: requestPayload.comicDirs.length });
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolvePendingReaderGroupBatch(key, {
          ok: false,
          errorCode: "READER_UNAVAILABLE",
          message: "Reader request timed out.",
          requestId: requestPayload.requestId,
          source: requestPayload.source,
        });
      }, READER_GROUP_BATCH_TIMEOUT_MS);
      pendingReaderGroupBatchRequests.set(key, {
        resolvers: [resolve],
        timeout,
      });
      dispatchReaderOpenGroupBatch(readerWindow, requestPayload);
    });
  });

  ipcMain.handle("ui:readerOpenGroupBatch:result", async (_event, payload) => {
    const safeResult = sanitizeReaderOpenGroupBatchResult(payload);
    const requestId = String(safeResult?.requestId || "").trim();
    const source = String(safeResult?.source || "group").trim() || "group";
    const key = `${source}:${requestId}`;

    if (!requestId || !pendingReaderGroupBatchRequests.has(key)) {
      emitReaderGroupBatchTelemetry("rejected", { source, reason: "unknown-request", errorCode: "VALIDATION_ERROR" });
      return { ok: false, errorCode: "VALIDATION_ERROR", message: "Unknown or expired request id." };
    }

    emitReaderGroupBatchTelemetry(safeResult.ok ? "completed" : "failed", {
      source,
      mode: safeResult.mode,
      focusPolicy: safeResult.focusPolicy,
      requestedCount: safeResult.requestedCount,
      errorCode: safeResult.errorCode,
    });
    resolvePendingReaderGroupBatch(key, safeResult);
    return { ok: true };
  });

  ipcMain.handle("ui:openComicViewer", async (_e, comicDir) => {
    return openReaderWindowForComic(comicDir);
  });

  ipcMain.handle("ui:syncOpenComics", async (_e, comicDirs) => {
    const nextDirs = Array.isArray(comicDirs) ? comicDirs : [];
    openComicDirs.clear();
    for (const comicDir of nextDirs) {
      const normalized = String(comicDir || "").trim();
      if (normalized) openComicDirs.add(normalized);
    }
    broadcastOpenComics();
    return { ok: true, count: openComicDirs.size };
  });

  ipcMain.handle("browser:altDownload", async (_event, payload) => {
    if (!getBrowserView() || !getBrowserWin() || getBrowserWin().isDestroyed() || getBrowserView().webContents.isDestroyed()) {
      return { ok: false, error: "Browser is not open." };
    }
    const sender = _event?.sender;
    if (!sender || sender.id !== getBrowserView().webContents.id) {
      return { ok: false, error: "Unauthorized alt download request." };
    }

    const validated = sanitizeAltDownloadPayload(payload);
    if (!validated.ok) return validated;

    ensureDownloaderWindow();
    const requestHeaders = {};
    if (validated.context.referer) requestHeaders.referer = validated.context.referer;
    if (validated.context.origin) requestHeaders.origin = validated.context.origin;
    if (validated.context.userAgent) requestHeaders["user-agent"] = validated.context.userAgent;
    const res = await dl.addDirectDownload({
      imageUrls: validated.imageUrls,
      meta: validated.meta,
      requestHeaders,
    });
    if (!res?.ok) return res;
    sendToDownloader("dl:toast", { message: "Alternate download queued." });
    return res;
  });
}

module.exports = { registerUiIpcHandlers };
