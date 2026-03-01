const { MANGA_ID_RE } = require("../groups_store");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyAllowedKeys(value, allowedKeys) {
  const allow = new Set(allowedKeys);
  return Object.keys(value).every((key) => allow.has(key));
}

function invalidRequest(message = "Invalid request payload.") {
  return {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message,
  };
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
  for (const [key, nested] of Object.entries(value)) {
    if (typeof key !== "string") return false;
    if (!isStructuredCloneSafe(nested, depth + 1)) return false;
  }
  return true;
}

function asGroupResponse(result) {
  if (!result || typeof result !== "object") {
    return { ok: false, errorCode: "INTERNAL_ERROR", message: "Unknown groups operation result." };
  }
  if (result.ok) return result;
  return {
    ok: false,
    errorCode: String(result.errorCode || "INTERNAL_ERROR"),
    message: String(result.message || "Groups operation failed."),
    ...(result.details && typeof result.details === "object" ? { details: result.details } : {}),
  };
}

function buildLibraryLookup(loadLibraryIndexCache) {
  let cache = null;
  try {
    cache = loadLibraryIndexCache();
  } catch {
    cache = null;
  }

  const rawEntries = cache && typeof cache === "object" && cache.entries && typeof cache.entries === "object"
    ? cache.entries
    : {};
  const entries = Object.values(rawEntries);

  const knownMangaIds = new Set();
  const mangaIdToDir = new Map();

  for (const entry of entries) {
    const mangaId = String(entry?.id || "").trim();
    const comicDir = String(entry?.dir || "").trim();

    if (MANGA_ID_RE.test(mangaId)) {
      knownMangaIds.add(mangaId);
      if (comicDir) mangaIdToDir.set(mangaId, comicDir);
      continue;
    }

    const dirId = String(entry?.dir || "").split(/[\\/]/).pop() || "";
    if (MANGA_ID_RE.test(dirId)) {
      knownMangaIds.add(dirId);
      if (comicDir && !mangaIdToDir.has(dirId)) mangaIdToDir.set(dirId, comicDir);
    }
  }

  for (const key of Object.keys(rawEntries)) {
    const relId = String(key || "").replace(/^vault:/, "").split("/").pop() || "";
    if (MANGA_ID_RE.test(relId)) {
      knownMangaIds.add(relId);
      const comicDir = String(rawEntries[key]?.dir || "").trim();
      if (comicDir && !mangaIdToDir.has(relId)) mangaIdToDir.set(relId, comicDir);
    }
  }

  return { knownMangaIds, mangaIdToDir };
}

function registerGroupsIpcHandlers(context) {
  const {
    ipcMain,
    groupsStore,
    loadLibraryIndexCache,
  } = context;

  const validatePayload = (payload, allowedKeys) => {
    if (!isPlainObject(payload)) return false;
    if (!hasOnlyAllowedKeys(payload, allowedKeys)) return false;
    return isStructuredCloneSafe(payload);
  };

  const triggerStaleMembershipPrune = () => {
    if (!groupsStore || typeof groupsStore.pruneStaleMemberships !== "function") return;
    const { knownMangaIds } = buildLibraryLookup(loadLibraryIndexCache);
    groupsStore.pruneStaleMemberships({
      isKnownMangaId: (mangaId) => knownMangaIds.has(mangaId),
    });
  };

  ipcMain.handle("groups:list", async (_event, payload = {}) => {
    if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, [])) {
      return invalidRequest();
    }
    triggerStaleMembershipPrune();
    return asGroupResponse(groupsStore.listGroups());
  });

  ipcMain.handle("groups:get", async (_event, payload) => {
    if (!validatePayload(payload, ["groupId"])) {
      return invalidRequest();
    }
    return asGroupResponse(groupsStore.getGroup(payload));
  });

  ipcMain.handle("groups:create", async (_event, payload) => {
    if (!validatePayload(payload, ["name", "description"])) {
      return invalidRequest();
    }
    return asGroupResponse(groupsStore.createGroup(payload));
  });

  ipcMain.handle("groups:update-meta", async (_event, payload) => {
    if (!validatePayload(payload, ["groupId", "name", "description", "expectedUpdatedAt"])) {
      return invalidRequest();
    }
    return asGroupResponse(groupsStore.updateGroupMeta(payload));
  });

  ipcMain.handle("groups:update-membership", async (_event, payload) => {
    if (!validatePayload(payload, ["groupId", "mangaIds", "expectedUpdatedAt"])) {
      return invalidRequest();
    }
    return asGroupResponse(groupsStore.updateGroupMembership(payload));
  });

  ipcMain.handle("groups:delete", async (_event, payload) => {
    if (!validatePayload(payload, ["groupId", "expectedUpdatedAt"])) {
      return invalidRequest();
    }
    return asGroupResponse(groupsStore.deleteGroup(payload));
  });

  ipcMain.handle("groups:resolve-for-reader", async (_event, payload) => {
    if (!validatePayload(payload, ["groupId"])) {
      return invalidRequest();
    }

    const { knownMangaIds, mangaIdToDir } = buildLibraryLookup(loadLibraryIndexCache);
    const resolveResult = groupsStore.resolveForReader({
      groupId: payload.groupId,
      isKnownMangaId: (mangaId) => knownMangaIds.has(mangaId),
    });
    const safeResult = asGroupResponse(resolveResult);
    if (!safeResult.ok) return safeResult;

    const resolvedMangaIds = Array.isArray(safeResult.resolvedMangaIds) ? safeResult.resolvedMangaIds : [];
    const resolvedComicDirs = [];
    for (const mangaId of resolvedMangaIds) {
      const comicDir = String(mangaIdToDir.get(String(mangaId || "").trim()) || "").trim();
      if (!comicDir || resolvedComicDirs.includes(comicDir)) continue;
      resolvedComicDirs.push(comicDir);
    }

    return {
      ...safeResult,
      resolvedComicDirs,
    };
  });
}

module.exports = {
  registerGroupsIpcHandlers,
};
