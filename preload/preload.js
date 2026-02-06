const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openBrowser: (initialUrl) => ipcRenderer.invoke("ui:openBrowser", initialUrl),
  openDownloader: () => ipcRenderer.invoke("ui:openDownloader"),
  getActiveDownloadCount: () => ipcRenderer.invoke("dl:activeCount"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  onSettingsUpdated: (cb) => {
    ipcRenderer.removeAllListeners("settings:updated");
    ipcRenderer.on("settings:updated", (_e, payload) => cb(payload));
  },

  // Legacy call retained for compatibility.
  listLatestLibrary: () => ipcRenderer.invoke("library:listLatest"),

  listLibrary: () => ipcRenderer.invoke("library:listAll"),

  listComicPages: (comicDir) => ipcRenderer.invoke("library:listComicPages", comicDir),
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
