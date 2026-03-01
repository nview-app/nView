const { INDEX_PAGE_META_VERSION, getImageMetadataFromBuffer, sanitizePageEntry, sanitizePageMark, sanitizePageName } = require("../page_metadata");

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

  function normalizeComparableUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      parsed.hash = "";
      parsed.search = "";
      const trimmedPath = parsed.pathname.replace(/\/+$/, "");
      const normalizedPath = trimmedPath || "/";
      return `${parsed.origin}${normalizedPath}`;
    } catch {
      return "";
    }
  }

  function sanitizeSourceId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    if (!/^[a-z0-9._-]+$/.test(raw)) return "";
    return raw;
  }

  function sanitizeSourceScopedId(value) {
    return String(value || "").trim();
  }


  function sanitizeMetadataText(value, maxLength = 500) {
    const normalized = String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.slice(0, Math.max(0, Number(maxLength) || 0));
  }

  function sanitizeMetadataNote(value) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, 500);
  }


  function sanitizePublishedDate(value) {
    const normalized = sanitizeMetadataText(value, 64);
    if (!normalized) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [year, month, day] = normalized.split("-").map((part) => Number.parseInt(part, 10));
      if (!Number.isInteger(year) || year < 1 || year > 9999) return "";
      if (!Number.isInteger(month) || month < 1 || month > 12) return "";
      if (!Number.isInteger(day) || day < 1 || day > 31) return "";
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getUTCFullYear() !== year) return "";
      if (candidate.getUTCMonth() !== month - 1) return "";
      if (candidate.getUTCDate() !== day) return "";
      return candidate.toISOString();
    }

    const candidate = new Date(normalized);
    if (!Number.isFinite(candidate.getTime())) return "";
    return candidate.toISOString();
  }

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



  function sanitizePageOrder(value) {
    const order = [];
    const seen = new Set();
    for (const raw of Array.isArray(value) ? value : []) {
      const name = path.basename(String(raw || "").trim());
      if (!name || seen.has(name)) continue;
      seen.add(name);
      order.push(name);
    }
    return order;
  }

  function applyStoredPageOrder(cachedImages, indexPayload) {
    const encryptedPages = Array.isArray(cachedImages) ? cachedImages.slice() : [];
    const configuredOrder = sanitizePageOrder(indexPayload?.pageOrder);
    if (!configuredOrder.length || !encryptedPages.length) return encryptedPages;

    const encryptedByName = new Map(encryptedPages.map((encryptedPath) => [path.basename(encryptedPath, ".enc"), encryptedPath]));
    const ordered = [];
    for (const fileName of configuredOrder) {
      const encryptedPath = encryptedByName.get(fileName);
      if (!encryptedPath) continue;
      ordered.push(encryptedPath);
      encryptedByName.delete(fileName);
    }

    for (const encryptedPath of encryptedPages) {
      const fileName = path.basename(encryptedPath, ".enc");
      if (!encryptedByName.has(fileName)) continue;
      ordered.push(encryptedPath);
      encryptedByName.delete(fileName);
    }

    return ordered;
  }

  function sanitizePageMarks(value, allowedNames = null) {
    const marks = {};
    if (!value || typeof value !== "object") return marks;
    const allowedSet = allowedNames instanceof Set ? allowedNames : null;
    for (const [rawName, rawMark] of Object.entries(value)) {
      const fileName = path.basename(String(rawName || "").trim());
      if (!fileName) continue;
      if (allowedSet && !allowedSet.has(fileName)) continue;
      const mark = sanitizePageMark(rawMark);
      if (!mark) continue;
      marks[fileName] = mark;
    }
    return marks;
  }

  function sanitizePageNames(value, allowedNames = null) {
    const names = {};
    if (!value || typeof value !== "object") return names;
    const allowedSet = allowedNames instanceof Set ? allowedNames : null;
    for (const [rawName, rawPageName] of Object.entries(value)) {
      const fileName = path.basename(String(rawName || "").trim());
      if (!fileName) continue;
      if (allowedSet && !allowedSet.has(fileName)) continue;
      const pageName = sanitizePageName(rawPageName);
      if (!pageName) continue;
      names[fileName] = pageName;
    }
    return names;
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

function lookupSourceIdentityInIndex(identity) {
  const normalizedCanonicalUrl = normalizeComparableUrl(identity?.canonicalUrl);
  const normalizedSourceId = sanitizeSourceId(identity?.sourceId);
  const normalizedSourceScopedId = sanitizeSourceScopedId(identity?.sourceScopedId);
  const normalizedLegacyGalleryId = normalizeGalleryIdInput(identity?.galleryId);

  if (!normalizedCanonicalUrl && !(normalizedSourceId && normalizedSourceScopedId) && !normalizedLegacyGalleryId) {
    return { ok: true, exists: false, matchType: null };
  }

  const cache = loadLibraryIndexCache();
  const entries = cache?.entries || {};

  for (const entry of Object.values(entries)) {
    if (!entry) continue;

    const entryCanonicalUrl = normalizeComparableUrl(entry.sourceIdentity?.canonicalUrl || entry.sourceUrl);
    if (normalizedCanonicalUrl && entryCanonicalUrl && entryCanonicalUrl === normalizedCanonicalUrl) {
      return { ok: true, exists: true, matchType: "canonicalUrl" };
    }

    const entrySourceId = sanitizeSourceId(entry.sourceIdentity?.sourceId);
    const entrySourceScopedId = sanitizeSourceScopedId(entry.sourceIdentity?.sourceScopedId);
    if (normalizedSourceId && normalizedSourceScopedId && entrySourceId === normalizedSourceId && entrySourceScopedId === normalizedSourceScopedId) {
      return { ok: true, exists: true, matchType: "sourceScopedId" };
    }

    if (normalizedLegacyGalleryId && normalizeGalleryId(entry.galleryId) === normalizedLegacyGalleryId) {
      return { ok: true, exists: true, matchType: "legacyGalleryId" };
    }
  }

  return { ok: true, exists: false, matchType: null };
}

ipcMain.handle("library:lookupSourceIdentity", async (_e, identity) => {
  ensureDirs();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true };
  }
  return lookupSourceIdentityInIndex(identity);
});

