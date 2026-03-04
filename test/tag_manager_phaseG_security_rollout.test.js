const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { createTagManagerStore, MAX_MANAGED_TAGS } = require("../main/tag_manager_store");
const { registerTagManagerIpcHandlers } = require("../main/ipc/register_tag_manager_ipc");

function createVaultManager() {
  return {
    vaultStatus() {
      return { enabled: true, unlocked: true };
    },
    deriveFileKey(relPath) {
      return crypto.createHash("sha256").update(String(relPath || "")).digest();
    },
  };
}

function createIpcHarness({ auditLogger } = {}) {
  const handlers = new Map();
  registerTagManagerIpcHandlers({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    tagManagerStore: {
      readState: () => ({ ok: true, state: { schemaVersion: 2, updatedAt: "2026-03-02T00:00:00.000Z", visibilityRules: {}, aliasGroups: [] } }),
      replaceState: () => ({ ok: true }),
      recoverFromBackup: () => ({ ok: true, recoveredFromBackup: true }),
      resetState: () => ({ ok: true, reset: true }),
    },
    loadLibraryIndexCache: () => ({ entries: {} }),
    auditLogger,
  });
  return handlers;
}

test("phaseG plaintext revalidation: encrypted migration write path does not leak raw tag-manager data", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tag-manager-phaseg-"));
  const storePath = path.join(tmpDir, "tag-manager.dat");
  const writeChunks = [];
  const tracedFs = {
    ...fs,
    writeSync(fd, buffer, offset, length, position) {
      const chunk = Buffer.isBuffer(buffer)
        ? buffer.subarray(offset, offset + length)
        : Buffer.from(String(buffer || ""));
      writeChunks.push(Buffer.from(chunk));
      return fs.writeSync(fd, buffer, offset, length, position);
    },
  };

  const tagManagerStore = createTagManagerStore({
    vaultManager: createVaultManager(),
    tagManagerFile: () => storePath,
    tagManagerRelPath: "app:tag-manager",
    fs: tracedFs,
  });

  const legacyState = {
    schemaVersion: 1,
    updatedAt: "2026-03-02T12:00:00.000Z",
    visibilityRules: {
      "legacy private tag": { visibleInFilter: false },
    },
    aliasGroups: [{
      aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014",
      aliasName: "Legacy Private Alias",
      memberRawTags: ["legacy private tag"],
      createdAt: "2026-03-02T12:00:00.000Z",
      updatedAt: "2026-03-02T12:00:00.000Z",
    }],
  };

  const envelope = {
    envelopeVersion: 1,
    algorithm: "aes-256-gcm",
    aad: "nviewer:tag-manager:v1",
  };
  const nonce = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update("app:tag-manager").digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(envelope.aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(legacyState), "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  envelope.nonce = nonce.toString("base64");
  envelope.authTag = authTag.toString("base64");
  envelope.ciphertext = ciphertext.toString("base64");
  fs.writeFileSync(storePath, Buffer.from(JSON.stringify(envelope), "utf8"));

  const migrated = tagManagerStore.readState();
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);

  const combinedWrites = Buffer.concat(writeChunks).toString("utf8");
  assert.equal(combinedWrites.includes("Legacy Private Alias"), false);
  assert.equal(combinedWrites.includes("legacy private tag"), false);
});

test("phaseG IPC audit revalidation: no attacker-controlled taxonomy/raw content in validation logs", async () => {
  const audits = [];
  const handlers = createIpcHarness({ auditLogger: (event) => audits.push(event) });
  const payload = {
    taxonomy: "<img src=x onerror=alert(1)>",
    rawTag: "<script>steal()</script>",
    visibleInFilter: false,
  };

  const response = await handlers.get("tagManager:setVisibility")({}, payload);
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "VALIDATION_ERROR");

  const record = audits.find((event) => event?.event === "request-complete" && event?.channel === "tagManager:setVisibility");
  assert.equal(Boolean(record), true);
  const asJson = JSON.stringify(record);
  assert.equal(asJson.includes("<img src=x onerror=alert(1)>"), false);
  assert.equal(asJson.includes("<script>steal()</script>"), false);
  assert.deepEqual(Object.keys(record).sort(), ["action", "channel", "component", "errorCode", "event"]);
});

test("phaseG abuse revalidation: oversized request payloads fail closed at IPC boundary", async () => {
  const handlers = createIpcHarness();
  const response = await handlers.get("tagManager:bulkSetVisibility")({}, {
    taxonomy: "tags",
    rawTags: Array.from({ length: MAX_MANAGED_TAGS + 1 }, (_, i) => `tag-${i}`),
    visibleInFilter: false,
  });
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "VALIDATION_ERROR");
  assert.equal(response.details.reason, "RAW_TAGS_TOO_LARGE");
});
