const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { buffer: consumeBuffer } = require("stream/consumers");
const { pipeline } = require("stream/promises");
const { withLockedBuffer, withLockedTransientBuffer } = require("./native/secure_memory_bridge");

const AAD_WRAP = "nviewer:vault:v1";
const AAD_FILE_INFO = "nviewer:file:v1";
const ENC_MAGIC = Buffer.from("NVEN");
const ENC_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ENC_HEADER_BYTES = ENC_MAGIC.length + 1 + NONCE_BYTES + TAG_BYTES;

const DEFAULT_KDF = {
  name: "scrypt",
  N: 262144,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
};

function getVaultFilePath(root) {
  return path.join(root, ".vault.json");
}

function normalizeRelPath(relPath) {
  return String(relPath || "").replaceAll("\\", "/");
}

function deriveKek(passphrase, salt, kdf = DEFAULT_KDF) {
  const N = kdf.N ?? DEFAULT_KDF.N;
  const r = kdf.r ?? DEFAULT_KDF.r;
  const p = kdf.p ?? DEFAULT_KDF.p;
  const requiredMem = 128 * r * N + 256 * r + 128 * r * p;
  const maxmem = Math.max(
    kdf.maxmem ?? 0,
    DEFAULT_KDF.maxmem ?? 0,
    requiredMem
  );
  return crypto.scryptSync(passphrase, salt, 32, {
    N,
    r,
    p,
    maxmem,
  });
}

function wrapMasterKey(masterKey, kek, nonce) {
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, nonce);
  cipher.setAAD(Buffer.from(AAD_WRAP, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, tag };
}

function unwrapMasterKey(payload, kek) {
  const nonce = Buffer.from(payload.wrap.nonce_b64, "base64");
  const ciphertext = Buffer.from(payload.wrap.ciphertext_b64, "base64");
  const tag = Buffer.from(payload.wrap.tag_b64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, nonce);
  decipher.setAAD(Buffer.from(payload.wrap.aad, "utf8"));
  decipher.setAuthTag(tag);
  const masterKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return masterKey;
}

function withProtectedKek(passphrase, salt, kdf, useKek) {
  const kek = deriveKek(passphrase, salt, kdf);
  return withLockedBuffer(kek, () => useKek(kek));
}

function isSecureMemoryError(err) {
  return err instanceof Error && /^Secure memory\b/.test(err.message);
}

function getFileKey(masterKey, relPath) {
  const salt = Buffer.from(normalizeRelPath(relPath), "utf8");
  const info = Buffer.from(AAD_FILE_INFO, "utf8");
  return Buffer.from(crypto.hkdfSync("sha256", masterKey, salt, info, 32));
}

function withDerivedFileKey(masterKey, relPath, useFileKey) {
  const fileKey = getFileKey(masterKey, relPath);
  return withLockedBuffer(fileKey, () => useFileKey(fileKey));
}

function encodeEncryptedBuffer({ nonce, tag, ciphertext }) {
  const header = Buffer.concat([
    ENC_MAGIC,
    Buffer.from([ENC_VERSION]),
    nonce,
    tag,
  ]);
  return Buffer.concat([header, ciphertext]);
}

function decodeEncryptedHeader(buffer) {
  if (buffer.length < ENC_HEADER_BYTES) {
    throw new Error("Encrypted buffer too short");
  }
  const magic = buffer.subarray(0, 4);
  if (!magic.equals(ENC_MAGIC)) {
    throw new Error("Invalid encrypted file magic");
  }
  const version = buffer.readUInt8(4);
  if (version !== ENC_VERSION) {
    throw new Error(`Unsupported encrypted file version: ${version}`);
  }
  const nonceStart = 5;
  const nonceEnd = nonceStart + NONCE_BYTES;
  const tagEnd = nonceEnd + TAG_BYTES;
  const nonce = buffer.subarray(nonceStart, nonceEnd);
  const tag = buffer.subarray(nonceEnd, tagEnd);
  return { nonce, tag, headerLength: ENC_HEADER_BYTES };
}

function decodeEncryptedBuffer(buffer) {
  const { nonce, tag } = decodeEncryptedHeader(buffer);
  const ciphertext = buffer.subarray(ENC_HEADER_BYTES);
  return { nonce, tag, ciphertext };
}

function wireStreamKeyCleanup(stream, keyBuffer) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    keyBuffer.fill(0);
  };
  stream.once("end", cleanup);
  stream.once("close", cleanup);
  stream.once("error", cleanup);
}

