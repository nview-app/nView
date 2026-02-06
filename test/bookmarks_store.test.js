const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBookmarksStore } = require('../main/bookmarks_store');

function makeVault(enabled = true, unlocked = true) {
  return {
    vaultStatus() {
      return { enabled, unlocked };
    },
    encryptBufferWithKey({ buffer }) {
      return Buffer.from(`enc:${buffer.toString('utf8')}`, 'utf8');
    },
    decryptBufferWithKey({ buffer }) {
      const raw = buffer.toString('utf8');
      if (!raw.startsWith('enc:')) throw new Error('not encrypted');
      return Buffer.from(raw.slice(4), 'utf8');
    },
  };
}

test('bookmarks store requires enabled+unlocked vault', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nviewer-bookmarks-')), 'bookmarks.enc');

  const disabled = createBookmarksStore({
    vaultManager: makeVault(false, false),
    bookmarksFile: () => file,
    bookmarksRelPath: 'bookmarks.json',
    fs,
  });
  assert.equal(disabled.loadBookmarksFromDisk().requiresVault, true);

  const locked = createBookmarksStore({
    vaultManager: makeVault(true, false),
    bookmarksFile: () => file,
    bookmarksRelPath: 'bookmarks.json',
    fs,
  });
  assert.equal(locked.persistBookmarksToDisk([]).locked, true);
});

test('bookmarks store round-trips encrypted bookmark payload', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nviewer-bookmarks-')), 'bookmarks.enc');
  const store = createBookmarksStore({
    vaultManager: makeVault(true, true),
    bookmarksFile: () => file,
    bookmarksRelPath: 'bookmarks.json',
    fs,
  });

  const bookmarks = [{ id: '1', title: 'Example', url: 'https://example.com' }];
  assert.deepEqual(store.persistBookmarksToDisk(bookmarks), { ok: true });

  const loaded = store.loadBookmarksFromDisk();
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.bookmarks, bookmarks);
});
