const test = require("node:test");
const assert = require("node:assert/strict");

const { runOpsCheck } = require("../scripts/secure-memory-ops-check");

test("ops check returns policy and bridge stats without sensitive payloads", () => {
  const previousEnabled = process.env.NVIEW_SECURE_MEM_ENABLED;
  const previousStrict = process.env.NVIEW_SECURE_MEM_STRICT;

  process.env.NVIEW_SECURE_MEM_ENABLED = "0";
  process.env.NVIEW_SECURE_MEM_STRICT = "1";

  try {
    const result = runOpsCheck();

    assert.equal(result.component, "secure_memory");
    assert.deepEqual(result.policy, { enabled: false, strict: true });
    assert.equal(typeof result.nativeSupported, "boolean");
    assert.equal(result.runtimeExercise.lockPathUsed, false);
    assert.equal(result.runtimeExercise.transientPathUsed, false);
    assert.equal(result.runtimeExercise.probeWiped, false);
    assert.match(result.runtimeExercise.error || "", /required but unavailable/);
    assert.equal(result.stats.lockAttempts, 0);
    assert.equal(result.stats.wipeAttempts, 0);
    assert.equal(result.assessment.ok, false);
    assert.equal(result.assessment.strictBlocked, true);
    assert.equal(result.warnings.length >= 1, true);
    assert.equal(result.addonPathOverride, null);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "passphrase"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "kek"), false);
  } finally {
    if (previousEnabled == null) delete process.env.NVIEW_SECURE_MEM_ENABLED;
    else process.env.NVIEW_SECURE_MEM_ENABLED = previousEnabled;

    if (previousStrict == null) delete process.env.NVIEW_SECURE_MEM_STRICT;
    else process.env.NVIEW_SECURE_MEM_STRICT = previousStrict;
  }
});


test("ops check supports silent mode", () => {
  const logs = [];
  const previousLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    runOpsCheck({ silent: true });
  } finally {
    console.log = previousLog;
  }
  assert.equal(logs.length, 0);
});
