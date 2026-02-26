const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLibraryIndex } = require("../main/library_index");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nviewer-library-index-"));
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

test("library index normalizes gallery IDs and tags input", () => {
  const index = makeIndex(makeTempDir());

  assert.equal(index.normalizeGalleryId(" gallery-00123 "), "00123");
  assert.equal(index.normalizeGalleryId("no-id-here"), "");
  assert.deepEqual(index.normalizeTagsInput(" action,  drama , ,comedy "), ["action", "drama", "comedy"]);
  assert.deepEqual(index.normalizeTagsInput(""), []);
});

test("library index detects image and encrypted image paths", () => {
  const index = makeIndex(makeTempDir());

  assert.equal(index.isImagePath("/tmp/cover.JPG"), true);
  assert.equal(index.isImagePath("/tmp/archive.zip"), false);
  assert.equal(index.isEncryptedImagePath("/tmp/page1.png.enc"), true);
  assert.equal(index.isEncryptedImagePath("/tmp/page1.txt.enc"), false);
});

test("listEncryptedImagesRecursiveSorted returns naturally sorted encrypted image files", async () => {
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, "chapter"));
  fs.writeFileSync(path.join(root, "chapter", "10.jpg.enc"), "x");
  fs.writeFileSync(path.join(root, "chapter", "2.jpg.enc"), "x");
  fs.writeFileSync(path.join(root, "chapter", "readme.txt.enc"), "x");

  const index = makeIndex(root);
  const files = await index.listEncryptedImagesRecursiveSorted(root);

  assert.equal(files.length, 2);
  assert.equal(path.basename(files[0]), "2.jpg.enc");
  assert.equal(path.basename(files[1]), "10.jpg.enc");
});

test("buildComicEntry tolerates corrupted encrypted metadata/index and falls back to folder naming", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_1");
  fs.mkdirSync(comicDir, { recursive: true });
  fs.writeFileSync(path.join(comicDir, "001.jpg.enc"), "enc");
  fs.writeFileSync(path.join(comicDir, "metadata.json.enc"), "bad-meta");
  fs.writeFileSync(path.join(comicDir, "index.json.enc"), "bad-index");

  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptFileToBuffer: async () => {
        throw new Error("decrypt-failed");
      },
      decryptBufferWithKey: () => {
        throw new Error("decrypt-failed");
      },
      encryptBufferWithKey: ({ buffer }) => buffer,
    },
    getVaultRelPath: (value) => value,
  });

  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const entry = await index.buildComicEntry(comicDir);

    assert.equal(entry.id, "comic_1");
    assert.equal(entry.title, "comic_1");
    assert.equal(entry.pagesFound, 1);
    assert.equal(entry.metaPath.endsWith("metadata.json.enc"), true);
    assert.equal(entry.coverPath.endsWith("001.jpg"), true);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /failed to decrypt metadata/);
    assert.match(warnings[1], /failed to decrypt index/);
  } finally {
    console.warn = previousWarn;
  }
});

test("buildComicEntry prioritizes decrypted metadata and writes normalized sourceUrl to cache", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_2");
  fs.mkdirSync(comicDir, { recursive: true });
  fs.writeFileSync(path.join(comicDir, "001.jpg.enc"), "enc");
  fs.writeFileSync(path.join(comicDir, "metadata.json.enc"), "meta");
  fs.writeFileSync(path.join(comicDir, "index.json.enc"), "index");

  const writes = [];
  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptFileToBuffer: async () => Buffer.from(JSON.stringify({
        comicName: "Private Title",
        galleryId: "g-0042",
        sourceUrl: "https://nhentai.net/g/42/?page=3#viewer",
        tags: ["safe"],
      })),
      decryptBufferWithKey: () => Buffer.from(JSON.stringify({ title: "Secondary", pages: 7 })),
      encryptBufferWithKey: ({ relPath, buffer }) => {
        writes.push({ relPath, body: JSON.parse(buffer.toString("utf8")) });
        return buffer;
      },
    },
    getVaultRelPath: (value) => value,
  });

  const entry = await index.buildComicEntry(comicDir);

  assert.equal(entry.title, "Private Title");
  assert.equal(entry.galleryId, "g-0042");
  assert.equal(entry.sourceUrl, "https://nhentai.net/g/42");
  assert.deepEqual(entry.sourceIdentity, {
    sourceId: null,
    canonicalUrl: "https://nhentai.net/g/42",
    sourceScopedId: "g-0042",
  });

  await new Promise((resolve) => setTimeout(resolve, 600));

  const cacheWrite = writes.find((item) => item.relPath.endsWith(".library_index.json"));
  assert.ok(cacheWrite);
  const cacheValues = Object.values(cacheWrite.body.entries);
  assert.equal(cacheValues.length >= 1, true);
  assert.equal(cacheValues.some((item) => item.sourceUrl === "https://nhentai.net/g/42"), true);
});

