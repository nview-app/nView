#!/usr/bin/env node
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const {
  getSecureMemoryPolicy,
} = require(path.join(repoRoot, "main", "native", "secure_memory_policy"));
const {
  supported,
  getSecureMemoryStats,
  resetSecureMemoryState,
  withLockedBuffer,
  withLockedTransientBuffer,
} = require(path.join(repoRoot, "main", "native", "secure_memory_bridge"));

function exerciseSecureMemoryRuntime() {
  const probe = Buffer.from("secure-memory-ops-probe", "utf8");
  const probeTransient = Buffer.from("secure-memory-ops-transient", "utf8");
  const result = {
    lockPathUsed: false,
    transientPathUsed: false,
    probeWiped: false,
    transientSourceRetained: true,
    error: null,
  };

  try {
    withLockedBuffer(probe, (locked) => {
      result.lockPathUsed = Buffer.isBuffer(locked);
      return true;
    });
    withLockedTransientBuffer(probeTransient, (lockedTransient) => {
      result.transientPathUsed = Buffer.isBuffer(lockedTransient);
      return true;
    });
    result.probeWiped = probe.equals(Buffer.alloc(probe.length, 0));
    result.transientSourceRetained = probeTransient.equals(Buffer.from("secure-memory-ops-transient", "utf8"));
  } catch (error) {
    result.error = error && error.message ? error.message : "secure-memory runtime exercise failed";
  }

  return result;
}

function withCapturedWarnings(action) {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args.map((v) => String(v)).join(" "));
  };

  try {
    const value = action(warnings);
    return { value, warnings };
  } finally {
    console.warn = previousWarn;
  }
}

function buildAssessment({ policy, nativeSupported, runtimeExercise, stats }) {
  const strictBlocked = Boolean(runtimeExercise.error && policy.strict);
  const fallbackObserved = stats.fallbackUsage > 0;
  const nativePathHealthy =
    runtimeExercise.lockPathUsed === true &&
    runtimeExercise.transientPathUsed === true &&
    runtimeExercise.probeWiped === true &&
    runtimeExercise.error == null &&
    fallbackObserved === false;

  return {
    ok: policy.enabled ? nativePathHealthy : runtimeExercise.lockPathUsed,
    nativePathHealthy,
    fallbackObserved,
    strictBlocked,
    summary: policy.enabled
      ? nativePathHealthy
        ? "Secure-memory native runtime path exercised successfully"
        : "Secure-memory runtime path degraded; inspect fallback and warning fields"
      : "Secure-memory policy disabled; fallback runtime behavior exercised",
  };
}

function runOpsCheck(options = {}) {
  const silent = Boolean(options && options.silent);
  resetSecureMemoryState();

  const { value } = withCapturedWarnings((warnings) => {
    const policy = getSecureMemoryPolicy();
    const nativeSupported = supported();
    const runtimeExercise = exerciseSecureMemoryRuntime();
    const stats = getSecureMemoryStats();

    const result = {
      component: "secure_memory",
      policy,
      nativeSupported,
      runtimeExercise,
      stats,
      assessment: buildAssessment({ policy, nativeSupported, runtimeExercise, stats }),
      warnings,
      addonPathOverride: process.env.NVIEW_SECURE_MEM_ADDON_PATH || null,
    };

    return result;
  });

  if (!silent) {
    console.log(JSON.stringify(value, null, 2));
  }
  return value;
}

if (require.main === module) {
  try {
    runOpsCheck();
  } catch (error) {
    console.error(`[secure-memory-ops-check] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { runOpsCheck };
