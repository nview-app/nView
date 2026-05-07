function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function extractGalleryId(documentRef, locationRef) {
  const match = String(locationRef?.pathname || "").match(/\/g\/(\d+)\//i);
  return match ? match[1] : "";
}

function extractMetadata(documentRef, locationRef) {
  const name =
    textContent(documentRef.querySelector("#info h1")) ||
    textContent(documentRef.querySelector("#info h2")) ||
    null;

  const secondaryTitle = textContent(documentRef.querySelector("#info h2"));
  const artistFromHeading = (secondaryTitle.match(/^\[([^\]]+)\]/) || [])[1] || null;

  const containers = Array.from(documentRef.querySelectorAll("#info .gallery-info .galleries_info"));

  const findContainer = (label) =>
    containers.find((container) =>
      textContent(container.querySelector(".tags_text"))
        .toLowerCase()
        .startsWith(label.toLowerCase()),
    );

  const namesFrom = (container) =>
    container
      ? Array.from(container.querySelectorAll("a.tag"))
          .map((entry) => entry.childNodes[0]?.textContent?.trim() || "")
          .filter(Boolean)
      : [];

  const pagesValue = textContent(findContainer("Pages:")?.querySelector(".pages_num"));
  const pagesNum = Number.parseInt(pagesValue, 10);

  const artists = namesFrom(findContainer("Artists:"));

  return {
    sourceUrl: String(locationRef?.href || ""),
    galleryId: extractGalleryId(documentRef, locationRef) || null,
    comicName: name,
    artists,
    artist: artists[0] || artistFromHeading,
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