test("buildComicEntry falls back to first page when configured cover is missing or outside comic directory", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_3");
  fs.mkdirSync(comicDir, { recursive: true });
  fs.writeFileSync(path.join(comicDir, "02.jpg.enc"), "enc");
  fs.writeFileSync(path.join(comicDir, "10.jpg.enc"), "enc");

  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptFileToBuffer: async () => Buffer.from(JSON.stringify({ comicName: "Title" })),
      decryptBufferWithKey: () => Buffer.from(JSON.stringify({
        cover: "../outside/01.jpg",
        pages: 2,
      })),
      encryptBufferWithKey: ({ buffer }) => buffer,
    },
    getVaultRelPath: (value) => value,
  });

  const entry = await index.buildComicEntry(comicDir);

  assert.equal(entry.coverPath.endsWith("02.jpg"), true);
});


test("loadLibraryIndexCache hydrates sourceUrl from encrypted metadata when missing in cache", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_hydrate");
  fs.mkdirSync(comicDir, { recursive: true });
  fs.writeFileSync(path.join(comicDir, "metadata.json.enc"), "meta");

  const indexPath = path.join(root, ".library_index.json.enc");
  fs.writeFileSync(indexPath, "index");

  const writes = [];
  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptBufferWithKey: ({ relPath }) => {
        if (String(relPath).endsWith(".library_index.json")) {
          return Buffer.from(JSON.stringify({
            version: 1,
            entries: {
              "vault:comic_hydrate": { galleryId: "42" },
            },
          }));
        }
        if (String(relPath).endsWith("metadata.json")) {
          return Buffer.from(JSON.stringify({
            sourceUrl: "https://nhentai.net/g/42/?p=9#hash",
          }));
        }
        throw new Error("unexpected relPath");
      },
      encryptBufferWithKey: ({ relPath, buffer }) => {
        writes.push({ relPath, body: JSON.parse(buffer.toString("utf8")) });
        return buffer;
      },
    },
    getVaultRelPath: (value) => value,
  });

  const cache = index.loadLibraryIndexCache();
  assert.equal(cache.entries["vault:comic_hydrate"].sourceUrl, "https://nhentai.net/g/42");
  assert.deepEqual(cache.entries["vault:comic_hydrate"].sourceIdentity, {
    sourceId: null,
    canonicalUrl: "https://nhentai.net/g/42",
    sourceScopedId: null,
  });

  await new Promise((resolve) => setTimeout(resolve, 600));
  const cacheWrite = writes.find((item) => String(item.relPath).endsWith(".library_index.json"));
  assert.ok(cacheWrite);
  assert.equal(cacheWrite.body.entries["vault:comic_hydrate"].sourceUrl, "https://nhentai.net/g/42");
  assert.deepEqual(cacheWrite.body.entries["vault:comic_hydrate"].sourceIdentity, {
    sourceId: null,
    canonicalUrl: "https://nhentai.net/g/42",
    sourceScopedId: null,
  });
});


