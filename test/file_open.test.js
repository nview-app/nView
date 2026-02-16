const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeOpenPathResult } = require('../main/file_open');

test('normalizeOpenPathResult treats empty shell.openPath result as success', () => {
  assert.deepEqual(normalizeOpenPathResult(''), { ok: true });
  assert.deepEqual(normalizeOpenPathResult('   '), { ok: true });
});

test('normalizeOpenPathResult treats non-empty shell.openPath result as failure', () => {
  assert.deepEqual(normalizeOpenPathResult('Failed to open item'), {
    ok: false,
    error: 'Failed to open item',
  });
});

test('normalizeOpenPathResult tolerates non-string results as success', () => {
  assert.deepEqual(normalizeOpenPathResult(undefined), { ok: true });
});
