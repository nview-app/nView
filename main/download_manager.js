const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const fsp = fs.promises;
const { INDEX_PAGE_META_VERSION, getImageMetadataFromBuffer } = require("./page_metadata");

async function pathExists(targetPath) {
  if (!targetPath) return false;
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("[download-manager] pathExists: access failed", summarizeError(err));
    }
    return false;
  }
}

async function atomicWriteFile(outputPath, data) {
  const tempPath = `${outputPath}.tmp`;
  await fsp.writeFile(tempPath, data);
  await fsp.rename(tempPath, outputPath);
}

function directImageExt(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname || "").toLowerCase();
    if (ext) return ext;
  } catch (err) {
    console.warn("[download-manager] directImageExt: invalid URL", summarizeError(err));
    // Intentionally ignore malformed URLs and fall back to a safe extension.
  }
  return ".jpg";
}

function stripDoubleExtension(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname || "");
    if (!ext) return "";
    const withoutExt = u.pathname.slice(0, -ext.length);
    const prevExt = path.extname(withoutExt);
    if (!prevExt) return "";
    u.pathname = withoutExt;
    return u.toString();
  } catch (err) {
    console.warn("[download-manager] stripDoubleExtension: invalid URL", summarizeError(err));
    return "";
  }
}

const RETRYABLE_MOVE_ERROR_CODES = new Set(["EBADF", "EIO", "ENOENT", "ENOMETA"]);
const RETRYABLE_MOVE_ERROR_HINTS = ["EBADF", "bad file descriptor", "Missing encryption metadata"];

function isRetryableMoveFailure(entry) {
  if (!entry) return false;
  if (RETRYABLE_MOVE_ERROR_CODES.has(entry.code)) return true;
  const message = String(entry.message || "");
  return RETRYABLE_MOVE_ERROR_HINTS.some((hint) => message.includes(hint));
}

function isImageTempFile(name) {
  const ext = path.extname(name).toLowerCase();
  return ext === ".webp" || ext === ".png" || ext === ".jpg" || ext === ".jpeg";
}

function deriveJobName(meta, fallback = "") {
  return meta?.comicName || meta?.galleryId || fallback || "";
}

function summarizeError(err) {
  return `${err?.name || "Error"}${err?.code ? `:${err.code}` : ""}`;
}

