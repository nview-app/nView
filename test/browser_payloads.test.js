const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHttpUrl,
  sanitizeAltDownloadPayload,
} = require('../main/browser_payloads');

test('normalizeHttpUrl allows only http/https', () => {
  assert.equal(normalizeHttpUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(normalizeHttpUrl('http://example.com'), 'http://example.com/');
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), '');
  assert.equal(normalizeHttpUrl('file:///tmp/x'), '');
  assert.equal(normalizeHttpUrl('not a url'), '');
});

test('sanitizeAltDownloadPayload deduplicates and strips invalid urls', () => {
  const result = sanitizeAltDownloadPayload({
    imageUrls: [
      'https://a.example/img1.jpg',
      ' https://a.example/img1.jpg ',
      'javascript:alert(1)',
      'http://a.example/img2.jpg',
    ],
    referer: 'https://source.example',
    origin: 'file:///bad',
    userAgent: 'x'.repeat(900),
    meta: {
      galleryId: ' 12345 ',
      comicName: '  <b>Title</b>  ',
      artists: [' Alice ', '', 'Alice'],
      artist: '  Bob  ',
      tags: ['tag-a', 'tag-b'],
      pages: '24',
      sourceUrl: 'https://source.example/g/12345/?token=1',
      capturedAt: '2026-02-24T00:00:00.000Z',
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, [
    'https://a.example/img1.jpg',
    'http://a.example/img2.jpg',
  ]);
  assert.equal(result.context.referer, 'https://source.example/');
  assert.equal(result.context.origin, '');
  assert.equal(result.context.userAgent.length, 512);
  assert.deepEqual(result.meta, {
    sourceUrl: 'https://source.example/g/12345/?token=1',
    sourceId: null,
    galleryId: '12345',
    comicName: 'bTitle/b',
    artists: ['Alice'],
    artist: 'Bob',
    tags: ['tag-a', 'tag-b'],
    parodies: [],
    characters: [],
    languages: [],
    pages: 24,
    capturedAt: '2026-02-24T00:00:00.000Z',
  });
});

test('sanitizeAltDownloadPayload rejects missing valid URLs', () => {
  const result = sanitizeAltDownloadPayload({ imageUrls: ['javascript:alert(1)'] });
  assert.deepEqual(result, { ok: false, error: 'No valid image URLs were provided.' });
});

test('sanitizeAltDownloadPayload drops malformed header values and normalizes origin', () => {
  const result = sanitizeAltDownloadPayload({
    imageUrls: ['https://img.example/1.jpg'],
    referer: 'https://user:pass@example.com/path',
    origin: 'https://a.example/path?q=1',
    userAgent: 'agent\r\nsecond-line',
  });

  assert.equal(result.ok, true);
  assert.equal(result.context.referer, '');
  assert.equal(result.context.origin, 'https://a.example');
  assert.equal(result.context.userAgent, 'agent second-line');
});


test('sanitizeAltDownloadPayload falls back to referer when metadata sourceUrl is missing', () => {
  const result = sanitizeAltDownloadPayload({
    imageUrls: ['https://img.example/1.jpg'],
    referer: 'https://source.example/g/123/#reader',
    meta: {
      comicName: 'Title',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.meta.sourceUrl, 'https://source.example/g/123/#reader');
  assert.equal(result.meta.sourceId, null);
});

test('sanitizeAltDownloadPayload sets sourceId from trusted resolved adapter context', () => {
  const result = sanitizeAltDownloadPayload({
    imageUrls: ['https://img.example/1.jpg'],
    meta: {
      sourceId: 'spoofed-source',
      galleryId: '123',
    },
  }, { resolvedSourceId: 'nhentai' });

  assert.equal(result.ok, true);
  assert.equal(result.meta.sourceId, 'nhentai');
});
