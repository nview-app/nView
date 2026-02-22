const { ENABLE_STARTUP_PERF_LOGGING } = require("../../shared/dev_mode");

function registerDownloadsFilesIpcHandlers(context) {
  const {
    ipcMain,
    dl,
    getInProgressDownloadCount,
    shell,
    ensureDirs,
    LIBRARY_ROOT,
    vaultManager,
    fs,
    path,
    isUnderLibraryRoot,
    normalizeOpenPathResult,
    buildComicEntry,
  } = context;

  const warnIpcFailure = (operation, err) => {
    const code = err?.code ? ` (${String(err.code)})` : "";
    const message = err?.message ? ` ${String(err.message)}` : "";
    console.warn(`[ipc] ${operation} failed${code}.${message}`.trim());
  };

  const summarizeSamples = (samples) => {
    const numeric = samples
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (!numeric.length) {
      return {
        totalMs: 0,
        avgMs: 0,
        p95Ms: 0,
        maxMs: 0,
      };
    }
    const sorted = [...numeric].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const totalMs = sorted.reduce((sum, value) => sum + value, 0);
    return {
      totalMs,
      avgMs: totalMs / sorted.length,
      p95Ms: sorted[p95Index],
      maxMs: sorted[sorted.length - 1],
    };
  };

  ipcMain.handle("dl:list", async () => ({ ok: true, jobs: dl.listJobs() }));
  ipcMain.handle("dl:activeCount", async () => ({ ok: true, count: getInProgressDownloadCount() }));
  ipcMain.handle("dl:cancel", async (_e, jobId) => dl.cancelJob(String(jobId)));
  ipcMain.handle("dl:remove", async (_e, jobId) => dl.removeJob(String(jobId)));
  ipcMain.handle("dl:stop", async (_e, jobId) => dl.stopJob(String(jobId)));
  ipcMain.handle("dl:start", async (_e, jobId) => dl.startJobFromStop(String(jobId)));
  ipcMain.handle("dl:clearCompleted", async () => dl.clearCompletedJobs());

  ipcMain.handle("files:open", async (_event, filePath) => {
    ensureDirs();
    if (!filePath || !isUnderLibraryRoot(filePath)) {
      return { ok: false, error: "Invalid filePath" };
    }
    try {
      const result = await shell.openPath(filePath);
      return normalizeOpenPathResult(result);
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("files:showInFolder", async (_event, filePath) => {
    ensureDirs();
    if (!filePath || !isUnderLibraryRoot(filePath)) {
      return { ok: false, error: "Invalid filePath" };
    }
    try {
      shell.showItemInFolder(filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("library:listAll", async (event, options = {}) => {
    const totalStartedAt = process.hrtime.bigint();
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
    let readdirMs = 0;
    try {
      const readdirStartedAt = process.hrtime.bigint();
      dirs = (await fs.promises.readdir(root, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && d.name.startsWith("comic_"))
        .map((d) => path.join(root, d.name));
      readdirMs = Number(process.hrtime.bigint() - readdirStartedAt) / 1e6;
    } catch (err) {
      warnIpcFailure("library:listAll readdir", err);
      dirs = [];
    }

    const requestId = Number(options?.requestId) || 0;
    const progressive = options?.progressive !== false;
    const maxConcurrency = Math.max(1, Math.min(12, Number(options?.concurrency) || 6));
    const chunkSize = Math.max(1, Math.min(64, Number(options?.chunkSize) || 24));

    const sendLoadProgress = (payload) => {
      if (!progressive || !event?.sender || event.sender.isDestroyed?.()) return;
      event.sender.send("library:loadProgress", {
        requestId,
        ...payload,
      });
    };

    sendLoadProgress({ phase: "start", loaded: 0, total: dirs.length });

    const entriesWithPerf = [];
    let nextIndex = 0;
    let loadedCount = 0;
    let chunk = [];

    const buildNext = async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= dirs.length) return;
        const entry = await buildComicEntry(dirs[currentIndex], { includePerf: ENABLE_STARTUP_PERF_LOGGING });
        entriesWithPerf.push(entry);
        loadedCount += 1;
        chunk.push(entry);
        if (chunk.length >= chunkSize || loadedCount === dirs.length) {
          sendLoadProgress({
            phase: "chunk",
            loaded: loadedCount,
            total: dirs.length,
            items: chunk,
          });
          chunk = [];
        }
      }
    };

    const workerCount = Math.min(maxConcurrency, Math.max(1, dirs.length));
    const workers = Array.from({ length: workerCount }, () => buildNext());
    await Promise.all(workers);
    let buildSummary = null;
    let decryptMetaSummary = null;
    let decryptIndexSummary = null;
    let statSummary = null;
    let contentDataSummary = null;
    let contentCacheHits = 0;

    if (ENABLE_STARTUP_PERF_LOGGING) {
      const buildEntrySamples = [];
      const decryptMetaSamples = [];
      const decryptIndexSamples = [];
      const statSamples = [];
      const contentDataSamples = [];
      for (const entry of entriesWithPerf) {
        const perf = entry?.__perf;
        if (!perf) continue;
        buildEntrySamples.push(perf.totalMs);
        decryptMetaSamples.push(perf.decryptMetaMs);
        decryptIndexSamples.push(perf.decryptIndexMs);
        statSamples.push(perf.statMs);
        contentDataSamples.push(perf.contentDataMs);
        if (perf.contentCacheHit) contentCacheHits += 1;
      }
      buildSummary = summarizeSamples(buildEntrySamples);
      decryptMetaSummary = summarizeSamples(decryptMetaSamples);
      decryptIndexSummary = summarizeSamples(decryptIndexSamples);
      statSummary = summarizeSamples(statSamples);
      contentDataSummary = summarizeSamples(contentDataSamples);
    }
    const entries = entriesWithPerf.map((entry) => {
      if (!entry || typeof entry !== "object" || !Object.prototype.hasOwnProperty.call(entry, "__perf")) {
        return entry;
      }
      const { __perf, ...safeEntry } = entry;
      return safeEntry;
    });
    const items = entries.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
    const totalMs = Number(process.hrtime.bigint() - totalStartedAt) / 1e6;
    if (ENABLE_STARTUP_PERF_LOGGING) {
      console.log(
        `[perf] library:listAll: total=${totalMs.toFixed(2)}ms | `
        + `meta=${JSON.stringify({
          mangaCount: dirs.length,
          readdirMs: Number(readdirMs.toFixed(2)),
          buildEntryWorkMs: Number(buildSummary.totalMs.toFixed(2)),
          buildEntryAvgMs: Number(buildSummary.avgMs.toFixed(2)),
          buildEntryP95Ms: Number(buildSummary.p95Ms.toFixed(2)),
          buildEntryMaxMs: Number(buildSummary.maxMs.toFixed(2)),
          decryptMetaWorkMs: Number(decryptMetaSummary.totalMs.toFixed(2)),
          decryptMetaAvgMs: Number(decryptMetaSummary.avgMs.toFixed(2)),
          decryptMetaP95Ms: Number(decryptMetaSummary.p95Ms.toFixed(2)),
          decryptIndexWorkMs: Number(decryptIndexSummary.totalMs.toFixed(2)),
          decryptIndexAvgMs: Number(decryptIndexSummary.avgMs.toFixed(2)),
          statWorkMs: Number(statSummary.totalMs.toFixed(2)),
          statAvgMs: Number(statSummary.avgMs.toFixed(2)),
          statP95Ms: Number(statSummary.p95Ms.toFixed(2)),
          contentDataWorkMs: Number(contentDataSummary.totalMs.toFixed(2)),
          contentDataAvgMs: Number(contentDataSummary.avgMs.toFixed(2)),
          contentDataP95Ms: Number(contentDataSummary.p95Ms.toFixed(2)),
          contentCacheHits,
        })}`,
      );
    }

    sendLoadProgress({ phase: "complete", loaded: items.length, total: dirs.length });

    return { ok: true, root, items };
  });
}

module.exports = { registerDownloadsFilesIpcHandlers };
