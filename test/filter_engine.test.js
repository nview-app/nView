const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFilterEngine() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'filters', 'filter_engine.js'), 'utf8');
  const context = { window: {}, URL };
  vm.runInNewContext(code, context);
  return context.window.nviewFilterEngine;
}

test('matchesTags supports exclude tags with include any mode', () => {
  const engine = loadFilterEngine();
  const item = { tags: ['Action', 'Romance'] };

  assert.equal(engine.matchesTags(item, ['action'], false, []), true);
  assert.equal(engine.matchesTags(item, ['action'], false, ['romance']), false);
  assert.equal(engine.matchesTags(item, [], false, ['romance']), false);
  assert.equal(engine.matchesTags(item, [], false, ['comedy']), true);
});

test('matchesTags supports include + exclude with match all mode', () => {
  const engine = loadFilterEngine();
  const item = { tags: ['Action', 'Romance', 'Drama'] };

  assert.equal(engine.matchesTags(item, ['action', 'drama'], true, []), true);
  assert.equal(engine.matchesTags(item, ['action', 'drama'], true, ['romance']), false);
});

test('computeTagCounts keeps selected exclude tags visible', () => {
  const engine = loadFilterEngine();
  const items = [
    { tags: ['Action', 'Romance'] },
    { tags: ['Action', 'Comedy'] },
  ];

  const counts = engine.computeTagCounts(items, ['action'], false, ['romance']);
  assert.equal(counts.has('romance'), true);
  assert.equal(counts.get('romance').count, 0);
});

test('matchesSearch supports source-scoped identity token and canonical url matching', () => {
  const engine = loadFilterEngine();
  const item = {
    title: 'Sample Title',
    sourceUrl: 'https://nhentai.net/g/12345/?page=1#reader',
    sourceIdentity: {
      sourceId: 'NHENTAI',
      sourceScopedId: '12345',
      canonicalUrl: 'https://nhentai.net/g/12345/?source=library#reader',
    },
  };

  assert.equal(engine.matchesSearch(item, engine.tokenize('nhentai:12345')), true);
  assert.equal(engine.matchesSearch(item, engine.tokenize('https://nhentai.net/g/12345/?p=999#hash')), true);
});

test('matchesSearch keeps galleryId search as fallback when source identity is missing', () => {
  const engine = loadFilterEngine();
  const item = {
    title: 'Legacy Entry',
    galleryId: '12345',
  };

  assert.equal(engine.matchesSearch(item, engine.tokenize('12345')), true);
  assert.equal(engine.matchesSearch(item, engine.tokenize('nhentai:12345')), false);
});
