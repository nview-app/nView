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
    if (next.galleryId) {
      delete next.sourceUrlHash;
      delete next.sourceUrl;
    }
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

  function normalizeTagsInput(value) {
    if (!value) return [];
    return String(value)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  async function buildComicEntry(finalDir) {
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
          const relPath = getVaultRelPath(path.join(finalDir, "metadata.json"));
          const decrypted = await vaultManager.decryptFileToBuffer({
            relPath,
            inputPath: metaEncPath,
          });
          meta = JSON.parse(decrypted.toString("utf8"));
        } catch (err) {
          console.warn("[vault] failed to decrypt metadata:", String(err));
        }
      }
      if (fs.existsSync(indexEncPath)) {
        try {
          const relPath = getVaultRelPath(indexPath);
          const decrypted = vaultManager.decryptBufferWithKey({
            relPath,
            buffer: fs.readFileSync(indexEncPath),
          });
          index = JSON.parse(decrypted.toString("utf8"));
        } catch (err) {
          console.warn("[vault] failed to decrypt index:", String(err));
        }
      }
    }

    const stat = await (async () => {
      try {
        return await fs.promises.stat(finalDir);
      } catch {
        return null;
      }
    })();

    const { contentDir, images } = await getComicContentData(finalDir, {
      vaultEnabled,
      dirStat: stat,
    });

    const coverFromIndex = index?.cover ? path.join(finalDir, index.cover) : null;
    const fallbackCover = images[0] ? images[0].slice(0, -4) : null;
    const coverPath = coverFromIndex || fallbackCover || null;

    const titleFromMeta = meta?.comicName || meta?.title || index?.title || null;

    if (meta?.galleryId) {
      writeLibraryIndexEntry(finalDir, vaultEnabled, {
        galleryId: normalizeGalleryId(meta.galleryId),
      });
    }

    return {
      id: path.basename(finalDir),
      dir: finalDir,
      metaPath: fs.existsSync(metaEncPath) ? metaEncPath : null,

      title: titleFromMeta || path.basename(contentDir) || path.basename(finalDir),
      artist: meta?.artist || (Array.isArray(meta?.artists) ? meta.artists[0] : null) || null,
      tags: Array.isArray(meta?.tags) ? meta.tags : [],
      favorite: meta?.favorite === true,

      pagesDeclared: meta?.pages ?? null,
      pagesFound: index?.pages ?? images.length,

      contentDir,
      coverPath,

      savedAt: meta?.savedAt || meta?.capturedAt || null,
      mtimeMs: stat?.mtimeMs ?? 0,
    };
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
