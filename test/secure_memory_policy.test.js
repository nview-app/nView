const test = require("node:test");
const assert = require("node:assert/strict");

const policyPath = require.resolve("../main/native/secure_memory_policy");

function withPolicyEnv(env, run) {
  const previousEnabled = process.env.NVIEW_SECURE_MEM_ENABLED;
  const previousStrict = process.env.NVIEW_SECURE_MEM_STRICT;

  if (Object.prototype.hasOwnProperty.call(env, "NVIEW_SECURE_MEM_ENABLED")) {
    process.env.NVIEW_SECURE_MEM_ENABLED = env.NVIEW_SECURE_MEM_ENABLED;
  } else {
    delete process.env.NVIEW_SECURE_MEM_ENABLED;
  }

  if (Object.prototype.hasOwnProperty.call(env, "NVIEW_SECURE_MEM_STRICT")) {
    process.env.NVIEW_SECURE_MEM_STRICT = env.NVIEW_SECURE_MEM_STRICT;
  } else {
    delete process.env.NVIEW_SECURE_MEM_STRICT;
  }

  delete require.cache[policyPath];
  const policy = require("../main/native/secure_memory_policy");

  try {
    run(policy);
  } finally {
    if (previousEnabled == null) delete process.env.NVIEW_SECURE_MEM_ENABLED;
    else process.env.NVIEW_SECURE_MEM_ENABLED = previousEnabled;

    if (previousStrict == null) delete process.env.NVIEW_SECURE_MEM_STRICT;
    else process.env.NVIEW_SECURE_MEM_STRICT = previousStrict;

    delete require.cache[policyPath];
  }
}

test("secure memory policy defaults to enabled, non-strict", () => {
  withPolicyEnv({}, ({ getSecureMemoryPolicy }) => {
    assert.deepEqual(getSecureMemoryPolicy(), { enabled: true, strict: false });
  });
});

test("secure memory policy parses explicit disable + strict", () => {
  withPolicyEnv({ NVIEW_SECURE_MEM_ENABLED: "0", NVIEW_SECURE_MEM_STRICT: "true" }, ({ getSecureMemoryPolicy }) => {
    assert.deepEqual(getSecureMemoryPolicy(), { enabled: false, strict: true });
  });
});
