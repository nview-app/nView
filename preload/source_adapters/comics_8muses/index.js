const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls, rewriteThumbToImageUrl } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesComics8musesGalleryUrl } = require("./url_rules");

const comics8musesSourceAdapter = {
  sourceId: "comics_8muses",
  displayName: "8Muses Comics",
  defaultAllowedDomains: Object.freeze([]),
  matchesUrl(urlValue) {
    return matchesComics8musesGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  rewriteThumbToImageUrl,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  comics8musesSourceAdapter,
};
