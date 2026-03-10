const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureLibraryScopedEncryptedState,
} = require("../main/library_scoped_settings_migration");
const {
  STORAGE_SCOPE_MARKER_KEY,
  STORAGE_SCOPE_VERSION,
} = require("../main/library_scoped_settings_contract");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nview-lib-scope-mig-"));
}

function makeVault(unlocked = true) {
  return {
    vaultStatus: () => ({ enabled: true, unlocked }),
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };
}

test("migrates legacy encrypted settings/groups into library-scoped files with marker", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");

  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
    now: () => new Date("2026-02-03T04:05:06.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.migratedSettings, true);
  assert.equal(result.migratedGroups, true);

  const scopedSettings = JSON.parse(fs.readFileSync(scopedSettingsFile, "utf8"));
  assert.equal(scopedSettings.startPage, "https://legacy.example");
  assert.equal(scopedSettings[STORAGE_SCOPE_MARKER_KEY].version, STORAGE_SCOPE_VERSION);
  assert.equal(scopedSettings[STORAGE_SCOPE_MARKER_KEY].migratedFromGlobal, true);
  assert.equal(scopedSettings[STORAGE_SCOPE_MARKER_KEY].migratedAt, "2026-02-03T04:05:06.000Z");

  const scopedGroups = JSON.parse(fs.readFileSync(scopedGroupsFile, "utf8"));
  assert.deepEqual(scopedGroups, { version: 1, groups: [] });
});

test("prefers existing valid local library-scoped files over legacy global", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");

  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  fs.writeFileSync(scopedSettingsFile, JSON.stringify({ startPage: "https://local.example" }));
  fs.writeFileSync(scopedGroupsFile, JSON.stringify({ version: 1, groups: [{ groupId: "grp_x", name: "x", description: "", mangaIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] }));

  const before = fs.readFileSync(scopedSettingsFile, "utf8");
  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "local_already_valid");
  assert.equal(result.localPreferredOverGlobal, true);
  assert.equal(fs.readFileSync(scopedSettingsFile, "utf8"), before);
});

test("skips migration when vault is locked", () => {
  const root = makeTempDir();
  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(false),
    paths: {
      settingsFile: path.join(root, ".settings.json.enc"),
      groupsFile: path.join(root, ".groups.json.enc"),
      legacySettingsFile: path.join(root, "settings.json.enc"),
      legacyGroupsFile: path.join(root, "groups.json.enc"),
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "vault_locked_or_uninitialized");
});

test("returns safe failure when legacy settings are corrupted and local settings missing", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");

  fs.writeFileSync(legacySettingsFile, "not-json");
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Unable to import legacy settings for this library.");
  assert.equal(result.diagnostics.scope, "legacy_settings");
  assert.equal(fs.existsSync(scopedSettingsFile), false);
});

test("skips migration when another migration lock already exists", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const lockPath = path.join(library, ".library_scope_migration.lock");
  fs.writeFileSync(lockPath, "busy");

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: path.join(library, ".settings.json.enc"),
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile: path.join(userData, "settings.json.enc"),
      legacyGroupsFile: path.join(userData, "groups.json.enc"),
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "migration_in_progress");
});

test("cleans stale migration temp files on startup", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const tempSettingsFile = `${scopedSettingsFile}.tmp-migrate-stale`;
  fs.writeFileSync(tempSettingsFile, "stale");
  fs.writeFileSync(path.join(userData, "settings.json.enc"), JSON.stringify({ foo: "bar" }));
  fs.writeFileSync(path.join(userData, "groups.json.enc"), JSON.stringify({ version: 1, groups: [] }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile: path.join(userData, "settings.json.enc"),
      legacyGroupsFile: path.join(userData, "groups.json.enc"),
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(tempSettingsFile), false);
});


