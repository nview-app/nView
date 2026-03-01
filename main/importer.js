const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { listFilesRecursive, naturalSort } = require("./utils");
const { INDEX_PAGE_META_VERSION, getImageMetadataFromBuffer, toSafeDimension } = require("./page_metadata");

// Keep this list aligned with movePlainDirectImagesToVault() supported source formats.
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_IMPORT_INDEX_JSON_BYTES = 5 * 1024 * 1024;
const IGNORED_ROOT_FOLDERS = new Set([
  "__macosx",
  "system volume information",
  "$recycle.bin",
]);

function summarizeError(err) {
  return `${err?.name || "Error"}${err?.code ? `:${err.code}` : ""}`;
}

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

function inspectImportIndexFile(folderPath, { parseJson = false } = {}) {
  const indexPath = path.join(path.resolve(String(folderPath || "")), "index.json");
  if (!fs.existsSync(indexPath)) {
    return {
      indexPath: null,
      ok: false,
      notFound: true,
      warning: null,
      error: "index.json not found.",
      value: null,
    };
  }

  try {
    const linkStats = fs.lstatSync(indexPath);
    if (linkStats.isSymbolicLink()) {
      return {
        indexPath,
        ok: false,
        notFound: false,
        warning: null,
        error: "index.json symbolic links are not allowed.",
        value: null,
      };
    }

    const stats = fs.statSync(indexPath);
    if (!stats.isFile()) {
      return {
        indexPath,
        ok: false,
        notFound: false,
        warning: null,
        error: "index.json is not a regular file.",
        value: null,
      };
    }

    if (stats.size > MAX_IMPORT_INDEX_JSON_BYTES) {
      return {
        indexPath,
        ok: false,
        notFound: false,
        warning: `index.json exceeds ${MAX_IMPORT_INDEX_JSON_BYTES} bytes and was ignored.`,
        error: "index.json exceeds size limit.",
        value: null,
      };
    }

    if (!parseJson) {
      return {
        indexPath,
        ok: true,
        notFound: false,
        warning: null,
        error: null,
        value: null,
      };
    }

    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        indexPath,
        ok: false,
        notFound: false,
        warning: null,
        error: "index.json must contain a JSON object at the top level.",
        value: null,
      };
    }

    return {
      indexPath,
      ok: true,
      notFound: false,
      warning: null,
      error: null,
      value: parsed,
    };
  } catch (err) {
    return {
      indexPath,
      ok: false,
      notFound: false,
      warning: null,
      error: `index.json parse failed: ${summarizeError(err)}`,
      value: null,
    };
  }
}

function scanCandidateIndexFile(folderPath) {
  const inspected = inspectImportIndexFile(folderPath, { parseJson: true });
  const indexWarnings = [];
  const indexErrors = [];

  if (inspected.notFound) {
    return {
      indexPath: null,
      indexSource: "none",
      indexWarnings,
      indexErrors,
    };
  }

  if (inspected.ok) {
    return {
      indexPath: inspected.indexPath,
      indexSource: "file",
      indexWarnings,
      indexErrors,
    };
  }

  if (inspected.warning) indexWarnings.push(inspected.warning);
  if (inspected.error && inspected.error !== "index.json exceeds size limit.") {
    indexErrors.push(inspected.error);
  }
  return {
    indexPath: inspected.indexPath,
    indexSource: "invalid",
    indexWarnings,
    indexErrors,
  };
}

function normalizeRelativeIndexPath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (!normalized || normalized === ".") return null;
  if (path.posix.isAbsolute(normalized)) return null;
  if (normalized.startsWith("../") || normalized === "..") return null;
  return normalized;
}

function sanitizeImportedPageScalars(entry = {}) {
  return {
    w: toSafeDimension(entry?.w),
    h: toSafeDimension(entry?.h),
    bytes: Number.isFinite(Number(entry?.bytes)) && Number(entry.bytes) > 0 ? Math.floor(Number(entry.bytes)) : null,
  };
}

function sanitizeImportedPageName(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed || "";
}

function sanitizeImportedPageMark(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 16);
}

function buildFallbackIndexOutput({ fallbackPageEntries, fallbackCover }) {
  const pageEntries = Array.isArray(fallbackPageEntries) ? fallbackPageEntries : [];
  const firstFile = pageEntries[0]?.file ? String(pageEntries[0].file) : null;
  return {
    cover: fallbackCover || firstFile || null,
    pages: pageEntries.length,
    pageMetaVersion: INDEX_PAGE_META_VERSION,
    pageEntries,
  };
}

