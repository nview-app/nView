const { resolveTagManagerRollout } = require("../tag_manager_rollout");
const { isTagManagerConsoleLoggingEnabled } = require("../../shared/dev_mode");
const { createTagManagerService } = require("../tag_manager_service");
const { TAG_TAXONOMY, buildTypedVisibilityKey } = require("../tag_manager_store");

const INVENTORY_CACHE_TTL_MS = 10_000;
const INVENTORY_TAXONOMIES = Object.freeze([
  TAG_TAXONOMY.TAGS,
  TAG_TAXONOMY.PARODIES,
  TAG_TAXONOMY.CHARACTERS,
]);

function sourceLabelForTaxonomy(taxonomy) {
  if (taxonomy === TAG_TAXONOMY.PARODIES) return "Parodies";
  if (taxonomy === TAG_TAXONOMY.CHARACTERS) return "Characters";
  return "";
}

function normalizeRawTagKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function buildInventoryVersion(entries) {
  const keys = Object.keys(entries || {}).sort();
  let digest = `${keys.length}:`;
  for (const key of keys) {
    const entry = entries[key] || {};
    digest += `${key}|${entry.dirMtimeMs || 0}|${entry.contentDirMtimeMs || 0};`;
  }
  return digest;
}

function buildTypedInventoryEntry(taxonomy, rawTag) {
  if (typeof rawTag !== "string") return null;
  const rawTagKey = normalizeRawTagKey(rawTag);
  if (!rawTagKey) return null;
  const typedKey = buildTypedVisibilityKey(taxonomy, rawTagKey);
  if (!typedKey) return null;
  const sourceLabel = sourceLabelForTaxonomy(taxonomy);
  return {
    taxonomy,
    rawTagKey,
    typedKey,
    sourceLabel,
    label: sourceLabel ? `${rawTagKey} (${sourceLabel})` : rawTagKey,
  };
}

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
  for (const [key, nested] of Object.entries(value)) {
    if (typeof key !== "string") return false;
    if (!isStructuredCloneSafe(nested, depth + 1)) return false;
  }
  return true;
}

function invalidRequest() {
  return {
    ok: false,
    errorCode: "VALIDATION_ERROR",
    message: "Invalid request payload.",
  };
}

function asTagManagerResponse(result, fallbackMessage) {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: String(fallbackMessage || "Tag manager operation failed."),
    };
  }
  if (result.ok) return result;
  return {
    ok: false,
    errorCode: String(result.errorCode || "INTERNAL_ERROR"),
    message: String(result.message || fallbackMessage || "Tag manager operation failed."),
    ...(result.details && typeof result.details === "object" ? { details: result.details } : {}),
  };
}

function validatePayload(payload, allowedKeys) {
  if (!isPlainObject(payload)) return false;
  if (!hasOnlyAllowedKeys(payload, allowedKeys)) return false;
  return isStructuredCloneSafe(payload);
}

function buildSnapshotTelemetryDetails(payload, response) {
  const details = {
    includeInventory: Boolean(payload?.includeInventory),
    includeStats: Boolean(payload?.includeStats),
  };
  if (!details.includeInventory || !response?.ok) return details;

  details.inventoryCount = Array.isArray(response.inventory) ? response.inventory.length : 0;
  const stats = response.inventoryStats && typeof response.inventoryStats === "object"
    ? response.inventoryStats
    : null;
  if (!stats) return details;

  if (typeof stats.source === "string") details.inventorySource = stats.source;
  if (Number.isFinite(stats.entryCount)) details.inventoryEntryCount = stats.entryCount;
  if (Number.isFinite(stats.scannedTagValues)) details.inventoryScannedTagValues = stats.scannedTagValues;
  if (Number.isFinite(stats.entriesWithAnyTagArray)) details.inventoryEntriesWithAnyTagArray = stats.entriesWithAnyTagArray;
  if (Number.isFinite(stats.entriesMissingAllTagArrays)) details.inventoryEntriesMissingAllTagArrays = stats.entriesMissingAllTagArrays;
  if (Number.isFinite(stats.entriesWithAtLeastOneTagValue)) details.inventoryEntriesWithAtLeastOneTagValue = stats.entriesWithAtLeastOneTagValue;
  if (typeof stats.computedAt === "string") details.inventoryComputedAt = stats.computedAt;
  return details;
}

