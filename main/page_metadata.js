const MAX_DIMENSION_PX = 100_000;
const INDEX_PAGE_META_VERSION = 2;
const PAGE_MARK_OPTIONS = Object.freeze([
  "",
  "❤",
  "★",
  "➥",
  "✂",
  "⚑",
  "⚤",
  "⚣",
  "⚢",
  "⚥",
]);
const PAGE_MARK_SET = new Set(PAGE_MARK_OPTIONS);
const PAGE_NAME_MAX_LENGTH = 120;

function toSafeDimension(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 1 || numeric > MAX_DIMENSION_PX) return null;
  return numeric;
}

function parsePng(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const signature = buffer.slice(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(expected)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function parseGif(buffer) {
  if (!buffer || buffer.length < 10) return null;
  const header = buffer.slice(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function parseJpeg(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    offset += 2;
    if (segmentLength < 2 || offset + segmentLength - 2 > buffer.length) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && segmentLength >= 7) {
      const height = buffer.readUInt16BE(offset + 1);
      const width = buffer.readUInt16BE(offset + 3);
      return { width, height };
    }
    offset += segmentLength - 2;
  }
  return null;
}

function parseWebp(buffer) {
  if (!buffer || buffer.length < 30) return null;
  if (buffer.slice(0, 4).toString("ascii") !== "RIFF") return null;
  if (buffer.slice(8, 12).toString("ascii") !== "WEBP") return null;
  const chunkType = buffer.slice(12, 16).toString("ascii");
  if (chunkType === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunkType === "VP8 " && buffer.length >= 30) {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

function getImageMetadataFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  const parsed = parsePng(buffer) || parseJpeg(buffer) || parseWebp(buffer) || parseGif(buffer);
  if (!parsed) return null;
  const width = toSafeDimension(parsed.width);
  const height = toSafeDimension(parsed.height);
  if (!width || !height) return null;
  return { width, height, bytes: buffer.length };
}

function sanitizePageEntry(entry = {}) {
  const normalized = {
    file: String(entry.file || "").trim(),
    w: toSafeDimension(entry.w),
    h: toSafeDimension(entry.h),
    bytes: Number.isFinite(Number(entry.bytes)) && Number(entry.bytes) > 0 ? Math.floor(Number(entry.bytes)) : null,
    sourceMtimeMs:
      Number.isFinite(Number(entry.sourceMtimeMs)) && Number(entry.sourceMtimeMs) >= 0
        ? Math.floor(Number(entry.sourceMtimeMs))
        : null,
    sourceSize:
      Number.isFinite(Number(entry.sourceSize)) && Number(entry.sourceSize) > 0
        ? Math.floor(Number(entry.sourceSize))
        : null,
  };
  if (!normalized.file) return null;
  return normalized;
}

function sanitizePageMark(value) {
  const normalized = String(value || "").trim();
  return PAGE_MARK_SET.has(normalized) ? normalized : "";
}

function sanitizePageName(value) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, PAGE_NAME_MAX_LENGTH);
}

module.exports = {
  INDEX_PAGE_META_VERSION,
  PAGE_MARK_OPTIONS,
  getImageMetadataFromBuffer,
  sanitizePageMark,
  sanitizePageName,
  sanitizePageEntry,
  toSafeDimension,
};
