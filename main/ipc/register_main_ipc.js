const registerUiIpcHandlers = require("./register_ui_ipc").registerUiIpcHandlers;
const registerSettingsLibraryIpcHandlers = require("./register_settings_library_ipc").registerSettingsLibraryIpcHandlers;
const registerVaultBrowserIpcHandlers = require("./register_vault_browser_ipc").registerVaultBrowserIpcHandlers;
const registerDownloadsFilesIpcHandlers = require("./register_downloads_files_ipc").registerDownloadsFilesIpcHandlers;
const registerImporterIpcHandlers = require("./register_importer_ipc").registerImporterIpcHandlers;
const registerExporterIpcHandlers = require("./register_exporter_ipc").registerExporterIpcHandlers;
const registerLibraryContentIpcHandlers = require("./register_library_content_ipc").registerLibraryContentIpcHandlers;
const { createIpcSenderAuthorizer } = require("./ipc_sender_auth");

const UI_ROLES = Object.freeze(["gallery", "downloader", "importer", "exporter", "reader", "browser-ui"]);
const UI_AND_BROWSER_VIEW_ROLES = Object.freeze(["gallery", "downloader", "importer", "exporter", "reader", "browser-ui", "browser-view"]);

const MODULE_CHANNEL_ALLOWED_ROLES = Object.freeze({
  ui: Object.freeze({
    "ui:openBrowser": UI_ROLES,
    "ui:openDownloader": UI_ROLES,
    "ui:getVersion": ["gallery"],
    "ui:logPerfEvent": ["gallery"],
    "ui:openImporter": UI_ROLES,
    "ui:openExporter": UI_ROLES,
    "ui:openReader": ["gallery", "downloader"],
    "ui:openComicViewer": ["downloader"],
    "ui:syncOpenComics": ["reader"],
    "browser:altDownload": ["browser-view"],
  }),
  "settings/library": Object.freeze({
    "settings:get": UI_AND_BROWSER_VIEW_ROLES,
    "settings:update": ["gallery"],
    "library:pathInfo": ["gallery"],
    "library:currentStats": ["gallery"],
    "library:choosePath": ["gallery"],
    "library:estimateMove": ["gallery"],
    "library:validateMoveTarget": ["gallery"],
    "library:cleanupOldPath": ["gallery"],
  }),
  "vault/browser": Object.freeze({
    "vault:status": ["gallery"],
    "vault:getPolicy": ["gallery"],
    "vault:enable": ["gallery"],
    "vault:unlock": ["gallery"],
    "vault:lock": ["gallery"],
    "browser:navigate": ["browser-ui"],
    "browser:back": ["browser-ui"],
    "browser:forward": ["browser-ui"],
    "browser:navigationState": ["browser-ui"],
    "browser:reload": ["browser-ui"],
    "browser:setSidePanelWidth": ["browser-ui"],
    "browser:close": ["browser-ui"],
    "browser:bookmarks:list": ["browser-ui"],
    "browser:bookmark:add": ["browser-ui"],
    "browser:bookmark:remove": ["browser-ui"],
  }),
  "downloads/files": Object.freeze({
    "dl:list": ["downloader"],
    "dl:activeCount": ["gallery"],
    "dl:cancel": ["downloader"],
    "dl:remove": ["downloader"],
    "dl:stop": ["downloader"],
    "dl:start": ["downloader"],
    "dl:clearCompleted": ["downloader"],
    "files:open": ["gallery", "downloader"],
    "files:showInFolder": ["gallery", "downloader", "reader"],
    "library:listAll": ["gallery", "reader", "browser-ui", "exporter"],
  }),
  importer: Object.freeze({
    "importer:chooseRoot": ["importer"],
    "importer:scanRoot": ["importer"],
    "importer:scanSingleManga": ["importer"],
    "importer:getMetadataSuggestions": ["importer"],
    "importer:run": ["importer"],
  }),
  exporter: Object.freeze({
    "exporter:chooseDestination": ["exporter"],
    "exporter:checkDestination": ["exporter"],
    "exporter:run": ["exporter"],
  }),
  "library/content": Object.freeze({
    "library:lookupGalleryId": ["browser-view"],
    "library:listComicPages": ["gallery", "reader"],
    "library:getCoverThumbnail": ["gallery"],
    "thumbnailCache:get": ["gallery", "exporter"],
    "thumbnailCache:put": ["gallery", "exporter"],
    "library:toggleFavorite": ["gallery", "reader"],
    "library:updateComicMeta": ["gallery", "reader"],
    "library:deleteComic": ["gallery", "reader"],
    "library:listLatest": ["gallery"],
  }),
});

