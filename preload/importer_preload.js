const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("importerApi", {
  chooseFolder: (mode) => ipcRenderer.invoke("importer:chooseRoot", mode),
  scanRoot: (rootPath) => ipcRenderer.invoke("importer:scanRoot", rootPath),
  scanSingleManga: (folderPath) => ipcRenderer.invoke("importer:scanSingleManga", folderPath),
  getMetadataSuggestions: () => ipcRenderer.invoke("importer:getMetadataSuggestions"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  runImport: (payload) => ipcRenderer.invoke("importer:run", payload),
  onSettingsUpdated: (handler) => {
    if (typeof handler !== "function") return;
    ipcRenderer.removeAllListeners("settings:updated");
    ipcRenderer.on("settings:updated", (_event, settings) => handler(settings));
  },
  onProgress: (handler) => {
    if (typeof handler !== "function") return () => {};
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("importer:progress", wrapped);
    return () => ipcRenderer.removeListener("importer:progress", wrapped);
  },
});
