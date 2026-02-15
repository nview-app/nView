const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { listFilesRecursive, naturalSort } = require("./utils");

// Keep this list aligned with movePlainDirectImagesToVault() supported source formats.
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const IGNORED_ROOT_FOLDERS = new Set([
  "__macosx",
  "system volume information",
  "$recycle.bin",
]);

function isImagePath(filePath) {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase());
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function sanitizeMetadata(input, fallbackTitle) {
  const source = input && typeof input === "object" ? input : {};
  const title = normalizeString(source.comicName || source.title || fallbackTitle);
  const artist = normalizeString(source.artist || source.author || source.artists?.[0] || "");
  const language = normalizeString(source.language || source.languages?.[0] || "");
  const tags = normalizeArray(source.tags);
  const pagesRaw = Number(source.pages);

  return {
    ...source,
    title,
    comicName: title,
    artist,
    language,
    tags,
    pages: Number.isFinite(pagesRaw) && pagesRaw > 0 ? Math.floor(pagesRaw) : null,
  };
}

function candidateStatus({ imageCount, metadataSource, metadataErrors, metadata }) {
  if (imageCount === 0) return "no_images";
  if (metadataErrors.length > 0) return "metadata_error";
  if (metadataSource === "template" && !normalizeString(metadata?.title)) return "needs_metadata";
  if (!normalizeString(metadata?.title)) return "needs_metadata";
  return "ready";
}

function createCandidateKey(folderPath) {
  return crypto.createHash("sha1").update(path.resolve(folderPath)).digest("hex");
}

function shouldIgnoreRootEntry(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith(".")) return true;
  return IGNORED_ROOT_FOLDERS.has(normalized);
}

function isSameOrChildPath(rootPath, candidatePath) {
  const root = path.resolve(String(rootPath || ""));
  const candidate = path.resolve(String(candidatePath || ""));
  if (!root || !candidate) return false;
  const relative = path.relative(root, candidate);
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeImportItemsPayload(payload = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const rootPath = String(payload?.rootPath || "").trim();
  if (!rootPath) return { items };

  const resolvedRoot = path.resolve(rootPath);
  for (const item of items) {
    const folderPath = path.resolve(String(item?.folderPath || ""));
    if (!isSameOrChildPath(resolvedRoot, folderPath)) {
      throw new Error(`Import item is outside selected root: ${folderPath}`);
    }
  }

  return { rootPath: resolvedRoot, items };
}

async function listFilesInFolderOnly(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(folderPath, entry.name));
}

async function scanMangaFolder(folderPath, folderName, options = {}) {
  const includeSubfolders = options?.includeSubfolders !== false;
  const allFiles = includeSubfolders
    ? await listFilesRecursive(folderPath)
    : await listFilesInFolderOnly(folderPath);
  const imageFiles = allFiles
    .filter((filePath) => isImagePath(filePath))
    .sort((a, b) => naturalSort(path.basename(a), path.basename(b)))
    .map((filePath) => ({
      relPath: path.relative(folderPath, filePath).replaceAll("\\", "/"),
      size: (() => {
        try {
          return fs.statSync(filePath).size;
        } catch {
          return 0;
        }
      })(),
    }));

  const metadataPath = path.join(folderPath, "metadata.json");
  const errors = [];
  const warnings = [];
  let metadataSource = "template";
  let metadataPayload = null;

  if (fs.existsSync(metadataPath)) {
    try {
      const raw = fs.readFileSync(metadataPath, "utf8");
      const parsed = JSON.parse(raw);
      metadataPayload = sanitizeMetadata(parsed, folderName);
      metadataSource = "file";
      if (!normalizeString(parsed?.title || parsed?.comicName)) {
        warnings.push("metadata.json missing title; using folder name.");
      }
    } catch (err) {
      errors.push(`metadata.json parse failed: ${String(err)}`);
      metadataPayload = sanitizeMetadata({}, folderName);
      metadataSource = "template";
    }
  } else {
    metadataPayload = sanitizeMetadata({}, folderName);
    warnings.push("metadata.json not found; using template values.");
  }

  const status = candidateStatus({
    imageCount: imageFiles.length,
    metadataSource,
    metadataErrors: errors,
    metadata: metadataPayload,
  });

  return {
    key: createCandidateKey(folderPath),
    folderPath,
    folderName,
    imageFiles,
    metadataPath: fs.existsSync(metadataPath) ? metadataPath : null,
    metadataSource,
    metadata: metadataPayload,
    status,
    warnings,
    errors,
  };
}

async function scanImportRoot(rootPath) {
  const resolvedRoot = path.resolve(String(rootPath || ""));
  const entries = await fs.promises.readdir(resolvedRoot, { withFileTypes: true });
  const sortedEntries = entries.slice().sort((a, b) => naturalSort(a.name || "", b.name || ""));
  const candidates = [];

  for (const entry of sortedEntries) {
    if (!entry.isDirectory()) continue;
    if (shouldIgnoreRootEntry(entry.name)) continue;

    const folderPath = path.join(resolvedRoot, entry.name);
    candidates.push(await scanMangaFolder(folderPath, entry.name));
  }

  return {
    rootPath: resolvedRoot,
    candidates,
  };
}

async function scanSingleManga(folderPath) {
  const resolvedFolder = path.resolve(String(folderPath || ""));
  const stats = await fs.promises.stat(resolvedFolder);
  if (!stats.isDirectory()) {
    throw new Error("Selected path is not a folder.");
  }

  return {
    rootPath: resolvedFolder,
    candidates: [await scanMangaFolder(resolvedFolder, path.basename(resolvedFolder), { includeSubfolders: false })],
  };
}

