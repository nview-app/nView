const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("exporterApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  listLibrary: () => ipcRenderer.invoke("library:listAll"),
  chooseDestination: (options) => ipcRenderer.invoke("exporter:chooseDestination", options),
  checkDestination: (payload) => ipcRenderer.invoke("exporter:checkDestination", payload),
  thumbnailCacheGet: (payload) => ipcRenderer.invoke("thumbnailCache:get", payload),
  thumbnailCachePut: (payload) => ipcRenderer.invoke("thumbnailCache:put", payload),
  runExport: (payload) => ipcRenderer.invoke("exporter:run", payload),
  onProgress: (handler) => {
    if (typeof handler !== "function") return () => {};
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("exporter:progress", wrapped);
    return () => ipcRenderer.removeListener("exporter:progress", wrapped);
  },
});
