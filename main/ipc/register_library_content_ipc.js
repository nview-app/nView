const { INDEX_PAGE_META_VERSION, getImageMetadataFromBuffer, sanitizePageEntry } = require("../page_metadata");

function registerLibraryContentIpcHandlers(context) {
  const {
    ipcMain, ensureDirs, normalizeGalleryIdInput, loadLibraryIndexCache, normalizeGalleryId, readLibraryIndexEntry, buildComicEntry, fs, path, vaultManager, listEncryptedImagesRecursiveSorted, nativeImage, ensureThumbCacheDir, resolveThumbCacheKeyPayload, app, THUMB_CACHE_MAX_BYTES, getVaultRelPath, movePlainDirectImagesToVault, isUnderLibraryRoot, normalizeTagsInput, writeLibraryIndexEntry, cleanupHelpers, deleteLibraryIndexEntry, sendToGallery, sendToReader, LIBRARY_ROOT, listFilesRecursive
  } = context;

  const emitLibraryChanged = (action, comicDir, extra = null) => {
    const payload = {
      at: Date.now(),
      action: String(action || "update"),
      comicDir: String(comicDir || "").trim(),
    };
    if (extra && typeof extra === "object") Object.assign(payload, extra);
    if (!payload.comicDir) return;
    sendToGallery("library:changed", payload);
    sendToReader("library:changed", payload);
  };

  const warnIpcFailure = (operation, err) => {
    const code = err?.code ? ` (${String(err.code)})` : "";
    const message = err?.message ? ` ${String(err.message)}` : "";
    console.warn(`[ipc] ${operation} failed${code}.${message}`.trim());
  };

  async function readIndexPayload(comicDir) {
    const indexPath = path.join(comicDir, "index.json");
    const indexEncPath = `${indexPath}.enc`;
    if (!fs.existsSync(indexEncPath)) return null;
    try {
      const decrypted = vaultManager.decryptBufferWithKey({
        relPath: getVaultRelPath(indexPath),
        buffer: fs.readFileSync(indexEncPath),
      });
      const parsed = JSON.parse(decrypted.toString("utf8"));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (err) {
      warnIpcFailure("library:listComicPages decrypt index", err);
      return null;
    }
  }

  function buildPageEntryMap(indexPayload) {
    const map = new Map();
    if (!indexPayload || typeof indexPayload !== "object") return map;
    if (!Array.isArray(indexPayload.pageEntries)) return map;
    for (const rawEntry of indexPayload.pageEntries) {
      const entry = sanitizePageEntry(rawEntry);
      if (!entry) continue;
      map.set(entry.file, entry);
    }
    return map;
  }

  async function writeIndexPayload(comicDir, indexPayload) {
    const indexPath = path.join(comicDir, "index.json");
    const indexEncPath = `${indexPath}.enc`;
    const tempPath = `${indexEncPath}.tmp`;
    const encrypted = vaultManager.encryptBufferWithKey({
      relPath: getVaultRelPath(indexPath),
      buffer: Buffer.from(JSON.stringify(indexPayload, null, 2), "utf8"),
    });
    await fs.promises.writeFile(tempPath, encrypted);
    await fs.promises.rename(tempPath, indexEncPath);
  }

  async function backfillPageEntries(comicDir, cachedImages, indexPayload, pageEntryMap) {
    if (!indexPayload || typeof indexPayload !== "object") return;
    const BATCH_SIZE = 16;
    let processed = 0;
    let rewritten = false;
    const nextEntries = Array.isArray(indexPayload?.pageEntries) ? indexPayload.pageEntries.slice() : [];
    for (let i = 0; i < cachedImages.length; i += 1) {
      if (processed >= BATCH_SIZE) break;
      const encryptedPath = cachedImages[i];
      const fileName = path.basename(encryptedPath, ".enc");
      let fileStat = null;
      try {
        fileStat = await fs.promises.stat(encryptedPath);
      } catch (err) {
        if (err?.code !== "ENOENT") warnIpcFailure("library:listComicPages stat page", err);
      }
      const existing = pageEntryMap.get(fileName);
      const matchesFingerprint =
        existing?.sourceSize &&
        existing?.sourceMtimeMs != null &&
        fileStat &&
        existing.sourceSize === Math.floor(fileStat.size || 0) &&
        existing.sourceMtimeMs === Math.floor(fileStat.mtimeMs || 0);
      if (matchesFingerprint && existing?.w && existing?.h) continue;
      processed += 1;
      try {
        const plainPath = encryptedPath.slice(0, -4);
        const decrypted = await vaultManager.decryptFileToBuffer({
          relPath: getVaultRelPath(plainPath),
          inputPath: encryptedPath,
        });
        const metadata = getImageMetadataFromBuffer(decrypted);
        const nextEntry = {
          file: fileName,
          w: metadata?.width ?? null,
          h: metadata?.height ?? null,
          bytes: metadata?.bytes ?? null,
          sourceMtimeMs: fileStat ? Math.floor(fileStat.mtimeMs || 0) : null,
          sourceSize: fileStat ? Math.floor(fileStat.size || 0) : null,
        };
        const existingIndex = nextEntries.findIndex((item) => item && item.file === fileName);
        if (existingIndex >= 0) nextEntries[existingIndex] = nextEntry;
        else nextEntries.push(nextEntry);
        pageEntryMap.set(fileName, sanitizePageEntry(nextEntry));
        rewritten = true;
      } catch (err) {
        warnIpcFailure("library:listComicPages backfill page metadata", err);
      }
    }
    if (!rewritten) return;
    const payload = {
      ...(indexPayload && typeof indexPayload === "object" ? indexPayload : {}),
      pages: cachedImages.length,
      pageMetaVersion: INDEX_PAGE_META_VERSION,
      pageEntries: nextEntries,
    };
    await writeIndexPayload(comicDir, payload);
  }

ipcMain.handle("library:lookupGalleryId", async (_e, galleryId) => {
  ensureDirs();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true };
  }
  const normalized = normalizeGalleryIdInput(galleryId);
  if (!normalized) return { ok: true, exists: false };

  const cache = loadLibraryIndexCache();
  const entries = cache?.entries || {};
  let exists = false;

  for (const entry of Object.values(entries)) {
    if (!entry) continue;
    if (normalizeGalleryId(entry.galleryId) === normalized) {
      exists = true;
      break;
    }
  }

  return { ok: true, exists };
});

