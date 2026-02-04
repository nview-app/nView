const { Readable } = require("stream");
const crypto = require("crypto");
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  session,
  shell,
  protocol,
  nativeImage,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { createVaultManager } = require("./main/vault");
const {
  APP_ICON_PATH,
  LIBRARY_ROOT,
  BOOKMARKS_FILE,
  PENDING_CLEANUP_FILE,
  PENDING_FILE_CLEANUP_FILE,
  SETTINGS_FILE,
  SETTINGS_PLAINTEXT_FILE,
} = require("./main/app_paths");
const { delay, listFilesRecursive } = require("./main/utils");
const { createSettingsManager } = require("./main/settings");
const { createCleanupHelpers } = require("./main/cleanup");
const {
  DIRECT_ENCRYPTION_VERSION,
  createDirectEncryptionHelpers,
} = require("./main/direct_encryption");
const { createLibraryIndex } = require("./main/library_index");
const { createDownloadManager } = require("./main/download_manager");

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "appfile",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: false,
    },
  },
]);

let galleryWin;
let browserWin;
let browserView;
let downloaderWin;
let browserSidePanelWidth = 0;
let browserSession;
let browserPartition;

const DEFAULT_SETTINGS = {
  startPage: "https://example.com",
  blockPopups: false,
  allowListEnabled: false,
  allowListDomains: [
    "*.cloudflare.com",
    "*.googleapis.com",
    "*.cloudflareinsights.com",
    "*.gstatic.com",
  ],
  darkMode: false,
  defaultSort: "recent",
  cardSize: "normal",
};

const MIN_VAULT_PASSPHRASE = 4;
const BOOKMARKS_REL_PATH = "bookmarks.json";
const SETTINGS_REL_PATH = "settings.json";

const DELETE_ON_FAIL = true;
let allowAppClose = false;

function ensureDirs() {
  fs.mkdirSync(LIBRARY_ROOT(), { recursive: true });
}

const vaultManager = createVaultManager({ getLibraryRoot: LIBRARY_ROOT });
const settingsManager = createSettingsManager({
  settingsFile: SETTINGS_FILE(),
  settingsPlaintextFile: SETTINGS_PLAINTEXT_FILE(),
  settingsRelPath: SETTINGS_REL_PATH,
  defaultSettings: DEFAULT_SETTINGS,
  getWindows: () => [galleryWin, downloaderWin, browserWin],
  vaultManager,
});
const cleanupHelpers = createCleanupHelpers({
  pendingCleanupFile: PENDING_CLEANUP_FILE(),
  pendingFileCleanupFile: PENDING_FILE_CLEANUP_FILE(),
});

const {
  directEncryptedMetaPath,
  encryptStreamToFile,
  hasPlainImageFiles,
  moveEncryptedDirectImagesToVault,
  movePlainDirectImagesToVault,
  readTempEncryptionInfo,
  writeDirectEncryptedMeta,
} = createDirectEncryptionHelpers({
  vaultManager,
  getVaultRelPath,
});

const libraryIndex = createLibraryIndex({
  libraryRoot: LIBRARY_ROOT,
  vaultManager,
  getVaultRelPath,
});

const {
  buildComicEntry,
  deleteLibraryIndexEntry,
  isImagePath,
  listEncryptedImagesRecursiveSorted,
  loadLibraryIndexCache,
  normalizeGalleryId,
  normalizeTagsInput,
  readLibraryIndexEntry,
  writeLibraryIndexEntry,
} = libraryIndex;

function sendToGallery(channel, payload) {
  if (galleryWin && !galleryWin.isDestroyed()) galleryWin.webContents.send(channel, payload);
}
function sendToDownloader(channel, payload) {
  if (downloaderWin && !downloaderWin.isDestroyed()) downloaderWin.webContents.send(channel, payload);
}
function sendToBrowser(channel, payload) {
  if (browserWin && !browserWin.isDestroyed()) browserWin.webContents.send(channel, payload);
}

const dl = createDownloadManager({
  LIBRARY_ROOT,
  DELETE_ON_FAIL,
  ensureDirs,
  delay,
  listTempDirs: require("./main/utils").listTempDirs,
  readTempEncryptionInfo,
  purgeFolderBestEffort: cleanupHelpers.purgeFolderBestEffort,
  registerPendingCleanup: cleanupHelpers.registerPendingCleanup,
  registerPendingFileCleanup: cleanupHelpers.registerPendingFileCleanup,
  runPendingCleanupSweep: cleanupHelpers.runPendingCleanupSweep,
  runPendingFileCleanupSweep: cleanupHelpers.runPendingFileCleanupSweep,
  tryDeleteFileWithRetries: cleanupHelpers.tryDeleteFileWithRetries,
  moveEncryptedDirectImagesToVault,
  movePlainDirectImagesToVault,
  hasPlainImageFiles,
  directEncryptedMetaPath,
  writeDirectEncryptedMeta,
  encryptStreamToFile,
  DIRECT_ENCRYPTION_VERSION,
  getVaultRelPath,
  vaultManager,
  normalizeGalleryId,
  writeLibraryIndexEntry,
  sendToDownloader,
  sendToGallery,
});

