const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openBrowser: (initialUrl) => ipcRenderer.invoke("ui:openBrowser", initialUrl),
  openDownloader: () => ipcRenderer.invoke("ui:openDownloader"),
  openImporterWindow: () => ipcRenderer.invoke("ui:openImporter"),
  openExporterWindow: () => ipcRenderer.invoke("ui:openExporter"),
  getActiveDownloadCount: () => ipcRenderer.invoke("dl:activeCount"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  getLibraryPathInfo: () => ipcRenderer.invoke("library:pathInfo"),
  getCurrentLibraryStats: () => ipcRenderer.invoke("library:currentStats"),
  chooseLibraryPath: (options) => ipcRenderer.invoke("library:choosePath", options),
  estimateLibraryMove: (options) => ipcRenderer.invoke("library:estimateMove", options),
  validateLibraryMoveTarget: (options) => ipcRenderer.invoke("library:validateMoveTarget", options),
  cleanupOldLibraryPath: (options) => ipcRenderer.invoke("library:cleanupOldPath", options),
  onLibraryMoveProgress: (cb) => {
    ipcRenderer.removeAllListeners("library:moveProgress");
    ipcRenderer.on("library:moveProgress", (_e, payload) => cb(payload));
  },
  onSettingsUpdated: (cb) => {
    ipcRenderer.removeAllListeners("settings:updated");
    ipcRenderer.on("settings:updated", (_e, payload) => cb(payload));
  },

  // Legacy call retained for compatibility.
  listLatestLibrary: () => ipcRenderer.invoke("library:listLatest"),

  listLibrary: () => ipcRenderer.invoke("library:listAll"),

  listComicPages: (comicDir) => ipcRenderer.invoke("library:listComicPages", comicDir),
  getCoverThumbnail: (payload) => ipcRenderer.invoke("library:getCoverThumbnail", payload),
  thumbnailCacheGet: (payload) => ipcRenderer.invoke("thumbnailCache:get", payload),
  thumbnailCachePut: (payload) => ipcRenderer.invoke("thumbnailCache:put", payload),
  toggleFavorite: (comicDir, isFavorite) =>
    ipcRenderer.invoke("library:toggleFavorite", comicDir, isFavorite),
  updateComicMeta: (comicDir, payload) =>
    ipcRenderer.invoke("library:updateComicMeta", comicDir, payload),
  deleteComic: (comicDir) => ipcRenderer.invoke("library:deleteComic", comicDir),

  vaultStatus: () => ipcRenderer.invoke("vault:status"),
  vaultEnable: (passphrase) => ipcRenderer.invoke("vault:enable", passphrase),
  vaultUnlock: (passphrase) => ipcRenderer.invoke("vault:unlock", passphrase),
  vaultLock: () => ipcRenderer.invoke("vault:lock"),

  onLibraryChanged: (cb) => {
    ipcRenderer.removeAllListeners("library:changed");
    ipcRenderer.on("library:changed", (_e, payload) => cb(payload));
  },
  onDownloadCountChanged: (cb) => {
    ipcRenderer.removeAllListeners("dl:activeCount");
    ipcRenderer.on("dl:activeCount", (_e, payload) => cb(payload));
  },
  onOpenComic: (cb) => {
    ipcRenderer.removeAllListeners("gallery:openComic");
    ipcRenderer.on("gallery:openComic", (_e, payload) => cb(payload));
  },

  openFile: (filePath) => ipcRenderer.invoke("files:open", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("files:showInFolder", filePath),
});
