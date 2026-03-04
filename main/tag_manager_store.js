const crypto = require("crypto");
const path = require("path");

const TAG_MANAGER_SCHEMA_VERSION = 2;
const TAG_MANAGER_ENVELOPE_VERSION = 1;
const TAG_MANAGER_ENCRYPTION_ALG = "aes-256-gcm";
const TAG_MANAGER_AAD = "nviewer:tag-manager:v1";
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_MANAGED_TAGS = 50000;
const MAX_ALIAS_GROUPS = 2000;
const MAX_MEMBERS_PER_GROUP = 500;
const MAX_RAW_TAG_KEY_LENGTH = 120;
const MAX_ALIAS_NAME_LENGTH = 80;
const TAG_TAXONOMY = Object.freeze({
  TAGS: "tags",
  PARODIES: "parodies",
  CHARACTERS: "characters",
});
const TAG_TAXONOMY_ALLOWLIST = new Set(Object.values(TAG_TAXONOMY));

function isValidTaxonomy(value) {
  return TAG_TAXONOMY_ALLOWLIST.has(String(value || ""));
}

function buildTypedVisibilityKey(taxonomy, rawTagKey) {
  if (!isValidTaxonomy(taxonomy)) return null;
  const normalizedRawTagKey = String(rawTagKey || "").trim();
  if (!normalizedRawTagKey || normalizedRawTagKey.length > MAX_RAW_TAG_KEY_LENGTH) return null;
  return `${taxonomy}:${normalizedRawTagKey}`;
}

function parseTypedVisibilityKey(value) {
  const typedKey = String(value || "").trim();
  if (!typedKey || typedKey.length > (MAX_RAW_TAG_KEY_LENGTH + 32)) return null;
  const separatorIdx = typedKey.indexOf(":");
  if (separatorIdx < 1 || separatorIdx !== typedKey.lastIndexOf(":")) return null;
  const taxonomy = typedKey.slice(0, separatorIdx);
  const rawTagKey = typedKey.slice(separatorIdx + 1);
  const normalized = buildTypedVisibilityKey(taxonomy, rawTagKey);
  if (!normalized || normalized !== typedKey) return null;
  return { taxonomy, rawTagKey, typedKey };
}

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
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isValidIsoTimestamp(value) {
  if (!ISO_UTC_RE.test(String(value || ""))) return false;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed);
}

function cloneState(state) {
  const visibilityRules = {};
  for (const [typedKey, rule] of Object.entries(state.visibilityRules)) {
    visibilityRules[typedKey] = { visibleInFilter: Boolean(rule.visibleInFilter) };
  }
  return {
    schemaVersion: state.schemaVersion,
    updatedAt: state.updatedAt,
    visibilityRules,
    aliasGroups: state.aliasGroups.map((group) => ({
      aliasId: group.aliasId,
      aliasName: group.aliasName,
      taxonomy: group.taxonomy,
      memberRawTags: [...group.memberRawTags],
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    })),
  };
}

