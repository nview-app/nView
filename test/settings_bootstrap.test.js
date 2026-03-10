const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron');
if (!electron.nativeTheme) {
  electron.nativeTheme = { themeSource: 'light' };
}

const { createSettingsManager } = require('../main/settings');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nview-settings-'));
}

function defaultSettings() {
  return {
    startPage: '',
    blockPopups: true,
    allowListEnabled: true,
    allowListDomainsSchemaVersion: 2,
    allowListDomainsBySourceAdapter: {},
    darkMode: false,
    defaultSort: 'favorites',
    cardSize: 'normal',
    libraryPath: '',
    groups: {
      railEnabled: true,
    },
    ui: {
      customDropdownsV1: true,
    },
    tagManager: {
      rolloutStage: 'stable',
      telemetryEnabled: true,
    },
    libraryScopedSettingsMigration: {
      rolloutStage: 'stable',
      releaseRing: 'stable',
      migrationEnabled: true,
      telemetryEnabled: true,
      legacyReadFallbackEnabled: false,
    },
  };
}

test('writes bootstrap basic_settings.json with libraryPath and darkMode only', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  manager.updateSettings({
    startPage: 'example.com',
    allowListDomainsBySourceAdapter: { nhentai: ['example.com'] },
    darkMode: true,
    libraryPath: path.join(root, 'LibraryMoved'),
  });

  const basic = JSON.parse(fs.readFileSync(basicSettingsFile, 'utf8'));
  assert.deepEqual(Object.keys(basic).sort(), ['darkMode', 'libraryPath']);
  assert.equal(basic.darkMode, true);
  assert.equal(basic.libraryPath, path.join(root, 'LibraryMoved'));
  assert.equal(fs.existsSync(settingsPlaintextFile), false);
});

test('loads libraryPath from basic_settings.json when vault is locked', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  fs.writeFileSync(basicSettingsFile, JSON.stringify({
    libraryPath: path.join(root, 'FromBasic'),
    darkMode: true,
  }), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => false,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const settings = manager.getSettings();
  assert.equal(settings.libraryPath, path.join(root, 'FromBasic'));
  assert.equal(settings.darkMode, true);
});

test('prefers bootstrap libraryPath and darkMode from basic_settings.json when vault is unlocked', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  fs.writeFileSync(settingsFile, JSON.stringify({
    startPage: 'encrypted.example',
    libraryPath: path.join(root, 'FromEncrypted'),
    darkMode: false,
  }), 'utf8');
  fs.writeFileSync(basicSettingsFile, JSON.stringify({
    libraryPath: path.join(root, 'FromBasic'),
    darkMode: true,
  }), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const settings = manager.getSettings();
  assert.equal(settings.startPage, 'https://encrypted.example');
  assert.equal(settings.libraryPath, path.join(root, 'FromBasic'));
  assert.equal(settings.darkMode, true);
});

test('migrates legacy settings.json to encrypted settings and deletes plaintext file', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  fs.writeFileSync(settingsPlaintextFile, JSON.stringify({
    startPage: 'legacy.example',
    libraryPath: path.join(root, 'LegacyLibrary'),
    darkMode: true,
  }), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const settings = manager.getSettings();

  assert.equal(settings.startPage, 'https://legacy.example');
  assert.equal(fs.existsSync(settingsFile), true);
  assert.equal(fs.existsSync(settingsPlaintextFile), false);
});

test('backfills basic_settings.json from encrypted settings when missing', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  fs.writeFileSync(settingsFile, JSON.stringify({
    startPage: 'encrypted.example',
    libraryPath: path.join(root, 'EncryptedLibrary'),
    darkMode: true,
  }), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const settings = manager.getSettings();
  assert.equal(settings.darkMode, true);
  assert.equal(settings.libraryPath, path.join(root, 'EncryptedLibrary'));

  const basic = JSON.parse(fs.readFileSync(basicSettingsFile, 'utf8'));
  assert.deepEqual(basic, {
    libraryPath: path.join(root, 'EncryptedLibrary'),
    darkMode: true,
  });
});

