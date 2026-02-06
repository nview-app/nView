const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeAltDownloadPayload } = require('../main/browser_payloads');

test('sanitizeAltDownloadPayload rejects more than 4000 URLs after normalization', () => {
  const imageUrls = Array.from({ length: 4001 }, (_, i) => `https://img.example/${i}.jpg`);

  const result = sanitizeAltDownloadPayload({ imageUrls });

  assert.deepEqual(result, { ok: false, error: 'Too many image URLs.' });
});
