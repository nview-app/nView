const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { humanBytes, naturalSort, readJsonWithError, writeJsonSafe, listTempDirs } = require('../main/utils');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nviewer-utils-'));
}

test('humanBytes formats finite and non-finite values', () => {
  assert.equal(humanBytes(0), '0 B');
  assert.equal(humanBytes(1536), '1.5 KB');
  assert.equal(humanBytes(Number.NaN), '0 B');
});

test('naturalSort compares numeric strings naturally', () => {
  const values = ['10.jpg', '2.jpg', '1.jpg'];
  values.sort(naturalSort);
  assert.deepEqual(values, ['1.jpg', '2.jpg', '10.jpg']);
});

test('readJsonWithError reports missing and invalid JSON', () => {
  const dir = makeTempDir();
  const missing = path.join(dir, 'missing.json');
  assert.deepEqual(readJsonWithError(missing), { data: null, error: 'missing' });

  const invalid = path.join(dir, 'invalid.json');
  fs.writeFileSync(invalid, '{oops', 'utf8');
  const invalidRead = readJsonWithError(invalid);
  assert.equal(invalidRead.data, null);
  assert.match(invalidRead.error, /SyntaxError/);
});

test('writeJsonSafe writes data and returns false on write failures', () => {
  const dir = makeTempDir();
  const goodPath = path.join(dir, 'ok.json');
  assert.equal(writeJsonSafe(goodPath, { ok: true }), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(goodPath, 'utf8')), { ok: true });

  const badPath = path.join(dir, 'missing', 'nope.json');
  const originalWarn = console.warn;
  let warningMessage = '';
  console.warn = (...args) => {
    warningMessage = args.map(String).join(' ');
  };
  try {
    assert.equal(writeJsonSafe(badPath, { ok: false }), false);
  } finally {
    console.warn = originalWarn;
  }
  assert.match(warningMessage, /\[writeJsonSafe\] failed:/);
});

test('listTempDirs returns only tmp_ prefixed directories', async () => {
  const dir = makeTempDir();
  fs.mkdirSync(path.join(dir, 'tmp_a'));
  fs.mkdirSync(path.join(dir, 'tmp_b'));
  fs.mkdirSync(path.join(dir, 'other'));
  fs.writeFileSync(path.join(dir, 'tmp_file'), 'x');

  const tempDirs = await listTempDirs(dir);

  assert.deepEqual(
    tempDirs.map((entry) => path.basename(entry)).sort(),
    ['tmp_a', 'tmp_b'],
  );
});
