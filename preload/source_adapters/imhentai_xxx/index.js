const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls, rewriteThumbToImageUrl } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesImhentaiXxxGalleryUrl } = require("./url_rules");

const imhentaiXxxSourceAdapter = {
  sourceId: "imhentai_xxx",
  displayName: "IMHentai(xxx)",
  defaultAllowedDomains: Object.freeze(["*.imhentai.xxx", "*.cloudflare.com", "*.bootstrapcdn.com", "*.googleapis.com"]),
  matchesUrl(urlValue) {
    return matchesImhentaiXxxGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  rewriteThumbToImageUrl,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  imhentaiXxxSourceAdapter,
};
