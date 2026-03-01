const path = require("node:path");
const { getSecureMemoryPolicy } = require("./secure_memory_policy");

const metrics = {
  lockAttempts: 0,
  lockSuccess: 0,
  lockFail: 0,
  wipeAttempts: 0,
  wipeSuccess: 0,
  fallbackUsage: 0,
};

const warnedCodes = new Set();
let telemetrySink = null;
let addonState = {
  attempted: false,
  addon: null,
  loadErrorCode: null,
};

function sanitizeErrorCode(err) {
  const code = err && typeof err === "object" && typeof err.code === "string" ? err.code : "UNKNOWN";
  return code.replace(/[^A-Z0-9_]/gi, "_").toUpperCase() || "UNKNOWN";
}

function warnOnce(code) {
  if (warnedCodes.has(code)) return;
  warnedCodes.add(code);
  console.warn(`[secure-memory] fallback path active (${code})`);
}

function emitTelemetry(event, code) {
  if (typeof telemetrySink === "function") {
    telemetrySink({ component: "secure_memory_bridge", event, code });
  }
}

function getAddonPath() {
  if (process.env.NVIEW_SECURE_MEM_ADDON_PATH) {
    return path.resolve(process.env.NVIEW_SECURE_MEM_ADDON_PATH);
  }
  return path.resolve(__dirname, "../../native/build/Release/addon.node");
}

function getAddon() {
  if (addonState.attempted) {
    return addonState.addon;
  }
  addonState.attempted = true;
  try {
    addonState.addon = require(getAddonPath());
    addonState.loadErrorCode = null;
    emitTelemetry("addon_load", "ADDON_LOAD_OK");
    return addonState.addon;
  } catch (err) {
    addonState.addon = null;
    addonState.loadErrorCode = "ADDON_LOAD_FAIL";
    warnOnce("ADDON_LOAD_FAIL");
    emitTelemetry("addon_load", addonState.loadErrorCode || sanitizeErrorCode(err));
    return null;
  }
}

function supported() {
  const { enabled } = getSecureMemoryPolicy();
  if (!enabled) return false;
  const addon = getAddon();
  if (!addon || typeof addon.isSupported !== "function") {
    return false;
  }
  try {
    return addon.isSupported() === true;
  } catch (err) {
    warnOnce("LOCK_UNSUPPORTED");
    emitTelemetry("supported_check", "LOCK_UNSUPPORTED");
    return false;
  }
}

function runWithFinally(action, cleanup) {
  let actionResult;
  try {
    actionResult = action();
  } catch (err) {
    cleanup();
    throw err;
  }
  if (actionResult && typeof actionResult.then === "function") {
    return actionResult.finally(cleanup);
  }
  cleanup();
  return actionResult;
}

function wipe(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("wipe expects a Buffer");
  }
  metrics.wipeAttempts += 1;
  const addon = getAddon();
  if (addon && typeof addon.wipeBuffer === "function") {
    try {
      const result = addon.wipeBuffer(buffer);
      if (result && result.ok === true) {
        metrics.wipeSuccess += 1;
        emitTelemetry("wipe", "WIPE_OK");
        return true;
      }
      emitTelemetry("wipe", "WIPE_FAIL");
    } catch (err) {
      emitTelemetry("wipe", "WIPE_FAIL");
    }
  }

  try {
    buffer.fill(0);
    metrics.wipeSuccess += 1;
    metrics.fallbackUsage += 1;
    warnOnce("WIPE_FALLBACK");
    emitTelemetry("wipe", "WIPE_FALLBACK");
    return true;
  } catch (err) {
    const { strict } = getSecureMemoryPolicy();
    emitTelemetry("wipe", "WIPE_EXCEPTION");
    if (strict) {
      throw new Error("Secure memory wipe failed");
    }
    return false;
  }
}

function withLockedBuffer(buffer, fn) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("withLockedBuffer expects a Buffer");
  }
  if (typeof fn !== "function") {
    throw new TypeError("withLockedBuffer expects a function");
  }

  const policy = getSecureMemoryPolicy();
  const addon = getAddon();

  const invokeFallback = (code) => {
    metrics.fallbackUsage += 1;
    warnOnce(code);
    emitTelemetry("lock", code);
    if (policy.strict) {
      throw new Error("Secure memory lock required but unavailable");
    }
    return runWithFinally(() => fn(buffer), () => {
      wipe(buffer);
    });
  };

  if (!policy.enabled) {
    return invokeFallback("LOCK_POLICY_DISABLED");
  }

  if (!addon || typeof addon.lockBuffer !== "function" || typeof addon.unlockBuffer !== "function") {
    return invokeFallback("LOCK_UNSUPPORTED");
  }

  metrics.lockAttempts += 1;
  let lockResult;
  try {
    lockResult = addon.lockBuffer(buffer);
  } catch (err) {
    metrics.lockFail += 1;
    return invokeFallback("LOCK_EXCEPTION");
  }

  if (!lockResult || lockResult.ok !== true) {
    metrics.lockFail += 1;
    return invokeFallback("LOCK_FAIL");
  }
  if (lockResult.locked !== true) {
    metrics.lockFail += 1;
    return invokeFallback("LOCK_UNSUPPORTED");
  }

  metrics.lockSuccess += 1;
  emitTelemetry("lock", "LOCK_OK");

  return runWithFinally(() => fn(buffer), () => {
    try {
      const unlockResult = addon.unlockBuffer(buffer);
      if (!unlockResult || unlockResult.ok !== true) {
        emitTelemetry("unlock", "UNLOCK_FAIL");
        if (policy.strict) throw new Error("Secure memory unlock failed");
      } else {
        emitTelemetry("unlock", "UNLOCK_OK");
      }
    } finally {
      wipe(buffer);
    }
  });
}

function withLockedTransientBuffer(sourceBuffer, fn) {
  if (!Buffer.isBuffer(sourceBuffer)) {
    throw new TypeError("withLockedTransientBuffer expects a Buffer");
  }
  if (typeof fn !== "function") {
    throw new TypeError("withLockedTransientBuffer expects a function");
  }
  const transient = Buffer.from(sourceBuffer);
  return withLockedBuffer(transient, fn);
}

function setTelemetrySink(sink) {
  telemetrySink = typeof sink === "function" ? sink : null;
}

function getSecureMemoryStats() {
  return { ...metrics };
}

function resetSecureMemoryState() {
  metrics.lockAttempts = 0;
  metrics.lockSuccess = 0;
  metrics.lockFail = 0;
  metrics.wipeAttempts = 0;
  metrics.wipeSuccess = 0;
  metrics.fallbackUsage = 0;
  warnedCodes.clear();
  telemetrySink = null;
  addonState = {
    attempted: false,
    addon: null,
    loadErrorCode: null,
  };
}

module.exports = {
  getSecureMemoryStats,
  resetSecureMemoryState,
  setTelemetrySink,
  supported,
  withLockedBuffer,
  withLockedTransientBuffer,
  wipe,
};
