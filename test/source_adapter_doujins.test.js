const test = require('node:test');
const assert = require('node:assert/strict');

const fromHex = (hex) => Buffer.from(hex, 'hex').toString('utf8');

const { doujinsSourceAdapter } = require('../preload/source_adapters/doujins');
const { normalizeImageUrl } = require('../preload/source_adapters/doujins/page_list_extractor');

function makeElement({ text = '', attrs = {}, dataset = {} } = {}) {
  return {
    textContent: text,
    dataset,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
  };
}

test('doujins adapter only matches gallery pages in /<category>/<title>-<5-digit> format', () => {
  assert.equal(doujinsSourceAdapter.matchesUrl(fromHex("68747470733a2f2f646f756a696e732e636f6d2f")), false);
  assert.equal(doujinsSourceAdapter.matchesUrl(fromHex("68747470733a2f2f646f756a696e732e636f6d2f626c75652d617263686976652f5449544c455f504c414345484f4c4445522d3937373135")), false);
  assert.equal(doujinsSourceAdapter.matchesUrl(fromHex("68747470733a2f2f646f756a696e732e636f6d2f626c75652d617263686976652f7469746c652d3937373135")), true);
  assert.equal(doujinsSourceAdapter.matchesUrl(fromHex("68747470733a2f2f646f756a696e732e636f6d2f73656172636865733f7461675f69643d31")), false);
  assert.equal(doujinsSourceAdapter.matchesUrl(fromHex("68747470733a2f2f646f756a696e732e636f6d2f626c75652d617263686976652f7469746c652d39373731")), false);
});

test('doujins metadata extractor returns title, first artist and tags', () => {
  const documentRef = {
    querySelectorAll(selector) {
      if (selector === '.folder-title a') {
        return [
          makeElement({ text: 'Blue Archive' }),
          makeElement({ text: 'Doujins' }),
          makeElement({ text: 'TITLE_PLACEHOLDER' }),
        ];
      }
      if (selector === '.gallery-artist a') {
        return [makeElement({ text: 'Midori' }), makeElement({ text: 'Midorineko' })];
      }
      if (selector === 'li.tag-area a') {
        return [makeElement({ text: 'AAA' }), makeElement({ text: 'BBB' }), makeElement({ text: 'CCC' })];
      }
      return [];
    },
  };
  const locationRef = {
    href: fromHex("68747470733a2f2f646f756a696e732e636f6d2f626c75652d617263686976652f5449544c455f504c414345484f4c4445522d393737313523"),
    pathname: '/blue-archive/TITLE_PLACEHOLDER-97715',
  };

  const meta = doujinsSourceAdapter.extractMetadata(documentRef, locationRef);

  assert.equal(meta.sourceUrl, locationRef.href);
  assert.equal(meta.galleryId, '97715');
  assert.equal(meta.comicName, 'TITLE_PLACEHOLDER');
  assert.equal(meta.artist, 'Midori');
  assert.deepEqual(meta.artists, ['Midori', 'Midorineko']);
  assert.deepEqual(meta.tags, ['AAA', 'BBB', 'CCC']);
  assert.equal(meta.pages, null);
});

test('doujins page image extractor uses data-file and normalizes HTML entities', () => {
  const documentRef = {
    querySelectorAll(selector) {
      if (selector !== 'img.doujin') return [];
      return [
        makeElement({ attrs: { 'data-file': fromHex("68747470733a2f2f7374617469632e646f756a696e732e636f6d2f6e2d612e6a70673f73743d61626326616d703b653d31") } }),
        makeElement({ attrs: { 'data-file': fromHex("68747470733a2f2f7374617469632e646f756a696e732e636f6d2f6e2d612e6a70673f73743d61626326616d703b653d31") } }),
        makeElement({ attrs: { 'data-file': '/n-b.jpg?st=def&amp;e=2' } }),
      ];
    },
  };
  const locationRef = { href: fromHex("68747470733a2f2f646f756a696e732e636f6d2f706174682f70616765") };

  const urls = doujinsSourceAdapter.extractPageImageUrls(documentRef, locationRef);

  assert.deepEqual(urls, [
    fromHex("68747470733a2f2f7374617469632e646f756a696e732e636f6d2f6e2d612e6a70673f73743d61626326653d31"),
    fromHex("68747470733a2f2f646f756a696e732e636f6d2f6e2d622e6a70673f73743d64656626653d32"),
  ]);
  assert.equal(normalizeImageUrl('javascript:alert(1)', locationRef.href), '');
});
