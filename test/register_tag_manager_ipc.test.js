const test = require("node:test");
const assert = require("node:assert/strict");

const { registerTagManagerIpcHandlers } = require("../main/ipc/register_tag_manager_ipc");

function createContext(overrides = {}) {
  const handlers = new Map();
  let state = {
    schemaVersion: 2,
    updatedAt: "2026-03-02T00:00:00.000Z",
    visibilityRules: {},
    aliasGroups: [],
  };
  const tagManagerStore = {
    readState: () => ({ ok: true, state: structuredClone(state) }),
    replaceState: (nextState) => {
      state = structuredClone(nextState);
      return { ok: true };
    },
    ...(overrides.tagManagerStore || {}),
  };

  const context = {
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    tagManagerStore,
    loadLibraryIndexCache: () => ({ entries: {} }),
    ...overrides,
  };

  registerTagManagerIpcHandlers(context);
  return { handlers };
}

test("tagManager:getSnapshot returns snapshot for empty payload", async () => {
  const { handlers } = createContext();
  const response = await handlers.get("tagManager:getSnapshot")({}, {});
  assert.equal(response.ok, true);
  assert.equal(response.snapshot.schemaVersion, 2);
});

test("tagManager:setVisibility rejects unknown keys", async () => {
  const { handlers } = createContext();
  const response = await handlers.get("tagManager:setVisibility")({}, {
    taxonomy: "tags",
    rawTag: "tag a",
    visibleInFilter: false,
    bad: true,
  });
  assert.deepEqual(response, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  });
});

test("tagManager channels reject function-bearing payloads", async () => {
  const { handlers } = createContext();
  const response = await handlers.get("tagManager:createAliasGroup")({}, {
    aliasName: "Alias",
    taxonomy: "tags",
    memberRawTags: ["tag-a"],
    attacker: () => "bad",
  });
  assert.deepEqual(response, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  });
});

