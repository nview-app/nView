function normalizeRolloutStage(value) {
  const stage = String(value || "").trim().toLowerCase();
  if (["disabled", "internal", "beta", "stable"].includes(stage)) return stage;
  return "stable";
}

function normalizeReleaseRing(value) {
  const ring = String(value || "").trim().toLowerCase();
  if (["internal", "beta", "stable"].includes(ring)) return ring;
  return "stable";
}

function parseBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

function shouldEnableForRing(rolloutStage, releaseRing) {
  if (rolloutStage === "disabled") return false;
  const order = {
    internal: 0,
    beta: 1,
    stable: 2,
  };
  const required = order[rolloutStage] ?? order.stable;
  const current = order[releaseRing] ?? order.stable;
  return current <= required;
}

function resolveLibraryScopedSettingsRollout(settingsManager) {
  const settings = settingsManager?.getSettings?.() || {};
  const config = settings?.libraryScopedSettingsMigration && typeof settings.libraryScopedSettingsMigration === "object"
    ? settings.libraryScopedSettingsMigration
    : {};

  const envRolloutStage = process.env.NVIEW_LIBRARY_SCOPED_SETTINGS_ROLLOUT_STAGE;
  const envReleaseRing = process.env.NVIEW_RELEASE_RING;
  const envMigrationEnabled = process.env.NVIEW_LIBRARY_SCOPED_SETTINGS_MIGRATION_ENABLED;
  const envTelemetryEnabled = process.env.NVIEW_LIBRARY_SCOPED_SETTINGS_MIGRATION_TELEMETRY_ENABLED;
  const envLegacyReadFallback = process.env.NVIEW_LIBRARY_SCOPED_SETTINGS_LEGACY_READ_FALLBACK;

  const rolloutStage = normalizeRolloutStage(envRolloutStage ?? config.rolloutStage ?? "stable");
  const releaseRing = normalizeReleaseRing(envReleaseRing ?? config.releaseRing ?? "stable");
  const ringEnabled = shouldEnableForRing(rolloutStage, releaseRing);

  const migrationEnabled = parseBooleanFlag(
    envMigrationEnabled,
    Boolean(config.migrationEnabled ?? true),
  ) && ringEnabled;

  const telemetryEnabled = parseBooleanFlag(
    envTelemetryEnabled,
    Boolean(config.telemetryEnabled ?? true),
  );

  const legacyReadFallbackEnabled = parseBooleanFlag(
    envLegacyReadFallback,
    Boolean(config.legacyReadFallbackEnabled ?? false),
  );

  return {
    rolloutStage,
    releaseRing,
    enabled: ringEnabled,
    migrationEnabled,
    telemetryEnabled,
    legacyReadFallbackEnabled,
  };
}

module.exports = {
  normalizeRolloutStage,
  normalizeReleaseRing,
  resolveLibraryScopedSettingsRollout,
  shouldEnableForRing,
};