function normalizeGalleryIdInput(value) {
  return normalizeGalleryId(value);
}

function validateVaultPassphrase(passphrase) {
  const trimmed = String(passphrase || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Passphrase required." };
  }
  if (trimmed.length < MIN_VAULT_PASSPHRASE) {
    return {
      ok: false,
      error: `Passphrase must be at least ${MIN_VAULT_PASSPHRASE} characters.`,
    };
  }
  return { ok: true, passphrase: trimmed };
}

function loadBookmarksFromDisk() {
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true, error: "Vault Mode is required for bookmarks." };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true, error: "Vault Mode is locked." };
  }
  const filePath = BOOKMARKS_FILE();
  if (!fs.existsSync(filePath)) {
    return { ok: true, bookmarks: [] };
  }
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = vaultManager.decryptBufferWithKey({
      relPath: BOOKMARKS_REL_PATH,
      buffer: encrypted,
    });
    const payload = JSON.parse(decrypted.toString("utf8"));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return { ok: true, bookmarks: items };
  } catch (err) {
    console.warn("[bookmarks] failed to load:", String(err));
    return { ok: false, error: "Failed to load bookmarks." };
  }
}

function persistBookmarksToDisk(bookmarks) {
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true, error: "Vault Mode is required for bookmarks." };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true, error: "Vault Mode is locked." };
  }
  try {
    const payload = Buffer.from(
      JSON.stringify({ v: 1, items: bookmarks }, null, 2),
      "utf8",
    );
    const encrypted = vaultManager.encryptBufferWithKey({
      relPath: BOOKMARKS_REL_PATH,
      buffer: payload,
    });
    fs.writeFileSync(BOOKMARKS_FILE(), encrypted);
    return { ok: true };
  } catch (err) {
    console.warn("[bookmarks] failed to save:", String(err));
    return { ok: false, error: "Failed to save bookmarks." };
  }
}

function isUnderLibraryRoot(p) {
  const libRootResolved = path.resolve(LIBRARY_ROOT());
  const libRoot = fs.realpathSync.native ? fs.realpathSync.native(libRootResolved) : fs.realpathSync(libRootResolved);
  const resolved = path.resolve(String(p || ""));
  let resolvedReal = resolved;
  try {
    resolvedReal = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  } catch {
    const parent = path.dirname(resolved);
    try {
      const parentReal = fs.realpathSync.native
        ? fs.realpathSync.native(parent)
        : fs.realpathSync(parent);
      resolvedReal = path.join(parentReal, path.basename(resolved));
    } catch {
      resolvedReal = resolved;
    }
  }
  return resolvedReal === libRoot || resolvedReal.startsWith(libRoot + path.sep);
}

function getVaultRelPath(absPath) {
  return path
    .relative(LIBRARY_ROOT(), absPath)
    .replaceAll("\\", "/");
}

async function confirmCloseWithActiveVaultDownloads(parentWindow) {
  if (!dl.hasInProgressDownloads()) return true;

  const { response } = await dialog.showMessageBox(parentWindow ?? null, {
    type: "warning",
    buttons: ["Go back", "I understand, close"],
    defaultId: 0,
    cancelId: 0,
    message: "You are about to close nView while a download is ongoing.",
    detail:
      "Closing now will cancel active downloads and delete any partial files. Downloads do not resume after restart.",
  });
  return response === 1;
}

