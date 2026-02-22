const crypto = require("crypto");
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Menu,
  session,
  shell,
  protocol,
  nativeImage,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { createVaultManager } = require("./main/vault");
const {
  APP_ICON_PATH,
  LIBRARY_ROOT,
  DEFAULT_LIBRARY_ROOT,
  setLibraryRoot,
  BOOKMARKS_FILE,
  PENDING_CLEANUP_FILE,
  PENDING_FILE_CLEANUP_FILE,
  SETTINGS_FILE,
  SETTINGS_PLAINTEXT_FILE,
  BASIC_SETTINGS_FILE,
} = require("./main/app_paths");
const { delay, listFilesRecursive, listTempDirs } = require("./main/utils");
const { createSettingsManager } = require("./main/settings");
const { createCleanupHelpers } = require("./main/cleanup");
const {
  DIRECT_ENCRYPTION_VERSION,
  createDirectEncryptionHelpers,
} = require("./main/direct_encryption");
const { createLibraryIndex } = require("./main/library_index");
const { createDownloadManager } = require("./main/download_manager");
const { sanitizeAltDownloadPayload } = require("./main/browser_payloads");
const { createBookmarksStore } = require("./main/bookmarks_store");
const { getVaultPolicy, validateVaultPassphrase } = require("./main/vault_policy");
const {
  importLibraryCandidates,
  normalizeImportItemsPayload,
  scanImportRoot,
  scanSingleManga,
} = require("./main/importer");
const {
  sanitizeExportName,
  resolveUniquePath,
  mapExportResult,
  buildSelectedEntries,
} = require("./main/exporter");
const { createExportRuntime } = require("./main/export_runtime");
const { normalizeOpenPathResult } = require("./main/file_open");
const { registerMainIpcHandlers } = require("./main/ipc/register_main_ipc");
const { buildMainIpcContext } = require("./main/ipc/main_ipc_context");
const { createWindowRuntime } = require("./main/window_runtime");
const {
  isSameOrChildPath,
  migrateLibraryContentsBatched,
  migrateLibrarySupportFiles,
  resolveConfiguredLibraryRoot,
  scanLibraryContents,
  scanLibraryContentsAsync,
  validateWritableDirectory,
  validateWritableDirectoryAsync,
  isDirectoryEmpty,
  isDirectoryEmptyAsync,
} = require("./main/library_path");

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
  {
    scheme: "appblob",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: false,
    },
  },
]);

const UI_PARTITION = "nview-ui";
let windowRuntime = null;

const DEFAULT_SETTINGS = {
  startPage: "",
  blockPopups: true,
  allowListEnabled: true,
  allowListDomains: [
    "*.cloudflare.com",
  ],
  darkMode: false,
  defaultSort: "favorites",
  cardSize: "normal",
  libraryPath: "",
  reader: {
    windowedResidency: {
      enabled: true,
      hotRadius: 2,
      warmRadius: 8,
      maxResidentPages: 16,
      maxInflightLoads: 3,
      evictHysteresisMs: 2000,
      sweepIntervalMs: 7000,
      scrollVelocityPrefetchCutoff: 1.6,
    },
  },
};

const THUMB_CACHE_DIR = path.join(app.getPath("userData"), "thumb_cache");

function summarizeError(err) {
  return `${err?.name || "Error"}${err?.code ? `:${err.code}` : ""}`;
}
const THUMB_CACHE_VERSION = "thumb_v2";
const THUMB_CACHE_MAX_BYTES = 8 * 1024 * 1024;

const BOOKMARKS_REL_PATH = "bookmarks.json";
const SETTINGS_REL_PATH = "settings.json";

const DELETE_ON_FAIL = true;
const MIGRATION_CLEANUP_TTL_MS = 10 * 60 * 1000;
let pendingLibraryCleanup = null;

