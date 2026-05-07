const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createWindowRuntime } = require('../main/window_runtime');

function makeDeps({ darkMode }) {
  const createdOptions = [];
  const loadFileCalls = [];

  class FakeBrowserWindow {
    constructor(options) {
      createdOptions.push(options);
      this.webContents = {
        id: 1,
        on: () => {},
        once: () => {},
        setWindowOpenHandler: () => {},
      };
    }

    loadFile(filePath, options) {
      loadFileCalls.push({ filePath, options });
    }
    on() {}
    isDestroyed() { return false; }
  }

  return {
    createdOptions,
    loadFileCalls,
    deps: {
      app: { quit: () => {} },
      BrowserWindow: FakeBrowserWindow,
      BrowserView: class {},
      Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
      session: { fromPartition: () => ({ protocol: { registerStreamProtocol: () => {} } }) },
      path,
      fs: { existsSync: () => false, statSync: () => ({}) },
      fsp: {},
      APP_ICON_PATH: '/icon.png',
      UI_PARTITION: 'nview-ui',
      LIBRARY_ROOT: () => '/library',
      vaultManager: { isInitialized: () => false, isUnlocked: () => false },
      isImagePath: () => false,
      getVaultRelPath: () => '',
      dl: { hasInProgressDownloads: () => false },
      settingsManager: { getSettings: () => ({ darkMode }) },
      summarizeError: () => 'error',
      ensureDirs: () => {},
      confirmCloseWithActiveVaultDownloads: async () => true,
      sendToBrowser: () => {},
      findBookmarkByUrl: () => null,
      addBookmarkForPage: () => ({ ok: true, bookmarks: [] }),
      removeBookmarkById: () => ({ ok: true, bookmarks: [] }),
      appRootDir: process.cwd(),
    },
  };
}

test('gallery window uses dark background color when darkMode is enabled at startup', () => {
  const { deps, createdOptions, loadFileCalls } = makeDeps({ darkMode: true });
  const runtime = createWindowRuntime(deps);
  runtime.createGalleryWindow();

  assert.equal(createdOptions[0].backgroundColor, '#1e1e1e');
  assert.equal(loadFileCalls[0].options?.query?.bootstrapTheme, 'dark');
});

test('gallery window uses light background color when darkMode is disabled at startup', () => {
  const { deps, createdOptions, loadFileCalls } = makeDeps({ darkMode: false });
  const runtime = createWindowRuntime(deps);
  runtime.createGalleryWindow();

  assert.equal(createdOptions[0].backgroundColor, '#ffffff');
  assert.equal(loadFileCalls[0].options?.query?.bootstrapTheme, 'light');
});
