function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function extractGalleryId(documentRef, locationRef) {
  const match = String(locationRef?.pathname || "").match(/\/gallery\/(\d+)\/?/i);
  return match ? match[1] : "";
}

function extractMetadata(documentRef, locationRef) {
  const detailsRoot = documentRef.querySelector(".right_details") || documentRef;
  const name = textContent(detailsRoot.querySelector("h1")) || null;

  const containers = Array.from(detailsRoot.querySelectorAll(".galleries_info li"));

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

  const pagesRaw = textContent(containers.find((container) => /\bpages\s*:/i.test(textContent(container))))
    .replace(/^.*?pages\s*:\s*/i, "");
  const pagesNum = Number.parseInt(pagesRaw, 10);

  const artists = namesFrom(findContainer("Artists:"));

  return {
    sourceUrl: String(locationRef?.href || ""),
    galleryId: extractGalleryId(documentRef, locationRef) || null,
    comicName: name,
    artists,
    artist: artists[0] || null,
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