ipcMain.handle("library:listComicPages", async (_e, comicDir) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, error: "Vault locked", locked: true };
  }

  const entry = await buildComicEntry(comicDir);

  let cachedImages = readLibraryIndexEntry(comicDir, true)?.images;
  if (!Array.isArray(cachedImages)) {
    cachedImages = await listEncryptedImagesRecursiveSorted(entry.contentDir);
    const dirStat = await (async () => {
      try {
        return await fs.promises.stat(comicDir);
      } catch (err) {
        if (err?.code !== "ENOENT") {
          warnIpcFailure("library:listComicPages stat comicDir", err);
        }
        return null;
      }
    })();
    const contentStat = await (async () => {
      try {
        return await fs.promises.stat(entry.contentDir);
      } catch (err) {
        if (err?.code !== "ENOENT") {
          warnIpcFailure("library:listComicPages stat contentDir", err);
        }
        return null;
      }
    })();
    writeLibraryIndexEntry(comicDir, true, {
      dirMtimeMs: dirStat?.mtimeMs ?? 0,
      contentDir: entry.contentDir,
      contentDirMtimeMs: contentStat?.mtimeMs ?? 0,
      images: cachedImages,
    });
  }

  const indexPayload = await readIndexPayload(comicDir);
  const pageEntryMap = buildPageEntryMap(indexPayload);
  await backfillPageEntries(comicDir, cachedImages, indexPayload, pageEntryMap);

  const pages = cachedImages.map((encryptedPath) => {
    const plainPath = encryptedPath.slice(0, -4);
    const pageMeta = pageEntryMap.get(path.basename(plainPath));
    return {
      path: plainPath,
      name: path.basename(plainPath),
      ext: path.extname(plainPath).toLowerCase(),
      w: pageMeta?.w ?? null,
      h: pageMeta?.h ?? null,
      bytes: pageMeta?.bytes ?? null,
    };
  });

  return { ok: true, comic: entry, pages };
});

