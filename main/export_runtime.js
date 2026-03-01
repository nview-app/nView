function createExportRuntime({
  fs,
  path,
  LIBRARY_ROOT,
  buildComicEntry,
  listEncryptedImagesRecursiveSorted,
  summarizeError,
  resolveUniquePath,
  sanitizeExportName,
  getVaultRelPath,
  vaultManager,
}) {
  function normalizeIndexFileName(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const baseName = path.basename(trimmed.replaceAll("\\", "/"));
    return baseName || null;
  }

  function sanitizeExportPageOrder(value, knownNames) {
    if (!Array.isArray(value)) return [];
    const allowed = knownNames instanceof Set ? knownNames : null;
    const dedupe = new Set();
    const ordered = [];
    for (const item of value) {
      const normalized = normalizeIndexFileName(item);
      if (!normalized) continue;
      if (allowed && !allowed.has(normalized)) continue;
      if (dedupe.has(normalized)) continue;
      dedupe.add(normalized);
      ordered.push(normalized);
    }
    return ordered;
  }

  function sanitizeExportPageMap(value, knownNames) {
    const out = {};
    if (!value || typeof value !== "object") return out;
    const allowed = knownNames instanceof Set ? knownNames : null;
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const fileName = normalizeIndexFileName(rawKey);
      if (!fileName) continue;
      if (allowed && !allowed.has(fileName)) continue;
      if (typeof rawValue !== "string") continue;
      const normalizedValue = rawValue.trim();
      if (!normalizedValue) continue;
      out[fileName] = normalizedValue;
    }
    return out;
  }

  async function readStoredIndexPayload(entry) {
    const indexPath = path.join(entry.dir, "index.json");
    const indexEncPath = `${indexPath}.enc`;
    try {
      const decrypted = await vaultManager.decryptFileToBuffer({
        relPath: getVaultRelPath(indexPath),
        inputPath: indexEncPath,
      });
      const parsed = JSON.parse(decrypted.toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    } catch (err) {
      if (err?.code === "ENOENT") return {};
      throw err;
    }
  }

  async function listLibraryEntriesForExport() {
    let dirs = [];
    try {
      dirs = (await fs.promises.readdir(LIBRARY_ROOT(), { withFileTypes: true }))
        .filter((d) => d.isDirectory() && d.name.startsWith("comic_"))
        .map((d) => path.join(LIBRARY_ROOT(), d.name));
    } catch {
      dirs = [];
    }
    return Promise.all(dirs.map((dir) => buildComicEntry(dir)));
  }

  async function estimateExportBytes(entries) {
    let totalBytes = 0;
    for (const entry of entries) {
      if (!entry?.contentDir || !entry?.dir) continue;
      const images = await listEncryptedImagesRecursiveSorted(entry.contentDir);
      for (const encryptedPath of images) {
        try {
          totalBytes += Number((await fs.promises.stat(encryptedPath)).size || 0);
        } catch (err) {
          console.warn("[export] failed to stat encrypted image for export estimate", summarizeError(err));
        }
      }
      for (const supportFile of ["metadata.json.enc", "index.json.enc"]) {
        const supportPath = path.join(entry.dir, supportFile);
        try {
          totalBytes += Number((await fs.promises.stat(supportPath)).size || 0);
        } catch (err) {
          console.warn("[export] failed to stat support file for export estimate", summarizeError(err));
        }
      }
    }
    return totalBytes;
  }

  async function exportSingleManga({ entry, destinationPath }) {
    const title = String(entry?.title || entry?.id || "Untitled");
    const outputPath = resolveUniquePath(destinationPath, sanitizeExportName(title));
    await fs.promises.mkdir(outputPath, { recursive: true });

    const metadataEncPath = path.join(entry.dir, "metadata.json.enc");
    let metadata = {
      title: entry.title,
      artist: entry.artist,
      tags: entry.tags,
      languages: entry.languages,
      pages: entry.pagesFound,
    };
    try {
      const relPath = getVaultRelPath(path.join(entry.dir, "metadata.json"));
      const decrypted = await vaultManager.decryptFileToBuffer({
        relPath,
        inputPath: metadataEncPath,
      });
      metadata = JSON.parse(decrypted.toString("utf8"));
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }

    const storedIndex = await readStoredIndexPayload(entry);
    const images = await listEncryptedImagesRecursiveSorted(entry.contentDir);
    const encryptedByName = new Map(images.map((encryptedPath) => [path.basename(encryptedPath, ".enc"), encryptedPath]));
    const knownNames = new Set(encryptedByName.keys());
    const preferredOrder = sanitizeExportPageOrder(storedIndex?.pageOrder, knownNames);
    const orderedImages = [];
    const consumed = new Set();
    for (const fileName of preferredOrder) {
      const encryptedPath = encryptedByName.get(fileName);
      if (!encryptedPath) continue;
      orderedImages.push(encryptedPath);
      consumed.add(fileName);
    }
    for (const encryptedPath of images) {
      const fileName = path.basename(encryptedPath, ".enc");
      if (consumed.has(fileName)) continue;
      orderedImages.push(encryptedPath);
    }

    const pagePaths = [];
    for (const encryptedImagePath of orderedImages) {
      const imagePath = encryptedImagePath.slice(0, -4);
      const relPath = path.relative(entry.contentDir, imagePath);
      const outputImagePath = path.join(outputPath, relPath);
      await fs.promises.mkdir(path.dirname(outputImagePath), { recursive: true });
      const decrypted = await vaultManager.decryptFileToBuffer({
        relPath: getVaultRelPath(imagePath),
        inputPath: encryptedImagePath,
      });
      await fs.promises.writeFile(outputImagePath, decrypted);
      pagePaths.push(relPath.replaceAll("\\", "/"));
    }

    await fs.promises.writeFile(
      path.join(outputPath, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );

    const pageMarks = sanitizeExportPageMap(storedIndex?.pageMarks, knownNames);
    const pageNames = sanitizeExportPageMap(storedIndex?.pageNames, knownNames);
    const safePageOrder = sanitizeExportPageOrder(storedIndex?.pageOrder, knownNames);
    const indexOutput = {
      title: metadata?.comicName || metadata?.title || entry.title,
      pages: pagePaths.length,
      pagePaths,
      ...(safePageOrder.length > 0 ? { pageOrder: safePageOrder } : {}),
      ...(Object.keys(pageMarks).length > 0 ? { pageMarks } : {}),
      ...(Object.keys(pageNames).length > 0 ? { pageNames } : {}),
    };

    await fs.promises.writeFile(
      path.join(outputPath, "index.json"),
      `${JSON.stringify(indexOutput, null, 2)}\n`,
      "utf8",
    );

    return outputPath;
  }

  return {
    listLibraryEntriesForExport,
    estimateExportBytes,
    exportSingleManga,
  };
}

module.exports = {
  createExportRuntime,
};
