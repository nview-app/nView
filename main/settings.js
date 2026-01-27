const fs = require("fs");
const { nativeTheme } = require("electron");

function createSettingsManager({ settingsFile, defaultSettings, getWindows }) {
  let settingsCache = null;
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

  function applyNativeTheme(darkMode) {
    nativeTheme.themeSource = darkMode ? "dark" : "light";
    const backgroundColor = darkMode ? "#1e1e1e" : "#ffffff";
    const windows = Array.isArray(getWindows?.()) ? getWindows() : [];
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.setBackgroundColor(backgroundColor);
      }
    });
  }

  function loadSettings() {
    if (settingsCache) return settingsCache;
    let raw = {};
    try {
      if (fs.existsSync(settingsFile)) {
        raw = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      }
    } catch {
      raw = {};
    }
    settingsCache = {
      startPage: normalizeStartPage(raw.startPage),
      blockPopups: normalizeBlockPopups(raw.blockPopups ?? defaultSettings.blockPopups),
      darkMode: normalizeDarkMode(raw.darkMode ?? defaultSettings.darkMode),
      defaultSort: normalizeDefaultSort(raw.defaultSort ?? defaultSettings.defaultSort),
      cardSize: normalizeCardSize(raw.cardSize ?? defaultSettings.cardSize),
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
      darkMode: normalizeDarkMode(next.darkMode),
      defaultSort: normalizeDefaultSort(next.defaultSort),
      cardSize: normalizeCardSize(next.cardSize),
    };
    try {
      fs.writeFileSync(settingsFile, JSON.stringify(settingsCache, null, 2), "utf8");
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
  };
}

module.exports = { createSettingsManager };
