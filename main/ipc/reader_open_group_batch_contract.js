const { MAX_READER_LAUNCH_SIZE } = require("../groups_store");

const REQUEST_ALLOWED_KEYS = Object.freeze([
  "requestId",
  "source",
  "groupId",
  "comicDirs",
  "mode",
  "focusPolicy",
  "focusComicDir",
]);

const RESPONSE_ALLOWED_KEYS = Object.freeze([
  "ok",
  "errorCode",
  "message",
  "requestId",
  "source",
  "groupId",
  "mode",
  "focusPolicy",
  "openedCount",
  "reusedCount",
  "unavailableCount",
  "requestedCount",
  "truncated",
  "activatedSessionId",
  "activatedComicDir",
  "dedupedByRequestId",
]);

const REQUEST_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const GROUP_ID_RE = /^grp_[a-f0-9]{24,64}$/;
const MODE_SET = new Set(["merge", "replace"]);
const FOCUS_POLICY_SET = new Set(["explicit", "first-new", "last-new", "preserve-active"]);
const ERROR_CODE_SET = new Set([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "READER_UNAVAILABLE",
  "REQUEST_SUPERSEDED",
  "INTERNAL_ERROR",
]);

const ERROR_CODE_DEFAULT_MESSAGES = Object.freeze({
  VALIDATION_ERROR: "Invalid reader group batch request.",
  UNAUTHORIZED: "Unauthorized reader group batch request.",
  READER_UNAVAILABLE: "Reader window is unavailable.",
  REQUEST_SUPERSEDED: "Reader group batch request was superseded.",
  INTERNAL_ERROR: "Reader request failed.",
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyAllowedKeys(value, allowedKeys) {
  const allow = new Set(allowedKeys);
  return Object.keys(value).every((key) => allow.has(key));
}

function isStructuredCloneSafe(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") return true;
  if (valueType === "undefined") return true;
  if (valueType === "function" || valueType === "symbol" || valueType === "bigint") return false;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isStructuredCloneSafe(item, depth + 1)) return false;
    }
    return true;
  }

  if (!isPlainObject(value)) return false;
  for (const nested of Object.values(value)) {
    if (!isStructuredCloneSafe(nested, depth + 1)) return false;
  }
  return true;
}

function normalizeComicDir(value) {
  const next = String(value || "").trim();
  if (!next) return "";
  if (next.length > 4096) return "";
  if (next.includes("\u0000")) return "";
  return next;
}

function createValidationError(message) {
  return {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message,
  };
}

function validateAndNormalizeReaderOpenGroupBatchRequest(payload) {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, REQUEST_ALLOWED_KEYS) || !isStructuredCloneSafe(payload)) {
    return createValidationError("Invalid request payload.");
  }

  const requestId = String(payload.requestId || "").trim();
  if (!REQUEST_ID_RE.test(requestId)) {
    return createValidationError("Invalid request id.");
  }

  const source = String(payload.source || "").trim();
  if (source !== "group") {
    return createValidationError("Invalid source.");
  }

  const groupId = String(payload.groupId || "").trim();
  if (!GROUP_ID_RE.test(groupId)) {
    return createValidationError("Invalid group id.");
  }

  const mode = String(payload.mode || "").trim();
  if (!MODE_SET.has(mode)) {
    return createValidationError("Invalid mode.");
  }

  const focusPolicy = String(payload.focusPolicy || "").trim();
  if (!FOCUS_POLICY_SET.has(focusPolicy)) {
    return createValidationError("Invalid focus policy.");
  }

  if (!Array.isArray(payload.comicDirs)) {
    return createValidationError("comicDirs must be a non-empty array.");
  }

  const seen = new Set();
  const comicDirs = [];
  for (const rawDir of payload.comicDirs) {
    const comicDir = normalizeComicDir(rawDir);
    if (!comicDir || seen.has(comicDir)) continue;
    seen.add(comicDir);
    comicDirs.push(comicDir);
    if (comicDirs.length > MAX_READER_LAUNCH_SIZE) {
      return createValidationError("Too many comic directories requested.");
    }
  }

  if (!comicDirs.length) {
    return createValidationError("comicDirs must contain at least one valid path.");
  }

  const normalized = {
    requestId,
    source,
    groupId,
    comicDirs,
    mode,
    focusPolicy,
  };

  if (focusPolicy === "explicit") {
    const focusComicDir = normalizeComicDir(payload.focusComicDir);
    if (!focusComicDir || !seen.has(focusComicDir)) {
      return createValidationError("focusComicDir must match a requested comic directory.");
    }
    normalized.focusComicDir = focusComicDir;
  }

  return { ok: true, payload: normalized };
}

function sanitizeReaderOpenGroupBatchResult(payload) {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, RESPONSE_ALLOWED_KEYS) || !isStructuredCloneSafe(payload)) {
    return {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: "Reader returned an invalid response payload.",
    };
  }

  const ok = payload.ok === true;
  if (!ok) {
    const errorCode = ERROR_CODE_SET.has(payload.errorCode) ? payload.errorCode : "INTERNAL_ERROR";
    return {
      ok: false,
      errorCode,
      message: ERROR_CODE_DEFAULT_MESSAGES[errorCode],
      requestId: REQUEST_ID_RE.test(String(payload.requestId || "").trim())
        ? String(payload.requestId || "").trim()
        : undefined,
      source: String(payload.source || "").trim() === "group" ? "group" : undefined,
    };
  }

  const requestId = String(payload.requestId || "").trim();
  const source = String(payload.source || "").trim();
  if (!REQUEST_ID_RE.test(requestId) || source !== "group") {
    return {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: "Reader returned an invalid success response.",
    };
  }

  const groupId = String(payload.groupId || "").trim();
  if (!GROUP_ID_RE.test(groupId)) {
    return {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: "Reader returned an invalid success response.",
    };
  }

  const mode = String(payload.mode || "").trim();
  const focusPolicy = String(payload.focusPolicy || "").trim();
  if (!MODE_SET.has(mode) || !FOCUS_POLICY_SET.has(focusPolicy)) {
    return {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: "Reader returned an invalid success response.",
    };
  }

  const openedCount = Number(payload.openedCount);
  const reusedCount = Number(payload.reusedCount);
  const unavailableCount = Number(payload.unavailableCount);
  const requestedCount = Number(payload.requestedCount);
  const hasValidCounts = [openedCount, reusedCount, unavailableCount, requestedCount]
    .every((value) => Number.isInteger(value) && value >= 0);
  const hasCountInvariant = hasValidCounts
    && requestedCount >= 1
    && openedCount + reusedCount + unavailableCount === requestedCount;
  if (!hasCountInvariant) {
    return {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: "Reader returned an invalid success response.",
    };
  }

  return {
    ok: true,
    requestId,
    source,
    groupId,
    mode,
    focusPolicy,
    openedCount,
    reusedCount,
    unavailableCount,
    requestedCount,
    truncated: payload.truncated === true,
    activatedSessionId: payload.activatedSessionId == null ? null : String(payload.activatedSessionId).trim().slice(0, 256),
    activatedComicDir: payload.activatedComicDir == null ? null : normalizeComicDir(payload.activatedComicDir),
    dedupedByRequestId: payload.dedupedByRequestId === true,
  };
}

module.exports = {
  validateAndNormalizeReaderOpenGroupBatchRequest,
  sanitizeReaderOpenGroupBatchResult,
};
