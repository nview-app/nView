const test = require('node:test');
const assert = require('node:assert/strict');

const { runStartupSequence } = require('../main/startup_sequence');

test('runStartupSequence reads bootstrap and applies theme before any later startup steps', () => {
  const calls = [];
  const settingsManager = {
    loadBootstrapSettings: () => {
      calls.push('loadBootstrapSettings');
      return { libraryPath: '/library/bootstrap', darkMode: true };
    },
    applyNativeTheme: (darkMode) => calls.push(`applyNativeTheme:${darkMode}`),
    rebindLibraryContext: () => {
      calls.push('rebindLibraryContext');
    },
    reloadSettings: () => {
      calls.push('reloadSettings');
      return { darkMode: true };
    },
  };

  const bootstrap = runStartupSequence({
    settingsManager,
    applyConfiguredLibraryRoot: (libraryPath) => calls.push(`applyConfiguredLibraryRoot:${libraryPath}`),
    resolvePathsForLibrary: () => ({ settingsFile: '/x/settings.json.enc', legacySettingsFile: '/x/settings.json' }),
    resolveLibraryScopedSettingsRollout: () => ({ legacyReadFallbackEnabled: false }),
    rebindSettingsLibraryContext: (ctx) => {
      calls.push(`rebindSettingsLibraryContext:${ctx.libraryRoot}`);
      settingsManager.rebindLibraryContext(ctx);
    },
    ensureActiveLibraryScopedEncryptedState: () => calls.push('ensureActiveLibraryScopedEncryptedState'),
    getLibraryRoot: () => '/library/bootstrap',
    userDataPath: '/userdata',
    settingsRelPath: 'settings.json.enc',
  });

  assert.deepEqual(bootstrap, { libraryPath: '/library/bootstrap', darkMode: true });
  assert.deepEqual(calls, [
    'loadBootstrapSettings',
    'applyNativeTheme:true',
    'applyConfiguredLibraryRoot:/library/bootstrap',
    'rebindSettingsLibraryContext:/library/bootstrap',
    'rebindLibraryContext',
    'ensureActiveLibraryScopedEncryptedState',
    'reloadSettings',
  ]);
});
