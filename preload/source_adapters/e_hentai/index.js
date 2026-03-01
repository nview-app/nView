const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesEHentaiGalleryUrl } = require("./url_rules");

const eHentaiSourceAdapter = {
  sourceId: "e-hentai",
  displayName: "E-Hentai",
  defaultAllowedDomains: Object.freeze([
    "*.cloudflare.com",
    "*.hentai0.com",
    "*.jquery.com",
    "*.googleapis.com",
    "*.ehgt.org",
    "*.hath.network",
  ]),
  matchesUrl(urlValue) {
    return matchesEHentaiGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  eHentaiSourceAdapter,
};
