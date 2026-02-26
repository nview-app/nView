const { resolveSourceAdapter } = require("../../preload/source_adapters/registry");
const { matchesUrlRules } = require("../../renderer/browser/url_rule_matcher");
const { canGoBack, canGoForward } = require("../navigation_history_compat");
const { ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING } = require("../../shared/dev_mode");

const DIRECT_DOWNLOAD_SCRAPE_TIMEOUT_MS = 10000;
const MAX_REDACTED_ERROR_LEN = 160;

function redactSensitiveUrls(value) {
  return String(value || "").replace(/https?:\/\/[^\s"'`<>]+/gi, (urlValue) => {
    try {
      const parsed = new URL(urlValue);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return "[redacted-url]";
    }
  });
}

function redactErrorMessage(value, fallback) {
  const normalized = redactSensitiveUrls(String(value || "")).replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_REDACTED_ERROR_LEN);
}

function logDirectDownload(stage, details) {
  if (!ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING) return;
  const prefix = `[direct-download][main] ${stage}`;
  if (details === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, details);
}

function registerVaultBrowserIpcHandlers(context) {
  const {
    ipcMain, vaultManager, getVaultPolicy, validateVaultPassphrase, encryptLibraryForVault, sendToGallery, sendToDownloader, sendToBrowser, ensureBrowserWindow, getBrowserView, getBrowserWin, shell, loadBookmarksFromDisk, addBookmarkForPage, removeBookmarkById, getBrowserSidePanelWidth, setBrowserSidePanelWidth, dl, settingsManager, applyConfiguredLibraryRoot, fs, ensureDownloaderWindow, sanitizeAltDownloadPayload, loadLibraryIndexCache
  } = context;

const pendingScrapeRequests = new Map();
let nextScrapeRequestId = 1;

const browserViewDebugState = {
  lastEventAt: 0,
  lastStage: "none",
  lastRequestId: "",
};

function summarizeBrowserViewState() {
  const view = getBrowserView();
  const win = getBrowserWin();
  const contents = view?.webContents;
  return {
    hasBrowserView: Boolean(view),
    hasBrowserWindow: Boolean(win),
    browserWindowDestroyed: Boolean(win?.isDestroyed?.()),
    hasWebContents: Boolean(contents),
    webContentsDestroyed: Boolean(contents?.isDestroyed?.()),
    webContentsId: contents?.id || null,
    webContentsUrl: contents ? redactSensitiveUrls(String(contents.getURL() || "")) : null,
    webContentsLoading: contents && typeof contents.isLoadingMainFrame === "function" ? Boolean(contents.isLoadingMainFrame()) : null,
    browserViewLastEventAt: browserViewDebugState.lastEventAt || null,
    browserViewLastStage: browserViewDebugState.lastStage,
    browserViewLastRequestId: browserViewDebugState.lastRequestId || null,
  };
}


function normalizeComparableUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    parsed.search = "";
    const trimmedPath = parsed.pathname.replace(/\/+$/, "");
    const normalizedPath = trimmedPath || "/";
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return "";
  }
}


function isAlreadyDownloadedMeta(meta) {
  if (!meta || typeof loadLibraryIndexCache !== "function") return false;
  const normalizedSourceUrl = normalizeComparableUrl(meta.sourceUrl);
  if (!normalizedSourceUrl) return false;
  const cache = loadLibraryIndexCache();
  const entries = cache && typeof cache === "object" ? cache.entries : null;
  if (!entries || typeof entries !== "object") return false;
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry !== "object") continue;
    const entrySourceUrl = normalizeComparableUrl(entry.sourceIdentity?.canonicalUrl || entry.sourceUrl);
    if (entrySourceUrl && entrySourceUrl === normalizedSourceUrl) return true;
  }
  return false;
}

function completeScrapeRequest(requestId, result) {
  const pending = pendingScrapeRequests.get(requestId);
  if (!pending) return false;
  pendingScrapeRequests.delete(requestId);
  clearTimeout(pending.timeout);
  pending.resolve(result);
  return true;
}

