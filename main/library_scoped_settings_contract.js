const path = require("path");

const LIBRARY_SCOPED_SETTINGS_FILENAME = ".settings.json.enc";
const LIBRARY_SCOPED_GROUPS_FILENAME = ".groups.json.enc";

const LEGACY_GLOBAL_SETTINGS_FILENAME = "settings.json.enc";
const LEGACY_GLOBAL_GROUPS_FILENAME = "groups.json.enc";

const STORAGE_SCOPE_MARKER_KEY = "storageScope";
const STORAGE_SCOPE_VERSION = 2;

function resolveLibraryScopedEncryptedPaths(libraryRoot) {
  const normalizedLibraryRoot = String(libraryRoot || "").trim();
  return {
    libraryRoot: normalizedLibraryRoot,
    settingsFile: path.join(normalizedLibraryRoot, LIBRARY_SCOPED_SETTINGS_FILENAME),
    groupsFile: path.join(normalizedLibraryRoot, LIBRARY_SCOPED_GROUPS_FILENAME),
  };
}

function resolveLegacyGlobalEncryptedPaths(userDataPath) {
  const normalizedUserDataPath = String(userDataPath || "").trim();
  return {
    userDataPath: normalizedUserDataPath,
    settingsFile: path.join(normalizedUserDataPath, LEGACY_GLOBAL_SETTINGS_FILENAME),
    groupsFile: path.join(normalizedUserDataPath, LEGACY_GLOBAL_GROUPS_FILENAME),
  };
}

function resolvePathsForLibrary(libraryPath, userDataPath) {
  const library = resolveLibraryScopedEncryptedPaths(libraryPath);
  const legacy = resolveLegacyGlobalEncryptedPaths(userDataPath);
  return {
    libraryRoot: library.libraryRoot,
    settingsFile: library.settingsFile,
    groupsFile: library.groupsFile,
    legacySettingsFile: legacy.settingsFile,
    legacyGroupsFile: legacy.groupsFile,
  };
}

module.exports = {
  LIBRARY_SCOPED_SETTINGS_FILENAME,
  LIBRARY_SCOPED_GROUPS_FILENAME,
  LEGACY_GLOBAL_SETTINGS_FILENAME,
  LEGACY_GLOBAL_GROUPS_FILENAME,
  STORAGE_SCOPE_MARKER_KEY,
  STORAGE_SCOPE_VERSION,
  resolvePathsForLibrary,
  resolveLibraryScopedEncryptedPaths,
  resolveLegacyGlobalEncryptedPaths,
};
