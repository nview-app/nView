function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function extractGalleryId(documentRef, locationRef) {
  const galleryIdRaw = textContent(documentRef.querySelector("#gallery_id"));
  if (galleryIdRaw) return galleryIdRaw.replace("#", "").trim();
  const match = String(locationRef?.pathname || "").match(/\/g\/(\d+)\//i);
  return match ? match[1] : "";
}

function extractMetadata(documentRef, locationRef) {
  const name =
    textContent(documentRef.querySelector("#info h1.title .pretty")) ||
    textContent(documentRef.querySelector("#info h2.title .pretty")) ||
    null;

  const hBefore = textContent(documentRef.querySelector("#info h1.title .before"));
  const artistFromHeading = hBefore ? hBefore.replace(/^\[|\]$/g, "").trim() : null;

  const containers = Array.from(documentRef.querySelectorAll("#tags .tag-container"));
  const findContainer = (label) =>
    containers.find((container) =>
      (textContent(container) || "").toLowerCase().startsWith(label.toLowerCase()),
    );

  const namesFrom = (container) =>
    container
      ? Array.from(container.querySelectorAll(".tags .name")).map(textContent).filter(Boolean)
      : [];

  const artists = namesFrom(findContainer("Artists:"));
  const pagesContainer = findContainer("Pages:");
  const pagesValue = pagesContainer ? textContent(pagesContainer.querySelector(".tags .name")) : "";
  const pagesNum = Number.parseInt(pagesValue, 10);

  return {
    sourceUrl: String(locationRef?.href || ""),
    galleryId: extractGalleryId(documentRef, locationRef) || null,
    comicName: name,
    artists,
    artist: artists[0] || artistFromHeading || null,
    tags: namesFrom(findContainer("Tags:")),
    parodies: namesFrom(findContainer("Parodies:")),
    characters: namesFrom(findContainer("Characters:")),
    languages: namesFrom(findContainer("Languages:")),
    pages: Number.isFinite(pagesNum) ? pagesNum : null,
    capturedAt: new Date().toISOString(),
  };
}

module.exports = {
  extractGalleryId,
  extractMetadata,
};
