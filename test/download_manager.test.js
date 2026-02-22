const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDownloadManager } = require("../main/download_manager");

function makeManager({
  vaultInitialized = true,
  vaultUnlocked = true,
  listTempDirs = async () => [],
  readTempEncryptionInfo = async () => null,
  purgeFolderBestEffort = async () => ({ ok: true }),
  tryDeleteFileWithRetries = async () => true,
  moveEncryptedDirectImagesToVault = async () => ({ moved: 0, encryptedPaths: [] }),
  movePlainDirectImagesToVault = async () => ({ moved: 0, encryptedPaths: [] }),
  hasPlainImageFiles = async () => false,
  writeDirectEncryptedMeta = () => {},
  encryptStreamToFile = async () => ({
    key: Buffer.alloc(32, 1),
    iv: Buffer.alloc(12, 2),
    tag: Buffer.alloc(16, 3),
    kdf: "scrypt",
  }),
  writeLibraryIndexEntry = () => {},
  delay = async () => {},
  ensureDirs = () => {},
  runPendingCleanupSweep = async () => {},
  runPendingFileCleanupSweep = async () => {},
  deleteOnFail = true,
  buildComicEntry = async () => null,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-"));
  const events = [];
  const pendingCleanup = [];
  const pendingFileCleanup = [];
  const manager = createDownloadManager({
    LIBRARY_ROOT: () => root,
    DELETE_ON_FAIL: deleteOnFail,
    ensureDirs,
    delay,
    listTempDirs,
    readTempEncryptionInfo,
    purgeFolderBestEffort,
    registerPendingCleanup: (dir) => pendingCleanup.push(dir),
    registerPendingFileCleanup: (file) => pendingFileCleanup.push(file),
    runPendingCleanupSweep,
    runPendingFileCleanupSweep,
    tryDeleteFileWithRetries,
    moveEncryptedDirectImagesToVault,
    movePlainDirectImagesToVault,
    hasPlainImageFiles,
    directEncryptedMetaPath: (filePath) => `${filePath}.meta`,
    writeDirectEncryptedMeta,
    encryptStreamToFile,
    DIRECT_ENCRYPTION_VERSION: "test",
    getVaultRelPath: (value) => value,
    vaultManager: {
      isInitialized: () => vaultInitialized,
      isUnlocked: () => vaultUnlocked,
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptFileToBuffer: async () => Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001080200000000000000", "hex"),
    },
    normalizeGalleryId: (value) => String(value || ""),
    writeLibraryIndexEntry,
    sendToDownloader: (channel, payload) => events.push({ channel, payload }),
    sendToGallery: (channel, payload) => events.push({ channel, payload }),
    buildComicEntry,
  });
  return { manager, root, events, pendingCleanup, pendingFileCleanup };
}

test("resumeJobs fails completed-finalization resume when tempDir is missing", async () => {
  const { manager, events } = makeManager();
  manager.jobs.set("job-1", {
    id: "job-1",
    status: "moving",
    postProcessed: true,
    tempDir: path.join(os.tmpdir(), "missing-temp-dir"),
    message: "",
  });

  await manager.resumeJobs();

  const job = manager.jobs.get("job-1");
  assert.equal(job.status, "failed");
  assert.match(job.message, /temp directory missing/i);
  assert.equal(events.some((item) => item.channel === "dl:update"), true);
});

test("resumeJobs pauses when vault is locked and download state cannot be restored", async () => {
  const { manager } = makeManager({ vaultInitialized: true, vaultUnlocked: false });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-temp-"));
  manager.jobs.set("job-2", {
    id: "job-2",
    status: "starting",
    postProcessed: false,
    tempDir,
    directUrls: [],
    message: "",
  });

  await manager.resumeJobs();

  const job = manager.jobs.get("job-2");
  assert.equal(job.status, "stopped");
  assert.match(job.message, /unlock Vault/i);
});

test("startJobFromStop blocks restart when image list is missing", async () => {
  const { manager } = makeManager({ vaultInitialized: true, vaultUnlocked: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-temp-"));
  manager.jobs.set("job-3", {
    id: "job-3",
    status: "stopped",
    postProcessed: false,
    tempDir,
    directUrls: [],
    message: "",
  });

  const res = await manager.startJobFromStop("job-3");

  assert.deepEqual(res, { ok: false, error: "Start failed: missing image list." });
});

test("recoverEncryptedTempData restores job encryption and registers pending cleanup for stale temp dirs", async () => {
  const jobTemp = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-job-temp-"));
  const staleTemp = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-stale-temp-"));
  const encryption = { kind: "direct", kdf: "scrypt" };
  const { manager, pendingCleanup } = makeManager({
    listTempDirs: async () => [jobTemp, staleTemp],
    readTempEncryptionInfo: async (tempDir) => (tempDir === jobTemp ? encryption : null),
    purgeFolderBestEffort: async (tempDir) => (tempDir === staleTemp ? { ok: false } : { ok: true }),
  });

  manager.jobs.set("job-enc", {
    id: "job-enc",
    status: "starting",
    tempDir: jobTemp,
    directUrls: ["https://example.invalid/1.jpg"],
  });

  await manager.recoverEncryptedTempData();

  const recovered = manager.jobs.get("job-enc");
  assert.deepEqual(recovered.encryption, encryption);
  assert.equal(pendingCleanup.includes(staleTemp), true);
});

test("cleanupFailedJob queues encrypted metadata cleanup when immediate delete fails", async () => {
  const { manager, pendingFileCleanup, events } = makeManager({
    tryDeleteFileWithRetries: async () => false,
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-fail-temp-"));
  const finalDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-fail-final-"));
  const metaPath = path.join(finalDir, "metadata.json.enc");
  fs.writeFileSync(metaPath, "enc");

  const job = {
    id: "job-failed",
    status: "failed",
    tempDir,
    finalDir,
    metaPath,
  };

  await manager.cleanupFailedJob(job);

  assert.equal(pendingFileCleanup.includes(metaPath), true);
  assert.equal(events.some((item) => item.channel === "library:changed"), true);
});



test("notifyLibraryChanged emits targeted update when comic entry can be built", async () => {
  const builtEntry = { dir: "/library/comic_1", title: "Title" };
  const { manager, events } = makeManager({
    buildComicEntry: async () => builtEntry,
  });

  await manager.notifyLibraryChanged("/library/comic_1");

  const event = events.find((item) => item.channel === "library:changed");
  assert.equal(Boolean(event), true);
  assert.equal(event.payload.action, "update");
  assert.equal(event.payload.comicDir, "/library/comic_1");
  assert.deepEqual(event.payload.entry, builtEntry);
});
test("clearCompletedJobs removes only completed jobs and emits dl:remove", () => {
  const { manager, events } = makeManager();
  manager.jobs.set("done", { id: "done", status: "completed" });
  manager.jobs.set("active", { id: "active", status: "downloading" });

  const result = manager.clearCompletedJobs();

  assert.deepEqual(result, { ok: true, removed: 1 });
  assert.equal(manager.jobs.has("done"), false);
  assert.equal(manager.jobs.has("active"), true);
  assert.equal(events.some((item) => item.channel === "dl:remove" && item.payload.id === "done"), true);
});

test("status helpers report active and in-progress jobs accurately", () => {
  const { manager } = makeManager();
  manager.jobs.set("failed", { id: "failed", status: "failed" });
  manager.jobs.set("completed", { id: "completed", status: "completed" });
  assert.equal(manager.hasActiveDownloads(), false);
  assert.equal(manager.hasInProgressDownloads(), false);

  manager.jobs.set("moving", { id: "moving", status: "moving" });
  assert.equal(manager.hasActiveDownloads(), true);
  assert.equal(manager.hasInProgressDownloads(), true);
});

test("collectRetryableTempIndices detects missing and corrupt temp pages", async () => {
  const { manager, root } = makeManager();
  const tempDir = path.join(root, "tmp_test");
  fs.mkdirSync(tempDir, { recursive: true });

  const file1 = path.join(tempDir, "001.jpg");
  const file2 = path.join(tempDir, "002.jpg");
  fs.writeFileSync(file1, "small");
  fs.writeFileSync(file2, "this is encrypted image payload".repeat(200));
  fs.writeFileSync(`${file2}.meta`, "meta");

  const job = {
    tempDir,
    directUrls: ["https://e.invalid/1.jpg", "https://e.invalid/2.jpg", "https://e.invalid/3.jpg"],
    directExts: [".jpg", ".jpg", ".jpg"],
  };

  const indices = await manager.collectRetryableTempIndices(job);

  assert.deepEqual(indices.sort((a, b) => a - b), [0, 0, 2]);
});

test("redownloadFailedMovePages retries retryable entries and tracks failures", async () => {
  const { manager, root, events } = makeManager();
  const tempDir = path.join(root, "tmp_retry");
  fs.mkdirSync(tempDir, { recursive: true });

  const job = {
    id: "retry-job",
    name: "retry-job",
    message: "",
    tempDir,
    directUrls: ["https://e.invalid/1.jpg", "https://e.invalid/2.jpg"],
    directExts: [".jpg", ".jpg"],
  };

  manager.downloadDirectPage = async (_job, index) => {
    if (index === 0) return { status: "ok" };
    return { status: "skipped", reason: "HTTP 500" };
  };

  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const result = await manager.redownloadFailedMovePages(
      job,
      [{ srcPath: path.join(tempDir, "001.jpg"), code: "EBADF", message: "bad file descriptor" }],
      [1],
    );

    assert.deepEqual(result, {
      retried: 1,
      failed: [{ index: 1, status: "skipped", reason: "HTTP 500" }],
    });
    assert.equal(events.some((item) => item.channel === "dl:update"), true);
  } finally {
    console.warn = previousWarn;
  }
});

test("removeJob and stopJob handle state transitions and missing jobs", async () => {
  const { manager } = makeManager();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-stop-"));
  const finalDir = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-stop-final-"));

  manager.jobs.set("run", { id: "run", status: "downloading", postProcessed: false, tempDir, finalDir });
  manager.jobs.set("done", { id: "done", status: "completed", postProcessed: false, tempDir, finalDir });

  assert.deepEqual(await manager.stopJob("unknown"), { ok: false, error: "Job not found" });
  assert.deepEqual(await manager.stopJob("done"), { ok: false, error: "Job is already completed." });
  assert.deepEqual(await manager.stopJob("run"), { ok: true });

  assert.deepEqual(await manager.removeJob("missing"), { ok: false, error: "Job not found" });
  assert.deepEqual(await manager.removeJob("done"), { ok: true });
});

test("addDirectDownload validates missing URLs and can enqueue+start direct job", async () => {
  const started = [];
  const { manager } = makeManager();
  manager.startDirectJob = async (job) => {
    started.push(job.id);
  };

  assert.deepEqual(await manager.addDirectDownload({ imageUrls: [] }), {
    ok: false,
    error: "No images found for alternate download.",
  });

  const result = await manager.addDirectDownload({
    imageUrls: ["https://example.invalid/a.jpg", "", null],
    meta: { galleryId: "g-1" },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(started, [result.id]);
  assert.equal(manager.jobs.has(result.id), true);
});

test("downloadDirectPage returns skipped for HTTP failure and supports fallback URL", { concurrency: false }, async (t) => {
  const metaWrites = [];
  const { manager, root } = makeManager({
    writeDirectEncryptedMeta: (filePath) => metaWrites.push(filePath),
  });
  const tempDir = path.join(root, "tmp_page");
  fs.mkdirSync(tempDir, { recursive: true });
  const job = {
    id: "p1",
    tempDir,
    directUrls: ["https://example.invalid/p/001.jpg.webp"],
    directExts: [null],
    meta: { sourceUrl: "https://ref.invalid" },
    directHeaders: {},
  };

  t.mock.method(global, "fetch", async (url) => {
    if (String(url).endsWith(".webp")) return { ok: false, status: 404 };
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    return { ok: true, status: 200, body };
  });

  const okRes = await manager.downloadDirectPage(job, 0);
  assert.equal(okRes.status, "ok");
  assert.equal(metaWrites.length, 1);

  t.mock.method(global, "fetch", async () => ({ ok: false, status: 500 }));
  const skipped = await manager.downloadDirectPage(
    { ...job, directUrls: ["https://example.invalid/fail.jpg"] },
    0,
    { overwrite: true },
  );
  assert.deepEqual(skipped, { status: "skipped", reason: "HTTP 500" });
});

test("startDirectJob handles skip, stop, and fatal errors", async () => {
  const { manager } = makeManager();
  const job = {
    id: "s1",
    name: "job",
    status: "starting",
    message: "",
    directUrls: ["u1", "u2", "u3"],
    directExts: [".jpg", ".jpg", ".jpg"],
    directIndex: 0,
    directSkipped: 0,
    directStopRequested: false,
  };
  manager.findFirstMissingDirectIndex = async () => 0;
  manager.directImagePath = (_job, i) => `/missing/${i}.jpg`;

  let called = 0;
  manager.downloadDirectPage = async () => {
    called += 1;
    if (called === 1) return { status: "skipped", reason: "HTTP 500" };
    if (called === 2) {
      job.directStopRequested = true;
      return { status: "ok" };
    }
    return { status: "ok" };
  };

  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    await manager.startDirectJob(job);
    assert.equal(job.status, "stopped");
    assert.equal(job.directSkipped, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[direct\] skipping page 1 HTTP 500/);
  } finally {
    console.warn = previousWarn;
  }

  const jobFatal = {
    ...job,
    id: "s2",
    status: "starting",
    directStopRequested: false,
    directSkipped: 0,
    directIndex: 0,
  };
  manager.downloadDirectPage = async () => {
    const err = new Error("fatal");
    err.directFatal = true;
    throw err;
  };
  const previousError = console.error;
  console.error = () => {};
  try {
    await manager.startDirectJob(jobFatal);
    assert.equal(jobFatal.status, "failed");
    assert.match(jobFatal.message, /Direct download failed/i);
  } finally {
    console.error = previousError;
  }
});

test("postDownloadPipeline finalizes encrypted outputs without plaintext metadata writes", async () => {
  let sweepCount = 0;
  const { manager, root, events } = makeManager({
    moveEncryptedDirectImagesToVault: async ({ outDir }) => {
      const one = path.join(outDir, "001.jpg.enc");
      const two = path.join(outDir, "002.jpg.enc");
      fs.writeFileSync(one, "enc");
      fs.writeFileSync(two, "enc");
      return {
        moved: 2,
        total: 2,
        skipped: 0,
        encryptedPaths: [one, two],
      };
    },
    runPendingCleanupSweep: async () => {
      sweepCount += 1;
    },
    runPendingFileCleanupSweep: async () => {
      sweepCount += 1;
    },
  });
  const tempDir = path.join(root, "tmp_fin");
  const finalDir = path.join(root, "final_fin");
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(finalDir, { recursive: true });
  const job = {
    id: "fin",
    name: "fin",
    tempDir,
    finalDir,
    meta: { comicName: "Secure", galleryId: "123" },
    status: "finalizing",
    progress: 0,
    message: "",
  };

  await manager.postDownloadPipeline(job, { note: "done" });

  assert.equal(job.status, "completed");
  assert.equal(fs.existsSync(path.join(finalDir, "metadata.json")), false);
  assert.equal(fs.existsSync(path.join(finalDir, "metadata.json.enc")), true);
  assert.equal(fs.existsSync(path.join(finalDir, "index.json.enc")), true);
  assert.equal(sweepCount, 2);
  assert.equal(events.some((item) => item.channel === "library:changed"), true);
});

test("cancelAllJobs and startJobFromStop error paths return expected results", async () => {
  const { manager, root } = makeManager({ vaultInitialized: false, vaultUnlocked: false });
  const tempDir = path.join(root, "tmp_start_stop");
  fs.mkdirSync(tempDir, { recursive: true });

  manager.jobs.set("j1", { id: "j1", status: "downloading", tempDir, finalDir: tempDir });
  manager.jobs.set("j2", { id: "j2", status: "completed", tempDir, finalDir: tempDir });
  assert.deepEqual(await manager.cancelAllJobs(), { ok: true, removed: 2 });

  manager.jobs.set("s1", {
    id: "s1",
    status: "stopped",
    postProcessed: false,
    tempDir,
    directUrls: [],
  });
  assert.deepEqual(await manager.startJobFromStop("s1"), {
    ok: false,
    error: "Start failed: Vault Mode is required. Set a passphrase to continue.",
  });

  manager.jobs.set("s2", {
    id: "s2",
    status: "stopped",
    postProcessed: false,
    tempDir: path.join(root, "missing"),
    directUrls: ["https://example.invalid/1.jpg"],
  });
  assert.deepEqual(await manager.startJobFromStop("s2"), {
    ok: false,
    error: "Start failed: temp directory missing.",
  });
});
