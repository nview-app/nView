const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["f7d5c035f2f1f51f77c3f7c3b5f1642531e12b63e53e439b8f701001b52a3cce"]),
  pathPatterns: Object.freeze(["/*/*"]),
});

// URL format: /<category>/<title>-<5-digit>
const DOUJINS_GALLERY_PATH_REGEX = /^\/[a-z0-9-]+\/[a-z0-9-]+-\d{5}\/?$/iu;

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesDoujinsGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (!matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes)) return false;
  return DOUJINS_GALLERY_PATH_REGEX.test(parsed.pathname);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  parseUrl,
  matchesDoujinsGalleryUrl,
};
