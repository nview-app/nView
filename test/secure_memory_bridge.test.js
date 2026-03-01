const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bridgePath = require.resolve("../main/native/secure_memory_bridge");
const policyPath = require.resolve("../main/native/secure_memory_policy");

function withBridgeEnvironment({ addonSource, env = {} }, run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-secure-mem-"));
  const addonPath = path.join(tempDir, "addon.js");
  fs.writeFileSync(addonPath, addonSource, "utf8");

  const previous = {
    NVIEW_SECURE_MEM_ADDON_PATH: process.env.NVIEW_SECURE_MEM_ADDON_PATH,
    NVIEW_SECURE_MEM_ENABLED: process.env.NVIEW_SECURE_MEM_ENABLED,
    NVIEW_SECURE_MEM_STRICT: process.env.NVIEW_SECURE_MEM_STRICT,
  };

  process.env.NVIEW_SECURE_MEM_ADDON_PATH = addonPath;
  if (Object.prototype.hasOwnProperty.call(env, "NVIEW_SECURE_MEM_ENABLED")) process.env.NVIEW_SECURE_MEM_ENABLED = env.NVIEW_SECURE_MEM_ENABLED;
  else delete process.env.NVIEW_SECURE_MEM_ENABLED;
  if (Object.prototype.hasOwnProperty.call(env, "NVIEW_SECURE_MEM_STRICT")) process.env.NVIEW_SECURE_MEM_STRICT = env.NVIEW_SECURE_MEM_STRICT;
  else delete process.env.NVIEW_SECURE_MEM_STRICT;

  delete require.cache[bridgePath];
  delete require.cache[policyPath];
  const bridge = require("../main/native/secure_memory_bridge");

  const restore = () => {
    delete require.cache[bridgePath];
    delete require.cache[policyPath];
    if (previous.NVIEW_SECURE_MEM_ADDON_PATH == null) delete process.env.NVIEW_SECURE_MEM_ADDON_PATH;
    else process.env.NVIEW_SECURE_MEM_ADDON_PATH = previous.NVIEW_SECURE_MEM_ADDON_PATH;
    if (previous.NVIEW_SECURE_MEM_ENABLED == null) delete process.env.NVIEW_SECURE_MEM_ENABLED;
    else process.env.NVIEW_SECURE_MEM_ENABLED = previous.NVIEW_SECURE_MEM_ENABLED;
    if (previous.NVIEW_SECURE_MEM_STRICT == null) delete process.env.NVIEW_SECURE_MEM_STRICT;
    else process.env.NVIEW_SECURE_MEM_STRICT = previous.NVIEW_SECURE_MEM_STRICT;
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  try {
    return run(bridge);
  } finally {
    restore();
  }
}

test("withLockedBuffer locks, unlocks, and wipes via addon", () => {
  const addonSource = `
let lockCalls = 0;
let unlockCalls = 0;
let wipeCalls = 0;
module.exports = {
  isSupported() { return true; },
  lockBuffer() { lockCalls += 1; return { ok: true, locked: true }; },
  unlockBuffer() { unlockCalls += 1; return { ok: true }; },
  wipeBuffer(buffer) { wipeCalls += 1; buffer.fill(0); return { ok: true }; },
  getCounts() { return { lockCalls, unlockCalls, wipeCalls }; },
};
`;

  withBridgeEnvironment({ addonSource }, (bridge) => {
    const telemetry = [];
    bridge.setTelemetrySink((event) => telemetry.push(event));

    const secret = Buffer.from("super-secret", "utf8");
    const seenBeforeWipe = bridge.withLockedBuffer(secret, (buffer) => buffer.toString("utf8"));

    const addon = require(process.env.NVIEW_SECURE_MEM_ADDON_PATH);
    assert.equal(seenBeforeWipe, "super-secret");
    assert.deepEqual(addon.getCounts(), { lockCalls: 1, unlockCalls: 1, wipeCalls: 1 });
    assert.deepEqual(secret, Buffer.alloc(secret.length, 0));

    const stats = bridge.getSecureMemoryStats();
    assert.equal(stats.lockAttempts, 1);
    assert.equal(stats.lockSuccess, 1);
    assert.equal(stats.lockFail, 0);
    assert.equal(stats.wipeAttempts, 1);
    assert.equal(stats.wipeSuccess, 1);
    assert.equal(stats.fallbackUsage, 0);

    assert.deepEqual(telemetry.map((event) => event.code), ["ADDON_LOAD_OK", "LOCK_OK", "UNLOCK_OK", "WIPE_OK"]);
  });
});

test("non-strict mode falls back and still wipes on callback throw", () => {
  const addonSource = `
module.exports = {
  isSupported() { return true; },
  lockBuffer() { return { ok: true, locked: false }; },
  unlockBuffer() { return { ok: true }; },
  wipeBuffer(buffer) { buffer.fill(0); return { ok: true }; },
};
`;

  withBridgeEnvironment({ addonSource, env: { NVIEW_SECURE_MEM_STRICT: "0" } }, (bridge) => {
    const secret = Buffer.from("unsafe-secret", "utf8");

    assert.throws(
      () => bridge.withLockedBuffer(secret, () => {
        throw new Error("boom");
      }),
      /boom/
    );

    assert.deepEqual(secret, Buffer.alloc(secret.length, 0));
    const stats = bridge.getSecureMemoryStats();
    assert.equal(stats.fallbackUsage, 1);
    assert.equal(stats.wipeAttempts, 1);
  });
});

test("strict mode fails closed when lock is unavailable", () => {
  const addonSource = `
module.exports = {
  isSupported() { return true; },
  lockBuffer() { return { ok: true, locked: false }; },
  unlockBuffer() { return { ok: true }; },
  wipeBuffer(buffer) { buffer.fill(0); return { ok: true }; },
};
`;

  withBridgeEnvironment({ addonSource, env: { NVIEW_SECURE_MEM_STRICT: "1" } }, (bridge) => {
    const secret = Buffer.from("strict-secret", "utf8");
    assert.throws(() => bridge.withLockedBuffer(secret, () => "never"), /required but unavailable/);
  });
});

test("addon load failure warns once and uses fallback wipe", () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  const previousAddonPath = process.env.NVIEW_SECURE_MEM_ADDON_PATH;
  const previousEnabled = process.env.NVIEW_SECURE_MEM_ENABLED;
  const previousStrict = process.env.NVIEW_SECURE_MEM_STRICT;

  process.env.NVIEW_SECURE_MEM_ADDON_PATH = path.join(os.tmpdir(), "does-not-exist-addon.node");
  delete process.env.NVIEW_SECURE_MEM_ENABLED;
  delete process.env.NVIEW_SECURE_MEM_STRICT;

  delete require.cache[bridgePath];
  delete require.cache[policyPath];
  const bridge = require("../main/native/secure_memory_bridge");

  try {
    const a = Buffer.from("a", "utf8");
    const b = Buffer.from("b", "utf8");
    bridge.withLockedBuffer(a, () => true);
    bridge.withLockedBuffer(b, () => true);

    assert.equal(warnings.filter((line) => String(line).includes("ADDON_LOAD_FAIL")).length, 1);
    assert.deepEqual(a, Buffer.alloc(1, 0));
    assert.deepEqual(b, Buffer.alloc(1, 0));
  } finally {
    console.warn = previousWarn;
    if (previousAddonPath == null) delete process.env.NVIEW_SECURE_MEM_ADDON_PATH;
    else process.env.NVIEW_SECURE_MEM_ADDON_PATH = previousAddonPath;
    if (previousEnabled == null) delete process.env.NVIEW_SECURE_MEM_ENABLED;
    else process.env.NVIEW_SECURE_MEM_ENABLED = previousEnabled;
    if (previousStrict == null) delete process.env.NVIEW_SECURE_MEM_STRICT;
    else process.env.NVIEW_SECURE_MEM_STRICT = previousStrict;
    delete require.cache[bridgePath];
    delete require.cache[policyPath];
  }
});

test("withLockedTransientBuffer uses a wiped clone and preserves source bytes", () => {
  const addonSource = `
module.exports = {
  isSupported() { return true; },
  lockBuffer() { return { ok: true, locked: true }; },
  unlockBuffer() { return { ok: true }; },
  wipeBuffer(buffer) { buffer.fill(0); return { ok: true }; },
};
`;

  withBridgeEnvironment({ addonSource }, (bridge) => {
    const source = Buffer.from("tag-bytes", "utf8");
    let transientSeen = null;

    bridge.withLockedTransientBuffer(source, (lockedBuffer) => {
      transientSeen = Buffer.from(lockedBuffer);
      lockedBuffer.write("X", 0, "utf8");
    });

    assert.equal(source.toString("utf8"), "tag-bytes");
    assert.equal(transientSeen.toString("utf8"), "tag-bytes");
  });
});
