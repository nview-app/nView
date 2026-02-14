const fs = require("fs");
const path = require("path");
const { listFilesRecursiveSync, naturalSort, withConcurrency } = require("./utils");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function isImageExt(ext) {
  const e = ext.toLowerCase();
  return e === ".webp" || e === ".png" || e === ".jpg" || e === ".jpeg";
}

function moveFileSync(fromPath, toPath) {
  let renameErr = null;
  try {
    fs.renameSync(fromPath, toPath);
    return;
  } catch (err) {
    renameErr = err;
    if (!err || !["EXDEV", "EACCES", "EPERM", "EBUSY"].includes(err.code)) {
      throw err;
    }
  }

  try {
    fs.copyFileSync(fromPath, toPath);
    fs.unlinkSync(fromPath);
  } catch (err) {
    if (renameErr && err?.code === "EACCES") throw renameErr;
    throw err;
  }
}



/**
 * Move manga images without conversion.
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
    inputs = listFilesRecursiveSync(inDir).filter((p) => isImageExt(path.extname(p)));
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
  let firstError = null;

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
    } catch (err) {
      skipped++;
      if (!firstError) firstError = err;
      onProgress && onProgress({ i: i + 1, total, skipped: true });
      return { ok: false, srcPath, outPath: null };
    }
  };

  await withConcurrency(inputs, 4, doOne);

  return { total, moved, skipped, firstError };
}

module.exports = { moveComicImages };
