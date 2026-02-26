const MAX_DIRECT_IMAGE_URLS = 4000;
const MAX_META_STRING_LEN = 300;
const MAX_META_NAME_LEN = 120;
const MAX_META_LIST_ITEMS = 128;
const MAX_GALLERY_ID_LEN = 64;
const MAX_SOURCE_ID_LEN = 64;

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeText(value, maxLen = MAX_META_STRING_LEN) {
  const normalized = normalizeWhitespace(value).replace(/[<>]/g, "");
  if (!normalized) return "";
  return normalized.slice(0, maxLen);
}

function sanitizeNameList(values) {
  const normalizedValues = Array.isArray(values) ? values : [];
  return Array.from(
    new Set(
      normalizedValues
        .map((entry) => sanitizeText(entry, MAX_META_NAME_LEN))
        .filter(Boolean),
    ),
  ).slice(0, MAX_META_LIST_ITEMS);
}

function sanitizeGalleryId(value) {
  const normalized = sanitizeText(value, MAX_GALLERY_ID_LEN);
  if (!normalized) return null;
  return normalized;
}

function sanitizeSourceId(value) {
  const normalized = sanitizeText(value, MAX_SOURCE_ID_LEN).toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9._-]+$/.test(normalized)) return null;
  return normalized;
}

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  return parsed.toString();
}

function sanitizeHeaderUrl(value, { asOrigin = false } = {}) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized || /[\r\n]/.test(normalized)) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) return "";
    return asOrigin ? parsed.origin : parsed.toString();
  } catch {
    return "";
  }
}

function sanitizeUserAgent(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || /[\r\n]/.test(normalized)) return "";
  return normalized.slice(0, 512);
}

function sanitizeMeta(meta, imageCount, options = {}) {
  const sourceUrl = sanitizeHeaderUrl(meta?.sourceUrl);
  const artists = sanitizeNameList(meta?.artists);
  const tags = sanitizeNameList(meta?.tags);
  const parodies = sanitizeNameList(meta?.parodies);
  const characters = sanitizeNameList(meta?.characters);
  const languages = sanitizeNameList(meta?.languages);
  const artist = sanitizeText(meta?.artist, MAX_META_NAME_LEN) || artists[0] || null;
  const pageCount = Number.parseInt(meta?.pages, 10);
  const pages = Number.isFinite(pageCount) && pageCount >= 0
    ? Math.min(pageCount, Math.max(imageCount, 10000))
    : null;

  const resolvedSourceId = sanitizeSourceId(options?.resolvedSourceId);

  return {
    sourceUrl,
    sourceId: resolvedSourceId || sanitizeSourceId(meta?.sourceId),
    galleryId: sanitizeGalleryId(meta?.galleryId),
    comicName: sanitizeText(meta?.comicName, MAX_META_STRING_LEN) || null,
    artists,
    artist,
    tags,
    parodies,
    characters,
    languages,
    pages,
    capturedAt: sanitizeText(meta?.capturedAt, 64) || new Date().toISOString(),
  };
}

function sanitizeAltDownloadPayload(payload, options = {}) {
  const imageUrlsRaw = Array.isArray(payload?.imageUrls) ? payload.imageUrls : [];
  const imageUrls = Array.from(
    new Set(imageUrlsRaw.map((item) => normalizeHttpUrl(item)).filter(Boolean)),
  );

  if (!imageUrls.length) {
    return { ok: false, error: "No valid image URLs were provided." };
  }
  if (imageUrls.length > MAX_DIRECT_IMAGE_URLS) {
    return { ok: false, error: "Too many image URLs." };
  }
  const context = {
    referer: sanitizeHeaderUrl(payload?.referer),
    origin: sanitizeHeaderUrl(payload?.origin, { asOrigin: true }),
    userAgent: sanitizeUserAgent(payload?.userAgent),
  };

  const sanitizedMeta = sanitizeMeta(payload?.meta, imageUrls.length, options);
  if (!sanitizedMeta.sourceUrl && context.referer) {
    sanitizedMeta.sourceUrl = context.referer;
  }

  return {
    ok: true,
    imageUrls,
    meta: sanitizedMeta,
    context,
  };
}

module.exports = {
  normalizeHttpUrl,
  sanitizeAltDownloadPayload,
};