ipcMain.handle("vault:status", async () => ({ ok: true, status: vaultManager.vaultStatus() }));
ipcMain.handle("vault:getPolicy", async () => ({ ok: true, policy: getVaultPolicy() }));
ipcMain.handle("vault:enable", async (_e, passphrase) => {
  if (vaultManager.isInitialized()) {
    return { ok: false, error: "Vault already initialized." };
  }
  if (dl.hasActiveDownloads()) {
    return { ok: false, error: "All downloads must be completed before enabling Vault Mode." };
  }
  const validation = validateVaultPassphrase(passphrase);
  if (!validation.ok) return validation;
  const initRes = vaultManager.vaultInit(validation.passphrase);
  if (!initRes?.ok) return initRes;
  try {
    const summary = await encryptLibraryForVault();
    const settings = settingsManager.reloadSettings();
    applyConfiguredLibraryRoot(settings.libraryPath);
    sendToGallery("settings:updated", settings);
    sendToDownloader("settings:updated", settings);
    sendToBrowser("settings:updated", settings);
    return { ok: true, summary };
  } catch (err) {
    vaultManager.vaultLock();
    try {
      const vaultPath = vaultManager.vaultFilePath();
      await fs.promises.unlink(vaultPath).catch((unlinkErr) => {
        if (unlinkErr?.code !== "ENOENT") throw unlinkErr;
      });
    } catch (cleanupErr) {
      console.warn("[vault] failed to rollback vault init:", String(cleanupErr));
    }
    return { ok: false, error: String(err) };
  }
});
ipcMain.handle("vault:unlock", async (_e, passphrase) =>
  {
    const res = vaultManager.vaultUnlock(String(passphrase || ""));
    if (res?.ok) {
      const settings = settingsManager.reloadSettings();
      applyConfiguredLibraryRoot(settings.libraryPath);
      sendToGallery("settings:updated", settings);
      sendToDownloader("settings:updated", settings);
      sendToBrowser("settings:updated", settings);
    }
    return res;
  },
);
ipcMain.handle("vault:lock", async () => vaultManager.vaultLock());

