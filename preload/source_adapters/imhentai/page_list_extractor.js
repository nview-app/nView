function toAbsoluteUrl(rawUrl, locationHref) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, locationHref).toString();
  } catch {
    return "";
  }
}

function rewriteThumbToImageUrl(raw, { locationHref } = {}) {
  const absolute = toAbsoluteUrl(raw, locationHref);
  if (!absolute) return "";

  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

  parsed.pathname = parsed.pathname.replace(/(\d+)t(\.[a-z0-9]+)$/i, "$1$2");

  return parsed.toString();
}

function extractPageImageUrls(documentRef, locationRef) {
  const nodes = Array.from(documentRef.querySelectorAll("#append_thumbs .gthumb img"));

  const urls = nodes
    .map((img) => img.getAttribute("data-src") || img.getAttribute("src") || img.dataset?.src || "")
    .map((raw) => rewriteThumbToImageUrl(raw, { locationHref: locationRef?.href }))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

module.exports = {
  extractPageImageUrls,
  rewriteThumbToImageUrl,
};
