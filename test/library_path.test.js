const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  canonicalizePath,
  isSameOrChildPath,
  migrateLibraryContents,
  migrateLibrarySupportFiles,
  resolveConfiguredLibraryRoot,
  scanLibraryContents,
  validateWritableDirectory,
  isDirectoryEmpty,
} = require('../main/library_path');

test('resolveConfiguredLibraryRoot falls back for empty and relative paths', () => {
  const fallback = path.join('C:', 'Users', 'nView', 'Library');

  assert.deepEqual(resolveConfiguredLibraryRoot('', fallback), {
    preferredRoot: fallback,
    usedFallback: false,
  });

  const relative = resolveConfiguredLibraryRoot('relative/path', fallback);
  assert.equal(relative.preferredRoot, fallback);
  assert.equal(relative.usedFallback, true);
  assert.match(relative.warning, /absolute/i);
});



test('canonicalizePath normalizes case for Windows comparisons', () => {
  const input = 'C:\\Users\\Alice\\Library\\';
  const normalized = canonicalizePath(input, { platform: 'win32', fsModule: { existsSync: () => false } });
  assert.equal(normalized, 'c:\\users\\alice\\library');
});
test('validateWritableDirectory succeeds for temporary directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-path-'));
  const nested = path.join(root, 'library');

  const res = validateWritableDirectory(nested);

  assert.equal(res.ok, true);
  assert.equal(fs.existsSync(nested), true);
});



test('isDirectoryEmpty returns empty status for writable folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-empty-check-'));

  const emptyRes = isDirectoryEmpty(root);
  assert.equal(emptyRes.ok, true);
  assert.equal(emptyRes.empty, true);

  fs.writeFileSync(path.join(root, 'existing.txt'), 'hello', 'utf8');

  const nonEmptyRes = isDirectoryEmpty(root);
  assert.equal(nonEmptyRes.ok, true);
  assert.equal(nonEmptyRes.empty, false);
  assert.equal(nonEmptyRes.entryCount, 1);
});
test('validateWritableDirectory reports write failures', () => {
  const fakeFs = {
    mkdirSync() {},
    accessSync() {},
    writeFileSync() {
      throw new Error('EACCES: denied');
    },
    unlinkSync() {},
  };

  const res = validateWritableDirectory('/some/path', fakeFs);

  assert.equal(res.ok, false);
  assert.match(res.error, /EACCES/);
});

test('migrateLibrarySupportFiles copies required support files when missing at destination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-migrate-'));
  const fromRoot = path.join(root, 'from');
  const toRoot = path.join(root, 'to');
  fs.mkdirSync(fromRoot, { recursive: true });
  fs.mkdirSync(toRoot, { recursive: true });

  fs.writeFileSync(path.join(fromRoot, '.vault.json'), '{"v":1}', 'utf8');
  fs.writeFileSync(path.join(fromRoot, '.library_index.json.enc'), 'enc', 'utf8');

  const res = migrateLibrarySupportFiles({ fromRoot, toRoot });

  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.copied.sort(), ['.library_index.json.enc', '.vault.json']);
  assert.equal(fs.readFileSync(path.join(toRoot, '.vault.json'), 'utf8'), '{"v":1}');
  assert.equal(fs.readFileSync(path.join(toRoot, '.library_index.json.enc'), 'utf8'), 'enc');
});

test('isSameOrChildPath identifies same/child paths', () => {
  const root = path.resolve('/tmp/library-root');
  assert.equal(isSameOrChildPath(root, root), true);
  assert.equal(isSameOrChildPath(root, path.join(root, 'nested')), true);
  assert.equal(isSameOrChildPath(root, '/tmp/other-root'), false);
});

test('isSameOrChildPath honors Windows case-insensitive comparisons', () => {
  const fsModule = { existsSync: () => false };
  assert.equal(
    isSameOrChildPath('C:\\Library', 'c:\\library\\Comics', { platform: 'win32', fsModule }),
    true,
  );
});

test('scanLibraryContents returns file counts and total bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-scan-'));
  fs.mkdirSync(path.join(root, 'comic_a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'comic_a', 'index.json.enc'), 'abc', 'utf8');
  fs.writeFileSync(path.join(root, 'comic_a', 'page_001.jpg.enc'), '012345', 'utf8');

  const res = scanLibraryContents(root);

  assert.equal(res.ok, true);
  assert.equal(res.fileCount, 2);
  assert.equal(res.totalBytes, 9);
  assert.deepEqual(res.files.map((f) => f.relPath), ['comic_a/index.json.enc', 'comic_a/page_001.jpg.enc']);
});



test('scanLibraryContents skips symbolic links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-scan-symlink-'));
  const realDir = path.join(root, 'real');
  fs.mkdirSync(realDir, { recursive: true });
  fs.writeFileSync(path.join(realDir, 'file.txt'), 'ok', 'utf8');
  const symlinkPath = path.join(root, 'linked');
  fs.symlinkSync(realDir, symlinkPath);

  const res = scanLibraryContents(root);

  assert.equal(res.ok, true);
  assert.equal(res.skippedSymlinks, 1);
  assert.equal(res.fileCount, 1);
});



