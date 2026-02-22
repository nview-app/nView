const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

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

test('sanitizeExportName preserves unicode letters and trims very long names', () => {
  assert.equal(sanitizeExportName('黄金時代篇 / Memorial: Edition?'), '黄金時代篇 Memorial Edition');
  assert.equal(sanitizeExportName('a'.repeat(120)).length, 80);
});

test('resolveUniquePath adds deterministic suffix when destination exists', () => {
  const destinationRoot = path.join(path.sep, 'dest');
  const existing = new Set([
    path.join(destinationRoot, 'Title'),
    path.join(destinationRoot, 'Title (2)'),
  ]);
  const out = resolveUniquePath(destinationRoot, 'Title', {
    existsSync: (candidatePath) => existing.has(candidatePath),
  });
  assert.equal(out, path.join(destinationRoot, 'Title (3)'));
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
