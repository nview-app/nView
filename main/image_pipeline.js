const fs = require("fs");
const path = require("path");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function isImageExt(ext) {
  const e = ext.toLowerCase();
  return e === ".webp" || e === ".png" || e === ".jpg" || e === ".jpeg";
}

function listFilesRecursive(dir) {
  const results = [];
  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) walk(full);
      else results.push(full);
    }
  }
  walk(dir);
  return results;
}

function moveFileSync(fromPath, toPath) {
  try {
    fs.renameSync(fromPath, toPath);
    return;
  } catch (err) {
    if (err && err.code !== "EXDEV") throw err;
  }

  fs.copyFileSync(fromPath, toPath);
  fs.unlinkSync(fromPath);
}

async function withConcurrency(items, limit, worker) {
  const results = [];
  let idx = 0;

  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await worker(items[my], my);
    }
  });

  await Promise.all(runners);
  return results;
}

function naturalSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}


/**
 * Move comic images without conversion.
 *
 * @param {Object} opts
 * @param {string} opts.inDir - input directory (download tmp dir)
 * @param {string} opts.outDir - output directory (final dir)
 * @param {boolean} opts.deleteOriginals - if true, delete originals after move
 * @param {function} opts.onProgress - ({i,total,skipped}) callback
 * @param {string[]|null} opts.onlyFiles - optional allowlist of absolute file paths
 * @param {boolean} opts.flatten - if true, store pages directly in outDir as 001.ext, 002.ext...
 */
async function moveComicImages({
  inDir,
  outDir,
  deleteOriginals = true,
  onProgress,
  onlyFiles = null,
  flatten = false,
}) {
  ensureDir(outDir);

  let inputs = [];
  if (Array.isArray(onlyFiles) && onlyFiles.length > 0) {
    inputs = onlyFiles.slice();
  } else {
    inputs = listFilesRecursive(inDir).filter((p) => isImageExt(path.extname(p)));
  }

  // Normalize + de-dup
  inputs = Array.from(new Set(inputs.map((p) => path.resolve(p))));

  // Stable ordering: sort by relative path (natural)
  inputs.sort((a, b) => {
    const ra = path.relative(inDir, a).replaceAll("\\", "/");
    const rb = path.relative(inDir, b).replaceAll("\\", "/");
    return naturalSort(ra, rb);
  });

  const total = inputs.length;
  let moved = 0;
  let skipped = 0;

  const pad = Math.max(3, String(total || 0).length);

  const doOne = async (srcPath, i) => {
    try {
      let outPath;

      if (flatten) {
        const ext = path.extname(srcPath).toLowerCase() || ".png";
        const seqName = String(i + 1).padStart(pad, "0") + ext;
        outPath = path.join(outDir, seqName);
      } else {
        const rel = path.relative(inDir, srcPath);
        outPath = path.join(outDir, rel);
        ensureDir(path.dirname(outPath));
      }

      if (deleteOriginals) {
        moveFileSync(srcPath, outPath);
      } else {
        fs.copyFileSync(srcPath, outPath);
      }

      moved++;
      onProgress && onProgress({ i: i + 1, total, skipped: false });
      return { ok: true, srcPath, outPath };
    } catch {
      skipped++;
      onProgress && onProgress({ i: i + 1, total, skipped: true });
      return { ok: false, srcPath, outPath: null };
    }
  };

  await withConcurrency(inputs, 4, doOne);

  return { total, moved, skipped };
}

module.exports = { moveComicImages };
