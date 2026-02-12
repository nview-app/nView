const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPPORT_FILE_NAMES = [".vault.json", ".library_index.json.enc", ".library_index.json"];

function isSameOrChildPath(parentPath, candidatePath, options = {}) {
  const parent = canonicalizePath(parentPath, options);
  const candidate = canonicalizePath(candidatePath, options);
  if (!parent || !candidate) return false;
  const sep = options.platform === "win32" ? path.win32.sep : path.sep;
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function canonicalizePath(inputPath, { fsModule = fs, platform = process.platform } = {}) {
  const trimmed = String(inputPath || "").trim();
  if (!trimmed) return "";
  const pathApi = platform === "win32" ? path.win32 : path;
  let resolved = pathApi.resolve(trimmed);
  try {
    const realpathFn = fsModule.realpathSync?.native || fsModule.realpathSync;
    if (typeof realpathFn === "function" && fsModule.existsSync?.(resolved)) {
      resolved = realpathFn(resolved);
    }
  } catch {
    // Keep resolved path if realpath lookup fails.
  }
  let normalized = pathApi.normalize(resolved);
  if (normalized.length > 1) {
    normalized = normalized.replace(/[\\/]+$/, "");
  }
  if (platform === "win32") {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

function resolveConfiguredLibraryRoot(configuredPath, fallbackRoot) {
  const trimmed = String(configuredPath || "").trim();
  if (!trimmed) {
    return { preferredRoot: fallbackRoot, usedFallback: false };
  }
  if (!path.isAbsolute(trimmed)) {
    return { preferredRoot: fallbackRoot, usedFallback: true, warning: "Library path must be absolute." };
  }
  return { preferredRoot: path.normalize(trimmed), usedFallback: false };
}

function validateWritableDirectory(dirPath, fsModule = fs) {
  try {
    fsModule.mkdirSync(dirPath, { recursive: true });
    fsModule.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    const probePath = path.join(
      dirPath,
      `.nview_write_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}.tmp`,
    );
    fsModule.writeFileSync(probePath, "ok", "utf8");
    fsModule.unlinkSync(probePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function isDirectoryEmpty(dirPath, fsModule = fs) {
  const resolved = path.resolve(String(dirPath || ""));
  if (!resolved) return { ok: false, error: "Invalid directory path." };
  try {
    fsModule.mkdirSync(resolved, { recursive: true });
    const entries = fsModule.readdirSync(resolved);
    return { ok: true, empty: entries.length === 0, entryCount: entries.length };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function migrateLibrarySupportFiles({ fromRoot, toRoot, fsModule = fs }) {
  const fromNormalized = path.resolve(String(fromRoot || ""));
  const toNormalized = path.resolve(String(toRoot || ""));
  if (!fromNormalized || !toNormalized || fromNormalized === toNormalized) {
    return { copied: [], skipped: [], errors: [] };
  }

  const copied = [];
  const skipped = [];
  const errors = [];

  for (const fileName of SUPPORT_FILE_NAMES) {
    const fromPath = path.join(fromNormalized, fileName);
    const toPath = path.join(toNormalized, fileName);

    if (!fsModule.existsSync(fromPath)) {
      skipped.push({ fileName, reason: "missing_source" });
      continue;
    }
    if (fsModule.existsSync(toPath)) {
      skipped.push({ fileName, reason: "already_exists" });
      continue;
    }

    try {
      fsModule.copyFileSync(fromPath, toPath);
      copied.push(fileName);
    } catch (err) {
      errors.push({ fileName, error: String(err) });
    }
  }

  return { copied, skipped, errors };
}

function scanLibraryContents(rootPath, { fsModule = fs, skipPaths = [] } = {}) {
  const root = path.resolve(String(rootPath || ""));
  if (!root) return { ok: false, error: "Invalid source library path." };
  if (!fsModule.existsSync(root)) {
    return { ok: true, fileCount: 0, totalBytes: 0, files: [], skippedSymlinks: 0 };
  }

  const skipRoots = skipPaths
    .map((value) => path.resolve(String(value || "")))
    .filter(Boolean)
    .map((value) => (value.endsWith(path.sep) ? value : `${value}${path.sep}`));

  const files = [];
  const stack = [root];
  let totalBytes = 0;
  let skippedSymlinks = 0;

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const withSep = current.endsWith(path.sep) ? current : `${current}${path.sep}`;
    if (skipRoots.some((prefix) => withSep.startsWith(prefix))) {
      continue;
    }

    let entries = [];
    try {
      entries = fsModule.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      return { ok: false, error: `Failed to read ${current}: ${String(err)}` };
    }

    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const relPath = path.relative(root, abs).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        skippedSymlinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      let size = 0;
      try {
        size = fsModule.statSync(abs).size;
      } catch (err) {
        return { ok: false, error: `Failed to stat ${abs}: ${String(err)}` };
      }
      files.push({ relPath, size });
      totalBytes += size;
    }
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { ok: true, fileCount: files.length, totalBytes, files, skippedSymlinks };
}

function hashFileSha256(filePath, fsModule = fs) {
  const content = fsModule.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function removeEmptySourceDirectories(sourceRoot, migratedFiles, fsModule = fs) {
  const source = path.resolve(String(sourceRoot || ""));
  if (!source || !Array.isArray(migratedFiles) || !migratedFiles.length) {
    return { removed: 0, errors: [] };
  }

  const directories = new Set();
  for (const item of migratedFiles) {
    if (!item?.relPath) continue;
    let relativeDir = path.dirname(item.relPath);
    while (relativeDir && relativeDir !== ".") {
      directories.add(relativeDir);
      relativeDir = path.dirname(relativeDir);
    }
  }

  const sorted = Array.from(directories).sort((a, b) => b.length - a.length);
  let removed = 0;
  const errors = [];
  for (const relDir of sorted) {
    const absDir = path.join(source, relDir);
    try {
      fsModule.rmdirSync(absDir);
      removed += 1;
    } catch (err) {
      const code = err?.code;
      if (code === "ENOENT" || code === "ENOTEMPTY" || code === "EEXIST") {
        continue;
      }
      errors.push({ relPath: relDir.replaceAll("\\", "/"), error: String(err) });
    }
  }

  return { removed, errors };
}

function migrateLibraryContents({ fromRoot, toRoot, fsModule = fs }) {
  const source = path.resolve(String(fromRoot || ""));
  const dest = path.resolve(String(toRoot || ""));
  if (!source || !dest) {
    return { ok: false, error: "Invalid migration paths." };
  }
  if (source === dest) {
    return {
      ok: true,
      fileCount: 0,
      copiedFiles: 0,
      skippedFiles: 0,
      totalBytes: 0,
      skippedSymlinks: 0,
    };
  }
  if (isSameOrChildPath(source, dest)) {
    return {
      ok: false,
      error: "Destination folder cannot be the same as or nested inside the current library.",
      partial: false,
    };
  }

  const destinationState = isDirectoryEmpty(dest, fsModule);
  if (!destinationState.ok) {
    return {
      ok: false,
      error: `Failed to read destination folder: ${destinationState.error}`,
      partial: false,
    };
  }
  if (!destinationState.empty) {
    return {
      ok: false,
      error: "Destination folder must be empty before moving the library.",
      partial: false,
      guidance: "Choose an empty folder to avoid filename conflicts while migrating.",
    };
  }

  const scan = scanLibraryContents(source, { fsModule });
  if (!scan.ok) return scan;

  const supportHashes = new Map();
  for (const fileName of SUPPORT_FILE_NAMES) {
    const sourcePath = path.join(source, fileName);
    if (!fsModule.existsSync(sourcePath)) continue;
    try {
      supportHashes.set(fileName, hashFileSha256(sourcePath, fsModule));
    } catch (err) {
      return {
        ok: false,
        error: `Failed to hash support file before migration: ${String(err)}`,
        partial: false,
      };
    }
  }

  const errors = [];
  let copiedFiles = 0;
  let skippedFiles = 0;

  for (const item of scan.files) {
    const fromPath = path.join(source, item.relPath);
    const toPath = path.join(dest, item.relPath);
    try {
      fsModule.mkdirSync(path.dirname(toPath), { recursive: true });
      if (fsModule.existsSync(toPath)) {
        const existingSize = fsModule.statSync(toPath).size;
        if (existingSize === item.size) {
          skippedFiles += 1;
          continue;
        }
        errors.push({ relPath: item.relPath, error: "conflict_existing_file" });
        continue;
      }
      fsModule.copyFileSync(fromPath, toPath);
      copiedFiles += 1;
    } catch (err) {
      errors.push({ relPath: item.relPath, error: String(err) });
    }
  }

  if (errors.length) {
    return {
      ok: false,
      error: "Migration failed while copying files.",
      partial: copiedFiles > 0,
      guidance:
        "Some files may already exist in the destination. Retry using an empty folder or clean up the destination first.",
      fileCount: scan.fileCount,
      copiedFiles,
      skippedFiles,
      totalBytes: scan.totalBytes,
      skippedSymlinks: scan.skippedSymlinks,
      errors,
    };
  }

  const verify = scanLibraryContents(dest, { fsModule });
  if (!verify.ok) {
    return {
      ok: false,
      error: verify.error,
      partial: copiedFiles > 0,
      fileCount: scan.fileCount,
      copiedFiles,
      skippedFiles,
      skippedSymlinks: scan.skippedSymlinks,
    };
  }

  const verifyMap = new Map(verify.files.map((item) => [item.relPath, item.size]));
  const missing = [];
  for (const item of scan.files) {
    if (verifyMap.get(item.relPath) !== item.size) {
      missing.push(item.relPath);
      if (missing.length >= 20) break;
    }
  }
  if (missing.length) {
    return {
      ok: false,
      error: "Verification failed after migration.",
      partial: copiedFiles > 0,
      fileCount: scan.fileCount,
      copiedFiles,
      skippedFiles,
      totalBytes: scan.totalBytes,
      skippedSymlinks: scan.skippedSymlinks,
      missing,
    };
  }

  const supportHashMismatch = [];
  for (const [fileName, expectedHash] of supportHashes.entries()) {
    const destPath = path.join(dest, fileName);
    if (!fsModule.existsSync(destPath)) continue;
    try {
      const dstHash = hashFileSha256(destPath, fsModule);
      if (expectedHash !== dstHash) {
        supportHashMismatch.push(fileName);
      }
    } catch (err) {
      return {
        ok: false,
        error: `Failed to verify support file integrity: ${String(err)}`,
        partial: copiedFiles > 0,
        fileCount: scan.fileCount,
        copiedFiles,
        skippedFiles,
        totalBytes: scan.totalBytes,
        skippedSymlinks: scan.skippedSymlinks,
      };
    }
  }

  if (supportHashMismatch.length) {
    return {
      ok: false,
      error: "Verification failed for support files after migration.",
      partial: copiedFiles > 0,
      fileCount: scan.fileCount,
      copiedFiles,
      skippedFiles,
      totalBytes: scan.totalBytes,
      skippedSymlinks: scan.skippedSymlinks,
      mismatchedSupportFiles: supportHashMismatch,
    };
  }



  const deleteErrors = [];
  let deletedFiles = 0;
  for (const item of scan.files) {
    const fromPath = path.join(source, item.relPath);
    try {
      if (!fsModule.existsSync(fromPath)) continue;
      fsModule.unlinkSync(fromPath);
      deletedFiles += 1;
    } catch (err) {
      deleteErrors.push({ relPath: item.relPath, error: String(err) });
    }
  }

  if (deleteErrors.length) {
    return {
      ok: false,
      error: "Migration copied files but failed to remove some originals.",
      partial: true,
      guidance: "Retry cleanup of the original library path after ensuring files are not locked by another process.",
      fileCount: scan.fileCount,
      copiedFiles,
      skippedFiles,
      deletedFiles,
      totalBytes: scan.totalBytes,
      skippedSymlinks: scan.skippedSymlinks,
      errors: deleteErrors,
    };
  }

  const directoryCleanup = removeEmptySourceDirectories(source, scan.files, fsModule);
  if (directoryCleanup.errors.length) {
    return {
      ok: false,
      error: "Migration removed files but failed to remove some empty source folders.",
      partial: true,
      guidance: "Retry cleanup of the original library path after ensuring folders are not locked by another process.",
      fileCount: scan.fileCount,
      copiedFiles,
      skippedFiles,
      deletedFiles,
      deletedDirectories: directoryCleanup.removed,
      totalBytes: scan.totalBytes,
      skippedSymlinks: scan.skippedSymlinks,
      errors: directoryCleanup.errors,
    };
  }

  return {
    ok: true,
    fileCount: scan.fileCount,
    copiedFiles,
    skippedFiles,
    deletedFiles,
    deletedDirectories: directoryCleanup.removed,
    totalBytes: scan.totalBytes,
    skippedSymlinks: scan.skippedSymlinks,
  };
}

module.exports = {
  isSameOrChildPath,
  canonicalizePath,
  migrateLibrarySupportFiles,
  migrateLibraryContents,
  resolveConfiguredLibraryRoot,
  scanLibraryContents,
  validateWritableDirectory,
  isDirectoryEmpty,
};
