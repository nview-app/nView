const test = require("node:test");
const assert = require("node:assert/strict");

const { registerDownloadsFilesIpcHandlers } = require("../main/ipc/register_downloads_files_ipc");

function createBaseContext(overrides = {}) {
  return {
    ipcMain: {
      handle() {},
    },
    dl: {
      listJobs: () => [],
      cancelJob: async () => ({ ok: true }),
      removeJob: async () => ({ ok: true }),
      stopJob: async () => ({ ok: true }),
      startJobFromStop: async () => ({ ok: true }),
      clearCompletedJobs: async () => ({ ok: true }),
    },
    getInProgressDownloadCount: () => 0,
    shell: {
      openPath: async () => "",
      showItemInFolder: () => {},
    },
    ensureDirs: () => {},
    LIBRARY_ROOT: () => "/library",
    vaultManager: {
      vaultStatus: () => ({ enabled: true, unlocked: true }),
    },
    fs: {
      promises: {
        readdir: async () => [],
      },
    },
    path: {
      join: (...parts) => parts.join("/"),
    },
    isUnderLibraryRoot: () => true,
    normalizeOpenPathResult: () => ({ ok: true }),
    buildComicEntry: async () => ({ mtimeMs: 0 }),
    ...overrides,
  };
}

test("library:listAll handler uses injected buildComicEntry and returns sorted entries", async () => {
  const handlers = new Map();

  registerDownloadsFilesIpcHandlers(createBaseContext({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    fs: {
      promises: {
        readdir: async () => [
          { isDirectory: () => true, name: "comic_old" },
          { isDirectory: () => true, name: "comic_new" },
          { isDirectory: () => false, name: "ignore.txt" },
        ],
      },
    },
    buildComicEntry: async (dir) => ({
      dir,
      mtimeMs: dir.endsWith("comic_new") ? 2 : 1,
    }),
  }));

  const handler = handlers.get("library:listAll");
  assert.equal(typeof handler, "function");

  const result = await handler();
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].dir, "/library/comic_new");
  assert.equal(result.items[1].dir, "/library/comic_old");
});

test("library:listAll logs warning and returns empty items when readdir fails", async () => {
  const handlers = new Map();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  try {
    registerDownloadsFilesIpcHandlers(createBaseContext({
      ipcMain: {
        handle(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      fs: {
        promises: {
          readdir: async () => {
            throw Object.assign(new Error("permission denied"), { code: "EACCES" });
          },
        },
      },
    }));

    const handler = handlers.get("library:listAll");
    assert.equal(typeof handler, "function");

    const result = await handler();
    assert.equal(result.ok, true);
    assert.deepEqual(result.items, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /library:listAll readdir/);
    assert.match(warnings[0], /EACCES/);
  } finally {
    console.warn = originalWarn;
  }
});
