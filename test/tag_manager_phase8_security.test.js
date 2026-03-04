const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { createTagManagerStore } = require("../main/tag_manager_store");
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

test("phase8 runtime IO audit: store write path never writes plaintext payload", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tag-manager-phase8-"));
  const storePath = path.join(tmpDir, "tag-manager.dat");
  const writeChunks = [];
  const tracedFs = {
    ...fs,
    writeSync(fd, buffer, offset, length, position) {
      const chunk = Buffer.isBuffer(buffer) ? buffer.subarray(offset, offset + length) : Buffer.from(String(buffer || ""));
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

  const result = tagManagerStore.replaceState({
    schemaVersion: 2,
    updatedAt: "2026-03-02T12:00:00.000Z",
    visibilityRules: { "tags:sensitive hidden tag": { visibleInFilter: false } },
    aliasGroups: [{
      aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014",
      aliasName: "Very Sensitive Alias",
      taxonomy: "tags",
      memberRawTags: ["sensitive hidden tag"],
      createdAt: "2026-03-02T12:00:00.000Z",
      updatedAt: "2026-03-02T12:00:00.000Z",
    }],
  });
  assert.equal(result.ok, true);

  const combined = Buffer.concat(writeChunks).toString("utf8");
  assert.equal(combined.includes("Very Sensitive Alias"), false);
  assert.equal(combined.includes("sensitive hidden tag"), false);
});

test("phase8 log audit: tag manager IPC security events avoid payload echoes", async () => {
  const handlers = new Map();
  const audits = [];
  registerTagManagerIpcHandlers({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    tagManagerStore: {
      readState: () => ({ ok: true, state: { schemaVersion: 2, updatedAt: "2026-03-02T00:00:00.000Z", visibilityRules: {}, aliasGroups: [] } }),
      replaceState: () => ({ ok: true }),
    },
    loadLibraryIndexCache: () => ({ entries: {} }),
    auditLogger: (event) => audits.push(event),
  });

  const payload = { taxonomy: "tags", rawTag: "<script>alert('x')</script>", visibleInFilter: false, bad: "boom" };
  const response = await handlers.get("tagManager:setVisibility")({ sender: { id: 91 } }, payload);
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "VALIDATION_ERROR");

  const record = audits.find((event) => event.event === "validation-failed");
  assert.equal(Boolean(record), true);
  assert.equal(record.channel, "tagManager:setVisibility");
  assert.equal(record.errorCode, "VALIDATION_ERROR");
  assert.equal(JSON.stringify(record).includes("<script>alert('x')</script>"), false);
});
