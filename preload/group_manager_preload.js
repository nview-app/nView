const { contextBridge, ipcRenderer } = require("electron");
const { buildGroupsBridge } = require("./groups_preload.js");
const { subscribeIpc } = require("./ipc_subscribe.js");

const SUBSCRIPTION_CHANNELS = new Set([
  "settings:updated",
]);

const groupManagerApi = {
  listLibrary: (options) => ipcRenderer.invoke("library:listAll", options),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  onSettingsUpdated: (handler) =>
    subscribeIpc(ipcRenderer, "settings:updated", handler, {
      allowedChannels: SUBSCRIPTION_CHANNELS,
    }),
  ...buildGroupsBridge(ipcRenderer),
};

contextBridge.exposeInMainWorld("groupManagerApi", Object.freeze(groupManagerApi));