const UI_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "settingsManager", "ensureBrowserWindow", "ensureDownloaderWindow", "emitDownloadCount", "ensureImporterWindow", "ensureExporterWindow", "ensureReaderWindow", "ensureGalleryWindow", "getGalleryWin", "sendToGallery", "sendToReader", "getBrowserView", "getBrowserWin", "sanitizeAltDownloadPayload", "dl", "sendToDownloader", "app",
]);
const SETTINGS_LIBRARY_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "settingsManager", "dl", "LIBRARY_ROOT", "DEFAULT_LIBRARY_ROOT", "resolveConfiguredLibraryRoot", "validateWritableDirectory", "validateWritableDirectoryAsync", "isDirectoryEmpty", "isDirectoryEmptyAsync", "isSameOrChildPath", "migrateLibraryContentsBatched", "issueLibraryCleanupToken", "applyConfiguredLibraryRoot", "sendToGallery", "sendToDownloader", "sendToBrowser", "sendToReader", "scanLibraryContents", "scanLibraryContentsAsync", "dialog", "getGalleryWin", "getBrowserWin", "getDownloaderWin", "isProtectedCleanupPath", "consumeLibraryCleanupToken", "cleanupHelpers", "fs", "path", "shell",
]);
const VAULT_BROWSER_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "vaultManager", "getVaultPolicy", "validateVaultPassphrase", "encryptLibraryForVault", "sendToGallery", "sendToDownloader", "sendToBrowser", "ensureBrowserWindow", "getBrowserView", "getBrowserWin", "shell", "loadBookmarksFromDisk", "addBookmarkForPage", "removeBookmarkById", "getBrowserSidePanelWidth", "setBrowserSidePanelWidth", "dl", "settingsManager", "applyConfiguredLibraryRoot", "fs",
]);
const DOWNLOADS_FILES_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "dl", "getInProgressDownloadCount", "shell", "ensureDirs", "LIBRARY_ROOT", "vaultManager", "fs", "path", "isUnderLibraryRoot", "normalizeOpenPathResult", "buildComicEntry",
]);
const IMPORTER_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "dialog", "getImporterWin", "getGalleryWin", "getBrowserWin", "getDownloaderWin", "scanImportRoot", "scanSingleManga", "normalizeImportItemsPayload", "importLibraryCandidates", "sendToGallery", "ensureDirs", "vaultManager", "fs", "LIBRARY_ROOT", "path", "buildComicEntry", "getVaultRelPath", "movePlainDirectImagesToVault", "normalizeGalleryId", "writeLibraryIndexEntry",
]);
const EXPORTER_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "dialog", "getExporterWin", "getGalleryWin", "getBrowserWin", "getDownloaderWin", "fs", "path", "LIBRARY_ROOT", "buildSelectedEntries", "listLibraryEntriesForExport", "estimateExportBytes", "mapExportResult", "exportSingleManga", "validateWritableDirectory", "isDirectoryEmpty", "ensureDirs", "vaultManager",
]);
const LIBRARY_CONTENT_CONTEXT_KEYS = Object.freeze([
  "ipcMain", "ensureDirs", "normalizeGalleryIdInput", "loadLibraryIndexCache", "normalizeGalleryId", "readLibraryIndexEntry", "buildComicEntry", "fs", "path", "vaultManager", "listEncryptedImagesRecursiveSorted", "nativeImage", "ensureThumbCacheDir", "resolveThumbCacheKeyPayload", "app", "THUMB_CACHE_MAX_BYTES", "getVaultRelPath", "movePlainDirectImagesToVault", "isUnderLibraryRoot", "normalizeTagsInput", "writeLibraryIndexEntry", "cleanupHelpers", "deleteLibraryIndexEntry", "sendToGallery", "sendToReader", "LIBRARY_ROOT", "listFilesRecursive",
]);

