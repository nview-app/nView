const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLibraryIndex } = require('../main/library_index');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nviewer-library-index-'));
}

function makeIndex(rootDir) {
  return createLibraryIndex({
    libraryRoot: () => rootDir,
    vaultManager: {
      isInitialized: () => false,
      isUnlocked: () => false,
    },
    getVaultRelPath: (value) => value,
  });
}

test('library index normalizes gallery IDs and tags input', () => {
  const index = makeIndex(makeTempDir());

  assert.equal(index.normalizeGalleryId(' gallery-00123 '), '00123');
  assert.equal(index.normalizeGalleryId('no-id-here'), '');
  assert.deepEqual(index.normalizeTagsInput(' action,  drama , ,comedy '), ['action', 'drama', 'comedy']);
  assert.deepEqual(index.normalizeTagsInput(''), []);
});

test('library index detects image and encrypted image paths', () => {
  const index = makeIndex(makeTempDir());

  assert.equal(index.isImagePath('/tmp/cover.JPG'), true);
  assert.equal(index.isImagePath('/tmp/archive.zip'), false);
  assert.equal(index.isEncryptedImagePath('/tmp/page1.png.enc'), true);
  assert.equal(index.isEncryptedImagePath('/tmp/page1.txt.enc'), false);
});

test('listEncryptedImagesRecursiveSorted returns naturally sorted encrypted image files', async () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, 'chapter'));
  fs.writeFileSync(path.join(root, 'chapter', '10.jpg.enc'), 'x');
  fs.writeFileSync(path.join(root, 'chapter', '2.jpg.enc'), 'x');
  fs.writeFileSync(path.join(root, 'chapter', 'readme.txt.enc'), 'x');

  const index = makeIndex(root);
  const files = await index.listEncryptedImagesRecursiveSorted(root);

  assert.equal(files.length, 2);
  assert.equal(path.basename(files[0]), '2.jpg.enc');
  assert.equal(path.basename(files[1]), '10.jpg.enc');
});