test("retries transient write failures with bounded attempts", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");

  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  const fsProxy = Object.create(fs);
  let failedOnce = false;
  fsProxy.openSync = (targetPath, mode) => {
    if (!failedOnce && String(targetPath).includes(".settings.json.enc.tmp-migrate-")) {
      failedOnce = true;
      const err = new Error("busy");
      err.code = "EBUSY";
      throw err;
    }
    return fs.openSync(targetPath, mode);
  };

  const result = ensureLibraryScopedEncryptedState({
    fs: fsProxy,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(result.migratedSettings, true);
  assert.equal(fs.existsSync(scopedSettingsFile), true);
});

test("returns permanent failure diagnostics when writes cannot be persisted", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");

  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  const fsProxy = Object.create(fs);
  fsProxy.openSync = (targetPath, mode) => {
    if (String(targetPath).includes(".settings.json.enc.tmp-migrate-")) {
      const err = new Error("read only");
      err.code = "EACCES";
      throw err;
    }
    return fs.openSync(targetPath, mode);
  };

  const result = ensureLibraryScopedEncryptedState({
    fs: fsProxy,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Failed to persist library-scoped settings.");
  assert.equal(result.diagnostics.scope, "settings_write");
  assert.equal(result.diagnostics.failureType, "permanent");
  assert.equal(fs.existsSync(scopedSettingsFile), false);
});

test("migration decision matrix favors local validity and safely skips when no legacy payloads exist", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");
  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");

  const runCase = (name, setup, expected) => {
    for (const filePath of [scopedSettingsFile, scopedGroupsFile, legacySettingsFile, legacyGroupsFile]) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
    setup();
    const result = ensureLibraryScopedEncryptedState({
      fs,
      vaultManager: makeVault(true),
      paths: {
        settingsFile: scopedSettingsFile,
        groupsFile: scopedGroupsFile,
        legacySettingsFile,
        legacyGroupsFile,
      },
      settingsRelPath: "settings.json",
      groupsRelPath: "app:groups",
    });
    assert.equal(result.ok, expected.ok, `${name}: ok`);
    if (expected.reason) {
      assert.equal(result.reason, expected.reason, `${name}: reason`);
    }
    if (Object.prototype.hasOwnProperty.call(expected, "migrated")) {
      assert.equal(result.migrated, expected.migrated, `${name}: migrated`);
    }
  };

  runCase(
    "empty local and empty global",
    () => {},
    { ok: true, migrated: false },
  );

  runCase(
    "valid local settings/groups with no global",
    () => {
      fs.writeFileSync(scopedSettingsFile, JSON.stringify({ startPage: "https://local.example" }));
      fs.writeFileSync(scopedGroupsFile, JSON.stringify({ version: 1, groups: [] }));
    },
    { ok: true, reason: "local_already_valid" },
  );

  runCase(
    "missing local with valid global",
    () => {
      fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
      fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));
    },
    { ok: true, migrated: true },
  );
});

test("interrupted migration can recover on next startup", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");
  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  const failingFs = Object.create(fs);
  failingFs.openSync = (targetPath, mode) => {
    if (String(targetPath).includes(".settings.json.enc.tmp-migrate-")) {
      const err = new Error("simulated interruption");
      err.code = "EACCES";
      throw err;
    }
    return fs.openSync(targetPath, mode);
  };

  const firstAttempt = ensureLibraryScopedEncryptedState({
    fs: failingFs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(firstAttempt.ok, false);
  assert.equal(firstAttempt.error, "Failed to persist library-scoped settings.");
  assert.equal(fs.existsSync(scopedSettingsFile), false);

  const secondAttempt = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(secondAttempt.ok, true);
  assert.equal(secondAttempt.migrated, true);
  assert.equal(JSON.parse(fs.readFileSync(scopedSettingsFile, "utf8")).startPage, "https://legacy.example");
});

test("migration does not create plaintext settings/groups artifacts in userData or library paths", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  fs.writeFileSync(legacySettingsFile, JSON.stringify({ startPage: "https://legacy.example" }));
  fs.writeFileSync(legacyGroupsFile, JSON.stringify({ version: 1, groups: [] }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: path.join(library, ".settings.json.enc"),
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(userData, "settings.json")), false);
  assert.equal(fs.existsSync(path.join(userData, "groups.json")), false);
  assert.equal(fs.existsSync(path.join(library, "settings.json")), false);
  assert.equal(fs.existsSync(path.join(library, "groups.json")), false);
});

