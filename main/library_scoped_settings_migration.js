const path = require("path");

const {
  STORAGE_SCOPE_MARKER_KEY,
  STORAGE_SCOPE_VERSION,
} = require("./library_scoped_settings_contract");

const DEFAULT_WRITE_RETRY_ATTEMPTS = 3;
const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1000;
const TRANSIENT_ERROR_CODES = new Set(["EBUSY", "EAGAIN", "ENFILE", "EMFILE", "ENOTEMPTY", "EPERM"]);
const PERMANENT_ERROR_CODES = new Set(["EACCES", "EROFS", "ENOSPC", "EISDIR", "ENOTDIR", "EINVAL"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateSettingsPayload(payload) {
  return isPlainObject(payload);
}

function validateGroupsPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (!Array.isArray(payload.groups)) return false;
  if (Object.prototype.hasOwnProperty.call(payload, "version")) {
    return Number.isInteger(Number(payload.version));
  }
  return true;
}

function hasStorageScopeV2Marker(payload) {
  const marker = payload?.[STORAGE_SCOPE_MARKER_KEY];
  return isPlainObject(marker) && Number(marker.version) === STORAGE_SCOPE_VERSION;
}

function withStorageScopeMarker(payload, nowIso, migratedFromGlobal) {
  const next = isPlainObject(payload) ? { ...payload } : {};
  const existingMarker = isPlainObject(next[STORAGE_SCOPE_MARKER_KEY]) ? next[STORAGE_SCOPE_MARKER_KEY] : {};
  next[STORAGE_SCOPE_MARKER_KEY] = {
    ...existingMarker,
    version: STORAGE_SCOPE_VERSION,
    ...(migratedFromGlobal
      ? {
        migratedFromGlobal: true,
        migratedAt: String(nowIso || new Date().toISOString()),
      }
      : {}),
  };
  return next;
}

function buildRelPathCandidates(primaryRelPath, relPathCandidates = []) {
  return Array.from(new Set([
    ...((Array.isArray(relPathCandidates) ? relPathCandidates : []).map((value) => String(value || "").trim()).filter(Boolean)),
    String(primaryRelPath || "").trim(),
  ].filter(Boolean)));
}

function readEncryptedJsonIfValid({ fs, filePath, relPath, relPathCandidates, vaultManager, validate }) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, valid: false, payload: null };
  }
  const candidates = buildRelPathCandidates(relPath, relPathCandidates);
  if (!candidates.length) {
    return { exists: true, valid: false, payload: null, error: "relpath_unavailable" };
  }

  let sawSchemaInvalid = false;
  let sawDecryptOrParseFailure = false;

  try {
    const encrypted = fs.readFileSync(filePath);
    for (const relPathCandidate of candidates) {
      try {
        const decrypted = vaultManager.decryptBufferWithKey({ relPath: relPathCandidate, buffer: encrypted });
        const parsed = JSON.parse(decrypted.toString("utf8"));
        if (!validate(parsed)) {
          sawSchemaInvalid = true;
          continue;
        }
        return { exists: true, valid: true, payload: parsed, relPathUsed: relPathCandidate };
      } catch {
        sawDecryptOrParseFailure = true;
      }
    }

    if (sawSchemaInvalid) {
      return { exists: true, valid: false, payload: null, error: "schema_invalid" };
    }
    if (sawDecryptOrParseFailure) {
      return { exists: true, valid: false, payload: null, error: "decrypt_or_parse_failed" };
    }
    return { exists: true, valid: false, payload: null, error: "decrypt_or_parse_failed" };
  } catch {
    return { exists: true, valid: false, payload: null, error: "decrypt_or_parse_failed" };
  }
}

function classifyError(err) {
  const code = String(err?.code || "").toUpperCase();
  if (PERMANENT_ERROR_CODES.has(code)) return "permanent";
  if (TRANSIENT_ERROR_CODES.has(code)) return "transient";
  return "unknown";
}

function cleanupMigrationTempFiles({ fs, targetPath }) {
  if (!targetPath) return;
  const dirPath = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const prefix = `${base}.tmp-migrate-`;
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry?.isFile?.()) continue;
    if (!String(entry.name || "").startsWith(prefix)) continue;
    const tempPath = path.join(dirPath, entry.name);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort crash recovery cleanup only.
    }
  }
}

