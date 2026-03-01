const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createGroupsStore } = require("../main/groups_store");

function createVaultManager() {
  const state = { enabled: true, unlocked: true };
  return {
    state,
    vaultStatus() {
      return { enabled: state.enabled, unlocked: state.unlocked };
    },
    encryptBufferWithKey({ relPath, buffer }) {
      return Buffer.from(`enc:${relPath}:${buffer.toString("base64")}`, "utf8");
    },
    decryptBufferWithKey({ relPath, buffer }) {
      const text = buffer.toString("utf8");
      const prefix = `enc:${relPath}:`;
      if (!text.startsWith(prefix)) throw new Error("decrypt failed");
      return Buffer.from(text.slice(prefix.length), "base64");
    },
  };
}

function createHarness() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "groups-store-test-"));
  const vaultManager = createVaultManager();
  const groupsPath = path.join(tmpDir, "groups.json.enc");
  const groupsStore = createGroupsStore({
    vaultManager,
    groupsFile: () => groupsPath,
    groupsRelPath: "app:groups",
    fs,
  });
  return { tmpDir, vaultManager, groupsStore, groupsPath };
}

test("groups store persists encrypted payload and omits plaintext mirror", () => {
  const { groupsStore, groupsPath } = createHarness();

  const created = groupsStore.createGroup({ name: " Favorites ", description: " Weekend picks " });
  assert.equal(created.ok, true);

  const raw = fs.readFileSync(groupsPath, "utf8");
  assert.match(raw, /^enc:app:groups:/);
  assert.equal(raw.includes("Favorites"), false);
  assert.equal(fs.existsSync(`${groupsPath}.tmp`), false);

  const listed = groupsStore.listGroups();
  assert.equal(listed.ok, true);
  assert.equal(listed.groups.length, 1);
  assert.equal(listed.groups[0].name, "Favorites");
  assert.equal(listed.groups[0].description, "Weekend picks");
});