function createComicDir(libraryRoot) {
  const id = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  return path.join(libraryRoot, `comic_${id}`);
}

async function importLibraryCandidates({
  items,
  libraryRoot,
  vaultManager,
  getVaultRelPath,
  movePlainDirectImagesToVault,
  normalizeGalleryId,
  writeLibraryIndexEntry,
  onProgress,
}) {
  const results = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const folderPath = path.resolve(String(item?.folderPath || ""));
    if (typeof onProgress === "function") {
      onProgress({
        total: items.length,
        completed: imported + skipped + failed,
        current: index + 1,
        key: String(item?.key || ""),
        folderPath,
        status: "running",
      });
    }
    const metadata = sanitizeMetadata(item?.metadata || {}, path.basename(folderPath));

    if (!folderPath || !fs.existsSync(folderPath)) {
      failed += 1;
      results.push({
        key: String(item?.key || ""),
        folderPath,
        status: "failed",
        message: "Source folder does not exist.",
      });
      if (typeof onProgress === "function") {
        onProgress({ total: items.length, completed: imported + skipped + failed, current: index + 1, key: String(item?.key || ""), folderPath, status: "failed", message: "Source folder does not exist." });
      }
      continue;
    }

    if (!metadata.title) {
      skipped += 1;
      results.push({
        key: String(item?.key || ""),
        folderPath,
        status: "skipped",
        message: "Missing required metadata field: title.",
      });
      if (typeof onProgress === "function") {
        onProgress({ total: items.length, completed: imported + skipped + failed, current: index + 1, key: String(item?.key || ""), folderPath, status: "skipped", message: "Missing required metadata field: title." });
      }
      continue;
    }

    let finalDir = "";
    try {
      const sourceFiles = (await listFilesRecursive(folderPath)).filter((filePath) => isImagePath(filePath));
      if (sourceFiles.length === 0) {
        skipped += 1;
        results.push({
          key: String(item?.key || ""),
          folderPath,
          status: "skipped",
          message: "No image files found.",
        });
        if (typeof onProgress === "function") {
          onProgress({ total: items.length, completed: imported + skipped + failed, current: index + 1, key: String(item?.key || ""), folderPath, status: "skipped", message: "No image files found." });
        }
        continue;
      }

      finalDir = createComicDir(libraryRoot);
      fs.mkdirSync(finalDir, { recursive: true });

      const movedResult = await movePlainDirectImagesToVault({
        inDir: folderPath,
        outDir: finalDir,
        deleteOriginals: false,
        onlyFiles: sourceFiles,
        flatten: true,
        concurrency: 1,
      });

      if (!movedResult.moved || !Array.isArray(movedResult.encryptedPaths) || movedResult.encryptedPaths.length === 0) {
        throw new Error("Failed to encrypt and copy image files.");
      }

      const metaOutput = {
        ...metadata,
        title: metadata.title,
        comicName: metadata.title,
        language: metadata.language,
        languages: metadata.language ? [metadata.language] : [],
        importSource: "library_import",
        originSource: "importer",
        importedFrom: folderPath,
        finalDir,
        savedAt: new Date().toISOString(),
      };

      const metadataPath = path.join(finalDir, "metadata.json");
      const metadataRelPath = getVaultRelPath(metadataPath);
      const encryptedMeta = vaultManager.encryptBufferWithKey({
        relPath: metadataRelPath,
        buffer: Buffer.from(JSON.stringify(metaOutput, null, 2), "utf8"),
      });
      fs.writeFileSync(path.join(finalDir, "metadata.json.enc"), encryptedMeta);

      const firstImage = movedResult.encryptedPaths[0]
        ? path.basename(movedResult.encryptedPaths[0], ".enc")
        : null;
      const indexOutput = {
        title: metaOutput.title,
        cover: firstImage,
        pages: movedResult.encryptedPaths.length,
        createdAt: metaOutput.savedAt,
      };

      const indexPath = path.join(finalDir, "index.json");
      const indexRelPath = getVaultRelPath(indexPath);
      const encryptedIndex = vaultManager.encryptBufferWithKey({
        relPath: indexRelPath,
        buffer: Buffer.from(JSON.stringify(indexOutput, null, 2), "utf8"),
      });
      fs.writeFileSync(path.join(finalDir, "index.json.enc"), encryptedIndex);

      if (metaOutput.galleryId) {
        writeLibraryIndexEntry(finalDir, true, { galleryId: normalizeGalleryId(metaOutput.galleryId) });
      }

      imported += 1;
      results.push({
        key: String(item?.key || ""),
        folderPath,
        status: "imported",
        message: `Imported to ${path.basename(finalDir)}.`,
      });
      if (typeof onProgress === "function") {
        onProgress({ total: items.length, completed: imported + skipped + failed, current: index + 1, key: String(item?.key || ""), folderPath, status: "imported", message: `Imported to ${path.basename(finalDir)}.` });
      }
    } catch (err) {
      if (finalDir && fs.existsSync(finalDir)) {
        try {
          fs.rmSync(finalDir, { recursive: true, force: true });
        } catch {}
      }
      failed += 1;
      results.push({
        key: String(item?.key || ""),
        folderPath,
        status: "failed",
        message: String(err),
      });
      if (typeof onProgress === "function") {
        onProgress({ total: items.length, completed: imported + skipped + failed, current: index + 1, key: String(item?.key || ""), folderPath, status: "failed", message: String(err) });
      }
    }
  }

  return { imported, skipped, failed, results };
}

module.exports = {
  IMAGE_EXTS,
  candidateStatus,
  importLibraryCandidates,
  isImagePath,
  normalizeImportItemsPayload,
  sanitizeMetadata,
  scanImportRoot,
  scanSingleManga,
  shouldIgnoreRootEntry,
};