ipcMain.handle("library:getCoverThumbnail", async (_e, payload) => {
  ensureDirs();

  const coverPath = String(payload?.path || "");
  const width = Number(payload?.width || 0);
  const height = Number(payload?.height || 0);
  if (!coverPath || !isUnderLibraryRoot(coverPath)) {
    return { ok: false, error: "Invalid coverPath" };
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, error: "Invalid target size" };
  }

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, error: "Vault locked", locked: true };
  }

  const encryptedPath = `${coverPath}.enc`;

  try {
    const buffer = await vaultManager.decryptFileToBuffer({
      relPath: getVaultRelPath(coverPath),
      inputPath: encryptedPath,
    });
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) {
      return { ok: false, error: "Invalid image" };
    }

    const naturalSize = image.getSize();
    const targetW = Math.min(2048, Math.max(1, Math.round(width)));
    const targetH = Math.min(2048, Math.max(1, Math.round(height)));
    const scale = Math.max(targetW / naturalSize.width, targetH / naturalSize.height);
    const resizedW = Math.max(1, Math.round(naturalSize.width * scale));
    const resizedH = Math.max(1, Math.round(naturalSize.height * scale));
    const resized = image.resize({ width: resizedW, height: resizedH });
    const cropX = Math.max(0, Math.round((resizedW - targetW) / 2));
    const cropY = Math.max(0, Math.round((resizedH - targetH) / 2));
    const cropped = resized.crop({ x: cropX, y: cropY, width: targetW, height: targetH });
    const sourceExt = path.extname(coverPath).toLowerCase();
    const shouldUsePng = sourceExt === ".png" || sourceExt === ".webp";
    const output = shouldUsePng ? cropped.toPNG() : cropped.toJPEG(85);
    return { ok: true, mime: shouldUsePng ? "image/png" : "image/jpeg", buffer: output };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { ok: false, error: "Not found" };
    }
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("thumbnailCache:get", async (_e, payload = {}) => {
  ensureDirs();
  await ensureThumbCacheDir();

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled || !vaultStatus.unlocked) {
    return { ok: false, status: 401, error: "Vault locked" };
  }

  const resolved = await resolveThumbCacheKeyPayload(payload);
  if (!resolved.ok) return { ok: false, status: resolved.status || 400, error: resolved.error };

  try {
    const encrypted = await fs.promises.readFile(resolved.cachePath);
    const decrypted = vaultManager.decryptBufferWithKey({
      relPath: resolved.cacheRelPath,
      buffer: encrypted,
    });
    return { ok: true, hit: true, mimeType: resolved.profile.mimeType, buffer: decrypted };
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("[thumb-cache] read failed:", String(err));
    }
    return { ok: true, hit: false };
  }
});

ipcMain.handle("thumbnailCache:put", async (_e, payload = {}) => {
  ensureDirs();
  await ensureThumbCacheDir();

  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled || !vaultStatus.unlocked) {
    return { ok: false, status: 401, error: "Vault locked" };
  }

  const resolved = await resolveThumbCacheKeyPayload(payload);
  if (!resolved.ok) return { ok: false, status: resolved.status || 400, error: resolved.error };

  const rawBuffer = payload?.buffer;
  const buffer = Buffer.isBuffer(rawBuffer)
    ? rawBuffer
    : rawBuffer instanceof Uint8Array
      ? Buffer.from(rawBuffer)
      : null;
  if (!buffer || !buffer.length || buffer.length > THUMB_CACHE_MAX_BYTES) {
    return { ok: false, status: 400, error: "Invalid thumbnail buffer" };
  }

  try {
    const encrypted = vaultManager.encryptBufferWithKey({
      relPath: resolved.cacheRelPath,
      buffer,
    });
    await fs.promises.mkdir(path.dirname(resolved.cachePath), { recursive: true });
    await fs.promises.writeFile(resolved.cachePath, encrypted);
    return { ok: true };
  } catch (err) {
    console.warn("[thumb-cache] write failed:", String(err));
    return { ok: false, status: 500, error: "Failed to persist thumbnail cache" };
  }
});

ipcMain.handle("library:toggleFavorite", async (_e, comicDir, isFavorite) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }

  const vaultEnabled = vaultManager.isInitialized();
  if (!vaultEnabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultManager.isUnlocked()) {
    return { ok: false, error: "Vault locked" };
  }

  const metaEncPath = path.join(comicDir, "metadata.json.enc");

  let meta = {};
  try {
    const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
    const decrypted = await vaultManager.decryptFileToBuffer({ relPath, inputPath: metaEncPath });
    meta = JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    if (err?.code !== "ENOENT") {
      return { ok: false, error: String(err) };
    }
  }

  if (isFavorite) {
    meta.favorite = true;
  } else {
    delete meta.favorite;
  }

  try {
    const json = JSON.stringify(meta, null, 2);
    const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
    const encrypted = vaultManager.encryptBufferWithKey({ relPath, buffer: Buffer.from(json) });
    await fs.promises.writeFile(metaEncPath, encrypted);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  const entry = await buildComicEntry(comicDir);
  emitLibraryChanged("update", comicDir, { entry });
  return { ok: true, entry };
});

