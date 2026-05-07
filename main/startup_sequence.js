function runStartupSequence({
  settingsManager,
  applyConfiguredLibraryRoot,
  resolvePathsForLibrary,
  resolveLibraryScopedSettingsRollout,
  rebindSettingsLibraryContext,
  ensureActiveLibraryScopedEncryptedState,
  getLibraryRoot,
  userDataPath,
  settingsRelPath,
}) {
  // Startup ordering contract (Phase 2):
  // 1) Read bootstrap settings synchronously.
  // 2) Apply bootstrap theme before any BrowserWindow is created.
  // 3) Apply bootstrap library root and rebind encrypted settings scope.
  // 4) Reload full settings (which reapplies native theme) before app.whenReady window creation.
  const bootstrapSettings = settingsManager.loadBootstrapSettings();
  settingsManager.applyNativeTheme(bootstrapSettings.darkMode);
  applyConfiguredLibraryRoot(bootstrapSettings.libraryPath);

  const scopedPaths = resolvePathsForLibrary(getLibraryRoot(), userDataPath);
  const rollout = resolveLibraryScopedSettingsRollout(settingsManager);
  rebindSettingsLibraryContext({
    settingsFile: scopedPaths.settingsFile,
    settingsRelPath,
    legacySettingsFile: scopedPaths.legacySettingsFile,
    allowLegacyReadFallback: rollout.legacyReadFallbackEnabled,
    libraryRoot: getLibraryRoot(),
  });

  ensureActiveLibraryScopedEncryptedState();
  settingsManager.reloadSettings();
  return bootstrapSettings;
}

module.exports = {
  runStartupSequence,
};
