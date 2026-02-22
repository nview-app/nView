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
    allowListDomains: ['*.cloudflare.com'],
    darkMode: false,
    defaultSort: 'favorites',
    cardSize: 'normal',
    libraryPath: '',
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
    allowListDomains: ['example.com'],
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
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[settings write failed\]/);
    assert.match(warnings[0], /simulated encrypt failure/);
  } finally {
    console.warn = previousWarn;
  }
});
