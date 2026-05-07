function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function normalizeList(items) {
  return Array.from(new Set((items || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function extractGalleryId(_documentRef, locationRef) {
  const pathname = String(locationRef?.pathname || "").trim();
  if (!pathname) return "";
  return pathname.replace(/^\/+|\/+$/g, "");
}

function extractArtist(documentRef) {
  const links = Array.from(documentRef.querySelectorAll('.top-menu-breadcrumb ol li a[href^="/comics/album/"]'));
  if (!links.length) return null;
  return textContent(links[0]) || null;
}

function extractMetadata(documentRef, locationRef) {
  const comicName = textContent(documentRef.querySelector("head title")) || textContent(documentRef.querySelector("title")) || null;
  const artist = extractArtist(documentRef);
  const artists = normalizeList(artist ? [artist] : []);

  return {
    sourceUrl: String(locationRef?.href || ""),
    galleryId: extractGalleryId(documentRef, locationRef) || null,
    comicName,
    artists,
    artist: artist || null,
    tags: [],
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