test("loadLibraryIndexCache lazily enriches missing sourceIdentity from encrypted metadata", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_identity_hydrate");
  fs.mkdirSync(comicDir, { recursive: true });
  fs.writeFileSync(path.join(comicDir, "metadata.json.enc"), "meta");

  const indexPath = path.join(root, ".library_index.json.enc");
  fs.writeFileSync(indexPath, "index");

  const writes = [];
  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptBufferWithKey: ({ relPath }) => {
        if (String(relPath).endsWith(".library_index.json")) {
          return Buffer.from(JSON.stringify({
            version: 1,
            entries: {
              "vault:comic_identity_hydrate": { sourceUrl: "https://nhentai.net/g/4242", galleryId: "4242" },
            },
          }));
        }
        if (String(relPath).endsWith("metadata.json")) {
          return Buffer.from(JSON.stringify({
            sourceId: "NHENTAI",
            galleryId: "4242",
            sourceUrl: "https://nhentai.net/g/4242/?source=home#viewer",
          }));
        }
        throw new Error("unexpected relPath");
      },
      encryptBufferWithKey: ({ relPath, buffer }) => {
        writes.push({ relPath, body: JSON.parse(buffer.toString("utf8")) });
        return buffer;
      },
    },
    getVaultRelPath: (value) => value,
  });

  const cache = index.loadLibraryIndexCache();
  assert.deepEqual(cache.entries["vault:comic_identity_hydrate"].sourceIdentity, {
    sourceId: "nhentai",
    canonicalUrl: "https://nhentai.net/g/4242",
    sourceScopedId: "4242",
  });

  await new Promise((resolve) => setTimeout(resolve, 600));
  const cacheWrite = writes.find((item) => String(item.relPath).endsWith(".library_index.json"));
  assert.ok(cacheWrite);
  assert.deepEqual(cacheWrite.body.entries["vault:comic_identity_hydrate"].sourceIdentity, {
    sourceId: "nhentai",
    canonicalUrl: "https://nhentai.net/g/4242",
    sourceScopedId: "4242",
  });
});


test("loadLibraryIndexCache removes legacy sourceUrlHash entries", async () => {
  const root = makeTempDir();
  const indexPath = path.join(root, ".library_index.json.enc");
  fs.writeFileSync(indexPath, "index");

  const writes = [];
  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptBufferWithKey: ({ relPath }) => {
        if (String(relPath).endsWith(".library_index.json")) {
          return Buffer.from(JSON.stringify({
            version: 1,
            entries: {
              "vault:comic_hash": { sourceUrlHash: "abc123", galleryId: "42" },
            },
          }));
        }
        throw new Error("unexpected relPath");
      },
      encryptBufferWithKey: ({ relPath, buffer }) => {
        writes.push({ relPath, body: JSON.parse(buffer.toString("utf8")) });
        return buffer;
      },
    },
    getVaultRelPath: (value) => value,
  });

  const cache = index.loadLibraryIndexCache();
  assert.deepEqual(cache.entries["vault:comic_hash"], { galleryId: "42" });

  await new Promise((resolve) => setTimeout(resolve, 600));
  const cacheWrite = writes.find((item) => String(item.relPath).endsWith(".library_index.json"));
  assert.ok(cacheWrite);
  assert.deepEqual(cacheWrite.body.entries["vault:comic_hash"], { galleryId: "42" });
});


test("buildComicEntry synthesizes sourceIdentity.sourceId when metadata includes sourceId", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_identity");
  fs.mkdirSync(comicDir, { recursive: true });
  fs.writeFileSync(path.join(comicDir, "001.jpg.enc"), "enc");
  fs.writeFileSync(path.join(comicDir, "metadata.json.enc"), "meta");

  const index = createLibraryIndex({
    libraryRoot: () => root,
    vaultManager: {
      isInitialized: () => true,
      isUnlocked: () => true,
      decryptFileToBuffer: async () => Buffer.from(JSON.stringify({
        sourceId: "NHENTAI",
        galleryId: "42",
        sourceUrl: "https://nhentai.net/g/42/?ref=abc#reader",
      })),
      decryptBufferWithKey: () => Buffer.from(JSON.stringify({ pages: 1 })),
      encryptBufferWithKey: ({ buffer }) => buffer,
    },
    getVaultRelPath: (value) => value,
  });

  const entry = await index.buildComicEntry(comicDir);
  assert.deepEqual(entry.sourceIdentity, {
    sourceId: "nhentai",
    canonicalUrl: "https://nhentai.net/g/42",
    sourceScopedId: "42",
  });
});
