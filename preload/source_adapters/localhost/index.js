const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls, rewriteThumbToImageUrl } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesLocalhostGalleryUrl } = require("./url_rules");

const localhostSourceAdapter = {
  enabled: false,
  sourceId: "localhost",
  displayName: "localhost",
  defaultAllowedDomains: Object.freeze([
    "*.cloudflare.com",
    "*.hentai0.com",
    "*.jquery.com",
    "*.googleapis.com",
    "*.ehgt.org",
    "*.hath.network",
  ]),
  matchesUrl(urlValue) {
    return matchesLocalhostGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  rewriteThumbToImageUrl,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  localhostSourceAdapter,
};
