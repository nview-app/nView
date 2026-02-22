function subscribeIpc(ipcRenderer, channel, callback, options = {}) {
  const { allowedChannels } = options;

  if (!(allowedChannels instanceof Set) || !allowedChannels.has(channel)) {
    return () => {};
  }

  if (typeof callback !== "function") {
    return () => {};
  }

  const wrappedHandler = (_event, payload) => {
    callback(payload);
  };

  ipcRenderer.on(channel, wrappedHandler);

  let isSubscribed = true;
  return () => {
    if (!isSubscribed) return;
    isSubscribed = false;
    ipcRenderer.off(channel, wrappedHandler);
  };
}

module.exports = {
  subscribeIpc,
};
