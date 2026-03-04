const { contextBridge, ipcRenderer } = require("electron");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "settings:updated",
]);

const tagManagerApi = Object.freeze({
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onSettingsUpdated: (handler) =>
    subscribeIpc(ipcRenderer, "settings:updated", handler, {
      allowedChannels: SUBSCRIPTION_CHANNELS,
    }),
  getSnapshot: (payload = {}) => ipcRenderer.invoke("tagManager:getSnapshot", payload),
  setVisibility: (payload) => ipcRenderer.invoke("tagManager:setVisibility", payload),
  bulkSetVisibility: (payload) => ipcRenderer.invoke("tagManager:bulkSetVisibility", payload),
  resetVisibility: (payload) => ipcRenderer.invoke("tagManager:resetVisibility", payload),
  createAliasGroup: (payload) => ipcRenderer.invoke("tagManager:createAliasGroup", payload),
  updateAliasGroup: (payload) => ipcRenderer.invoke("tagManager:updateAliasGroup", payload),
  deleteAliasGroup: (payload) => ipcRenderer.invoke("tagManager:deleteAliasGroup", payload),
  resolveForFilter: (payload) => ipcRenderer.invoke("tagManager:resolveForFilter", payload),
  resolveForMetadata: (payload) => ipcRenderer.invoke("tagManager:resolveForMetadata", payload),
  recoverStore: (payload) => ipcRenderer.invoke("tagManager:recoverStore", payload),
});

contextBridge.exposeInMainWorld("tagManagerApi", tagManagerApi);
