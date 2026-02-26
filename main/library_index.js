const path = require("path");
const fs = require("fs");
const { listFilesRecursive, naturalSort } = require("./utils");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const LIBRARY_INDEX_VERSION = 1;

function createLibraryIndex({ libraryRoot, vaultManager, getVaultRelPath }) {
  let libraryIndexCache = null;
  let libraryIndexSaveTimer = null;

  function isImagePath(p) {
    return IMAGE_EXTS.has(path.extname(p).toLowerCase());
  }

  function isEncryptedImagePath(p) {
    if (!String(p || "").toLowerCase().endsWith(".enc")) return false;
    const base = p.slice(0, -4);
    return isImagePath(base);
  }

  function getLibraryIndexPath() {
    return path.join(libraryRoot(), ".library_index.json");
  }

  function getLibraryIndexEncPath() {
    return `${getLibraryIndexPath()}.enc`;
  }

  function getLibraryIndexRelPath() {
    return getVaultRelPath(getLibraryIndexPath());
  }

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

  function keyToFinalDir(key) {
    const raw = String(key || "").trim();
    if (!raw.startsWith("vault:")) return "";
    const rel = raw.slice("vault:".length);
    if (!rel) return "";
    const base = path.resolve(libraryRoot());
    const candidate = path.resolve(base, rel);
    if (candidate === base) return "";
    const withSep = `${base}${path.sep}`;
    if (!candidate.startsWith(withSep)) return "";
    return candidate;
  }

  function hydrateIdentityFieldsFromMetadata(cache) {
    if (!cache || typeof cache !== "object" || !cache.entries || typeof cache.entries !== "object") return;
    if (!vaultManager.isInitialized() || !vaultManager.isUnlocked()) return;
    let changed = false;
    for (const [key, entry] of Object.entries(cache.entries)) {
      if (!entry || typeof entry !== "object") continue;
      const hasSourceUrl = Boolean(normalizeComparableUrl(entry.sourceUrl));
      const hasSourceIdentity = entry.sourceIdentity && typeof entry.sourceIdentity === "object";
      if (hasSourceUrl && hasSourceIdentity) continue;
      const finalDir = keyToFinalDir(key);
      if (!finalDir) continue;
      const metaEncPath = path.join(finalDir, "metadata.json.enc");
      if (!fs.existsSync(metaEncPath)) continue;
      try {
        const relPath = getVaultRelPath(path.join(finalDir, "metadata.json"));
        const decrypted = vaultManager.decryptBufferWithKey({
          relPath,
          buffer: fs.readFileSync(metaEncPath),
        });
        const parsed = JSON.parse(decrypted.toString("utf8"));
        const normalizedSourceUrl = normalizeComparableUrl(parsed?.sourceUrl);
        if (!hasSourceUrl && normalizedSourceUrl) {
          entry.sourceUrl = normalizedSourceUrl;
          changed = true;
        }
        if (!hasSourceIdentity) {
          const identity = synthesizeSourceIdentity(parsed, normalizedSourceUrl || entry.sourceUrl);
          if (identity) {
            entry.sourceIdentity = identity;
            changed = true;
          }
        }
      } catch {
        // Ignore metadata read/decrypt failures during hydration.
      }
    }
    if (changed) scheduleLibraryIndexSave();
  }

  function writeLibraryIndexCache() {
    if (!libraryIndexCache) return;
    const vaultEnabled = vaultManager.isInitialized();
    const vaultUnlocked = vaultManager.isUnlocked();
    if (vaultEnabled && vaultUnlocked) {
      try {
        const encrypted = vaultManager.encryptBufferWithKey({
          relPath: getLibraryIndexRelPath(),
          buffer: Buffer.from(JSON.stringify(libraryIndexCache), "utf8"),
        });
        const encPath = getLibraryIndexEncPath();
        const tempPath = `${encPath}.tmp`;
        fs.writeFileSync(tempPath, encrypted);
        fs.renameSync(tempPath, encPath);
        return;
      } catch (err) {
        console.warn("[vault] failed to encrypt library index:", String(err));
      }
    }
    if (!vaultEnabled) {
      console.warn("[vault] library index write skipped: Vault Mode is required.");
    }
  }

  function sanitizeLegacySourceUrlHashes(cache) {
    if (!cache || typeof cache !== "object" || !cache.entries || typeof cache.entries !== "object") return false;
    let changed = false;
    for (const entry of Object.values(cache.entries)) {
      if (!entry || typeof entry !== "object") continue;
      if (Object.prototype.hasOwnProperty.call(entry, "sourceUrlHash")) {
        delete entry.sourceUrlHash;
        changed = true;
      }
    }
    return changed;
  }

  function loadLibraryIndexCache() {
    if (libraryIndexCache) return libraryIndexCache;
    let data = null;
    const vaultEnabled = vaultManager.isInitialized();
    const vaultUnlocked = vaultManager.isUnlocked();
    if (vaultEnabled && vaultUnlocked && fs.existsSync(getLibraryIndexEncPath())) {
      try {
        const decrypted = vaultManager.decryptBufferWithKey({
          relPath: getLibraryIndexRelPath(),
          buffer: fs.readFileSync(getLibraryIndexEncPath()),
        });
        data = JSON.parse(decrypted.toString("utf8"));
      } catch (err) {
        console.warn("[vault] failed to decrypt library index:", String(err));
      }
    }
    if (!vaultEnabled) {
      console.warn("[vault] library index read skipped: Vault Mode is required.");
    }
    if (data && data.version === LIBRARY_INDEX_VERSION && data.entries) {
      libraryIndexCache = data;
    } else {
      libraryIndexCache = { version: LIBRARY_INDEX_VERSION, entries: {} };
    }
    const removedLegacyHashes = sanitizeLegacySourceUrlHashes(libraryIndexCache);
    hydrateIdentityFieldsFromMetadata(libraryIndexCache);
    if (removedLegacyHashes) scheduleLibraryIndexSave();
    return libraryIndexCache;
  }

  function scheduleLibraryIndexSave() {
    if (libraryIndexSaveTimer) return;
    libraryIndexSaveTimer = setTimeout(() => {
      libraryIndexSaveTimer = null;
      if (!libraryIndexCache) return;
      writeLibraryIndexCache();
    }, 500);
  }

  function getLibraryIndexKey(finalDir, vaultEnabled) {
    const relPath = path.relative(libraryRoot(), finalDir).replaceAll("\\", "/");
    return `vault:${relPath}`;
  }

  function readLibraryIndexEntry(finalDir, vaultEnabled) {
    const cache = loadLibraryIndexCache();
    const key = getLibraryIndexKey(finalDir, vaultEnabled);
    return cache.entries[key] || null;
  }

  function writeLibraryIndexEntry(finalDir, vaultEnabled, data) {
    const cache = loadLibraryIndexCache();
    const key = getLibraryIndexKey(finalDir, vaultEnabled);
    const next = { ...(cache.entries[key] || {}), ...data };
    delete next.sourceUrlHash;
    cache.entries[key] = next;
    scheduleLibraryIndexSave();
  }

  function deleteLibraryIndexEntry(finalDir, vaultEnabled) {
    const cache = loadLibraryIndexCache();
    const key = getLibraryIndexKey(finalDir, vaultEnabled);
    if (cache.entries[key]) {
      delete cache.entries[key];
      scheduleLibraryIndexSave();
    }
  }

  async function listEncryptedImagesRecursiveSorted(dir) {
    const files = await listFilesRecursive(dir);
    return files
      .filter(isEncryptedImagePath)
      .sort((a, b) => {
        const aName = path.basename(a, ".enc");
        const bName = path.basename(b, ".enc");
        return naturalSort(aName, bName);
      });
  }

  async function findBestContentDir(finalDir) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(finalDir, { withFileTypes: true });
    } catch {
      return { contentDir: finalDir, imageCount: 0 };
    }

    const subdirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(finalDir, e.name));

    let best = { contentDir: finalDir, imageCount: 0 };

    for (const d of subdirs) {
      const imgs = (await listFilesRecursive(d)).filter(isImagePath);
      if (imgs.length > best.imageCount) best = { contentDir: d, imageCount: imgs.length };
    }

    const rootImgs = (await listFilesRecursive(finalDir)).filter(isImagePath);
    if (rootImgs.length > best.imageCount) best = { contentDir: finalDir, imageCount: rootImgs.length };

    return best;
  }

  async function getComicContentData(finalDir, { vaultEnabled, dirStat }) {
    const cached = readLibraryIndexEntry(finalDir, vaultEnabled);
    const dirMtimeMs = dirStat?.mtimeMs ?? null;
    if (cached && dirMtimeMs !== null && cached.dirMtimeMs === dirMtimeMs && cached.contentDir) {
      const contentDir = cached.contentDir;
      try {
        if (fs.existsSync(contentDir)) {
          const contentStat = await fs.promises.stat(contentDir);
          if (
            contentStat &&
            cached.contentDirMtimeMs === contentStat.mtimeMs &&
            Array.isArray(cached.images)
          ) {
            return { contentDir, images: cached.images, cacheHit: true };
          }
        }
      } catch {
        // fall through to rebuild
      }
    }

    const { contentDir } = await findBestContentDir(finalDir);
    const images = await listEncryptedImagesRecursiveSorted(contentDir);
    const contentStat = await (async () => {
      try {
        return await fs.promises.stat(contentDir);
      } catch {
        return null;
      }
    })();

    writeLibraryIndexEntry(finalDir, vaultEnabled, {
      dirMtimeMs: dirMtimeMs ?? 0,
      contentDir,
      contentDirMtimeMs: contentStat?.mtimeMs ?? 0,
      images,
    });

    return { contentDir, images, cacheHit: false };
  }


  function normalizeGalleryId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/\d+/);
    return match ? match[0] : "";
  }



  function sanitizeSourceId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return null;
    if (!/^[a-z0-9._-]+$/.test(raw)) return null;
    return raw;
  }

  function synthesizeSourceIdentity(meta, normalizedSourceUrl) {
    const canonicalUrl = normalizeComparableUrl(normalizedSourceUrl);
    const sourceId = sanitizeSourceId(meta?.sourceId);
    const sourceScopedIdRaw = String(meta?.galleryId || "").trim();
    const sourceScopedId = sourceScopedIdRaw || null;
    if (!canonicalUrl && !sourceId && !sourceScopedId) return null;
    return {
      sourceId,
      canonicalUrl: canonicalUrl || null,
      sourceScopedId,
    };
  }
  function normalizeTagsInput(value) {
    if (!value) return [];
    return String(value)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function resolvePathInsideDir(baseDir, candidatePath) {
    const raw = String(candidatePath || "").trim();
    if (!raw) return null;
    const resolvedBase = path.resolve(baseDir);
    const resolvedCandidate = path.resolve(baseDir, raw);
    if (resolvedCandidate === resolvedBase) return null;
    const withSep = `${resolvedBase}${path.sep}`;
    if (!resolvedCandidate.startsWith(withSep)) return null;
    return resolvedCandidate;
  }

  async function buildComicEntry(finalDir, options = {}) {
    const includePerf = options?.includePerf === true;
    const perfStartedAt = process.hrtime.bigint();
    const perf = {
      decryptMetaMs: 0,
      decryptIndexMs: 0,
      statMs: 0,
      contentDataMs: 0,
      contentCacheHit: false,
      totalMs: 0,
    };

    const indexPath = path.join(finalDir, "index.json");
    const indexEncPath = path.join(finalDir, "index.json.enc");
    const metaEncPath = path.join(finalDir, "metadata.json.enc");
    const vaultEnabled = vaultManager.isInitialized();
    const vaultUnlocked = vaultManager.isUnlocked();
    let index = null;
    let meta = null;

    if (vaultEnabled && vaultUnlocked) {
      if (fs.existsSync(metaEncPath)) {
        try {
          const decryptMetaStartedAt = process.hrtime.bigint();
          const relPath = getVaultRelPath(path.join(finalDir, "metadata.json"));
          const decrypted = await vaultManager.decryptFileToBuffer({
            relPath,
            inputPath: metaEncPath,
          });
          meta = JSON.parse(decrypted.toString("utf8"));
          perf.decryptMetaMs += Number(process.hrtime.bigint() - decryptMetaStartedAt) / 1e6;
        } catch (err) {
          console.warn("[vault] failed to decrypt metadata:", String(err));
        }
      }
      if (fs.existsSync(indexEncPath)) {
        try {
          const decryptIndexStartedAt = process.hrtime.bigint();
          const relPath = getVaultRelPath(indexPath);
          const decrypted = vaultManager.decryptBufferWithKey({
            relPath,
            buffer: fs.readFileSync(indexEncPath),
          });
          index = JSON.parse(decrypted.toString("utf8"));
          perf.decryptIndexMs += Number(process.hrtime.bigint() - decryptIndexStartedAt) / 1e6;
        } catch (err) {
          console.warn("[vault] failed to decrypt index:", String(err));
        }
      }
    }

    const statStartedAt = process.hrtime.bigint();
    const stat = await (async () => {
      try {
        return await fs.promises.stat(finalDir);
      } catch {
        return null;
      }
    })();
    perf.statMs += Number(process.hrtime.bigint() - statStartedAt) / 1e6;

    const contentDataStartedAt = process.hrtime.bigint();
    const { contentDir, images, cacheHit } = await getComicContentData(finalDir, {
      vaultEnabled,
      dirStat: stat,
    });
    perf.contentDataMs += Number(process.hrtime.bigint() - contentDataStartedAt) / 1e6;
    perf.contentCacheHit = cacheHit === true;

    const availableImagePaths = new Set(images.map((encryptedPath) => encryptedPath.slice(0, -4)));
    const indexCoverCandidate = resolvePathInsideDir(finalDir, index?.cover);
    const coverFromIndex = indexCoverCandidate && availableImagePaths.has(indexCoverCandidate)
      ? indexCoverCandidate
      : null;
    const firstPagePath = images[0] ? images[0].slice(0, -4) : null;
    const fallbackCover = firstPagePath;
    const coverPath = coverFromIndex || fallbackCover || null;

    const titleFromMeta = meta?.comicName || meta?.title || index?.title || null;

    const normalizedSourceUrl = normalizeComparableUrl(meta?.sourceUrl);
    if (normalizedSourceUrl) {
      writeLibraryIndexEntry(finalDir, vaultEnabled, {
        sourceUrl: normalizedSourceUrl,
      });
    }

    const sourceIdentity = synthesizeSourceIdentity(meta, normalizedSourceUrl);

    const entry = {
      id: path.basename(finalDir),
      dir: finalDir,
      metaPath: fs.existsSync(metaEncPath) ? metaEncPath : null,

      title: titleFromMeta || path.basename(contentDir) || path.basename(finalDir),
      sourceUrl: normalizedSourceUrl || null,
      artist: meta?.artist || (Array.isArray(meta?.artists) ? meta.artists[0] : null) || null,
      galleryId: meta?.galleryId ? String(meta.galleryId).trim() : null,
      sourceIdentity,
      originSource: meta?.originSource || null,
      tags: Array.isArray(meta?.tags) ? meta.tags : [],
      parodies: Array.isArray(meta?.parodies) ? meta.parodies : [],
      characters: Array.isArray(meta?.characters) ? meta.characters : [],
      languages: Array.isArray(meta?.languages) ? meta.languages : [],
      favorite: meta?.favorite === true,

      pagesDeclared: meta?.pages ?? null,
      pagesFound: index?.pages ?? images.length,

      contentDir,
      coverPath,
      firstPagePath,

      savedAt: meta?.savedAt || meta?.capturedAt || null,
      publishedAt: meta?.publishedAt || meta?.publishedDate || null,
      note: typeof meta?.note === "string" ? meta.note : "",
      mtimeMs: stat?.mtimeMs ?? 0,
    };

    perf.totalMs = Number(process.hrtime.bigint() - perfStartedAt) / 1e6;
    if (includePerf) {
      entry.__perf = perf;
    }
    return entry;
  }

  return {
    buildComicEntry,
    deleteLibraryIndexEntry,
    isEncryptedImagePath,
    isImagePath,
    listEncryptedImagesRecursiveSorted,
    loadLibraryIndexCache,
    normalizeGalleryId,
    normalizeTagsInput,
    readLibraryIndexEntry,
    writeLibraryIndexEntry,
  };
}

module.exports = { createLibraryIndex };
