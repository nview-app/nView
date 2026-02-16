const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDownloadManager } = require("../main/download_manager");

function makeManager({ vaultInitialized = true, vaultUnlocked = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nview-dl-"));
  const events = [];
  const manager = createDownloadManager({
    LIBRARY_ROOT: () => root,
    DELETE_ON_FAIL: true,
    ensureDirs: () => {},
    delay: async () => {},
    listTempDirs: async () => [],
    readTempEncryptionInfo: async () => null,
    purgeFolderBestEffort: async () => ({ ok: true }),
    registerPendingCleanup: () => {},
    registerPendingFileCleanup: () => {},
    runPendingCleanupSweep: async () => {},
    runPendingFileCleanupSweep: async () => {},
    tryDeleteFileWithRetries: async () => ({ ok: true }),
    moveEncryptedDirectImagesToVault: async () => ({ moved: 0, encryptedPaths: [] }),
    movePlainDirectImagesToVault: async () => ({ moved: 0, encryptedPaths: [] }),
    hasPlainImageFiles: () => false,
    directEncryptedMetaPath: (filePath) => `${filePath}.meta`,
    writeDirectEncryptedMeta: () => {},
    encryptStreamToFile: async () => {},
    DIRECT_ENCRYPTION_VERSION: "test",
    getVaultRelPath: (value) => value,
    vaultManager: {
      isInitialized: () => vaultInitialized,
      isUnlocked: () => vaultUnlocked,
    },
    normalizeGalleryId: (value) => String(value || ""),
    writeLibraryIndexEntry: () => {},
    sendToDownloader: (channel, payload) => events.push({ channel, payload }),
    sendToGallery: () => {},
  });
  return { manager, root, events };
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

