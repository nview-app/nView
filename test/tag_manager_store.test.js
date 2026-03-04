const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { createTagManagerStore } = require("../main/tag_manager_store");

function createVaultManager() {
  const state = { enabled: true, unlocked: true };
  return {
    state,
    vaultStatus() {
      return { enabled: state.enabled, unlocked: state.unlocked };
    },
    deriveFileKey(relPath) {
      return crypto.createHash("sha256").update(String(relPath || "")).digest();
    },
  };
}

function createHarness() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tag-manager-store-test-"));
  const storePath = path.join(tmpDir, "tag-manager.dat");
  const vaultManager = createVaultManager();
  const tagManagerStore = createTagManagerStore({
    vaultManager,
    tagManagerFile: () => storePath,
    tagManagerRelPath: "app:tag-manager",
    fs,
  });
  return { tmpDir, storePath, vaultManager, tagManagerStore };
}

function sampleState() {
  const now = "2026-03-02T12:00:00.000Z";
  return {
    schemaVersion: 2,
    updatedAt: now,
    visibilityRules: {
      "tags:tag one": { visibleInFilter: false },
      "parodies:tag two": { visibleInFilter: true },
    },
    aliasGroups: [{
      aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014",
      aliasName: "Example Alias",
      taxonomy: "tags",
      memberRawTags: ["tag one", "tag three"],
      createdAt: now,
      updatedAt: now,
    }],
  };
}

test("tag manager store encrypts persisted payload and supports roundtrip read/write", () => {
  const { tagManagerStore, storePath } = createHarness();
  const write = tagManagerStore.replaceState(sampleState());
  assert.equal(write.ok, true);

  const disk = fs.readFileSync(storePath, "utf8");
  assert.equal(disk.includes("Example Alias"), false);
  assert.equal(disk.includes("tag one"), false);

  const read = tagManagerStore.readState();
  assert.equal(read.ok, true);
  assert.equal(read.state.aliasGroups[0].aliasName, "Example Alias");
  assert.equal(read.state.visibilityRules["tags:tag one"].visibleInFilter, false);
});

test("tag manager store detects tampered ciphertext with integrity error", () => {
  const { tagManagerStore, storePath } = createHarness();
  assert.equal(tagManagerStore.replaceState(sampleState()).ok, true);

  const envelope = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const mutated = Buffer.from(envelope.ciphertext, "base64");
  mutated[0] = mutated[0] ^ 0xff;
  envelope.ciphertext = mutated.toString("base64");
  fs.writeFileSync(storePath, Buffer.from(JSON.stringify(envelope), "utf8"));

  const read = tagManagerStore.readState();
  assert.deepEqual(read, {
    ok: false,
    errorCode: "INTEGRITY_ERROR",
    message: "Tag manager integrity verification failed.",
  });
});

test("tag manager store uses encrypted backup for corruption fallback recovery", () => {
  const { tagManagerStore, storePath } = createHarness();
  assert.equal(tagManagerStore.replaceState(sampleState()).ok, true);

  const next = sampleState();
  next.updatedAt = "2026-03-03T12:00:00.000Z";
  next.aliasGroups = [];
  assert.equal(tagManagerStore.replaceState(next).ok, true);

  fs.writeFileSync(storePath, Buffer.from("corrupt", "utf8"));

  const read = tagManagerStore.readState();
  assert.equal(read.ok, true);
  assert.equal(read.recoveredFromBackup, true);
  assert.equal(read.state.aliasGroups.length, 1);
});

test("tag manager store returns vault-required state when vault is disabled", () => {
  const { tagManagerStore, vaultManager } = createHarness();
  vaultManager.state.enabled = false;

  const read = tagManagerStore.readState();
  assert.deepEqual(read, {
    ok: false,
    errorCode: "VAULT_REQUIRED",
    message: "Vault Mode is required.",
  });
});

test("tag manager store maintains valid encrypted state under concurrent writes", async () => {
  const { tagManagerStore } = createHarness();

  await Promise.all(Array.from({ length: 12 }, (_, i) => {
    const state = sampleState();
    state.updatedAt = `2026-03-02T12:00:${String(i).padStart(2, "0")}.000Z`;
    state.aliasGroups = [{
      aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014",
      aliasName: `Alias ${i}`,
      taxonomy: "tags",
      memberRawTags: ["tag one"],
      createdAt: state.updatedAt,
      updatedAt: state.updatedAt,
    }];
    return Promise.resolve().then(() => {
      const result = tagManagerStore.replaceState(state);
      assert.equal(result.ok, true);
    });
  }));

  const read = tagManagerStore.readState();
  assert.equal(read.ok, true);
  assert.equal(Array.isArray(read.state.aliasGroups), true);
  assert.equal(read.state.aliasGroups.length, 1);
});

test("tag manager store can recover manually from encrypted backup", () => {
  const { tagManagerStore, storePath } = createHarness();
  assert.equal(tagManagerStore.replaceState(sampleState()).ok, true);
  const newer = sampleState();
  newer.updatedAt = "2026-03-02T00:00:01.000Z";
  assert.equal(tagManagerStore.replaceState(newer).ok, true);

  const corrupted = fs.readFileSync(storePath);
  corrupted[corrupted.length - 1] ^= 0x22;
  fs.writeFileSync(storePath, corrupted);

  const recovered = tagManagerStore.recoverFromBackup();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recoveredFromBackup, true);

  const read = tagManagerStore.readState();
  assert.equal(read.ok, true);
});

test("tag manager store resetState rewrites default encrypted state", () => {
  const { tagManagerStore } = createHarness();
  assert.equal(tagManagerStore.replaceState(sampleState()).ok, true);

  const reset = tagManagerStore.resetState();
  assert.equal(reset.ok, true);
  assert.equal(reset.reset, true);

  const read = tagManagerStore.readState();
  assert.equal(read.ok, true);
  assert.deepEqual(read.state.visibilityRules, {});
  assert.deepEqual(read.state.aliasGroups, []);
});

test("tag manager store migrates encrypted V1 state to V2 on read", () => {
  const { tagManagerStore, storePath } = createHarness();
  const v1State = {
    schemaVersion: 1,
    updatedAt: "2026-03-02T12:00:00.000Z",
    visibilityRules: {
      "tag one": { visibleInFilter: false },
    },
    aliasGroups: [{
      aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014",
      aliasName: "Legacy Alias",
      memberRawTags: ["tag one"],
      createdAt: "2026-03-02T12:00:00.000Z",
      updatedAt: "2026-03-02T12:00:00.000Z",
    }],
  };

  assert.equal(tagManagerStore.replaceState(v1State).ok, false);

  const envelope = {
    envelopeVersion: 1,
    algorithm: "aes-256-gcm",
    aad: "nviewer:tag-manager:v1",
  };

  const nonce = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update("app:tag-manager").digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(envelope.aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(v1State), "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();

  envelope.nonce = nonce.toString("base64");
  envelope.authTag = authTag.toString("base64");
  envelope.ciphertext = ciphertext.toString("base64");

  fs.writeFileSync(storePath, Buffer.from(JSON.stringify(envelope), "utf8"));

  const read = tagManagerStore.readState();
  assert.equal(read.ok, true);
  assert.equal(read.migrated, true);
  assert.equal(read.state.schemaVersion, 2);
  assert.equal(read.state.aliasGroups[0].taxonomy, "tags");
  assert.equal(read.state.visibilityRules["tags:tag one"].visibleInFilter, false);

  const reloaded = tagManagerStore.readState();
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.schemaVersion, 2);
  assert.equal(reloaded.state.visibilityRules["tags:tag one"].visibleInFilter, false);
});

