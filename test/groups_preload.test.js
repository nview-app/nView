const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGroupsBridge } = require("../preload/groups_preload");

function createBridge() {
  const invokes = [];
  const bridge = buildGroupsBridge({
    invoke(channel, payload) {
      invokes.push({ channel, payload });
      return Promise.resolve({ ok: true });
    },
  });
  return { bridge, invokes };
}

test("groups preload bridge maps minimal normalized payloads", async () => {
  const { bridge, invokes } = createBridge();

  await bridge.createGroup("  Favorites   List  ", "  weekend picks ");
  await bridge.updateGroupMeta({
    groupId: "grp_abc",
    name: " Name ",
    description: " Desc ",
    expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
  });
  await bridge.updateGroupMembership({
    groupId: "grp_abc",
    mangaIds: [" comic_a ", "", "comic_b"],
    expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
  });
  await bridge.deleteGroup({
    groupId: "grp_abc",
    expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.deepEqual(invokes, [
    {
      channel: "groups:create",
      payload: { name: "Favorites List", description: "weekend picks" },
    },
    {
      channel: "groups:update-meta",
      payload: {
        groupId: "grp_abc",
        name: "Name",
        description: "Desc",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    {
      channel: "groups:update-membership",
      payload: {
        groupId: "grp_abc",
        mangaIds: ["comic_a", "comic_b"],
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    {
      channel: "groups:delete",
      payload: {
        groupId: "grp_abc",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  ]);
});

test("groups preload bridge keeps compatibility with object payload calls", async () => {
  const { bridge, invokes } = createBridge();

  await bridge.getGroup({ groupId: "grp_1" });
  await bridge.createGroup({ name: "group", description: "desc" });
  await bridge.resolveGroupForReader({ groupId: "grp_1" });

  assert.deepEqual(invokes, [
    { channel: "groups:get", payload: { groupId: "grp_1" } },
    { channel: "groups:create", payload: { name: "group", description: "desc" } },
    { channel: "groups:resolve-for-reader", payload: { groupId: "grp_1" } },
  ]);
});


test("groups preload bridge exposes reader group batch API and forwards normalized payload", async () => {
  const { bridge, invokes } = createBridge();

  await bridge.openReaderGroupBatch({
    requestId: " req-1 ",
    source: " group ",
    groupId: " grp_aaaaaaaaaaaaaaaaaaaaaaaa ",
    comicDirs: [" /library/a ", "", "/library/a", "/library/b"],
    mode: " merge ",
    focusPolicy: " preserve-active ",
  });

  assert.deepEqual(invokes[0], {
    channel: "ui:readerOpenGroupBatch",
    payload: {
      requestId: "req-1",
      source: "group",
      groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
      comicDirs: ["/library/a", "/library/b"],
      mode: "merge",
      focusPolicy: "preserve-active",
    },
  });
});

test("groups preload bridge reader batch rejects invalid requestId/groupId", async () => {
  const { bridge } = createBridge();

  assert.throws(() => bridge.openReaderGroupBatch({
    requestId: "req invalid",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/library/a"],
    mode: "merge",
    focusPolicy: "preserve-active",
  }), /requestId contains invalid characters/);

  assert.throws(() => bridge.openReaderGroupBatch({
    requestId: "req-123",
    source: "group",
    groupId: "grp_invalid",
    comicDirs: ["/library/a"],
    mode: "merge",
    focusPolicy: "preserve-active",
  }), /groupId is invalid/);
});

test("groups preload bridge reader batch enforces max comicDirs limit", async () => {
  const { bridge } = createBridge();
  const comicDirs = Array.from({ length: 301 }, (_, index) => `/library/${index}`);

  assert.throws(() => bridge.openReaderGroupBatch({
    requestId: "req-123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs,
    mode: "merge",
    focusPolicy: "preserve-active",
  }), /comicDirs exceeds maximum length/);
});
