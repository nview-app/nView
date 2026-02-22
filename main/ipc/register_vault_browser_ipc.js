const { canGoBack, canGoForward } = require("../navigation_history_compat");

function registerVaultBrowserIpcHandlers(context) {
  const {
    ipcMain, vaultManager, getVaultPolicy, validateVaultPassphrase, encryptLibraryForVault, sendToGallery, sendToDownloader, sendToBrowser, ensureBrowserWindow, getBrowserView, getBrowserWin, shell, loadBookmarksFromDisk, addBookmarkForPage, removeBookmarkById, getBrowserSidePanelWidth, setBrowserSidePanelWidth, dl, settingsManager, applyConfiguredLibraryRoot, fs
  } = context;

ipcMain.handle("vault:status", async () => ({ ok: true, status: vaultManager.vaultStatus() }));
ipcMain.handle("vault:getPolicy", async () => ({ ok: true, policy: getVaultPolicy() }));
ipcMain.handle("vault:enable", async (_e, passphrase) => {
  if (vaultManager.isInitialized()) {
    return { ok: false, error: "Vault already initialized." };
  }
  if (dl.hasActiveDownloads()) {
    return { ok: false, error: "All downloads must be completed before enabling Vault Mode." };
  }
  const validation = validateVaultPassphrase(passphrase);
  if (!validation.ok) return validation;
  const initRes = vaultManager.vaultInit(validation.passphrase);
  if (!initRes?.ok) return initRes;
  try {
    const summary = await encryptLibraryForVault();
    const settings = settingsManager.reloadSettings();
    applyConfiguredLibraryRoot(settings.libraryPath);
    sendToGallery("settings:updated", settings);
    sendToDownloader("settings:updated", settings);
    sendToBrowser("settings:updated", settings);
    return { ok: true, summary };
  } catch (err) {
    vaultManager.vaultLock();
    try {
      const vaultPath = vaultManager.vaultFilePath();
      await fs.promises.unlink(vaultPath).catch((unlinkErr) => {
        if (unlinkErr?.code !== "ENOENT") throw unlinkErr;
      });
    } catch (cleanupErr) {
      console.warn("[vault] failed to rollback vault init:", String(cleanupErr));
    }
    return { ok: false, error: String(err) };
  }
});
ipcMain.handle("vault:unlock", async (_e, passphrase) =>
  {
    const res = vaultManager.vaultUnlock(String(passphrase || ""));
    if (res?.ok) {
      const settings = settingsManager.reloadSettings();
      applyConfiguredLibraryRoot(settings.libraryPath);
      sendToGallery("settings:updated", settings);
      sendToDownloader("settings:updated", settings);
      sendToBrowser("settings:updated", settings);
    }
    return res;
  },
);
ipcMain.handle("vault:lock", async () => vaultManager.vaultLock());

ipcMain.handle("browser:navigate", async (_event, url) => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    let target = String(url || "").trim();
    if (!target) return { ok: false, error: "Empty URL" };
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    await getBrowserView().webContents.loadURL(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:back", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    const contents = getBrowserView().webContents;
    if (canGoBack(contents)) {
      await contents.goBack();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:forward", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    const contents = getBrowserView().webContents;
    if (canGoForward(contents)) {
      await contents.goForward();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:navigationState", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    const contents = getBrowserView().webContents;
    return {
      ok: true,
      canGoBack: canGoBack(contents),
      canGoForward: canGoForward(contents),
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:reload", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  try {
    getBrowserView().webContents.reload();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:setSidePanelWidth", async (_event, width) => {
  if (!getBrowserView() || !getBrowserWin()) return { ok: false, error: "Browser is not open." };
  const numericWidth = Number(width);
  setBrowserSidePanelWidth(Number.isFinite(numericWidth) ? Math.max(0, Math.round(numericWidth)) : 0);
  const bounds = getBrowserWin().getContentBounds();
  const barHeight = 60;
  getBrowserView().setBounds({
    x: getBrowserSidePanelWidth(),
    y: barHeight,
    width: Math.max(0, bounds.width - getBrowserSidePanelWidth()),
    height: bounds.height - barHeight,
  });
  return { ok: true };
});

ipcMain.handle("browser:close", async () => {
  try {
    if (getBrowserWin() && !getBrowserWin().isDestroyed()) getBrowserWin().close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("browser:bookmarks:list", async () => {
  const res = loadBookmarksFromDisk();
  if (!res.ok) return res;
  const sorted = res.bookmarks
    .filter((item) => item && item.url)
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  return { ok: true, bookmarks: sorted };
});

ipcMain.handle("browser:bookmark:add", async () => {
  if (!getBrowserView()) return { ok: false, error: "Browser is not open." };
  const pageUrl = String(getBrowserView().webContents.getURL() || "").trim();
  if (!pageUrl) return { ok: false, error: "No page to bookmark." };
  const title = String(getBrowserView().webContents.getTitle() || "").trim() || pageUrl;
  return addBookmarkForPage(pageUrl, title);
});

ipcMain.handle("browser:bookmark:remove", async (_event, id) => {
  const bookmarkId = String(id || "").trim();
  if (!bookmarkId) return { ok: false, error: "Bookmark id required." };
  return removeBookmarkById(bookmarkId);
});

}

module.exports = { registerVaultBrowserIpcHandlers };
