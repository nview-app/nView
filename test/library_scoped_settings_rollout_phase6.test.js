const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveLibraryScopedSettingsRollout,
  shouldEnableForRing,
} = require("../main/library_scoped_settings_rollout");

function withEnv(vars, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(vars)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("ring gating only enables configured rollout windows", () => {
  assert.equal(shouldEnableForRing("internal", "internal"), true);
  assert.equal(shouldEnableForRing("internal", "beta"), false);
  assert.equal(shouldEnableForRing("beta", "beta"), true);
  assert.equal(shouldEnableForRing("beta", "stable"), false);
  assert.equal(shouldEnableForRing("stable", "stable"), true);
  assert.equal(shouldEnableForRing("disabled", "internal"), false);
});

test("resolveLibraryScopedSettingsRollout normalizes values and supports kill switch", () => {
  withEnv({
    NVIEW_LIBRARY_SCOPED_SETTINGS_ROLLOUT_STAGE: "beta",
    NVIEW_RELEASE_RING: "stable",
    NVIEW_LIBRARY_SCOPED_SETTINGS_MIGRATION_ENABLED: "1",
    NVIEW_LIBRARY_SCOPED_SETTINGS_MIGRATION_TELEMETRY_ENABLED: "0",
    NVIEW_LIBRARY_SCOPED_SETTINGS_LEGACY_READ_FALLBACK: "true",
  }, () => {
    const rollout = resolveLibraryScopedSettingsRollout({
      getSettings: () => ({
        libraryScopedSettingsMigration: {
          rolloutStage: "internal",
          releaseRing: "internal",
          migrationEnabled: true,
          telemetryEnabled: true,
          legacyReadFallbackEnabled: false,
        },
      }),
    });

    assert.equal(rollout.rolloutStage, "beta");
    assert.equal(rollout.releaseRing, "stable");
    assert.equal(rollout.enabled, false);
    assert.equal(rollout.migrationEnabled, false);
    assert.equal(rollout.telemetryEnabled, false);
    assert.equal(rollout.legacyReadFallbackEnabled, true);
  });
});
