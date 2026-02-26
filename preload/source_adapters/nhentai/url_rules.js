const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["025cd83ae01cdc332a1698ec3aceec7c84b83557f5388968e02831e877688e07"]),
  pathPatterns: Object.freeze(["/g/*"]),
});

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesNhentaiGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  return matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  matchesNhentaiGalleryUrl,
  parseUrl,
};
