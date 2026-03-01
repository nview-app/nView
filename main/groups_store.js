const crypto = require("crypto");
const path = require("path");

const GROUPS_SCHEMA_VERSION = 1;
const MAX_GROUP_COUNT = 200;
const MAX_GROUP_NAME_CHARS = 80;
const MAX_GROUP_DESCRIPTION_CHARS = 500;
const MAX_GROUP_SIZE = 1000;
const MAX_READER_LAUNCH_SIZE = 300;

const GROUP_ID_RE = /^grp_[a-f0-9]{24,64}$/;
const MANGA_ID_RE = /^comic_[A-Za-z0-9._-]+$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function createError(errorCode, message, details) {
  return {
    ok: false,
    errorCode,
    message,
    ...(details && typeof details === "object" ? { details } : {}),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyAllowedKeys(value, allowedKeys) {
  const keySet = new Set(allowedKeys);
  return Object.keys(value).every((key) => keySet.has(key));
}

function normalizeUserText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupeMangaIds(rawIds) {
  const out = [];
  const seen = new Set();
  for (const value of rawIds) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function isValidIsoTimestamp(value) {
  if (!ISO_UTC_RE.test(String(value || ""))) return false;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed);
}

function validateEnvelopeShape(envelope) {
  if (!isPlainObject(envelope)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  if (!hasOnlyAllowedKeys(envelope, ["version", "groups"])) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  const version = Number(envelope.version);
  if (!Number.isInteger(version)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  if (version > GROUPS_SCHEMA_VERSION) {
    return createError("STORE_UNAVAILABLE", "Groups store version is not supported.");
  }
  if (!Array.isArray(envelope.groups)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  return { ok: true };
}

function validateLegacyEnvelopeShape(envelope) {
  if (!isPlainObject(envelope)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  if (!hasOnlyAllowedKeys(envelope, ["groups"])) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  if (!Array.isArray(envelope.groups)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  return { ok: true };
}

function validateGroupRecord(group) {
  if (!isPlainObject(group)) return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  if (!hasOnlyAllowedKeys(group, ["groupId", "name", "description", "mangaIds", "createdAt", "updatedAt"])) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  if (!GROUP_ID_RE.test(String(group.groupId || ""))) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  const normalizedName = normalizeUserText(group.name);
  if (!normalizedName || normalizedName.length > MAX_GROUP_NAME_CHARS) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  const normalizedDescription = normalizeUserText(group.description);
  if (normalizedDescription.length > MAX_GROUP_DESCRIPTION_CHARS) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  if (!Array.isArray(group.mangaIds)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  const deduped = dedupeMangaIds(group.mangaIds);
  if (deduped.length !== group.mangaIds.length || deduped.length > MAX_GROUP_SIZE) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }
  for (const mangaId of deduped) {
    if (!MANGA_ID_RE.test(mangaId)) {
      return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
    }
  }

  if (!isValidIsoTimestamp(group.createdAt) || !isValidIsoTimestamp(group.updatedAt)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  if (Date.parse(group.updatedAt) < Date.parse(group.createdAt)) {
    return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
  }

  return {
    ok: true,
    group: {
      groupId: String(group.groupId),
      name: normalizedName,
      description: normalizedDescription,
      mangaIds: deduped,
      createdAt: String(group.createdAt),
      updatedAt: String(group.updatedAt),
    },
  };
}

function validateCreatePayload(payload) {
  if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ["name", "description"])) {
    return createError("VALIDATION_ERROR", "Invalid create payload.");
  }
  const name = normalizeUserText(payload.name);
  if (!name) {
    return createError("VALIDATION_ERROR", "Group name is required.", { field: "name", reason: "required" });
  }
  if (name.length > MAX_GROUP_NAME_CHARS) {
    return createError("VALIDATION_ERROR", "Group name is too long.", { field: "name", reason: "too_long" });
  }
  const description = normalizeUserText(payload.description);
  if (description.length > MAX_GROUP_DESCRIPTION_CHARS) {
    return createError("VALIDATION_ERROR", "Group description is too long.", { field: "description", reason: "too_long" });
  }
  return { ok: true, name, description };
}

function validateGroupId(groupId) {
  if (!GROUP_ID_RE.test(String(groupId || ""))) {
    return createError("VALIDATION_ERROR", "Invalid group id.", { field: "groupId", reason: "invalid_format" });
  }
  return { ok: true, groupId: String(groupId) };
}

function validateExpectedUpdatedAt(value) {
  if (!isValidIsoTimestamp(value)) {
    return createError("VALIDATION_ERROR", "Invalid expectedUpdatedAt.", { field: "expectedUpdatedAt", reason: "invalid_format" });
  }
  return { ok: true, expectedUpdatedAt: String(value) };
}

function validateMembershipPayload(mangaIds) {
  if (!Array.isArray(mangaIds)) {
    return createError("VALIDATION_ERROR", "Invalid mangaIds payload.", { field: "mangaIds", reason: "invalid_type" });
  }
  const deduped = dedupeMangaIds(mangaIds);
  if (deduped.length > MAX_GROUP_SIZE) {
    return createError("VALIDATION_ERROR", "Group is too large.", { field: "mangaIds", reason: "too_many" });
  }
  for (const mangaId of deduped) {
    if (!MANGA_ID_RE.test(mangaId)) {
      return createError("VALIDATION_ERROR", "Invalid manga id.", { field: "mangaIds", reason: "invalid_item" });
    }
  }
  return { ok: true, mangaIds: deduped };
}

function createGroupsStore({ vaultManager, groupsFile, groupsRelPath, fs }) {
  function vaultPrecheck() {
    const status = vaultManager.vaultStatus();
    if (!status?.enabled) return createError("VAULT_REQUIRED", "Vault Mode is required.");
    if (!status?.unlocked) return createError("VAULT_LOCKED", "Vault Mode is locked.");
    return { ok: true };
  }

  function cloneGroup(group) {
    return {
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      mangaIds: [...group.mangaIds],
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  function getDefaultEnvelope() {
    return { version: GROUPS_SCHEMA_VERSION, groups: [] };
  }

  function readEnvelope() {
    const vaultCheck = vaultPrecheck();
    if (!vaultCheck.ok) return vaultCheck;

    const filePath = groupsFile();
    if (!fs.existsSync(filePath)) return { ok: true, envelope: getDefaultEnvelope() };

    try {
      const encrypted = fs.readFileSync(filePath);
      const decrypted = vaultManager.decryptBufferWithKey({ relPath: groupsRelPath, buffer: encrypted });
      const parsed = JSON.parse(decrypted.toString("utf8"));
      const migrated = runMigrations(parsed);
      if (!migrated.ok) return migrated;

      const shape = validateEnvelopeShape(migrated.envelope);
      if (!shape.ok) return shape;

      const groups = [];
      for (const item of migrated.envelope.groups) {
        const validated = validateGroupRecord(item);
        if (!validated.ok) return validated;
        groups.push(validated.group);
      }

      if (groups.length > MAX_GROUP_COUNT) {
        return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
      }

      const uniqueIds = new Set(groups.map((item) => item.groupId));
      if (uniqueIds.size !== groups.length) {
        return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
      }

      const envelope = {
        version: GROUPS_SCHEMA_VERSION,
        groups,
      };

      if (migrated.didMigrate) {
        const writeResult = writeEnvelope(envelope);
        if (!writeResult.ok) return writeResult;
      }

      return { ok: true, envelope };
    } catch {
      return createError("STORE_UNAVAILABLE", "Groups store is unavailable.");
    }
  }

  function runMigrations(envelope) {
    const migrationSteps = {
      0: migrateV0ToV1,
    };

    let currentEnvelope = envelope;
    let didMigrate = false;
    let currentVersion = Number(currentEnvelope && currentEnvelope.version);

    if (!Number.isInteger(currentVersion)) {
      const legacyShape = validateLegacyEnvelopeShape(currentEnvelope);
      if (!legacyShape.ok) return legacyShape;
      currentVersion = 0;
    }

    if (currentVersion > GROUPS_SCHEMA_VERSION) {
      return createError("STORE_UNAVAILABLE", "Groups store version is not supported.");
    }

    while (currentVersion < GROUPS_SCHEMA_VERSION) {
      const migrateStep = migrationSteps[currentVersion];
      if (typeof migrateStep !== "function") {
        return createError("STORE_UNAVAILABLE", "Groups store migration is not available.");
      }
      const migrated = migrateStep(currentEnvelope);
      if (!migrated.ok) return migrated;
      currentEnvelope = migrated.envelope;
      currentVersion = Number(currentEnvelope.version);
      didMigrate = true;
    }

    return { ok: true, envelope: currentEnvelope, didMigrate };
  }

  function migrateV0ToV1(legacyEnvelope) {
    const legacyShape = validateLegacyEnvelopeShape(legacyEnvelope);
    if (!legacyShape.ok) return legacyShape;
    return {
      ok: true,
      envelope: {
        version: 1,
        groups: legacyEnvelope.groups,
      },
    };
  }

  function writeEnvelope(envelope) {
    const vaultCheck = vaultPrecheck();
    if (!vaultCheck.ok) return vaultCheck;

    try {
      const payload = Buffer.from(JSON.stringify(envelope), "utf8");
      const encrypted = vaultManager.encryptBufferWithKey({ relPath: groupsRelPath, buffer: payload });
      const targetPath = groupsFile();
      const tempPath = `${targetPath}.tmp`;
      const dirPath = path.dirname(targetPath);
      let fd = null;

      try {
        fd = fs.openSync(tempPath, "w");
        let offset = 0;
        while (offset < encrypted.length) {
          offset += fs.writeSync(fd, encrypted, offset, encrypted.length - offset);
        }
        fs.fsyncSync(fd);
      } finally {
        if (fd !== null) {
          try {
            fs.closeSync(fd);
          } catch {
            // Best effort close; subsequent ops will fail if critical.
          }
        }
      }

      fs.renameSync(tempPath, targetPath);

      try {
        const dirFd = fs.openSync(dirPath, "r");
        try {
          fs.fsyncSync(dirFd);
        } finally {
          fs.closeSync(dirFd);
        }
      } catch {
        // Directory fsync may be unsupported; write is still durable on most targets.
      }

      return { ok: true };
    } catch {
      return createError("STORE_UNAVAILABLE", "Failed to persist groups store.");
    }
  }

  function withEnvelopeMutated(mutator) {
    const loaded = readEnvelope();
    if (!loaded.ok) return loaded;
    const envelope = {
      version: loaded.envelope.version,
      groups: loaded.envelope.groups.map(cloneGroup),
    };
    const result = mutator(envelope);
    if (!result.ok) return result;
    if (result.skipWrite === true) return result;
    const writeResult = writeEnvelope(envelope);
    if (!writeResult.ok) return writeResult;
    return result;
  }

  function listGroups() {
    const loaded = readEnvelope();
    if (!loaded.ok) return loaded;
    return {
      ok: true,
      groups: loaded.envelope.groups.map((group) => ({
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        count: group.mangaIds.length,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      })),
    };
  }

  function getGroup({ groupId }) {
    const idCheck = validateGroupId(groupId);
    if (!idCheck.ok) return idCheck;
    const loaded = readEnvelope();
    if (!loaded.ok) return loaded;
    const group = loaded.envelope.groups.find((item) => item.groupId === idCheck.groupId);
    if (!group) return createError("NOT_FOUND", "Group not found.");
    return { ok: true, group: cloneGroup(group) };
  }

  function createGroup(payload) {
    const validated = validateCreatePayload(payload);
    if (!validated.ok) return validated;

    return withEnvelopeMutated((envelope) => {
      if (envelope.groups.length >= MAX_GROUP_COUNT) {
        return createError("VALIDATION_ERROR", "Maximum group count reached.", { field: "groups", reason: "too_many" });
      }
      const now = new Date().toISOString();
      const group = {
        groupId: `grp_${crypto.randomBytes(16).toString("hex")}`,
        name: validated.name,
        description: validated.description,
        mangaIds: [],
        createdAt: now,
        updatedAt: now,
      };
      envelope.groups.push(group);
      return { ok: true, group: cloneGroup(group) };
    });
  }

  function updateGroupMeta(payload) {
    if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ["groupId", "name", "description", "expectedUpdatedAt"])) {
      return createError("VALIDATION_ERROR", "Invalid update payload.");
    }
    const idCheck = validateGroupId(payload.groupId);
    if (!idCheck.ok) return idCheck;
    const expectedCheck = validateExpectedUpdatedAt(payload.expectedUpdatedAt);
    if (!expectedCheck.ok) return expectedCheck;
    const metaCheck = validateCreatePayload({ name: payload.name, description: payload.description });
    if (!metaCheck.ok) return metaCheck;

    return withEnvelopeMutated((envelope) => {
      const idx = envelope.groups.findIndex((item) => item.groupId === idCheck.groupId);
      if (idx < 0) return createError("NOT_FOUND", "Group not found.");
      const current = envelope.groups[idx];
      if (current.updatedAt !== expectedCheck.expectedUpdatedAt) {
        return createError("CONFLICT", "Group has changed. Refresh and retry.");
      }
      const now = new Date().toISOString();
      const next = {
        ...current,
        name: metaCheck.name,
        description: metaCheck.description,
        updatedAt: now,
      };
      envelope.groups[idx] = next;
      return { ok: true, group: cloneGroup(next) };
    });
  }

  function updateGroupMembership(payload) {
    if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ["groupId", "mangaIds", "expectedUpdatedAt"])) {
      return createError("VALIDATION_ERROR", "Invalid membership payload.");
    }
    const idCheck = validateGroupId(payload.groupId);
    if (!idCheck.ok) return idCheck;
    const expectedCheck = validateExpectedUpdatedAt(payload.expectedUpdatedAt);
    if (!expectedCheck.ok) return expectedCheck;
    const membershipCheck = validateMembershipPayload(payload.mangaIds);
    if (!membershipCheck.ok) return membershipCheck;

    return withEnvelopeMutated((envelope) => {
      const idx = envelope.groups.findIndex((item) => item.groupId === idCheck.groupId);
      if (idx < 0) return createError("NOT_FOUND", "Group not found.");
      const current = envelope.groups[idx];
      if (current.updatedAt !== expectedCheck.expectedUpdatedAt) {
        return createError("CONFLICT", "Group has changed. Refresh and retry.");
      }
      const now = new Date().toISOString();
      const next = {
        ...current,
        mangaIds: membershipCheck.mangaIds,
        updatedAt: now,
      };
      envelope.groups[idx] = next;
      return { ok: true, group: cloneGroup(next) };
    });
  }

  function deleteGroup(payload) {
    if (!isPlainObject(payload) || !hasOnlyAllowedKeys(payload, ["groupId", "expectedUpdatedAt"])) {
      return createError("VALIDATION_ERROR", "Invalid delete payload.");
    }
    const idCheck = validateGroupId(payload.groupId);
    if (!idCheck.ok) return idCheck;
    const expectedCheck = validateExpectedUpdatedAt(payload.expectedUpdatedAt);
    if (!expectedCheck.ok) return expectedCheck;

    return withEnvelopeMutated((envelope) => {
      const idx = envelope.groups.findIndex((item) => item.groupId === idCheck.groupId);
      if (idx < 0) return createError("NOT_FOUND", "Group not found.");
      if (envelope.groups[idx].updatedAt !== expectedCheck.expectedUpdatedAt) {
        return createError("CONFLICT", "Group has changed. Refresh and retry.");
      }
      envelope.groups.splice(idx, 1);
      return { ok: true };
    });
  }

  function resolveForReader({ groupId, isKnownMangaId }) {
    const idCheck = validateGroupId(groupId);
    if (!idCheck.ok) return idCheck;
    if (typeof isKnownMangaId !== "function") {
      return createError("INTERNAL_ERROR", "Groups resolver is unavailable.");
    }

    return withEnvelopeMutated((envelope) => {
      const idx = envelope.groups.findIndex((item) => item.groupId === idCheck.groupId);
      if (idx < 0) return createError("NOT_FOUND", "Group not found.");
      const group = envelope.groups[idx];
      const validMangaIds = [];
      let missingCount = 0;
      for (const mangaId of group.mangaIds) {
        if (!isKnownMangaId(mangaId)) {
          missingCount += 1;
          continue;
        }
        validMangaIds.push(mangaId);
      }

      const resolvedMangaIds = [...validMangaIds];
      let truncated = false;
      if (resolvedMangaIds.length > MAX_READER_LAUNCH_SIZE) {
        resolvedMangaIds.length = MAX_READER_LAUNCH_SIZE;
        truncated = true;
      }

      if (missingCount > 0) {
        envelope.groups[idx] = {
          ...group,
          mangaIds: validMangaIds,
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        ok: true,
        groupId: group.groupId,
        resolvedMangaIds,
        missingCount,
        truncated,
      };
    });
  }

  function pruneStaleMemberships({ isKnownMangaId }) {
    if (typeof isKnownMangaId !== "function") {
      return createError("INTERNAL_ERROR", "Groups pruner is unavailable.");
    }

    return withEnvelopeMutated((envelope) => {
      let changedGroups = 0;
      let prunedIds = 0;
      const now = new Date().toISOString();

      for (let idx = 0; idx < envelope.groups.length; idx += 1) {
        const group = envelope.groups[idx];
        const retained = [];
        let removed = 0;
        for (const mangaId of group.mangaIds) {
          if (!isKnownMangaId(mangaId)) {
            removed += 1;
            continue;
          }
          retained.push(mangaId);
        }
        if (removed > 0) {
          envelope.groups[idx] = {
            ...group,
            mangaIds: retained,
            updatedAt: now,
          };
          changedGroups += 1;
          prunedIds += removed;
        }
      }

      if (changedGroups === 0) {
        return { ok: true, changedGroups: 0, prunedIds: 0, skippedWrite: true };
      }

      return { ok: true, changedGroups, prunedIds, skippedWrite: false };
    });
  }

  return {
    constants: {
      GROUPS_SCHEMA_VERSION,
      MAX_GROUP_COUNT,
      MAX_GROUP_NAME_CHARS,
      MAX_GROUP_DESCRIPTION_CHARS,
      MAX_GROUP_SIZE,
      MAX_READER_LAUNCH_SIZE,
    },
    listGroups,
    getGroup,
    createGroup,
    updateGroupMeta,
    updateGroupMembership,
    deleteGroup,
    resolveForReader,
    pruneStaleMemberships,
  };
}

module.exports = {
  createGroupsStore,
  GROUPS_SCHEMA_VERSION,
  MAX_GROUP_COUNT,
  MAX_GROUP_NAME_CHARS,
  MAX_GROUP_DESCRIPTION_CHARS,
  MAX_GROUP_SIZE,
  MAX_READER_LAUNCH_SIZE,
  GROUP_ID_RE,
  MANGA_ID_RE,
};