function readImportIndexFile(folderPath) {
  const inspected = inspectImportIndexFile(folderPath, { parseJson: true });
  if (inspected.notFound) {
    return { ok: false, warnings: [], error: "index.json not found." };
  }

  if (!inspected.ok) {
    return {
      ok: false,
      warnings: inspected.warning ? [inspected.warning] : [],
      error: inspected.error || "index.json parse failed: Error",
    };
  }
  return { ok: true, warnings: [], value: inspected.value };
}

function normalizeImportedIndex({
  parsedIndex,
  movedEncryptedPaths,
  finalDir,
  fallbackPageEntries,
  fallbackCover,
}) {
  const warnings = [];
  const fallback = buildFallbackIndexOutput({ fallbackPageEntries, fallbackCover });

  if (!parsedIndex || typeof parsedIndex !== "object" || Array.isArray(parsedIndex)) {
    warnings.push("index.json has invalid top-level shape; used generated index.");
    return { usedImported: false, warnings, indexOutput: fallback };
  }

  const movedPaths = Array.isArray(movedEncryptedPaths) ? movedEncryptedPaths : [];
  if (movedPaths.length === 0) {
    warnings.push("no imported pages available for index normalization; used generated index.");
    return { usedImported: false, warnings, indexOutput: fallback };
  }

  const normalizedFinalDir = path.resolve(String(finalDir || ""));
  const authoritativePages = movedPaths
    .filter((encryptedPath) => {
      const absolutePath = path.resolve(String(encryptedPath || ""));
      if (!absolutePath.endsWith(".enc")) {
        warnings.push("ignored non-encrypted imported page path during index normalization.");
        return false;
      }
      if (!isSameOrChildPath(normalizedFinalDir, absolutePath)) {
        warnings.push("ignored imported page path outside final directory during index normalization.");
        return false;
      }
      return true;
    })
    .map((encryptedPath) => {
      const relativeEnc = path.relative(normalizedFinalDir, path.resolve(encryptedPath)).replaceAll("\\", "/");
      const relWithoutEnc = relativeEnc.endsWith(".enc") ? relativeEnc.slice(0, -4) : relativeEnc;
      return {
        file: path.basename(encryptedPath, ".enc"),
        rel: relWithoutEnc,
      };
    });

  if (authoritativePages.length === 0) {
    warnings.push("no valid imported pages available for index normalization; used generated index.");
    return { usedImported: false, warnings, indexOutput: fallback };
  }

  if (Object.hasOwn(parsedIndex, "pagePaths") && !Array.isArray(parsedIndex.pagePaths)) {
    warnings.push("ignored non-array pagePaths from index.json.");
  }
  if (Object.hasOwn(parsedIndex, "pageEntries") && !Array.isArray(parsedIndex.pageEntries)) {
    warnings.push("ignored non-array pageEntries from index.json.");
  }
  if (Object.hasOwn(parsedIndex, "cover") && parsedIndex.cover != null && typeof parsedIndex.cover !== "string") {
    warnings.push("ignored non-string cover from index.json.");
  }
  if (Object.hasOwn(parsedIndex, "title") && parsedIndex.title != null && typeof parsedIndex.title !== "string") {
    warnings.push("ignored non-string title from index.json.");
  }

  const relMap = new Map();
  const baseMap = new Map();
  for (const page of authoritativePages) {
    relMap.set(page.rel, page.file);
    const list = baseMap.get(page.file) || [];
    list.push(page.file);
    baseMap.set(page.file, list);
  }

  const resolveRefToFile = (sourceRef) => {
    const safeRef = normalizeRelativeIndexPath(sourceRef);
    if (!safeRef) return { file: null, unsafe: Boolean(sourceRef) };
    const byRel = relMap.get(safeRef);
    if (byRel) return { file: byRel, unsafe: false };
    const base = path.posix.basename(safeRef);
    const byBase = baseMap.get(base);
    if (byBase?.length === 1) return { file: byBase[0], unsafe: false };
    return { file: null, unsafe: false };
  };

  const normalizedEntriesByFile = new Map();
  const sourcePageEntries = Array.isArray(parsedIndex.pageEntries) ? parsedIndex.pageEntries : [];
  for (const pageEntry of sourcePageEntries) {
    if (!pageEntry || typeof pageEntry !== "object" || Array.isArray(pageEntry)) continue;
    const { file, unsafe } = resolveRefToFile(pageEntry.file);
    if (unsafe) warnings.push("ignored unsafe pageEntries file reference.");
    if (!file) continue;
    normalizedEntriesByFile.set(file, sanitizeImportedPageScalars(pageEntry));
  }

  const sourcePagePaths = Array.isArray(parsedIndex.pagePaths) ? parsedIndex.pagePaths : [];
  const resolvedPagePaths = [];
  for (const sourcePath of sourcePagePaths) {
    const { file, unsafe } = resolveRefToFile(sourcePath);
    if (unsafe) {
      warnings.push("ignored unsafe pagePaths entry.");
      continue;
    }
    if (file) resolvedPagePaths.push(file);
  }

  if (resolvedPagePaths.length > 0 && sourcePageEntries.length > 0) {
    const count = Math.min(resolvedPagePaths.length, sourcePageEntries.length);
    for (let idx = 0; idx < count; idx += 1) {
      const targetFile = resolvedPagePaths[idx];
      const pageEntry = sourcePageEntries[idx];
      if (!targetFile || normalizedEntriesByFile.has(targetFile)) continue;
      if (!pageEntry || typeof pageEntry !== "object" || Array.isArray(pageEntry)) continue;
      normalizedEntriesByFile.set(targetFile, sanitizeImportedPageScalars(pageEntry));
    }
  }

  const fallbackEntryMap = new Map(
    (Array.isArray(fallbackPageEntries) ? fallbackPageEntries : []).map((entry) => [String(entry?.file || ""), entry])
  );
  const pageEntries = authoritativePages.map((page) => {
    const fallbackEntry = fallbackEntryMap.get(page.file) || { file: page.file, w: null, h: null, bytes: null };
    const importedScalars = normalizedEntriesByFile.get(page.file) || {};
    return {
      ...fallbackEntry,
      file: page.file,
      w: importedScalars.w ?? fallbackEntry.w ?? null,
      h: importedScalars.h ?? fallbackEntry.h ?? null,
      bytes: importedScalars.bytes ?? fallbackEntry.bytes ?? null,
    };
  });

  const resolvedCover = (() => {
    const { file, unsafe } = resolveRefToFile(parsedIndex.cover);
    if (unsafe) warnings.push("ignored unsafe cover reference.");
    return file || fallbackCover || authoritativePages[0]?.file || null;
  })();

  const normalizedTitle = typeof parsedIndex.title === "string" ? normalizeString(parsedIndex.title) : "";

  const authoritativeNameSet = new Set(authoritativePages.map((page) => page.file));
  const normalizeNameRef = (value) => {
    const safeRef = normalizeRelativeIndexPath(value);
    if (!safeRef) return { file: null, unsafe: Boolean(value) };
    const fileName = path.posix.basename(safeRef);
    if (!fileName) return { file: null, unsafe: false };
    if (!authoritativeNameSet.has(fileName)) return { file: null, unsafe: false };
    return { file: fileName, unsafe: false };
  };

  const resolvedPageOrder = [];
  const orderedSeen = new Set();
  if (Object.hasOwn(parsedIndex, "pageOrder") && !Array.isArray(parsedIndex.pageOrder)) {
    warnings.push("ignored non-array pageOrder from index.json.");
  }
  if (Array.isArray(parsedIndex.pageOrder)) {
    for (const rawRef of parsedIndex.pageOrder) {
      const { file, unsafe } = normalizeNameRef(rawRef);
      if (unsafe) {
        warnings.push("ignored unsafe pageOrder entry.");
        continue;
      }
      if (!file || orderedSeen.has(file)) continue;
      orderedSeen.add(file);
      resolvedPageOrder.push(file);
    }
  }
  for (const { file } of authoritativePages) {
    if (orderedSeen.has(file)) continue;
    orderedSeen.add(file);
    resolvedPageOrder.push(file);
  }

  const resolvedPageMarks = {};
  if (Object.hasOwn(parsedIndex, "pageMarks") && (parsedIndex.pageMarks == null || typeof parsedIndex.pageMarks !== "object" || Array.isArray(parsedIndex.pageMarks))) {
    warnings.push("ignored invalid pageMarks map from index.json.");
  }
  if (parsedIndex.pageMarks && typeof parsedIndex.pageMarks === "object" && !Array.isArray(parsedIndex.pageMarks)) {
    for (const [rawRef, rawMark] of Object.entries(parsedIndex.pageMarks)) {
      const { file, unsafe } = normalizeNameRef(rawRef);
      if (unsafe) {
        warnings.push("ignored unsafe pageMarks key.");
        continue;
      }
      if (!file) continue;
      const mark = sanitizeImportedPageMark(rawMark);
      if (!mark) continue;
      resolvedPageMarks[file] = mark;
    }
  }

  const resolvedPageNames = {};
  if (Object.hasOwn(parsedIndex, "pageNames") && (parsedIndex.pageNames == null || typeof parsedIndex.pageNames !== "object" || Array.isArray(parsedIndex.pageNames))) {
    warnings.push("ignored invalid pageNames map from index.json.");
  }
  if (parsedIndex.pageNames && typeof parsedIndex.pageNames === "object" && !Array.isArray(parsedIndex.pageNames)) {
    for (const [rawRef, rawPageName] of Object.entries(parsedIndex.pageNames)) {
      const { file, unsafe } = normalizeNameRef(rawRef);
      if (unsafe) {
        warnings.push("ignored unsafe pageNames key.");
        continue;
      }
      if (!file) continue;
      const pageName = sanitizeImportedPageName(rawPageName);
      if (!pageName) continue;
      resolvedPageNames[file] = pageName;
    }
  }

  const indexOutput = {
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
    cover: resolvedCover,
    pages: authoritativePages.length,
    pageMetaVersion: INDEX_PAGE_META_VERSION,
    pageEntries,
    pageOrder: resolvedPageOrder,
    ...(Object.keys(resolvedPageMarks).length > 0 ? { pageMarks: resolvedPageMarks } : {}),
    ...(Object.keys(resolvedPageNames).length > 0 ? { pageNames: resolvedPageNames } : {}),
  };

  return {
    usedImported: true,
    warnings: Array.from(new Set(warnings)),
    indexOutput,
  };
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
          // Size is best-effort for preview payloads; avoid noisy per-file logging here.
          return 0;
        }
      })(),
    }));

  const metadataPath = path.join(folderPath, "metadata.json");
  const indexScan = scanCandidateIndexFile(folderPath);
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
    indexPath: indexScan.indexPath,
    indexSource: indexScan.indexSource,
    indexWarnings: indexScan.indexWarnings,
    indexErrors: indexScan.indexErrors,
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
      const importWarnings = [];
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
      const pageEntries = [];
      for (const encryptedPath of movedResult.encryptedPaths) {
        const relPath = getVaultRelPath(encryptedPath.slice(0, -4));
        const decryptedBuffer = await vaultManager.decryptFileToBuffer({ relPath, inputPath: encryptedPath });
        const fileStat = await fs.promises.stat(encryptedPath);
        const meta = getImageMetadataFromBuffer(decryptedBuffer);
        pageEntries.push({
          file: path.basename(encryptedPath, ".enc"),
          w: meta?.width ?? null,
          h: meta?.height ?? null,
          bytes: meta?.bytes ?? null,
          sourceMtimeMs: Math.floor(fileStat.mtimeMs || 0),
          sourceSize: Math.floor(fileStat.size || 0),
        });
      }
      const fallbackIndexOutput = {
        title: metaOutput.title,
        cover: firstImage,
        pages: movedResult.encryptedPaths.length,
        pageMetaVersion: INDEX_PAGE_META_VERSION,
        pageEntries,
        createdAt: metaOutput.savedAt,
      };

      let indexOutput = fallbackIndexOutput;
      const sourceIndexResult = readImportIndexFile(folderPath);
      if (sourceIndexResult.ok) {
        const normalizedIndexResult = normalizeImportedIndex({
          parsedIndex: sourceIndexResult.value,
          movedEncryptedPaths: movedResult.encryptedPaths,
          finalDir,
          fallbackPageEntries: pageEntries,
          fallbackCover: firstImage,
        });
        if (normalizedIndexResult.usedImported) {
          if (normalizedIndexResult.warnings.length > 0) {
            importWarnings.push(...normalizedIndexResult.warnings);
          }
          indexOutput = {
            ...normalizedIndexResult.indexOutput,
            title: metaOutput.title,
            createdAt: metaOutput.savedAt,
          };
        } else {
          importWarnings.push(...normalizedIndexResult.warnings);
        }
      } else if (sourceIndexResult.error !== "index.json not found.") {
        if (Array.isArray(sourceIndexResult.warnings) && sourceIndexResult.warnings.length > 0) {
          importWarnings.push(...sourceIndexResult.warnings);
        }
        importWarnings.push(sourceIndexResult.error);
      }

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
        finalDir,
        status: "imported",
        message: `Imported to ${path.basename(finalDir)}.`,
        ...(importWarnings.length > 0 ? { warnings: importWarnings } : {}),
      });
      if (typeof onProgress === "function") {
        onProgress({ total: items.length, completed: imported + skipped + failed, current: index + 1, key: String(item?.key || ""), folderPath, status: "imported", message: `Imported to ${path.basename(finalDir)}.` });
      }
    } catch (err) {
      if (finalDir && fs.existsSync(finalDir)) {
        try {
          fs.rmSync(finalDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.warn("[importer] failed to clean partially imported directory", summarizeError(cleanupErr));
        }
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
  MAX_IMPORT_INDEX_JSON_BYTES,
  candidateStatus,
  importLibraryCandidates,
  isImagePath,
  normalizeImportItemsPayload,
  normalizeImportedIndex,
  readImportIndexFile,
  sanitizeMetadata,
  scanImportRoot,
  scanSingleManga,
  shouldIgnoreRootEntry,
};
