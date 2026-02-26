/**
 * Stub source adapter template.
 *
 * Copy this file to `preload/source_adapters/<source-id>/index.js` when adding
 * a new source adapter. Replace the placeholder methods with real extraction
 * logic and URL matching for the target source.
 */
const DIRECT_DOWNLOAD_RULES = Object.freeze({
  hosts: Object.freeze([]),
  pathPatterns: Object.freeze([]),
});

const stubTemplateSourceAdapter = {
  sourceId: "stub-template",
  defaultAllowedDomains: Object.freeze([]),
  directDownloadRules: DIRECT_DOWNLOAD_RULES,
  matchesUrl() {
    // TODO: return true when url belongs to your source.
    return false;
  },
  extractMetadata(_documentRef, locationRef) {
    // TODO: return Source Adapter Contract metadata payload.
    return {
      sourceUrl: String(locationRef?.href || ""),
      galleryId: null,
      comicName: null,
      artists: [],
      artist: null,
      tags: [],
      parodies: [],
      characters: [],
      languages: [],
      pages: null,
      capturedAt: new Date().toISOString(),
    };
  },
  extractPageImageUrls() {
    // TODO: return de-duplicated http/https page image URLs.
    return [];
  },
};

module.exports = {
  stubTemplateSourceAdapter,
};
