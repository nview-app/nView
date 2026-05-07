const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls, rewriteThumbToImageUrl } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesImhentaiGalleryUrl } = require("./url_rules");

const imhentaiSourceAdapter = {
  sourceId: "imhentai",
  displayName: "IMHentai",
  defaultAllowedDomains: Object.freeze(["*.zrocdn.xyz", "*.cloudflare.com", "*.bootstrapcdn.com"]),
  matchesUrl(urlValue) {
    return matchesImhentaiGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  rewriteThumbToImageUrl,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  imhentaiSourceAdapter,
};
