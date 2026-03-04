const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('settings manager and defaults expose ui.customDropdownsV1 rollout flag', () => {
  const mainSource = read('main.js');
  const settingsSource = read('main/settings.js');

  assert.match(mainSource, /ui:\s*\{\s*customDropdownsV1:\s*true,?\s*\}/m);
  assert.match(settingsSource, /function normalizeUiSettings\(/);
  assert.match(settingsSource, /customDropdownsV1:\s*Boolean\(/);
});

test('renderer surfaces gate custom dropdown bootstrapping behind rollout helper', () => {
  const gallerySource = read('renderer/renderer.js');
  const readerSource = read('renderer/reader_renderer.js');
  const tagManagerSource = read('renderer/tag_manager_renderer.js');

  for (const source of [gallerySource, readerSource, tagManagerSource]) {
    assert.match(source, /function isCustomDropdownsEnabled\(/);
    assert.match(source, /reconcileCustomDropdownRollout\(/);
    assert.match(source, /customDropdownsV1/);
  }
});


test('renderer dropdown adapters detach select listeners during teardown', () => {
  const gallerySource = read('renderer/renderer.js');
  const readerSource = read('renderer/reader_renderer.js');
  const tagManagerSource = read('renderer/tag_manager_renderer.js');

  assert.match(gallerySource, /removeEventListener\("change",\s*onSelectChange\)/);

  for (const source of [readerSource, tagManagerSource]) {
    assert.match(source, /removeEventListener\("change",\s*onSelectChange\)/);
    assert.match(source, /removeEventListener\("nview:sync-dropdown",\s*syncFromSelect\)/);
  }
});
