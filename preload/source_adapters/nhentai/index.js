const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls, rewriteThumbToImageUrl } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesNhentaiGalleryUrl } = require("./url_rules");

const nhentaiSourceAdapter = {
  sourceId: "nhentai",
  displayName: "nHentai",
  defaultAllowedDomains: Object.freeze([
    "*.cloudflare.com",
  ]),
  matchesUrl(urlValue) {
    return matchesNhentaiGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  rewriteThumbToImageUrl,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  nhentaiSourceAdapter,
};
