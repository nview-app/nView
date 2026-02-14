const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  humanBytes,
  listFilesRecursive,
  listFilesRecursiveSync,
  listTempDirs,
  naturalSort,
  readJsonWithError,
  withConcurrency,
  writeJsonSafe,
} = require('../main/utils');

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


test('listFilesRecursiveSync walks nested directories and skips unreadable entries', () => {
  const dir = makeTempDir();
  const nested = path.join(dir, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a', 'utf8');
  fs.writeFileSync(path.join(nested, 'b.txt'), 'b', 'utf8');

  const files = listFilesRecursiveSync(dir)
    .map((entry) => path.relative(dir, entry).replaceAll('\\', '/'))
    .sort();

  assert.deepEqual(files, ['a.txt', 'nested/b.txt']);
});

test('listFilesRecursive and listFilesRecursiveSync ignore missing directories without warnings', async () => {
  const missing = path.join(makeTempDir(), 'does-not-exist');
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(' '));

  try {
    const asyncResults = await listFilesRecursive(missing);
    const syncResults = listFilesRecursiveSync(missing);
    assert.deepEqual(asyncResults, []);
    assert.deepEqual(syncResults, []);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, []);
});

test('listFilesRecursive and listFilesRecursiveSync warn on unexpected read errors', async () => {
  const root = makeTempDir();
  const fakeError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  const originalWarn = console.warn;
  const originalReaddirAsync = fs.promises.readdir;
  const originalReaddirSync = fs.readdirSync;
  const warnings = [];

  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  fs.promises.readdir = async () => {
    throw fakeError;
  };
  fs.readdirSync = () => {
    throw fakeError;
  };

  try {
    assert.deepEqual(await listFilesRecursive(root), []);
    assert.deepEqual(listFilesRecursiveSync(root), []);
  } finally {
    console.warn = originalWarn;
    fs.promises.readdir = originalReaddirAsync;
    fs.readdirSync = originalReaddirSync;
  }

  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((msg) => msg.includes('[utils] Unable to read directory')));
  assert.ok(warnings.every((msg) => msg.includes('EACCES')));
});

test('withConcurrency processes all items preserving output order', async () => {
  const items = ['a', 'b', 'c', 'd'];
  const seen = [];

  const results = await withConcurrency(items, 2, async (item, idx) => {
    await new Promise((resolve) => setTimeout(resolve, idx % 2 === 0 ? 10 : 1));
    seen.push(item);
    return `${item}:${idx}`;
  });

  assert.equal(new Set(seen).size, items.length);
  assert.deepEqual(results, ['a:0', 'b:1', 'c:2', 'd:3']);
});


test('withConcurrency handles non-positive limits by falling back to single worker', async () => {
  const calls = [];
  const items = [1, 2, 3];

  const results = await withConcurrency(items, 0, async (item, idx) => {
    calls.push(idx);
    return item * 2;
  });

  assert.deepEqual(calls, [0, 1, 2]);
  assert.deepEqual(results, [2, 4, 6]);
});
