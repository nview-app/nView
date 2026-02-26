const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["3fb176de1f182db3db9258c4fb8602536d9f39ff4b8b209afd0b57188544b5a1"]),
  pathPatterns: Object.freeze(["/g/*/*"]),
});

// Gallery URL format: /g/<gallery-id>/<gallery-token>/
const E_HENTAI_GALLERY_PATH_REGEX = /^\/g\/\d+\/[a-z0-9]+\/?$/iu;

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesEHentaiGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (!matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes)) return false;
  return E_HENTAI_GALLERY_PATH_REGEX.test(parsed.pathname);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  matchesEHentaiGalleryUrl,
  parseUrl,
};