test('does not overwrite existing basic_settings.json from encrypted settings', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  fs.writeFileSync(settingsFile, JSON.stringify({
    libraryPath: path.join(root, 'EncryptedLibrary'),
    darkMode: false,
  }), 'utf8');
  fs.writeFileSync(basicSettingsFile, JSON.stringify({
    libraryPath: path.join(root, 'FromBasic'),
    darkMode: true,
  }), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const settings = manager.getSettings();
  assert.equal(settings.libraryPath, path.join(root, 'FromBasic'));
  assert.equal(settings.darkMode, true);

  const basic = JSON.parse(fs.readFileSync(basicSettingsFile, 'utf8'));
  assert.deepEqual(basic, {
    libraryPath: path.join(root, 'FromBasic'),
    darkMode: true,
  });
});




test('flushes deferred encrypted save from pending payload after rebind clears cache', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  let vaultUnlocked = false;
  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => vaultUnlocked,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const selectedLibraryPath = path.join(root, 'LibrarySelected');
  manager.updateSettings({
    startPage: 'deferred.example',
    darkMode: true,
    libraryPath: selectedLibraryPath,
  });

  manager.rebindLibraryContext({});
  vaultUnlocked = true;
  const reloaded = manager.reloadSettings();

  assert.equal(reloaded.darkMode, true);
  assert.equal(reloaded.libraryPath, selectedLibraryPath);

  const encrypted = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(encrypted.darkMode, true);
  assert.equal(encrypted.libraryPath, selectedLibraryPath);

  const basic = JSON.parse(fs.readFileSync(basicSettingsFile, 'utf8'));
  assert.equal(basic.darkMode, true);
  assert.equal(basic.libraryPath, selectedLibraryPath);
});

test('libraryPath update can persist basic settings without scheduling deferred encrypted overwrite when vault is locked', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const seededEncrypted = {
    startPage: 'https://kept.example',
    startPages: ['https://kept.example'],
    sourceAdapterUrls: { default: 'https://kept.example' },
    darkMode: true,
    libraryPath: path.join(root, 'OriginalLibrary'),
  };
  fs.writeFileSync(settingsFile, JSON.stringify(seededEncrypted), 'utf8');

  let vaultUnlocked = false;
  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => vaultUnlocked,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const selectedLibraryPath = path.join(root, 'SwitchedLibrary');
  manager.updateSettings({ libraryPath: selectedLibraryPath }, {
    suppressVaultLockedWarning: true,
    persistBasicOnlyWhenVaultLocked: true,
  });

  const encryptedAfterLockedUpdate = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(encryptedAfterLockedUpdate.startPage, seededEncrypted.startPage);
  assert.equal(encryptedAfterLockedUpdate.libraryPath, seededEncrypted.libraryPath);

  vaultUnlocked = true;
  const reloaded = manager.reloadSettings();
  const encryptedAfterUnlock = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

  assert.equal(encryptedAfterUnlock.startPage, seededEncrypted.startPage);
  assert.equal(encryptedAfterUnlock.libraryPath, seededEncrypted.libraryPath);
  assert.equal(reloaded.startPage, seededEncrypted.startPage);
  assert.equal(reloaded.libraryPath, selectedLibraryPath);
});


test('accepts artist-desc as a persisted default sort option', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({ defaultSort: 'artist-desc' });
  assert.equal(updated.defaultSort, 'artist-desc');

  const reloadedManager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });
  assert.equal(reloadedManager.getSettings().defaultSort, 'artist-desc');
});


test('accepts artist-asc as a persisted default sort option', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({ defaultSort: 'artist-asc' });
  assert.equal(updated.defaultSort, 'artist-asc');

  const reloadedManager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });
  assert.equal(reloadedManager.getSettings().defaultSort, 'artist-asc');
});

test('accepts published-desc as a persisted default sort option', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({ defaultSort: 'published-desc' });
  assert.equal(updated.defaultSort, 'published-desc');

  const reloadedManager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });
  assert.equal(reloadedManager.getSettings().defaultSort, 'published-desc');
});


test('does not regenerate legacy plaintext settings.json when vault is not initialized', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => false,
    isUnlocked: () => false,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  manager.updateSettings({
    startPage: 'no-plaintext.example',
    darkMode: true,
    libraryPath: path.join(root, 'OnlyBasic'),
  });

  assert.equal(fs.existsSync(settingsPlaintextFile), false);
  assert.equal(fs.existsSync(settingsFile), false);
  assert.equal(fs.existsSync(basicSettingsFile), true);
});


