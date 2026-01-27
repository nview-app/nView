const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserApi", {
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  goBack: () => ipcRenderer.invoke("browser:back"),
  goForward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  setSidePanelWidth: (width) => ipcRenderer.invoke("browser:setSidePanelWidth", width),
  close: () => ipcRenderer.invoke("browser:close"),
  listLibrary: () => ipcRenderer.invoke("library:listAll"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onUrlUpdated: (cb) => {
    ipcRenderer.removeAllListeners("browser:url-updated");
    ipcRenderer.on("browser:url-updated", (_e, url) => cb(url));
  },
  onSettingsUpdated: (cb) => {
    ipcRenderer.removeAllListeners("settings:updated");
    ipcRenderer.on("settings:updated", (_e, settings) => cb(settings));
  },
});
