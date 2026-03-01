const test = require("node:test");
const assert = require("node:assert/strict");

const { registerGroupsIpcHandlers } = require("../main/ipc/register_groups_ipc");

function createContext(overrides = {}) {
  const handlers = new Map();
  const groupsStore = {
    listGroups: () => ({ ok: true, groups: [] }),
    getGroup: (payload) => ({ ok: true, payload }),
    createGroup: (payload) => ({ ok: true, payload }),
    updateGroupMeta: (payload) => ({ ok: true, payload }),
    updateGroupMembership: (payload) => ({ ok: true, payload }),
    deleteGroup: (payload) => ({ ok: true, payload }),
    resolveForReader: (payload) => ({ ok: true, payload }),
    pruneStaleMemberships: () => ({ ok: true, changedGroups: 0, prunedIds: 0, skippedWrite: true }),
    ...(overrides.groupsStore || {}),
  };

  const context = {
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    groupsStore,
    loadLibraryIndexCache: () => ({ entries: {} }),
    ...overrides,
  };

  registerGroupsIpcHandlers(context);
  return { handlers, groupsStore };
}

test("groups:list rejects unknown payload keys", async () => {
  const { handlers } = createContext();
  const response = await handlers.get("groups:list")({}, { unexpected: true });
  assert.deepEqual(response, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  });
});

test("groups:create rejects function-bearing payloads", async () => {
  const { handlers } = createContext();
  const response = await handlers.get("groups:create")({}, { name: "A", description: () => "bad" });
  assert.deepEqual(response, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  });
});

test("groups:create forwards payload to store", async () => {
  const calls = [];
  const { handlers } = createContext({
    groupsStore: {
      createGroup: (payload) => {
        calls.push(payload);
        return { ok: true, group: { groupId: "grp_abc", name: "My Group" } };
      },
    },
  });

  const response = await handlers.get("groups:create")({}, { name: "My Group", description: "desc" });
  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { name: "My Group", description: "desc" });
});

test("groups:resolve-for-reader builds canonical manga id set from library index", async () => {
  const capture = [];
  const { handlers } = createContext({
    loadLibraryIndexCache: () => ({
      entries: {
        a: { id: "comic_a" },
        b: { id: "bad id" },
        c: { id: "comic_b" },
      },
    }),
    groupsStore: {
      resolveForReader: ({ groupId, isKnownMangaId }) => {
        capture.push({
          groupId,
          comicA: isKnownMangaId("comic_a"),
          comicB: isKnownMangaId("comic_b"),
          comicC: isKnownMangaId("comic_c"),
        });
        return { ok: true, resolvedMangaIds: ["comic_a"] };
      },
    },
  });

  const response = await handlers.get("groups:resolve-for-reader")({}, { groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa" });
  assert.equal(response.ok, true);
  assert.deepEqual(capture, [{ groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa", comicA: true, comicB: true, comicC: false }]);
});

test("groups:resolve-for-reader tolerates library index read failures", async () => {
  const { handlers } = createContext({
    loadLibraryIndexCache: () => {
      throw new Error("broken cache");
    },
    groupsStore: {
      resolveForReader: ({ isKnownMangaId }) => ({ ok: true, knownA: isKnownMangaId("comic_a") }),
    },
  });

  const response = await handlers.get("groups:resolve-for-reader")({}, { groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa" });
  assert.deepEqual(response, { ok: true, knownA: false, resolvedComicDirs: [] });
});



test("groups:resolve-for-reader returns ordered comic dirs from canonical index mapping", async () => {
  const { handlers } = createContext({
    loadLibraryIndexCache: () => ({
      entries: {
        a: { id: "comic_a", dir: "/library/comic_a" },
        b: { id: "comic_b", dir: "/library/comic_b" },
      },
    }),
    groupsStore: {
      resolveForReader: () => ({ ok: true, resolvedMangaIds: ["comic_b", "comic_a", "comic_b"], missingCount: 0, truncated: false }),
    },
  });

  const response = await handlers.get("groups:resolve-for-reader")({}, { groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa" });
  assert.equal(response.ok, true);
  assert.deepEqual(response.resolvedComicDirs, ["/library/comic_b", "/library/comic_a"]);
});
test("groups:list triggers stale-membership prune with canonical ids", async () => {
  const capture = [];
  const { handlers } = createContext({
    loadLibraryIndexCache: () => ({
      entries: {
        a: { id: "comic_one" },
        b: { id: "comic_two" },
      },
    }),
    groupsStore: {
      pruneStaleMemberships: ({ isKnownMangaId }) => {
        capture.push({
          one: isKnownMangaId("comic_one"),
          two: isKnownMangaId("comic_two"),
          three: isKnownMangaId("comic_three"),
        });
        return { ok: true, changedGroups: 0, prunedIds: 0, skippedWrite: true };
      },
      listGroups: () => ({ ok: true, groups: [{ groupId: "grp_1", name: "G", description: "", count: 0 }] }),
    },
  });

  const response = await handlers.get("groups:list")({}, {});
  assert.equal(response.ok, true);
  assert.deepEqual(capture, [{ one: true, two: true, three: false }]);
});

test("groups:update-membership rejects prototype-polluted payloads", async () => {
  const { handlers } = createContext();
  const polluted = Object.create({ bad: true });
  polluted.groupId = "grp_aaaaaaaaaaaaaaaaaaaaaaaa";
  polluted.expectedUpdatedAt = "2026-01-01T00:00:00.000Z";
  polluted.mangaIds = ["comic_a"];

  const response = await handlers.get("groups:update-membership")({}, polluted);
  assert.deepEqual(response, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  });
});


test("groups:resolve-for-reader derives manga ids from legacy cache keys and dir paths", async () => {
  const capture = [];
  const { handlers } = createContext({
    loadLibraryIndexCache: () => ({
      entries: {
        "vault:comic_key_only": {},
        "vault:nested/comic_from_dir": { dir: "/tmp/library/comic_from_path" },
      },
    }),
    groupsStore: {
      resolveForReader: ({ isKnownMangaId }) => {
        capture.push({
          keyOnly: isKnownMangaId("comic_key_only"),
          fromDir: isKnownMangaId("comic_from_dir"),
          fromPath: isKnownMangaId("comic_from_path"),
        });
        return { ok: true, resolvedMangaIds: ["comic_key_only"] };
      },
    },
  });

  const response = await handlers.get("groups:resolve-for-reader")({}, { groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa" });
  assert.equal(response.ok, true);
  assert.deepEqual(capture, [{ keyOnly: true, fromDir: true, fromPath: true }]);
});

test("groups:list still runs stale-membership prune when canonical id set is empty", async () => {
  let pruneCalls = 0;
  const { handlers } = createContext({
    loadLibraryIndexCache: () => ({ entries: {} }),
    groupsStore: {
      pruneStaleMemberships: () => {
        pruneCalls += 1;
        return { ok: true, changedGroups: 0, prunedIds: 0, skippedWrite: true };
      },
      listGroups: () => ({ ok: true, groups: [] }),
    },
  });

  const response = await handlers.get("groups:list")({}, {});
  assert.equal(response.ok, true);
  assert.equal(pruneCalls, 1);
});