ipcMain.handle("library:lookupGalleryId", async (_e, galleryId) => {
  console.warn("[ipc] library:lookupGalleryId is deprecated. Use library:lookupSourceIdentity instead.");
  ensureDirs();
  const vaultStatus = vaultManager.vaultStatus();
  if (!vaultStatus.enabled) {
    return { ok: false, requiresVault: true };
  }
  if (!vaultStatus.unlocked) {
    return { ok: false, locked: true };
  }
  const result = lookupSourceIdentityInIndex({ galleryId });
  return { ok: Boolean(result?.ok), exists: Boolean(result?.exists) };
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
  const orderedImages = applyStoredPageOrder(cachedImages, indexPayload);
  const pageMarks = sanitizePageMarks(indexPayload?.pageMarks);
  const pageNames = sanitizePageNames(indexPayload?.pageNames);

  const pages = orderedImages.map((encryptedPath) => {
    const plainPath = encryptedPath.slice(0, -4);
    const pageMeta = pageEntryMap.get(path.basename(plainPath));
    return {
      path: plainPath,
      name: path.basename(plainPath),
      ext: path.extname(plainPath).toLowerCase(),
      mark: pageMarks[path.basename(plainPath)] || "",
      pageName: pageNames[path.basename(plainPath)] || "",
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
  const publishedAt = sanitizePublishedDate(payload?.publishedAt);
  const note = sanitizeMetadataNote(payload?.note);

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
  if (publishedAt) {
    meta.publishedAt = publishedAt;
    meta.publishedDate = publishedAt;
  } else {
    delete meta.publishedAt;
    delete meta.publishedDate;
  }

  if (note) meta.note = note;
  else delete meta.note;
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

ipcMain.handle("library:updateComicPages", async (_e, comicDir, payload) => {
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

  const pageOrder = sanitizePageOrder(payload?.pageOrder);
  if (!pageOrder.length) {
    return { ok: false, error: "At least one page is required" };
  }

  const allowedNames = new Set(pageOrder);
  const pageMarks = sanitizePageMarks(payload?.pageMarks, allowedNames);
  const pageNames = sanitizePageNames(payload?.pageNames, allowedNames);

  const entry = await buildComicEntry(comicDir);
  const existingImages = await listEncryptedImagesRecursiveSorted(entry.contentDir);
  const encryptedByName = new Map(existingImages.map((encryptedPath) => [path.basename(encryptedPath, ".enc"), encryptedPath]));

  for (const fileName of pageOrder) {
    if (!encryptedByName.has(fileName)) {
      return { ok: false, error: `Unknown page: ${fileName}` };
    }
  }

  const retainedNames = allowedNames;
  const deletedFiles = [];
  for (const [fileName, encryptedPath] of encryptedByName.entries()) {
    if (retainedNames.has(fileName)) continue;
    deletedFiles.push(encryptedPath);
  }

  for (const encryptedPath of deletedFiles) {
    try {
      await fs.promises.unlink(encryptedPath);
    } catch (err) {
      if (err?.code !== "ENOENT") {
        return { ok: false, error: String(err) };
      }
    }
  }

  const indexPath = path.join(comicDir, "index.json");
  const indexEncPath = `${indexPath}.enc`;
  let indexPayload = {};
  try {
    const decrypted = vaultManager.decryptBufferWithKey({
      relPath: getVaultRelPath(indexPath),
      buffer: await fs.promises.readFile(indexEncPath),
    });
    indexPayload = JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    if (err?.code !== "ENOENT") {
      return { ok: false, error: String(err) };
    }
  }

  const entryMap = buildPageEntryMap(indexPayload);
  const nextPageEntries = [];
  for (const fileName of pageOrder) {
    const existing = entryMap.get(fileName);
    if (existing) nextPageEntries.push(existing);
  }

  const nextIndexPayload = {
    ...(indexPayload && typeof indexPayload === "object" ? indexPayload : {}),
    pages: pageOrder.length,
    pageMetaVersion: INDEX_PAGE_META_VERSION,
    pageOrder,
    pageMarks,
    pageNames,
    pageEntries: nextPageEntries,
  };

  await writeIndexPayload(comicDir, nextIndexPayload);

  const finalEncryptedOrder = pageOrder.map((fileName) => encryptedByName.get(fileName)).filter(Boolean);
  writeLibraryIndexEntry(comicDir, true, {
    contentDir: entry.contentDir,
    images: finalEncryptedOrder,
  });

  const updatedEntry = await buildComicEntry(comicDir);
  emitLibraryChanged("update", comicDir, { entry: updatedEntry, pagesUpdated: true });
  return { ok: true, entry: updatedEntry, deletedCount: deletedFiles.length };
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
