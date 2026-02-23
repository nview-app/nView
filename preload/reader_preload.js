const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "reader:openComic",
  "library:changed",
  "settings:updated",
]);

const readerApi = {
  listComicPages: (comicDir) => ipcRenderer.invoke("library:listComicPages", comicDir),
  toggleFavorite: (comicDir, isFavorite) =>
    ipcRenderer.invoke("library:toggleFavorite", comicDir, isFavorite),
  updateComicMeta: (comicDir, payload) => ipcRenderer.invoke("library:updateComicMeta", comicDir, payload),
  updateComicPages: (comicDir, payload) => ipcRenderer.invoke("library:updateComicPages", comicDir, payload),
  deleteComic: (comicDir) => ipcRenderer.invoke("library:deleteComic", comicDir),
  listAllComics: () => ipcRenderer.invoke("library:listAll"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  showInFolder: (targetPath) => ipcRenderer.invoke("files:showInFolder", targetPath),
  syncOpenComics: (comicDirs) => ipcRenderer.invoke("ui:syncOpenComics", comicDirs),
  onOpenComic: (cb) =>
    subscribeIpc(ipcRenderer, "reader:openComic", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onLibraryChanged: (cb) =>
    subscribeIpc(ipcRenderer, "library:changed", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onSettingsUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "settings:updated", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
};

contextBridge.exposeInMainWorld("readerApi", Object.freeze(readerApi));
