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
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, [
    'https://a.example/img1.jpg',
    'http://a.example/img2.jpg',
  ]);
  assert.equal(result.context.referer, 'https://source.example/');
  assert.equal(result.context.origin, '');
  assert.equal(result.context.userAgent.length, 512);
});

test('sanitizeAltDownloadPayload rejects missing valid URLs', () => {
  const result = sanitizeAltDownloadPayload({ imageUrls: ['javascript:alert(1)'] });
  assert.deepEqual(result, { ok: false, error: 'No valid image URLs were provided.' });
});