async function tryExtractComicMetadataFromWebContents(webContents) {
  try {
    if (!webContents || webContents.isDestroyed()) return null;

    const data = await webContents.executeJavaScript(`
      (() => {
        const txt = (el) => (el && el.textContent ? el.textContent.trim() : "");

        const name =
          txt(document.querySelector("#info h1.title .pretty")) ||
          txt(document.querySelector("#info h2.title .pretty")) ||
          null;

        const hBefore = txt(document.querySelector("#info h1.title .before"));
        const artistFromH = hBefore ? hBefore.replace(/^\\[|\\]$/g, "").trim() : null;

        const containers = Array.from(document.querySelectorAll("#tags .tag-container"));
        const findContainer = (label) =>
          containers.find((c) => (txt(c) || "").toLowerCase().startsWith(label.toLowerCase()));

        const namesFrom = (container) =>
          container
            ? Array.from(container.querySelectorAll(".tags .name")).map(txt).filter(Boolean)
            : [];

        const tagsContainer = findContainer("Tags:");
        const artistsContainer = findContainer("Artists:");
        const pagesContainer = findContainer("Pages:");

        const tags = namesFrom(tagsContainer);
        const artists = namesFrom(artistsContainer);

        const pagesStr = pagesContainer ? txt(pagesContainer.querySelector(".tags .name")) : "";
        const pagesNum = parseInt(pagesStr, 10);

        const galleryIdRaw = txt(document.querySelector("#gallery_id"));
        const galleryId = galleryIdRaw ? galleryIdRaw.replace("#", "").trim() : null;

        return {
          sourceUrl: location.href,
          galleryId,
          comicName: name,
          artists,
          artist: artists[0] || artistFromH || null,
          tags,
          pages: Number.isFinite(pagesNum) ? pagesNum : null,
          capturedAt: new Date().toISOString(),
        };
      })()
    `);

    if (!data || (!data.comicName && !data.galleryId)) return null;
    return data;
  } catch (err) {
    console.warn("[metadata extract failed]", String(err));
    return null;
  }
}

function resolveRealPath(p) {
  try {
    return fs.realpathSync(p);
  } catch (err) {
    return path.resolve(p);
  }
}

function isPathInsideDir(baseDir, targetPath) {
  const base = resolveRealPath(baseDir);
  const target = resolveRealPath(targetPath);

  const rel = path.relative(base, target);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (inside) return true;

  if (process.platform === "win32") {
    const baseLC = base.toLowerCase();
    const targetLC = target.toLowerCase();
    return targetLC === baseLC || targetLC.startsWith(baseLC + path.sep);
  }

  return false;
}

