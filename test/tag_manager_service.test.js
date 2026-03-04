const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTagManagerService,
  normalizeRawTagKey,
  normalizeAliasName,
} = require("../main/tag_manager_service");

function sampleState() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-03-02T00:00:00.000Z",
    visibilityRules: {},
    aliasGroups: [],
  };
}

function createInMemoryStore(initialState) {
  let state = structuredClone(initialState || sampleState());
  return {
    readState() {
      return { ok: true, state: structuredClone(state) };
    },
    replaceState(nextState) {
      state = structuredClone(nextState);
      return { ok: true };
    },
  };
}

function createService(initialState) {
  let tick = 0;
  let uuidTick = 1;
  return createTagManagerService({
    tagManagerStore: createInMemoryStore(initialState),
    now: () => `2026-03-02T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    randomUUID: () => `11111111-1111-4111-8111-${String(uuidTick++).padStart(12, "0")}`,
  });
}

test("normalization applies NFKC, whitespace collapsing and case-folding", () => {
  assert.equal(normalizeRawTagKey(" Ｔag\t\nOne  "), "tag one");
  assert.equal(normalizeRawTagKey("ＡＢＣ"), "abc");
  assert.equal(normalizeAliasName("  Alias\n\t Name  "), "Alias Name");
});

test("getSnapshot can include backfilled inventory tags", () => {
  const service = createTagManagerService({
    tagManagerStore: createInMemoryStore(),
    listInventoryRawTags: () => ({
      ok: true,
      tags: ["alpha", "beta"],
      stats: { source: "index" },
    }),
  });

  const snapshot = service.getSnapshot({ includeInventory: true });
  assert.equal(snapshot.ok, true);
  assert.deepEqual(snapshot.inventory, ["alpha", "beta"]);
  assert.deepEqual(snapshot.inventoryStats, { source: "index" });
});

test("alias groups enforce uniqueness and conflicts within the same taxonomy", () => {
  const service = createService();
  const created = service.createAliasGroup({
    aliasName: "Main Alias",
    taxonomy: "tags",
    memberRawTags: ["Tag A", "Tag B"],
  });
  assert.equal(created.ok, true);

  const duplicateName = service.createAliasGroup({
    aliasName: " main alias ",
    taxonomy: "tags",
    memberRawTags: ["Tag C"],
  });
  assert.equal(duplicateName.ok, false);
  assert.equal(duplicateName.errorCode, "CONFLICT");

  const duplicateMember = service.createAliasGroup({
    aliasName: "Other Alias",
    taxonomy: "tags",
    memberRawTags: ["tag b"],
  });
  assert.equal(duplicateMember.ok, false);
  assert.equal(duplicateMember.errorCode, "CONFLICT");
  assert.equal(duplicateMember.message, "Raw tag already belongs to an alias group.");
  assert.deepEqual(duplicateMember.details?.memberRawTagsInUse, ["tag b"]);

  const crossTaxonomyReuse = service.createAliasGroup({
    aliasName: "Main Alias",
    taxonomy: "characters",
    memberRawTags: ["Tag A"],
  });
  assert.equal(crossTaxonomyReuse.ok, true);
});

test("setVisibility and bulkSetVisibility update taxonomy-scoped visibility rules", () => {
  const service = createService();
  assert.equal(service.setVisibility({ taxonomy: "tags", rawTag: "Tag A", visibleInFilter: false }).ok, true);
  let snapshot = service.getSnapshot();
  assert.equal(snapshot.snapshot.visibilityRules["tags:tag a"].visibleInFilter, false);

  assert.equal(service.setVisibility({ taxonomy: "characters", rawTag: "Tag A", visibleInFilter: false }).ok, true);
  snapshot = service.getSnapshot();
  assert.equal(snapshot.snapshot.visibilityRules["characters:tag a"].visibleInFilter, false);

  assert.equal(service.setVisibility({ taxonomy: "tags", rawTag: "Tag A", visibleInFilter: true }).ok, true);
  snapshot = service.getSnapshot();
  assert.equal(snapshot.snapshot.visibilityRules["tags:tag a"], undefined);
  assert.equal(snapshot.snapshot.visibilityRules["characters:tag a"].visibleInFilter, false);

  assert.equal(service.bulkSetVisibility({ taxonomy: "parodies", rawTags: ["x", "y", "x"], visibleInFilter: false }).ok, true);
  snapshot = service.getSnapshot();
  assert.deepEqual(Object.keys(snapshot.snapshot.visibilityRules).sort(), ["characters:tag a", "parodies:x", "parodies:y"]);
});

test("resolveForFilter is taxonomy-aware for visibility, aliases, and query", () => {
  const service = createService();
  service.createAliasGroup({ taxonomy: "tags", aliasName: "Canon", memberRawTags: ["tag one", "tag two"] });
  service.createAliasGroup({ taxonomy: "characters", aliasName: "Cast", memberRawTags: ["tag one"] });
  service.setVisibility({ taxonomy: "characters", rawTag: "hidden", visibleInFilter: false });

  const resolved = service.resolveForFilter({
    rawTagsByTaxonomy: {
      tags: ["Tag One", "tag two", "tag three"],
      characters: ["Tag One", "hidden"],
      parodies: ["Series A"],
    },
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.entries.map((entry) => entry.label), [
    "Canon (Alias)",
    "Cast (Alias · Characters)",
    "series a (Parodies)",
    "tag three",
  ]);

  const queried = service.resolveForFilter({
    rawTagsByTaxonomy: {
      tags: ["tag one", "tag two"],
      characters: ["tag one"],
    },
    query: "charact",
  });
  assert.equal(queried.ok, true);
  assert.deepEqual(queried.entries.map((entry) => entry.aliasName), ["Cast"]);
});

test("resolveForMetadata stays tags-context and includes alias annotation", () => {
  const service = createService();
  service.createAliasGroup({ taxonomy: "tags", aliasName: "Canon", memberRawTags: ["tag one"] });
  service.createAliasGroup({ taxonomy: "characters", aliasName: "Cast", memberRawTags: ["tag one"] });

  const resolved = service.resolveForMetadata({ taxonomy: "tags", rawTags: [" Tag One ", "Tag Two", "Tag One"] });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.rows, [
    {
      rawTag: "Tag One",
      rawTagKey: "tag one",
      alias: {
        aliasId: "11111111-1111-4111-8111-000000000001",
        aliasName: "Canon",
      },
    },
    {
      rawTag: "Tag Two",
      rawTagKey: "tag two",
      alias: null,
    },
  ]);

  const badTaxonomy = service.resolveForMetadata({ taxonomy: "characters", rawTags: ["x"] });
  assert.equal(badTaxonomy.ok, false);
  assert.equal(badTaxonomy.errorCode, "VALIDATION_ERROR");
});

test("update and delete alias group preserve taxonomy and enforce optimistic concurrency", () => {
  const service = createService();
  const created = service.createAliasGroup({ taxonomy: "parodies", aliasName: "Canon", memberRawTags: ["tag one"] });
  assert.equal(created.ok, true);

  const updated = service.updateAliasGroup({
    aliasId: created.response.aliasGroup.aliasId,
    aliasName: "Canon V2",
    expectedUpdatedAt: created.response.aliasGroup.updatedAt,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.response.aliasGroup.taxonomy, "parodies");

  const removed = service.deleteAliasGroup({
    aliasId: created.response.aliasGroup.aliasId,
    expectedUpdatedAt: updated.response.aliasGroup.updatedAt,
  });
  assert.equal(removed.ok, true);
  assert.equal(service.getSnapshot().snapshot.aliasGroups.length, 0);
});

test("resetVisibility supports all and typed selection scopes", () => {
  const service = createService();
  assert.equal(service.bulkSetVisibility({ taxonomy: "tags", rawTags: ["A", "B"], visibleInFilter: false }).ok, true);
  assert.equal(service.bulkSetVisibility({ taxonomy: "characters", rawTags: ["A"], visibleInFilter: false }).ok, true);

  const selective = service.resetVisibility({ scope: "selection", typedKeys: ["tags:a", "characters:a"] });
  assert.equal(selective.ok, true);
  let snapshot = service.getSnapshot();
  assert.deepEqual(Object.keys(snapshot.snapshot.visibilityRules), ["tags:b"]);

  const all = service.resetVisibility({ scope: "all" });
  assert.equal(all.ok, true);
  snapshot = service.getSnapshot();
  assert.deepEqual(snapshot.snapshot.visibilityRules, {});
});

test("payload validation rejects malformed taxonomy and typed inputs", () => {
  const service = createService();
  const badTaxonomy = service.createAliasGroup({ aliasName: "x", taxonomy: "bad", memberRawTags: ["x"] });
  assert.equal(badTaxonomy.ok, false);
  assert.equal(badTaxonomy.errorCode, "VALIDATION_ERROR");

  const badTypedReset = service.resetVisibility({ scope: "selection", typedKeys: ["badformat"] });
  assert.equal(badTypedReset.ok, false);
  assert.equal(badTypedReset.errorCode, "VALIDATION_ERROR");

  const badFilterPayload = service.resolveForFilter({ rawTags: ["x"] });
  assert.equal(badFilterPayload.ok, false);
  assert.equal(badFilterPayload.errorCode, "VALIDATION_ERROR");
});

test("abuse cases reject mixed-type member injection attempts", () => {
  const service = createService();

  const typedMemberInjection = service.createAliasGroup({
    aliasName: "Injected",
    taxonomy: "tags",
    memberRawTags: ["characters:hero", "safe"],
  });
  assert.equal(typedMemberInjection.ok, true);
  assert.equal(typedMemberInjection.response.aliasGroup.taxonomy, "tags");
  assert.deepEqual(typedMemberInjection.response.aliasGroup.memberRawTags, ["characters:hero", "safe"]);

  const crossTaxonomyHijack = service.resolveForFilter({
    rawTagsByTaxonomy: {
      tags: ["characters:hero"],
      characters: ["hero"],
    },
  });
  assert.equal(crossTaxonomyHijack.ok, true);
  assert.deepEqual(crossTaxonomyHijack.entries.map((entry) => entry.label), ["hero (Characters)", "Injected (Alias)"]);

  const nonStringMember = service.createAliasGroup({
    aliasName: "Invalid",
    taxonomy: "tags",
    memberRawTags: ["safe", { raw: "bad" }],
  });
  assert.equal(nonStringMember.ok, false);
  assert.equal(nonStringMember.errorCode, "VALIDATION_ERROR");
  assert.equal(nonStringMember.details.reason, "MEMBER_RAW_TAGS_NON_STRING");
});

test("recoverStore validates strategy and delegates to store recovery helpers", () => {
  let backupCalls = 0;
  let resetCalls = 0;
  const service = createTagManagerService({
    tagManagerStore: {
      readState: () => ({ ok: true, state: sampleState() }),
      replaceState: () => ({ ok: true }),
      recoverFromBackup: () => {
        backupCalls += 1;
        return { ok: true, recoveredFromBackup: true };
      },
      resetState: () => {
        resetCalls += 1;
        return { ok: true, reset: true };
      },
    },
  });

  const invalid = service.recoverStore({ strategy: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorCode, "VALIDATION_ERROR");

  const backup = service.recoverStore({ strategy: "backup" });
  assert.equal(backup.ok, true);
  assert.equal(backupCalls, 1);

  const reset = service.recoverStore({ strategy: "reset" });
  assert.equal(reset.ok, true);
  assert.equal(resetCalls, 1);
});
