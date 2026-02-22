const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "settings:updated",
  "dl:update",
  "dl:remove",
  "dl:toast",
]);

const dlApi = {
  list: () => ipcRenderer.invoke("dl:list"),
  cancel: (jobId) => ipcRenderer.invoke("dl:cancel", jobId),
  remove: (jobId) => ipcRenderer.invoke("dl:remove", jobId),
  stop: (jobId) => ipcRenderer.invoke("dl:stop", jobId),
  start: (jobId) => ipcRenderer.invoke("dl:start", jobId),
  clearCompleted: () => ipcRenderer.invoke("dl:clearCompleted"),
  openComicViewer: (comicDir) => ipcRenderer.invoke("ui:openComicViewer", comicDir),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onSettingsUpdated: (cb) =>
    subscribeIpc(ipcRenderer, "settings:updated", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onUpdate: (cb) =>
    subscribeIpc(ipcRenderer, "dl:update", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onRemove: (cb) =>
    subscribeIpc(ipcRenderer, "dl:remove", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  onToast: (cb) =>
    subscribeIpc(ipcRenderer, "dl:toast", cb, { allowedChannels: SUBSCRIPTION_CHANNELS }),
  openFile: (filePath) => ipcRenderer.invoke("files:open", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("files:showInFolder", filePath),
};

contextBridge.exposeInMainWorld("dlApi", Object.freeze(dlApi));