function mimeForFile(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function registerAppFileProtocol(targetSession) {
  targetSession.protocol.registerStreamProtocol("appfile", (request, callback) => {
    try {
      const u = new URL(request.url);

      let pathname = decodeURIComponent(u.pathname || "");

      while (pathname.startsWith("/")) pathname = pathname.slice(1);

      if (process.platform === "win32") {
        const host = String(u.host || "");

        if (/^[a-zA-Z]$/.test(host)) {
          const drive = host.toUpperCase();
          pathname = `${drive}:/${pathname}`;
        }

        if (/^[a-zA-Z]\//.test(pathname)) {
          pathname = pathname[0].toUpperCase() + ":/" + pathname.slice(2);
        }
      }

      const resolved = path.resolve(path.normalize(pathname));
      const libRoot = path.resolve(LIBRARY_ROOT());

      if (!isPathInsideDir(libRoot, resolved)) {
        console.warn("[appfile] blocked:", { resolved, libRoot, url: request.url });
        return callback({
          statusCode: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          data: Readable.from("Forbidden"),
        });
      }

      if (resolved.toLowerCase().endsWith(".enc")) {
        return callback({
          statusCode: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          data: Readable.from("Forbidden"),
        });
      }

      const vaultEnabled = vaultManager.isInitialized();
      const isMetadataRequest = path.basename(resolved) === "metadata.json";
      const needsVault = isImagePath(resolved) || isMetadataRequest;

      if (needsVault && !vaultEnabled) {
        return callback({
          statusCode: 401,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          data: Readable.from("Vault required"),
        });
      }

      const shouldDecrypt = needsVault;

      if (shouldDecrypt && !vaultManager.isUnlocked()) {
        return callback({
          statusCode: 401,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          data: Readable.from("Vault locked"),
        });
      }

      if (shouldDecrypt) {
        const encryptedPath = `${resolved}.enc`;
        if (!fs.existsSync(encryptedPath)) {
          console.warn("[appfile] not found:", { encryptedPath, url: request.url });
          return callback({
            statusCode: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            data: Readable.from("Not found"),
          });
        }

        let decryptedStream;
        try {
          decryptedStream = vaultManager.decryptFileToStream({
            relPath: getVaultRelPath(resolved),
            inputPath: encryptedPath,
          });
        } catch (err) {
          console.warn("[appfile] decrypt failed:", String(err), { encryptedPath });
          return callback({
            statusCode: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            data: Readable.from("Decrypt error"),
          });
        }

        decryptedStream.on("error", (err) => {
          console.warn("[appfile] decrypt stream failed:", String(err), { encryptedPath });
        });

        return callback({
          statusCode: 200,
          headers: {
            "Content-Type": mimeForFile(resolved),
            "Cache-Control": "no-store",
          },
          data: decryptedStream,
        });
      }

      if (!fs.existsSync(resolved)) {
        console.warn("[appfile] not found:", { resolved, url: request.url });
        return callback({
          statusCode: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          data: Readable.from("Not found"),
        });
      }

      const stream = fs.createReadStream(resolved);
      stream.on("error", (err) => {
        console.warn("[appfile] stream error:", String(err), { resolved });
        callback({
          statusCode: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          data: Readable.from("Stream error"),
        });
      });

      callback({
        statusCode: 200,
        headers: {
          "Content-Type": mimeForFile(resolved),
          "Cache-Control": "no-store",
        },
        data: stream,
      });
    } catch (err) {
      console.warn("[appfile] handler error:", String(err), { url: request.url });
      callback({
        statusCode: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        data: Readable.from("Handler error"),
      });
    }
  });
}

function registerAppFileProtocolBlocklist(targetSession) {
  targetSession.protocol.registerStreamProtocol("appfile", (request, callback) => {
    console.warn("[appfile] blocked by session policy:", { url: request.url });
    callback({
      statusCode: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      data: Readable.from("Forbidden"),
    });
  });
}

function closeAuxWindows() {
  if (downloaderWin && !downloaderWin.isDestroyed()) {
    downloaderWin.close();
  }
  if (browserWin && !browserWin.isDestroyed()) {
    browserWin.close();
  }
}

function createGalleryWindow() {
  ensureDirs();
  galleryWin = new BrowserWindow({
    width: 1200,
    height: 900,
    title: "Gallery",
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  galleryWin.loadFile(path.join(__dirname, "windows", "index.html"));
  galleryWin.on("close", async (event) => {
    if (allowAppClose) return;
    const needsWarning = dl.hasInProgressDownloads();
    if (!needsWarning) return;
    event.preventDefault();
    const okToClose = await confirmCloseWithActiveVaultDownloads(galleryWin);
    if (!okToClose) return;
    allowAppClose = true;
    await dl.cancelAllJobs();
    app.quit();
  });
  galleryWin.on("closed", () => {
    closeAuxWindows();
  });
}

function ensureDownloaderWindow() {
  if (downloaderWin && !downloaderWin.isDestroyed()) {
    downloaderWin.focus();
    return;
  }

  downloaderWin = new BrowserWindow({
    width: 900,
    height: 700,
    title: "Downloader",
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload", "downloader_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  downloaderWin.loadFile(path.join(__dirname, "windows", "downloader.html"));
  downloaderWin.on("closed", () => (downloaderWin = null));
}

function ensureBrowserWindow(initialUrl = "https://example.com") {
  if (browserWin && !browserWin.isDestroyed()) {
    browserWin.focus();
    if (browserView) browserView.webContents.loadURL(initialUrl).catch(() => {});
    return;
  }

  browserPartition = `temp:nviewer-incognito-${Date.now()}`;
  browserSession = session.fromPartition(browserPartition, { cache: false });
  registerAppFileProtocolBlocklist(browserSession);

  browserWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Web Viewer",
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload", "browser_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  browserWin.loadFile(path.join(__dirname, "windows", "browser.html"));

  browserView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "preload", "browser_view_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: browserPartition,
    },
  });

  const getAllowListDomains = (settings) => {
    const domains = Array.isArray(settings.allowListDomains)
      ? settings.allowListDomains
      : [];
    let startHost = "";
    try {
      startHost = new URL(settings.startPage).hostname.toLowerCase();
    } catch {
      startHost = "";
    }
    const startVariants = [];
    if (startHost) {
      startVariants.push(startHost);
      if (startHost.includes(".")) {
        startVariants.push(`*.${startHost}`);
      }
    }
    const merged = startVariants.length ? [...startVariants, ...domains] : domains;
    return merged.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
  };

  const isHostAllowed = (host, domains) => {
    const normalizedHost = String(host || "").toLowerCase();
    if (!normalizedHost) return true;
    return domains.some((entry) => {
      if (entry.startsWith("*.")) {
        const base = entry.slice(2);
        return normalizedHost === base || normalizedHost.endsWith(`.${base}`);
      }
      return normalizedHost === entry;
    });
  };

  const isUrlAllowed = (url) => {
    const settings = settingsManager.getSettings();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!settings.allowListEnabled) return true;
    const domains = getAllowListDomains(settings);
    return isHostAllowed(parsed.hostname, domains);
  };

  browserWin.setBrowserView(browserView);
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    const { blockPopups } = settingsManager.getSettings();
    if (blockPopups) {
      console.info("[popup blocked]", url);
      return { action: "deny" };
    }
    if (!isUrlAllowed(url)) {
      console.info("[popup blocked by allowlist]", url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  browserSession.webRequest.onBeforeRequest((details, callback) => {
    if (!isUrlAllowed(details.url)) {
      console.info("[allowlist blocked]", details.url);
      return callback({ cancel: true });
    }
    return callback({});
  });

  const layout = () => {
    if (!browserWin || browserWin.isDestroyed() || !browserView) return;
    const b = browserWin.getContentBounds();
    const barHeight = 60;
    const sideWidth = Math.max(0, browserSidePanelWidth);
    browserView.setBounds({
      x: sideWidth,
      y: barHeight,
      width: Math.max(0, b.width - sideWidth),
      height: b.height - barHeight,
    });
    browserView.setAutoResize({ width: true, height: true });
  };

  browserWin.on("resize", layout);
  layout();

  const publishBrowserUrl = (url) => {
    if (!browserWin || browserWin.isDestroyed()) return;
    const nextUrl = String(url || browserView?.webContents.getURL() || "");
    if (nextUrl) sendToBrowser("browser:url-updated", nextUrl);
  };

  browserView.webContents.on("did-navigate", (_event, url) => {
    publishBrowserUrl(url);
  });
  browserView.webContents.on("did-navigate-in-page", (_event, url) => {
    publishBrowserUrl(url);
  });
  let lastCacheMissReload = { url: "", at: 0 };
  const handleCacheMiss = (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    const isCacheMiss = errorCode === -10 || errorDescription === "ERR_CACHE_MISS";
    if (!isCacheMiss) return;
    const targetUrl = String(validatedURL || browserView?.webContents.getURL() || "");
    if (!targetUrl) return;
    const now = Date.now();
    if (lastCacheMissReload.url === targetUrl && now - lastCacheMissReload.at < 2000) {
      console.warn("[browser] cache miss reload suppressed:", errorDescription, targetUrl);
      return;
    }
    lastCacheMissReload = { url: targetUrl, at: now };
    console.warn("[browser] cache miss, reloading:", errorDescription, targetUrl);
    setTimeout(() => {
      if (!browserView || browserView.webContents.isDestroyed()) return;
      browserView.webContents.loadURL(targetUrl).catch(() => {});
    }, 0);
  };
  browserView.webContents.on("did-fail-load", handleCacheMiss);
  browserView.webContents.on("did-fail-provisional-load", handleCacheMiss);
  browserView.webContents.on("did-finish-load", () => {
    publishBrowserUrl();
  });
  browserView.webContents.on("will-navigate", (event, url) => {
    if (!isUrlAllowed(url)) {
      console.info("[navigation blocked by allowlist]", url);
      event.preventDefault();
    }
  });
  browserView.webContents.on("will-redirect", (event, url) => {
    if (!isUrlAllowed(url)) {
      console.info("[redirect blocked by allowlist]", url);
      event.preventDefault();
    }
  });

  browserWin.on("app-command", (_event, command) => {
    if (!browserView || browserView.webContents.isDestroyed()) return;
    if (command === "browser-backward" && browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
    }
    if (command === "browser-forward" && browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
    }
  });


  browserView.webContents.loadURL(initialUrl).catch(() => {});

  browserWin.on("closed", () => {
    const sessionToClear = browserSession;
    browserWin = null;
    browserView = null;
    browserSidePanelWidth = 0;
    browserSession = null;
    browserPartition = null;
    if (sessionToClear) {
      sessionToClear.clearCache().catch(() => {});
      sessionToClear.clearStorageData().catch(() => {});
    }
  });
}

ipcMain.handle("ui:openBrowser", async (_e, url) => {
  const settings = settingsManager.getSettings();
  const resolved = String(url || "").trim() || settings.startPage;
  ensureBrowserWindow(resolved);
  return { ok: true };
});

ipcMain.handle("ui:openDownloader", async () => {
  ensureDownloaderWindow();
  return { ok: true };
});

ipcMain.handle("browser:altDownload", async (_event, payload) => {
  ensureDownloaderWindow();
  const requestHeaders = {};
  if (payload?.referer) requestHeaders.referer = payload.referer;
  if (payload?.origin) requestHeaders.origin = payload.origin;
  if (payload?.userAgent) requestHeaders["user-agent"] = payload.userAgent;
  const res = await dl.addDirectDownload({
    imageUrls: payload?.imageUrls,
    meta: payload?.meta,
    requestHeaders,
  });
  if (!res?.ok) return res;
  sendToDownloader("dl:toast", { message: "Alternate download queued." });
  return res;
});

ipcMain.handle("settings:get", async () => ({ ok: true, settings: settingsManager.getSettings() }));

ipcMain.handle("settings:update", async (_e, payload) => {
  const next = settingsManager.updateSettings(payload || {});
  sendToGallery("settings:updated", next);
  sendToDownloader("settings:updated", next);
  sendToBrowser("settings:updated", next);
  return { ok: true, settings: next };
});

ipcMain.handle("vault:status", async () => ({ ok: true, status: vaultManager.vaultStatus() }));
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
    sendToGallery("settings:updated", settings);
    sendToDownloader("settings:updated", settings);
    sendToBrowser("settings:updated", settings);
    return { ok: true, summary };
  } catch (err) {
    vaultManager.vaultLock();
    try {
      const vaultPath = vaultManager.vaultFilePath();
      if (fs.existsSync(vaultPath)) fs.unlinkSync(vaultPath);
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
      sendToGallery("settings:updated", settings);
      sendToDownloader("settings:updated", settings);
      sendToBrowser("settings:updated", settings);
    }
    return res;
  },
);
ipcMain.handle("vault:lock", async () => vaultManager.vaultLock());

ipcMain.handle("browser:navigate", async (_event, url) => {
  if (!browserView) return { ok: false, error: "Browser is not open." };
  try {
    let target = String(url || "").trim();
    if (!target) return { ok: false, error: "Empty URL" };
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    await browserView.webContents.loadURL(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:back", async () => {
  if (!browserView) return { ok: false, error: "Browser is not open." };
  try {
    const contents = browserView.webContents;
    if (contents.canGoBack()) {
      await contents.goBack();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:forward", async () => {
  if (!browserView) return { ok: false, error: "Browser is not open." };
  try {
    const contents = browserView.webContents;
    if (contents.canGoForward()) {
      await contents.goForward();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:reload", async () => {
  if (!browserView) return { ok: false, error: "Browser is not open." };
  try {
    browserView.webContents.reload();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:setSidePanelWidth", async (_event, width) => {
  if (!browserView || !browserWin) return { ok: false, error: "Browser is not open." };
  const numericWidth = Number(width);
  browserSidePanelWidth = Number.isFinite(numericWidth) ? Math.max(0, Math.round(numericWidth)) : 0;
  const bounds = browserWin.getContentBounds();
  const barHeight = 60;
  browserView.setBounds({
    x: browserSidePanelWidth,
    y: barHeight,
    width: Math.max(0, bounds.width - browserSidePanelWidth),
    height: bounds.height - barHeight,
  });
  return { ok: true };
});

ipcMain.handle("browser:close", async () => {
  try {
    if (browserWin && !browserWin.isDestroyed()) browserWin.close();
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
  if (!browserView) return { ok: false, error: "Browser is not open." };
  const pageUrl = String(browserView.webContents.getURL() || "").trim();
  if (!pageUrl) return { ok: false, error: "No page to bookmark." };
  const title = String(browserView.webContents.getTitle() || "").trim() || pageUrl;
  const savedAt = new Date().toISOString();

  const res = loadBookmarksFromDisk();
  if (!res.ok) return res;

  const next = Array.isArray(res.bookmarks) ? [...res.bookmarks] : [];
  const existingIndex = next.findIndex((item) => item?.url === pageUrl);
  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      title,
      savedAt,
    };
  } else {
    next.unshift({
      id: crypto.randomUUID(),
      url: pageUrl,
      title,
      savedAt,
    });
  }
  const writeRes = persistBookmarksToDisk(next);
  if (!writeRes.ok) return writeRes;
  return { ok: true, bookmarks: next };
});

ipcMain.handle("browser:bookmark:remove", async (_event, id) => {
  const bookmarkId = String(id || "").trim();
  if (!bookmarkId) return { ok: false, error: "Bookmark id required." };
  const res = loadBookmarksFromDisk();
  if (!res.ok) return res;
  const next = Array.isArray(res.bookmarks)
    ? res.bookmarks.filter((item) => item?.id !== bookmarkId)
    : [];
  const writeRes = persistBookmarksToDisk(next);
  if (!writeRes.ok) return writeRes;
  return { ok: true, bookmarks: next };
});

ipcMain.handle("dl:list", async () => ({ ok: true, jobs: dl.listJobs() }));
ipcMain.handle("dl:cancel", async (_e, jobId) => dl.cancelJob(String(jobId)));
ipcMain.handle("dl:remove", async (_e, jobId) => dl.removeJob(String(jobId)));
ipcMain.handle("dl:stop", async (_e, jobId) => dl.stopJob(String(jobId)));
ipcMain.handle("dl:start", async (_e, jobId) => dl.startJobFromStop(String(jobId)));
ipcMain.handle("dl:clearCompleted", async () => dl.clearCompletedJobs());

ipcMain.handle("files:open", async (_event, filePath) => {
  ensureDirs();
  if (!filePath || !isUnderLibraryRoot(filePath)) {
    return { ok: false, error: "Invalid filePath" };
  }
  try {
    await shell.openPath(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("files:showInFolder", async (_event, filePath) => {
  ensureDirs();
  if (!filePath || !isUnderLibraryRoot(filePath)) {
    return { ok: false, error: "Invalid filePath" };
  }
  try {
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("library:listAll", async () => {
  ensureDirs();
  const root = LIBRARY_ROOT();

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true, root };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true, root };
  }

  let dirs = [];
  try {
    dirs = (await fs.promises.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith("comic_"))
      .map((d) => path.join(root, d.name));
  } catch {
    dirs = [];
  }

  const entries = await Promise.all(dirs.map((dir) => buildComicEntry(dir)));
  const items = entries.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));

  return { ok: true, root, items };
});

ipcMain.handle("library:lookupGalleryId", async (_e, galleryId) => {
  ensureDirs();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true };
  }
  const normalized = normalizeGalleryIdInput(galleryId);
  if (!normalized) return { ok: true, exists: false };

  const cache = loadLibraryIndexCache();
  const entries = cache?.entries || {};
  let exists = false;

  for (const entry of Object.values(entries)) {
    if (!entry) continue;
    if (normalizeGalleryId(entry.galleryId) === normalized) {
      exists = true;
      break;
    }
  }

  return { ok: true, exists };
});

ipcMain.handle("library:listComicPages", async (_e, comicDir) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, error: "Vault locked", locked: true };
  }

  const entry = await buildComicEntry(comicDir);

  let cachedImages = readLibraryIndexEntry(comicDir, true)?.images;
  if (!Array.isArray(cachedImages)) {
    cachedImages = await listEncryptedImagesRecursiveSorted(entry.contentDir);
    const dirStat = await (async () => {
      try {
        return await fs.promises.stat(comicDir);
      } catch {
        return null;
      }
    })();
    const contentStat = await (async () => {
      try {
        return await fs.promises.stat(entry.contentDir);
      } catch {
        return null;
      }
    })();
    writeLibraryIndexEntry(comicDir, true, {
      dirMtimeMs: dirStat?.mtimeMs ?? 0,
      contentDir: entry.contentDir,
      contentDirMtimeMs: contentStat?.mtimeMs ?? 0,
      images: cachedImages,
    });
  }

  const pages = cachedImages.map((p) => p.slice(0, -4)).map((p) => ({
    path: p,
    name: path.basename(p),
    ext: path.extname(p).toLowerCase(),
  }));

  return { ok: true, comic: entry, pages };
});

ipcMain.handle("library:toggleFavorite", async (_e, comicDir, isFavorite) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }

  const vaultEnabled = vaultManager.isInitialized();
  if (!vaultEnabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultManager.isUnlocked()) {
    return { ok: false, error: "Vault locked" };
  }

  const metaEncPath = path.join(comicDir, "metadata.json.enc");

  let meta = {};
  if (fs.existsSync(metaEncPath)) {
    try {
      const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
      const decrypted = await vaultManager.decryptFileToBuffer({ relPath, inputPath: metaEncPath });
      meta = JSON.parse(decrypted.toString("utf8"));
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  if (isFavorite) {
    meta.favorite = true;
  } else {
    delete meta.favorite;
  }

  try {
    const json = JSON.stringify(meta, null, 2);
    const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
    const encrypted = vaultManager.encryptBufferWithKey({ relPath, buffer: Buffer.from(json) });
    fs.writeFileSync(metaEncPath, encrypted);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  return { ok: true, entry: await buildComicEntry(comicDir) };
});

ipcMain.handle("library:updateComicMeta", async (_e, comicDir, payload) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }

  const metaEncPath = path.join(comicDir, "metadata.json.enc");
  const indexPath = path.join(comicDir, "index.json");
  const indexEncPath = path.join(comicDir, "index.json.enc");
  const vaultEnabled = vaultManager.isInitialized();
  if (!vaultEnabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultManager.isUnlocked()) {
    return { ok: false, error: "Vault locked" };
  }

  let meta = {};
  if (fs.existsSync(metaEncPath)) {
    try {
      const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
      const decrypted = await vaultManager.decryptFileToBuffer({ relPath, inputPath: metaEncPath });
      meta = JSON.parse(decrypted.toString("utf8"));
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  const title = String(payload?.title || "").trim();
  const author = String(payload?.author || "").trim();
  const tags = normalizeTagsInput(payload?.tags);

  if (title) {
    meta.comicName = title;
    meta.title = title;
  } else {
    delete meta.comicName;
    delete meta.title;
  }

  if (author) {
    meta.artist = author;
    meta.artists = [author];
  } else {
    delete meta.artist;
    delete meta.artists;
  }

  meta.tags = tags;

  try {
    const json = JSON.stringify(meta, null, 2);
    const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
    const encrypted = vaultManager.encryptBufferWithKey({ relPath, buffer: Buffer.from(json) });
    fs.writeFileSync(metaEncPath, encrypted);
    let index = {};
    if (fs.existsSync(indexEncPath)) {
      const relIndexPath = getVaultRelPath(indexPath);
      const decryptedIndex = vaultManager.decryptBufferWithKey({
        relPath: relIndexPath,
        buffer: fs.readFileSync(indexEncPath),
      });
      index = JSON.parse(decryptedIndex.toString("utf8"));
    }
    if (title) index.title = title;
    else delete index.title;
    const relIndexPath = getVaultRelPath(indexPath);
    const encryptedIndex = vaultManager.encryptBufferWithKey({
      relPath: relIndexPath,
      buffer: Buffer.from(JSON.stringify(index), "utf8"),
    });
    fs.writeFileSync(indexEncPath, encryptedIndex);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  return { ok: true, entry: await buildComicEntry(comicDir) };
});

ipcMain.handle("library:deleteComic", async (_e, comicDir) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true };
  }

  const res = await cleanupHelpers.purgeFolderBestEffort(comicDir);
  if (!res.ok) {
    return { ok: false, error: "Failed to delete comic" };
  }

  deleteLibraryIndexEntry(comicDir, true);

  sendToGallery("library:changed", { at: Date.now() });
  return { ok: true, trashed: res.trashed, trashPath: res.trashPath };
});

ipcMain.handle("library:listLatest", async () => {
  ensureDirs();
  const root = LIBRARY_ROOT();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true, root };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true, root };
  }
  let dirs = [];
  try {
    dirs = (await fs.promises.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith("comic_"))
      .map((d) => path.join(root, d.name));
  } catch {
    dirs = [];
  }

  const itemsWithTimes = await Promise.all(
    dirs.map(async (dir) => {
      let mtimeMs = 0;
      try {
        const stat = await fs.promises.stat(dir);
        mtimeMs = stat.mtimeMs;
      } catch {}
      return { dir, mtimeMs };
    })
  );

  const items = await Promise.all(
    itemsWithTimes
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 10)
      .map(async ({ dir }) => ({
        dir,
        files: (await listFilesRecursive(dir)).map((p) => ({
          path: p,
          name: path.basename(p),
          ext: path.extname(p).toLowerCase(),
        })),
      }))
  );

  return { ok: true, root, items };
});

