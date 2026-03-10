const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSettingsManager } = require("../main/settings");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nview-settings-fallback-"));
}

function makeVault() {
  return {
    isInitialized: () => true,
    isUnlocked: () => true,
    decryptBufferWithKey: ({ buffer }) => buffer,
    encryptBufferWithKey: ({ buffer }) => buffer,
  };
}

test("legacy read fallback can load settings while writes remain library-scoped", () => {
  const root = tempDir();
  const library = path.join(root, "library");
  const userData = path.join(root, "userData");
  fs.mkdirSync(library, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });

  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const basicSettingsFile = path.join(userData, "basic_settings.json");
  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example", darkMode: true }));

  const manager = createSettingsManager({
    settingsFile: () => ({
      settingsFile: scopedSettingsFile,
      settingsRelPath: "settings.json",
      legacySettingsFile,
      allowLegacyReadFallback: true,
      libraryRoot: library,
    }),
    settingsPlaintextFile: path.join(userData, "settings.json"),
    basicSettingsFile,
    settingsRelPath: "settings.json",
    defaultSettings: {
      startPage: "",
      startPages: [],
      sourceAdapterUrls: {},
      blockPopups: true,
      allowListEnabled: true,
      allowListDomainsSchemaVersion: 2,
      allowListDomainsBySourceAdapter: {},
      darkMode: false,
      defaultSort: "favorites",
      cardSize: "normal",
      libraryPath: library,
      reader: { windowedResidency: {}, widthScale: 1 },
      groups: { railEnabled: true },
      ui: { customDropdownsV1: true },
      tagManager: { rolloutStage: "stable", telemetryEnabled: true },
      libraryScopedSettingsMigration: {
        rolloutStage: "stable",
        releaseRing: "stable",
        migrationEnabled: true,
        telemetryEnabled: true,
        legacyReadFallbackEnabled: false,
      },
    },
    getWindows: () => [],
    vaultManager: makeVault(),
    requireLibraryScope: true,
  });

  const loaded = manager.loadSettings();
  assert.equal(loaded.startPage, "https://legacy.example");

  manager.updateSettings({ darkMode: false });
  assert.equal(fs.existsSync(scopedSettingsFile), true);
  assert.equal(JSON.parse(fs.readFileSync(scopedSettingsFile, "utf8")).darkMode, false);
  assert.equal(JSON.parse(fs.readFileSync(legacySettingsFile, "utf8")).darkMode, true);
});
