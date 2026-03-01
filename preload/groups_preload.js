function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeText(value, { maxLength, field }) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds maximum length.`);
  }
  return normalized;
}

function ensureGroupId(value) {
  const groupId = String(value || "").trim();
  return { groupId };
}

function ensureExpectedUpdatedAt(value) {
  const expectedUpdatedAt = String(value || "").trim();
  return { expectedUpdatedAt };
}

function ensureMangaIds(value) {
  if (!Array.isArray(value)) return { mangaIds: [] };
  const mangaIds = [];
  for (const raw of value) {
    const mangaId = String(raw || "").trim();
    if (!mangaId) continue;
    mangaIds.push(mangaId);
  }
  return { mangaIds };
}

const READER_GROUP_BATCH_MODES = new Set(["merge", "replace"]);
const READER_GROUP_BATCH_FOCUS_POLICIES = new Set(["explicit", "first-new", "last-new", "preserve-active"]);
const READER_GROUP_BATCH_MAX_DIRS = 300;
const READER_GROUP_BATCH_REQUEST_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const READER_GROUP_BATCH_GROUP_ID_RE = /^grp_[a-f0-9]{24,64}$/;

function ensureReaderGroupBatchString(value, { field, maxLength = 4096 } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds maximum length.`);
  }
  if (normalized.includes("\u0000")) {
    throw new Error(`${field} contains invalid characters.`);
  }
  return normalized;
}

function ensureReaderOpenGroupBatchPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("reader group batch payload must be an object.");
  }

  const requestId = ensureReaderGroupBatchString(payload.requestId, { field: "requestId", maxLength: 128 });
  if (!READER_GROUP_BATCH_REQUEST_ID_RE.test(requestId)) {
    throw new Error("requestId contains invalid characters.");
  }

  const source = ensureReaderGroupBatchString(payload.source, { field: "source", maxLength: 32 });
  if (source !== "group") {
    throw new Error("source must equal 'group'.");
  }

  const groupId = ensureReaderGroupBatchString(payload.groupId, { field: "groupId", maxLength: 128 });
  if (!READER_GROUP_BATCH_GROUP_ID_RE.test(groupId)) {
    throw new Error("groupId is invalid.");
  }

  const mode = ensureReaderGroupBatchString(payload.mode, { field: "mode", maxLength: 32 });
  if (!READER_GROUP_BATCH_MODES.has(mode)) {
    throw new Error("mode must be one of: merge, replace.");
  }

  const focusPolicy = ensureReaderGroupBatchString(payload.focusPolicy, { field: "focusPolicy", maxLength: 32 });
  if (!READER_GROUP_BATCH_FOCUS_POLICIES.has(focusPolicy)) {
    throw new Error("focusPolicy is invalid.");
  }

  if (!Array.isArray(payload.comicDirs) || payload.comicDirs.length === 0) {
    throw new Error("comicDirs must be a non-empty array.");
  }

  const seen = new Set();
  const comicDirs = [];
  for (const rawDir of payload.comicDirs) {
    const comicDir = String(rawDir || "").trim();
    if (!comicDir || seen.has(comicDir)) continue;
    seen.add(comicDir);
    comicDirs.push(ensureReaderGroupBatchString(comicDir, { field: "comicDir" }));
    if (comicDirs.length > READER_GROUP_BATCH_MAX_DIRS) {
      throw new Error("comicDirs exceeds maximum length.");
    }
  }

  if (!comicDirs.length) {
    throw new Error("comicDirs must include at least one valid path.");
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
    const focusComicDir = ensureReaderGroupBatchString(payload.focusComicDir, { field: "focusComicDir" });
    if (!seen.has(focusComicDir)) {
      throw new Error("focusComicDir must exist in comicDirs.");
    }
    normalized.focusComicDir = focusComicDir;
  }

  return normalized;
}

function buildGroupsBridge(ipcRenderer) {
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new Error("buildGroupsBridge requires an ipcRenderer with invoke().");
  }

  return Object.freeze({
    listGroups: () => ipcRenderer.invoke("groups:list", {}),
    getGroup: (groupIdOrPayload) => {
      const payload = isPlainObject(groupIdOrPayload) ? ensureGroupId(groupIdOrPayload.groupId) : ensureGroupId(groupIdOrPayload);
      return ipcRenderer.invoke("groups:get", payload);
    },
    createGroup: (nameOrPayload, description) => {
      const payload = isPlainObject(nameOrPayload)
        ? {
          name: normalizeText(nameOrPayload.name, { maxLength: 80, field: "name" }),
          description: normalizeText(nameOrPayload.description, { maxLength: 500, field: "description" }),
        }
        : {
          name: normalizeText(nameOrPayload, { maxLength: 80, field: "name" }),
          description: normalizeText(description, { maxLength: 500, field: "description" }),
        };
      return ipcRenderer.invoke("groups:create", payload);
    },
    updateGroupMeta: (payload) => ipcRenderer.invoke("groups:update-meta", {
      ...ensureGroupId(payload?.groupId),
      name: normalizeText(payload?.name, { maxLength: 80, field: "name" }),
      description: normalizeText(payload?.description, { maxLength: 500, field: "description" }),
      ...ensureExpectedUpdatedAt(payload?.expectedUpdatedAt),
    }),
    updateGroupMembership: (payload) => ipcRenderer.invoke("groups:update-membership", {
      ...ensureGroupId(payload?.groupId),
      ...ensureMangaIds(payload?.mangaIds),
      ...ensureExpectedUpdatedAt(payload?.expectedUpdatedAt),
    }),
    deleteGroup: (payload) => ipcRenderer.invoke("groups:delete", {
      ...ensureGroupId(payload?.groupId),
      ...ensureExpectedUpdatedAt(payload?.expectedUpdatedAt),
    }),
    resolveGroupForReader: (groupIdOrPayload) => {
      const payload = isPlainObject(groupIdOrPayload) ? ensureGroupId(groupIdOrPayload.groupId) : ensureGroupId(groupIdOrPayload);
      return ipcRenderer.invoke("groups:resolve-for-reader", payload);
    },
    openReaderGroupBatch: (payload) => {
      const normalized = ensureReaderOpenGroupBatchPayload(payload);
      return ipcRenderer.invoke("ui:readerOpenGroupBatch", normalized);
    },
  });
}

module.exports = {
  buildGroupsBridge,
};
