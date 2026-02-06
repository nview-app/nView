const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dlApi", {
  list: () => ipcRenderer.invoke("dl:list"),
  cancel: (jobId) => ipcRenderer.invoke("dl:cancel", jobId),
  remove: (jobId) => ipcRenderer.invoke("dl:remove", jobId),
  stop: (jobId) => ipcRenderer.invoke("dl:stop", jobId),
  start: (jobId) => ipcRenderer.invoke("dl:start", jobId),
  clearCompleted: () => ipcRenderer.invoke("dl:clearCompleted"),
  openComicViewer: (comicDir) => ipcRenderer.invoke("ui:openComicViewer", comicDir),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onSettingsUpdated: (cb) => {
    ipcRenderer.removeAllListeners("settings:updated");
    ipcRenderer.on("settings:updated", (_e, settings) => cb(settings));
  },

  onUpdate: (cb) => {
    ipcRenderer.removeAllListeners("dl:update");
    ipcRenderer.on("dl:update", (_e, job) => cb(job));
  },

  onRemove: (cb) => {
    ipcRenderer.removeAllListeners("dl:remove");
    ipcRenderer.on("dl:remove", (_e, payload) => cb(payload));
  },

  onToast: (cb) => {
    ipcRenderer.removeAllListeners("dl:toast");
    ipcRenderer.on("dl:toast", (_e, payload) => cb(payload));
  },

  openFile: (filePath) => ipcRenderer.invoke("files:open", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("files:showInFolder", filePath),
});
