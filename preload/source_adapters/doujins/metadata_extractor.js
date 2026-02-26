function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function normalizeList(items) {
  return Array.from(new Set((items || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function extractGalleryId(_documentRef, locationRef) {
  const pathname = String(locationRef?.pathname || "");
  const match = pathname.match(/-(\d+)(?:$|[/?#])/);
  return match ? match[1] : "";
}

function extractMetadata(documentRef, locationRef) {
  const titleLinks = Array.from(documentRef.querySelectorAll(".folder-title a"));
  const title = textContent(titleLinks[titleLinks.length - 1]) || null;

  const artistLinks = Array.from(documentRef.querySelectorAll(".gallery-artist a"));
  const artists = normalizeList(artistLinks.map(textContent));

  const tagLinks = Array.from(documentRef.querySelectorAll("li.tag-area a"));
  const tags = normalizeList(tagLinks.map(textContent));

  return {
    sourceUrl: String(locationRef?.href || ""),
    galleryId: extractGalleryId(documentRef, locationRef) || null,
    comicName: title,
    artists,
    artist: artists[0] || null,
    tags,
    parodies: [],
    characters: [],
    languages: [],
    pages: null,
    capturedAt: new Date().toISOString(),
  };
}

module.exports = {
  extractGalleryId,
  extractMetadata,
};
