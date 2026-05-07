const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["78ec961d47913a9a0006dd9d0b6b40aa3b5d1ca5ea11ef0670b82f72f97a021b"]),
  pathPatterns: Object.freeze(["/g/*"]),
});

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesImhentaiGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  const pathMatch = /^\/g\/\d+\/?$/i.test(parsed.pathname);
  if (!pathMatch) return false;
  return matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  matchesImhentaiGalleryUrl,
  parseUrl,
};
