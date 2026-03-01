const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const vaultModulePath = require.resolve("../main/vault");
const bridgeModulePath = require.resolve("../main/native/secure_memory_bridge");

function withVaultAndBridge(run) {
  const calls = [];
  const previousBridge = require.cache[bridgeModulePath];
  const previousVault = require.cache[vaultModulePath];

  require.cache[bridgeModulePath] = {
    id: bridgeModulePath,
    filename: bridgeModulePath,
    loaded: true,
    exports: {
      withLockedBuffer(buffer, fn) {
        calls.push({
          before: Buffer.from(buffer),
          length: buffer.length,
        });
        try {
          return fn(buffer);
        } finally {
          buffer.fill(0);
          calls[calls.length - 1].after = Buffer.from(buffer);
        }
      },
    },
  };

  delete require.cache[vaultModulePath];
  const { createVaultManager } = require("../main/vault");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nview-vault-secure-memory-"));

  const cleanup = () => {
    delete require.cache[vaultModulePath];
    if (previousVault) require.cache[vaultModulePath] = previousVault;
    if (previousBridge) require.cache[bridgeModulePath] = previousBridge;
    else delete require.cache[bridgeModulePath];
    fs.rmSync(tempRoot, { recursive: true, force: true });
  };

  try {
    return run({
      calls,
      tempRoot,
      createManager: () => createVaultManager({ getLibraryRoot: () => tempRoot }),
    });
  } finally {
    cleanup();
  }
}

test("vault init and unlock derive KEK via protected secure-memory wrapper", () => {
  withVaultAndBridge(({ createManager, calls }) => {
    const manager = createManager();

    const initResult = manager.vaultInit(Buffer.from("correct horse battery staple", "utf8"));
    assert.deepEqual(initResult, { ok: true });
    assert.equal(calls.length, 1);
    assert.notDeepEqual(calls[0].before, Buffer.alloc(calls[0].length, 0));
    assert.deepEqual(calls[0].after, Buffer.alloc(calls[0].length, 0));

    manager.vaultLock();

    const unlockResult = manager.vaultUnlock(Buffer.from("correct horse battery staple", "utf8"));
    assert.deepEqual(unlockResult, { ok: true });
    assert.equal(calls.length, 2);
    assert.notDeepEqual(calls[1].before, Buffer.alloc(calls[1].length, 0));
    assert.deepEqual(calls[1].after, Buffer.alloc(calls[1].length, 0));
  });
});

test("vault unlock wrong passphrase still wipes KEK buffer", () => {
  withVaultAndBridge(({ createManager, calls }) => {
    const manager = createManager();
    assert.deepEqual(manager.vaultInit(Buffer.from("good-passphrase", "utf8")), { ok: true });
    manager.vaultLock();

    const unlockResult = manager.vaultUnlock(Buffer.from("bad-passphrase", "utf8"));
    assert.deepEqual(unlockResult, { ok: false, error: "Wrong passphrase" });

    const unlockCall = calls.at(-1);
    assert.ok(unlockCall);
    assert.notDeepEqual(unlockCall.before, Buffer.alloc(unlockCall.length, 0));
    assert.deepEqual(unlockCall.after, Buffer.alloc(unlockCall.length, 0));
  });
});

test("vault init preserves secure-memory cleanup when wrap crypto throws", () => {
  withVaultAndBridge(({ createManager, calls }) => {
    const manager = createManager();
    const originalCreateCipheriv = crypto.createCipheriv;
    crypto.createCipheriv = () => {
      throw new Error("forced wrap failure");
    };

    try {
      assert.throws(() => manager.vaultInit(Buffer.from("passphrase", "utf8")), /forced wrap failure/);
    } finally {
      crypto.createCipheriv = originalCreateCipheriv;
    }

    assert.equal(calls.length, 1);
    assert.notDeepEqual(calls[0].before, Buffer.alloc(calls[0].length, 0));
    assert.deepEqual(calls[0].after, Buffer.alloc(calls[0].length, 0));
  });
});

test("vault file-key operations run through protected secure-memory wrapper", () => {
  withVaultAndBridge(({ createManager, calls }) => {
    const manager = createManager();
    assert.deepEqual(manager.vaultInit(Buffer.from("phase5-passphrase", "utf8")), { ok: true });

    const plainBuffer = Buffer.from("sensitive image bytes", "utf8");
    const encrypted = manager.encryptBufferWithKey({ relPath: "gallery/item.png", buffer: plainBuffer });
    assert.ok(Buffer.isBuffer(encrypted));

    const decrypted = manager.decryptBufferWithKey({ relPath: "gallery/item.png", buffer: encrypted });
    assert.deepEqual(decrypted, plainBuffer);

    const wrappedFileKey = manager.withFileKey("gallery/item.png", (fileKey) => Buffer.from(fileKey));
    assert.equal(wrappedFileKey.length, 32);

    const postInitCalls = calls.slice(1);
    assert.ok(postInitCalls.length >= 3);
    for (const call of postInitCalls) {
      assert.notDeepEqual(call.before, Buffer.alloc(call.length, 0));
      assert.deepEqual(call.after, Buffer.alloc(call.length, 0));
    }
  });
});

test("vault encryptFileToPath uses transient protected wrapper for auth tag writes", async () => {
  const calls = [];
  const previousBridge = require.cache[bridgeModulePath];
  const previousVault = require.cache[vaultModulePath];

  require.cache[bridgeModulePath] = {
    id: bridgeModulePath,
    filename: bridgeModulePath,
    loaded: true,
    exports: {
      withLockedBuffer(buffer, fn) {
        calls.push({ type: "locked", before: Buffer.from(buffer) });
        try {
          return fn(buffer);
        } finally {
          buffer.fill(0);
        }
      },
      withLockedTransientBuffer(buffer, fn) {
        calls.push({ type: "transient", before: Buffer.from(buffer) });
        const transient = Buffer.from(buffer);
        try {
          return fn(transient);
        } finally {
          transient.fill(0);
        }
      },
    },
  };

  delete require.cache[vaultModulePath];
  const { createVaultManager } = require("../main/vault");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nview-vault-phase6-"));

  try {
    const manager = createVaultManager({ getLibraryRoot: () => tempRoot });
    assert.deepEqual(manager.vaultInit(Buffer.from("phase6-passphrase", "utf8")), { ok: true });

    const inputPath = path.join(tempRoot, "in.bin");
    const outputPath = path.join(tempRoot, "out.bin");
    fs.writeFileSync(inputPath, Buffer.from("phase6 stream payload", "utf8"));

    await manager.encryptFileToPath({ relPath: "gallery/phase6.bin", inputPath, outputPath });

    const transientCalls = calls.filter((entry) => entry.type === "transient");
    assert.ok(transientCalls.length >= 1);
    assert.equal(transientCalls.at(-1).before.length, 16);
  } finally {
    delete require.cache[vaultModulePath];
    if (previousVault) require.cache[vaultModulePath] = previousVault;
    if (previousBridge) require.cache[bridgeModulePath] = previousBridge;
    else delete require.cache[bridgeModulePath];
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
