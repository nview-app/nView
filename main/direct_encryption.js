const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { listFilesRecursive, naturalSort, readJsonWithError, tryReadJson, writeJsonAtomic } = require("./utils");

const DIRECT_ENCRYPTION_VERSION = 2;
const DIRECT_ENCRYPTION_META_SUFFIX = ".encmeta.json";
const DIRECT_ENCRYPTION_META_BACKUP_SUFFIX = ".encmeta.json.bak";

function createDirectEncryptionHelpers({ vaultManager, getVaultRelPath }) {
  function directEncryptedMetaPath(filePath) {
    return `${filePath}${DIRECT_ENCRYPTION_META_SUFFIX}`;
  }

  function directEncryptedMetaBackupPath(filePath) {
    return `${filePath}${DIRECT_ENCRYPTION_META_BACKUP_SUFFIX}`;
  }

  function normalizeVaultRelPath(relPath) {
    return String(relPath || "").replaceAll("\\", "/");
  }

  function writeDirectEncryptedMeta(filePath, { key, iv, tag, kdf = "random" }) {
    const payload = {
      v: DIRECT_ENCRYPTION_VERSION,
      alg: "aes-256-gcm",
      kdf,
      iv_b64: iv.toString("base64"),
      tag_b64: tag.toString("base64"),
    };
    if (kdf === "random") {
      if (!Buffer.isBuffer(key)) {
        throw new Error("Invalid direct encryption key buffer.");
      }
      payload.key_b64 = key.toString("base64");
    }
    const metaPath = directEncryptedMetaPath(filePath);
    const backupPath = directEncryptedMetaBackupPath(filePath);
    writeJsonAtomic(metaPath, payload);
    writeJsonAtomic(backupPath, payload);
    return metaPath;
  }

  function readDirectEncryptedMetaPayload(metaPath, filePath) {
    const { data: payload, error } = readJsonWithError(metaPath);
    if (!payload) throw new Error(`Missing encryption metadata: ${metaPath} (${error || "unknown"})`);
    const version = Number(payload.v);
    if (![1, 2].includes(version)) {
      throw new Error(`Unsupported encryption metadata version: ${payload.v}`);
    }
    let kdf = version === 1 ? "random" : payload.kdf || "random";
    let key = null;
    let aad = null;
    if (kdf === "vault") {
      if (!vaultManager.isInitialized()) {
        throw new Error("Vault required for encrypted temp data.");
      }
      if (!vaultManager.isUnlocked()) {
        throw new Error("Vault is locked. Unlock before finalizing downloads.");
      }
      const relPath = getVaultRelPath(filePath);
      key = vaultManager.deriveFileKey(relPath);
      aad = normalizeVaultRelPath(relPath);
    } else {
      const rawKey = payload.key_b64 || "";
      key = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(String(rawKey), "base64");
    }
    const iv = Buffer.from(payload.iv_b64 || "", "base64");
    const tag = Buffer.from(payload.tag_b64 || "", "base64");
    if (key.length !== 32 && vaultManager.isInitialized()) {
      if (!vaultManager.isUnlocked()) {
        throw new Error("Vault is locked. Unlock before finalizing downloads.");
      }
      const relPath = getVaultRelPath(filePath);
      key = vaultManager.deriveFileKey(relPath);
      aad = normalizeVaultRelPath(relPath);
      kdf = "vault";
    }
    if (key.length !== 32 || iv.length !== 12 || tag.length !== 16) {
      let metaSize = null;
      try {
        metaSize = fs.statSync(metaPath).size;
      } catch {}
      console.warn("[encryption-meta] invalid direct metadata", {
        metaPath,
        filePath,
        metaSize,
        version,
        kdf,
        keyLength: key.length,
        ivLength: iv.length,
        tagLength: tag.length,
        hasKey: Boolean(payload.key_b64),
        hasIv: Boolean(payload.iv_b64),
        hasTag: Boolean(payload.tag_b64),
      });
      throw new Error(`Invalid encryption metadata for ${metaPath}`);
    }
    return { key, iv, tag, kdf, aad };
  }

  function readDirectEncryptedMeta(filePath) {
    const metaPath = directEncryptedMetaPath(filePath);
    const backupPath = directEncryptedMetaBackupPath(filePath);
    try {
      return readDirectEncryptedMetaPayload(metaPath, filePath);
    } catch (err) {
      if (fs.existsSync(backupPath)) {
        const backup = readDirectEncryptedMetaPayload(backupPath, filePath);
        try {
          writeJsonAtomic(metaPath, {
            v: DIRECT_ENCRYPTION_VERSION,
            alg: "aes-256-gcm",
            kdf: backup.kdf,
            iv_b64: backup.iv.toString("base64"),
            tag_b64: backup.tag.toString("base64"),
            ...(backup.kdf === "random" ? { key_b64: backup.key.toString("base64") } : {}),
          });
        } catch {}
        return backup;
      }
      throw err;
    }
  }

  async function readTempEncryptionInfo(tempDir) {
    const files = await listFilesRecursive(tempDir);
    const metaPath =
      files.find((p) => p.endsWith(DIRECT_ENCRYPTION_META_SUFFIX)) ||
      files.find((p) => p.endsWith(DIRECT_ENCRYPTION_META_BACKUP_SUFFIX));
    if (metaPath) {
      const payload = tryReadJson(metaPath) || {};
      const version = Number(payload.v) || null;
      const kdf = version === 1 ? "random" : payload.kdf || "random";
      return {
        kind: "direct",
        version,
        kdf,
        chunkLength: null,
        metaPath,
      };
    }

    return null;
  }

  async function encryptStreamToFile({ inputStream, outputPath, relPath }) {
    const vaultEnabled = vaultManager.isInitialized();
    let key = null;
    let kdf = "random";
    let aad = null;
    if (vaultEnabled) {
      if (!vaultManager.isUnlocked()) {
        throw new Error("Vault is locked. Unlock before downloading.");
      }
      key = vaultManager.deriveFileKey(relPath);
      kdf = "vault";
      aad = normalizeVaultRelPath(relPath);
    } else {
      key = crypto.randomBytes(32);
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    if (aad) {
      cipher.setAAD(Buffer.from(aad, "utf8"));
    }
    try {
      await pipeline(inputStream, cipher, fs.createWriteStream(outputPath));
    } catch (err) {
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {}
      if (kdf === "vault" && key?.fill) {
        key.fill(0);
      }
      throw err;
    }
    const tag = cipher.getAuthTag();
    if (kdf === "vault" && key?.fill) {
      key.fill(0);
      return { key: null, iv, tag, kdf, aad };
    }
    return { key, iv, tag, kdf, aad };
  }

  function sortImageInputs(inDir, inputs) {
    const unique = Array.from(new Set(inputs.map((p) => path.resolve(p))));
    unique.sort((a, b) => {
      const ra = path.relative(inDir, a).replaceAll("\\", "/");
      const rb = path.relative(inDir, b).replaceAll("\\", "/");
      return naturalSort(ra, rb);
    });
    return unique;
  }

  async function listEncryptedDirectInputs({ inDir, onlyFiles, allowedExts }) {
    let inputs = [];
    if (Array.isArray(onlyFiles) && onlyFiles.length > 0) {
      inputs = onlyFiles.slice();
    } else {
      const all = await listFilesRecursive(inDir);
      inputs = all.filter((p) => allowedExts.includes(path.extname(p).toLowerCase()));
    }
    return sortImageInputs(inDir, inputs);
  }

  function isPlainImageMagic(buffer) {
    if (!buffer || buffer.length < 12) return false;
    const b0 = buffer[0];
    const b1 = buffer[1];
    const b2 = buffer[2];
    const b3 = buffer[3];
    if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return true; // JPEG
    if (
      b0 === 0x89 &&
      b1 === 0x50 &&
      b2 === 0x4e &&
      b3 === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return true; // PNG
    }
    if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
      return true; // WEBP
    }
    const gifHeader = buffer.slice(0, 6).toString("ascii");
    return gifHeader === "GIF87a" || gifHeader === "GIF89a";
  }

  function isPlainImageFile(filePath) {
    try {
      const fd = fs.openSync(filePath, "r");
      const probe = Buffer.alloc(12);
      const bytes = fs.readSync(fd, probe, 0, probe.length, 0);
      fs.closeSync(fd);
      if (!bytes) return false;
      return isPlainImageMagic(probe.slice(0, bytes));
    } catch {
      return false;
    }
  }

  async function hasPlainImageFiles({ inDir, onlyFiles, allowedExts, limit = 8 }) {
    let inputs = [];
    if (Array.isArray(onlyFiles) && onlyFiles.length > 0) {
      inputs = onlyFiles.slice();
    } else {
      const all = await listFilesRecursive(inDir);
      inputs = all.filter((p) => allowedExts.includes(path.extname(p).toLowerCase()));
    }
    const sorted = sortImageInputs(inDir, inputs);
    const checked = Math.min(sorted.length, limit);
    for (let i = 0; i < checked; i++) {
      if (isPlainImageFile(sorted[i])) return true;
    }
    return false;
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

  async function moveEncryptedDirectImages({
    inDir,
    outDir,
    deleteOriginals = true,
    onProgress,
    onlyFiles = null,
    flatten = false,
  }) {
    fs.mkdirSync(outDir, { recursive: true });
    const allowedExts = [".webp", ".png", ".jpg", ".jpeg"];
    const inputs = await listEncryptedDirectInputs({ inDir, onlyFiles, allowedExts });
    const total = inputs.length;
    let moved = 0;
    let skipped = 0;
    let firstError = null;
    const pad = Math.max(3, String(total || 0).length);

    const doOne = async (srcPath, i) => {
      let meta = null;
      let outPath = null;
      try {
        if (flatten) {
          const ext = path.extname(srcPath).toLowerCase() || ".png";
          const seqName = String(i + 1).padStart(pad, "0") + ext;
          outPath = path.join(outDir, seqName);
        } else {
          const rel = path.relative(inDir, srcPath);
          outPath = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
        }

        meta = readDirectEncryptedMeta(srcPath);
        const decipher = crypto.createDecipheriv("aes-256-gcm", meta.key, meta.iv);
        if (meta.aad) {
          decipher.setAAD(Buffer.from(meta.aad, "utf8"));
        }
        decipher.setAuthTag(meta.tag);
        await pipeline(fs.createReadStream(srcPath), decipher, fs.createWriteStream(outPath));

        if (deleteOriginals) {
          try { fs.unlinkSync(srcPath); } catch {}
          try {
            const metaPath = directEncryptedMetaPath(srcPath);
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
            const backupPath = directEncryptedMetaBackupPath(srcPath);
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          } catch {}
        }

        moved++;
        onProgress && onProgress({ i: i + 1, total, skipped: false });
        return { ok: true, srcPath, outPath };
      } catch (err) {
        if (outPath && isPlainImageFile(srcPath)) {
          try {
            await pipeline(fs.createReadStream(srcPath), fs.createWriteStream(outPath));
            if (deleteOriginals) {
              try { fs.unlinkSync(srcPath); } catch {}
              try {
                const metaPath = directEncryptedMetaPath(srcPath);
                if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
                const backupPath = directEncryptedMetaBackupPath(srcPath);
                if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
              } catch {}
            }
            moved++;
            onProgress && onProgress({ i: i + 1, total, skipped: false });
            return { ok: true, srcPath, outPath, fallback: "plaintext" };
          } catch (fallbackErr) {
            err = fallbackErr;
          }
        }
        skipped++;
        if (!firstError) firstError = err;
        onProgress && onProgress({ i: i + 1, total, skipped: true });
        return { ok: false, srcPath, outPath: null };
      } finally {
        if (meta?.key?.fill) {
          meta.key.fill(0);
        }
      }
    };

    await withConcurrency(inputs, 4, doOne);
    return { total, moved, skipped, firstError };
  }

  async function moveEncryptedDirectImagesToVault({
    inDir,
    outDir,
    deleteOriginals = true,
    onProgress,
    onlyFiles = null,
    flatten = false,
  }) {
    fs.mkdirSync(outDir, { recursive: true });
    const allowedExts = [".webp", ".png", ".jpg", ".jpeg"];
    const inputs = await listEncryptedDirectInputs({ inDir, onlyFiles, allowedExts });
    const total = inputs.length;
    let moved = 0;
    let skipped = 0;
    let firstError = null;
    const pad = Math.max(3, String(total || 0).length);
    const encryptedPaths = new Array(total).fill(null);

    const doOne = async (srcPath, i) => {
      let meta = null;
      let outPath = null;
      let encPath = null;
      try {
        if (flatten) {
          const ext = path.extname(srcPath).toLowerCase() || ".png";
          const seqName = String(i + 1).padStart(pad, "0") + ext;
          outPath = path.join(outDir, seqName);
        } else {
          const rel = path.relative(inDir, srcPath);
          outPath = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
        }

        encPath = `${outPath}.enc`;
        meta = readDirectEncryptedMeta(srcPath);
        const decipher = crypto.createDecipheriv("aes-256-gcm", meta.key, meta.iv);
        if (meta.aad) {
          decipher.setAAD(Buffer.from(meta.aad, "utf8"));
        }
        decipher.setAuthTag(meta.tag);

        const decryptedStream = fs.createReadStream(srcPath).pipe(decipher);
        await vaultManager.encryptStreamToPath({
          relPath: getVaultRelPath(outPath),
          inputStream: decryptedStream,
          outputPath: encPath,
        });

        if (deleteOriginals) {
          try { fs.unlinkSync(srcPath); } catch {}
          try {
            const metaPath = directEncryptedMetaPath(srcPath);
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
            const backupPath = directEncryptedMetaBackupPath(srcPath);
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          } catch {}
        }

        encryptedPaths[i] = encPath;
        moved++;
        onProgress && onProgress({ i: i + 1, total, skipped: false });
        return { ok: true, srcPath, outPath: encPath };
      } catch (err) {
        if (encPath && fs.existsSync(encPath)) {
          try { fs.unlinkSync(encPath); } catch {}
        }
        skipped++;
        if (!firstError) firstError = err;
        onProgress && onProgress({ i: i + 1, total, skipped: true });
        return { ok: false, srcPath, outPath: null };
      } finally {
        if (meta?.key?.fill) {
          meta.key.fill(0);
        }
      }
    };

    await withConcurrency(inputs, 4, doOne);
    return { total, moved, skipped, firstError, encryptedPaths: encryptedPaths.filter(Boolean) };
  }

  async function movePlainDirectImagesToVault({
    inDir,
    outDir,
    deleteOriginals = true,
    onProgress,
    onlyFiles = null,
    flatten = false,
  }) {
    fs.mkdirSync(outDir, { recursive: true });
    const allowedExts = [".webp", ".png", ".jpg", ".jpeg"];
    let inputs = [];
    if (Array.isArray(onlyFiles) && onlyFiles.length > 0) {
      inputs = onlyFiles.slice();
    } else {
      const all = await listFilesRecursive(inDir);
      inputs = all.filter((p) => allowedExts.includes(path.extname(p).toLowerCase()));
    }
    const sorted = sortImageInputs(inDir, inputs);
    const total = sorted.length;
    let moved = 0;
    let skipped = 0;
    let firstError = null;
    const pad = Math.max(3, String(total || 0).length);
    const encryptedPaths = new Array(total).fill(null);

    const doOne = async (srcPath, i) => {
      let outPath = null;
      let encPath = null;
      try {
        if (flatten) {
          const ext = path.extname(srcPath).toLowerCase() || ".png";
          const seqName = String(i + 1).padStart(pad, "0") + ext;
          outPath = path.join(outDir, seqName);
        } else {
          const rel = path.relative(inDir, srcPath);
          outPath = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
        }

        encPath = `${outPath}.enc`;
        await vaultManager.encryptStreamToPath({
          relPath: getVaultRelPath(outPath),
          inputStream: fs.createReadStream(srcPath),
          outputPath: encPath,
        });

        if (deleteOriginals) {
          try { fs.unlinkSync(srcPath); } catch {}
        }

        encryptedPaths[i] = encPath;
        moved++;
        onProgress && onProgress({ i: i + 1, total, skipped: false });
        return { ok: true, srcPath, outPath: encPath };
      } catch (err) {
        if (encPath && fs.existsSync(encPath)) {
          try { fs.unlinkSync(encPath); } catch {}
        }
        skipped++;
        if (!firstError) firstError = err;
        onProgress && onProgress({ i: i + 1, total, skipped: true });
        return { ok: false, srcPath, outPath: null };
      }
    };

    await withConcurrency(sorted, 4, doOne);
    return { total, moved, skipped, firstError, encryptedPaths: encryptedPaths.filter(Boolean) };
  }

  return {
    DIRECT_ENCRYPTION_META_BACKUP_SUFFIX,
    DIRECT_ENCRYPTION_META_SUFFIX,
    directEncryptedMetaPath,
    encryptStreamToFile,
    hasPlainImageFiles,
    moveEncryptedDirectImages,
    moveEncryptedDirectImagesToVault,
    movePlainDirectImagesToVault,
    readDirectEncryptedMeta,
    readTempEncryptionInfo,
    writeDirectEncryptedMeta,
  };
}

module.exports = {
  DIRECT_ENCRYPTION_VERSION,
  createDirectEncryptionHelpers,
};
