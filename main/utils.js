const fs = require("fs");
const path = require("path");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function logReaddirWarning(current, err) {
  const code = err && typeof err === "object" ? err.code : "UNKNOWN";
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[utils] Unable to read directory "${current}" (${code}): ${detail}`);
}

function shouldLogReaddirError(err) {
  const code = err && typeof err === "object" ? err.code : null;
  // Missing/not-a-directory can happen during normal races (deleted/moved paths),
  // so avoid noisy warnings for those expected conditions.
  return code !== "ENOENT" && code !== "ENOTDIR";
}


function shouldLogDirectoryFsyncError(err) {
  const code = err && typeof err === "object" ? err.code : null;
  // Directory fsync is not supported on some platforms/filesystems; this is expected.
  return !["EPERM", "EINVAL", "ENOTSUP", "ENOSYS", "EISDIR"].includes(code);
}

function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function naturalSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

async function listFilesRecursive(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (err) {
      if (shouldLogReaddirError(err)) {
        logReaddirWarning(current, err);
      }
      continue;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) stack.push(full);
      else results.push(full);
    }
  }
  return results;
}

function listFilesRecursiveSync(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      if (shouldLogReaddirError(err)) {
        logReaddirWarning(current, err);
      }
      continue;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) stack.push(full);
      else results.push(full);
    }
  }
  return results;
}

async function withConcurrency(items, limit, worker) {
  const results = [];
  let idx = 0;
  const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 1;
  const runnerCount = Math.min(Math.max(1, normalizedLimit), items.length);
  const runners = new Array(runnerCount).fill(0).map(async () => {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await worker(items[my], my);
    }
  });
  await Promise.all(runners);
  return results;
}

async function listTempDirs(rootDir) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  } catch (err) {
    if (shouldLogReaddirError(err)) {
      console.warn("[utils] listTempDirs: readdir failed", summarizeError(err));
    }
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("tmp_"))
    .map((entry) => path.join(rootDir, entry.name));
}

function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn("[utils] tryReadJson: failed", summarizeError(err));
    return null;
  }
}

function readJsonWithError(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { data: null, error: "missing" };
    return { data: JSON.parse(fs.readFileSync(filePath, "utf8")), error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

function writeJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.warn("[writeJsonSafe] failed:", summarizeError(err));
    return false;
  }
}

function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  const data = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  let fd = null;
  try {
    fd = fs.openSync(tempPath, "w");
    let offset = 0;
    while (offset < data.length) {
      offset += fs.writeSync(fd, data, offset, data.length - offset);
    }
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (err) {
        console.warn("[utils] writeJsonAtomic: closeSync failed", summarizeError(err));
      }
    }
  }
  fs.renameSync(tempPath, filePath);
  try {
    const dirFd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch (err) {
    if (shouldLogDirectoryFsyncError(err)) {
      console.warn("[utils] writeJsonAtomic: directory fsync skipped", summarizeError(err));
    }
  }
}

function summarizeError(err) {
  return `${err?.name || "Error"}${err?.code ? `:${err.code}` : ""}`;
}

function safeRandomId() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

module.exports = {
  delay,
  humanBytes,
  listFilesRecursive,
  listFilesRecursiveSync,
  listTempDirs,
  naturalSort,
  readJsonWithError,
  safeRandomId,
  tryReadJson,
  withConcurrency,
  writeJsonAtomic,
  writeJsonSafe,
};
