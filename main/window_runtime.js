const { Readable } = require("stream");
const { canGoBack, canGoForward } = require("./navigation_history_compat");
const { ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING } = require("../shared/dev_mode");
const { resolveSourceAdapterForStartPage, getSourceAdapterById } = require("../preload/source_adapters/registry");

function createWindowRuntime(deps) {
  const {
    app,
    BrowserWindow,
    BrowserView,
    Menu,
    session,
    path,
    fs,
    fsp,
    APP_ICON_PATH,
    UI_PARTITION,
    LIBRARY_ROOT,
    vaultManager,
    isImagePath,
    getVaultRelPath,
    dl,
    settingsManager,
    summarizeError,
    ensureDirs,
    confirmCloseWithActiveVaultDownloads,
    sendToBrowser,
    findBookmarkByUrl,
    addBookmarkForPage,
    removeBookmarkById,
    appRootDir,
  } = deps;
  const preloadBundleDir = path.join(appRootDir, "preload-dist");

  function preloadScriptPath(name) {
    return path.join(preloadBundleDir, name);
  }

  function logDirectDownloadPreloadDiagnostic(label, preloadPath) {
    if (!ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING) return;
    let exists = false;
    let mtime = null;
    let size = null;
    let error = null;
    try {
      exists = fs.existsSync(preloadPath);
      if (exists) {
        const stats = fs.statSync(preloadPath);
        mtime = stats?.mtime ? stats.mtime.toISOString() : null;
        size = Number.isFinite(stats?.size) ? stats.size : null;
      }
    } catch (err) {
      error = String(err);
    }
    console.log("[direct-download][main] preload:resolved", {
      label,
      path: preloadPath,
      exists,
      mtime,
      size,
      error,
    });
  }

  let galleryWin;
  let browserWin;
  let browserView;
  let downloaderWin;
  let importerWin;
  let exporterWin;
  let readerWin;
  let browserSidePanelWidth = 0;
  let browserSession;
  let browserPartition;
  let uiSession;
  let allowAppClose = false;
  const webContentsRoles = new Map();

  function assignWebContentsRole(contents, role) {
    if (!contents || typeof contents.id !== "number") return;
    const normalizedRole = String(role || "").trim() || "unknown";
    webContentsRoles.set(contents.id, normalizedRole);
    contents.once("destroyed", () => {
      webContentsRoles.delete(contents.id);
    });
  }

  function getWebContentsRole(webContentsId) {
    return webContentsRoles.get(Number(webContentsId)) || "unknown";
  }

  function resolveRealPath(p) {
    try {
      return fs.realpathSync(p);
    } catch {
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

  function noStoreHeaders(contentType) {
    return {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    };
  }

  function textNoStoreResponse(statusCode, message) {
    return {
      statusCode,
      headers: noStoreHeaders("text/plain; charset=utf-8"),
      data: Readable.from(message),
    };
  }

  async function clearSessionData(sessionToClear, label) {
    if (!sessionToClear) return;
    try {
      await sessionToClear.clearCache();
    } catch (err) {
      console.warn(`[${label}] failed to clear cache:`, String(err));
    }
    try {
      await sessionToClear.clearStorageData();
    } catch (err) {
      console.warn(`[${label}] failed to clear storage:`, String(err));
    }
  }

  function registerAppFileProtocol(targetSession) {
    targetSession.protocol.registerStreamProtocol("appfile", (request, callback) => {
      void (async () => {
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
            return callback(textNoStoreResponse(403, "Forbidden"));
          }

          if (resolved.toLowerCase().endsWith(".enc")) return callback(textNoStoreResponse(403, "Forbidden"));

          const vaultEnabled = vaultManager.isInitialized();
          const isMetadataRequest = path.basename(resolved) === "metadata.json";
          const needsVault = isImagePath(resolved) || isMetadataRequest;

          if (needsVault && !vaultEnabled) return callback(textNoStoreResponse(401, "Vault required"));
          if (needsVault && !vaultManager.isUnlocked()) return callback(textNoStoreResponse(401, "Vault locked"));

          if (needsVault) {
            const encryptedPath = `${resolved}.enc`;
            let decryptedStream;
            try {
              await fsp.access(encryptedPath, fs.constants.F_OK);
              decryptedStream = vaultManager.decryptFileToStream({
                relPath: getVaultRelPath(resolved),
                inputPath: encryptedPath,
              });
            } catch (err) {
              if (err?.code === "ENOENT") {
                console.warn("[appfile] not found:", { encryptedPath, url: request.url });
                return callback(textNoStoreResponse(404, "Not found"));
              }
              console.warn("[appfile] decrypt failed:", String(err), { encryptedPath });
              return callback(textNoStoreResponse(500, "Decrypt error"));
            }

            decryptedStream.on("error", (err) => {
              console.warn("[appfile] decrypt stream failed:", String(err), { encryptedPath });
            });

            return callback({ statusCode: 200, headers: noStoreHeaders(mimeForFile(resolved)), data: decryptedStream });
          }

          const stream = fs.createReadStream(resolved);
          stream.on("error", (err) => {
            if (err?.code === "ENOENT") {
              callback(textNoStoreResponse(404, "Not found"));
              return;
            }
            console.warn("[appfile] stream error:", String(err), { resolved });
            callback(textNoStoreResponse(500, "Stream error"));
          });

          callback({ statusCode: 200, headers: noStoreHeaders(mimeForFile(resolved)), data: stream });
        } catch (err) {
          console.warn("[appfile] handler error:", String(err), { url: request.url });
          callback(textNoStoreResponse(500, "Handler error"));
        }
      })();
    });
  }

  function registerAppBlobProtocol(targetSession) {
    targetSession.protocol.registerStreamProtocol("appblob", (request, callback) => {
      void (async () => {
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
            console.warn("[appblob] blocked:", { resolved, libRoot, url: request.url });
            return callback(textNoStoreResponse(403, "Forbidden"));
          }

          if (!isImagePath(resolved)) return callback(textNoStoreResponse(403, "Forbidden"));
          if (!vaultManager.isInitialized()) return callback(textNoStoreResponse(401, "Vault required"));
          if (!vaultManager.isUnlocked()) return callback(textNoStoreResponse(401, "Vault locked"));

          const encryptedPath = `${resolved}.enc`;
          let decryptedStream;
          try {
            await fsp.access(encryptedPath, fs.constants.F_OK);
            decryptedStream = vaultManager.decryptFileToStream({
              relPath: getVaultRelPath(resolved),
              inputPath: encryptedPath,
            });
          } catch (err) {
            if (err?.code === "ENOENT") {
              console.warn("[appblob] not found:", { encryptedPath, url: request.url });
              return callback(textNoStoreResponse(404, "Not found"));
            }
            console.warn("[appblob] decrypt failed:", String(err), { encryptedPath });
            return callback(textNoStoreResponse(500, "Decrypt error"));
          }

          decryptedStream.on("error", (err) => {
            console.warn("[appblob] decrypt stream failed:", String(err), { encryptedPath });
          });

          return callback({ statusCode: 200, headers: noStoreHeaders(mimeForFile(resolved)), data: decryptedStream });
        } catch (err) {
          console.warn("[appblob] handler error:", String(err), { url: request.url });
          return callback(textNoStoreResponse(500, "Handler error"));
        }
      })();
    });
  }

  function registerAppFileProtocolBlocklist(targetSession) {
    targetSession.protocol.registerStreamProtocol("appfile", (request, callback) => {
      console.warn("[appfile] blocked by session policy:", { url: request.url });
      callback({ statusCode: 403, headers: { "Content-Type": "text/plain; charset=utf-8" }, data: Readable.from("Forbidden") });
    });
  }

  function registerAppBlobProtocolBlocklist(targetSession) {
    targetSession.protocol.registerStreamProtocol("appblob", (request, callback) => {
      console.warn("[appblob] blocked by session policy:", { url: request.url });
      callback(textNoStoreResponse(403, "Forbidden"));
    });
  }

  function closeAuxWindows() {
    if (downloaderWin && !downloaderWin.isDestroyed()) downloaderWin.close();
    if (importerWin && !importerWin.isDestroyed()) importerWin.close();
    if (exporterWin && !exporterWin.isDestroyed()) exporterWin.close();
    if (readerWin && !readerWin.isDestroyed()) readerWin.close();
    if (browserWin && !browserWin.isDestroyed()) browserWin.close();
  }

  function attachUiNavigationGuards(targetWindow, label) {
    if (!targetWindow || targetWindow.isDestroyed()) return;
    const allowedProtocols = new Set(["file:", "appfile:", "appblob:", "about:"]);
    targetWindow.webContents.on("will-navigate", (event, url) => {
      let protocol = "";
      try {
        protocol = new URL(url).protocol;
      } catch {
        protocol = "";
      }
      if (!allowedProtocols.has(protocol)) {
        console.warn(`[${label}] navigation blocked:`, url);
        event.preventDefault();
      }
    });
    targetWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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
        preload: preloadScriptPath("preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: UI_PARTITION,
      },
    });
    galleryWin.loadFile(path.join(appRootDir, "windows", "index.html"));
    assignWebContentsRole(galleryWin.webContents, "gallery");
    attachUiNavigationGuards(galleryWin, "gallery");
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
      void clearSessionData(uiSession, "ui-session");
    });
  }

  function ensureGalleryWindow() {
    if (galleryWin && !galleryWin.isDestroyed()) {
      return galleryWin;
    }
    createGalleryWindow();
    return galleryWin;
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
        preload: preloadScriptPath("downloader_preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: UI_PARTITION,
      },
    });

    downloaderWin.loadFile(path.join(appRootDir, "windows", "downloader.html"));
    assignWebContentsRole(downloaderWin.webContents, "downloader");
    attachUiNavigationGuards(downloaderWin, "downloader");
    downloaderWin.on("closed", () => (downloaderWin = null));
  }

  function ensureImporterWindow() {
    if (importerWin && !importerWin.isDestroyed()) {
      importerWin.focus();
      return;
    }

    importerWin = new BrowserWindow({
      width: 1100,
      height: 760,
      title: "Import manga",
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadScriptPath("importer_preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: UI_PARTITION,
      },
    });

    importerWin.loadFile(path.join(appRootDir, "windows", "importer.html"));
    assignWebContentsRole(importerWin.webContents, "importer");
    attachUiNavigationGuards(importerWin, "importer");
    importerWin.on("closed", () => (importerWin = null));
  }

  function ensureExporterWindow() {
    if (exporterWin && !exporterWin.isDestroyed()) {
      exporterWin.focus();
      return;
    }

    exporterWin = new BrowserWindow({
      width: 1100,
      height: 760,
      title: "Export manga",
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadScriptPath("exporter_preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: UI_PARTITION,
      },
    });

    exporterWin.loadFile(path.join(appRootDir, "windows", "exporter.html"));
    assignWebContentsRole(exporterWin.webContents, "exporter");
    attachUiNavigationGuards(exporterWin, "exporter");
    exporterWin.on("closed", () => (exporterWin = null));
  }

  function ensureBrowserWindow(initialUrl = "https://example.com") {
    if (browserWin && !browserWin.isDestroyed()) {
      browserWin.focus();
      if (browserView) browserView.webContents.loadURL(initialUrl).catch((err) => {
        console.warn("[browser] failed loading URL in existing browser view", summarizeError(err));
      });
      return;
    }

    browserPartition = `temp:nviewer-incognito-${Date.now()}`;
    browserSession = session.fromPartition(browserPartition, { cache: false });
    registerAppFileProtocolBlocklist(browserSession);
    registerAppBlobProtocolBlocklist(browserSession);
    browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    browserSession.setPermissionCheckHandler(() => false);

    const browserUiPreloadPath = preloadScriptPath("browser_preload.js");
    const browserViewPreloadPath = preloadScriptPath("browser_view_preload.js");
    logDirectDownloadPreloadDiagnostic("browser-ui", browserUiPreloadPath);
    logDirectDownloadPreloadDiagnostic("browser-view", browserViewPreloadPath);

    browserWin = new BrowserWindow({
      width: 1200,
      height: 800,
      title: "Web Viewer",
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: browserUiPreloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: UI_PARTITION,
      },
    });

    browserWin.loadFile(path.join(appRootDir, "windows", "browser.html"));
    assignWebContentsRole(browserWin.webContents, "browser-ui");
    attachUiNavigationGuards(browserWin, "browser");

    browserView = new BrowserView({
      webPreferences: {
        preload: browserViewPreloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: browserPartition,
      },
    });
    assignWebContentsRole(browserView.webContents, "browser-view");

    const normalizeAllowListDomains = (value) => {
      const list = Array.isArray(value) ? value : [];
      const normalized = [];
      for (const entry of list) {
        const next = String(entry || "").trim().toLowerCase();
        if (!next || normalized.includes(next)) continue;
        normalized.push(next);
      }
      return normalized;
    };

    const getStartPageHostVariants = (startPageUrl) => {
      if (!startPageUrl) return [];
      let startHost = "";
      try {
        startHost = new URL(startPageUrl).hostname.toLowerCase();
      } catch {
        startHost = "";
      }
      if (!startHost) return [];
      const variants = [startHost];
      if (startHost.includes(".")) variants.push(`*.${startHost}`);
      return variants;
    };

    const getAllowListDomains = ({ settings, sourceId, currentUrl }) => {
      const sourceAdapterDomains = settings?.allowListDomainsBySourceAdapter
        && typeof settings.allowListDomainsBySourceAdapter === "object"
        ? settings.allowListDomainsBySourceAdapter
        : {};
      const hasConfigured = Object.prototype.hasOwnProperty.call(sourceAdapterDomains, sourceId);
      const configured = normalizeAllowListDomains(sourceAdapterDomains[sourceId]);
      const adapter = getSourceAdapterById(sourceId) || resolveSourceAdapterForStartPage(currentUrl);
      const defaults = hasConfigured ? [] : normalizeAllowListDomains(adapter?.defaultAllowedDomains);
      const sourceAdapterUrls = settings?.sourceAdapterUrls && typeof settings.sourceAdapterUrls === "object"
        ? settings.sourceAdapterUrls
        : {};
      const startHostVariants = getStartPageHostVariants(sourceAdapterUrls[sourceId] || currentUrl);
      return Array.from(new Set([...startHostVariants, ...defaults, ...configured]));
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

    const resolveActiveSourceId = (url) => {
      const resolved = resolveSourceAdapterForStartPage(url);
      return String(resolved?.sourceId || "").trim();
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
      const currentTopUrl = String(browserView?.webContents?.getURL?.() || "").trim();
      const sourceId = resolveActiveSourceId(url) || resolveActiveSourceId(currentTopUrl);
      if (!sourceId) return false;
      const domains = getAllowListDomains({
        settings,
        sourceId,
        currentUrl: url || currentTopUrl,
      });
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

    const publishNavigationState = () => {
      if (!browserWin || browserWin.isDestroyed() || !browserView) return;
      const contents = browserView.webContents;
      sendToBrowser("browser:navigation-state", {
        canGoBack: canGoBack(contents),
        canGoForward: canGoForward(contents),
      });
    };

    browserView.webContents.on("did-navigate", (_event, url) => {
      publishBrowserUrl(url);
      publishNavigationState();
    });
    browserView.webContents.on("did-navigate-in-page", (_event, url) => {
      publishBrowserUrl(url);
      publishNavigationState();
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
        browserView.webContents.loadURL(targetUrl).catch((err) => {
          console.warn("[browser] failed reloading after cache miss", summarizeError(err));
        });
      }, 0);
    };
    browserView.webContents.on("did-fail-load", handleCacheMiss);
    browserView.webContents.on("did-fail-provisional-load", handleCacheMiss);
    browserView.webContents.on("did-finish-load", () => {
      publishBrowserUrl();
      publishNavigationState();
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
      const contents = browserView.webContents;
      if (command === "browser-backward" && canGoBack(contents)) {
        browserView.webContents.goBack();
      }
      if (command === "browser-forward" && canGoForward(contents)) {
        browserView.webContents.goForward();
      }
      publishNavigationState();
    });

    browserView.webContents.on("did-start-navigation", () => {
      publishNavigationState();
    });

    publishNavigationState();

    browserView.webContents.on("context-menu", () => {
      if (!browserView || browserView.webContents.isDestroyed()) return;
      const contents = browserView.webContents;
      const pageUrl = String(contents.getURL() || "").trim();
      const bookmarkInfo = pageUrl ? findBookmarkByUrl(pageUrl) : { ok: false };
      const isBookmarked = Boolean(bookmarkInfo?.ok && bookmarkInfo.entry);
      const bookmarkId = bookmarkInfo?.entry?.id || null;
      const canToggleBookmark = Boolean(pageUrl) && Boolean(bookmarkInfo?.ok);
      const menu = Menu.buildFromTemplate([
        {
          label: "Go back",
          enabled: canGoBack(contents),
          click: () => {
            if (canGoBack(contents)) contents.goBack();
            publishNavigationState();
          },
        },
        {
          label: "Go forward",
          enabled: canGoForward(contents),
          click: () => {
            if (canGoForward(contents)) contents.goForward();
            publishNavigationState();
          },
        },
        { type: "separator" },
        {
          label: "Refresh page",
          click: () => {
            contents.reload();
          },
        },
        {
          label: isBookmarked ? "Remove bookmark" : "Add bookmark",
          enabled: canToggleBookmark,
          click: () => {
            let res = { ok: false };
            if (isBookmarked && bookmarkId) {
              res = removeBookmarkById(bookmarkId);
            } else if (pageUrl) {
              const title = String(contents.getTitle() || "").trim() || pageUrl;
              res = addBookmarkForPage(pageUrl, title);
            }
            if (res?.ok) {
              sendToBrowser("browser:bookmarks-updated", { bookmarks: res.bookmarks || [] });
            }
          },
        },
      ]);

      menu.popup({ window: browserWin });
    });

    browserView.webContents.loadURL(initialUrl).catch((err) => {
      console.warn("[browser] initial load failed", summarizeError(err));
    });

    browserWin.on("closed", () => {
      const sessionToClear = browserSession;
      browserWin = null;
      browserView = null;
      browserSidePanelWidth = 0;
      browserSession = null;
      browserPartition = null;
      void clearSessionData(sessionToClear, "browser-session");
    });
  }

  function ensureReaderWindow() {
    if (readerWin && !readerWin.isDestroyed()) {
      readerWin.focus();
      return readerWin;
    }

    readerWin = new BrowserWindow({
      width: 1100,
      height: 780,
      title: "Reader",
      icon: APP_ICON_PATH,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadScriptPath("reader_preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: UI_PARTITION,
      },
    });

    readerWin.loadFile(path.join(appRootDir, "windows", "reader.html"));
    assignWebContentsRole(readerWin.webContents, "reader");
    attachUiNavigationGuards(readerWin, "reader");
    readerWin.on("closed", () => (readerWin = null));
    return readerWin;
  }

  function initializeUiSession() {
    uiSession = session.fromPartition(UI_PARTITION);
    registerAppFileProtocol(uiSession);
    registerAppBlobProtocol(uiSession);
  }

  return {
    initializeUiSession,
    createGalleryWindow,
    ensureGalleryWindow,
    ensureDownloaderWindow,
    ensureImporterWindow,
    ensureExporterWindow,
    ensureReaderWindow,
    ensureBrowserWindow,
    getGalleryWin: () => galleryWin,
    getBrowserWin: () => browserWin,
    getBrowserView: () => browserView,
    getDownloaderWin: () => downloaderWin,
    getImporterWin: () => importerWin,
    getExporterWin: () => exporterWin,
    getReaderWin: () => readerWin,
    getBrowserSidePanelWidth: () => browserSidePanelWidth,
    setBrowserSidePanelWidth: (value) => {
      browserSidePanelWidth = value;
    },
    getWebContentsRole,
  };
}

module.exports = {
  createWindowRuntime,
};
