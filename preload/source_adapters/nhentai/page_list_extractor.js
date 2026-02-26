function toAbsoluteUrl(rawUrl, locationHref) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, locationHref).toString();
  } catch {
    return "";
  }
}

function rewriteThumbToImageUrl(raw, { locationHref, useHttp = false } = {}) {
  const absolute = toAbsoluteUrl(raw, locationHref);
  if (!absolute) return "";

  let parsed;
  try {
    parsed = new URL(absolute);
  } catch {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  parsed.protocol = useHttp ? "http:" : "https:";

  const host = parsed.hostname.toLowerCase();
  const hostMatch = host.match(/^t(\d+)\.(.+)$/i);
  if (hostMatch) {
    parsed.hostname = `i${hostMatch[1]}.${hostMatch[2]}`;
  } else {
    parsed.hostname = parsed.hostname.replace(/^t(?=\d)/i, "i");
  }

  const segments = parsed.pathname.split("/");
  const filename = segments.pop();
  if (filename) {
    let next = filename.replace(/t(\.[^.]+)(\.[^.]+)?$/i, "$1$2");
    const dupMatch = next.match(/(\.[^.]+)\1$/i);
    if (dupMatch) next = next.slice(0, -dupMatch[1].length);
    segments.push(next);
    parsed.pathname = segments.join("/");
  }

  return parsed.toString();
}

function extractPageImageUrls(documentRef, locationRef, { useHttp = false } = {}) {
  const nodes = Array.from(documentRef.querySelectorAll(".thumbs .thumb-container img"));

  const urls = nodes
    .map((img) => img.getAttribute("data-src") || img.getAttribute("src") || img.dataset?.src || "")
    .map((raw) => rewriteThumbToImageUrl(raw, { locationHref: locationRef?.href, useHttp }))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

module.exports = {
  extractPageImageUrls,
  rewriteThumbToImageUrl,
};