test("corruption handling diagnostics stay redacted and never include decrypted payload values", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const secretUrl = "https://sensitive.example/private";
  fs.writeFileSync(path.join(userData, "settings.json.enc"), `{ \"startPage\": \"${secretUrl}`);
  fs.writeFileSync(path.join(userData, "groups.json.enc"), JSON.stringify({ version: 1, groups: [] }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: makeVault(true),
    paths: {
      settingsFile: path.join(library, ".settings.json.enc"),
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile: path.join(userData, "settings.json.enc"),
      legacyGroupsFile: path.join(userData, "groups.json.enc"),
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.includes(secretUrl), false);
  assert.equal(JSON.stringify(result).includes(secretUrl), false);
});

test("migrates legacy settings encrypted with historical relPath alias", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");
  const scopedGroupsFile = path.join(library, ".groups.json.enc");

  const relPathAwareVault = {
    vaultStatus: () => ({ enabled: true, unlocked: true }),
    encryptBufferWithKey: ({ relPath, buffer }) => Buffer.from(`${String(relPath || "")}::${buffer.toString("utf8")}`, "utf8"),
    decryptBufferWithKey: ({ relPath, buffer }) => {
      const raw = buffer.toString("utf8");
      const prefix = `${String(relPath || "")}::`;
      if (!raw.startsWith(prefix)) {
        const err = new Error("Authentication failed");
        err.code = "EAUTH";
        throw err;
      }
      return Buffer.from(raw.slice(prefix.length), "utf8");
    },
  };

  fs.writeFileSync(legacySettingsFile, relPathAwareVault.encryptBufferWithKey({
    relPath: "settings.json.enc",
    buffer: Buffer.from(JSON.stringify({ startPage: "https://legacy-relpath.example" }), "utf8"),
  }));
  fs.writeFileSync(legacyGroupsFile, relPathAwareVault.encryptBufferWithKey({
    relPath: "app:groups",
    buffer: Buffer.from(JSON.stringify({ version: 1, groups: [] }), "utf8"),
  }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: relPathAwareVault,
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: scopedGroupsFile,
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(result.migratedSettings, true);

  const scopedSettings = JSON.parse(
    relPathAwareVault.decryptBufferWithKey({
      relPath: "settings.json",
      buffer: fs.readFileSync(scopedSettingsFile),
    }).toString("utf8"),
  );
  assert.equal(scopedSettings.startPage, "https://legacy-relpath.example");
});


test("legacy settings migration accepts app:settings relPath alias", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");
  const scopedSettingsFile = path.join(library, ".settings.json.enc");

  const relPathAwareVault = {
    vaultStatus: () => ({ enabled: true, unlocked: true }),
    encryptBufferWithKey: ({ relPath, buffer }) => Buffer.from(`${String(relPath || "")}::${buffer.toString("utf8")}`, "utf8"),
    decryptBufferWithKey: ({ relPath, buffer }) => {
      const raw = buffer.toString("utf8");
      const prefix = `${String(relPath || "")}::`;
      if (!raw.startsWith(prefix)) {
        throw new Error("Authentication failed");
      }
      return Buffer.from(raw.slice(prefix.length), "utf8");
    },
  };

  fs.writeFileSync(legacySettingsFile, relPathAwareVault.encryptBufferWithKey({
    relPath: "app:settings",
    buffer: Buffer.from(JSON.stringify({ startPage: "https://legacy-app-settings.example" }), "utf8"),
  }));
  fs.writeFileSync(legacyGroupsFile, relPathAwareVault.encryptBufferWithKey({
    relPath: "app:groups",
    buffer: Buffer.from(JSON.stringify({ version: 1, groups: [] }), "utf8"),
  }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: relPathAwareVault,
    paths: {
      settingsFile: scopedSettingsFile,
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  const migrated = JSON.parse(relPathAwareVault.decryptBufferWithKey({
    relPath: "settings.json",
    buffer: fs.readFileSync(scopedSettingsFile),
  }).toString("utf8"));
  assert.equal(migrated.startPage, "https://legacy-app-settings.example");
});

test("legacy settings migration continues to next relPath candidate after schema mismatch", () => {
  const root = makeTempDir();
  const userData = path.join(root, "userData");
  const library = path.join(root, "library");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(library, { recursive: true });

  const legacySettingsFile = path.join(userData, "settings.json.enc");
  const legacyGroupsFile = path.join(userData, "groups.json.enc");

  const relPathAwareVault = {
    vaultStatus: () => ({ enabled: true, unlocked: true }),
    encryptBufferWithKey: ({ relPath, buffer }) => Buffer.from(`${String(relPath || "")}::${buffer.toString("utf8")}`, "utf8"),
    decryptBufferWithKey: ({ relPath, buffer }) => {
      const raw = buffer.toString("utf8");
      if (String(relPath) === "settings.json" && raw.startsWith("settings.json.enc::")) {
        return Buffer.from(JSON.stringify(["invalid", "schema"]), "utf8");
      }
      const prefix = `${String(relPath || "")}::`;
      if (!raw.startsWith(prefix)) throw new Error("Authentication failed");
      return Buffer.from(raw.slice(prefix.length), "utf8");
    },
  };

  fs.writeFileSync(legacySettingsFile, relPathAwareVault.encryptBufferWithKey({
    relPath: "settings.json.enc",
    buffer: Buffer.from(JSON.stringify({ startPage: "https://schema-fallback.example" }), "utf8"),
  }));
  fs.writeFileSync(legacyGroupsFile, relPathAwareVault.encryptBufferWithKey({
    relPath: "app:groups",
    buffer: Buffer.from(JSON.stringify({ version: 1, groups: [] }), "utf8"),
  }));

  const result = ensureLibraryScopedEncryptedState({
    fs,
    vaultManager: relPathAwareVault,
    paths: {
      settingsFile: path.join(library, ".settings.json.enc"),
      groupsFile: path.join(library, ".groups.json.enc"),
      legacySettingsFile,
      legacyGroupsFile,
    },
    settingsRelPath: "settings.json",
    groupsRelPath: "app:groups",
  });

  assert.equal(result.ok, true);
  assert.equal(result.migratedSettings, true);
});
