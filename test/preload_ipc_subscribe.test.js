const test = require("node:test");
const assert = require("node:assert/strict");

const { subscribeIpc } = require("../preload/ipc_subscribe.js");

test("subscribeIpc registers and unsubscribes only its own listener", () => {
  const handlers = new Map();
  const ipcRenderer = {
    on(channel, handler) {
      if (!handlers.has(channel)) handlers.set(channel, new Set());
      handlers.get(channel).add(handler);
    },
    off(channel, handler) {
      handlers.get(channel)?.delete(handler);
    },
  };

  const allowedChannels = new Set(["settings:updated"]);
  const events = [];
  const unsubscribeA = subscribeIpc(ipcRenderer, "settings:updated", (payload) => {
    events.push(["A", payload]);
  }, { allowedChannels });
  subscribeIpc(ipcRenderer, "settings:updated", (payload) => {
    events.push(["B", payload]);
  }, { allowedChannels });

  for (const handler of handlers.get("settings:updated")) {
    handler({}, { theme: "dark" });
  }

  unsubscribeA();

  for (const handler of handlers.get("settings:updated")) {
    handler({}, { theme: "light" });
  }

  assert.deepEqual(events, [
    ["A", { theme: "dark" }],
    ["B", { theme: "dark" }],
    ["B", { theme: "light" }],
  ]);
});

test("subscribeIpc returns a no-op unsubscribe for invalid callbacks", () => {
  let called = false;
  const ipcRenderer = {
    on() {
      called = true;
    },
    off() {
      called = true;
    },
  };

  const unsubscribe = subscribeIpc(ipcRenderer, "settings:updated", null, {
    allowedChannels: new Set(["settings:updated"]),
  });
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
  assert.equal(called, false);
});

test("subscribeIpc returns a no-op unsubscribe when no allowlist is provided", () => {
  let called = false;
  const ipcRenderer = {
    on() {
      called = true;
    },
    off() {
      called = true;
    },
  };

  const unsubscribe = subscribeIpc(ipcRenderer, "settings:updated", () => {});
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
  assert.equal(called, false);
});

test("subscribeIpc rejects channels that are not allowlisted", () => {
  let called = false;
  const ipcRenderer = {
    on() {
      called = true;
    },
    off() {
      called = true;
    },
  };

  const unsubscribe = subscribeIpc(ipcRenderer, "library:changed", () => {}, {
    allowedChannels: new Set(["settings:updated"]),
  });

  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
  assert.equal(called, false);
});

test("subscribeIpc unsubscribe is idempotent", () => {
  const offCalls = [];
  const handlerRef = { value: null };
  const ipcRenderer = {
    on(_channel, handler) {
      handlerRef.value = handler;
    },
    off(channel, handler) {
      offCalls.push([channel, handler]);
    },
  };

  const unsubscribe = subscribeIpc(ipcRenderer, "settings:updated", () => {}, {
    allowedChannels: new Set(["settings:updated"]),
  });
  unsubscribe();
  unsubscribe();

  assert.equal(offCalls.length, 1);
  assert.equal(offCalls[0][0], "settings:updated");
  assert.equal(offCalls[0][1], handlerRef.value);
});