function migrateStateV1ToV2(state) {
  if (!isPlainObject(state)) return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  if (!hasOnlyAllowedKeys(state, ["schemaVersion", "updatedAt", "visibilityRules", "aliasGroups"])) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  if (Number(state.schemaVersion) !== 1) {
    return createError("STORE_UNAVAILABLE", "Tag manager store version is not supported.");
  }
  if (!isValidIsoTimestamp(state.updatedAt)) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  if (!isPlainObject(state.visibilityRules) || !Array.isArray(state.aliasGroups)) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }

  const visibilityRules = {};
  const visibilityKeys = Object.keys(state.visibilityRules);
  if (visibilityKeys.length > MAX_MANAGED_TAGS) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  for (const rawTagKey of visibilityKeys) {
    const normalizedKey = String(rawTagKey || "").trim();
    const typedKey = buildTypedVisibilityKey(TAG_TAXONOMY.TAGS, normalizedKey);
    if (!typedKey) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    const rule = state.visibilityRules[rawTagKey];
    if (!isPlainObject(rule) || !hasOnlyAllowedKeys(rule, ["visibleInFilter"]) || typeof rule.visibleInFilter !== "boolean") {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    visibilityRules[typedKey] = { visibleInFilter: rule.visibleInFilter };
  }

  if (state.aliasGroups.length > MAX_ALIAS_GROUPS) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  const migratedAliasGroups = [];
  for (const group of state.aliasGroups) {
    if (!isPlainObject(group)) return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    if (!hasOnlyAllowedKeys(group, ["aliasId", "aliasName", "memberRawTags", "createdAt", "updatedAt"])) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    migratedAliasGroups.push({
      aliasId: group.aliasId,
      aliasName: group.aliasName,
      taxonomy: TAG_TAXONOMY.TAGS,
      memberRawTags: Array.isArray(group.memberRawTags) ? [...group.memberRawTags] : group.memberRawTags,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  }

  return {
    ok: true,
    state: {
      schemaVersion: TAG_MANAGER_SCHEMA_VERSION,
      updatedAt: String(state.updatedAt),
      visibilityRules,
      aliasGroups: migratedAliasGroups,
    },
    migrated: true,
  };
}

function validateState(state) {
  if (!isPlainObject(state)) return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  if (!hasOnlyAllowedKeys(state, ["schemaVersion", "updatedAt", "visibilityRules", "aliasGroups"])) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  if (Number(state.schemaVersion) !== TAG_MANAGER_SCHEMA_VERSION) {
    return createError("STORE_UNAVAILABLE", "Tag manager store version is not supported.");
  }
  if (!isValidIsoTimestamp(state.updatedAt)) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  if (!isPlainObject(state.visibilityRules)) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }
  if (!Array.isArray(state.aliasGroups)) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }

  const visibilityRules = {};
  const visibilityKeys = Object.keys(state.visibilityRules);
  if (visibilityKeys.length > MAX_MANAGED_TAGS) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }

  for (const typedKey of visibilityKeys) {
    if (!parseTypedVisibilityKey(typedKey)) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    const rule = state.visibilityRules[typedKey];
    if (!isPlainObject(rule) || !hasOnlyAllowedKeys(rule, ["visibleInFilter"])) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    if (typeof rule.visibleInFilter !== "boolean") {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    visibilityRules[typedKey] = { visibleInFilter: rule.visibleInFilter };
  }

  if (state.aliasGroups.length > MAX_ALIAS_GROUPS) {
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }

  const aliasNameCaseFoldSet = new Set();
  const aliasIdSet = new Set();
  const memberTagToAlias = new Set();
  const aliasGroups = [];

  for (const group of state.aliasGroups) {
    if (!isPlainObject(group)) return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    if (!hasOnlyAllowedKeys(group, ["aliasId", "aliasName", "taxonomy", "memberRawTags", "createdAt", "updatedAt"])) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }

    const aliasId = String(group.aliasId || "").trim();
    if (!UUID_V4_RE.test(aliasId) || aliasIdSet.has(aliasId)) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    aliasIdSet.add(aliasId);

    const taxonomy = String(group.taxonomy || "").trim();
    if (!isValidTaxonomy(taxonomy)) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }

    const aliasName = String(group.aliasName || "").replace(/\s+/g, " ").trim();
    if (!aliasName || aliasName.length > MAX_ALIAS_NAME_LENGTH) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    const aliasNameFolded = aliasName.toLocaleLowerCase("en-US");
    const aliasNameScopedKey = `${taxonomy}:${aliasNameFolded}`;
    if (aliasNameCaseFoldSet.has(aliasNameScopedKey)) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    aliasNameCaseFoldSet.add(aliasNameScopedKey);

    if (!Array.isArray(group.memberRawTags) || group.memberRawTags.length > MAX_MEMBERS_PER_GROUP) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    if (!isValidIsoTimestamp(group.createdAt) || !isValidIsoTimestamp(group.updatedAt)) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
    if (Date.parse(group.updatedAt) < Date.parse(group.createdAt)) {
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }

    const memberSeen = new Set();
    const memberRawTags = [];
    for (const member of group.memberRawTags) {
      const rawTagKey = String(member || "").trim();
      if (!rawTagKey || rawTagKey.length > MAX_RAW_TAG_KEY_LENGTH) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }
      if (memberSeen.has(rawTagKey)) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }
      const memberScopedKey = `${taxonomy}:${rawTagKey}`;
      if (memberTagToAlias.has(memberScopedKey)) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }
      memberSeen.add(rawTagKey);
      memberTagToAlias.add(memberScopedKey);
      memberRawTags.push(rawTagKey);
    }

    aliasGroups.push({
      aliasId,
      aliasName,
      taxonomy,
      memberRawTags,
      createdAt: String(group.createdAt),
      updatedAt: String(group.updatedAt),
    });
  }

  return {
    ok: true,
    state: {
      schemaVersion: TAG_MANAGER_SCHEMA_VERSION,
      updatedAt: String(state.updatedAt),
      visibilityRules,
      aliasGroups,
    },
  };
}

function createDefaultState() {
  return {
    schemaVersion: TAG_MANAGER_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    visibilityRules: {},
    aliasGroups: [],
  };
}

