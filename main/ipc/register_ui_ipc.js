const { ENABLE_STARTUP_PERF_LOGGING } = require("../../shared/dev_mode");

function registerUiIpcHandlers(context) {
  const {
    ipcMain,
    settingsManager,
    ensureBrowserWindow,
    ensureDownloaderWindow,
    emitDownloadCount,
    ensureImporterWindow,
    ensureExporterWindow,
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

  function broadcastOpenComics() {
    sendToGallery("reader:openComics", { comicDirs: Array.from(openComicDirs) });
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

    const deliverOpenEvent = () => {
      sendToReader("reader:openComic", { comicDir: targetDir });
    };
    if (!readerWindow.__nviewOpenComicsCloseSyncBound) {
      readerWindow.__nviewOpenComicsCloseSyncBound = true;
      readerWindow.once("closed", () => {
        openComicDirs.clear();
        broadcastOpenComics();
      });
    }

    openComicDirs.add(targetDir);
    broadcastOpenComics();

    if (readerWindow.webContents.isLoadingMainFrame()) {
      readerWindow.webContents.once("did-finish-load", deliverOpenEvent);
    } else {
      deliverOpenEvent();
    }

    return { ok: true };
  }

  ipcMain.handle("ui:openBrowser", async (_e, url) => {
    const settings = settingsManager.getSettings();
    const resolved = String(url || "").trim() || settings.startPage;
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

  ipcMain.handle("ui:openReader", async (_e, comicDir) => openReaderWindowForComic(comicDir));

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