function issueLibraryCleanupToken(fromRoot, toRoot) {
  const token = crypto.randomBytes(16).toString("hex");
  pendingLibraryCleanup = {
    token,
    fromRoot: path.resolve(String(fromRoot || "")),
    toRoot: path.resolve(String(toRoot || "")),
    expiresAt: Date.now() + MIGRATION_CLEANUP_TTL_MS,
  };
  return token;
}

function consumeLibraryCleanupToken(expectedPath, token) {
  if (!pendingLibraryCleanup) return { ok: false, error: "No pending library cleanup authorization." };
  if (Date.now() > pendingLibraryCleanup.expiresAt) {
    pendingLibraryCleanup = null;
    return { ok: false, error: "Cleanup authorization expired. Please retry migration cleanup." };
  }
  const expected = path.resolve(String(expectedPath || ""));
  if (!expected || pendingLibraryCleanup.fromRoot !== expected) {
    return { ok: false, error: "Cleanup path is not authorized." };
  }
  if (String(token || "") !== pendingLibraryCleanup.token) {
    return { ok: false, error: "Invalid cleanup authorization token." };
  }
  const granted = pendingLibraryCleanup;
  pendingLibraryCleanup = null;
  return { ok: true, granted };
}

function isProtectedCleanupPath(candidatePath) {
  const target = path.resolve(String(candidatePath || ""));
  if (!target) return true;
  const root = path.parse(target).root;
  if (target === root) return true;
  const protectedPaths = [
    app.getPath("home"),
    app.getPath("userData"),
    app.getPath("appData"),
  ]
    .map((value) => path.resolve(String(value || "")))
    .filter(Boolean);
  return protectedPaths.includes(target);
}

function ensureDirs() {
  fs.mkdirSync(LIBRARY_ROOT(), { recursive: true });
}

function applyConfiguredLibraryRoot(configuredPath) {
  const fallbackRoot = DEFAULT_LIBRARY_ROOT();
  const previousRoot = LIBRARY_ROOT();
  const resolved = resolveConfiguredLibraryRoot(configuredPath, fallbackRoot);
  let warning = resolved.warning || "";

  const preferredValidation = validateWritableDirectory(resolved.preferredRoot);

  if (preferredValidation.ok) {
    setLibraryRoot(resolved.preferredRoot);
    const activeRoot = LIBRARY_ROOT();
    const migration = migrateLibrarySupportFiles({
      fromRoot: previousRoot,
      toRoot: activeRoot,
    });
    if (migration.errors.length) {
      console.warn("[library path] support file migration issues:", migration.errors);
    }
    if (resolved.warning) {
      console.warn("[library path]", resolved.warning, "Falling back to default library path.");
      return { activeRoot, usedFallback: true, warning: resolved.warning };
    }
    return { activeRoot, usedFallback: resolved.usedFallback, warning };
  }

  warning = warning || `Unable to use selected library path. ${preferredValidation.error}`;
  console.warn("[library path] unable to use configured path:", preferredValidation.error);

  const fallbackValidation = validateWritableDirectory(fallbackRoot);
  if (!fallbackValidation.ok) {
    console.warn("[library path] failed to ensure default path:", fallbackValidation.error);
  }
  setLibraryRoot(fallbackRoot);
  return { activeRoot: LIBRARY_ROOT(), usedFallback: true, warning };
}

const vaultManager = createVaultManager({ getLibraryRoot: LIBRARY_ROOT });
const settingsManager = createSettingsManager({
  settingsFile: SETTINGS_FILE(),
  settingsPlaintextFile: SETTINGS_PLAINTEXT_FILE(),
  basicSettingsFile: BASIC_SETTINGS_FILE(),
  settingsRelPath: SETTINGS_REL_PATH,
  defaultSettings: DEFAULT_SETTINGS,
  getWindows: () => {
    if (!windowRuntime) return [];
    return [windowRuntime.getGalleryWin(), windowRuntime.getDownloaderWin(), windowRuntime.getReaderWin(), windowRuntime.getBrowserWin()];
  },
  vaultManager,
});
applyConfiguredLibraryRoot(settingsManager.loadSettings().libraryPath);
const cleanupHelpers = createCleanupHelpers({
  pendingCleanupFile: PENDING_CLEANUP_FILE(),
  pendingFileCleanupFile: PENDING_FILE_CLEANUP_FILE(),
});