test('updateSettings tolerates encrypted write failures without throwing', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: () => {
      throw new Error('simulated encrypt failure');
    },
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const updated = manager.updateSettings({
      startPage: 'write-fail.example',
      darkMode: true,
    });

    assert.equal(updated.startPage, 'https://write-fail.example');
    assert.equal(updated.darkMode, true);
    assert.equal(fs.existsSync(settingsFile), false);
    assert.equal(fs.existsSync(basicSettingsFile), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(basicSettingsFile, 'utf8')), {
      libraryPath: '',
      darkMode: true,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[settings write failed\]/);
    assert.match(warnings[0], /simulated encrypt failure/);
  } finally {
    console.warn = previousWarn;
  }
});

test('allowListDomainsBySourceAdapter ignores unknown adapter ids', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({
    allowListDomainsBySourceAdapter: {
      nhentai: ['cdn.example.com'],
      rogue: ['bad.example.com'],
    },
  });

  assert.deepEqual(updated.allowListDomainsBySourceAdapter, {
    nhentai: ['cdn.example.com'],
  });
});

test('allowListDomainsBySourceAdapter preserves explicit empty adapter lists', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({
    allowListDomainsBySourceAdapter: {
      nhentai: [],
    },
  });

  assert.deepEqual(updated.allowListDomainsBySourceAdapter, {
    nhentai: [],
  });
});


test('resets legacy allow-list map to adapter defaults unless schema version is current', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  fs.writeFileSync(settingsFile, JSON.stringify({
    allowListDomainsBySourceAdapter: {
      nhentai: ['legacy.example.com'],
    },
  }), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const loaded = manager.getSettings();
  assert.equal(loaded.allowListDomainsSchemaVersion, 2);
  assert.deepEqual(loaded.allowListDomainsBySourceAdapter, {});

  const updated = manager.updateSettings({
    allowListDomainsBySourceAdapter: { nhentai: ['cdn.example.com'] },
  });
  assert.equal(updated.allowListDomainsSchemaVersion, 2);
  assert.deepEqual(updated.allowListDomainsBySourceAdapter, { nhentai: ['cdn.example.com'] });

  const persisted = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(persisted.allowListDomainsSchemaVersion, 2);
  assert.deepEqual(persisted.allowListDomainsBySourceAdapter, { nhentai: ['cdn.example.com'] });
});


test('normalizes groups rail feature flag to a strict boolean', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const next = manager.updateSettings({
    groups: { railEnabled: 0 },
  });

  assert.deepEqual(next.groups, { railEnabled: false });

  const persisted = manager.reloadSettings();
  assert.deepEqual(persisted.groups, { railEnabled: false });
});

test('normalizes tag manager rollout settings to bounded values', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({
    tagManager: {
      rolloutStage: 'INVALID_STAGE',
      telemetryEnabled: 0,
    },
  });

  assert.deepEqual(updated.tagManager, {
    rolloutStage: 'stable',
    telemetryEnabled: false,
  });

  const persisted = manager.reloadSettings();
  assert.deepEqual(persisted.tagManager, {
    rolloutStage: 'stable',
    telemetryEnabled: false,
  });
});

test('normalizes ui customDropdownsV1 rollout flag to a strict boolean', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({ ui: { customDropdownsV1: 0 } });
  assert.deepEqual(updated.ui, { customDropdownsV1: false });

  const persisted = manager.reloadSettings();
  assert.deepEqual(persisted.ui, { customDropdownsV1: false });
});

test('normalizes library scoped settings migration rollout controls', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const updated = manager.updateSettings({
    libraryScopedSettingsMigration: {
      rolloutStage: 'INVALID_STAGE',
      releaseRing: 'INVALID_RING',
      migrationEnabled: 0,
      telemetryEnabled: 1,
      legacyReadFallbackEnabled: 'yes',
    },
  });

  assert.deepEqual(updated.libraryScopedSettingsMigration, {
    rolloutStage: 'stable',
    releaseRing: 'stable',
    migrationEnabled: false,
    telemetryEnabled: true,
    legacyReadFallbackEnabled: true,
  });
});

