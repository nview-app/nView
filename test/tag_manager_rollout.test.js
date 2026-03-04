const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRolloutStage, resolveTagManagerRollout } = require('../main/tag_manager_rollout');

test('normalizeRolloutStage bounds values', () => {
  assert.equal(normalizeRolloutStage('beta'), 'beta');
  assert.equal(normalizeRolloutStage(' BETA '), 'beta');
  assert.equal(normalizeRolloutStage('unknown'), 'stable');
});

test('resolveTagManagerRollout honors settings and env overrides', () => {
  const originalStage = process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  const originalTelemetry = process.env.NVIEW_TAG_MANAGER_TELEMETRY_ENABLED;
  delete process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  delete process.env.NVIEW_TAG_MANAGER_TELEMETRY_ENABLED;

  const fromSettings = resolveTagManagerRollout({
    getSettings: () => ({ tagManager: { rolloutStage: 'disabled', telemetryEnabled: false } }),
  });
  assert.deepEqual(fromSettings, { rolloutStage: 'disabled', enabled: false, telemetryEnabled: false });

  process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE = 'beta';
  process.env.NVIEW_TAG_MANAGER_TELEMETRY_ENABLED = 'false';
  const fromEnv = resolveTagManagerRollout({
    getSettings: () => ({ tagManager: { rolloutStage: 'stable', telemetryEnabled: true } }),
  });
  assert.deepEqual(fromEnv, { rolloutStage: 'beta', enabled: true, telemetryEnabled: false });

  if (originalStage === undefined) delete process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  else process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE = originalStage;
  if (originalTelemetry === undefined) delete process.env.NVIEW_TAG_MANAGER_TELEMETRY_ENABLED;
  else process.env.NVIEW_TAG_MANAGER_TELEMETRY_ENABLED = originalTelemetry;
});