const { loadBookmarksFromDisk, persistBookmarksToDisk } = createBookmarksStore({
  vaultManager,
  bookmarksFile: BOOKMARKS_FILE,
  bookmarksRelPath: BOOKMARKS_REL_PATH,
  fs,
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
  const galleryWin = windowRuntime.getGalleryWin();
  if (galleryWin && !galleryWin.isDestroyed()) galleryWin.webContents.send(channel, payload);
}
function sendToDownloader(channel, payload) {
  const downloaderWin = windowRuntime.getDownloaderWin();
  if (downloaderWin && !downloaderWin.isDestroyed()) downloaderWin.webContents.send(channel, payload);
  if (channel === "dl:update" || channel === "dl:remove") {
    emitDownloadCount();
  }
}
function sendToBrowser(channel, payload) {
  const browserWin = windowRuntime.getBrowserWin();
  if (browserWin && !browserWin.isDestroyed()) browserWin.webContents.send(channel, payload);
}
function sendToReader(channel, payload) {
  const readerWin = windowRuntime.getReaderWin();
  if (readerWin && !readerWin.isDestroyed()) readerWin.webContents.send(channel, payload);
}

const dl = createDownloadManager({
  LIBRARY_ROOT,
  DELETE_ON_FAIL,
  ensureDirs,
  delay,
  listTempDirs,
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
  buildComicEntry,
});

function getInProgressDownloadCount() {
  const activeStatuses = new Set(["starting", "downloading", "finalizing", "moving", "cleaning"]);
  return dl.listJobs().filter((job) => activeStatuses.has(job.status)).length;
}

function emitDownloadCount() {
  sendToGallery("dl:activeCount", { count: getInProgressDownloadCount() });
}

function normalizeGalleryIdInput(value) {
  return normalizeGalleryId(value);
}

function findBookmarkByUrl(pageUrl) {
  const res = loadBookmarksFromDisk();
  if (!res.ok) return res;
  const entry = res.bookmarks.find((item) => item?.url === pageUrl);
  return { ok: true, bookmarks: res.bookmarks, entry: entry || null };
}

function addBookmarkForPage(pageUrl, title) {
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
}

function removeBookmarkById(bookmarkId) {
  const res = loadBookmarksFromDisk();
  if (!res.ok) return res;
  const next = Array.isArray(res.bookmarks)
    ? res.bookmarks.filter((item) => item?.id !== bookmarkId)
    : [];
  const writeRes = persistBookmarksToDisk(next);
  if (!writeRes.ok) return writeRes;
  return { ok: true, bookmarks: next };
}

function isUnderLibraryRoot(p) {
  const candidate = path.resolve(String(p || ""));
  if (!candidate) return false;
  return isSameOrChildPath(LIBRARY_ROOT(), candidate);
}

function getVaultRelPath(absPath) {
  return path
    .relative(LIBRARY_ROOT(), absPath)
    .replaceAll("\\", "/");
}

function ensureThumbCacheDir() {
  return fsp.mkdir(THUMB_CACHE_DIR, { recursive: true });
}

async function resolveThumbCacheKeyPayload(payload = {}) {
  const sourcePath = path.resolve(String(payload?.sourcePath || ""));
  if (!sourcePath || !isUnderLibraryRoot(sourcePath) || !isImagePath(sourcePath)) {
    return { ok: false, error: "Invalid sourcePath" };
  }

  const profile = {
    version: String(payload?.version || THUMB_CACHE_VERSION),
    width: Math.max(1, Math.min(2048, Math.round(Number(payload?.width || 0)))),
    height: Math.max(1, Math.min(2048, Math.round(Number(payload?.height || 0)))),
    mimeType: String(payload?.mimeType || "image/jpeg").toLowerCase(),
    quality: Math.max(0, Math.min(1, Number(payload?.quality ?? 0.85))),
  };
  if (!profile.width || !profile.height) {
    return { ok: false, error: "Invalid profile dimensions" };
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(profile.mimeType)) {
    return { ok: false, error: "Invalid profile mimeType" };
  }

  const encryptedPath = `${sourcePath}.enc`;

  let stat;
  try {
    stat = await fsp.stat(encryptedPath);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { ok: false, error: "Not found", status: 404 };
    }
    console.warn("[thumbnail-cache] failed to stat encrypted source", summarizeError(err));
    return { ok: false, error: "Failed to build cache key", status: 500 };
  }

  const keyMaterial = JSON.stringify({
    sourcePath,
    sourceEncryptedMtimeMs: Math.round(stat.mtimeMs || 0),
    sourceEncryptedSize: Number(stat.size || 0),
    profile,
  });
  const cacheKey = crypto.createHash("sha256").update(keyMaterial).digest("hex");
  const shardA = cacheKey.slice(0, 2);
  const shardB = cacheKey.slice(2, 4);
  const cachePath = path.join(THUMB_CACHE_DIR, shardA, shardB, `${cacheKey}.enc`);
  const cacheRelPath = `thumb_cache/${cacheKey}`;
  return {
    ok: true,
    sourcePath,
    profile,
    cachePath,
    cacheRelPath,
  };
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
        const languagesContainer = findContainer("Languages:");
        const pagesContainer = findContainer("Pages:");
        const uploadTimeEl = Array.from(document.querySelectorAll("time[datetime]")).find((timeEl) => {
          const containerText = txt(timeEl.closest(".tag-container, .field-name"));
          return containerText.toLowerCase().includes("uploaded:");
        });
        const publishedAtRaw = uploadTimeEl?.getAttribute("datetime") || "";
        const publishedAtDate = publishedAtRaw ? new Date(publishedAtRaw) : null;
        const publishedAt =
          publishedAtDate && Number.isFinite(publishedAtDate.getTime())
            ? publishedAtDate.toISOString()
            : null;

        const tags = namesFrom(tagsContainer);
        const artists = namesFrom(artistsContainer);
        const languages = namesFrom(languagesContainer);

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
          languages,
          pages: Number.isFinite(pagesNum) ? pagesNum : null,
          publishedAt,
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




windowRuntime = createWindowRuntime({
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
  appRootDir: __dirname,
});

const {
  createGalleryWindow,
  ensureGalleryWindow,
  ensureDownloaderWindow,
  ensureImporterWindow,
  ensureExporterWindow,
  ensureReaderWindow,
  ensureBrowserWindow,
  getGalleryWin,
  getBrowserWin,
  getBrowserView,
  getDownloaderWin,
  getImporterWin,
  getExporterWin,
  getReaderWin,
  getBrowserSidePanelWidth,
  setBrowserSidePanelWidth,
  getWebContentsRole,
} = windowRuntime;

const {
  listLibraryEntriesForExport,
  estimateExportBytes,
  exportSingleManga,
} = createExportRuntime({
  fs,
  path,
  LIBRARY_ROOT,
  buildComicEntry,
  listEncryptedImagesRecursiveSorted,
  summarizeError,
  resolveUniquePath,
  sanitizeExportName,
  getVaultRelPath,
  vaultManager,
});

const mainIpcContext = buildMainIpcContext({
  ipcMain,
  settingsManager,
  ensureBrowserWindow,
  ensureDownloaderWindow,
  emitDownloadCount,
  ensureImporterWindow,
  ensureExporterWindow,
  ensureReaderWindow,
  ensureGalleryWindow,
  getGalleryWin,
  getReaderWin,
  sendToGallery,
  sendToReader,
  getBrowserView,
  getBrowserWin,
  sanitizeAltDownloadPayload,
  dl,
  sendToDownloader,
  LIBRARY_ROOT,
  DEFAULT_LIBRARY_ROOT,
  resolveConfiguredLibraryRoot,
  validateWritableDirectory,
  validateWritableDirectoryAsync,
  isDirectoryEmpty,
  isDirectoryEmptyAsync,
  isSameOrChildPath,
  migrateLibraryContentsBatched,
  issueLibraryCleanupToken,
  applyConfiguredLibraryRoot,
  sendToBrowser,
  scanLibraryContents,
  scanLibraryContentsAsync,
  dialog,
  getDownloaderWin,
  isProtectedCleanupPath,
  consumeLibraryCleanupToken,
  cleanupHelpers,
  getVaultPolicy,
  validateVaultPassphrase,
  vaultManager,
  encryptLibraryForVault,
  shell,
  loadBookmarksFromDisk,
  addBookmarkForPage,
  removeBookmarkById,
  getInProgressDownloadCount,
  ensureDirs,
  isUnderLibraryRoot,
  normalizeOpenPathResult,
  fs,
  path,
  buildComicEntry,
  scanImportRoot,
  scanSingleManga,
  normalizeImportItemsPayload,
  importLibraryCandidates,
  getVaultRelPath,
  movePlainDirectImagesToVault,
  normalizeGalleryId,
  normalizeTagsInput,
  writeLibraryIndexEntry,
  getExporterWin,
  getImporterWin,
  buildSelectedEntries,
  listLibraryEntriesForExport,
  estimateExportBytes,
  mapExportResult,
  exportSingleManga,
  loadLibraryIndexCache,
  readLibraryIndexEntry,
  listEncryptedImagesRecursiveSorted,
  deleteLibraryIndexEntry,
  nativeImage,
  ensureThumbCacheDir,
  resolveThumbCacheKeyPayload,
  normalizeGalleryIdInput,
  app,
  THUMB_CACHE_MAX_BYTES,
  getBrowserSidePanelWidth,
  setBrowserSidePanelWidth,
  listFilesRecursive,
  getWebContentsRole,
});
registerMainIpcHandlers(mainIpcContext);

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
  const cleanupEncrypted = async () => {
    for (const tempPath of tempPaths) {
      try {
        await fsp.unlink(tempPath);
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        console.warn("[vault] failed to cleanup temp encrypted file:", tempPath, String(err));
      }
    }
    for (const encPath of encryptedPaths) {
      try {
        await fsp.unlink(encPath);
      } catch (err) {
        if (err?.code === "ENOENT") continue;
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
      await fsp.rename(tempPath, encryptedPath);
      encryptedPaths.push(encryptedPath);
      if (target.type === "image") encryptedImages += 1;
      if (target.type === "meta") encryptedMeta += 1;
    }

    for (const target of targets) {
      const deleted = await cleanupHelpers.tryDeleteFileWithRetries(target.filePath, 4);
      let stillExists = false;
      try {
        await fsp.access(target.filePath, fs.constants.F_OK);
        stillExists = true;
      } catch (err) {
        // File is already absent or inaccessible; keep cleanup best-effort.
        stillExists = false;
        console.warn("[vault] unable to verify plaintext delete", summarizeError(err));
      }
      if (!deleted && stillExists) {
        pendingPlaintextDeletes += 1;
        cleanupHelpers.registerPendingFileCleanup(target.filePath);
        console.warn("[vault] failed to delete plaintext file, deferring cleanup:", target.filePath);
      }
    }
  } catch (err) {
    await cleanupEncrypted();
    throw err;
  }

  return { encryptedImages, encryptedMeta, pendingPlaintextDeletes };
}

app.whenReady().then(async () => {
  ensureDirs();
  windowRuntime.initializeUiSession();
  settingsManager.applyNativeTheme(settingsManager.getSettings().darkMode);

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
  } catch (err) {
    console.warn("[app] before-quit cleanup scheduling failed", summarizeError(err));
  }
});
