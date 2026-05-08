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

function parsePagesFromDocument(documentRef) {
  const pagesNode = Array.from(documentRef.querySelectorAll(".galleries_info li")).find((li) =>
    /\bpages\s*:/i.test((li.textContent || "").trim()),
  );
  const pagesText = (pagesNode?.textContent || "").trim();
  const pagesNum = Number.parseInt(pagesText.replace(/^.*?pages\s*:\s*/i, ""), 10);
  return Number.isFinite(pagesNum) && pagesNum > 0 ? pagesNum : null;
}

function extractPageImageUrls(documentRef, locationRef) {
  const thumbUrls = Array.from(documentRef.querySelectorAll("#append_thumbs .gthumb img"))
    .map((img) => img.getAttribute("data-src") || img.getAttribute("src") || img.dataset?.src || "")
    .map((raw) => rewriteThumbToImageUrl(raw, { locationHref: locationRef?.href }))
    .filter(Boolean);

  const firstUrl = thumbUrls[0] || "";
  const pagesCount = parsePagesFromDocument(documentRef);

  if (firstUrl && pagesCount) {
    let firstParsed;
    try {
      firstParsed = new URL(firstUrl);
    } catch {
      firstParsed = null;
    }

    const match = firstParsed?.pathname?.match(/^(.*\/)(\d+)(\.[a-z0-9]+)$/i);
    if (firstParsed && match) {
      const [, prefix, , extension] = match;
      return Array.from({ length: pagesCount }, (_, idx) => {
        firstParsed.pathname = `${prefix}${idx + 1}${extension}`;
        return firstParsed.toString();
      });
    }
  }

  return Array.from(new Set(thumbUrls));
}

module.exports = {
  extractPageImageUrls,
  rewriteThumbToImageUrl,
};
