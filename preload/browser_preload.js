const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserApi", {
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  goBack: () => ipcRenderer.invoke("browser:back"),
  goForward: () => ipcRenderer.invoke("browser:forward"),
  getNavigationState: () => ipcRenderer.invoke("browser:navigationState"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  setSidePanelWidth: (width) => ipcRenderer.invoke("browser:setSidePanelWidth", width),
  close: () => ipcRenderer.invoke("browser:close"),
  listLibrary: () => ipcRenderer.invoke("library:listAll"),
  listBookmarks: () => ipcRenderer.invoke("browser:bookmarks:list"),
  addBookmark: () => ipcRenderer.invoke("browser:bookmark:add"),
  removeBookmark: (id) => ipcRenderer.invoke("browser:bookmark:remove", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onUrlUpdated: (cb) => {
    ipcRenderer.removeAllListeners("browser:url-updated");
    ipcRenderer.on("browser:url-updated", (_e, url) => cb(url));
  },
  onNavigationStateUpdated: (cb) => {
    ipcRenderer.removeAllListeners("browser:navigation-state");
    ipcRenderer.on("browser:navigation-state", (_e, state) => cb(state));
  },
  onBookmarksUpdated: (cb) => {
    ipcRenderer.removeAllListeners("browser:bookmarks-updated");
    ipcRenderer.on("browser:bookmarks-updated", (_e, payload) => cb(payload));
  },
  onSettingsUpdated: (cb) => {
    ipcRenderer.removeAllListeners("settings:updated");
    ipcRenderer.on("settings:updated", (_e, settings) => cb(settings));
  },
});