function createTagManagerStore({ vaultManager, tagManagerFile, tagManagerRelPath, fs: fsModule, auditLogger }) {
  const fs = fsModule;
  const safeAuditLogger = typeof auditLogger === "function" ? auditLogger : null;

  function emitAudit(event, details = {}) {
    if (!safeAuditLogger) return;
    try {
      safeAuditLogger({
        component: "tag-manager-store",
        event,
        ...details,
      });
    } catch {
      // Never let audit logging interfere with store behavior.
    }
  }

  function vaultPrecheck() {
    const status = vaultManager.vaultStatus();
    if (!status?.enabled) {
      emitAudit("vault-required");
      return createError("VAULT_REQUIRED", "Vault Mode is required.");
    }
    if (!status?.unlocked) {
      emitAudit("vault-locked");
      return createError("VAULT_LOCKED", "Vault Mode is locked.");
    }
    return { ok: true };
  }

  function encryptState(state) {
    const stateCheck = validateState(state);
    if (!stateCheck.ok) return stateCheck;

    const plaintextBuffer = Buffer.from(JSON.stringify(stateCheck.state), "utf8");
    let keyBuffer = null;
    try {
      keyBuffer = vaultManager.deriveFileKey(tagManagerRelPath);
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(TAG_MANAGER_ENCRYPTION_ALG, keyBuffer, nonce);
      const aadBuffer = Buffer.from(TAG_MANAGER_AAD, "utf8");
      cipher.setAAD(aadBuffer);
      const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
      const tag = cipher.getAuthTag();

      return {
        ok: true,
        buffer: Buffer.from(JSON.stringify({
          envelopeVersion: TAG_MANAGER_ENVELOPE_VERSION,
          algorithm: TAG_MANAGER_ENCRYPTION_ALG,
          nonce: nonce.toString("base64"),
          authTag: tag.toString("base64"),
          aad: TAG_MANAGER_AAD,
          ciphertext: ciphertext.toString("base64"),
        }), "utf8"),
      };
    } catch {
      emitAudit("encrypt-failed");
      return createError("STORE_UNAVAILABLE", "Failed to persist tag manager store.");
    } finally {
      plaintextBuffer.fill(0);
      if (Buffer.isBuffer(keyBuffer)) keyBuffer.fill(0);
    }
  }

  function decryptState(buffer) {
    let keyBuffer = null;
    let plaintext = null;
    try {
      const envelope = JSON.parse(buffer.toString("utf8"));
      if (!isPlainObject(envelope) || !hasOnlyAllowedKeys(envelope, ["envelopeVersion", "algorithm", "nonce", "authTag", "aad", "ciphertext"])) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }
      if (Number(envelope.envelopeVersion) !== TAG_MANAGER_ENVELOPE_VERSION) {
        return createError("STORE_UNAVAILABLE", "Tag manager store version is not supported.");
      }
      if (String(envelope.algorithm || "") !== TAG_MANAGER_ENCRYPTION_ALG) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }
      if (String(envelope.aad || "") !== TAG_MANAGER_AAD) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }

      const nonce = Buffer.from(String(envelope.nonce || ""), "base64");
      const authTag = Buffer.from(String(envelope.authTag || ""), "base64");
      const ciphertext = Buffer.from(String(envelope.ciphertext || ""), "base64");

      if (nonce.length !== 12 || authTag.length !== 16 || ciphertext.length < 1) {
        return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
      }

      keyBuffer = vaultManager.deriveFileKey(tagManagerRelPath);
      const decipher = crypto.createDecipheriv(TAG_MANAGER_ENCRYPTION_ALG, keyBuffer, nonce);
      const aadBuffer = Buffer.from(TAG_MANAGER_AAD, "utf8");
      decipher.setAAD(aadBuffer);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      const parsed = JSON.parse(plaintext.toString("utf8"));
      if (Number(parsed?.schemaVersion) === 1) {
        const migrated = migrateStateV1ToV2(parsed);
        if (!migrated.ok) return migrated;
        const validatedMigrated = validateState(migrated.state);
        if (!validatedMigrated.ok) return validatedMigrated;
        return { ok: true, state: validatedMigrated.state, migrated: true };
      }

      const validated = validateState(parsed);
      if (!validated.ok) return validated;
      return { ok: true, state: validated.state };
    } catch {
      emitAudit("integrity-verification-failed");
      return createError("INTEGRITY_ERROR", "Tag manager integrity verification failed.");
    } finally {
      if (Buffer.isBuffer(plaintext)) plaintext.fill(0);
      if (Buffer.isBuffer(keyBuffer)) keyBuffer.fill(0);
    }
  }

  function atomicWriteBuffer(targetPath, encryptedBuffer) {
    const tmpPath = `${targetPath}.tmp`;
    const bakPath = `${targetPath}.bak`;
    const dirPath = path.dirname(targetPath);
    let fd = null;
    try {
      fd = fs.openSync(tmpPath, "w");
      let offset = 0;
      while (offset < encryptedBuffer.length) {
        offset += fs.writeSync(fd, encryptedBuffer, offset, encryptedBuffer.length - offset);
      }
      fs.fsyncSync(fd);
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // best effort
        }
      }
    }

    if (fs.existsSync(targetPath)) {
      try {
        fs.copyFileSync(targetPath, bakPath);
      } catch {
        // best effort backup
      }
    }
    fs.renameSync(tmpPath, targetPath);

    try {
      const dirFd = fs.openSync(dirPath, "r");
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Directory fsync may be unsupported on some hosts.
    }
  }

  function writeState(state) {
    const vaultCheck = vaultPrecheck();
    if (!vaultCheck.ok) return vaultCheck;

    const encrypted = encryptState(state);
    if (!encrypted.ok) return encrypted;

    try {
      atomicWriteBuffer(tagManagerFile(), encrypted.buffer);
      return { ok: true };
    } catch {
      emitAudit("write-failed");
      return createError("STORE_UNAVAILABLE", "Failed to persist tag manager store.");
    }
  }

  function tryReadFromPath(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const encrypted = fs.readFileSync(filePath);
      return decryptState(encrypted);
    } catch {
      emitAudit("read-failed");
      return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
    }
  }

  function readState() {
    const vaultCheck = vaultPrecheck();
    if (!vaultCheck.ok) return vaultCheck;

    const primaryPath = tagManagerFile();
    if (!fs.existsSync(primaryPath)) {
      return { ok: true, state: createDefaultState() };
    }

    const primary = tryReadFromPath(primaryPath);
    if (primary && primary.ok) {
      if (primary.migrated) {
        const rewritten = writeState(primary.state);
        if (!rewritten.ok) return rewritten;
      }
      return { ok: true, state: cloneState(primary.state), ...(primary.migrated ? { migrated: true } : {}) };
    }

    const backup = tryReadFromPath(`${primaryPath}.bak`);
    if (backup && backup.ok) {
      const repaired = writeState(backup.state);
      if (!repaired.ok) return repaired;
      emitAudit("recovered-from-backup");
      return { ok: true, state: cloneState(backup.state), recoveredFromBackup: true };
    }

    if (primary && primary.errorCode === "INTEGRITY_ERROR") return primary;
    return createError("STORE_UNAVAILABLE", "Tag manager store is unavailable.");
  }


  function recoverFromBackup() {
    const vaultCheck = vaultPrecheck();
    if (!vaultCheck.ok) return vaultCheck;

    const primaryPath = tagManagerFile();
    const backup = tryReadFromPath(`${primaryPath}.bak`);
    if (!backup) {
      return createError("NOT_FOUND", "No tag manager backup is available.");
    }
    if (!backup.ok) return backup;

    const restored = writeState(backup.state);
    if (!restored.ok) return restored;
    emitAudit("recovered-from-backup-manual");
    return { ok: true, state: cloneState(backup.state), recoveredFromBackup: true };
  }

  function resetState() {
    const vaultCheck = vaultPrecheck();
    if (!vaultCheck.ok) return vaultCheck;

    const defaultState = createDefaultState();
    const written = writeState(defaultState);
    if (!written.ok) return written;
    emitAudit("store-reset");
    return { ok: true, state: cloneState(defaultState), reset: true };
  }

  function replaceState(nextState) {
    const validated = validateState(nextState);
    if (!validated.ok) return validated;
    return writeState(validated.state);
  }

  return {
    constants: {
      TAG_MANAGER_SCHEMA_VERSION,
      TAG_MANAGER_ENVELOPE_VERSION,
      TAG_MANAGER_ENCRYPTION_ALG,
      MAX_MANAGED_TAGS,
      MAX_ALIAS_GROUPS,
      MAX_MEMBERS_PER_GROUP,
      MAX_RAW_TAG_KEY_LENGTH,
      MAX_ALIAS_NAME_LENGTH,
    },
    readState,
    replaceState,
    recoverFromBackup,
    resetState,
  };
}

module.exports = {
  createTagManagerStore,
  buildTypedVisibilityKey,
  parseTypedVisibilityKey,
  TAG_TAXONOMY,
  TAG_MANAGER_SCHEMA_VERSION,
  TAG_MANAGER_ENVELOPE_VERSION,
  TAG_MANAGER_ENCRYPTION_ALG,
  MAX_MANAGED_TAGS,
  MAX_ALIAS_GROUPS,
  MAX_MEMBERS_PER_GROUP,
  MAX_RAW_TAG_KEY_LENGTH,
  MAX_ALIAS_NAME_LENGTH,
};