test("tagManager alias flow supports create/update/delete/resolve", async () => {
  const { handlers } = createContext();
  const created = await handlers.get("tagManager:createAliasGroup")({}, {
    aliasName: "Canon",
    taxonomy: "tags",
    memberRawTags: ["Tag A", "Tag B"],
  });
  assert.equal(created.ok, true);
  assert.equal(created.response.aliasGroup.aliasName, "Canon");

  const resolved = await handlers.get("tagManager:resolveForFilter")({}, {
    rawTagsByTaxonomy: {
      tags: ["tag a", "x"],
    },
    query: "tag a",
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.entries.map((entry) => entry.type), ["alias"]);

  const removed = await handlers.get("tagManager:deleteAliasGroup")({}, {
    aliasId: created.response.aliasGroup.aliasId,
    expectedUpdatedAt: created.response.aliasGroup.updatedAt,
  });
  assert.equal(removed.ok, true);
});

test("tagManager:resolveForMetadata is allowed and returns canonical rows", async () => {
  const { handlers } = createContext();
  const response = await handlers.get("tagManager:resolveForMetadata")({}, { taxonomy: "tags", rawTags: ["Tag A", "Tag A", "Tag B"] });
  assert.equal(response.ok, true);
  assert.deepEqual(response.rows.map((row) => row.rawTagKey), ["tag a", "tag b"]);
});


test("tagManager:getSnapshot can include typed inventory backfilled from library index cache", async () => {
  const { handlers } = createContext({
    loadLibraryIndexCache: () => ({
      entries: {
        "vault:a": { tags: ["Tag One"], parodies: ["Series A"], characters: [] },
        "vault:b": { tags: ["tag one", "Tag Two"], parodies: [], characters: ["Hero"] },
      },
    }),
  });

  const response = await handlers.get("tagManager:getSnapshot")({}, { includeInventory: true });
  assert.equal(response.ok, true);
  assert.deepEqual(response.inventory, [
    { taxonomy: "characters", rawTagKey: "hero", typedKey: "characters:hero", sourceLabel: "Characters", label: "hero (Characters)" },
    { taxonomy: "parodies", rawTagKey: "series a", typedKey: "parodies:series a", sourceLabel: "Parodies", label: "series a (Parodies)" },
    { taxonomy: "tags", rawTagKey: "tag one", typedKey: "tags:tag one", sourceLabel: "", label: "tag one" },
    { taxonomy: "tags", rawTagKey: "tag two", typedKey: "tags:tag two", sourceLabel: "", label: "tag two" },
  ]);
  assert.equal(response.inventoryStats.source, "index");
  assert.equal(response.inventoryStats.entriesWithAnyTagArray, 2);
  assert.equal(response.inventoryStats.entriesMissingAllTagArrays, 0);
  assert.equal(response.inventoryStats.entriesWithAtLeastOneTagValue, 2);
});

test("tagManager:recoverStore delegates to store recovery path", async () => {
  const { handlers } = createContext({
    tagManagerStore: {
      readState: () => ({ ok: true, state: { schemaVersion: 2, updatedAt: "2026-03-02T00:00:00.000Z", visibilityRules: {}, aliasGroups: [] } }),
      replaceState: () => ({ ok: true }),
      recoverFromBackup: () => ({ ok: true, recoveredFromBackup: true }),
      resetState: () => ({ ok: true, reset: true }),
    },
  });

  const response = await handlers.get("tagManager:recoverStore")({}, { strategy: "backup" });
  assert.equal(response.ok, true);
  assert.equal(response.recoveredFromBackup, true);
});

test("tag manager channels can be disabled by rollout stage", async () => {
  const originalStage = process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE = "disabled";
  const { handlers } = createContext();
  const response = await handlers.get("tagManager:getSnapshot")({}, {});
  assert.equal(response.ok, false);
  assert.equal(response.errorCode, "FEATURE_DISABLED");
  if (originalStage === undefined) delete process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  else process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE = originalStage;
});

test("rollout disabled gate blocks every tag manager channel consistently", async () => {
  const originalStage = process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
  process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE = "disabled";
  try {
    const { handlers } = createContext();
    const testCases = [
      ["tagManager:getSnapshot", {}],
      ["tagManager:setVisibility", { taxonomy: "tags", rawTag: "x", visibleInFilter: false }],
      ["tagManager:bulkSetVisibility", { taxonomy: "tags", rawTags: ["x"], visibleInFilter: false }],
      ["tagManager:resetVisibility", { scope: "all" }],
      ["tagManager:createAliasGroup", { taxonomy: "tags", aliasName: "a", memberRawTags: ["x"] }],
      ["tagManager:updateAliasGroup", { aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014", expectedUpdatedAt: "2026-03-02T00:00:00.000Z" }],
      ["tagManager:deleteAliasGroup", { aliasId: "de305d54-75b4-431b-adb2-eb6b9e546014", expectedUpdatedAt: "2026-03-02T00:00:00.000Z" }],
      ["tagManager:resolveForFilter", { rawTagsByTaxonomy: { tags: ["x"] } }],
      ["tagManager:resolveForMetadata", { taxonomy: "tags", rawTags: ["x"] }],
      ["tagManager:recoverStore", { strategy: "backup" }],
    ];

    for (const [channel, payload] of testCases) {
      const response = await handlers.get(channel)({}, payload);
      assert.equal(response.ok, false);
      assert.equal(response.errorCode, "FEATURE_DISABLED");
      assert.equal(String(response.message || "").startsWith("Tag manager is currently disabled"), true);
    }
  } finally {
    if (originalStage === undefined) delete process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE;
    else process.env.NVIEW_TAG_MANAGER_ROLLOUT_STAGE = originalStage;
  }
});

test("tagManager IPC abuse payloads fail closed for taxonomy spoofing and oversized typed-key lists", async () => {
  const { handlers } = createContext();

  const badTaxonomy = await handlers.get("tagManager:createAliasGroup")({}, {
    aliasName: "Alias",
    taxonomy: "TAGS",
    memberRawTags: ["safe"],
  });
  assert.equal(badTaxonomy.ok, false);
  assert.equal(badTaxonomy.errorCode, "VALIDATION_ERROR");
  assert.equal(badTaxonomy.details.reason, "INVALID_TAXONOMY");

  const oversizedTypedKeys = Array.from({ length: 50001 }, (_, i) => `tags:tag-${i}`);
  const oversized = await handlers.get("tagManager:resetVisibility")({}, {
    scope: "selection",
    typedKeys: oversizedTypedKeys,
  });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.errorCode, "VALIDATION_ERROR");
  assert.equal(oversized.details.reason, "INVALID_TYPED_KEYS");
});


test("tagManager:getSnapshot telemetry includes inventory diagnostics without tag payloads", async () => {
  const telemetryEvents = [];
  const { handlers } = createContext({
    telemetryLogger: (event) => telemetryEvents.push(event),
    loadLibraryIndexCache: () => ({
      entries: {
        "vault:a": { tags: ["Tag One"], parodies: ["Series A"], characters: [] },
      },
    }),
  });

  const response = await handlers.get("tagManager:getSnapshot")({}, { includeInventory: true, includeStats: true });
  assert.equal(response.ok, true);

  const requestEvent = telemetryEvents.find((event) => event?.event === "request" && event?.channel === "tagManager:getSnapshot");
  assert.equal(Boolean(requestEvent), true);
  assert.equal(requestEvent.action, "getSnapshot");
  assert.equal(requestEvent.includeInventory, true);
  assert.equal(requestEvent.includeStats, true);
  assert.equal(requestEvent.inventoryCount, 2);
  assert.equal(requestEvent.inventorySource, "index");
  assert.equal(requestEvent.inventoryEntryCount, 1);
  assert.equal(requestEvent.inventoryScannedTagValues, 2);
  assert.equal(requestEvent.inventoryEntriesWithAnyTagArray, 1);
  assert.equal(requestEvent.inventoryEntriesMissingAllTagArrays, 0);
  assert.equal(requestEvent.inventoryEntriesWithAtLeastOneTagValue, 1);
  assert.equal(typeof requestEvent.inventoryComputedAt, "string");
  assert.equal(JSON.stringify(requestEvent).includes("tag one"), false);
  assert.equal(JSON.stringify(requestEvent).includes("series a"), false);
});


test("tagManager audit includes only channel/action/errorCode for request outcomes", async () => {
  const audits = [];
  const { handlers } = createContext({
    auditLogger: (event) => audits.push(event),
    loadLibraryIndexCache: () => ({ entries: {} }),
  });

  const response = await handlers.get("tagManager:getSnapshot")({}, { includeInventory: true, includeStats: true });
  assert.equal(response.ok, true);

  const record = audits.find((event) => event?.event === "request-complete" && event?.channel === "tagManager:getSnapshot");
  assert.equal(Boolean(record), true);
  assert.equal(record.action, "getSnapshot");
  assert.equal(record.errorCode, null);
  assert.deepEqual(Object.keys(record).sort(), ["action", "channel", "component", "errorCode", "event"]);
});
