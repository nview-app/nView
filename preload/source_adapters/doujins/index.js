const { extractMetadata, extractGalleryId } = require("./metadata_extractor");
const { extractPageImageUrls } = require("./page_list_extractor");
const { DIRECT_DOWNLOAD_RULES, matchesDoujinsGalleryUrl } = require("./url_rules");

const doujinsSourceAdapter = {
  sourceId: "doujins",
  displayName: "Doujins",
  defaultAllowedDomains: Object.freeze([
    "*.cloudflare.com",
    "*.hentai0.com",
    "*.jquery.com",
    "*.googleapis.com",
    "*.ehgt.org",
    "*.hath.network",
  ]),
  matchesUrl(urlValue) {
    return matchesDoujinsGalleryUrl(urlValue);
  },
  extractMetadata,
  extractPageImageUrls,
  extractGalleryId,
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
};

module.exports = {
  doujinsSourceAdapter,
};
