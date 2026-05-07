const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["2cb215b1d4043e4a608e4f690cd7952fea9ac43d154d496f054eb777e47e3c2e"]),
  pathPatterns: Object.freeze(["/comics/album/*", "/comics/album/*/*"]),
});

const MUSES_GALLERY_PATH_REGEX = /^\/comics\/album\/[^/?#]+(?:\/[^/?#]+){1,2}\/?$/iu;

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesComics8musesGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (!matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes)) return false;
  return MUSES_GALLERY_PATH_REGEX.test(parsed.pathname);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  parseUrl,
  matchesComics8musesGalleryUrl,
};
