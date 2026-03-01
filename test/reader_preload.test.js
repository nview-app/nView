const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const READER_PRELOAD_PATH = path.resolve(__dirname, "../preload/reader_preload.js");

function loadReaderPreload() {
  const invokes = [];
  const subscriptions = [];
  let exposedApi = null;

  const electronMock = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        if (name === "readerApi") exposedApi = api;
      },
    },
    ipcRenderer: {
      invoke(channel, ...args) {
        invokes.push({ channel, args });
        return Promise.resolve({ ok: true });
      },
      on(channel, cb) {
        subscriptions.push({ channel, cb });
      },
      removeListener(channel, cb) {
        const idx = subscriptions.findIndex((entry) => entry.channel === channel && entry.cb === cb);
        if (idx >= 0) subscriptions.splice(idx, 1);
      },
    },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[READER_PRELOAD_PATH];
  try {
    require(READER_PRELOAD_PATH);
  } finally {
    Module._load = originalLoad;
  }

  return { readerApi: exposedApi, invokes };
}

test("reader preload maps mutations and folder open to authorized IPC channels", async () => {
  const { readerApi, invokes } = loadReaderPreload();

  assert.ok(readerApi);
  await readerApi.deleteComic("/library/comic-a");
  await readerApi.showInFolder("/library/comic-a");

  assert.deepEqual(invokes, [
    { channel: "library:deleteComic", args: ["/library/comic-a"] },
    { channel: "files:showInFolder", args: ["/library/comic-a"] },
  ]);
});

test("reader preload exposes open-group completion and subscription bridge", async () => {
  const { readerApi, invokes } = loadReaderPreload();

  assert.equal(typeof readerApi.onOpenGroupBatch, "function");
  assert.equal(typeof readerApi.completeOpenGroupBatch, "function");

  const noop = () => {};
  const unsubscribe = readerApi.onOpenGroupBatch(noop);
  assert.equal(typeof unsubscribe, "function");

  await readerApi.completeOpenGroupBatch({ requestId: "req-1", source: "group", ok: true });
  assert.deepEqual(invokes[0], {
    channel: "ui:readerOpenGroupBatch:result",
    args: [{ requestId: "req-1", source: "group", ok: true }],
  });
});
