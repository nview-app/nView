/**
 * @typedef {Object} DirectDownloadMetadata
 * @property {string} sourceUrl
 * @property {string|null} galleryId
 * @property {string|null} comicName
 * @property {string[]} artists
 * @property {string|null} artist
 * @property {string[]} tags
 * @property {string[]} parodies
 * @property {string[]} characters
 * @property {string[]} languages
 * @property {number|null} pages
 * @property {string} capturedAt
 */

/**
 * @typedef {Object} DirectDownloadExtractionPayload
 * @property {DirectDownloadMetadata} meta
 * @property {string[]} imageUrls
 */

const { resolveSourceAdapter } = require("./source_adapters/registry");
const { nhentaiSourceAdapter } = require("./source_adapters/nhentai");

function getSourceAdapter(locationRef) {
  return resolveSourceAdapter(locationRef?.href || "");
}

function resolveRequiredSourceAdapter(locationRef) {
  const adapter = getSourceAdapter(locationRef);
  if (adapter) return adapter;
  throw new Error("No matching source adapter for URL.");
}

function extractGalleryId(documentRef, locationRef) {
  return resolveRequiredSourceAdapter(locationRef).extractGalleryId(documentRef, locationRef);
}

function extractMetadata(documentRef, locationRef) {
  return resolveRequiredSourceAdapter(locationRef).extractMetadata(documentRef, locationRef);
}

function extractPageImageUrls(documentRef, locationRef, helpers) {
  return resolveRequiredSourceAdapter(locationRef).extractPageImageUrls(documentRef, locationRef, helpers);
}

module.exports = {
  extractGalleryId,
  extractMetadata,
  extractPageImageUrls,
  rewriteThumbToImageUrl: nhentaiSourceAdapter.rewriteThumbToImageUrl,
};
