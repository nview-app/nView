function toAbsoluteUrl(rawUrl, locationHref) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, locationHref).toString();
  } catch {
    return "";
  }
}

function rewriteThumbToImageUrl(rawUrl, locationHref) {
  const absolute = toAbsoluteUrl(rawUrl, locationHref);
  if (!absolute) return "";

  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  parsed.pathname = parsed.pathname.replace(/^\/image\/th\//i, "/image/fm/");
  return parsed.toString();
}

function extractPageImageUrls(documentRef, locationRef) {
  const nodes = Array.from(documentRef.querySelectorAll(".gallery img"));
  const urls = nodes
    .map((imageNode) => imageNode.getAttribute("data-src") || imageNode.getAttribute("src") || imageNode.dataset?.src || "")
    .map((rawUrl) => rewriteThumbToImageUrl(rawUrl, locationRef?.href))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

module.exports = {
  extractPageImageUrls,
  rewriteThumbToImageUrl,
};