function readEncryptedHeaderFromFile(inputPath) {
  const fd = fs.openSync(inputPath, "r");
  try {
    const header = Buffer.alloc(ENC_HEADER_BYTES);
    const bytesRead = fs.readSync(fd, header, 0, ENC_HEADER_BYTES, 0);
    if (bytesRead < ENC_HEADER_BYTES) {
      throw new Error("Encrypted buffer too short");
    }
    return decodeEncryptedHeader(header);
  } finally {
    fs.closeSync(fd);
  }
}

function writeAuthTagAtOffset(filePath, tagOffset, tagBuffer) {
  if (!Buffer.isBuffer(tagBuffer)) {
    throw new TypeError("writeAuthTagAtOffset expects a tag Buffer");
  }
  return withLockedTransientBuffer(tagBuffer, (lockedTag) => {
    const tagFd = fs.openSync(filePath, "r+");
    try {
      fs.writeSync(tagFd, lockedTag, 0, lockedTag.length, tagOffset);
    } finally {
      fs.closeSync(tagFd);
    }
  });
}

function encryptBuffer(masterKey, relPath, plainBuffer) {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  return withDerivedFileKey(masterKey, relPath, (fileKey) => {
    const cipher = crypto.createCipheriv("aes-256-gcm", fileKey, nonce);
    cipher.setAAD(Buffer.from(normalizeRelPath(relPath), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return encodeEncryptedBuffer({ nonce, tag, ciphertext });
  });
}

function decryptBuffer(masterKey, relPath, encryptedBuffer) {
  const { nonce, tag, ciphertext } = decodeEncryptedBuffer(encryptedBuffer);
  return withDerivedFileKey(masterKey, relPath, (fileKey) => {
    const decipher = crypto.createDecipheriv("aes-256-gcm", fileKey, nonce);
    decipher.setAAD(Buffer.from(normalizeRelPath(relPath), "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  });
}

function createVaultManager({ getLibraryRoot }) {
  let masterKey = null;

  function getRoot() {
    return getLibraryRoot();
  }

  function vaultFilePath() {
    return getVaultFilePath(getRoot());
  }

  function isInitialized() {
    return fs.existsSync(vaultFilePath());
  }

  function isUnlocked() {
    return Boolean(masterKey);
  }

  function vaultStatus() {
    const initialized = isInitialized();
    return {
      enabled: initialized,
      initialized,
      unlocked: initialized ? isUnlocked() : true,
    };
  }

  function vaultInit(passphrase) {
    if (isInitialized()) {
      return { ok: false, error: "Vault already initialized." };
    }
    const salt = crypto.randomBytes(16);
    const nonce = crypto.randomBytes(NONCE_BYTES);
    const mk = crypto.randomBytes(32);
    const wrapped = withProtectedKek(passphrase, salt, DEFAULT_KDF, (kek) => wrapMasterKey(mk, kek, nonce));

    const payload = {
      v: 1,
      kdf: {
        name: DEFAULT_KDF.name,
        N: DEFAULT_KDF.N,
        r: DEFAULT_KDF.r,
        p: DEFAULT_KDF.p,
        maxmem: DEFAULT_KDF.maxmem,
        salt_b64: salt.toString("base64"),
      },
      wrap: {
        alg: "aes-256-gcm",
        nonce_b64: nonce.toString("base64"),
        aad: AAD_WRAP,
        ciphertext_b64: wrapped.ciphertext.toString("base64"),
        tag_b64: wrapped.tag.toString("base64"),
      },
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(vaultFilePath(), JSON.stringify(payload, null, 2), "utf8");
    masterKey = mk;
    return { ok: true };
  }

  function vaultUnlock(passphrase) {
    if (!isInitialized()) {
      return { ok: false, error: "Vault not initialized." };
    }
    let payload;
    let salt;
    try {
      payload = JSON.parse(fs.readFileSync(vaultFilePath(), "utf8"));
      if (!payload?.kdf?.salt_b64) {
        throw new Error("Missing vault KDF salt");
      }
      salt = Buffer.from(payload.kdf.salt_b64, "base64");
    } catch (err) {
      return { ok: false, error: "Corrupted vault file." };
    }
    try {
      masterKey = withProtectedKek(passphrase, salt, payload.kdf, (kek) => unwrapMasterKey(payload, kek));
      return { ok: true };
    } catch (err) {
      if (isSecureMemoryError(err)) {
        throw err;
      }
      return { ok: false, error: "Wrong passphrase" };
    }
  }

  function vaultLock() {
    if (masterKey) {
      masterKey.fill(0);
    }
    masterKey = null;
    return { ok: true };
  }

  function createEncryptStream({ relPath }) {
    if (!masterKey) throw new Error("Vault locked");
    const nonce = crypto.randomBytes(NONCE_BYTES);
    const fileKey = getFileKey(masterKey, relPath);
    const cipher = crypto.createCipheriv("aes-256-gcm", fileKey, nonce);
    cipher.setAAD(Buffer.from(normalizeRelPath(relPath), "utf8"));
    wireStreamKeyCleanup(cipher, fileKey);
    const header = Buffer.concat([
      ENC_MAGIC,
      Buffer.from([ENC_VERSION]),
      nonce,
      Buffer.alloc(TAG_BYTES),
    ]);
    const tagOffset = ENC_MAGIC.length + 1 + NONCE_BYTES;
    const getAuthTag = () => cipher.getAuthTag();
    return { stream: cipher, header, tagOffset, getAuthTag };
  }

  async function encryptFileToPath({ relPath, inputPath, outputPath }) {
    const { stream, header, tagOffset, getAuthTag } = createEncryptStream({ relPath });
    let outputStream = null;
    try {
      fs.writeFileSync(outputPath, header);
      outputStream = fs.createWriteStream(outputPath, {
        flags: "r+",
        start: header.length,
      });
      await pipeline(fs.createReadStream(inputPath), stream, outputStream);
      const tag = getAuthTag();
      writeAuthTagAtOffset(outputPath, tagOffset, tag);
    } finally {
      if (outputStream) {
        outputStream.destroy();
      }
    }
  }

  async function encryptStreamToPath({ relPath, inputStream, outputPath }) {
    const { stream, header, tagOffset, getAuthTag } = createEncryptStream({ relPath });
    let outputStream = null;
    try {
      fs.writeFileSync(outputPath, header);
      outputStream = fs.createWriteStream(outputPath, {
        flags: "r+",
        start: header.length,
      });
      await pipeline(inputStream, stream, outputStream);
      const tag = getAuthTag();
      writeAuthTagAtOffset(outputPath, tagOffset, tag);
    } finally {
      if (outputStream) {
        outputStream.destroy();
      }
    }
  }

  function encryptBufferWithKey({ relPath, buffer }) {
    if (!masterKey) throw new Error("Vault locked");
    return encryptBuffer(masterKey, relPath, buffer);
  }

  function deriveFileKey(relPath) {
    if (!masterKey) throw new Error("Vault locked");
    return getFileKey(masterKey, relPath);
  }

  function withFileKey(relPath, useFileKey) {
    if (!masterKey) throw new Error("Vault locked");
    if (typeof useFileKey !== "function") {
      throw new TypeError("withFileKey expects a function");
    }
    return withDerivedFileKey(masterKey, relPath, useFileKey);
  }

  function decryptFileToStream({ relPath, inputPath }) {
    if (!masterKey) throw new Error("Vault locked");
    const { nonce, tag, headerLength } = readEncryptedHeaderFromFile(inputPath);
    const fileKey = getFileKey(masterKey, relPath);
    const decipher = crypto.createDecipheriv("aes-256-gcm", fileKey, nonce);
    decipher.setAAD(Buffer.from(normalizeRelPath(relPath), "utf8"));
    decipher.setAuthTag(tag);
    wireStreamKeyCleanup(decipher, fileKey);
    const stream = fs.createReadStream(inputPath, { start: headerLength });
    return stream.pipe(decipher);
  }

  async function decryptFileToBuffer({ relPath, inputPath }) {
    const decryptedStream = decryptFileToStream({ relPath, inputPath });
    return consumeBuffer(decryptedStream);
  }

  function decryptBufferWithKey({ relPath, buffer }) {
    if (!masterKey) throw new Error("Vault locked");
    return decryptBuffer(masterKey, relPath, buffer);
  }

  return {
    vaultStatus,
    vaultInit,
    vaultUnlock,
    vaultLock,
    isInitialized,
    isUnlocked,
    vaultFilePath,
    createEncryptStream,
    encryptFileToPath,
    encryptStreamToPath,
    encryptBufferWithKey,
    deriveFileKey,
    withFileKey,
    decryptFileToStream,
    decryptFileToBuffer,
    decryptBufferWithKey,
  };
}

module.exports = { createVaultManager };
