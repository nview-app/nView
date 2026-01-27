const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");

function directImageExt(url) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname || "").toLowerCase();
    if (ext) return ext;
  } catch {}
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
  } catch {
    return "";
  }
}

function createDownloadManager({
  LIBRARY_ROOT,
  DOWNLOAD_STATE_FILE,
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
  writeJsonSafe,
  tryReadJson,
  moveComicImages,
  moveEncryptedDirectImages,
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
}) {
  let downloadStateSaveTimer = null;

  class DownloadManager {
    constructor() {
      this.jobs = new Map();
      this.seq = 1;
    }

    serializeJob(job) {
      return {
        id: job.id,
        tempDir: job.tempDir,
        finalDir: job.finalDir,
        name: job.name || "",
        status: job.status,
        message: job.message || "",
        createdAt: job.createdAt,
        postProcessed: !!job.postProcessed,
        progress: job.progress ?? 0,
        downloaded: job.downloaded || "",
        total: job.total || "",
        downloadSpeed: job.downloadSpeed || "",
        uploadSpeed: job.uploadSpeed || "",
        meta: job.meta || null,
        metaPath: job.metaPath || null,
        directUrls: Array.isArray(job.directUrls) ? job.directUrls : null,
        directIndex: Number(job.directIndex) || 0,
        directSkipped: Number(job.directSkipped) || 0,
        directExts: Array.isArray(job.directExts) ? job.directExts : null,
        encryption: job.encryption || null,
      };
    }

    hydrateJob(raw) {
      const id = String(raw?.id || "");
      return {
        id,
        tempDir: raw?.tempDir || "",
        finalDir: raw?.finalDir || "",
        status: raw?.status || "starting",
        message: raw?.message || "",
        createdAt: raw?.createdAt || Date.now(),

        postProcessed: !!raw?.postProcessed,

        progress: raw?.progress ?? 0,
        downloaded: raw?.downloaded || "",
        total: raw?.total || "",
        downloadSpeed: raw?.downloadSpeed || "",
        uploadSpeed: raw?.uploadSpeed || "",
        name: raw?.name || "",

        meta: raw?.meta || null,
        metaPath: raw?.metaPath || null,
        directUrls: Array.isArray(raw?.directUrls) ? raw.directUrls : null,
        directIndex: Number(raw?.directIndex) || 0,
        directSkipped: Number(raw?.directSkipped) || 0,
        directExts: Array.isArray(raw?.directExts) ? raw.directExts : null,
        encryption: raw?.encryption || null,
      };
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
            if (!res.ok && fs.existsSync(tempDir)) registerPendingCleanup(tempDir);
          }
          continue;
        }

        if (encryption) {
          const res = await purgeFolderBestEffort(tempDir);
          if (!res.ok && fs.existsSync(tempDir)) registerPendingCleanup(tempDir);
          continue;
        }

        const res = await purgeFolderBestEffort(tempDir);
        if (!res.ok && fs.existsSync(tempDir)) registerPendingCleanup(tempDir);
      }

      if (changedState) this.scheduleSave();
    }

    saveState() {
      ensureDirs();
      const payload = {
        seq: this.seq,
        jobs: Array.from(this.jobs.values()).map((job) => this.serializeJob(job)),
        savedAt: new Date().toISOString(),
      };
      writeJsonSafe(DOWNLOAD_STATE_FILE(), payload);
    }

    scheduleSave() {
      if (downloadStateSaveTimer) clearTimeout(downloadStateSaveTimer);
      downloadStateSaveTimer = setTimeout(() => {
        downloadStateSaveTimer = null;
        this.saveState();
      }, 800);
    }

    flushSave() {
      if (downloadStateSaveTimer) {
        clearTimeout(downloadStateSaveTimer);
        downloadStateSaveTimer = null;
      }
      this.saveState();
    }

    loadState() {
      ensureDirs();
      const data = tryReadJson(DOWNLOAD_STATE_FILE());
      if (!data || !Array.isArray(data.jobs)) return;

      const seq = Number(data.seq);
      if (Number.isFinite(seq) && seq > 0) this.seq = seq;

      let maxIdNum = 0;
      for (const raw of data.jobs) {
        const job = this.hydrateJob(raw);
        if (!job.id) continue;
        this.jobs.set(job.id, job);
        const idNum = Number(job.id);
        if (Number.isFinite(idNum)) maxIdNum = Math.max(maxIdNum, idNum);
      }

      if (this.seq <= maxIdNum) this.seq = maxIdNum + 1;
    }

    async resumeJobs() {
      const activeStatuses = new Set(["starting", "downloading"]);
      const finalizationStatuses = new Set(["finalizing", "moving", "cleaning"]);

      for (const job of this.jobs.values()) {
        if (job.status === "completed" || job.status === "failed") continue;

        if (job.postProcessed || finalizationStatuses.has(job.status)) {
          if (!job.tempDir || !fs.existsSync(job.tempDir)) {
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
          job.status = "failed";
          job.message = "Resume failed: missing image list.";
          this.pushUpdate(job);
          continue;
        }

        if (!job.tempDir || !fs.existsSync(job.tempDir)) {
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

    notifyLibraryChanged() {
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

      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(finalDir, { recursive: true });

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
        name: meta?.comicName || meta?.galleryId || "Direct download",

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

    findFirstMissingDirectIndex(job) {
      const total = Array.isArray(job.directUrls) ? job.directUrls.length : 0;
      for (let i = 0; i < total; i++) {
        const filePath = this.directImagePath(job, i);
        if (!fs.existsSync(filePath)) return i;
        const metaPath = directEncryptedMetaPath(filePath);
        if (!fs.existsSync(metaPath)) return i;
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
      const firstMissing = this.findFirstMissingDirectIndex(job);
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

        const url = job.directUrls[i];
        const filePath = this.directImagePath(job, i);
        if (fs.existsSync(filePath)) {
          job.directIndex = i + 1;
          updateDirectProgress();
          continue;
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
            job.directSkipped++;
            console.warn("[direct] skipping page", i + 1, "HTTP", res.status);
            job.directIndex = i + 1;
            updateDirectProgress();
            continue;
          }

          try {
            const ext = directImageExt(effectiveUrl);
            if (Array.isArray(job.directExts)) job.directExts[i] = ext;
            const resolvedPath = this.directImagePath(job, i, effectiveUrl);
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
          } catch (err) {
            if (job.directStopRequested || err?.name === "AbortError") {
              job.status = "stopped";
              job.message = "Stopped.";
              job.downloadSpeed = "";
              job.uploadSpeed = "";
              this.pushUpdate(job);
              return;
            }
            job.status = "failed";
            job.message = `Direct download failed: ${String(err)}`;
            this.pushUpdate(job);
            await this.cleanupFailedJob(job);
            return;
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
          job.directSkipped++;
          console.warn("[direct] skipping page", i + 1, String(err));
          job.directIndex = i + 1;
          updateDirectProgress();
          continue;
        } finally {
          job.directAbortController = null;
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
      if (vaultEnabled && !vaultManager.isUnlocked()) {
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
        const mover = vaultEnabled
          ? hasPlain
            ? movePlainDirectImagesToVault
            : moveEncryptedDirectImagesToVault
          : hasPlain
            ? moveComicImages
            : moveEncryptedDirectImages;
        const result = await mover({
          inDir: job.tempDir,
          outDir: job.finalDir,
          deleteOriginals: true,
          onlyFiles,

          // Store pages directly in the comic folder as 001.ext, 002.ext...
          flatten: true,

          onProgress: ({ i, total, skipped }) => {
            job.progress = i / Math.max(total, 1);
            job.message = skipped ? `Scanning/Skipping… (${i}/${total})` : `Moving… (${i}/${total})`;
            this.pushUpdate(job);
          },
        });

        const processedCount = result.moved;

        if (processedCount === 0 || result.skipped > 0) {
          const detail = result.firstError ? ` First error: ${String(result.firstError)}` : "";
          throw new Error(
            `Image move incomplete. Moved=${processedCount}, found=${result.total}, skipped=${result.skipped}. Keeping temp folder: ${job.tempDir}.${detail}`,
          );
        }

        const outMeta = {
          ...(job.meta || {}),
          finalDir: job.finalDir,
          downloadSource: "direct",
          moved: processedCount,
          scanned: result.total,
          savedAt: new Date().toISOString(),
        };
        if (outMeta.galleryId) {
          writeLibraryIndexEntry(job.finalDir, vaultEnabled, {
            galleryId: normalizeGalleryId(outMeta.galleryId),
          });
        }
        if (vaultEnabled) {
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
          const metaTempPath = `${metaEncPath}.tmp`;
          fs.writeFileSync(metaTempPath, encryptedMeta);
          fs.renameSync(metaTempPath, metaEncPath);

          const coverName =
            encryptedPaths.length > 0 ? path.basename(encryptedPaths[0], ".enc") : null;
          const index = {
            title: outMeta.comicName || outMeta.title || null,
            cover: coverName,
            pages: encryptedPaths.length,
            createdAt: outMeta.savedAt,
          };
          writeJsonSafe(path.join(job.finalDir, "index.json"), index);
        } else {
          fs.writeFileSync(
            path.join(job.finalDir, "metadata.json"),
            JSON.stringify(outMeta, null, 2),
            "utf8",
          );
        }

        if (job.metaPath) {
          const okMeta = await tryDeleteFileWithRetries(job.metaPath, 6);
          if (!okMeta && fs.existsSync(job.metaPath)) registerPendingFileCleanup(job.metaPath);
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

        this.pushUpdate(job);

        await runPendingCleanupSweep();
        await runPendingFileCleanupSweep();
        this.notifyLibraryChanged();
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
        } catch {}
      }

      if (DELETE_ON_FAIL) {
        await purgeFolderBestEffort(job.tempDir);
        await purgeFolderBestEffort(job.finalDir);

        if (job.metaPath) {
          const okMeta = await tryDeleteFileWithRetries(job.metaPath, 6);
          if (!okMeta && fs.existsSync(job.metaPath)) registerPendingFileCleanup(job.metaPath);
        }

        await runPendingCleanupSweep();
        await runPendingFileCleanupSweep();
      }

      this.notifyLibraryChanged();
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
        } catch {}
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
      if (!job.tempDir || !fs.existsSync(job.tempDir)) {
        return { ok: false, error: "Start failed: temp directory missing." };
      }
      if (!Array.isArray(job.directUrls) || job.directUrls.length === 0) {
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
