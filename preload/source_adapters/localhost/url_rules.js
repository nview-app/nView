const { normalizeHttpUrl, matchesUrlHashes } = require("../url_identity");

const DIRECT_DOWNLOAD_RULES = Object.freeze({
  originHashes: Object.freeze(["8605b8ba08c20d42f9e455151871896d0e0de980596286fb736d11eec013e2a4"]),
  pathPatterns: Object.freeze(["/g/*"]),
});

function parseUrl(value) {
  return normalizeHttpUrl(value);
}

function matchesLocalhostGalleryUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  return matchesUrlHashes(parsed.href, DIRECT_DOWNLOAD_RULES.originHashes);
}

module.exports = {
  DIRECT_DOWNLOAD_RULES,
  matchesLocalhostGalleryUrl,
  parseUrl,
};
