const fs = require("fs");
const path = require("path");
const { nativeTheme } = require("electron");

function createSettingsManager({
  settingsFile,
  settingsPlaintextFile,
  basicSettingsFile,
  settingsRelPath,
  defaultSettings,
  getWindows,
  vaultManager,
}) {
  let settingsCache = null;
  let pendingEncryptedSave = false;
  const resolvedSettingsRelPath = String(settingsRelPath || "settings.json");
  const SORT_OPTIONS = new Set([
    "recent",
    "favorites",
    "oldest",
    "title-asc",
    "title-desc",
    "pages-desc",
    "pages-asc",
  ]);
  const CARD_SIZE_OPTIONS = new Set(["small", "normal", "large"]);

  function normalizeStartPage(value) {
    const raw = String(value || "").trim();
    if (!raw) return defaultSettings.startPage;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function normalizeBlockPopups(value) {
    return Boolean(value);
  }

  function normalizeAllowListEnabled(value) {
    return Boolean(value);
  }

  function normalizeAllowListDomains(value) {
    const rawList = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[\n,]+/)
        : [];
    const cleaned = rawList
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .map((entry) => {
        if (!entry.includes("://")) return entry.toLowerCase();
        try {
          return new URL(entry).hostname.toLowerCase();
        } catch {
          return entry.toLowerCase();
        }
      })
      .filter(Boolean);
    return cleaned;
  }

  function normalizeDarkMode(value) {
    return Boolean(value);
  }

  function normalizeDefaultSort(value) {
    const next = String(value || "").trim();
    if (SORT_OPTIONS.has(next)) return next;
    return defaultSettings.defaultSort;
  }

  function normalizeCardSize(value) {
    const next = String(value || "").trim();
    if (CARD_SIZE_OPTIONS.has(next)) return next;
    return defaultSettings.cardSize;
  }

  function normalizeLibraryPath(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (!path.isAbsolute(raw)) return "";
    return path.normalize(raw);
  }

  function normalizeBasicSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      libraryPath: normalizeLibraryPath(source.libraryPath),
      darkMode: normalizeDarkMode(source.darkMode ?? defaultSettings.darkMode),
    };
  }

  function applyNativeTheme(darkMode) {
    if (!nativeTheme) return;
    nativeTheme.themeSource = darkMode ? "dark" : "light";
    const backgroundColor = darkMode ? "#1e1e1e" : "#ffffff";
    const windows = Array.isArray(getWindows?.()) ? getWindows() : [];
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.setBackgroundColor(backgroundColor);
      }
    });
  }

  function getVaultState() {
    // Vault Mode is mandatory in current builds. Returning disabled only keeps
    // a defensive path for legacy/partial bootstrap contexts.
    if (!vaultManager) return { enabled: false, unlocked: false };
    const enabled = vaultManager.isInitialized();
    return { enabled, unlocked: enabled ? vaultManager.isUnlocked() : false };
  }

  function readPlaintextSettings() {
    if (!settingsPlaintextFile) return null;
    if (!fs.existsSync(settingsPlaintextFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(settingsPlaintextFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  function readBasicSettings() {
    if (!basicSettingsFile) return null;
    if (!fs.existsSync(basicSettingsFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(basicSettingsFile, "utf8"));
    return normalizeBasicSettings(parsed);
  }

  function readEncryptedSettings() {
    if (!fs.existsSync(settingsFile)) return null;
    const decrypted = vaultManager.decryptBufferWithKey({
      relPath: resolvedSettingsRelPath,
      buffer: fs.readFileSync(settingsFile),
    });
    const parsed = JSON.parse(decrypted.toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  function deletePlaintextSettings() {
    if (!settingsPlaintextFile) return;
    if (!fs.existsSync(settingsPlaintextFile)) return;
    fs.unlinkSync(settingsPlaintextFile);
  }

  function writeBasicSettings(payload) {
    if (!basicSettingsFile) return;
    const normalized = normalizeBasicSettings(payload);
    fs.writeFileSync(basicSettingsFile, JSON.stringify(normalized, null, 2), "utf8");
  }

  function writeEncryptedSettings(payload) {
    const encrypted = vaultManager.encryptBufferWithKey({
      relPath: resolvedSettingsRelPath,
      buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
    });
    const tempPath = `${settingsFile}.tmp`;
    fs.writeFileSync(tempPath, encrypted);
    fs.renameSync(tempPath, settingsFile);
    // Keep a minimal bootstrap copy so the app can recover startup-critical
    // preferences before Vault Mode is unlocked on next startup.
    writeBasicSettings(payload);
  }

  function loadSettings() {
    if (settingsCache) return settingsCache;
    let raw = {};
    try {
      const vaultState = getVaultState();
      if (vaultState.enabled && vaultState.unlocked) {
        const encrypted = readEncryptedSettings();
        if (encrypted) {
          raw = encrypted;
        } else {
          const plaintext = readPlaintextSettings();
          if (plaintext) {
            raw = plaintext;
            try {
              writeEncryptedSettings(raw);
              deletePlaintextSettings();
            } catch (err) {
              console.warn("[settings] failed to encrypt legacy settings:", String(err));
            }
          }
        }
      } else {
        // Compatibility/bootstrap path: when vault is locked, read minimal
        // non-sensitive startup preferences from basic settings.
        const basic = readBasicSettings();
        if (basic) {
          raw = basic;
        } else {
          // Legacy upgrade fallback from early builds that stored plaintext
          // settings in settings.json.
          const plaintext = readPlaintextSettings();
          if (plaintext) raw = plaintext;
        }
      }
    } catch {
      raw = {};
    }
    settingsCache = {
      startPage: normalizeStartPage(raw.startPage),
      blockPopups: normalizeBlockPopups(raw.blockPopups ?? defaultSettings.blockPopups),
      allowListEnabled: normalizeAllowListEnabled(
        raw.allowListEnabled ?? defaultSettings.allowListEnabled,
      ),
      allowListDomains: normalizeAllowListDomains(
        raw.allowListDomains ?? defaultSettings.allowListDomains,
      ),
      darkMode: normalizeDarkMode(raw.darkMode ?? defaultSettings.darkMode),
      defaultSort: normalizeDefaultSort(raw.defaultSort ?? defaultSettings.defaultSort),
      cardSize: normalizeCardSize(raw.cardSize ?? defaultSettings.cardSize),
      libraryPath: normalizeLibraryPath(raw.libraryPath ?? defaultSettings.libraryPath),
    };
    return settingsCache;
  }

  function getSettings() {
    return { ...loadSettings() };
  }

  function saveSettings(next) {
    settingsCache = {
      startPage: normalizeStartPage(next.startPage),
      blockPopups: normalizeBlockPopups(next.blockPopups),
      allowListEnabled: normalizeAllowListEnabled(next.allowListEnabled),
      allowListDomains: normalizeAllowListDomains(next.allowListDomains),
      darkMode: normalizeDarkMode(next.darkMode),
      defaultSort: normalizeDefaultSort(next.defaultSort),
      cardSize: normalizeCardSize(next.cardSize),
      libraryPath: normalizeLibraryPath(next.libraryPath),
    };
    try {
      const vaultState = getVaultState();
      if (vaultState.enabled) {
        if (vaultState.unlocked) {
          writeEncryptedSettings(settingsCache);
          pendingEncryptedSave = false;
        } else {
          pendingEncryptedSave = true;
          // Keep bootstrap settings current even when encrypted write is
          // deferred until unlock.
          writeBasicSettings(settingsCache);
          console.warn("[settings] write skipped: Vault Mode is locked.");
        }
      } else {
        // Current builds should not regenerate legacy plaintext settings.json.
        // Persist only startup-safe bootstrap settings in compatibility mode.
        writeBasicSettings(settingsCache);
      }
    } catch (err) {
      console.warn("[settings write failed]", String(err));
    }
    applyNativeTheme(settingsCache.darkMode);
    return { ...settingsCache };
  }

  function updateSettings(partial) {
    const current = loadSettings();
    return saveSettings({
      ...current,
      ...partial,
    });
  }

  return {
    applyNativeTheme,
    getSettings,
    loadSettings,
    updateSettings,
    reloadSettings() {
      if (pendingEncryptedSave && vaultManager?.isUnlocked?.()) {
        try {
          writeEncryptedSettings(settingsCache || defaultSettings);
          pendingEncryptedSave = false;
        } catch (err) {
          console.warn("[settings] failed to save pending encrypted settings:", String(err));
        }
      }
      settingsCache = null;
      const next = loadSettings();
      applyNativeTheme(next.darkMode);
      return { ...next };
    },
  };
}

module.exports = { createSettingsManager };