test('bootstrap library context can be loaded before encrypted settings and rebound to active library path', () => {
  const root = makeTempDir();
  const basicSettingsFile = path.join(root, 'basic_settings.json');
  const libraryA = path.join(root, 'LibraryA');
  const libraryB = path.join(root, 'LibraryB');
  fs.mkdirSync(libraryA, { recursive: true });
  fs.mkdirSync(libraryB, { recursive: true });

  fs.writeFileSync(basicSettingsFile, JSON.stringify({
    libraryPath: libraryB,
    darkMode: true,
  }), 'utf8');

  const settingsA = path.join(libraryA, '.settings.json.enc');
  const settingsB = path.join(libraryB, '.settings.json.enc');
  fs.writeFileSync(settingsA, JSON.stringify({ startPage: 'a.example' }), 'utf8');
  fs.writeFileSync(settingsB, JSON.stringify({ startPage: 'b.example', libraryPath: libraryB, darkMode: true }), 'utf8');

  let activeLibraryRoot = libraryA;
  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile: () => path.join(activeLibraryRoot, '.settings.json.enc'),
    settingsPlaintextFile: path.join(root, 'settings.json'),
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const bootstrap = manager.loadBootstrapSettings();
  assert.equal(bootstrap.libraryPath, libraryB);
  assert.equal(bootstrap.darkMode, true);

  activeLibraryRoot = bootstrap.libraryPath;
  manager.rebindLibraryContext({ settingsFile: path.join(activeLibraryRoot, '.settings.json.enc') });
  const loaded = manager.reloadSettings();
  assert.equal(loaded.startPage, 'https://b.example');
});

test('library-scoped enforcement rejects writes when active library root is missing', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, '.settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const manager = createSettingsManager({
    settingsFile: () => ({ settingsFile, settingsRelPath: 'settings.json', libraryRoot: '' }),
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptBufferWithKey: ({ buffer }) => buffer,
    },
    requireLibraryScope: true,
  });

  manager.updateSettings({ startPage: 'example.test' });
  const writeError = manager.consumeLastWriteError();
  assert.equal(writeError.code, 'SETTINGS_WRITE_FAILED');
  assert.match(writeError.message, /Active library context is not available|outside the active library root/);
});

test('library-scoped enforcement rejects writes outside active library root', () => {
  const root = makeTempDir();
  const libraryRoot = path.join(root, 'library');
  fs.mkdirSync(libraryRoot, { recursive: true });
  const outsideSettings = path.join(root, '.settings.json.enc');

  const manager = createSettingsManager({
    settingsFile: () => ({ settingsFile: outsideSettings, settingsRelPath: 'settings.json', libraryRoot }),
    settingsPlaintextFile: path.join(root, 'settings.json'),
    basicSettingsFile: path.join(root, 'basic_settings.json'),
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptBufferWithKey: ({ buffer }) => buffer,
    },
    requireLibraryScope: true,
  });

  manager.updateSettings({ startPage: 'example.test' });
  const writeError = manager.consumeLastWriteError();
  assert.equal(writeError.code, 'SETTINGS_WRITE_FAILED');
  assert.match(writeError.message, /outside the active library root/);
});

test('persistBasicOnly skips encrypted settings write even when vault is unlocked', () => {
  const root = makeTempDir();
  const settingsFile = path.join(root, 'settings.json.enc');
  const settingsPlaintextFile = path.join(root, 'settings.json');
  const basicSettingsFile = path.join(root, 'basic_settings.json');

  const seededEncrypted = {
    startPage: 'https://kept.example',
    startPages: ['https://kept.example'],
    sourceAdapterUrls: { default: 'https://kept.example' },
    darkMode: true,
    libraryPath: path.join(root, 'OriginalLibrary'),
  };
  fs.writeFileSync(settingsFile, JSON.stringify(seededEncrypted), 'utf8');

  const vaultManager = {
    isInitialized: () => true,
    isUnlocked: () => true,
    encryptBufferWithKey: ({ buffer }) => buffer,
    decryptBufferWithKey: ({ buffer }) => buffer,
  };

  const manager = createSettingsManager({
    settingsFile,
    settingsPlaintextFile,
    basicSettingsFile,
    settingsRelPath: 'settings.json',
    defaultSettings: defaultSettings(),
    getWindows: () => [],
    vaultManager,
  });

  const selectedLibraryPath = path.join(root, 'SwitchedLibrary');
  manager.updateSettings({ libraryPath: selectedLibraryPath }, {
    suppressVaultLockedWarning: true,
    persistBasicOnly: true,
  });

  const encryptedAfterUpdate = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(encryptedAfterUpdate.libraryPath, seededEncrypted.libraryPath);
  assert.equal(encryptedAfterUpdate.startPage, seededEncrypted.startPage);

  const basic = JSON.parse(fs.readFileSync(basicSettingsFile, 'utf8'));
  assert.equal(basic.libraryPath, selectedLibraryPath);
});
