const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

const { createDirectEncryptionHelpers } = require("../main/direct_encryption");

function createVaultManager(key) {
  return {
    isInitialized: () => true,
    isUnlocked: () => true,
    withFileKey: async (_relPath, fn) => fn(Buffer.from(key)),
  };
}

test("encryptStreamToFile preserves direct-download encryption flow with vault-derived key", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-direct-encryption-"));
  const outputPath = path.join(tempDir, "payload.bin.enc");
  const plaintext = Buffer.from("phase7-direct-download-payload", "utf8");
  const key = crypto.randomBytes(32);

  try {
    const helpers = createDirectEncryptionHelpers({
      vaultManager: createVaultManager(key),
      getVaultRelPath: (filePath) => path.relative(tempDir, filePath).replaceAll("\\", "/"),
    });

    const meta = await helpers.encryptStreamToFile({
      inputStream: Readable.from(plaintext),
      outputPath,
      relPath: "downloads/item.png",
    });

    assert.equal(meta.kdf, "vault");
    assert.equal(meta.iv.length, 12);
    assert.equal(meta.tag.length, 16);

    const encrypted = fs.readFileSync(outputPath);
    assert.notDeepEqual(encrypted, plaintext);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, meta.iv);
    decipher.setAAD(Buffer.from(meta.aad, "utf8"));
    decipher.setAuthTag(meta.tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    assert.deepEqual(decrypted, plaintext);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("encryptStreamToFile removes partial output when stream encryption fails", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-direct-encryption-fail-"));
  const outputPath = path.join(tempDir, "partial.bin.enc");
  const key = crypto.randomBytes(32);

  const failingStream = new Readable({
    read() {
      this.push(Buffer.from("partial", "utf8"));
      this.destroy(new Error("stream failed"));
    },
  });

  const helpers = createDirectEncryptionHelpers({
    vaultManager: createVaultManager(key),
    getVaultRelPath: () => "downloads/partial.png",
  });

  try {
    await assert.rejects(
      () => helpers.encryptStreamToFile({ inputStream: failingStream, outputPath, relPath: "downloads/partial.png" }),
      /stream failed/
    );
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
