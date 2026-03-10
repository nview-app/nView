const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  LIBRARY_SCOPED_SETTINGS_FILENAME,
  LIBRARY_SCOPED_GROUPS_FILENAME,
  LEGACY_GLOBAL_SETTINGS_FILENAME,
  LEGACY_GLOBAL_GROUPS_FILENAME,
  STORAGE_SCOPE_MARKER_KEY,
  STORAGE_SCOPE_VERSION,
  resolvePathsForLibrary,
  resolveLibraryScopedEncryptedPaths,
  resolveLegacyGlobalEncryptedPaths,
} = require("../main/library_scoped_settings_contract");

test("library-scoped encrypted filename contract is locked", () => {
  assert.equal(LIBRARY_SCOPED_SETTINGS_FILENAME, ".settings.json.enc");
  assert.equal(LIBRARY_SCOPED_GROUPS_FILENAME, ".groups.json.enc");
  assert.equal(STORAGE_SCOPE_MARKER_KEY, "storageScope");
  assert.equal(STORAGE_SCOPE_VERSION, 2);
});

test("legacy global encrypted filename contract is explicit", () => {
  assert.equal(LEGACY_GLOBAL_SETTINGS_FILENAME, "settings.json.enc");
  assert.equal(LEGACY_GLOBAL_GROUPS_FILENAME, "groups.json.enc");
});

test("resolveLibraryScopedEncryptedPaths resolves hidden files under selected library", () => {
  const root = path.join(path.sep, "tmp", "nview-lib");
  const resolved = resolveLibraryScopedEncryptedPaths(root);

  assert.equal(resolved.libraryRoot, root);
  assert.equal(resolved.settingsFile, path.join(root, ".settings.json.enc"));
  assert.equal(resolved.groupsFile, path.join(root, ".groups.json.enc"));
});

test("resolveLegacyGlobalEncryptedPaths resolves legacy files under userData", () => {
  const userData = path.join(path.sep, "tmp", "nview-user-data");
  const resolved = resolveLegacyGlobalEncryptedPaths(userData);

  assert.equal(resolved.userDataPath, userData);
  assert.equal(resolved.settingsFile, path.join(userData, "settings.json.enc"));
  assert.equal(resolved.groupsFile, path.join(userData, "groups.json.enc"));
});


test("resolvePathsForLibrary returns both scoped and legacy path contracts", () => {
  const root = path.join(path.sep, "tmp", "nview-lib");
  const userData = path.join(path.sep, "tmp", "nview-user-data");
  const resolved = resolvePathsForLibrary(root, userData);

  assert.equal(resolved.libraryRoot, root);
  assert.equal(resolved.settingsFile, path.join(root, ".settings.json.enc"));
  assert.equal(resolved.groupsFile, path.join(root, ".groups.json.enc"));
  assert.equal(resolved.legacySettingsFile, path.join(userData, "settings.json.enc"));
  assert.equal(resolved.legacyGroupsFile, path.join(userData, "groups.json.enc"));
});
