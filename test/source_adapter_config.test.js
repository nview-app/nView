const test = require('node:test');
const assert = require('node:assert/strict');

const { SOURCE_ADAPTERS_BY_ID } = require('../preload/source_adapters/registry');

test('source adapters own direct download rules in their adapter definitions', () => {
  assert.deepEqual(SOURCE_ADAPTERS_BY_ID.doujins.directDownloadRules.pathPatterns, ['/*/*']);
  assert.equal(Array.isArray(SOURCE_ADAPTERS_BY_ID.doujins.directDownloadRules.originHashes), true);
  assert.equal(SOURCE_ADAPTERS_BY_ID.doujins.directDownloadRules.originHashes.length, 1);

  assert.deepEqual(SOURCE_ADAPTERS_BY_ID.nhentai.directDownloadRules.pathPatterns, ['/g/*']);
  assert.equal(Array.isArray(SOURCE_ADAPTERS_BY_ID.nhentai.directDownloadRules.originHashes), true);
  assert.equal(SOURCE_ADAPTERS_BY_ID.nhentai.directDownloadRules.originHashes.length, 1);

  assert.deepEqual(SOURCE_ADAPTERS_BY_ID['e-hentai'].directDownloadRules.pathPatterns, ['/g/*/*']);
  assert.equal(Array.isArray(SOURCE_ADAPTERS_BY_ID['e-hentai'].directDownloadRules.originHashes), true);
  assert.equal(SOURCE_ADAPTERS_BY_ID['e-hentai'].directDownloadRules.originHashes.length, 1);

  assert.deepEqual(SOURCE_ADAPTERS_BY_ID['stub-template'].directDownloadRules, {
    hosts: [],
    pathPatterns: [],
  });
});
