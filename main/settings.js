const { resolveSourceAdapterForStartPage, listSourceAdapterSlots } = require("../preload/source_adapters/registry");
const fs = require("fs");
const path = require("path");
const { nativeTheme } = require("electron");

const { ENABLE_SETTINGS_TRACE_CMD_LOGGING } = require("../shared/dev_mode");

function createSettingsManager({
  settingsFile,
  settingsPlaintextFile,
  basicSettingsFile,
  settingsRelPath,
  defaultSettings,
  getWindows,
  vaultManager,
  auditLogger,
  requireLibraryScope = false,
}) {
  let settingsCache = null;
  let pendingEncryptedSave = false;
  let pendingEncryptedPayload = null;
  let resolvedSettingsFile = String(settingsFile || "");
  let resolvedSettingsRelPath = String(settingsRelPath || "settings.json");
  let resolvedLegacySettingsFile = "";
  let resolvedAllowLegacyReadFallback = false;
  let resolvedLibraryRoot = "";
  let lastLibraryScopeKey = "";
  let lastWriteError = null;

  function logSettingsTrace(event, details = {}) {
    if (!ENABLE_SETTINGS_TRACE_CMD_LOGGING) return;
    try {
      console.info(`[settings][trace] ${event}`, JSON.stringify(details));
    } catch {
      console.info(`[settings][trace] ${event}`);
    }
  }

  function isPathUnderRoot(rootPath, candidatePath) {
    const root = path.resolve(String(rootPath || "").trim());
    const candidate = path.resolve(String(candidatePath || "").trim());
    if (!root || !candidate || !path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
    if (root === candidate) return true;
    const rel = path.relative(root, candidate);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  }

  function logScopedPathViolation({ action, errorCode, pathValue, libraryRoot }) {
    if (typeof auditLogger === "function") {
      auditLogger({
        component: "settings",
        event: "library_scope_violation",
        action,
        ok: false,
        errorCode,
      });
    }
    const safePath = path.basename(String(pathValue || "")) || "<unset>";
    const safeRoot = path.basename(String(libraryRoot || "")) || "<unset>";
    console.warn(`[settings] library-scoped invariant rejected (${errorCode}) path=${safePath} root=${safeRoot}`);
  }

  const resolveSettingsPaths = () => {
    if (typeof settingsFile === "function") {
      const resolved = settingsFile();
      if (resolved && typeof resolved === "object") {
        const nextSettingsFile = String(resolved.settingsFile || resolvedSettingsFile || "");
        const nextSettingsRelPath = String(resolved.settingsRelPath || resolvedSettingsRelPath || "settings.json");
        const nextLibraryRoot = String(resolved.libraryRoot || resolvedLibraryRoot || "");
        const nextLegacySettingsFile = String(resolved.legacySettingsFile || resolvedLegacySettingsFile || "");
        const nextAllowLegacyReadFallback = Boolean(
          resolved.allowLegacyReadFallback ?? resolvedAllowLegacyReadFallback,
        );
        return {
          settingsFile: nextSettingsFile,
          settingsRelPath: nextSettingsRelPath,
          legacySettingsFile: nextLegacySettingsFile,
          allowLegacyReadFallback: nextAllowLegacyReadFallback,
          libraryRoot: nextLibraryRoot,
        };
      }
      return {
        settingsFile: String(resolved || resolvedSettingsFile || ""),
        settingsRelPath: resolvedSettingsRelPath,
        legacySettingsFile: resolvedLegacySettingsFile,
        allowLegacyReadFallback: resolvedAllowLegacyReadFallback,
        libraryRoot: resolvedLibraryRoot,
      };
    }
    return {
      settingsFile: resolvedSettingsFile,
      settingsRelPath: resolvedSettingsRelPath,
      legacySettingsFile: resolvedLegacySettingsFile,
      allowLegacyReadFallback: resolvedAllowLegacyReadFallback,
      libraryRoot: resolvedLibraryRoot,
    };
  };

  function assertLibraryScopedContext(paths, action) {
    if (!requireLibraryScope) return;
    const libraryRootPath = path.resolve(String(paths?.libraryRoot || "").trim());
    const targetSettingsPath = path.resolve(String(paths?.settingsFile || "").trim());
    if (!libraryRootPath || !path.isAbsolute(libraryRootPath)) {
      logScopedPathViolation({
        action,
        errorCode: "ACTIVE_LIBRARY_UNAVAILABLE",
        pathValue: targetSettingsPath,
        libraryRoot: libraryRootPath,
      });
      throw new Error("Active library context is not available for settings write.");
    }
    if (!isPathUnderRoot(libraryRootPath, targetSettingsPath)) {
      logScopedPathViolation({
        action,
        errorCode: "SETTINGS_PATH_OUTSIDE_LIBRARY",
        pathValue: targetSettingsPath,
        libraryRoot: libraryRootPath,
      });
      throw new Error("Resolved settings path is outside the active library root.");
    }
  }
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
    if (!path.isAbsolute(raw)) {
      logSettingsTrace("normalizeLibraryPath:rejected_non_absolute", {
        raw,
        platform: process.platform,
      });
      return "";
    }
    const normalized = path.normalize(raw);
    if (normalized !== raw) {
      logSettingsTrace("normalizeLibraryPath:normalized", { raw, normalized });
    }
    return normalized;
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

  function normalizeReaderWidthScale(value) {
    const defaults = defaultSettings?.reader || {};
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return Number(defaults.widthScale) || 1;
    return Math.min(1, Math.max(0.4, parsed));
  }

  function normalizeReaderSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      windowedResidency: normalizeReaderWindowedResidency(source.windowedResidency),
      widthScale: normalizeReaderWidthScale(source.widthScale),
    };
  }

  function normalizeGroupsSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultSettings?.groups || {};
    return {
      railEnabled: Boolean(source.railEnabled ?? defaults.railEnabled ?? true),
    };
  }

  function normalizeTagManagerSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultSettings?.tagManager || {};
    const allowedRolloutStages = new Set(["disabled", "internal", "beta", "stable"]);
    const rolloutStageRaw = String(source.rolloutStage ?? defaults.rolloutStage ?? "stable").trim().toLowerCase();
    const rolloutStage = allowedRolloutStages.has(rolloutStageRaw) ? rolloutStageRaw : "stable";
    return {
      rolloutStage,
      telemetryEnabled: Boolean(source.telemetryEnabled ?? defaults.telemetryEnabled ?? true),
    };
  }

  function normalizeLibraryScopedSettingsMigration(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultSettings?.libraryScopedSettingsMigration || {};
    const allowedRolloutStages = new Set(["disabled", "internal", "beta", "stable"]);
    const allowedReleaseRings = new Set(["internal", "beta", "stable"]);
    const rolloutStageRaw = String(source.rolloutStage ?? defaults.rolloutStage ?? "stable").trim().toLowerCase();
    const releaseRingRaw = String(source.releaseRing ?? defaults.releaseRing ?? "stable").trim().toLowerCase();
    return {
      rolloutStage: allowedRolloutStages.has(rolloutStageRaw) ? rolloutStageRaw : "stable",
      releaseRing: allowedReleaseRings.has(releaseRingRaw) ? releaseRingRaw : "stable",
      migrationEnabled: Boolean(source.migrationEnabled ?? defaults.migrationEnabled ?? true),
      telemetryEnabled: Boolean(source.telemetryEnabled ?? defaults.telemetryEnabled ?? true),
      legacyReadFallbackEnabled: Boolean(
        source.legacyReadFallbackEnabled ?? defaults.legacyReadFallbackEnabled ?? false,
      ),
    };
  }

  function normalizeUiSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultSettings?.ui || {};
    return {
      customDropdownsV1: Boolean(source.customDropdownsV1 ?? defaults.customDropdownsV1 ?? true),
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
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPlaintextFile, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      console.warn("[settings] failed to read legacy plaintext settings:", String(err));
      return null;
    }
  }

  function readBasicSettings() {
    if (!basicSettingsFile) return null;
    if (!fs.existsSync(basicSettingsFile)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(basicSettingsFile, "utf8"));
      const normalized = normalizeBasicSettings(parsed);
      logSettingsTrace("readBasicSettings:ok", {
        file: basicSettingsFile,
        libraryPath: normalized.libraryPath,
        darkMode: normalized.darkMode,
      });
      return normalized;
    } catch (err) {
      console.warn("[settings] failed to read basic settings; falling back to defaults:", String(err));
      return null;
    }
  }

  function readEncryptedSettings() {
    const paths = resolveSettingsPaths();
    if (requireLibraryScope && paths.libraryRoot && !isPathUnderRoot(paths.libraryRoot, paths.settingsFile)) {
      logScopedPathViolation({
        action: "read",
        errorCode: "SETTINGS_PATH_OUTSIDE_LIBRARY",
        pathValue: paths.settingsFile,
        libraryRoot: paths.libraryRoot,
      });
      return null;
    }
    const canReadPrimary = paths.settingsFile && fs.existsSync(paths.settingsFile);
    const canFallback = Boolean(paths.allowLegacyReadFallback) && paths.legacySettingsFile && fs.existsSync(paths.legacySettingsFile);
    logSettingsTrace("readEncryptedSettings:availability", {
      primaryFile: paths.settingsFile,
      primaryExists: Boolean(canReadPrimary),
      legacyFile: paths.legacySettingsFile,
      legacyExists: Boolean(paths.legacySettingsFile && fs.existsSync(paths.legacySettingsFile)),
      legacyFallbackEnabled: Boolean(paths.allowLegacyReadFallback),
      legacyFallbackAvailable: Boolean(canFallback),
      libraryRoot: paths.libraryRoot,
    });
    if (!canReadPrimary && !canFallback) return null;
    resolvedSettingsFile = canReadPrimary ? paths.settingsFile : paths.legacySettingsFile;
    resolvedSettingsRelPath = paths.settingsRelPath;
    resolvedLegacySettingsFile = String(paths.legacySettingsFile || resolvedLegacySettingsFile || "");
    resolvedAllowLegacyReadFallback = Boolean(paths.allowLegacyReadFallback ?? resolvedAllowLegacyReadFallback);
    resolvedLibraryRoot = String(paths.libraryRoot || resolvedLibraryRoot || "");
    logSettingsTrace("readEncryptedSettings:source", {
      file: resolvedSettingsFile,
      source: canReadPrimary ? "library_scoped" : "legacy_fallback",
      relPath: resolvedSettingsRelPath,
      libraryRoot: resolvedLibraryRoot,
    });
    const decrypted = vaultManager.decryptBufferWithKey({
      relPath: resolvedSettingsRelPath,
      buffer: fs.readFileSync(resolvedSettingsFile),
    });
    const parsed = JSON.parse(decrypted.toString("utf8"));
    logSettingsTrace("readEncryptedSettings:ok", {
      file: resolvedSettingsFile,
      sourceAdapterCount: Object.keys(parsed?.sourceAdapterUrls || {}).length,
      startPagesCount: Array.isArray(parsed?.startPages) ? parsed.startPages.length : 0,
      hasStartPage: Boolean(parsed?.startPage),
    });
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
    const tempPath = `${basicSettingsFile}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
    fs.renameSync(tempPath, basicSettingsFile);
    logSettingsTrace("writeBasicSettings:ok", {
      file: basicSettingsFile,
      libraryPath: normalized.libraryPath,
      darkMode: normalized.darkMode,
    });
  }

  function ensureBasicSettingsFromEncrypted(payload, currentBasic) {
    if (!basicSettingsFile || currentBasic) return null;
    writeBasicSettings(payload);
    return normalizeBasicSettings(payload);
  }

  function writeEncryptedSettings(payload) {
    const paths = resolveSettingsPaths();
    assertLibraryScopedContext(paths, "write");
    resolvedSettingsFile = String(paths.settingsFile || "");
    resolvedSettingsRelPath = String(paths.settingsRelPath || "settings.json");
    resolvedLegacySettingsFile = String(paths.legacySettingsFile || "");
    resolvedAllowLegacyReadFallback = Boolean(paths.allowLegacyReadFallback);
    resolvedLibraryRoot = String(paths.libraryRoot || "");
    if (!resolvedSettingsFile) {
      throw new Error("Settings path is not configured for active library context.");
    }
    const encrypted = vaultManager.encryptBufferWithKey({
      relPath: resolvedSettingsRelPath,
      buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
    });
    const tempPath = `${resolvedSettingsFile}.tmp`;
    const dirPath = path.dirname(resolvedSettingsFile);
    fs.mkdirSync(dirPath, { recursive: true });

    let fd = null;
    try {
      fd = fs.openSync(tempPath, "w");
      let offset = 0;
      while (offset < encrypted.length) {
        offset += fs.writeSync(fd, encrypted, offset, encrypted.length - offset);
      }
      fs.fsyncSync(fd);
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // Best effort close.
        }
      }
    }

    fs.renameSync(tempPath, resolvedSettingsFile);

    try {
      const dirFd = fs.openSync(dirPath, "r");
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Directory fsync may be unsupported.
    }

    // Keep a minimal bootstrap copy so the app can recover startup-critical
    // preferences before Vault Mode is unlocked on next startup.
    writeBasicSettings(payload);
    logSettingsTrace("writeEncryptedSettings:ok", {
      file: resolvedSettingsFile,
      relPath: resolvedSettingsRelPath,
      libraryRoot: resolvedLibraryRoot,
      sourceAdapterCount: Object.keys(payload?.sourceAdapterUrls || {}).length,
      startPagesCount: Array.isArray(payload?.startPages) ? payload.startPages.length : 0,
      hasStartPage: Boolean(payload?.startPage),
    });
  }

  function loadBootstrapSettings() {
    const basic = readBasicSettings();
    if (!basic) {
      return {
        libraryPath: "",
        darkMode: normalizeDarkMode(defaultSettings.darkMode),
      };
    }
    return {
      libraryPath: normalizeLibraryPath(basic.libraryPath),
      darkMode: normalizeDarkMode(basic.darkMode ?? defaultSettings.darkMode),
    };
  }

  function loadSettings() {
    const paths = resolveSettingsPaths();
    const scopeKey = [paths.libraryRoot || "", paths.settingsFile || "", paths.settingsRelPath || ""].join("|");
    if (scopeKey !== lastLibraryScopeKey) {
      settingsCache = null;
      lastLibraryScopeKey = scopeKey;
    }
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
        logSettingsTrace("loadSettings:vault_locked_or_uninitialized", {
          vaultEnabled: vaultState.enabled,
          vaultUnlocked: vaultState.unlocked,
          usingBasicSettings: Boolean(basic),
        });
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
      ui: normalizeUiSettings(raw.ui ?? defaultSettings.ui),
      tagManager: normalizeTagManagerSettings(raw.tagManager ?? defaultSettings.tagManager),
      libraryScopedSettingsMigration: normalizeLibraryScopedSettingsMigration(
        raw.libraryScopedSettingsMigration ?? defaultSettings.libraryScopedSettingsMigration,
      ),
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

  function saveSettings(next, options = {}) {
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
      ui: normalizeUiSettings(next.ui),
      tagManager: normalizeTagManagerSettings(next.tagManager),
      libraryScopedSettingsMigration: normalizeLibraryScopedSettingsMigration(next.libraryScopedSettingsMigration),
    };
    if (!settingsCache.startPages.length) {
      settingsCache.startPages = Object.values(settingsCache.sourceAdapterUrls).filter(Boolean);
    }
    if (!settingsCache.startPages.length && settingsCache.startPage) {
      settingsCache.startPages = [settingsCache.startPage];
    }
    settingsCache.startPage = settingsCache.startPages[0] || settingsCache.startPage;
    try {
      lastWriteError = null;
      const vaultState = getVaultState();
      logSettingsTrace("saveSettings:begin", {
        libraryPath: settingsCache.libraryPath,
        darkMode: settingsCache.darkMode,
        vaultEnabled: vaultState.enabled,
        vaultUnlocked: vaultState.unlocked,
      });
      const persistBasicOnly = Boolean(options.persistBasicOnly);
      if (vaultState.enabled) {
        if (persistBasicOnly) {
          pendingEncryptedSave = false;
          pendingEncryptedPayload = null;
          writeBasicSettings(settingsCache);
          logSettingsTrace("saveSettings:basic_only", {
            libraryPath: settingsCache.libraryPath,
            darkMode: settingsCache.darkMode,
            vaultUnlocked: vaultState.unlocked,
          });
        } else if (vaultState.unlocked) {
          writeEncryptedSettings(settingsCache);
          pendingEncryptedSave = false;
          pendingEncryptedPayload = null;
        } else {
          const persistBasicOnlyWhenVaultLocked = Boolean(options.persistBasicOnlyWhenVaultLocked);
          if (persistBasicOnlyWhenVaultLocked) {
            pendingEncryptedSave = false;
            pendingEncryptedPayload = null;
            logSettingsTrace("saveSettings:vault_locked_basic_only", {
              libraryPath: settingsCache.libraryPath,
              darkMode: settingsCache.darkMode,
            });
          } else {
            pendingEncryptedSave = true;
            pendingEncryptedPayload = { ...settingsCache };
          }
          // Keep bootstrap settings current even when encrypted write is
          // deferred until unlock.
          writeBasicSettings(settingsCache);
          if (!options.suppressVaultLockedWarning) {
            console.warn("[settings] write skipped: Vault Mode is locked.");
          }
        }
      } else {
        // Current builds should not regenerate legacy plaintext settings.json.
        // Persist only startup-safe bootstrap settings in compatibility mode.
        writeBasicSettings(settingsCache);
      }
    } catch (err) {
      lastWriteError = {
        code: "SETTINGS_WRITE_FAILED",
        message: String(err?.message || err || "Failed to persist settings."),
      };
      try {
        // Preserve startup-critical bootstrap settings even if encrypted
        // persistence fails (for example due transient library path issues).
        writeBasicSettings(settingsCache);
      } catch {
        // Best effort fallback only.
      }
      logSettingsTrace("saveSettings:failed", {
        libraryPath: settingsCache?.libraryPath || "",
        error: String(err?.message || err || "unknown"),
      });
      console.warn("[settings write failed]", String(err));
    }
    applyNativeTheme(settingsCache.darkMode);
    return { ...settingsCache };
  }

  function updateSettings(partial, options = {}) {
    const current = loadSettings();
    return saveSettings({
      ...current,
      ...partial,
    }, options);
  }

  return {
    applyNativeTheme,
    getSettings,
    loadBootstrapSettings,
    loadSettings,
    updateSettings,
    rebindLibraryContext(nextContext = {}) {
      if (nextContext && typeof nextContext === "object") {
        if (typeof nextContext.settingsFile === "string") {
          resolvedSettingsFile = nextContext.settingsFile;
        }
        if (typeof nextContext.settingsRelPath === "string" && nextContext.settingsRelPath.trim()) {
          resolvedSettingsRelPath = nextContext.settingsRelPath.trim();
        }
        if (typeof nextContext.legacySettingsFile === "string") {
          resolvedLegacySettingsFile = nextContext.legacySettingsFile;
        }
        if (Object.prototype.hasOwnProperty.call(nextContext, "allowLegacyReadFallback")) {
          resolvedAllowLegacyReadFallback = Boolean(nextContext.allowLegacyReadFallback);
        }
        if (typeof nextContext.libraryRoot === "string") {
          resolvedLibraryRoot = nextContext.libraryRoot;
        }
      }
      lastLibraryScopeKey = "";
      settingsCache = null;
      return {
        settingsFile: resolvedSettingsFile,
        settingsRelPath: resolvedSettingsRelPath,
        legacySettingsFile: resolvedLegacySettingsFile,
        allowLegacyReadFallback: resolvedAllowLegacyReadFallback,
        libraryRoot: resolvedLibraryRoot,
      };
    },
    consumeLastWriteError() {
      const err = lastWriteError;
      lastWriteError = null;
      return err ? { ...err } : null;
    },
    reloadSettings() {
      if (pendingEncryptedSave && vaultManager?.isUnlocked?.()) {
        const pendingPayload = pendingEncryptedPayload || settingsCache;
        try {
          if (pendingPayload) {
            writeEncryptedSettings(pendingPayload);
            pendingEncryptedSave = false;
            pendingEncryptedPayload = null;
          } else {
            console.warn("[settings] pending encrypted save had no payload to flush.");
          }
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
