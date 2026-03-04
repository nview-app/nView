const crypto = require("node:crypto");
const {
  TAG_MANAGER_SCHEMA_VERSION,
  TAG_TAXONOMY,
  buildTypedVisibilityKey,
  MAX_MANAGED_TAGS,
  MAX_ALIAS_GROUPS,
  MAX_MEMBERS_PER_GROUP,
  MAX_RAW_TAG_KEY_LENGTH,
  MAX_ALIAS_NAME_LENGTH,
} = require("./tag_manager_store");

const MAX_QUERY_LENGTH = MAX_RAW_TAG_KEY_LENGTH;
const TAXONOMY_VALUES = Object.freeze(Object.values(TAG_TAXONOMY));
const TAXONOMY_SET = new Set(TAXONOMY_VALUES);

function createError(errorCode, message, details) {
  return {
    ok: false,
    errorCode,
    message,
    ...(details && typeof details === "object" ? { details } : {}),
  };
}

function ok(value = {}) {
  return { ok: true, ...value };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function collapseWhitespace(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeRawTagKey(value) {
  return collapseWhitespace(String(value || "").normalize("NFKC")).toLocaleLowerCase("en-US");
}

function normalizeAliasName(value) {
  return collapseWhitespace(String(value || "").normalize("NFKC"));
}

function normalizeTaxonomy(value) {
  const taxonomy = String(value || "").trim();
  if (!TAXONOMY_SET.has(taxonomy)) {
    return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TAXONOMY" });
  }
  return ok({ taxonomy });
}

function normalizeRawTagList(rawTags, { fieldName, maxCount }) {
  if (!Array.isArray(rawTags)) {
    return createError("VALIDATION_ERROR", "Validation failed.", { reason: `${fieldName}_NOT_ARRAY` });
  }
  if (rawTags.length > maxCount) {
    return createError("VALIDATION_ERROR", "Validation failed.", { reason: `${fieldName}_TOO_LARGE` });
  }
  const dedupe = new Set();
  const normalized = [];
  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: `${fieldName}_NON_STRING` });
    }
    const key = normalizeRawTagKey(rawTag);
    if (!key) continue;
    if (key.length > MAX_RAW_TAG_KEY_LENGTH) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: `${fieldName}_TAG_TOO_LONG` });
    }
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    normalized.push(key);
  }
  return ok({ tags: normalized });
}

function sourceLabelForTaxonomy(taxonomy) {
  if (taxonomy === TAG_TAXONOMY.PARODIES) return "Parodies";
  if (taxonomy === TAG_TAXONOMY.CHARACTERS) return "Characters";
  return "";
}

function buildIndexes(state) {
  const aliasById = new Map();
  const aliasNameFoldById = new Map();
  const aliasIdByMember = new Map();
  for (const group of state.aliasGroups) {
    aliasById.set(group.aliasId, group);
    aliasNameFoldById.set(group.aliasId, normalizeRawTagKey(group.aliasName));
    const taxonomy = group.taxonomy || TAG_TAXONOMY.TAGS;
    for (const memberRawTag of group.memberRawTags) {
      const typedKey = buildTypedVisibilityKey(taxonomy, memberRawTag);
      if (!typedKey) continue;
      aliasIdByMember.set(typedKey, group.aliasId);
    }
  }
  return {
    aliasById,
    aliasNameFoldById,
    aliasIdByMember,
  };
}

function buildTypedInputKey({ taxonomy, rawTag }) {
  const taxonomyResult = normalizeTaxonomy(taxonomy);
  if (!taxonomyResult.ok) return taxonomyResult;
  if (typeof rawTag !== "string") {
    return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_RAW_TAG" });
  }
  const rawTagKey = normalizeRawTagKey(rawTag);
  if (!rawTagKey || rawTagKey.length > MAX_RAW_TAG_KEY_LENGTH) {
    return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_RAW_TAG" });
  }
  const typedKey = buildTypedVisibilityKey(taxonomyResult.taxonomy, rawTagKey);
  if (!typedKey) {
    return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TYPED_KEY" });
  }
  return ok({ taxonomy: taxonomyResult.taxonomy, rawTagKey, typedKey });
}