function registerTagManagerIpcHandlers(context) {
  const {
    ipcMain,
    tagManagerStore,
    loadLibraryIndexCache,
    auditLogger,
    settingsManager,
    telemetryLogger,
  } = context;
  const safeAuditLogger = typeof auditLogger === "function" ? auditLogger : null;

  const emitAudit = (event, details = {}) => {
    if (!safeAuditLogger) return;
    try {
      safeAuditLogger({ component: "tag-manager-ipc", event, ...details });
    } catch {
      // Never block IPC execution on logging failures.
    }
  };


  function emitTelemetry(event, details = {}) {
    if (typeof telemetryLogger === "function") {
      try {
        telemetryLogger({ component: "tag-manager", event, ...details });
      } catch {
        // Never block IPC execution on telemetry failures.
      }
      return;
    }
    if (!safeAuditLogger) return;
    emitAudit(`telemetry:${event}`, details);
  }

  function getRollout() {
    return resolveTagManagerRollout(settingsManager);
  }

  function featureDisabledResponse() {
    return {
      ok: false,
      errorCode: "FEATURE_DISABLED",
      message: "Tag manager is currently disabled.",
    };
  }

  const inventoryCache = {
    version: "",
    builtAtMs: 0,
    tags: [],
    entryCount: 0,
    scannedTagValues: 0,
    entriesWithAnyTagArray: 0,
    entriesMissingAllTagArrays: 0,
    entriesWithAtLeastOneTagValue: 0,
  };

  function listInventoryRawTags() {
    if (typeof loadLibraryIndexCache !== "function") {
      return { ok: true, tags: [], stats: { source: "none" } };
    }
    try {
      const cache = loadLibraryIndexCache() || { entries: {} };
      const entries = (cache && typeof cache === "object" && cache.entries && typeof cache.entries === "object")
        ? cache.entries
        : {};
      const version = buildInventoryVersion(entries);
      const nowMs = Date.now();
      if (inventoryCache.version === version && (nowMs - inventoryCache.builtAtMs) < INVENTORY_CACHE_TTL_MS) {
        return {
          ok: true,
          tags: inventoryCache.tags,
          stats: {
            source: "cache",
            entryCount: inventoryCache.entryCount,
            scannedTagValues: inventoryCache.scannedTagValues,
            entriesWithAnyTagArray: inventoryCache.entriesWithAnyTagArray,
            entriesMissingAllTagArrays: inventoryCache.entriesMissingAllTagArrays,
            entriesWithAtLeastOneTagValue: inventoryCache.entriesWithAtLeastOneTagValue,
            computedAt: new Date(inventoryCache.builtAtMs).toISOString(),
          },
        };
      }

      const typedTagMap = new Map();
      let scannedTagValues = 0;
      let entriesWithAnyTagArray = 0;
      let entriesMissingAllTagArrays = 0;
      let entriesWithAtLeastOneTagValue = 0;
      for (const entry of Object.values(entries)) {
        if (!entry || typeof entry !== "object") continue;
        let hasAnyTagArray = false;
        let entryScannedTagValues = 0;
        for (const field of INVENTORY_TAXONOMIES) {
          const list = Array.isArray(entry[field]) ? entry[field] : null;
          if (!list) continue;
          hasAnyTagArray = true;
          for (const rawTag of list) {
            scannedTagValues += 1;
            entryScannedTagValues += 1;
            const typedEntry = buildTypedInventoryEntry(field, rawTag);
            if (typedEntry) typedTagMap.set(typedEntry.typedKey, typedEntry);
          }
        }
        if (hasAnyTagArray) entriesWithAnyTagArray += 1;
        else entriesMissingAllTagArrays += 1;
        if (entryScannedTagValues > 0) entriesWithAtLeastOneTagValue += 1;
      }
      const tags = [...typedTagMap.values()].sort((a, b) => {
        const labelOrder = a.label.localeCompare(b.label, "en", { sensitivity: "base" });
        if (labelOrder !== 0) return labelOrder;
        return a.typedKey.localeCompare(b.typedKey, "en", { sensitivity: "base" });
      });
      inventoryCache.version = version;
      inventoryCache.builtAtMs = nowMs;
      inventoryCache.tags = tags;
      inventoryCache.entryCount = Object.keys(entries).length;
      inventoryCache.scannedTagValues = scannedTagValues;
      inventoryCache.entriesWithAnyTagArray = entriesWithAnyTagArray;
      inventoryCache.entriesMissingAllTagArrays = entriesMissingAllTagArrays;
      inventoryCache.entriesWithAtLeastOneTagValue = entriesWithAtLeastOneTagValue;
      if (isTagManagerConsoleLoggingEnabled() && inventoryCache.entryCount > 0 && scannedTagValues === 0) {
        console.warn(
          "[tag-manager][inventory] zero tag values scanned despite indexed entries",
          `entryCount=${inventoryCache.entryCount}`,
          `entriesWithAnyTagArray=${entriesWithAnyTagArray}`,
          `entriesMissingAllTagArrays=${entriesMissingAllTagArrays}`,
          `entriesWithAtLeastOneTagValue=${entriesWithAtLeastOneTagValue}`,
        );
      }
      return {
        ok: true,
        tags,
        stats: {
          source: "index",
          entryCount: inventoryCache.entryCount,
          scannedTagValues,
          entriesWithAnyTagArray,
          entriesMissingAllTagArrays,
          entriesWithAtLeastOneTagValue,
          computedAt: new Date(nowMs).toISOString(),
        },
      };
    } catch {
      return {
        ok: false,
        errorCode: "STORE_UNAVAILABLE",
        message: "Tag inventory is unavailable.",
      };
    }
  }

  const tagManagerService = createTagManagerService({ tagManagerStore, listInventoryRawTags });

  function registerHandler(channel, allowedKeys, action, fallbackMessage, { requiresFeature = true } = {}) {
    const actionName = typeof action?.name === "string" && action.name ? action.name : "anonymous";
    ipcMain.handle(channel, async (event, payload = {}) => {
      const startedAt = process.hrtime.bigint();
      const rollout = getRollout();
      if (requiresFeature && !rollout.enabled) {
        const disabled = featureDisabledResponse();
        emitAudit("request-complete", {
          action: actionName,
          channel,
          errorCode: disabled.errorCode,
        });
        emitTelemetry("request", {
          channel,
          action: actionName,
          stage: rollout.rolloutStage,
          ok: false,
          errorCode: disabled.errorCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        });
        return disabled;
      }
      if (!validatePayload(payload, allowedKeys)) {
        emitAudit("validation-failed", { action: actionName, channel, errorCode: "VALIDATION_ERROR" });
        emitTelemetry("request", {
          channel,
          action: actionName,
          stage: rollout.rolloutStage,
          ok: false,
          errorCode: "VALIDATION_ERROR",
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        });
        return invalidRequest();
      }
      const response = asTagManagerResponse(action(payload), fallbackMessage);
      const errorCode = response?.ok ? null : String(response?.errorCode || "INTERNAL_ERROR");
      const snapshotTelemetry = channel === "tagManager:getSnapshot"
        ? buildSnapshotTelemetryDetails(payload, response)
        : null;
      emitAudit("request-complete", {
        action: actionName,
        channel,
        errorCode,
      });
      if (rollout.telemetryEnabled) {
        const rawTagsCount = Array.isArray(payload?.rawTags) ? payload.rawTags.length : 0;
        const memberRawTagsCount = Array.isArray(payload?.memberRawTags) ? payload.memberRawTags.length : 0;
        emitTelemetry("request", {
          channel,
          action: actionName,
          stage: rollout.rolloutStage,
          ok: Boolean(response?.ok),
          errorCode,
          rawTagsCount,
          memberRawTagsCount,
          ...(snapshotTelemetry || {}),
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        });
      }
      return response;
    });
  }

  registerHandler("tagManager:getSnapshot", ["includeStats", "includeInventory"], tagManagerService.getSnapshot, "Failed to read tag manager snapshot.");
  registerHandler("tagManager:setVisibility", ["taxonomy", "rawTag", "visibleInFilter"], tagManagerService.setVisibility, "Failed to update visibility.");
  registerHandler("tagManager:bulkSetVisibility", ["taxonomy", "rawTags", "visibleInFilter"], tagManagerService.bulkSetVisibility, "Failed to update visibility.");
  registerHandler("tagManager:resetVisibility", ["scope", "typedKeys"], tagManagerService.resetVisibility, "Failed to reset visibility.");
  registerHandler("tagManager:createAliasGroup", ["aliasName", "taxonomy", "memberRawTags"], tagManagerService.createAliasGroup, "Failed to create alias group.");
  registerHandler("tagManager:updateAliasGroup", ["aliasId", "aliasName", "memberRawTags", "expectedUpdatedAt"], tagManagerService.updateAliasGroup, "Failed to update alias group.");
  registerHandler("tagManager:deleteAliasGroup", ["aliasId", "expectedUpdatedAt"], tagManagerService.deleteAliasGroup, "Failed to delete alias group.");
  registerHandler("tagManager:resolveForFilter", ["rawTagsByTaxonomy", "query"], tagManagerService.resolveForFilter, "Failed to resolve tags for filter.");
  registerHandler("tagManager:resolveForMetadata", ["taxonomy", "rawTags"], tagManagerService.resolveForMetadata, "Failed to resolve tags for metadata.");
  registerHandler("tagManager:recoverStore", ["strategy"], tagManagerService.recoverStore, "Failed to recover tag manager store.");
}

module.exports = {
  registerTagManagerIpcHandlers,
};
