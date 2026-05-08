const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["08b7103ee2cfb468808d3bde22df9fa7d75203ec2758895cdd7be158486935a1"]),
  pathPatterns: Object.freeze(["/gallery/*"]),
});

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesImhentaiXxxGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  const pathMatch = /^\/gallery\/\d+\/?$/i.test(parsed.pathname);
  if (!pathMatch) return false;
  return matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  matchesImhentaiXxxGalleryUrl,
  parseUrl,
};