test('migrateLibraryContents requires an empty destination folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-move-non-empty-'));
  const fromRoot = path.join(root, 'from');
  const toRoot = path.join(root, 'to');
  fs.mkdirSync(fromRoot, { recursive: true });
  fs.mkdirSync(toRoot, { recursive: true });
  fs.writeFileSync(path.join(fromRoot, 'a.txt'), 'a', 'utf8');
  fs.writeFileSync(path.join(toRoot, 'preexisting.txt'), 'b', 'utf8');

  const res = migrateLibraryContents({ fromRoot, toRoot });

  assert.equal(res.ok, false);
  assert.equal(res.partial, false);
  assert.match(res.error, /must be empty/i);
  assert.equal(fs.existsSync(path.join(fromRoot, 'a.txt')), true);
});
test('migrateLibraryContents moves files and preserves relative structure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-move-'));
  const fromRoot = path.join(root, 'from');
  const toRoot = path.join(root, 'to');
  fs.mkdirSync(path.join(fromRoot, 'comic_1', 'sub'), { recursive: true });
  fs.mkdirSync(toRoot, { recursive: true });
  fs.writeFileSync(path.join(fromRoot, 'comic_1', 'index.json.enc'), 'meta', 'utf8');
  fs.writeFileSync(path.join(fromRoot, 'comic_1', 'sub', '001.jpg.enc'), 'image-data', 'utf8');

  const res = migrateLibraryContents({ fromRoot, toRoot });

  assert.equal(res.ok, true);
  assert.equal(fs.readFileSync(path.join(toRoot, 'comic_1', 'index.json.enc'), 'utf8'), 'meta');
  assert.equal(fs.readFileSync(path.join(toRoot, 'comic_1', 'sub', '001.jpg.enc'), 'utf8'), 'image-data');
  assert.equal(res.deletedFiles, 2);
  assert.equal(res.deletedDirectories, 2);
  assert.equal(fs.existsSync(path.join(fromRoot, 'comic_1', 'index.json.enc')), false);
  assert.equal(fs.existsSync(path.join(fromRoot, 'comic_1', 'sub', '001.jpg.enc')), false);
  assert.equal(fs.existsSync(path.join(fromRoot, 'comic_1', 'sub')), false);
  assert.equal(fs.existsSync(path.join(fromRoot, 'comic_1')), false);
});


test('migrateLibraryContents reports partial migration when copy fails mid-run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-move-partial-'));
  const fromRoot = path.join(root, 'from');
  const toRoot = path.join(root, 'to');
  fs.mkdirSync(fromRoot, { recursive: true });
  fs.mkdirSync(toRoot, { recursive: true });
  fs.writeFileSync(path.join(fromRoot, 'a.txt'), 'a', 'utf8');
  fs.writeFileSync(path.join(fromRoot, 'b.txt'), 'b', 'utf8');

  let copyCount = 0;
  const fakeFs = {
    ...fs,
    copyFileSync(src, dst) {
      copyCount += 1;
      if (copyCount > 1) throw new Error('simulated copy failure');
      return fs.copyFileSync(src, dst);
    },
  };

  const res = migrateLibraryContents({ fromRoot, toRoot, fsModule: fakeFs });

  assert.equal(res.ok, false);
  assert.equal(res.partial, true);
  assert.match(res.error, /copying files/i);
  assert.match(res.guidance, /Retry using an empty folder/i);
  assert.equal(fs.existsSync(path.join(fromRoot, 'a.txt')), true);
  assert.equal(fs.existsSync(path.join(fromRoot, 'b.txt')), true);
});

test('migrateLibraryContents verifies support file hashes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-move-hash-'));
  const fromRoot = path.join(root, 'from');
  const toRoot = path.join(root, 'to');
  fs.mkdirSync(fromRoot, { recursive: true });
  fs.mkdirSync(toRoot, { recursive: true });
  fs.writeFileSync(path.join(fromRoot, '.vault.json'), 'abc123', 'utf8');

  const fakeFs = {
    ...fs,
    copyFileSync(src, dst) {
      fs.copyFileSync(src, dst);
      if (path.basename(dst) === '.vault.json') {
        fs.writeFileSync(dst, 'zzz123', 'utf8');
      }
    },
  };

  const res = migrateLibraryContents({ fromRoot, toRoot, fsModule: fakeFs });

  assert.equal(res.ok, false);
  assert.match(res.error, /support files/i);
  assert.deepEqual(res.mismatchedSupportFiles, ['.vault.json']);
});


test('migrateLibraryContents reports cleanup failure when source deletion fails after verification', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nview-move-cleanup-fail-'));
  const fromRoot = path.join(root, 'from');
  const toRoot = path.join(root, 'to');
  fs.mkdirSync(fromRoot, { recursive: true });
  fs.mkdirSync(toRoot, { recursive: true });
  fs.writeFileSync(path.join(fromRoot, 'a.txt'), 'a', 'utf8');

  const fakeFs = {
    ...fs,
    unlinkSync(target) {
      if (path.basename(target) === 'a.txt') {
        throw new Error('simulated unlink failure');
      }
      return fs.unlinkSync(target);
    },
  };

  const res = migrateLibraryContents({ fromRoot, toRoot, fsModule: fakeFs });

  assert.equal(res.ok, false);
  assert.equal(res.partial, true);
  assert.match(res.error, /failed to remove some originals/i);
  assert.equal(fs.existsSync(path.join(toRoot, 'a.txt')), true);
  assert.equal(fs.existsSync(path.join(fromRoot, 'a.txt')), true);
});