const MAIN_IPC_REQUIRED_CONTEXT_KEYS = Object.freeze(Array.from(new Set([
  ...UI_CONTEXT_KEYS,
  ...SETTINGS_LIBRARY_CONTEXT_KEYS,
  ...VAULT_BROWSER_CONTEXT_KEYS,
  ...DOWNLOADS_FILES_CONTEXT_KEYS,
  ...IMPORTER_CONTEXT_KEYS,
  ...EXPORTER_CONTEXT_KEYS,
  ...LIBRARY_CONTENT_CONTEXT_KEYS,
  "getWebContentsRole",
])));

function buildModuleContext(context, requiredKeys, label, allowedRolesByChannel, withAllowedRoles) {
  const moduleContext = {};
  const missing = [];
  for (const key of requiredKeys) {
    if (!(key in context)) missing.push(key);
    else moduleContext[key] = context[key];
  }
  if (missing.length) {
    throw new Error(`[main/ipc] Missing context dependencies for ${label}: ${missing.join(", ")}`);
  }

  moduleContext.ipcMain = {
    ...context.ipcMain,
    handle(channel, handler) {
      const allowedRoles = allowedRolesByChannel[channel];
      if (!allowedRoles) {
        throw new Error(`[main/ipc] Missing role authorization policy for ${label} channel: ${channel}`);
      }
      return context.ipcMain.handle(channel, withAllowedRoles(channel, allowedRoles, handler));
    },
  };
  return Object.freeze(moduleContext);
}

function registerMainIpcHandlers(context) {
  if (!context || typeof context !== "object") throw new Error("[main/ipc] registerMainIpcHandlers requires a context object.");
  const { withAllowedRoles } = createIpcSenderAuthorizer({
    getRoleByWebContentsId: context.getWebContentsRole,
  });

  registerUiIpcHandlers(buildModuleContext(context, UI_CONTEXT_KEYS, "ui", MODULE_CHANNEL_ALLOWED_ROLES.ui, withAllowedRoles));
  registerSettingsLibraryIpcHandlers(buildModuleContext(context, SETTINGS_LIBRARY_CONTEXT_KEYS, "settings/library", MODULE_CHANNEL_ALLOWED_ROLES["settings/library"], withAllowedRoles));
  registerVaultBrowserIpcHandlers(buildModuleContext(context, VAULT_BROWSER_CONTEXT_KEYS, "vault/browser", MODULE_CHANNEL_ALLOWED_ROLES["vault/browser"], withAllowedRoles));
  registerDownloadsFilesIpcHandlers(buildModuleContext(context, DOWNLOADS_FILES_CONTEXT_KEYS, "downloads/files", MODULE_CHANNEL_ALLOWED_ROLES["downloads/files"], withAllowedRoles));
  registerImporterIpcHandlers(buildModuleContext(context, IMPORTER_CONTEXT_KEYS, "importer", MODULE_CHANNEL_ALLOWED_ROLES.importer, withAllowedRoles));
  registerExporterIpcHandlers(buildModuleContext(context, EXPORTER_CONTEXT_KEYS, "exporter", MODULE_CHANNEL_ALLOWED_ROLES.exporter, withAllowedRoles));
  registerLibraryContentIpcHandlers(buildModuleContext(context, LIBRARY_CONTENT_CONTEXT_KEYS, "library/content", MODULE_CHANNEL_ALLOWED_ROLES["library/content"], withAllowedRoles));
}

module.exports = {
  registerMainIpcHandlers,
  MAIN_IPC_REQUIRED_CONTEXT_KEYS,
};
