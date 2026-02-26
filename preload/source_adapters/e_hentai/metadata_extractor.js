function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function normalizeList(items) {
  return Array.from(new Set((items || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function findTagRow(documentRef, label) {
  const rows = Array.from(documentRef.querySelectorAll("tr"));
  const normalizedLabel = `${String(label || "").trim().toLowerCase()}:`;
  return rows.find((row) => {
    const keyCell = row.querySelector("td.tc");
    return textContent(keyCell).toLowerCase() === normalizedLabel;
  });
}

function valuesFromTagRow(documentRef, label) {
  const row = findTagRow(documentRef, label);
  if (!row) return [];
  return normalizeList(Array.from(row.querySelectorAll("a")).map(textContent));
}

function parsePages(documentRef) {
  const rows = Array.from(documentRef.querySelectorAll("#gdd tr"));
  for (const row of rows) {
    const label = textContent(row.querySelector("td.gdt1")).toLowerCase();
    if (label !== "length:") continue;
    const raw = textContent(row.querySelector("td.gdt2"));
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function extractGalleryId(_documentRef, locationRef) {
  const pathname = String(locationRef?.pathname || "");
  const match = pathname.match(/\/g\/(\d+)\//i);
  return match ? match[1] : "";
}

function extractMetadata(documentRef, locationRef) {
  const comicName =
    textContent(documentRef.querySelector("#gd2 #gn")) || textContent(documentRef.querySelector("#gd2 #gj")) || null;
  const artists = valuesFromTagRow(documentRef, "artist");
  const parodies = valuesFromTagRow(documentRef, "parody");
  const characters = valuesFromTagRow(documentRef, "character");
  const languagesFromTags = valuesFromTagRow(documentRef, "language");

  const explicitLanguage = (() => {
    const rows = Array.from(documentRef.querySelectorAll("#gdd tr"));
    const row = rows.find((entry) => textContent(entry.querySelector("td.gdt1")).toLowerCase() === "language:");
    if (!row) return "";
    return textContent(row.querySelector("td.gdt2")).replace(/\u00a0/g, " ").trim();
  })();

  const tags = normalizeList(
    ["female", "male", "other", "mixed", "cosplayer", "reclass"].flatMap((group) => valuesFromTagRow(documentRef, group)),
  );

  const languages = normalizeList([...languagesFromTags, explicitLanguage]);

  return {
    sourceUrl: String(locationRef?.href || ""),
    galleryId: extractGalleryId(documentRef, locationRef) || null,
    comicName,
    artists,
    artist: artists[0] || null,
    tags,
    parodies,
    characters,
    languages,
    pages: parsePages(documentRef),
    capturedAt: new Date().toISOString(),
  };
}

module.exports = {
  extractGalleryId,
  extractMetadata,
};