ipcMain.handle("browser:navigate", async (_event, url) => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    let target = String(url || "").trim();
    if (!target) return { ok: false, error: "Empty URL" };
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    await getBrowserView().webContents.loadURL(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:back", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    const contents = getBrowserView().webContents;
    if (canGoBack(contents)) {
      await contents.goBack();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:forward", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    const contents = getBrowserView().webContents;
    if (canGoForward(contents)) {
      await contents.goForward();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:navigationState", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    const contents = getBrowserView().webContents;
    return {
      ok: true,
      canGoBack: canGoBack(contents),
      canGoForward: canGoForward(contents),
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:reload", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    getBrowserView().webContents.reload();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:setSidePanelWidth", async (_event, width) => {
  if (!getBrowserView() || !getBrowserWin()) return { ok: false, error: "Browser is not open." };
  const numericWidth = Number(width);
  setBrowserSidePanelWidth(Number.isFinite(numericWidth) ? Math.max(0, Math.round(numericWidth)) : 0);
  const bounds = getBrowserWin().getContentBounds();
  const barHeight = 60;
  getBrowserView().setBounds({
    x: getBrowserSidePanelWidth(),
    y: barHeight,
    width: Math.max(0, bounds.width - getBrowserSidePanelWidth()),
    height: bounds.height - barHeight,
  });
  return { ok: true };
});

ipcMain.handle("browser:close", async () => {
  try {
    if (getBrowserWin() && !getBrowserWin().isDestroyed()) getBrowserWin().close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:bookmarks:list", async () => {
  const res = loadBookmarksFromDisk();
  if (!res.ok) return res;
  const sorted = res.bookmarks
    .filter((item) => item && item.url)
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  return { ok: true, bookmarks: sorted };
});

ipcMain.handle("browser:bookmark:add", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  const pageUrl = String(getBrowserView().webContents.getURL() || "").trim();
  if (!pageUrl) return { ok: false, error: "No page to bookmark." };
  const title = String(getBrowserView().webContents.getTitle() || "").trim() || pageUrl;
  return addBookmarkForPage(pageUrl, title);
});

ipcMain.handle("browser:bookmark:remove", async (_event, id) => {
  const bookmarkId = String(id || "").trim();
  if (!bookmarkId) return { ok: false, error: "Bookmark id required." };
  return removeBookmarkById(bookmarkId);
});

ipcMain.handle("browser:directDownload:state", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  const url = String(getBrowserView().webContents.getURL() || "").trim();
  if (!url) return { ok: true, supported: false, reason: "No URL loaded." };
  const adapter = resolveSourceAdapter(url);
  logDirectDownload("state:checked", {
    url: redactSensitiveUrls(url),
    hasAdapter: Boolean(adapter),
    sourceId: adapter?.sourceId || null,
  });
  if (!adapter) {
    return {
      ok: true,
      supported: false,
      reasonCode: "unsupported-source",
      reason: "Direct download is not supported for this site yet.",
    };
  }
  const rules = adapter.directDownloadRules;
  if (!matchesUrlRules(url, rules)) {
    return {
      ok: true,
      supported: false,
      sourceId: adapter.sourceId || null,
      reasonCode: "unsupported-url",
      reason: "This page is not a supported gallery URL for this source.",
    };
  }
  return {
    ok: true,
    supported: true,
    sourceId: adapter.sourceId || null,
    alreadyDownloaded: isAlreadyDownloadedMeta({ sourceUrl: url }),
  };
});

ipcMain.handle("browser:directDownload:trigger", async (_event) => {
  logDirectDownload("trigger:received", {
    hasBrowserView: Boolean(getBrowserView()),
    hasBrowserWindow: Boolean(getBrowserWin()),
  });
  if (!getBrowserView() || !getBrowserWin() || getBrowserWin().isDestroyed() || getBrowserView().webContents.isDestroyed()) {
    logDirectDownload("trigger:rejected-browser-not-open");
    return { ok: false, error: "Browser is not open." };
  }
  const url = String(getBrowserView().webContents.getURL() || "").trim();
  const adapter = resolveSourceAdapter(url);
  const rules = adapter ? adapter.directDownloadRules : null;
  logDirectDownload("trigger:resolved", {
    url: redactSensitiveUrls(url),
    hasAdapter: Boolean(adapter),
    sourceId: adapter?.sourceId || null,
    matchesRules: Boolean(adapter && matchesUrlRules(url, rules)),
    pendingRequests: pendingScrapeRequests.size,
  });
  if (!adapter || !matchesUrlRules(url, rules)) {
    logDirectDownload("trigger:rejected-unsupported-url");
    return { ok: false, error: "Direct download is not available for this URL." };
  }
  if (pendingScrapeRequests.size > 0) {
    logDirectDownload("trigger:rejected-scrape-already-in-progress", {
      pendingRequests: pendingScrapeRequests.size,
    });
    return { ok: false, error: "A direct download scrape is already in progress." };
  }

  const requestId = `scrape-${Date.now()}-${nextScrapeRequestId++}`;
  logDirectDownload("scrape:request-created", { requestId });
  const scrapePromise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logDirectDownload("scrape:timeout", { requestId, timeoutMs: DIRECT_DOWNLOAD_SCRAPE_TIMEOUT_MS, ...summarizeBrowserViewState() });
      completeScrapeRequest(requestId, {
        ok: false,
        error: "Direct download scrape timed out.",
      });
      if (getBrowserView() && !getBrowserView().webContents.isDestroyed()) {
        getBrowserView().webContents.send("browser:direct-download:scrape-cancel", { requestId });
      }
    }, DIRECT_DOWNLOAD_SCRAPE_TIMEOUT_MS);
    pendingScrapeRequests.set(requestId, { resolve, timeout });
  });

  getBrowserView().webContents.send("browser:direct-download:scrape-request", {
    requestId,
    url,
  });
  logDirectDownload("scrape:request-sent", { requestId, url: redactSensitiveUrls(url), ...summarizeBrowserViewState() });

  const scrapeResult = await scrapePromise;
  logDirectDownload("scrape:result-received", {
    requestId,
    ok: Boolean(scrapeResult?.ok),
    error: scrapeResult?.ok ? null : redactErrorMessage(scrapeResult?.error, "Direct download scrape failed."),
  });
  if (!scrapeResult?.ok) {
    return {
      ok: false,
      error: redactErrorMessage(scrapeResult?.error, "Direct download scrape failed."),
    };
  }

  const validated = sanitizeAltDownloadPayload(scrapeResult.payload, {
    resolvedSourceId: adapter.sourceId,
  });
  logDirectDownload("payload:validated", {
    requestId,
    ok: Boolean(validated?.ok),
    imageCount: Array.isArray(validated?.imageUrls) ? validated.imageUrls.length : 0,
    error: validated?.ok ? null : redactErrorMessage(validated?.error, "Invalid scrape result."),
  });
  if (!validated.ok) {
    return { ok: false, error: redactErrorMessage(validated.error, "Invalid scrape result.") };
  }

  const alreadyDownloaded = isAlreadyDownloadedMeta(validated.meta);

  ensureDownloaderWindow();
  const requestHeaders = {};
  if (validated.context.referer) requestHeaders.referer = validated.context.referer;
  if (validated.context.origin) requestHeaders.origin = validated.context.origin;
  if (validated.context.userAgent) requestHeaders["user-agent"] = validated.context.userAgent;
  const downloadResult = await dl.addDirectDownload({
    imageUrls: validated.imageUrls,
    meta: validated.meta,
    requestHeaders,
  });
  logDirectDownload("download:queued", {
    requestId,
    ok: Boolean(downloadResult?.ok),
    error: downloadResult?.ok ? null : redactErrorMessage(downloadResult?.error, "Failed to queue direct download."),
  });
  if (!downloadResult?.ok) {
    return {
      ok: false,
      error: redactErrorMessage(downloadResult?.error, "Failed to queue direct download."),
    };
  }
  sendToDownloader("dl:toast", { message: "Alternate download queued." });
  if (alreadyDownloaded) return { ...downloadResult, alreadyDownloaded: true };
  return downloadResult;
});


