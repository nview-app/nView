const test = require('node:test');
const assert = require('node:assert/strict');

const fromHex = (hex) => Buffer.from(hex, 'hex').toString('utf8');

const {
  SOURCE_ADAPTERS_BY_ID,
  SOURCE_ADAPTER_IDS,
  getSourceAdapterById,
  resolveSourceAdapter,
  resolveSourceAdapterForStartPage,
} = require('../preload/source_adapters/registry');

test('registry auto-discovers enabled adapters and excludes disabled adapters', () => {
  assert.ok(SOURCE_ADAPTER_IDS.includes('doujins'));
  assert.ok(SOURCE_ADAPTER_IDS.includes('nhentai'));
  assert.ok(SOURCE_ADAPTER_IDS.includes('e-hentai'));
  assert.ok(SOURCE_ADAPTER_IDS.includes('stub-template'));
  assert.equal(SOURCE_ADAPTERS_BY_ID.doujins.sourceId, 'doujins');
  assert.equal(SOURCE_ADAPTERS_BY_ID.nhentai.sourceId, 'nhentai');
  assert.equal(SOURCE_ADAPTERS_BY_ID['e-hentai'].sourceId, 'e-hentai');
  assert.equal(SOURCE_ADAPTERS_BY_ID['stub-template'].sourceId, 'stub-template');

  assert.ok(!SOURCE_ADAPTER_IDS.includes('localhost'));
});

test('resolveSourceAdapter returns doujins adapter for supported doujins URLs', () => {
  const adapter = resolveSourceAdapter(fromHex("68747470733a2f2f646f756a696e732e636f6d2f626c75652d617263686976652d3532393130"));
  assert.ok(adapter);
  assert.equal(adapter.sourceId, 'doujins');
  assert.equal(typeof adapter.extractMetadata, 'function');
  assert.equal(typeof adapter.extractPageImageUrls, 'function');
  assert.equal(typeof adapter.matchesUrl, 'function');
});

test('resolveSourceAdapter returns null for unsupported URL', () => {
  const adapter = resolveSourceAdapter('https://example.com/not-supported/123');
  assert.equal(adapter, null);
});

test('getSourceAdapterById returns null for unknown source', () => {
  assert.equal(getSourceAdapterById('does-not-exist'), null);
});


test('resolveSourceAdapterForStartPage accepts supported source root URLs', () => {
  const eHentai = resolveSourceAdapterForStartPage(fromHex("68747470733a2f2f652d68656e7461692e6f7267"));
  assert.ok(eHentai);
  assert.equal(eHentai.sourceId, 'e-hentai');

  const doujins = resolveSourceAdapterForStartPage(fromHex("68747470733a2f2f646f756a696e732e636f6d"));
  assert.ok(doujins);
  assert.equal(doujins.sourceId, 'doujins');
});
