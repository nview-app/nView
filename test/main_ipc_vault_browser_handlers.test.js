const test = require("node:test");
const assert = require("node:assert/strict");

const { registerVaultBrowserIpcHandlers } = require("../main/ipc/register_vault_browser_ipc");

function createContext({ unlockResult = { ok: true }, vaultInitialized = true } = {}) {
  const handlers = new Map();
  const sentEvents = [];

  const context = {
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    vaultManager: {
      vaultStatus: () => ({ enabled: true, unlocked: false }),
      isInitialized: () => vaultInitialized,
      vaultUnlock: () => unlockResult,
      vaultInit: () => ({ ok: true }),
      vaultLock: () => ({ ok: true }),
      vaultFilePath: () => "/vault-file",
    },
    getVaultPolicy: () => ({ minLength: 12 }),
    validateVaultPassphrase: () => ({ ok: true, passphrase: "valid-passphrase" }),
    encryptLibraryForVault: async () => ({ ok: true }),
    sendToGallery: (channel, payload) => {
      sentEvents.push({ target: "gallery", channel, payload });
    },
    sendToDownloader: (channel, payload) => {
      sentEvents.push({ target: "downloader", channel, payload });
    },
    sendToBrowser: (channel, payload) => {
      sentEvents.push({ target: "browser", channel, payload });
    },
    ensureBrowserWindow: () => null,
    getBrowserView: () => null,
    getBrowserWin: () => null,
    shell: {},
    loadBookmarksFromDisk: () => ({ ok: true, bookmarks: [] }),
    addBookmarkForPage: () => ({ ok: true }),
    removeBookmarkById: () => ({ ok: true }),
    getBrowserSidePanelWidth: () => 0,
    setBrowserSidePanelWidth: () => {},
    dl: {
      hasActiveDownloads: () => false,
    },
    settingsManager: {
      reloadSettings: () => ({ libraryPath: "/library", darkMode: true }),
    },
    applyConfiguredLibraryRoot: () => ({ usedFallback: false }),
    fs: {
      promises: {
        unlink: async () => {},
      },
    },
  };

  registerVaultBrowserIpcHandlers(context);
  return { handlers, sentEvents };
}

test("vault:unlock succeeds and broadcasts settings:updated to relevant windows", async () => {
  const { handlers, sentEvents } = createContext({ unlockResult: { ok: true }, vaultInitialized: false });
  const unlockHandler = handlers.get("vault:unlock");

  assert.equal(typeof unlockHandler, "function");
  const result = await unlockHandler(null, "passphrase");

  assert.deepEqual(result, { ok: true });
  const settingsUpdatedEvents = sentEvents.filter((event) => event.channel === "settings:updated");
  assert.equal(settingsUpdatedEvents.length, 3);
  assert.deepEqual(
    settingsUpdatedEvents.map((event) => event.target).sort(),
    ["browser", "downloader", "gallery"],
  );
});

test("vault:enable still broadcasts settings:updated to relevant windows", async () => {
  const { handlers, sentEvents } = createContext({ unlockResult: { ok: true }, vaultInitialized: false });
  const enableHandler = handlers.get("vault:enable");

  assert.equal(typeof enableHandler, "function");
  const result = await enableHandler(null, "passphrase");

  assert.equal(result.ok, true);
  const settingsUpdatedEvents = sentEvents.filter((event) => event.channel === "settings:updated");
  assert.equal(settingsUpdatedEvents.length, 3);
  assert.deepEqual(
    settingsUpdatedEvents.map((event) => event.target).sort(),
    ["browser", "downloader", "gallery"],
  );
});
