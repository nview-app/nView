const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  candidateStatus,
  importLibraryCandidates,
  normalizeImportItemsPayload,
  scanImportRoot,
  scanSingleManga,
  shouldIgnoreRootEntry,
} = require("../main/importer");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nviewer-importer-"));
}

test("candidate status classification", () => {
  assert.equal(candidateStatus({ imageCount: 0, metadataSource: "file", metadataErrors: [], metadata: { title: "x" } }), "no_images");
  assert.equal(candidateStatus({ imageCount: 1, metadataSource: "file", metadataErrors: ["bad"], metadata: { title: "x" } }), "metadata_error");
  assert.equal(candidateStatus({ imageCount: 1, metadataSource: "template", metadataErrors: [], metadata: { title: "" } }), "needs_metadata");
  assert.equal(candidateStatus({ imageCount: 1, metadataSource: "file", metadataErrors: [], metadata: { title: "ok" } }), "ready");
});

test("scanImportRoot discovers immediate subfolders and metadata fallback", async () => {
  const root = makeTempDir();
  const withMeta = path.join(root, "A");
  const withoutMeta = path.join(root, "B");
  fs.mkdirSync(withMeta);
  fs.mkdirSync(withoutMeta);
  fs.writeFileSync(path.join(withMeta, "metadata.json"), JSON.stringify({ title: "From file" }));
  fs.writeFileSync(path.join(withMeta, "1.jpg"), "img");
  fs.writeFileSync(path.join(withoutMeta, "1.png"), "img");

  const result = await scanImportRoot(root);
  assert.equal(result.candidates.length, 2);

  const a = result.candidates.find((item) => item.folderName === "A");
  const b = result.candidates.find((item) => item.folderName === "B");
  assert.equal(a.metadataSource, "file");
  assert.equal(a.metadata.title, "From file");
  assert.equal(b.metadataSource, "template");
  assert.equal(b.metadata.title, "B");
});

test("scanImportRoot flags metadata file with missing title", async () => {
  const root = makeTempDir();
  const folder = path.join(root, "NoTitle");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "metadata.json"), JSON.stringify({ artist: "x" }));
  fs.writeFileSync(path.join(folder, "1.jpg"), "img");

  const result = await scanImportRoot(root);
  assert.equal(result.candidates.length, 1);
  const item = result.candidates[0];
  assert.equal(item.status, "ready");
  assert.equal(item.metadata.title, "NoTitle");
  assert.equal(item.warnings.includes("metadata.json missing title; using folder name."), true);
});



test("scanImportRoot ignores unsupported image extensions", async () => {
  const root = makeTempDir();
  const folder = path.join(root, "GifOnly");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "1.gif"), "gif");

  const result = await scanImportRoot(root);
  assert.equal(result.candidates.length, 1);
  const item = result.candidates[0];
  assert.equal(item.imageFiles.length, 0);
  assert.equal(item.status, "no_images");
});
test("importLibraryCandidates maps imported/skipped results", async () => {
  const sourceRoot = makeTempDir();
  const good = path.join(sourceRoot, "Good");
  const empty = path.join(sourceRoot, "Empty");
  const outRoot = makeTempDir();
  fs.mkdirSync(good);
  fs.mkdirSync(empty);
  fs.writeFileSync(path.join(good, "1.jpg"), "img");

  const res = await importLibraryCandidates({
    items: [
      { key: "good", folderPath: good, metadata: { title: "Imported title" } },
      { key: "skip", folderPath: empty, metadata: { title: "No images" } },
    ],
    libraryRoot: outRoot,
    vaultManager: {
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptFileToBuffer: async () => Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001080200000000000000", "hex"),
    },
    getVaultRelPath: (value) => value,
    movePlainDirectImagesToVault: async ({ outDir }) => {
      const out = path.join(outDir, "001.jpg.enc");
      fs.writeFileSync(out, "encrypted");
      return { moved: 1, encryptedPaths: [out] };
    },
    normalizeGalleryId: (value) => String(value || ""),
    writeLibraryIndexEntry: () => {},
  });

  assert.equal(res.imported, 1);
  assert.equal(res.skipped, 1);
  assert.equal(res.failed, 0);
  assert.equal(res.results.length, 2);
});


