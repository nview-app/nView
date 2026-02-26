function toAbsoluteUrl(rawUrl, locationHref) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, locationHref).toString();
  } catch {
    return "";
  }
}

function normalizeImageUrl(rawUrl, locationHref) {
  const absolute = toAbsoluteUrl(rawUrl, locationHref).replace(/&amp;/gi, "&");
  if (!absolute) return "";

  try {
    const parsed = new URL(absolute);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractPageImageUrls(documentRef, locationRef) {
  const nodes = Array.from(documentRef.querySelectorAll("img.doujin"));

  const urls = nodes
    .map((img) => img.getAttribute("data-file") || img.dataset?.file || "")
    .map((raw) => normalizeImageUrl(raw, locationRef?.href))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

module.exports = {
  extractPageImageUrls,
  normalizeImageUrl,
};