async function encryptLibraryForVault() {
  const root = LIBRARY_ROOT();
  const files = await listFilesRecursive(root);
  let encryptedImages = 0;
  let encryptedMeta = 0;
  let pendingPlaintextDeletes = 0;
  const targets = [];
  for (const filePath of files) {
    if (isImagePath(filePath)) {
      targets.push({ filePath, type: "image" });
      continue;
    }

    if (path.basename(filePath) === "metadata.json") {
      targets.push({ filePath, type: "meta" });
    }
  }

  const encryptedPaths = [];
  const tempPaths = [];
  const cleanupEncrypted = () => {
    for (const tempPath of tempPaths) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (err) {
        console.warn("[vault] failed to cleanup temp encrypted file:", tempPath, String(err));
      }
    }
    for (const encPath of encryptedPaths) {
      try {
        if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
      } catch (err) {
        console.warn("[vault] failed to cleanup encrypted file:", encPath, String(err));
      }
    }
  };

  try {
    for (const target of targets) {
      const encryptedPath = `${target.filePath}.enc`;
      const tempPath = `${encryptedPath}.tmp`;
      const relPath = getVaultRelPath(target.filePath);
      tempPaths.push(tempPath);
      await vaultManager.encryptFileToPath({
        relPath,
        inputPath: target.filePath,
        outputPath: tempPath,
      });
      fs.renameSync(tempPath, encryptedPath);
      encryptedPaths.push(encryptedPath);
      if (target.type === "image") encryptedImages += 1;
      if (target.type === "meta") encryptedMeta += 1;
    }

    for (const target of targets) {
      const deleted = await cleanupHelpers.tryDeleteFileWithRetries(target.filePath, 4);
      if (!deleted && fs.existsSync(target.filePath)) {
        pendingPlaintextDeletes += 1;
        cleanupHelpers.registerPendingFileCleanup(target.filePath);
        console.warn("[vault] failed to delete plaintext file, deferring cleanup:", target.filePath);
      }
    }
  } catch (err) {
    cleanupEncrypted();
    throw err;
  }

  return { encryptedImages, encryptedMeta, pendingPlaintextDeletes };
}

app.whenReady().then(async () => {
  ensureDirs();
  registerAppFileProtocol(session.defaultSession);
  settingsManager.applyNativeTheme(settingsManager.loadSettings().darkMode);

  const appIcon = nativeImage.createFromPath(APP_ICON_PATH);
  if (!appIcon.isEmpty() && app.dock?.setIcon) {
    app.dock.setIcon(appIcon);
  }

  await cleanupHelpers.runPendingCleanupSweep();
  await cleanupHelpers.runPendingFileCleanupSweep();
  await dl.recoverEncryptedTempData();
  createGalleryWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    void dl.cancelAllJobs();
  } catch {}
});
