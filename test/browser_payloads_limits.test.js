const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeAltDownloadPayload } = require('../main/browser_payloads');

test('sanitizeAltDownloadPayload rejects more than 4000 URLs after normalization', () => {
  const imageUrls = Array.from({ length: 4001 }, (_, i) => `https://img.example/${i}.jpg`);

  const result = sanitizeAltDownloadPayload({ imageUrls });

  assert.deepEqual(result, { ok: false, error: 'Too many image URLs.' });
});

test('sanitizeAltDownloadPayload bounds metadata arrays and string lengths', () => {
  const longName = 'x'.repeat(500);
  const result = sanitizeAltDownloadPayload({
    imageUrls: ['https://img.example/1.jpg'],
    meta: {
      artists: Array.from({ length: 300 }, (_, i) => ` artist-${i} `),
      tags: Array.from({ length: 300 }, (_, i) => ` tag-${i} `),
      comicName: `<${longName}>`,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.meta.artists.length, 128);
  assert.equal(result.meta.tags.length, 128);
  assert.equal(result.meta.comicName.length, 300);
});