function createDownloadManager({
  LIBRARY_ROOT,
  DELETE_ON_FAIL,
  ensureDirs,
  delay,
  listTempDirs,
  readTempEncryptionInfo,
  purgeFolderBestEffort,
  registerPendingCleanup,
  registerPendingFileCleanup,
  runPendingCleanupSweep,
  runPendingFileCleanupSweep,
  tryDeleteFileWithRetries,
  moveEncryptedDirectImagesToVault,
  movePlainDirectImagesToVault,
  hasPlainImageFiles,
  directEncryptedMetaPath,
  writeDirectEncryptedMeta,
  encryptStreamToFile,
  DIRECT_ENCRYPTION_VERSION,
  getVaultRelPath,
  vaultManager,
  normalizeGalleryId,
  writeLibraryIndexEntry,
  sendToDownloader,
  sendToGallery,
  buildComicEntry,
}) {
  class DownloadManager {
    constructor() {
      this.jobs = new Map();
      this.seq = 1;
    }

    compactJob(job) {
      if (!job) return job;
      const compacted = {
        id: job.id,
        name: job.name,
        status: job.status,
        message: job.message,
        progress: job.progress,
        downloaded: job.downloaded,
        total: job.total,
        downloadSpeed: "",
        uploadSpeed: "",
        createdAt: job.createdAt,
        finalDir: job.finalDir,
      };
      this.jobs.set(job.id, compacted);
      return compacted;
    }

    async recoverEncryptedTempData() {
      const tempDirs = await listTempDirs(LIBRARY_ROOT());
      if (tempDirs.length === 0) return;

      const jobByTemp = new Map();
      for (const job of this.jobs.values()) {
        if (job.tempDir) jobByTemp.set(path.resolve(job.tempDir), job);
      }

      let changedState = false;
      for (const tempDir of tempDirs) {
        const resolvedTemp = path.resolve(tempDir);
        const job = jobByTemp.get(resolvedTemp);
        const encryption = await readTempEncryptionInfo(tempDir);
        if (job) {
          if (!job.encryption && encryption) {
            job.encryption = encryption;
            changedState = true;
          }
          if (job.status === "completed" || job.status === "failed") {
            const res = await purgeFolderBestEffort(tempDir);
            if (!res.ok && await pathExists(tempDir)) registerPendingCleanup(tempDir);
          }
          continue;
        }

        if (encryption) {
          const res = await purgeFolderBestEffort(tempDir);
          if (!res.ok && await pathExists(tempDir)) registerPendingCleanup(tempDir);
          continue;
        }

        const res = await purgeFolderBestEffort(tempDir);
        if (!res.ok && await pathExists(tempDir)) registerPendingCleanup(tempDir);
      }

      if (changedState) this.scheduleSave();
    }

    scheduleSave() {}

    flushSave() {}

    async resumeJobs() {
      const activeStatuses = new Set(["starting", "downloading"]);
      const finalizationStatuses = new Set(["finalizing", "moving", "cleaning"]);

      for (const job of this.jobs.values()) {
        if (job.status === "completed" || job.status === "failed") continue;

        if (job.postProcessed || finalizationStatuses.has(job.status)) {
          if (!job.tempDir || !await pathExists(job.tempDir)) {
            job.status = "failed";
            job.message = "Resume failed: temp directory missing.";
            this.pushUpdate(job);
            continue;
          }

          job.postProcessed = true;
          job.status = "finalizing";
          job.message = "Resuming finalization after restart…";
          this.pushUpdate(job);

          this.postDownloadPipeline(job, { note: "Resumed after restart" }).catch((err) => {
            job.status = "failed";
            job.message = `Resume failed: ${String(err)}`;
            this.pushUpdate(job);
          });
          continue;
        }

        if (!Array.isArray(job.directUrls) || job.directUrls.length === 0) {
          const vaultEnabled = vaultManager.isInitialized();
          const vaultUnlocked = vaultManager.isUnlocked();
          if (!vaultEnabled) {
            job.status = "stopped";
            job.message = "Resume paused: Vault Mode is required. Set a passphrase to continue.";
            this.pushUpdate(job);
            continue;
          }
          if (!vaultUnlocked) {
            job.status = "stopped";
            job.message = "Resume paused: unlock Vault to restore download state.";
            this.pushUpdate(job);
            continue;
          }
          job.status = "failed";
          job.message = "Resume failed: missing image list.";
          this.pushUpdate(job);
          continue;
        }

        if (!job.tempDir || !await pathExists(job.tempDir)) {
          job.status = "failed";
          job.message = "Resume failed: temp directory missing.";
          this.pushUpdate(job);
          continue;
        }

        if (!activeStatuses.has(job.status)) continue;

        job.postProcessed = false;
        job.status = "starting";
        job.message = "Resuming direct download…";
        this.pushUpdate(job);

        this.startDirectJob(job).catch((err) => {
          job.status = "failed";
          job.message = `Resume failed: ${String(err)}`;
          this.pushUpdate(job);
        });
      }
    }

    listJobs() {
      return Array.from(this.jobs.values()).map((j) => this.publicJob(j));
    }

    clearCompletedJobs() {
      let removed = 0;
      for (const [jobId, job] of this.jobs.entries()) {
        if (job.status !== "completed") continue;
        this.jobs.delete(jobId);
        sendToDownloader("dl:remove", { id: jobId });
        removed += 1;
      }
      if (removed) this.scheduleSave();
      return { ok: true, removed };
    }

    hasActiveDownloads() {
      for (const job of this.jobs.values()) {
        if (job.status !== "completed" && job.status !== "failed") return true;
      }
      return false;
    }

    hasInProgressDownloads() {
      const activeStatuses = new Set([
        "starting",
        "downloading",
        "finalizing",
        "moving",
        "cleaning",
      ]);
      for (const job of this.jobs.values()) {
        if (activeStatuses.has(job.status)) return true;
      }
      return false;
    }

    publicJob(j) {
      return {
        id: j.id,
        name: j.name || "(loading…)",
        status: j.status,
        message: j.message || "",
        tempDir: j.tempDir,
        finalDir: j.finalDir,
        progress: j.progress ?? 0,
        downloaded: j.downloaded || "",
        total: j.total || "",
        downloadSpeed: j.downloadSpeed || "",
        uploadSpeed: j.uploadSpeed || "",
        createdAt: j.createdAt,

        metaCaptured: !!j.meta,
        metaPath: j.metaPath || null,
      };
    }

    pushUpdate(job) {
      sendToDownloader("dl:update", this.publicJob(job));
      this.scheduleSave();
    }

    pushRemove(jobId) {
      sendToDownloader("dl:remove", { id: jobId });
      this.scheduleSave();
    }

    async notifyLibraryChanged(comicDir = "") {
      const normalizedDir = String(comicDir || "").trim();
      if (normalizedDir && typeof buildComicEntry === "function") {
        try {
          const entry = await buildComicEntry(normalizedDir);
          sendToGallery("library:changed", {
            at: Date.now(),
            action: "update",
            comicDir: normalizedDir,
            entry,
            reason: "download-complete",
          });
          return;
        } catch (err) {
          console.warn("[download-manager] notifyLibraryChanged: buildComicEntry failed", summarizeError(err));
        }
      }
      sendToGallery("library:changed", { at: Date.now() });
    }

    async addDirectDownload({ imageUrls, meta, requestHeaders } = {}) {
      ensureDirs();

      const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
      if (urls.length === 0) {
        return { ok: false, error: "No images found for alternate download." };
      }

      const id = String(this.seq++);
      const tempDir = path.join(LIBRARY_ROOT(), `tmp_${Date.now()}_${id}`);
      const finalDir = path.join(LIBRARY_ROOT(), `comic_${Date.now()}_${id}`);

      await fsp.mkdir(tempDir, { recursive: true });
      await fsp.mkdir(finalDir, { recursive: true });

      const job = {
        id,
        tempDir,
        finalDir,

        status: "starting",
        message: "Starting direct download…",
        createdAt: Date.now(),

        postProcessed: false,

        progress: 0,
        downloaded: "",
        total: "",
        downloadSpeed: "",
        uploadSpeed: "",
        name: deriveJobName(meta, "Direct download"),

        meta: meta || null,
        metaPath: null,

        directUrls: urls,
        directIndex: 0,
        directSkipped: 0,
        directAbortController: null,
        directStopRequested: false,
        directHeaders: requestHeaders || null,
        directExts: Array.isArray(urls) ? new Array(urls.length).fill(null) : null,
      };

      this.jobs.set(id, job);
      this.pushUpdate(job);
      this.scheduleSave();

      await this.startDirectJob(job);
      return { ok: true, id };
    }

    directImagePath(job, index, overrideUrl) {
      const total = Array.isArray(job.directUrls) ? job.directUrls.length : 0;
      const url = overrideUrl ?? job.directUrls?.[index] ?? "";
      const ext = job.directExts?.[index] || directImageExt(url);
      const filename = directImageFilename(index, total, ext);
      return path.join(job.tempDir, filename);
    }

    async cleanupDirectTempFiles(filePath) {
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        if (err?.code !== "ENOENT") {
          console.warn("[download-manager] cleanupDirectTempFiles: failed to remove temp image", summarizeError(err));
        }
      }
      try {
        const metaPath = directEncryptedMetaPath(filePath);
        if (await pathExists(metaPath)) await fsp.unlink(metaPath);
        const backupPath = `${metaPath}.bak`;
        if (await pathExists(backupPath)) await fsp.unlink(backupPath);
      } catch (err) {
        console.warn("[download-manager] cleanupDirectTempFiles: failed to remove temp metadata", summarizeError(err));
      }
    }

    async downloadDirectPage(job, index, { overwrite = false } = {}) {
      const url = job.directUrls[index];
      if (!url) throw new Error(`Missing direct URL for index ${index + 1}`);
      const filePath = this.directImagePath(job, index);
      if (!overwrite && await pathExists(filePath)) {
        return { status: "exists", path: filePath };
      }

      if (overwrite) {
        await this.cleanupDirectTempFiles(filePath);
      }

      const controller = new AbortController();
      job.directAbortController = controller;

      const headers = { ...(job.directHeaders || {}) };
      if (job.meta?.sourceUrl && !headers.referer) headers.referer = job.meta.sourceUrl;

      try {
        let res = await fetch(url, { signal: controller.signal, headers });
        let effectiveUrl = url;
        if (!res.ok && res.status === 404) {
          const fallbackUrl = stripDoubleExtension(url);
          if (fallbackUrl && fallbackUrl !== url) {
            res = await fetch(fallbackUrl, { signal: controller.signal, headers });
            if (res.ok) effectiveUrl = fallbackUrl;
          }
        }
        if (!res.ok) {
          return { status: "skipped", reason: `HTTP ${res.status}` };
        }

        try {
          const ext = directImageExt(effectiveUrl);
          if (Array.isArray(job.directExts)) job.directExts[index] = ext;
          const resolvedPath = this.directImagePath(job, index, effectiveUrl);
          if (overwrite) {
            await this.cleanupDirectTempFiles(resolvedPath);
          }
          const body = res.body;
          if (!body) throw new Error("Missing response body");
          const inputStream = Readable.fromWeb(body);
          const { key, iv, tag, kdf } = await encryptStreamToFile({
            inputStream,
            outputPath: resolvedPath,
            relPath: getVaultRelPath(resolvedPath),
          });
          writeDirectEncryptedMeta(resolvedPath, { key, iv, tag, kdf });
          if (key?.fill) key.fill(0);
          if (!job.encryption || job.encryption.kdf !== kdf) {
            job.encryption = {
              kind: "direct",
              version: DIRECT_ENCRYPTION_VERSION,
              kdf,
              chunkLength: null,
              metaPath: directEncryptedMetaPath(resolvedPath),
            };
            this.scheduleSave();
          }
          return { status: "ok", path: resolvedPath };
        } catch (err) {
          err.directFatal = true;
          throw err;
        }
      } finally {
        job.directAbortController = null;
      }
    }

    extractDirectIndexFromPath(job, srcPath) {
      if (!Array.isArray(job.directUrls) || job.directUrls.length === 0) return null;
      const base = path.basename(srcPath);
      const match = /^(\d+)/.exec(base);
      if (!match) return null;
      const index = Number(match[1]) - 1;
      if (Number.isNaN(index) || index < 0 || index >= job.directUrls.length) return null;
      return index;
    }

    async collectRetryableTempIndices(job) {
      const indices = [];
      if (!job.tempDir) return indices;
      if (Array.isArray(job.directUrls)) {
        for (let i = 0; i < job.directUrls.length; i++) {
          const filePath = this.directImagePath(job, i);
          const metaPath = directEncryptedMetaPath(filePath);
          if (!await pathExists(filePath) || !await pathExists(metaPath)) {
            indices.push(i);
          }
        }
      }
      let entries = [];
      try {
        entries = await fsp.readdir(job.tempDir, { withFileTypes: true });
      } catch (err) {
        if (err?.code !== "ENOENT") {
          console.warn("[download-manager] collectRetryableTempIndices: readdir failed", summarizeError(err));
        }
        return indices;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!isImageTempFile(entry.name)) continue;
        const filePath = path.join(job.tempDir, entry.name);
        let stats = null;
        try {
          stats = await fsp.stat(filePath);
        } catch (err) {
          if (err?.code !== "ENOENT") {
            console.warn("[download-manager] collectRetryableTempIndices: stat failed", summarizeError(err));
          }
          continue;
        }
        const metaPath = directEncryptedMetaPath(filePath);
        const hasMeta = await pathExists(metaPath);
        const looksCorrupt = stats.size <= 1024 || !hasMeta;
        if (!looksCorrupt) continue;
        const index = this.extractDirectIndexFromPath(job, filePath);
        if (index !== null) indices.push(index);
      }
      return indices;
    }

    async redownloadFailedMovePages(job, failedEntries, extraIndices = []) {
      if (!Array.isArray(job.directUrls) || job.directUrls.length === 0) {
        return { retried: 0, failed: [] };
      }
      const retryEntries = failedEntries.filter(isRetryableMoveFailure);

      const unique = new Map();
      for (const entry of retryEntries) {
        const index = this.extractDirectIndexFromPath(job, entry.srcPath);
        if (index === null) continue;
        unique.set(index, entry);
      }

      for (const index of extraIndices) {
        if (!unique.has(index)) {
          unique.set(index, { srcPath: this.directImagePath(job, index), code: "EBADF", message: "temp-scan" });
        }
      }

      const indices = Array.from(unique.keys()).sort((a, b) => a - b);
      if (indices.length === 0) return { retried: 0, failed: [] };
      const failed = [];
      let retried = 0;

      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        job.message = `Retrying failed pages… (${i + 1}/${indices.length})`;
        this.pushUpdate(job);
        try {
          const res = await this.downloadDirectPage(job, index, { overwrite: true });
          if (res.status !== "ok") {
            failed.push({ index, status: res.status, reason: res.reason || "" });
          } else {
            retried += 1;
          }
        } catch (err) {
          failed.push({ index, status: "error", reason: String(err) });
        }
      }

      return { retried, failed };
    }

    async findFirstMissingDirectIndex(job) {
      const total = Array.isArray(job.directUrls) ? job.directUrls.length : 0;
      for (let i = 0; i < total; i++) {
        const filePath = this.directImagePath(job, i);
        if (!await pathExists(filePath)) return i;
        const metaPath = directEncryptedMetaPath(filePath);
        if (!await pathExists(metaPath)) return i;
      }
      return total;
    }

    async startDirectJob(job) {
      if (!Array.isArray(job.directUrls) || job.directUrls.length === 0) {
        throw new Error("Missing direct download image list.");
      }

      const total = job.directUrls.length;
      job.directStopRequested = false;
      job.directIndex = Math.min(job.directIndex || 0, total);
      const firstMissing = await this.findFirstMissingDirectIndex(job);
      if (firstMissing > job.directIndex) job.directIndex = firstMissing;

      const updateDirectProgress = () => {
        job.downloaded = `${job.directIndex} pages`;
        job.total = `${total} pages`;
        job.progress = total ? job.directIndex / total : 0;
        job.message = job.directSkipped
          ? `Downloading: ${job.name} (skipped ${job.directSkipped})`
          : `Downloading: ${job.name}`;
        this.pushUpdate(job);
      };

      job.status = "downloading";
      updateDirectProgress();

      for (let i = job.directIndex; i < total; i++) {
        if (job.directStopRequested) {
          job.status = "stopped";
          job.message = "Stopped.";
          job.downloadSpeed = "";
          job.uploadSpeed = "";
          this.pushUpdate(job);
          return;
        }

        const filePath = this.directImagePath(job, i);
        if (await pathExists(filePath)) {
          job.directIndex = i + 1;
          updateDirectProgress();
          continue;
        }

        try {
          const res = await this.downloadDirectPage(job, i, { overwrite: false });
          if (res.status === "exists") {
            job.directIndex = i + 1;
            updateDirectProgress();
            continue;
          }
          if (res.status === "skipped") {
            job.directSkipped++;
            console.warn("[direct] skipping page", i + 1, res.reason || "");
            job.directIndex = i + 1;
            updateDirectProgress();
            continue;
          }
        } catch (err) {
          if (job.directStopRequested || err?.name === "AbortError") {
            job.status = "stopped";
            job.message = "Stopped.";
            job.downloadSpeed = "";
            job.uploadSpeed = "";
            this.pushUpdate(job);
            return;
          }
          if (err?.directFatal) {
            job.status = "failed";
            job.message = `Direct download failed: ${String(err)}`;
            this.pushUpdate(job);
            await this.cleanupFailedJob(job);
            return;
          }
          job.directSkipped++;
          console.warn("[direct] skipping page", i + 1, summarizeError(err));
          job.directIndex = i + 1;
          updateDirectProgress();
          continue;
        }

        job.directIndex = i + 1;
        updateDirectProgress();
      }

      job.postProcessed = true;
      job.status = "finalizing";
      job.message = "Direct download complete. Finalizing…";
      this.pushUpdate(job);

      const note = job.directSkipped ? `Skipped ${job.directSkipped} page(s)` : "";
      await this.postDownloadPipeline(job, { note });
    }

    async postDownloadPipeline(job, { note } = {}) {
      job.status = "finalizing";
      job.message = note ? `Finalizing… (${note})` : "Finalizing…";
      this.pushUpdate(job);

      await delay(400);

      job.downloadSpeed = "";
      job.uploadSpeed = "";

      const vaultEnabled = vaultManager.isInitialized();
      if (!vaultEnabled) {
        throw new Error("Vault Mode is required. Set a passphrase before finalizing downloads.");
      }
      if (!vaultManager.isUnlocked()) {
        throw new Error("Vault is locked. Unlock before finalizing downloads.");
      }

      job.status = "moving";
      job.message = "Moving pages into the library…";
      job.progress = 0;
      this.pushUpdate(job);

      try {
        const allowedExts = [".webp", ".png", ".jpg", ".jpeg"];
        const onlyFiles = null;
        const hasPlain = await hasPlainImageFiles({ inDir: job.tempDir, onlyFiles, allowedExts });
        const mover = hasPlain ? movePlainDirectImagesToVault : moveEncryptedDirectImagesToVault;
        let result = await mover({
          inDir: job.tempDir,
          outDir: job.finalDir,
          deleteOriginals: true,
          onlyFiles,

          // Store pages directly in the manga folder as 001.ext, 002.ext...
          flatten: true,

          onProgress: ({ i, total, skipped }) => {
            job.progress = i / Math.max(total, 1);
            job.message = skipped ? `Scanning/Skipping… (${i}/${total})` : `Moving… (${i}/${total})`;
            this.pushUpdate(job);
          },
        });

        const processedCount = result.moved;

        if (processedCount === 0 || result.skipped > 0) {
          const failedEntries = Array.isArray(result.failed) ? result.failed : [];
          const extraIndices = await this.collectRetryableTempIndices(job);
          const retry = await this.redownloadFailedMovePages(job, failedEntries, extraIndices);
          if (retry.retried > 0) {
            job.message = "Retrying move after re-download…";
            this.pushUpdate(job);
            result = await mover({
              inDir: job.tempDir,
              outDir: job.finalDir,
              deleteOriginals: true,
              onlyFiles,
              flatten: true,
              concurrency: 1,
              onProgress: ({ i, total, skipped }) => {
                job.progress = i / Math.max(total, 1);
                job.message = skipped ? `Retrying/Skipping… (${i}/${total})` : `Retrying move… (${i}/${total})`;
                this.pushUpdate(job);
              },
            });
          }

          if (result.moved === 0 || result.skipped > 0) {
            const detail = result.firstError ? ` First error: ${String(result.firstError)}` : "";
            throw new Error(
              `Image move incomplete. Moved=${result.moved}, found=${result.total}, skipped=${result.skipped}. Keeping temp folder: ${job.tempDir}.${detail}`,
            );
          }
        }

        const outMeta = {
          ...(job.meta || {}),
          finalDir: job.finalDir,
          downloadSource: "direct",
          originSource: "downloader",
          moved: processedCount,
          scanned: result.total,
          savedAt: new Date().toISOString(),
        };
        if (outMeta.galleryId) {
          writeLibraryIndexEntry(job.finalDir, vaultEnabled, {
            galleryId: normalizeGalleryId(outMeta.galleryId),
          });
        }
        const encryptedPaths = Array.isArray(result.encryptedPaths) ? result.encryptedPaths : [];
        if (encryptedPaths.length === 0) {
          throw new Error(
            `No pages encrypted. Keeping temp folder: ${job.tempDir}`,
          );
        }

        const metaPath = path.join(job.finalDir, "metadata.json");
        const relMeta = getVaultRelPath(metaPath);
        const encryptedMeta = vaultManager.encryptBufferWithKey({
          relPath: relMeta,
          buffer: Buffer.from(JSON.stringify(outMeta, null, 2), "utf8"),
        });
        const metaEncPath = path.join(job.finalDir, "metadata.json.enc");
        await atomicWriteFile(metaEncPath, encryptedMeta);

        const coverName =
          encryptedPaths.length > 0 ? path.basename(encryptedPaths[0], ".enc") : null;
        const pageEntries = [];
        for (const encryptedPath of encryptedPaths) {
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
        const index = {
          title: outMeta.comicName || outMeta.title || null,
          cover: coverName,
          pages: encryptedPaths.length,
          pageMetaVersion: INDEX_PAGE_META_VERSION,
          pageEntries,
          createdAt: outMeta.savedAt,
        };
        const indexPath = path.join(job.finalDir, "index.json");
        const relIndex = getVaultRelPath(indexPath);
        const encryptedIndex = vaultManager.encryptBufferWithKey({
          relPath: relIndex,
          buffer: Buffer.from(JSON.stringify(index, null, 2), "utf8"),
        });
        const indexEncPath = path.join(job.finalDir, "index.json.enc");
        await atomicWriteFile(indexEncPath, encryptedIndex);

        if (job.metaPath) {
          const okMeta = await tryDeleteFileWithRetries(job.metaPath, 6);
          if (!okMeta && await pathExists(job.metaPath)) registerPendingFileCleanup(job.metaPath);
        }

        job.status = "cleaning";
        job.message = "Cleaning up temporary files…";
        this.pushUpdate(job);

        const purgeRes = await purgeFolderBestEffort(job.tempDir, { timeoutMs: 2500 });

        job.status = "completed";
        job.progress = 1;

        const cleanupNote = purgeRes.trashed
          ? `Temp cleanup delayed (moved to trash).`
          : purgeRes.ok
            ? `Temp cleaned.`
            : `Temp cleanup failed.`;

        job.message = note
          ? `Completed. Moved ${result.moved}/${result.total}. ${cleanupNote} ${note}.`
          : `Completed. Moved ${result.moved}/${result.total}. ${cleanupNote}`;

        const compacted = this.compactJob(job);
        this.pushUpdate(compacted);

        await runPendingCleanupSweep();
        await runPendingFileCleanupSweep();
        await this.notifyLibraryChanged(job.finalDir);
      } catch (err) {
        job.status = "failed";
        job.message = `Finalization failed: ${String(err)}`;
        this.pushUpdate(job);
        await this.cleanupFailedJob(job);
      }
    }

    async cleanupFailedJob(job) {
      job.directStopRequested = true;
      if (job.directAbortController) {
        try {
          job.directAbortController.abort();
        } catch (err) {
          console.warn("[download-manager] cleanupFailedJob: abort failed", summarizeError(err));
        }
      }

      if (DELETE_ON_FAIL) {
        await purgeFolderBestEffort(job.tempDir);
        await purgeFolderBestEffort(job.finalDir);

        if (job.metaPath) {
          const okMeta = await tryDeleteFileWithRetries(job.metaPath, 6);
          if (!okMeta && await pathExists(job.metaPath)) registerPendingFileCleanup(job.metaPath);
        }

        await runPendingCleanupSweep();
        await runPendingFileCleanupSweep();
      }

      await this.notifyLibraryChanged();
      this.compactJob(job);
    }

    async cancelAllJobs() {
      const jobIds = Array.from(this.jobs.keys());
      for (const jobId of jobIds) {
        const job = this.jobs.get(jobId);
        if (!job) continue;
        if (job.status !== "completed") {
          await this.cleanupFailedJob(job);
        }
        this.jobs.delete(jobId);
        sendToDownloader("dl:remove", { id: jobId });
      }
      return { ok: true, removed: jobIds.length };
    }

    async cancelJob(jobId) {
      return this.removeJob(jobId);
    }

    async removeJob(jobId) {
      const job = this.jobs.get(jobId);
      if (!job) return { ok: false, error: "Job not found" };

      if (job.status !== "completed") {
        await this.cleanupFailedJob(job);
      }

      this.jobs.delete(jobId);
      sendToDownloader("dl:remove", { id: jobId });
      this.scheduleSave();
      return { ok: true };
    }

    async stopJob(jobId) {
      const job = this.jobs.get(jobId);
      if (!job) return { ok: false, error: "Job not found" };
      if (job.status === "completed") return { ok: false, error: "Job is already completed." };
      if (job.status === "failed") return { ok: false, error: "Job has failed." };
      if (job.postProcessed) return { ok: false, error: "Job is finalizing/moving." };

      job.directStopRequested = true;
      if (job.directAbortController) {
        try {
          job.directAbortController.abort();
        } catch (err) {
          console.warn("[download-manager] stopJob: abort failed", summarizeError(err));
        }
      }
      job.status = "stopped";
      job.message = "Stopped.";
      job.downloadSpeed = "";
      job.uploadSpeed = "";
      this.pushUpdate(job);
      return { ok: true };
    }

    async startJobFromStop(jobId) {
      const job = this.jobs.get(jobId);
      if (!job) return { ok: false, error: "Job not found" };
      if (job.status === "completed") return { ok: false, error: "Job is already completed." };
      if (job.postProcessed) return { ok: false, error: "Job is finalizing/moving." };
      if (!job.tempDir || !await pathExists(job.tempDir)) {
        return { ok: false, error: "Start failed: temp directory missing." };
      }
      if (!Array.isArray(job.directUrls) || job.directUrls.length === 0) {
        const vaultEnabled = vaultManager.isInitialized();
        const vaultUnlocked = vaultManager.isUnlocked();
        if (!vaultEnabled) {
          return {
            ok: false,
            error: "Start failed: Vault Mode is required. Set a passphrase to continue.",
          };
        }
        if (!vaultUnlocked) {
          return { ok: false, error: "Start failed: unlock Vault to restore download state." };
        }
        return { ok: false, error: "Start failed: missing image list." };
      }

      job.postProcessed = false;
      job.status = "starting";
      job.message = "Starting direct download…";
      this.pushUpdate(job);

      try {
        await this.startDirectJob(job);
        return { ok: true };
      } catch (err) {
        job.status = "failed";
        job.message = `Start failed: ${String(err)}`;
        this.pushUpdate(job);
        await this.cleanupFailedJob(job);
        return { ok: false, error: String(err) };
      }
    }
  }

  function directImageFilename(index, total, ext) {
    const pad = Math.max(3, String(total || 0).length);
    const safeExt = ext && ext.startsWith(".") ? ext : ".jpg";
    return `${String(index + 1).padStart(pad, "0")}${safeExt}`;
  }

  return new DownloadManager();
}

module.exports = { createDownloadManager };