ipcMain.handle("browser:directDownload:debugLog", async (_event, payload) => {
  if (!getBrowserView() || !getBrowserWin() || getBrowserWin().isDestroyed() || getBrowserView().webContents.isDestroyed()) {
    return { ok: false, error: "Browser is not open." };
  }
  const sender = _event?.sender;
  if (!sender || sender.id !== getBrowserView().webContents.id) {
    return { ok: false, error: "Unauthorized debug sender." };
  }
  const stage = String(payload?.stage || "").trim() || "unspecified";
  const requestId = String(payload?.requestId || "").trim();
  browserViewDebugState.lastEventAt = Date.now();
  browserViewDebugState.lastStage = stage;
  browserViewDebugState.lastRequestId = requestId;
  const details = payload && typeof payload.details === "object" ? payload.details : undefined;
  logDirectDownload(`browser-view:${stage}`, {
    requestId: requestId || null,
    details: details || null,
    senderId: sender.id,
  });
  return { ok: true };
});

ipcMain.handle("browser:directDownload:scrapeResult", async (_event, payload) => {
  if (!getBrowserView() || !getBrowserWin() || getBrowserWin().isDestroyed() || getBrowserView().webContents.isDestroyed()) {
    return { ok: false, error: "Browser is not open." };
  }
  const sender = _event?.sender;
  logDirectDownload("scrape-result:received", {
    senderId: sender?.id || null,
    browserViewSenderId: getBrowserView().webContents.id,
    requestId: String(payload?.requestId || "").trim() || null,
    ok: Boolean(payload?.ok),
    msSinceLastBrowserViewDebugEvent: browserViewDebugState.lastEventAt ? (Date.now() - browserViewDebugState.lastEventAt) : null,
    browserViewLastStage: browserViewDebugState.lastStage,
  });
  if (!sender || sender.id !== getBrowserView().webContents.id) {
    logDirectDownload("scrape-result:rejected-unauthorized-sender");
    return { ok: false, error: "Unauthorized scrape result sender." };
  }

  const requestId = String(payload?.requestId || "").trim();
  if (!requestId || !pendingScrapeRequests.has(requestId)) {
    logDirectDownload("scrape-result:rejected-unknown-request", { requestId });
    return { ok: false, error: "Unknown scrape request id." };
  }

  const result = payload?.ok
    ? { ok: true, payload: payload?.payload || {} }
    : {
        ok: false,
        error: redactErrorMessage(payload?.error, "Direct download scrape failed."),
      };
  completeScrapeRequest(requestId, result);
  logDirectDownload("scrape-result:completed", {
    requestId,
    ok: Boolean(result?.ok),
    error: result?.ok ? null : result?.error,
  });
  return { ok: true };
});

}

module.exports = { registerVaultBrowserIpcHandlers };
