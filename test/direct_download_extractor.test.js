const test = require('node:test');
const assert = require('node:assert/strict');

const fromHex = (hex) => Buffer.from(hex, 'hex').toString('utf8');

const {
  extractGalleryId,
  extractMetadata,
  extractPageImageUrls,
  rewriteThumbToImageUrl,
} = require('../preload/direct_download_extractor');

function makeElement({ text = '', attrs = {}, dataset = {}, query = {}, queryAll = {} } = {}) {
  return {
    textContent: text,
    dataset,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    querySelector(selector) {
      return query[selector] || null;
    },
    querySelectorAll(selector) {
      return queryAll[selector] || [];
    },
  };
}

function makeDocument() {
  const tagsContainer = makeElement({
    text: 'Tags:',
    queryAll: {
      '.tags .name': [makeElement({ text: 'tag-a' }), makeElement({ text: 'tag-b' })],
    },
  });
  const artistsContainer = makeElement({
    text: 'Artists:',
    queryAll: {
      '.tags .name': [makeElement({ text: 'artist-main' })],
    },
  });
  const pagesContainer = makeElement({
    text: 'Pages:',
    query: {
      '.tags .name': makeElement({ text: '47' }),
    },
  });

  const thumbs = [
    makeElement({ attrs: { 'data-src': 'https://t4.example.net/galleries/1/001t.jpg' } }),
    makeElement({ attrs: { src: '//t4.example.net/galleries/1/002t.png.png' } }),
    makeElement({ attrs: { src: '/galleries/1/003t.webp' } }),
  ];

  return {
    querySelector(selector) {
      const map = {
        '#info h1.title .pretty': makeElement({ text: 'Comic Name' }),
        '#info h1.title .before': makeElement({ text: '[artist-fallback]' }),
        '#gallery_id': makeElement({ text: '#123456' }),
      };
      return map[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '#tags .tag-container') {
        return [tagsContainer, artistsContainer, pagesContainer];
      }
      if (selector === '.thumbs .thumb-container img') {
        return thumbs;
      }
      return [];
    },
  };
}

test('extractMetadata returns expected metadata fields', () => {
  const documentRef = makeDocument();
  const locationRef = { href: fromHex('68747470733a2f2f6e68656e7461692e6e65742f672f3132333435362f616263') };

  const meta = extractMetadata(documentRef, locationRef);

  assert.equal(meta.sourceUrl, fromHex('68747470733a2f2f6e68656e7461692e6e65742f672f3132333435362f616263'));
  assert.equal(meta.galleryId, '123456');
  assert.equal(meta.comicName, 'Comic Name');
  assert.equal(meta.artist, 'artist-main');
  assert.deepEqual(meta.artists, ['artist-main']);
  assert.deepEqual(meta.tags, ['tag-a', 'tag-b']);
  assert.equal(meta.pages, 47);
  assert.equal(typeof meta.capturedAt, 'string');
  assert.equal(Number.isNaN(Date.parse(meta.capturedAt)), false);
});

test('extractPageImageUrls rewrites thumbnail URLs and deduplicates', () => {
  const documentRef = makeDocument();
  const locationRef = { href: fromHex('68747470733a2f2f6e68656e7461692e6e65742f672f3132333435362f616263') };

  const urls = extractPageImageUrls(documentRef, locationRef);

  assert.deepEqual(urls, [
    'https://i4.example.net/galleries/1/001.jpg',
    'https://i4.example.net/galleries/1/002.png',
    fromHex('68747470733a2f2f6e68656e7461692e6e65742f67616c6c65726965732f312f3030332e77656270'),
  ]);
});

test('rewriteThumbToImageUrl handles edge-case host and extension rewrites', () => {
  assert.equal(
    rewriteThumbToImageUrl('https://t12.cdn.site/images/0001t.jpg.jpg', { locationHref: 'https://source.test/g/1/1' }),
    'https://i12.cdn.site/images/0001.jpg',
  );
  assert.equal(
    rewriteThumbToImageUrl('http://t9.cdn.site/images/0002t.webp', { locationHref: 'https://source.test/g/1/1', useHttp: true }),
    'http://i9.cdn.site/images/0002.webp',
  );
  assert.equal(
    rewriteThumbToImageUrl('javascript:alert(1)', { locationHref: 'https://source.test/g/1/1' }),
    '',
  );
});

test('extractGalleryId falls back to path parsing when #gallery_id is missing', () => {
  const documentRef = {
    querySelector() {
      return null;
    },
  };

  const id = extractGalleryId(documentRef, { href: fromHex('68747470733a2f2f6e68656e7461692e6e65742f672f39393939392f7469746c652d736c7567'), pathname: '/g/99999/title-slug' });
  assert.equal(id, '99999');
});

test('extractors throw when no source adapter matches the URL', () => {
  const locationRef = { href: 'https://example.com/g/123/' };
  const documentRef = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  assert.throws(() => extractGalleryId(documentRef, locationRef), /No matching source adapter/);
  assert.throws(() => extractMetadata(documentRef, locationRef), /No matching source adapter/);
  assert.throws(() => extractPageImageUrls(documentRef, locationRef), /No matching source adapter/);
});