test("importLibraryCandidates emits progress updates", async () => {
  const sourceRoot = makeTempDir();
  const good = path.join(sourceRoot, "Good");
  fs.mkdirSync(good);
  fs.writeFileSync(path.join(good, "1.jpg"), "img");
  const outRoot = makeTempDir();

  const progressEvents = [];
  const res = await importLibraryCandidates({
    items: [{ key: "good", folderPath: good, metadata: { title: "Imported title" } }],
    libraryRoot: outRoot,
    vaultManager: {
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptFileToBuffer: async () => Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001080200000000000000", "hex"),
    },
    getVaultRelPath: (value) => value,
    movePlainDirectImagesToVault: async ({ outDir }) => {
      const out = path.join(outDir, "001.jpg.enc");
      fs.writeFileSync(out, "encrypted");
      return { moved: 1, encryptedPaths: [out] };
    },
    normalizeGalleryId: (value) => String(value || ""),
    writeLibraryIndexEntry: () => {},
    onProgress: (payload) => progressEvents.push(payload),
  });

  assert.equal(res.imported, 1);
  assert.equal(progressEvents.length >= 2, true);
  assert.equal(progressEvents[0].status, "running");
  assert.equal(progressEvents.at(-1).status, "imported");
});


test("scanSingleManga treats selected folder as one candidate", async () => {
  const manga = makeTempDir();
  fs.writeFileSync(path.join(manga, "001.jpg"), "img");

  const result = await scanSingleManga(manga);
  assert.equal(result.rootPath, manga);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].folderName, path.basename(manga));
  assert.equal(result.candidates[0].status, "ready");
});

test("scanSingleManga marks folder without images as no_images", async () => {
  const manga = makeTempDir();
  fs.writeFileSync(path.join(manga, "note.txt"), "x");

  const result = await scanSingleManga(manga);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "no_images");
});


test("scanSingleManga ignores images inside subfolders", async () => {
  const manga = makeTempDir();
  const nested = path.join(manga, "chapter_01");
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, "001.jpg"), "img");

  const result = await scanSingleManga(manga);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].imageFiles.length, 0);
  assert.equal(result.candidates[0].status, "no_images");
});


test("scanImportRoot ignores common system folders", async () => {
  const root = makeTempDir();
  const ignoredMac = path.join(root, "__MACOSX");
  const ignoredWin = path.join(root, "System Volume Information");
  const valid = path.join(root, "ValidSeries");
  fs.mkdirSync(ignoredMac);
  fs.mkdirSync(ignoredWin);
  fs.mkdirSync(valid);
  fs.writeFileSync(path.join(valid, "001.jpg"), "img");

  const result = await scanImportRoot(root);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].folderName, "ValidSeries");
});

test("shouldIgnoreRootEntry filters hidden and known system folder names", () => {
  assert.equal(shouldIgnoreRootEntry('.git'), true);
  assert.equal(shouldIgnoreRootEntry('__MACOSX'), true);
  assert.equal(shouldIgnoreRootEntry('System Volume Information'), true);
  assert.equal(shouldIgnoreRootEntry('My Series'), false);
});

test("normalizeImportItemsPayload validates items stay within selected root", () => {
  const root = makeTempDir();
  const child = path.join(root, 'SeriesA');
  const outside = makeTempDir();

  const ok = normalizeImportItemsPayload({
    rootPath: root,
    items: [{ key: 'a', folderPath: child }],
  });
  assert.equal(Array.isArray(ok.items), true);
  assert.equal(ok.items.length, 1);

  assert.throws(() => normalizeImportItemsPayload({
    rootPath: root,
    items: [{ key: 'bad', folderPath: outside }],
  }), /outside selected root/);
});
