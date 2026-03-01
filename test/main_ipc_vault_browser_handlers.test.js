const test = require("node:test");
const assert = require("node:assert/strict");

const { registerVaultBrowserIpcHandlers } = require("../main/ipc/register_vault_browser_ipc");
const { normalizeVaultPassphraseInput } = require("../main/vault_policy");

function createContext({ unlockResult = { ok: true }, vaultInitialized = true, contextOverrides = {} } = {}) {
  const handlers = new Map();
  const sentEvents = [];
  const vaultCalls = [];

  const context = {
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    vaultManager: {
      vaultStatus: () => ({ enabled: true, unlocked: false }),
      isInitialized: () => vaultInitialized,
      vaultUnlock: (passphrase) => { vaultCalls.push({ type: "unlock", isBuffer: Buffer.isBuffer(passphrase), value: Buffer.from(passphrase).toString("utf8") }); return unlockResult; },
      vaultInit: (passphrase) => { vaultCalls.push({ type: "enable", isBuffer: Buffer.isBuffer(passphrase), value: Buffer.from(passphrase).toString("utf8") }); return { ok: true }; },
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

  Object.assign(context, contextOverrides);

  registerVaultBrowserIpcHandlers(context);
  return { handlers, sentEvents, vaultCalls };
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


test("vault handlers accept byte payload route and pass locked buffer to vault manager", async () => {
  const { handlers, vaultCalls } = createContext({
    unlockResult: { ok: true },
    vaultInitialized: false,
    contextOverrides: {
      normalizeVaultPassphraseInput,
    },
  });
  const unlockHandler = handlers.get("vault:unlock");
  const enableHandler = handlers.get("vault:enable");

  const unlockRes = await unlockHandler(null, { passphraseBytes: Uint8Array.from(Buffer.from("  passphrase!  ", "utf8")) });
  const enableRes = await enableHandler(null, { passphraseBytes: Uint8Array.from(Buffer.from("  passphrase!  ", "utf8")) });

  assert.equal(unlockRes.ok, true);
  assert.equal(enableRes.ok, true);
  assert.equal(vaultCalls.length, 2);
  assert.equal(vaultCalls[0].isBuffer, true);
  assert.equal(vaultCalls[1].isBuffer, true);
  assert.equal(vaultCalls[0].value, "passphrase!");
  assert.equal(vaultCalls[1].value, "passphrase!");
});
