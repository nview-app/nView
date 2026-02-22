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

    const images = await listEncryptedImagesRecursiveSorted(entry.contentDir);
    const pagePaths = [];
    for (const encryptedImagePath of images) {
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
    await fs.promises.writeFile(
      path.join(outputPath, "index.json"),
      `${JSON.stringify({ title: metadata?.comicName || metadata?.title || entry.title, pages: pagePaths.length, pagePaths }, null, 2)}\n`,
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
