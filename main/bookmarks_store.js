function createBookmarksStore({ vaultManager, bookmarksFile, bookmarksRelPath, fs }) {
  function loadBookmarksFromDisk() {
    const vaultStatus = vaultManager.vaultStatus();
    if (!vaultStatus.enabled) {
      return { ok: false, requiresVault: true, error: "Vault Mode is required for bookmarks." };
    }
    if (!vaultStatus.unlocked) {
      return { ok: false, locked: true, error: "Vault Mode is locked." };
    }
    const filePath = bookmarksFile();
    if (!fs.existsSync(filePath)) {
      return { ok: true, bookmarks: [] };
    }
    try {
      const encrypted = fs.readFileSync(filePath);
      const decrypted = vaultManager.decryptBufferWithKey({
        relPath: bookmarksRelPath,
        buffer: encrypted,
      });
      const payload = JSON.parse(decrypted.toString("utf8"));
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return { ok: true, bookmarks: items };
    } catch (err) {
      console.warn("[bookmarks] failed to load:", String(err));
      return { ok: false, error: "Failed to load bookmarks." };
    }
  }

  function persistBookmarksToDisk(bookmarks) {
    const vaultStatus = vaultManager.vaultStatus();
    if (!vaultStatus.enabled) {
      return { ok: false, requiresVault: true, error: "Vault Mode is required for bookmarks." };
    }
    if (!vaultStatus.unlocked) {
      return { ok: false, locked: true, error: "Vault Mode is locked." };
    }
    try {
      const payload = Buffer.from(
        JSON.stringify({ v: 1, items: bookmarks }, null, 2),
        "utf8",
      );
      const encrypted = vaultManager.encryptBufferWithKey({
        relPath: bookmarksRelPath,
        buffer: payload,
      });
      fs.writeFileSync(bookmarksFile(), encrypted);
      return { ok: true };
    } catch (err) {
      console.warn("[bookmarks] failed to save:", String(err));
      return { ok: false, error: "Failed to save bookmarks." };
    }
  }

  return {
    loadBookmarksFromDisk,
    persistBookmarksToDisk,
  };
}

module.exports = {
  createBookmarksStore,
};
