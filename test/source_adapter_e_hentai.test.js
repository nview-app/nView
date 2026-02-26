const test = require('node:test');
const assert = require('node:assert/strict');

const fromHex = (hex) => Buffer.from(hex, 'hex').toString('utf8');

const { eHentaiSourceAdapter } = require('../preload/source_adapters/e_hentai');

function makeTagRow(label, values) {
  return {
    querySelector(selector) {
      if (selector === 'td.tc') return { textContent: `${label}:` };
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== 'a') return [];
      return values.map((value) => ({ textContent: value }));
    },
  };
}

function makeDetailRow(label, value) {
  return {
    querySelector(selector) {
      if (selector === 'td.gdt1') return { textContent: `${label}:` };
      if (selector === 'td.gdt2') return { textContent: value };
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test('e-hentai adapter matches gallery URLs only', () => {
  assert.equal(eHentaiSourceAdapter.matchesUrl(fromHex("68747470733a2f2f652d68656e7461692e6f72672f")), false);
  assert.equal(eHentaiSourceAdapter.matchesUrl(fromHex("68747470733a2f2f652d68656e7461692e6f72672f672f3132332f616263")), true);
  assert.equal(eHentaiSourceAdapter.matchesUrl(fromHex("68747470733a2f2f652d68656e7461692e6f72672f672f3132332f6162632f")), true);
  assert.equal(eHentaiSourceAdapter.matchesUrl(fromHex("68747470733a2f2f652d68656e7461692e6f72672f672f6162632f313233")), false);
  assert.equal(eHentaiSourceAdapter.matchesUrl(fromHex("68747470733a2f2f652d68656e7461692e6f72672f7461672f66656d616c653a736f6c652b66656d616c65")), false);
});

test('e-hentai metadata extractor collects title, artist, language, and tag groups', () => {
  const rows = [
    makeTagRow('artist', ['himura kiseki']),
    makeTagRow('parody', ['douluo continent']),
    makeTagRow('character', ['jingliu', 'ruan mei', 'stelle']),
    makeTagRow('female', ['sole female', 'very long hair']),
    makeTagRow('male', ['masked face']),
    makeTagRow('other', ['variant set']),
    makeTagRow('language', ['english']),
    makeDetailRow('Language', 'Japanese \u00a0'),
    makeDetailRow('Length', '48 pages'),
  ];

  const documentRef = {
    querySelector(selector) {
      if (selector === '#gd2 #gn') return { textContent: 'TITLE_PLACEHOLDER' };
      if (selector === '#gd2 #gj') return { textContent: '' };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'tr') return rows;
      if (selector === '#gdd tr') return rows;
      return [];
    },
  };

  const locationRef = {
    href: fromHex("68747470733a2f2f652d68656e7461692e6f72672f672f3131312f6162636465662f"),
    pathname: '/g/111/abcdef/',
  };

  const meta = eHentaiSourceAdapter.extractMetadata(documentRef, locationRef);

  assert.equal(meta.galleryId, '111');
  assert.equal(meta.comicName, 'TITLE_PLACEHOLDER');
  assert.equal(meta.artist, 'himura kiseki');
  assert.deepEqual(meta.parodies, ['douluo continent']);
  assert.deepEqual(meta.characters, ['jingliu', 'ruan mei', 'stelle']);
  assert.deepEqual(meta.tags, ['sole female', 'very long hair', 'masked face', 'variant set']);
  assert.deepEqual(meta.languages, ['english', 'Japanese']);
  assert.equal(meta.pages, 48);
});

test('e-hentai page extractor fetches gallery pages and resolves full-size image URLs', async () => {
  const initialDocument = {
    querySelectorAll(selector) {
      if (selector === '#gdd td.gdt2') {
        return [{ textContent: 'A' }, { textContent: '41 images' }, { textContent: 'B' }];
      }
      if (selector === '#gdt a') {
        return [
          { getAttribute: () => fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6161612f312d31"), href: fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6161612f312d31") },
          { getAttribute: () => fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6262622f312d32"), href: fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6262622f312d32") },
        ];
      }
      return [];
    },
  };

  const docsByHtml = {
    PAGE_1: {
      querySelectorAll(selector) {
        if (selector !== '#gdt a') return [];
        return [{ getAttribute: () => fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6363632f312d33"), href: fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6363632f312d33") }];
      },
      querySelector() {
        return null;
      },
    },
    IMG_1: { querySelector: () => ({ getAttribute: () => 'https://ehgt.org/full/1.jpg', src: 'https://ehgt.org/full/1.jpg' }) },
    IMG_2: { querySelector: () => ({ getAttribute: () => 'https://ehgt.org/full/2.jpg', src: 'https://ehgt.org/full/2.jpg' }) },
    IMG_3: { querySelector: () => ({ getAttribute: () => 'https://ehgt.org/full/3.jpg', src: 'https://ehgt.org/full/3.jpg' }) },
  };

  const htmlByUrl = {
    [fromHex("68747470733a2f2f652d68656e7461692e6f72672f672f3131312f6162636465662f3f703d31")]: 'PAGE_1',
    [fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6161612f312d31")]: 'IMG_1',
    [fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6262622f312d32")]: 'IMG_2',
    [fromHex("68747470733a2f2f652d68656e7461692e6f72672f732f6363632f312d33")]: 'IMG_3',
  };

  const fetchImpl = async (url) => ({ text: async () => htmlByUrl[url] || '' });
  const domParserFactory = (htmlText) => docsByHtml[htmlText] || null;

  const urls = await eHentaiSourceAdapter.extractPageImageUrls(
    initialDocument,
    { href: fromHex("68747470733a2f2f652d68656e7461692e6f72672f672f3131312f6162636465662f") },
    { fetchImpl, domParserFactory },
  );

  assert.deepEqual(urls, [
    'https://ehgt.org/full/1.jpg',
    'https://ehgt.org/full/2.jpg',
    'https://ehgt.org/full/3.jpg',
  ]);
});
