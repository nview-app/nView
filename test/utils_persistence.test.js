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
  assert.equal(tryReadJson(missing), null);

  const invalid = path.join(dir, 'invalid.json');
  fs.writeFileSync(invalid, '{bad json', 'utf8');
  assert.equal(tryReadJson(invalid), null);
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