function withMigrationLock({ fs, lockFilePath, staleMs = DEFAULT_LOCK_STALE_MS }, action) {
  const nowMs = Date.now();
  try {
    const stat = fs.statSync(lockFilePath);
    if (nowMs - Number(stat.mtimeMs || 0) > staleMs) {
      fs.unlinkSync(lockFilePath);
    }
  } catch {
    // No existing lock or inaccessible metadata.
  }

  let lockFd = null;
  try {
    lockFd = fs.openSync(lockFilePath, "wx");
  } catch (err) {
    if (String(err?.code || "").toUpperCase() === "EEXIST") {
      return { ok: true, skipped: true, reason: "migration_in_progress" };
    }
    return { ok: false, error: "Unable to acquire library migration lock.", failureType: classifyError(err) };
  }

  try {
    return action();
  } finally {
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);
      } catch {
        // Best effort.
      }
    }
    try {
      fs.unlinkSync(lockFilePath);
    } catch {
      // Best effort unlock.
    }
  }
}

function writeEncryptedJsonAtomic({ fs, filePath, relPath, payload, vaultManager }) {
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, { recursive: true });

  const plainBuffer = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const encrypted = vaultManager.encryptBufferWithKey({ relPath, buffer: plainBuffer });
  const tempPath = `${filePath}.tmp-migrate-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let fd = null;
  try {
    fd = fs.openSync(tempPath, "w");
    let offset = 0;
    while (offset < encrypted.length) {
      offset += fs.writeSync(fd, encrypted, offset, encrypted.length - offset);
    }
    fs.fsyncSync(fd);
  } catch (err) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best effort cleanup.
    }
    throw err;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Best effort.
      }
    }
  }

  fs.renameSync(tempPath, filePath);

  try {
    const dirFd = fs.openSync(dirPath, "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // Directory fsync may be unsupported.
  }
}

function writeEncryptedJsonAtomicWithRetry({ fs, filePath, relPath, payload, vaultManager, maxAttempts = DEFAULT_WRITE_RETRY_ATTEMPTS }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= Math.max(1, Number(maxAttempts) || 1); attempt += 1) {
    try {
      writeEncryptedJsonAtomic({ fs, filePath, relPath, payload, vaultManager });
      return { ok: true, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const failureType = classifyError(err);
      if (failureType !== "transient" || attempt >= maxAttempts) {
        return { ok: false, attempts: attempt, failureType, error: err };
      }
    }
  }
  return { ok: false, attempts: maxAttempts, failureType: classifyError(lastErr), error: lastErr };
}

function ensureLibraryScopedEncryptedState({
  fs,
  vaultManager,
  paths,
  settingsRelPath,
  groupsRelPath,
  now = () => new Date(),
}) {
  const status = vaultManager?.vaultStatus?.();
  if (!status?.enabled || !status?.unlocked) {
    return { ok: true, skipped: true, reason: "vault_locked_or_uninitialized" };
  }

  const legacySettingsRelPathCandidates = buildRelPathCandidates(settingsRelPath, [
    path.basename(String(paths.legacySettingsFile || "")),
    path.basename(String(paths.settingsFile || "")),
    "settings.json",
    "settings.json.enc",
    ".settings.json.enc",
    "app:settings",
  ]);

  cleanupMigrationTempFiles({ fs, targetPath: paths.settingsFile });
  cleanupMigrationTempFiles({ fs, targetPath: paths.groupsFile });

  const lockPath = path.join(path.dirname(paths.settingsFile), ".library_scope_migration.lock");
  return withMigrationLock({ fs, lockFilePath: lockPath }, () => {
    const localSettings = readEncryptedJsonIfValid({
      fs,
      filePath: paths.settingsFile,
      relPath: settingsRelPath,
      vaultManager,
      validate: validateSettingsPayload,
    });
    const localGroups = readEncryptedJsonIfValid({
      fs,
      filePath: paths.groupsFile,
      relPath: groupsRelPath,
      vaultManager,
      validate: validateGroupsPayload,
    });
    const legacySettings = readEncryptedJsonIfValid({
      fs,
      filePath: paths.legacySettingsFile,
      relPath: settingsRelPath,
      relPathCandidates: legacySettingsRelPathCandidates,
      vaultManager,
      validate: validateSettingsPayload,
    });
    const legacyGroups = readEncryptedJsonIfValid({
      fs,
      filePath: paths.legacyGroupsFile,
      relPath: groupsRelPath,
      vaultManager,
      validate: validateGroupsPayload,
    });

    if (localSettings.valid && localGroups.valid) {
      return {
        ok: true,
        skipped: true,
        reason: "local_already_valid",
        localPreferredOverGlobal: legacySettings.valid || legacyGroups.valid,
        markerPresent: hasStorageScopeV2Marker(localSettings.payload),
      };
    }

    if (!localSettings.valid && legacySettings.exists && !legacySettings.valid) {
      return {
        ok: false,
        error: "Unable to import legacy settings for this library.",
        diagnostics: { scope: "legacy_settings", reason: legacySettings.error || "invalid_payload" },
      };
    }
    if (!localGroups.valid && legacyGroups.exists && !legacyGroups.valid) {
      return {
        ok: false,
        error: "Unable to import legacy groups for this library.",
        diagnostics: { scope: "legacy_groups", reason: legacyGroups.error || "invalid_payload" },
      };
    }

    let didMigrateSettings = false;
    let didMigrateGroups = false;
    const nowIso = now().toISOString();

    try {
      if (!localSettings.valid && legacySettings.valid) {
        const markedSettings = withStorageScopeMarker(legacySettings.payload, nowIso, true);
        const writeResult = writeEncryptedJsonAtomicWithRetry({
          fs,
          filePath: paths.settingsFile,
          relPath: settingsRelPath,
          payload: markedSettings,
          vaultManager,
        });
        if (!writeResult.ok) {
          return {
            ok: false,
            error: "Failed to persist library-scoped settings.",
            diagnostics: {
              scope: "settings_write",
              attempts: writeResult.attempts,
              failureType: writeResult.failureType,
            },
          };
        }
        const verified = readEncryptedJsonIfValid({
          fs,
          filePath: paths.settingsFile,
          relPath: settingsRelPath,
          vaultManager,
          validate: validateSettingsPayload,
        });
        if (!verified.valid || !hasStorageScopeV2Marker(verified.payload)) {
          return { ok: false, error: "Library-scoped settings verification failed after migration." };
        }
        didMigrateSettings = true;
      }

      if (!localGroups.valid && legacyGroups.valid) {
        const writeResult = writeEncryptedJsonAtomicWithRetry({
          fs,
          filePath: paths.groupsFile,
          relPath: groupsRelPath,
          payload: legacyGroups.payload,
          vaultManager,
        });
        if (!writeResult.ok) {
          return {
            ok: false,
            error: "Failed to persist library-scoped groups.",
            diagnostics: {
              scope: "groups_write",
              attempts: writeResult.attempts,
              failureType: writeResult.failureType,
            },
          };
        }
        const verified = readEncryptedJsonIfValid({
          fs,
          filePath: paths.groupsFile,
          relPath: groupsRelPath,
          vaultManager,
          validate: validateGroupsPayload,
        });
        if (!verified.valid) {
          return { ok: false, error: "Library-scoped groups verification failed after migration." };
        }
        didMigrateGroups = true;
      }

      if ((didMigrateGroups || didMigrateSettings) && !didMigrateSettings) {
        const reloadedSettings = readEncryptedJsonIfValid({
          fs,
          filePath: paths.settingsFile,
          relPath: settingsRelPath,
          vaultManager,
          validate: validateSettingsPayload,
        });
        if (reloadedSettings.valid && !hasStorageScopeV2Marker(reloadedSettings.payload)) {
          const markerWriteResult = writeEncryptedJsonAtomicWithRetry({
            fs,
            filePath: paths.settingsFile,
            relPath: settingsRelPath,
            payload: withStorageScopeMarker(reloadedSettings.payload, nowIso, true),
            vaultManager,
          });
          if (!markerWriteResult.ok) {
            return {
              ok: false,
              error: "Failed to persist storage scope marker.",
              diagnostics: {
                scope: "settings_marker_write",
                attempts: markerWriteResult.attempts,
                failureType: markerWriteResult.failureType,
              },
            };
          }
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: `Library-scoped migration failed (${String(err?.name || "Error")}).`,
        failureType: classifyError(err),
      };
    }

    return {
      ok: true,
      migrated: didMigrateSettings || didMigrateGroups,
      migratedSettings: didMigrateSettings,
      migratedGroups: didMigrateGroups,
      localPreferredOverGlobal: localSettings.valid || localGroups.valid,
    };
  });
}

module.exports = {
  ensureLibraryScopedEncryptedState,
  validateSettingsPayload,
  validateGroupsPayload,
  hasStorageScopeV2Marker,
};
