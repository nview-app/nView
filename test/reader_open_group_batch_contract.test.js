const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateAndNormalizeReaderOpenGroupBatchRequest,
  sanitizeReaderOpenGroupBatchResult,
} = require("../main/ipc/reader_open_group_batch_contract");

test("validateAndNormalizeReaderOpenGroupBatchRequest accepts valid payload and dedupes dirs", () => {
  const result = validateAndNormalizeReaderOpenGroupBatchRequest({
    requestId: "req_123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: [" /a ", "/b", "/a"],
    mode: "replace",
    focusPolicy: "explicit",
    focusComicDir: " /b ",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload.comicDirs, ["/a", "/b"]);
  assert.equal(result.payload.focusComicDir, "/b");
});

test("validateAndNormalizeReaderOpenGroupBatchRequest rejects unknown keys", () => {
  const result = validateAndNormalizeReaderOpenGroupBatchRequest({
    requestId: "req_123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/a"],
    mode: "merge",
    focusPolicy: "preserve-active",
    extra: true,
  });

  assert.deepEqual(result, {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  });
});

test("validateAndNormalizeReaderOpenGroupBatchRequest rejects non-clone-safe payloads", () => {
  const resultWithFunction = validateAndNormalizeReaderOpenGroupBatchRequest({
    requestId: "req_123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/a", () => true],
    mode: "merge",
    focusPolicy: "preserve-active",
  });
  assert.equal(resultWithFunction.ok, false);
  assert.equal(resultWithFunction.errorCode, "VALIDATION_ERROR");

  const deepArray = [[[[[[[[["/a"]]]]]]]]];
  const resultTooDeep = validateAndNormalizeReaderOpenGroupBatchRequest({
    requestId: "req_123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: deepArray,
    mode: "merge",
    focusPolicy: "preserve-active",
  });
  assert.equal(resultTooDeep.ok, false);
  assert.equal(resultTooDeep.errorCode, "VALIDATION_ERROR");
});

test("validateAndNormalizeReaderOpenGroupBatchRequest enforces explicit focusComicDir membership", () => {
  const missingExplicitFocus = validateAndNormalizeReaderOpenGroupBatchRequest({
    requestId: "req_123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    comicDirs: ["/a", "/b"],
    mode: "merge",
    focusPolicy: "explicit",
    focusComicDir: "/missing",
  });

  assert.equal(missingExplicitFocus.ok, false);
  assert.equal(missingExplicitFocus.errorCode, "VALIDATION_ERROR");
});

test("sanitizeReaderOpenGroupBatchResult normalizes invalid success payloads", () => {
  const result = sanitizeReaderOpenGroupBatchResult({
    ok: true,
    requestId: "invalid request id",
    source: "group",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INTERNAL_ERROR");
});

test("sanitizeReaderOpenGroupBatchResult enforces success count invariants", () => {
  const result = sanitizeReaderOpenGroupBatchResult({
    ok: true,
    requestId: "req-123",
    source: "group",
    groupId: "grp_aaaaaaaaaaaaaaaaaaaaaaaa",
    mode: "merge",
    focusPolicy: "preserve-active",
    openedCount: 1,
    reusedCount: 1,
    unavailableCount: 0,
    requestedCount: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INTERNAL_ERROR");
});

test("sanitizeReaderOpenGroupBatchResult redacts reader error details", () => {
  const result = sanitizeReaderOpenGroupBatchResult({
    ok: false,
    requestId: "req-123",
    source: "group",
    errorCode: "READER_UNAVAILABLE",
    message: "Failed to open /Users/alice/private/manga/a",
  });

  assert.deepEqual(result, {
    ok: false,
    errorCode: "READER_UNAVAILABLE",
    message: "Reader window is unavailable.",
    requestId: "req-123",
    source: "group",
  });
});
