function normalizeRolloutStage(value) {
  const stage = String(value || "").trim().toLowerCase();
  if (["disabled", "internal", "beta", "stable"].includes(stage)) return stage;
  return "stable";
}

function resolveTagManagerRollout(settingsManager) {
  const envStage = process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  const envTelemetry = process.env.NVIEW_TAG_MANAGER_TELEMETRY_ENABLED;
  const settings = settingsManager?.getSettings?.() || {};
  const config = settings?.tagManager && typeof settings.tagManager === "object" ? settings.tagManager : {};

  const rolloutStage = normalizeRolloutStage(envStage ?? config.rolloutStage ?? "stable");
  const telemetryEnabled = envTelemetry === undefined
    ? Boolean(config.telemetryEnabled ?? true)
    : !["0", "false", "off"].includes(String(envTelemetry).trim().toLowerCase());

  return {
    rolloutStage,
    enabled: rolloutStage !== "disabled",
    telemetryEnabled,
  };
}

module.exports = {
  normalizeRolloutStage,
  resolveTagManagerRollout,
};
