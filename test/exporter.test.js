const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeExportName,
  resolveUniquePath,
  mapExportResult,
  buildSelectedEntries,
} = require('../main/exporter');

test('sanitizeExportName strips invalid filesystem characters', () => {
  assert.equal(sanitizeExportName('My: Manga* <01>?'), 'My Manga 01');
  assert.equal(sanitizeExportName('   '), 'untitled');
});

test('resolveUniquePath adds deterministic suffix when destination exists', () => {
  const existing = new Set(['/dest/Title', '/dest/Title (2)']);
  const out = resolveUniquePath('/dest', 'Title', { existsSync: (p) => existing.has(p) });
  assert.equal(out, '/dest/Title (3)');
});

test('mapExportResult returns stable shaped payload', () => {
  const row = mapExportResult({
    mangaId: 'comic_1',
    title: 'A',
    status: 'exported',
    outputPath: '/tmp/A',
    message: 'done',
  });
  assert.deepEqual(row, {
    mangaId: 'comic_1',
    title: 'A',
    status: 'exported',
    outputPath: '/tmp/A',
    message: 'done',
  });
});

test('buildSelectedEntries preserves order and marks missing items', async () => {
  const selected = await buildSelectedEntries({
    selectedMangaIds: ['b', 'x', 'a'],
    listLibraryEntries: async () => [{ id: 'a' }, { id: 'b' }],
  });
  assert.deepEqual(selected, [
    { id: 'b', entry: { id: 'b' } },
    { id: 'x', entry: null },
    { id: 'a', entry: { id: 'a' } },
  ]);
});