function createTagManagerService({
  tagManagerStore,
  now = () => new Date().toISOString(),
  randomUUID = () => crypto.randomUUID(),
  listInventoryRawTags,
}) {
  if (!tagManagerStore || typeof tagManagerStore.readState !== "function" || typeof tagManagerStore.replaceState !== "function") {
    throw new Error("createTagManagerService requires a valid tagManagerStore");
  }

  function mutate(mutator) {
    const loaded = tagManagerStore.readState();
    if (!loaded.ok) return loaded;

    const result = mutator(loaded.state);
    if (!result.ok) return result;

    const nextState = {
      ...loaded.state,
      ...result.nextState,
      schemaVersion: TAG_MANAGER_SCHEMA_VERSION,
      updatedAt: now(),
    };
    const written = tagManagerStore.replaceState(nextState);
    if (!written.ok) return written;

    return ok({
      state: nextState,
      ...("response" in result ? { response: result.response } : {}),
    });
  }

  function getSnapshot({ includeStats = false, includeInventory = false } = {}) {
    const loaded = tagManagerStore.readState();
    if (!loaded.ok) return loaded;
    const payload = { snapshot: loaded.state };
    if (includeStats) {
      const groupedMembers = loaded.state.aliasGroups.reduce((acc, group) => acc + group.memberRawTags.length, 0);
      payload.stats = {
        managedTags: Object.keys(loaded.state.visibilityRules).length,
        aliasGroups: loaded.state.aliasGroups.length,
        groupedMembers,
      };
    }
    if (includeInventory) {
      if (typeof listInventoryRawTags !== "function") {
        payload.inventory = [];
      } else {
        const inventoryResult = listInventoryRawTags();
        if (!inventoryResult?.ok) return inventoryResult;
        payload.inventory = Array.isArray(inventoryResult.tags) ? inventoryResult.tags : [];
        if (inventoryResult.stats && typeof inventoryResult.stats === "object") {
          payload.inventoryStats = inventoryResult.stats;
        }
      }
    }
    return ok(payload);
  }

  function setVisibility(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["taxonomy", "rawTag", "visibleInFilter"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (typeof input.visibleInFilter !== "boolean") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_VISIBILITY" });
    }

    const typedInput = buildTypedInputKey({ taxonomy: input.taxonomy, rawTag: input.rawTag });
    if (!typedInput.ok) return typedInput;

    return mutate((state) => {
      const visibilityRules = { ...state.visibilityRules };
      if (input.visibleInFilter) {
        delete visibilityRules[typedInput.typedKey];
      } else {
        if (!visibilityRules[typedInput.typedKey] && Object.keys(visibilityRules).length >= MAX_MANAGED_TAGS) {
          return createError("VALIDATION_ERROR", "Validation failed.", { reason: "MAX_MANAGED_TAGS_EXCEEDED" });
        }
        visibilityRules[typedInput.typedKey] = { visibleInFilter: false };
      }
      return ok({ nextState: { visibilityRules } });
    });
  }

  function bulkSetVisibility(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["taxonomy", "rawTags", "visibleInFilter"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (typeof input.visibleInFilter !== "boolean") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_VISIBILITY" });
    }

    const taxonomyResult = normalizeTaxonomy(input.taxonomy);
    if (!taxonomyResult.ok) return taxonomyResult;
    const normalized = normalizeRawTagList(input.rawTags, { fieldName: "RAW_TAGS", maxCount: MAX_MANAGED_TAGS });
    if (!normalized.ok) return normalized;

    return mutate((state) => {
      const visibilityRules = { ...state.visibilityRules };
      for (const rawTagKey of normalized.tags) {
        const typedKey = buildTypedVisibilityKey(taxonomyResult.taxonomy, rawTagKey);
        if (!typedKey) continue;
        if (input.visibleInFilter) {
          delete visibilityRules[typedKey];
          continue;
        }
        if (!visibilityRules[typedKey] && Object.keys(visibilityRules).length >= MAX_MANAGED_TAGS) {
          return createError("VALIDATION_ERROR", "Validation failed.", { reason: "MAX_MANAGED_TAGS_EXCEEDED" });
        }
        visibilityRules[typedKey] = { visibleInFilter: false };
      }
      return ok({ nextState: { visibilityRules } });
    });
  }

  function createAliasGroup(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["aliasName", "taxonomy", "memberRawTags"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    const taxonomyResult = normalizeTaxonomy(input.taxonomy);
    if (!taxonomyResult.ok) return taxonomyResult;

    const aliasName = normalizeAliasName(input.aliasName);
    if (!aliasName || aliasName.length > MAX_ALIAS_NAME_LENGTH) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_ALIAS_NAME" });
    }

    const normalized = normalizeRawTagList(input.memberRawTags, {
      fieldName: "MEMBER_RAW_TAGS",
      maxCount: MAX_MEMBERS_PER_GROUP,
    });
    if (!normalized.ok) return normalized;
    if (normalized.tags.length < 1) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "EMPTY_ALIAS_GROUP" });
    }

    return mutate((state) => {
      if (state.aliasGroups.length >= MAX_ALIAS_GROUPS) {
        return createError("VALIDATION_ERROR", "Validation failed.", { reason: "MAX_ALIAS_GROUPS_EXCEEDED" });
      }
      const indexes = buildIndexes(state);
      const aliasNameFold = normalizeRawTagKey(aliasName);
      for (const group of state.aliasGroups) {
        if (group.taxonomy !== taxonomyResult.taxonomy) continue;
        if (normalizeRawTagKey(group.aliasName) === aliasNameFold) {
          return createError("CONFLICT", "Alias group already exists.", { reason: "ALIAS_NAME_CONFLICT" });
        }
      }
      const memberRawTagsInUse = [];
      for (const tag of normalized.tags) {
        const typedMemberKey = buildTypedVisibilityKey(taxonomyResult.taxonomy, tag);
        if (typedMemberKey && indexes.aliasIdByMember.has(typedMemberKey)) {
          memberRawTagsInUse.push(tag);
        }
      }
      if (memberRawTagsInUse.length > 0) {
        return createError("CONFLICT", "Raw tag already belongs to an alias group.", {
          reason: "MEMBER_CONFLICT",
          memberRawTagsInUse,
        });
      }
      const timestamp = now();
      const group = {
        aliasId: randomUUID(),
        aliasName,
        taxonomy: taxonomyResult.taxonomy,
        memberRawTags: normalized.tags,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return ok({
        nextState: { aliasGroups: [...state.aliasGroups, group] },
        response: { aliasGroup: group },
      });
    });
  }

  function resetVisibility(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["scope", "typedKeys"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (input.scope !== "all" && input.scope !== "selection") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_SCOPE" });
    }
    if (input.scope === "all") {
      return mutate(() => ok({ nextState: { visibilityRules: {} } }));
    }
    if (!Array.isArray(input.typedKeys) || input.typedKeys.length < 1 || input.typedKeys.length > MAX_MANAGED_TAGS) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TYPED_KEYS" });
    }

    const dedupe = new Set();
    for (const typedKey of input.typedKeys) {
      if (typeof typedKey !== "string") {
        return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TYPED_KEYS" });
      }
      const parts = typedKey.split(":");
      if (parts.length !== 2) {
        return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TYPED_KEYS" });
      }
      const rebuilt = buildTypedVisibilityKey(parts[0], parts[1]);
      if (!rebuilt || rebuilt !== typedKey) {
        return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TYPED_KEYS" });
      }
      dedupe.add(typedKey);
    }

    return mutate((state) => {
      const visibilityRules = { ...state.visibilityRules };
      for (const typedKey of dedupe) {
        delete visibilityRules[typedKey];
      }
      return ok({ nextState: { visibilityRules } });
    });
  }

  function updateAliasGroup(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["aliasId", "aliasName", "memberRawTags", "expectedUpdatedAt"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (typeof input.aliasId !== "string" || !input.aliasId.trim()) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_ALIAS_ID" });
    }
    if (typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt.trim()) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_EXPECTED_UPDATED_AT" });
    }
    if (input.aliasName !== undefined && typeof input.aliasName !== "string") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_ALIAS_NAME" });
    }
    if (input.memberRawTags !== undefined && !Array.isArray(input.memberRawTags)) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "MEMBER_RAW_TAGS_NOT_ARRAY" });
    }

    const aliasName = input.aliasName === undefined ? undefined : normalizeAliasName(input.aliasName);
    if (aliasName !== undefined && (!aliasName || aliasName.length > MAX_ALIAS_NAME_LENGTH)) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_ALIAS_NAME" });
    }

    const normalizedMembers = input.memberRawTags === undefined
      ? null
      : normalizeRawTagList(input.memberRawTags, {
        fieldName: "MEMBER_RAW_TAGS",
        maxCount: MAX_MEMBERS_PER_GROUP,
      });
    if (normalizedMembers && !normalizedMembers.ok) return normalizedMembers;
    if (normalizedMembers && normalizedMembers.tags.length < 1) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "EMPTY_ALIAS_GROUP" });
    }

    return mutate((state) => {
      const idx = state.aliasGroups.findIndex((group) => group.aliasId === input.aliasId.trim());
      if (idx < 0) return createError("NOT_FOUND", "Alias group was not found.");

      const current = state.aliasGroups[idx];
      const taxonomy = current.taxonomy || TAG_TAXONOMY.TAGS;
      if (current.updatedAt !== input.expectedUpdatedAt.trim()) {
        return createError("CONFLICT", "Alias group has changed. Refresh and retry.", { reason: "STALE_WRITE" });
      }

      const nextAliasName = aliasName === undefined ? current.aliasName : aliasName;
      const nextMembers = normalizedMembers ? normalizedMembers.tags : current.memberRawTags;
      const nextAliasNameFold = normalizeRawTagKey(nextAliasName);

      for (const group of state.aliasGroups) {
        if (group.aliasId === current.aliasId || group.taxonomy !== taxonomy) continue;
        if (normalizeRawTagKey(group.aliasName) === nextAliasNameFold) {
          return createError("CONFLICT", "Alias group already exists.", { reason: "ALIAS_NAME_CONFLICT" });
        }
      }

      const nextMemberSet = new Set(nextMembers);
      const memberRawTagsInUse = [];
      for (const group of state.aliasGroups) {
        if (group.aliasId === current.aliasId || group.taxonomy !== taxonomy) continue;
        for (const member of group.memberRawTags) {
          if (nextMemberSet.has(member)) {
            memberRawTagsInUse.push(member);
          }
        }
      }
      if (memberRawTagsInUse.length > 0) {
        return createError("CONFLICT", "Raw tag already belongs to an alias group.", {
          reason: "MEMBER_CONFLICT",
          memberRawTagsInUse,
        });
      }

      const timestamp = now();
      const updated = {
        ...current,
        taxonomy,
        aliasName: nextAliasName,
        memberRawTags: nextMembers,
        updatedAt: timestamp,
      };
      const aliasGroups = state.aliasGroups.slice();
      aliasGroups[idx] = updated;
      return ok({
        nextState: { aliasGroups },
        response: { aliasGroup: updated },
      });
    });
  }

  function deleteAliasGroup(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["aliasId", "expectedUpdatedAt"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (typeof input.aliasId !== "string" || !input.aliasId.trim()) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_ALIAS_ID" });
    }
    if (typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt.trim()) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_EXPECTED_UPDATED_AT" });
    }

    return mutate((state) => {
      const idx = state.aliasGroups.findIndex((group) => group.aliasId === input.aliasId.trim());
      if (idx < 0) return createError("NOT_FOUND", "Alias group was not found.");
      const current = state.aliasGroups[idx];
      if (current.updatedAt !== input.expectedUpdatedAt.trim()) {
        return createError("CONFLICT", "Alias group has changed. Refresh and retry.", { reason: "STALE_WRITE" });
      }
      const aliasGroups = state.aliasGroups.filter((group) => group.aliasId !== current.aliasId);
      return ok({ nextState: { aliasGroups } });
    });
  }

  function isVisibleInFilter(state, taxonomy, rawTagKey) {
    const typedKey = buildTypedVisibilityKey(taxonomy, rawTagKey);
    if (!typedKey) return true;
    return state.visibilityRules[typedKey]?.visibleInFilter !== false;
  }

  function resolveForFilter(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["rawTagsByTaxonomy", "query"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (!isPlainObject(input.rawTagsByTaxonomy) || !hasOnlyKeys(input.rawTagsByTaxonomy, TAXONOMY_VALUES)) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_RAW_TAGS_BY_TAXONOMY" });
    }

    const normalizedByTaxonomy = {};
    for (const taxonomy of TAXONOMY_VALUES) {
      const normalized = normalizeRawTagList(input.rawTagsByTaxonomy[taxonomy] || [], {
        fieldName: `RAW_TAGS_${taxonomy.toUpperCase()}`,
        maxCount: MAX_MANAGED_TAGS,
      });
      if (!normalized.ok) return normalized;
      normalizedByTaxonomy[taxonomy] = normalized.tags;
    }

    if (input.query !== undefined && typeof input.query !== "string") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_QUERY" });
    }
    const query = input.query === undefined ? "" : normalizeRawTagKey(input.query);
    if (query.length > MAX_QUERY_LENGTH) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "QUERY_TOO_LONG" });
    }

    const loaded = tagManagerStore.readState();
    if (!loaded.ok) return loaded;
    const state = loaded.state;
    const indexes = buildIndexes(state);

    const entries = [];
    const aliasInserted = new Set();

    for (const taxonomy of TAXONOMY_VALUES) {
      const sourceLabel = sourceLabelForTaxonomy(taxonomy);
      for (const rawTagKey of normalizedByTaxonomy[taxonomy]) {
        if (!isVisibleInFilter(state, taxonomy, rawTagKey)) continue;
        const typedKey = buildTypedVisibilityKey(taxonomy, rawTagKey);
        if (!typedKey) continue;
        const aliasId = indexes.aliasIdByMember.get(typedKey);
        if (!aliasId) {
          entries.push({
            type: "raw",
            key: typedKey,
            label: sourceLabel ? `${rawTagKey} (${sourceLabel})` : rawTagKey,
            taxonomy,
            sourceLabel,
            rawTagKey,
            typedKey,
          });
          continue;
        }
        if (aliasInserted.has(aliasId)) continue;
        const group = indexes.aliasById.get(aliasId);
        if (!group) continue;
        aliasInserted.add(aliasId);
        entries.push({
          type: "alias",
          key: `alias:${group.aliasId}`,
          label: sourceLabel ? `${group.aliasName} (Alias · ${sourceLabel})` : `${group.aliasName} (Alias)`,
          aliasId: group.aliasId,
          aliasName: group.aliasName,
          taxonomy,
          sourceLabel,
          memberRawTags: [...group.memberRawTags],
        });
      }
    }

    const filtered = query
      ? entries.filter((entry) => {
        if (entry.type === "raw") {
          if (entry.rawTagKey.includes(query)) return true;
          const sourceLabelFolded = normalizeRawTagKey(entry.sourceLabel);
          return sourceLabelFolded.includes(query);
        }
        const aliasFolded = indexes.aliasNameFoldById.get(entry.aliasId) || "";
        if (aliasFolded.includes(query)) return true;
        const sourceLabelFolded = normalizeRawTagKey(entry.sourceLabel);
        if (sourceLabelFolded.includes(query)) return true;
        return entry.memberRawTags.some((member) => member.includes(query));
      })
      : entries;

    filtered.sort((a, b) => {
      const labelOrder = a.label.localeCompare(b.label, "en", { sensitivity: "base" });
      if (labelOrder !== 0) return labelOrder;
      return a.key.localeCompare(b.key, "en", { sensitivity: "base" });
    });

    return ok({ entries: filtered });
  }

  function resolveForMetadata(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["taxonomy", "rawTags"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    if (input.taxonomy !== TAG_TAXONOMY.TAGS) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_TAXONOMY" });
    }
    if (!Array.isArray(input.rawTags) || input.rawTags.length > MAX_MANAGED_TAGS) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "RAW_TAGS_NOT_ARRAY" });
    }

    const loaded = tagManagerStore.readState();
    if (!loaded.ok) return loaded;
    const indexes = buildIndexes(loaded.state);

    const rows = [];
    const seen = new Set();

    for (const rawTag of input.rawTags) {
      if (typeof rawTag !== "string") {
        return createError("VALIDATION_ERROR", "Validation failed.", { reason: "RAW_TAG_NON_STRING" });
      }
      const displayRawTag = collapseWhitespace(rawTag.normalize("NFKC"));
      const rawTagKey = normalizeRawTagKey(rawTag);
      if (!displayRawTag || !rawTagKey) continue;
      if (rawTagKey.length > MAX_RAW_TAG_KEY_LENGTH) {
        return createError("VALIDATION_ERROR", "Validation failed.", { reason: "RAW_TAG_TOO_LONG" });
      }
      if (seen.has(rawTagKey)) continue;
      seen.add(rawTagKey);

      const typedKey = buildTypedVisibilityKey(TAG_TAXONOMY.TAGS, rawTagKey);
      const aliasId = typedKey ? indexes.aliasIdByMember.get(typedKey) : null;
      const alias = aliasId
        ? {
          aliasId,
          aliasName: indexes.aliasById.get(aliasId).aliasName,
        }
        : null;

      rows.push({
        rawTag: displayRawTag,
        rawTagKey,
        alias,
      });
    }

    rows.sort((a, b) => {
      const rawOrder = a.rawTag.localeCompare(b.rawTag, "en", { sensitivity: "base" });
      if (rawOrder !== 0) return rawOrder;
      return a.rawTagKey.localeCompare(b.rawTagKey, "en", { sensitivity: "base" });
    });

    return ok({ rows });
  }

  function recoverStore(input) {
    if (!isPlainObject(input) || !hasOnlyKeys(input, ["strategy"])) {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_PAYLOAD_SHAPE" });
    }
    const strategy = String(input.strategy || "").trim().toLowerCase();
    if (strategy !== "backup" && strategy !== "reset") {
      return createError("VALIDATION_ERROR", "Validation failed.", { reason: "INVALID_RECOVERY_STRATEGY" });
    }
    if (strategy === "backup") {
      if (typeof tagManagerStore.recoverFromBackup !== "function") {
        return createError("STORE_UNAVAILABLE", "Tag manager backup recovery is unavailable.");
      }
      return tagManagerStore.recoverFromBackup();
    }
    if (typeof tagManagerStore.resetState !== "function") {
      return createError("STORE_UNAVAILABLE", "Tag manager recovery is unavailable.");
    }
    return tagManagerStore.resetState();
  }

  return {
    normalizeRawTagKey,
    normalizeAliasName,
    normalizeTaxonomy,
    getSnapshot,
    setVisibility,
    bulkSetVisibility,
    resetVisibility,
    createAliasGroup,
    updateAliasGroup,
    deleteAliasGroup,
    resolveForFilter,
    resolveForMetadata,
    recoverStore,
  };
}

module.exports = {
  createTagManagerService,
  normalizeRawTagKey,
  normalizeAliasName,
};