test("groups store enforces optimistic concurrency for metadata updates", () => {
  const { groupsStore } = createHarness();

  const created = groupsStore.createGroup({ name: "Queue", description: "first" });
  assert.equal(created.ok, true);

  const conflict = groupsStore.updateGroupMeta({
    groupId: created.group.groupId,
    name: "Queue 2",
    description: "changed",
    expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.deepEqual(conflict, {
    ok: false,
    errorCode: "CONFLICT",
    message: "Group has changed. Refresh and retry.",
  });
});

test("groups store resolve-for-reader prunes stale ids while preserving order", () => {
  const { groupsStore } = createHarness();

  const created = groupsStore.createGroup({ name: "Launch", description: "" });
  assert.equal(created.ok, true);

  const membership = groupsStore.updateGroupMembership({
    groupId: created.group.groupId,
    mangaIds: ["comic_a", "comic_missing", "comic_b"],
    expectedUpdatedAt: created.group.updatedAt,
  });
  assert.equal(membership.ok, true);

  const resolved = groupsStore.resolveForReader({
    groupId: created.group.groupId,
    isKnownMangaId: (value) => value === "comic_a" || value === "comic_b",
  });

  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.resolvedMangaIds, ["comic_a", "comic_b"]);
  assert.equal(resolved.missingCount, 1);
  assert.equal(resolved.truncated, false);

  const fetched = groupsStore.getGroup({ groupId: created.group.groupId });
  assert.equal(fetched.ok, true);
  assert.deepEqual(fetched.group.mangaIds, ["comic_a", "comic_b"]);
});

test("groups store fails closed on unsupported future schema version", () => {
  const { groupsStore, groupsPath, vaultManager } = createHarness();
  const payload = Buffer.from(JSON.stringify({ version: 99, groups: [] }), "utf8");
  const encrypted = vaultManager.encryptBufferWithKey({ relPath: "app:groups", buffer: payload });
  fs.writeFileSync(groupsPath, encrypted);

  const result = groupsStore.listGroups();
  assert.deepEqual(result, {
    ok: false,
    errorCode: "STORE_UNAVAILABLE",
    message: "Groups store version is not supported.",
  });
});

test("groups store migrates legacy versionless payloads to v1 schema", () => {
  const { groupsStore, groupsPath, vaultManager } = createHarness();
  const legacyPayload = Buffer.from(JSON.stringify({
    groups: [{
      groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: " Legacy  Name ",
      description: " legacy   description ",
      mangaIds: ["comic_a", "comic_b"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }],
  }), "utf8");
  const encrypted = vaultManager.encryptBufferWithKey({ relPath: "app:groups", buffer: legacyPayload });
  fs.writeFileSync(groupsPath, encrypted);

  const listed = groupsStore.listGroups();
  assert.equal(listed.ok, true);
  assert.equal(listed.groups.length, 1);
  assert.equal(listed.groups[0].name, "Legacy Name");
  assert.equal(listed.groups[0].description, "legacy description");

  const migratedEncrypted = fs.readFileSync(groupsPath);
  const migratedPlain = vaultManager.decryptBufferWithKey({ relPath: "app:groups", buffer: migratedEncrypted });
  const migrated = JSON.parse(migratedPlain.toString("utf8"));
  assert.equal(migrated.version, 1);
});

test("groups store degrades gracefully on unreadable payload", () => {
  const { groupsStore, groupsPath } = createHarness();
  fs.writeFileSync(groupsPath, Buffer.from("not-encrypted-groups", "utf8"));

  const listed = groupsStore.listGroups();
  assert.deepEqual(listed, {
    ok: false,
    errorCode: "STORE_UNAVAILABLE",
    message: "Groups store is unavailable.",
  });
});

test("groups store can prune stale ids across all groups", () => {
  const { groupsStore } = createHarness();
  const first = groupsStore.createGroup({ name: "A", description: "" });
  const second = groupsStore.createGroup({ name: "B", description: "" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);

  const firstMembership = groupsStore.updateGroupMembership({
    groupId: first.group.groupId,
    mangaIds: ["comic_keep", "comic_drop"],
    expectedUpdatedAt: first.group.updatedAt,
  });
  const secondMembership = groupsStore.updateGroupMembership({
    groupId: second.group.groupId,
    mangaIds: ["comic_drop", "comic_keep_2"],
    expectedUpdatedAt: second.group.updatedAt,
  });
  assert.equal(firstMembership.ok, true);
  assert.equal(secondMembership.ok, true);

  const pruned = groupsStore.pruneStaleMemberships({
    isKnownMangaId: (mangaId) => mangaId === "comic_keep" || mangaId === "comic_keep_2",
  });

  assert.deepEqual(pruned, {
    ok: true,
    changedGroups: 2,
    prunedIds: 2,
    skippedWrite: false,
  });

  const afterFirst = groupsStore.getGroup({ groupId: first.group.groupId });
  const afterSecond = groupsStore.getGroup({ groupId: second.group.groupId });
  assert.deepEqual(afterFirst.group.mangaIds, ["comic_keep"]);
  assert.deepEqual(afterSecond.group.mangaIds, ["comic_keep_2"]);
});

test("groups store rejects oversized create payloads without echoing sensitive input", () => {
  const { groupsStore } = createHarness();
  const secret = "x".repeat(200);
  const result = groupsStore.createGroup({
    name: secret,
    description: "safe",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "VALIDATION_ERROR");
  assert.equal(String(result.message).includes(secret), false);
});

test("groups store rejects prototype-polluted membership payloads", () => {
  const { groupsStore } = createHarness();
  const created = groupsStore.createGroup({ name: "Secure", description: "" });
  assert.equal(created.ok, true);

  const polluted = Object.create({ injected: true });
  polluted.groupId = created.group.groupId;
  polluted.mangaIds = ["comic_a"];
  polluted.expectedUpdatedAt = created.group.updatedAt;

  const result = groupsStore.updateGroupMembership(polluted);
  assert.deepEqual(result, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid membership payload.",
  });
});
