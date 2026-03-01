const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");
const { buildGroupsBridge } = require("./groups_preload.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "library:moveProgress",
  "library:loadProgress",
  "settings:updated",
  "library:changed",
  "dl:activeCount",
  "gallery:openComic",
  "reader:openComics",
]);


function toPassphrasePayload(passphrase) {
  const text = String(passphrase || "");
  return {
    passphraseBytes: Uint8Array.from(Buffer.from(text, "utf8")),
  };
}

const api = {
  openBrowser: (initialUrl) => ipcRenderer.invoke("ui:openBrowser", initialUrl),
  openDownloader: () => ipcRenderer.invoke("ui:openDownloader"),
  getAppVersion: () => ipcRenderer.invoke("ui:getVersion"),
  getSecureMemoryStatus: () => ipcRenderer.invoke("ui:getSecureMemoryStatus"),
  logPerfEvent: (payload) => ipcRenderer.invoke("ui:logPerfEvent", payload),
  openImporterWindow: () => ipcRenderer.invoke("ui:openImporter"),
  openExporterWindow: () => ipcRenderer.invoke("ui:openExporter"),
  openGroupManagerWindow: () => ipcRenderer.invoke("ui:openGroupManager"),
  openReaderWindow: (comicDir) => ipcRenderer.invoke("ui:openReader", comicDir),
  openReaderWindows: (comicDirs) => ipcRenderer.invoke("ui:openReaderBatch", comicDirs),
  getActiveDownloadCount: () => ipcRenderer.invoke("dl:activeCount"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  validateStartPageUrl: (value, sourceId = "") => ipcRenderer.invoke("settings:validateStartPageUrl", value, sourceId),
  listSourceAdapters: () => ipcRenderer.invoke("settings:listSourceAdapters"),
  getLibraryPathInfo: () => ipcRenderer.invoke("library:pathInfo"),
  getCurrentLibraryStats: () => ipcRenderer.invoke("library:currentStats"),
  chooseLibraryPath: (options) => ipcRenderer.invoke("library:choosePath", options),
  estimateLibraryMove: (options) => ipcRenderer.invoke("library:estimateMove", options),
  validateLibraryMoveTarget: (options) => ipcRenderer.invoke("library:validateMoveTarget", options),
  cleanupOldLibraryPath: (options) => ipcRenderer.invoke("library:cleanupOldPath", options),
  onLibraryMoveProgress: (cb) =>
    subscribeIpc(ipcRenderer, "library:moveProgress", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onSettingsUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "settings:updated", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),

  // Legacy call retained for compatibility.
  listLatestLibrary: () => ipcRenderer.invoke("library:listLatest"),

  listLibrary: (options) => ipcRenderer.invoke("library:listAll", options),
  onLibraryLoadProgress: (cb) =>
    subscribeIpc(ipcRenderer, "library:loadProgress", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),

  listComicPages: (comicDir) => ipcRenderer.invoke("library:listComicPages", comicDir),
  getCoverThumbnail: (payload) => ipcRenderer.invoke("library:getCoverThumbnail", payload),
  thumbnailCacheGet: (payload) => ipcRenderer.invoke("thumbnailCache:get", payload),
  thumbnailCachePut: (payload) => ipcRenderer.invoke("thumbnailCache:put", payload),
  toggleFavorite: (comicDir, isFavorite) =>
    ipcRenderer.invoke("library:toggleFavorite", comicDir, isFavorite),
  updateComicMeta: (comicDir, payload) =>
    ipcRenderer.invoke("library:updateComicMeta", comicDir, payload),
  updateComicPages: (comicDir, payload) =>
    ipcRenderer.invoke("library:updateComicPages", comicDir, payload),
  deleteComic: (comicDir) => ipcRenderer.invoke("library:deleteComic", comicDir),

  vaultStatus: () => ipcRenderer.invoke("vault:status"),
  vaultEnable: (passphrase) => ipcRenderer.invoke("vault:enable", toPassphrasePayload(passphrase)),
  vaultUnlock: (passphrase) => ipcRenderer.invoke("vault:unlock", toPassphrasePayload(passphrase)),
  vaultLock: () => ipcRenderer.invoke("vault:lock"),
  getVaultPolicy: async () => ipcRenderer.invoke("vault:getPolicy"),

  onLibraryChanged: (cb) =>
    subscribeIpc(ipcRenderer, "library:changed", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onDownloadCountChanged: (cb) =>
    subscribeIpc(ipcRenderer, "dl:activeCount", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onOpenComic: (cb) =>
    subscribeIpc(ipcRenderer, "gallery:openComic", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onReaderOpenComics: (cb) =>
    subscribeIpc(ipcRenderer, "reader:openComics", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),

  openFile: (filePath) => ipcRenderer.invoke("files:open", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("files:showInFolder", filePath),

  ...buildGroupsBridge(ipcRenderer),
};

contextBridge.exposeInMainWorld("api", Object.freeze(api));
