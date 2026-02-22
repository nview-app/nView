const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { tryReadJson, writeJsonAtomic } = require('../main/utils');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nviewer-test-'));
}

test('tryReadJson returns null for missing/invalid files', () => {
  const dir = tempDir();
  const missing = path.join(dir, 'missing.json');
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    assert.equal(tryReadJson(missing), null);

    const invalid = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalid, '{bad json', 'utf8');
    assert.equal(tryReadJson(invalid), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /tryReadJson: failed/);
  } finally {
    console.warn = previousWarn;
  }
});

test('writeJsonAtomic writes valid JSON payload', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const payload = { hello: 'world', nested: { count: 2 } };

  writeJsonAtomic(file, payload);

  const raw = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(raw), payload);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});


test('writeJsonAtomic suppresses expected directory fsync EPERM warnings', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const payload = { ok: true };

  const originalOpenSync = fs.openSync;
  const originalWarn = console.warn;
  const warnings = [];

  fs.openSync = (targetPath, flags) => {
    if (targetPath === dir && flags === 'r') {
      const err = new Error('operation not permitted');
      err.code = 'EPERM';
      throw err;
    }
    return originalOpenSync(targetPath, flags);
  };
  console.warn = (...args) => warnings.push(args.map(String).join(' '));

  try {
    writeJsonAtomic(file, payload);
  } finally {
    fs.openSync = originalOpenSync;
    console.warn = originalWarn;
  }

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), payload);
  assert.deepEqual(warnings, []);
});

test('writeJsonAtomic logs unexpected directory fsync errors', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const payload = { ok: true };

  const originalOpenSync = fs.openSync;
  const originalWarn = console.warn;
  const warnings = [];

  fs.openSync = (targetPath, flags) => {
    if (targetPath === dir && flags === 'r') {
      const err = new Error('io error');
      err.code = 'EIO';
      throw err;
    }
    return originalOpenSync(targetPath, flags);
  };
  console.warn = (...args) => warnings.push(args.map(String).join(' '));

  try {
    writeJsonAtomic(file, payload);
  } finally {
    fs.openSync = originalOpenSync;
    console.warn = originalWarn;
  }

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), payload);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /writeJsonAtomic: directory fsync skipped/);
  assert.match(warnings[0], /EIO/);
});
