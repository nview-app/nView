const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "browser:url-updated",
  "browser:navigation-state",
  "browser:bookmarks-updated",
  "settings:updated",
]);

const browserApi = {
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  goBack: () => ipcRenderer.invoke("browser:back"),
  goForward: () => ipcRenderer.invoke("browser:forward"),
  getNavigationState: () => ipcRenderer.invoke("browser:navigationState"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  setSidePanelWidth: (width) => ipcRenderer.invoke("browser:setSidePanelWidth", width),
  close: () => ipcRenderer.invoke("browser:close"),
  listBookmarks: () => ipcRenderer.invoke("browser:bookmarks:list"),
  addBookmark: () => ipcRenderer.invoke("browser:bookmark:add"),
  removeBookmark: (id) => ipcRenderer.invoke("browser:bookmark:remove", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  getDirectDownloadState: () => ipcRenderer.invoke("browser:directDownload:state"),
  triggerDirectDownload: () => ipcRenderer.invoke("browser:directDownload:trigger"),
  onUrlUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "browser:url-updated", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onNavigationStateUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "browser:navigation-state", cb, {
      allowedChannels: SUBSCRIPTION_CHANNELS,
    }),
  onBookmarksUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "browser:bookmarks-updated", cb, {
      allowedChannels: SUBSCRIPTION_CHANNELS,
    }),
  onSettingsUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "settings:updated", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
};

contextBridge.exposeInMainWorld("browserApi", Object.freeze(browserApi));
