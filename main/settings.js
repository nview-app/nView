const { resolveSourceAdapterForStartPage, listSourceAdapterSlots } = require("../preload/source_adapters/registry");
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
    "artist-asc",
    "artist-desc",
    "pages-desc",
    "pages-asc",
    "published-desc",
    "published-asc",
  ]);
  const CARD_SIZE_OPTIONS = new Set(["small", "normal", "large"]);

  const sourceAdapterSlots = listSourceAdapterSlots();
  const sourceAdapterIds = sourceAdapterSlots.map((slot) => String(slot?.sourceId || "").trim()).filter(Boolean);

  function normalizeStartPage(value) {
    const raw = String(value || "").trim();
    if (!raw) return defaultSettings.startPage;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function normalizeStartPages(value) {
    const rawList = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[\n,]+/)
        : [];
    const normalized = [];
    for (const entry of rawList) {
      const next = normalizeStartPage(entry);
      if (next && !normalized.includes(next)) normalized.push(next);
    }
    return normalized;
  }


  function normalizeSourceAdapterUrls(value) {
    const source = value && typeof value === "object" ? value : {};
    const normalized = {};
    for (const [sourceId, urlValue] of Object.entries(source)) {
      const id = String(sourceId || "").trim();
      const url = normalizeStartPage(urlValue);
      if (!id) continue;
      normalized[id] = url;
    }
    return normalized;
  }

  function mapStartPagesToSourceAdapterUrls(startPages, existing = {}) {
    const mapped = { ...normalizeSourceAdapterUrls(existing) };
    const pages = Array.isArray(startPages) ? startPages : [];
    for (const page of pages) {
      const urlValue = String(page || "").trim();
      if (!urlValue) continue;
      const adapter = resolveSourceAdapterForStartPage(urlValue);
      if (!adapter?.sourceId) continue;
      if (!mapped[adapter.sourceId]) mapped[adapter.sourceId] = urlValue;
    }
    return mapped;
  }
  function normalizeBlockPopups(value) {
    return Boolean(value);
  }

  function normalizeAllowListEnabled(value) {
    return Boolean(value);
  }

  function normalizeAllowListDomainsSchemaVersion(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed >= 2 ? 2 : 0;
  }

  function normalizeAllowListDomains(value) {
    const rawList = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[\n,]+/)
        : [];
    const deduped = [];
    for (const entry of rawList) {
      const raw = String(entry || "").trim();
      if (!raw) continue;
      const normalized = raw.includes("://")
        ? (() => {
          try {
            return new URL(raw).hostname.toLowerCase();
          } catch {
            return raw.toLowerCase();
          }
        })()
        : raw.toLowerCase();
      if (!normalized || deduped.includes(normalized)) continue;
      deduped.push(normalized);
    }
    return deduped;
  }

  function normalizeAllowListDomainsBySourceAdapter(value, legacyDomains = null) {
    const source = value && typeof value === "object" ? value : {};
    const normalized = {};
    for (const [sourceId, domains] of Object.entries(source)) {
      const id = String(sourceId || "").trim();
      if (!id || !sourceAdapterIds.includes(id)) continue;
      normalized[id] = normalizeAllowListDomains(domains);
    }
    const legacy = normalizeAllowListDomains(legacyDomains);
    if (legacy.length) {
      for (const sourceId of sourceAdapterIds) {
        const existing = Array.isArray(normalized[sourceId]) ? normalized[sourceId] : [];
        normalized[sourceId] = Array.from(new Set([...existing, ...legacy]));
      }
    }
    return normalized;
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

  function normalizeReaderWindowedResidency(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultSettings?.reader?.windowedResidency || {};
    const numberOrFallback = (input, fallback, min, max) => {
      const parsed = Number(input);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(min, parsed));
    };
    return {
      enabled: Boolean(source.enabled ?? defaults.enabled),
      hotRadius: Math.round(numberOrFallback(source.hotRadius, defaults.hotRadius ?? 2, 0, 200)),
      warmRadius: Math.round(numberOrFallback(source.warmRadius, defaults.warmRadius ?? 8, 0, 400)),
      maxResidentPages: Math.round(
        numberOrFallback(source.maxResidentPages, defaults.maxResidentPages ?? 16, 1, 2000),
      ),
      maxInflightLoads: Math.round(
        numberOrFallback(source.maxInflightLoads, defaults.maxInflightLoads ?? 3, 1, 20),
      ),
      evictHysteresisMs: Math.round(
        numberOrFallback(source.evictHysteresisMs, defaults.evictHysteresisMs ?? 2000, 0, 60_000),
      ),
      sweepIntervalMs: Math.round(
        numberOrFallback(source.sweepIntervalMs, defaults.sweepIntervalMs ?? 7000, 250, 120_000),
      ),
      scrollVelocityPrefetchCutoff: numberOrFallback(
        source.scrollVelocityPrefetchCutoff,
        defaults.scrollVelocityPrefetchCutoff ?? 1.6,
        0,
        20,
      ),
    };
  }

  function normalizeReaderSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      windowedResidency: normalizeReaderWindowedResidency(source.windowedResidency),
    };
  }

  function normalizeGroupsSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultSettings?.groups || {};
    return {
      railEnabled: Boolean(source.railEnabled ?? defaults.railEnabled ?? true),
    };
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

  function ensureBasicSettingsFromEncrypted(payload, currentBasic) {
    if (!basicSettingsFile || currentBasic) return null;
    writeBasicSettings(payload);
    return normalizeBasicSettings(payload);
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
    let basic = null;
    try {
      basic = readBasicSettings();
      const vaultState = getVaultState();
      if (vaultState.enabled && vaultState.unlocked) {
        const encrypted = readEncryptedSettings();
        if (encrypted) {
          raw = encrypted;
          try {
            const backfilled = ensureBasicSettingsFromEncrypted(raw, basic);
            if (backfilled) basic = backfilled;
          } catch (err) {
            console.warn("[settings] failed to backfill basic settings:", String(err));
          }
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

    // Keep startup-critical keys sourced from basic settings so the library
    // location and theme stay consistent even if encrypted settings become
    // stale (for example after a move while Vault Mode was locked).
    if (basic) {
      raw = {
        ...raw,
        libraryPath: basic.libraryPath,
        darkMode: basic.darkMode,
      };
    }

    const normalizedStartPages = normalizeStartPages(raw.startPages ?? [raw.startPage ?? defaultSettings.startPage]);
    const normalizedSourceAdapterUrls = mapStartPagesToSourceAdapterUrls(
      normalizedStartPages,
      raw.sourceAdapterUrls,
    );
    const rawAllowListDomainsSchemaVersion = normalizeAllowListDomainsSchemaVersion(
      Object.prototype.hasOwnProperty.call(raw, "allowListDomainsSchemaVersion")
        ? raw.allowListDomainsSchemaVersion
        : 0,
    );
    const allowListDomainsSchemaVersion = 2;
    const allowListDomainsBySourceAdapter = rawAllowListDomainsSchemaVersion >= 2
      ? normalizeAllowListDomainsBySourceAdapter(
        raw.allowListDomainsBySourceAdapter ?? defaultSettings.allowListDomainsBySourceAdapter,
      )
      : normalizeAllowListDomainsBySourceAdapter(defaultSettings.allowListDomainsBySourceAdapter);

    settingsCache = {
      sourceAdapterUrls: normalizedSourceAdapterUrls,
      startPages: normalizedStartPages,
      startPage: normalizeStartPage(raw.startPage),
      blockPopups: normalizeBlockPopups(raw.blockPopups ?? defaultSettings.blockPopups),
      allowListEnabled: normalizeAllowListEnabled(
        raw.allowListEnabled ?? defaultSettings.allowListEnabled,
      ),
      allowListDomainsSchemaVersion,
      allowListDomainsBySourceAdapter,
      darkMode: normalizeDarkMode(raw.darkMode ?? defaultSettings.darkMode),
      defaultSort: normalizeDefaultSort(raw.defaultSort ?? defaultSettings.defaultSort),
      cardSize: normalizeCardSize(raw.cardSize ?? defaultSettings.cardSize),
      libraryPath: normalizeLibraryPath(raw.libraryPath ?? defaultSettings.libraryPath),
      reader: normalizeReaderSettings(raw.reader ?? defaultSettings.reader),
      groups: normalizeGroupsSettings(raw.groups ?? defaultSettings.groups),
    };
    if (!settingsCache.startPages.length) {
      settingsCache.startPages = Object.values(settingsCache.sourceAdapterUrls).filter(Boolean);
    }
    if (!settingsCache.startPages.length && settingsCache.startPage) {
      settingsCache.startPages = [settingsCache.startPage];
    }
    settingsCache.startPage = settingsCache.startPages[0] || settingsCache.startPage;
    return settingsCache;
  }

  function getSettings() {
    return { ...loadSettings() };
  }

  function saveSettings(next) {
    const normalizedStartPages = normalizeStartPages(next.startPages ?? [next.startPage]);
    const normalizedSourceAdapterUrls = mapStartPagesToSourceAdapterUrls(
      normalizedStartPages,
      next.sourceAdapterUrls,
    );
    settingsCache = {
      sourceAdapterUrls: normalizedSourceAdapterUrls,
      startPages: normalizedStartPages,
      startPage: normalizeStartPage(next.startPage),
      blockPopups: normalizeBlockPopups(next.blockPopups),
      allowListEnabled: normalizeAllowListEnabled(next.allowListEnabled),
      allowListDomainsSchemaVersion: normalizeAllowListDomainsSchemaVersion(
        next.allowListDomainsSchemaVersion ?? defaultSettings.allowListDomainsSchemaVersion ?? 2,
      ),
      allowListDomainsBySourceAdapter: normalizeAllowListDomainsBySourceAdapter(
        next.allowListDomainsBySourceAdapter,
      ),
      darkMode: normalizeDarkMode(next.darkMode),
      defaultSort: normalizeDefaultSort(next.defaultSort),
      cardSize: normalizeCardSize(next.cardSize),
      libraryPath: normalizeLibraryPath(next.libraryPath),
      reader: normalizeReaderSettings(next.reader),
      groups: normalizeGroupsSettings(next.groups),
    };
    if (!settingsCache.startPages.length) {
      settingsCache.startPages = Object.values(settingsCache.sourceAdapterUrls).filter(Boolean);
    }
    if (!settingsCache.startPages.length && settingsCache.startPage) {
      settingsCache.startPages = [settingsCache.startPage];
    }
    settingsCache.startPage = settingsCache.startPages[0] || settingsCache.startPage;
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
