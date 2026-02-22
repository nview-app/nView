const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const IPC_DIR = path.resolve(__dirname, "../main/ipc");
const REGISTER_MAIN_IPC_PATH = path.join(IPC_DIR, "register_main_ipc.js");

const MODULE_SPECS = [
  ["register_ui_ipc.js", "registerUiIpcHandlers", "ui"],
  ["register_settings_library_ipc.js", "registerSettingsLibraryIpcHandlers", "settings/library"],
  ["register_vault_browser_ipc.js", "registerVaultBrowserIpcHandlers", "vault/browser"],
  ["register_downloads_files_ipc.js", "registerDownloadsFilesIpcHandlers", "downloads/files"],
  ["register_importer_ipc.js", "registerImporterIpcHandlers", "importer"],
  ["register_exporter_ipc.js", "registerExporterIpcHandlers", "exporter"],
  ["register_library_content_ipc.js", "registerLibraryContentIpcHandlers", "library/content"],
];

function withStubbedRegisterModules(fn) {
  const originals = new Map();
  const calls = [];

  try {
    for (const [fileName, exportName, label] of MODULE_SPECS) {
      const modulePath = path.join(IPC_DIR, fileName);
      originals.set(modulePath, require.cache[modulePath]);
      require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports: {
          [exportName]: (ctx) => calls.push({ label, ctx }),
        },
      };
    }

    delete require.cache[REGISTER_MAIN_IPC_PATH];
    const loaded = require(REGISTER_MAIN_IPC_PATH);
    return fn({ loaded, calls });
  } finally {
    delete require.cache[REGISTER_MAIN_IPC_PATH];
    for (const [fileName] of MODULE_SPECS) {
      const modulePath = path.join(IPC_DIR, fileName);
      const previous = originals.get(modulePath);
      if (previous) require.cache[modulePath] = previous;
      else delete require.cache[modulePath];
    }
  }
}

function makeContext(requiredKeys) {
  const context = {};
  for (const key of requiredKeys) {
    context[key] = { name: key };
  }
  return context;
}

test("registerMainIpcHandlers rejects non-object context", () => {
  withStubbedRegisterModules(({ loaded }) => {
    assert.throws(
      () => loaded.registerMainIpcHandlers(null),
      /requires a context object/i,
    );
  });
});

test("registerMainIpcHandlers forwards frozen scoped contexts to each IPC module", () => {
  withStubbedRegisterModules(({ loaded, calls }) => {
    const context = makeContext(loaded.MAIN_IPC_REQUIRED_CONTEXT_KEYS);

    loaded.registerMainIpcHandlers(context);

    assert.equal(calls.length, MODULE_SPECS.length);
    for (const call of calls) {
      assert.equal(Object.isFrozen(call.ctx), true, `${call.label} context should be frozen`);
      assert.equal(Object.keys(call.ctx).length > 0, true, `${call.label} should receive required keys`);
      assert.equal(typeof call.ctx.ipcMain.handle, "function");
      assert.notEqual(call.ctx.ipcMain, context.ipcMain);
      assert.equal(Object.getPrototypeOf(call.ctx), Object.prototype);
    }
  });
});

test("registerMainIpcHandlers reports missing dependencies with module label", () => {
  withStubbedRegisterModules(({ loaded }) => {
    const context = makeContext(loaded.MAIN_IPC_REQUIRED_CONTEXT_KEYS);
    delete context.ensureBrowserWindow;

    assert.throws(
      () => loaded.registerMainIpcHandlers(context),
      /Missing context dependencies for ui: ensureBrowserWindow/i,
    );
  });
});
