function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function toAbsoluteUrl(rawUrl, locationHref) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, locationHref).toString();
  } catch {
    return "";
  }
}

function parseHtml(htmlText, { domParserFactory } = {}) {
  if (domParserFactory) return domParserFactory(htmlText);
  if (typeof DOMParser === "undefined") return null;
  return new DOMParser().parseFromString(String(htmlText || ""), "text/html");
}

function parseGalleryPageCount(documentRef) {
  const gdt2 = Array.from(documentRef.querySelectorAll("#gdd td.gdt2"));
  if (gdt2.length < 2) return 1;
  const totalImages = Number.parseInt(textContent(gdt2[gdt2.length - 2]).replace(/\D/g, ""), 10);
  if (!Number.isFinite(totalImages) || totalImages < 1) return 1;
  return Math.max(1, Math.ceil(totalImages / 20));
}

function extractReaderPageUrls(documentRef, locationHref) {
  const pageLinks = Array.from(documentRef.querySelectorAll("#gdt a"))
    .map((link) => toAbsoluteUrl(link.getAttribute("href") || link.href || "", locationHref))
    .filter(Boolean);
  return Array.from(new Set(pageLinks));
}

function extractImageUrlFromReaderPage(documentRef, locationHref) {
  const imageNode = documentRef.querySelector("#img");
  if (!imageNode) return "";
  return toAbsoluteUrl(imageNode.getAttribute("src") || imageNode.src || imageNode.getAttribute("href") || "", locationHref);
}

async function extractPageImageUrls(documentRef, locationRef, helpers = {}) {
  const fetchImpl = helpers.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return [];

  const galleryBaseUrl = String(locationRef?.href || "").split("?p=")[0];
  const pageCount = parseGalleryPageCount(documentRef);
  const readerPageUrls = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    if (pageIndex === 0) {
      readerPageUrls.push(...extractReaderPageUrls(documentRef, galleryBaseUrl));
      continue;
    }
    const response = await fetchImpl(`${galleryBaseUrl}?p=${pageIndex}`);
    const html = await response.text();
    const pageDocument = parseHtml(html, helpers);
    if (!pageDocument) continue;
    readerPageUrls.push(...extractReaderPageUrls(pageDocument, galleryBaseUrl));
  }

  const uniqueReaderUrls = Array.from(new Set(readerPageUrls));
  const imageUrls = [];

  for (const readerUrl of uniqueReaderUrls) {
    const response = await fetchImpl(readerUrl);
    const html = await response.text();
    const pageDocument = parseHtml(html, helpers);
    if (!pageDocument) continue;
    const imageUrl = extractImageUrlFromReaderPage(pageDocument, readerUrl);
    if (imageUrl) imageUrls.push(imageUrl);
  }

  return Array.from(new Set(imageUrls));
}

module.exports = {
  extractPageImageUrls,
  parseGalleryPageCount,
  extractReaderPageUrls,
  extractImageUrlFromReaderPage,
};
