const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "settings:updated",
  "importer:progress",
]);

const importerApi = {
  chooseFolder: (mode) => ipcRenderer.invoke("importer:chooseRoot", mode),
  scanRoot: (rootPath) => ipcRenderer.invoke("importer:scanRoot", rootPath),
  scanSingleManga: (folderPath) => ipcRenderer.invoke("importer:scanSingleManga", folderPath),
  getMetadataSuggestions: () => ipcRenderer.invoke("importer:getMetadataSuggestions"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  runImport: (payload) => ipcRenderer.invoke("importer:run", payload),
  onSettingsUpdated: (handler) =>
    subscribeIpc(ipcRenderer, "settings:updated", handler, {
      allowedChannels: SUBSCRIPTION_CHANNELS,
    }),
  onProgress: (handler) =>
    subscribeIpc(ipcRenderer, "importer:progress", handler, { allowedChannels: SUBSCRIPTION_CHANNELS }),
};

contextBridge.exposeInMainWorld("importerApi", Object.freeze(importerApi));
