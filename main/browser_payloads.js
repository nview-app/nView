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

function sanitizeAltDownloadPayload(payload) {
  const imageUrlsRaw = Array.isArray(payload?.imageUrls) ? payload.imageUrls : [];
  const imageUrls = Array.from(
    new Set(imageUrlsRaw.map((item) => normalizeHttpUrl(item)).filter(Boolean)),
  );

  if (!imageUrls.length) {
    return { ok: false, error: "No valid image URLs were provided." };
  }
  if (imageUrls.length > 4000) {
    return { ok: false, error: "Too many image URLs." };
  }

  const context = {
    referer: normalizeHttpUrl(payload?.referer),
    origin: normalizeHttpUrl(payload?.origin),
    userAgent: String(payload?.userAgent || "").trim().slice(0, 512),
  };

  return {
    ok: true,
    imageUrls,
    meta: payload?.meta,
    context,
  };
}

module.exports = {
  normalizeHttpUrl,
  sanitizeAltDownloadPayload,
};
