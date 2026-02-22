const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set(["exporter:progress"]);

const exporterApi = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  listLibrary: () => ipcRenderer.invoke("library:listAll"),
  chooseDestination: (options) => ipcRenderer.invoke("exporter:chooseDestination", options),
  checkDestination: (payload) => ipcRenderer.invoke("exporter:checkDestination", payload),
  thumbnailCacheGet: (payload) => ipcRenderer.invoke("thumbnailCache:get", payload),
  thumbnailCachePut: (payload) => ipcRenderer.invoke("thumbnailCache:put", payload),
  runExport: (payload) => ipcRenderer.invoke("exporter:run", payload),
  onProgress: (handler) =>
    subscribeIpc(ipcRenderer, "exporter:progress", handler, { allowedChannels: SUBSCRIPTION_CHANNELS }),
};

contextBridge.exposeInMainWorld("exporterApi", Object.freeze(exporterApi));
