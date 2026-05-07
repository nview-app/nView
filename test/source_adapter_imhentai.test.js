const test = require('node:test');
const assert = require('node:assert/strict');

const { imhentaiSourceAdapter } = require('../preload/source_adapters/imhentai');

function makeElement({ text = '', attrs = {}, childText = '' } = {}) {
  return {
    textContent: text,
    childNodes: [{ textContent: childText }],
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    querySelector(selector) {
      if (selector === '.tags_text') return { textContent: attrs.tagsText || '' };
      if (selector === '.pages_num') return { textContent: attrs.pagesNum || '' };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a.tag') return attrs.tags || [];
      return [];
    },
  };
}

test('imhentai metadata extraction parses titles, tags and pages', () => {
  const parodies = [makeElement({ childText: 'naruto ' })];
  const characters = [makeElement({ childText: 'sakura haruno ' }), makeElement({ childText: 'tenten ' })];
  const tags = [makeElement({ childText: 'big breasts ' }), makeElement({ childText: 'anal ' })];
  const languages = [makeElement({ childText: 'japanese ' })];

  const containers = [
    makeElement({ attrs: { tagsText: 'Parodies:', tags: parodies } }),
    makeElement({ attrs: { tagsText: 'Characters:', tags: characters } }),
    makeElement({ attrs: { tagsText: 'Tags:', tags } }),
    makeElement({ attrs: { tagsText: 'Languages:', tags: languages } }),
    makeElement({ attrs: { tagsText: 'Pages:', pagesNum: '12' } }),
  ];

  const documentRef = {
    querySelector(selector) {
      if (selector === '#info h1') return { textContent: '[Amanagi Yakumo] Ero Gaki' };
      if (selector === '#info h2') return { textContent: '[あまなぎ八雲] エロ〇キ達' };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '#info .gallery-info .galleries_info') return containers;
      return [];
    },
  };

  const locationRef = { href: 'https://imhentai.to/g/650518/', pathname: '/g/650518/' };
  const meta = imhentaiSourceAdapter.extractMetadata(documentRef, locationRef);

  assert.equal(meta.galleryId, '650518');
  assert.equal(meta.comicName, '[Amanagi Yakumo] Ero Gaki');
  assert.deepEqual(meta.parodies, ['naruto']);
  assert.deepEqual(meta.characters, ['sakura haruno', 'tenten']);
  assert.deepEqual(meta.tags, ['big breasts', 'anal']);
  assert.deepEqual(meta.languages, ['japanese']);
  assert.equal(meta.pages, 12);
});

test('imhentai page URL extraction rewrites thumbnail URLs and deduplicates', () => {
  const images = [
    makeElement({ attrs: { 'data-src': 'https://zrocdn.xyz/galleries/3922755/1t.webp' } }),
    makeElement({ attrs: { src: 'https://zrocdn.xyz/galleries/3922755/2t.webp' } }),
    makeElement({ attrs: { src: 'https://zrocdn.xyz/galleries/3922755/2t.webp' } }),
  ];

  const documentRef = {
    querySelectorAll(selector) {
      if (selector === '#append_thumbs .gthumb img') return images;
      return [];
    },
  };

  const urls = imhentaiSourceAdapter.extractPageImageUrls(documentRef, { href: 'https://imhentai.to/g/650518/' });

  assert.deepEqual(urls, [
    'https://zrocdn.xyz/galleries/3922755/1.webp',
    'https://zrocdn.xyz/galleries/3922755/2.webp',
  ]);
});

test('imhentai URL matching only accepts gallery URLs', () => {
  assert.equal(imhentaiSourceAdapter.matchesUrl('https://imhentai.to/g/650518/'), true);
  assert.equal(imhentaiSourceAdapter.matchesUrl('https://imhentai.to/g/650518/1/'), false);
  assert.equal(imhentaiSourceAdapter.matchesUrl('https://example.com/g/650518/'), false);
});