ipcMain.handle("library:updateComicMeta", async (_e, comicDir, payload) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }

  const metaEncPath = path.join(comicDir, "metadata.json.enc");
  const indexPath = path.join(comicDir, "index.json");
  const indexEncPath = path.join(comicDir, "index.json.enc");
  const vaultEnabled = vaultManager.isInitialized();
  if (!vaultEnabled) {
    return { ok: false, error: "Vault required", requiresVault: true };
  }
  if (!vaultManager.isUnlocked()) {
    return { ok: false, error: "Vault locked" };
  }

  let meta = {};
  try {
    const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
    const decrypted = await vaultManager.decryptFileToBuffer({ relPath, inputPath: metaEncPath });
    meta = JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    if (err?.code !== "ENOENT") {
      return { ok: false, error: String(err) };
    }
  }
  const title = String(payload?.title || "").trim();
  const author = String(payload?.author || "").trim();
  const tags = normalizeTagsInput(payload?.tags);
  const languages = normalizeTagsInput(payload?.languages);
  const parodies = normalizeTagsInput(payload?.parodies);
  const characters = normalizeTagsInput(payload?.characters);

  if (title) {
    meta.comicName = title;
    meta.title = title;
  } else {
    delete meta.comicName;
    delete meta.title;
  }

  if (author) {
    meta.artist = author;
    meta.artists = [author];
  } else {
    delete meta.artist;
    delete meta.artists;
  }

  meta.tags = tags;
  meta.parodies = parodies;
  meta.characters = characters;
  if (languages.length) {
    meta.languages = languages;
  } else {
    delete meta.languages;
  }

  try {
    const json = JSON.stringify(meta, null, 2);
    const relPath = getVaultRelPath(path.join(comicDir, "metadata.json"));
    const encrypted = vaultManager.encryptBufferWithKey({ relPath, buffer: Buffer.from(json) });
    await fs.promises.writeFile(metaEncPath, encrypted);
    let index = {};
    try {
      const relIndexPath = getVaultRelPath(indexPath);
      const decryptedIndex = vaultManager.decryptBufferWithKey({
        relPath: relIndexPath,
        buffer: await fs.promises.readFile(indexEncPath),
      });
      index = JSON.parse(decryptedIndex.toString("utf8"));
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
    if (title) index.title = title;
    else delete index.title;
    const relIndexPath = getVaultRelPath(indexPath);
    const encryptedIndex = vaultManager.encryptBufferWithKey({
      relPath: relIndexPath,
      buffer: Buffer.from(JSON.stringify(index), "utf8"),
    });
    await fs.promises.writeFile(indexEncPath, encryptedIndex);
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  const entry = await buildComicEntry(comicDir);
  emitLibraryChanged("update", comicDir, { entry });
  return { ok: true, entry };
});

ipcMain.handle("library:deleteComic", async (_e, comicDir) => {
  ensureDirs();

  if (!comicDir || !isUnderLibraryRoot(comicDir)) {
    return { ok: false, error: "Invalid comicDir" };
  }
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true };
  }

  const res = await cleanupHelpers.purgeFolderBestEffort(comicDir);
  if (!res.ok) {
    return { ok: false, error: "Failed to delete comic" };
  }

  deleteLibraryIndexEntry(comicDir, true);

  emitLibraryChanged("delete", comicDir);
  return { ok: true, trashed: res.trashed, trashPath: res.trashPath };
});

ipcMain.handle("library:listLatest", async () => {
  ensureDirs();
  const root = LIBRARY_ROOT();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true, root };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true, root };
  }
  let dirs = [];
  try {
    dirs = (await fs.promises.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name.startsWith("comic_"))
      .map((d) => path.join(root, d.name));
  } catch (err) {
    console.warn("[library:listLatest] unable to list latest items", {
      code: err?.code || "UNKNOWN",
      name: err?.name || "Error",
    });
    dirs = [];
  }

  const itemsWithTimes = await Promise.all(
    dirs.map(async (dir) => {
      let mtimeMs = 0;
      try {
        const stat = await fs.promises.stat(dir);
        mtimeMs = stat.mtimeMs;
      } catch (err) {
        console.warn("[library:listLatest] unable to stat comic folder", {
          code: err?.code || "UNKNOWN",
          name: err?.name || "Error",
        });
      }
      return { dir, mtimeMs };
    })
  );

  const items = await Promise.all(
    itemsWithTimes
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 10)
      .map(async ({ dir }) => ({
        dir,
        files: (await listFilesRecursive(dir)).map((p) => ({
          path: p,
          name: path.basename(p),
          ext: path.extname(p).toLowerCase(),
        })),
      }))
  );

  return { ok: true, root, items };
});

}

module.exports = { registerLibraryContentIpcHandlers };
