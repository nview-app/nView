const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeComicDirs,
  computeBatchMutationPlan,
  resolveActivationSessionId,
} = require("../renderer/reader/reader_group_batch_core.js");

test("normalizeComicDirs trims and de-duplicates while preserving first occurrence order", () => {
  assert.deepEqual(normalizeComicDirs([" /a ", "", "/b", "/a", null, " /c "]), ["/a", "/b", "/c"]);
});

test("computeBatchMutationPlan merge keeps existing sessions and opens only missing entries", () => {
  const plan = computeBatchMutationPlan({
    currentComicDirs: ["/a", "/b"],
    requestComicDirs: ["/b", "/c", "/b", "/d"],
    mode: "merge",
  });

  assert.deepEqual(plan.reusedComicDirs, ["/b"]);
  assert.deepEqual(plan.newComicDirs, ["/c", "/d"]);
  assert.deepEqual(plan.closeComicDirs, []);
  assert.deepEqual(plan.requestComicDirs, ["/b", "/c", "/d"]);
});

test("computeBatchMutationPlan replace emits deterministic close order from end to start", () => {
  const plan = computeBatchMutationPlan({
    currentComicDirs: ["/a", "/b", "/c", "/d"],
    requestComicDirs: ["/b", "/d", "/e"],
    mode: "replace",
  });

  assert.deepEqual(plan.reusedComicDirs, ["/b", "/d"]);
  assert.deepEqual(plan.newComicDirs, ["/e"]);
  assert.deepEqual(plan.closeComicDirs, ["/c", "/a"]);
});

test("resolveActivationSessionId applies policy order and deterministic fallbacks", () => {
  const openSessionIds = new Set(["session:/a", "session:/b", "session:/c"]);
  const sessionId = resolveActivationSessionId({
    focusPolicy: "preserve-active",
    focusComicDir: "session:/z",
    previousActiveSessionId: "session:/b",
    currentActiveSessionId: "session:/a",
    firstNewSessionId: "session:/c",
    lastNewSessionId: "session:/c",
    requestOrderedSessionIds: ["session:/z", "session:/c"],
    openSessionIds,
  });

  assert.equal(sessionId, "session:/b");

  const fallback = resolveActivationSessionId({
    focusPolicy: "explicit",
    focusComicDir: "session:/missing",
    previousActiveSessionId: "session:/missing",
    currentActiveSessionId: "session:/missing",
    firstNewSessionId: null,
    lastNewSessionId: null,
    requestOrderedSessionIds: ["session:/x", "session:/c"],
    openSessionIds,
  });

  assert.equal(fallback, "session:/c");
});

test("resolveActivationSessionId honors first-new and last-new policies before fallback", () => {
  const openSessionIds = new Set(["session:/a", "session:/b", "session:/c", "session:/d"]);

  const firstNew = resolveActivationSessionId({
    focusPolicy: "first-new",
    focusComicDir: "",
    previousActiveSessionId: "session:/a",
    currentActiveSessionId: "session:/a",
    firstNewSessionId: "session:/c",
    lastNewSessionId: "session:/d",
    requestOrderedSessionIds: ["session:/b", "session:/c", "session:/d"],
    openSessionIds,
  });
  assert.equal(firstNew, "session:/c");

  const lastNew = resolveActivationSessionId({
    focusPolicy: "last-new",
    focusComicDir: "",
    previousActiveSessionId: "session:/a",
    currentActiveSessionId: "session:/a",
    firstNewSessionId: "session:/c",
    lastNewSessionId: "session:/d",
    requestOrderedSessionIds: ["session:/b", "session:/c", "session:/d"],
    openSessionIds,
  });
  assert.equal(lastNew, "session:/d");
});

test("resolveActivationSessionId falls back to current active and then first open session", () => {
  const openSessionIds = new Set(["session:/a", "session:/b"]);

  const keepsCurrent = resolveActivationSessionId({
    focusPolicy: "explicit",
    focusComicDir: "session:/missing",
    previousActiveSessionId: "session:/missing",
    currentActiveSessionId: "session:/b",
    firstNewSessionId: null,
    lastNewSessionId: null,
    requestOrderedSessionIds: ["session:/x"],
    openSessionIds,
  });
  assert.equal(keepsCurrent, "session:/b");

  const firstOpen = resolveActivationSessionId({
    focusPolicy: "explicit",
    focusComicDir: "session:/missing",
    previousActiveSessionId: "session:/missing",
    currentActiveSessionId: "session:/missing",
    firstNewSessionId: null,
    lastNewSessionId: null,
    requestOrderedSessionIds: ["session:/x"],
    openSessionIds,
  });
  assert.equal(firstOpen, "session:/a");
});
