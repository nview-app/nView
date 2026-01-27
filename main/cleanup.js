const fs = require("fs");
const path = require("path");
const {
  delay,
  safeRandomId,
  tryReadJson,
  writeJsonSafe,
} = require("./utils");

function createCleanupHelpers({ pendingCleanupFile, pendingFileCleanupFile }) {
  function readPendingFileCleanup() {
    try {
      const data = tryReadJson(pendingFileCleanupFile);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function writePendingFileCleanup(list) {
    writeJsonSafe(pendingFileCleanupFile, list);
  }

  function registerPendingFileCleanup(filePath) {
    const list = readPendingFileCleanup();
    if (!list.includes(filePath)) list.push(filePath);
    writePendingFileCleanup(list);
  }

  function tryDeleteFileNow(filePath) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function tryDeleteFileWithRetries(filePath, attempts = 6) {
    for (let i = 0; i < attempts; i++) {
      if (tryDeleteFileNow(filePath)) return true;
      await delay(150 * Math.pow(2, i));
    }
    return false;
  }

  async function runPendingFileCleanupSweep() {
    const list = readPendingFileCleanup();
    if (list.length === 0) return;

    const kept = [];
    for (const p of list) {
      const ok = await tryDeleteFileWithRetries(p, 3);
      if (!ok && fs.existsSync(p)) kept.push(p);
    }
    writePendingFileCleanup(kept);
  }

  function readPendingCleanup() {
    try {
      const data = tryReadJson(pendingCleanupFile);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function writePendingCleanup(list) {
    writeJsonSafe(pendingCleanupFile, list);
  }

  function registerPendingCleanup(folderPath) {
    const list = readPendingCleanup();
    if (!list.includes(folderPath)) list.push(folderPath);
    writePendingCleanup(list);
  }

  async function purgeFolderBestEffort(folderPath, { registerTrash = true, timeoutMs = 2500 } = {}) {
    const target = path.resolve(folderPath);
    if (!fs.existsSync(target)) return { ok: true, trashed: false, trashPath: null };

    const rmPromise = fs.promises.rm(target, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });

    try {
      await Promise.race([
        rmPromise,
        (async () => {
          await delay(timeoutMs);
          throw new Error("rm-timeout");
        })(),
      ]);
      return { ok: true, trashed: false, trashPath: null };
    } catch (err) {
      console.warn("[purgeFolderBestEffort] rm slow/failed, falling back:", String(err));
    }

    if (!registerTrash) {
      return { ok: false, trashed: false, trashPath: null };
    }

    let trashPath = null;
    try {
      const parent = path.dirname(target);
      const base = path.basename(target);
      trashPath = path.join(parent, `trash_${Date.now()}_${safeRandomId().slice(0, 8)}_${base}`);
      await fs.promises.rename(target, trashPath);
    } catch (err) {
      console.warn("[purgeFolderBestEffort] rename to trash failed:", String(err));
      return { ok: false, trashed: false, trashPath: null };
    }

    if (registerTrash) registerPendingCleanup(trashPath);
    return { ok: true, trashed: true, trashPath };
  }

  async function runPendingCleanupSweep() {
    const list = readPendingCleanup();
    if (list.length === 0) return;

    const kept = [];
    for (const p of list) {
      const res = await purgeFolderBestEffort(p, { registerTrash: false });
      if (!res.ok || fs.existsSync(p)) kept.push(p);
    }
    writePendingCleanup(kept);
  }

  return {
    purgeFolderBestEffort,
    registerPendingCleanup,
    registerPendingFileCleanup,
    runPendingCleanupSweep,
    runPendingFileCleanupSweep,
    tryDeleteFileWithRetries,
  };
}

module.exports = { createCleanupHelpers };
