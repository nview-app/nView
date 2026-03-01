const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  MAX_IMPORT_INDEX_JSON_BYTES,
  candidateStatus,
  importLibraryCandidates,
  normalizeImportedIndex,
  normalizeImportItemsPayload,
  readImportIndexFile,
  scanImportRoot,
  scanSingleManga,
  shouldIgnoreRootEntry,
} = require("../main/importer");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nviewer-importer-"));
}

function createSymlinkOrSkip(t, targetPath, linkPath) {
  try {
    fs.symlinkSync(targetPath, linkPath);
    return true;
  } catch (error) {
    if (error && error.code === "EPERM") {
      t.skip("Symbolic links are not permitted in this environment.");
      return false;
    }
    throw error;
  }
}

const ONE_PIXEL_PNG_BUFFER = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080200000000000000",
  "hex"
);

async function runImportWithStubs({ mangaPath, outRoot, metadata, movePlan }) {
  return importLibraryCandidates({
    items: [{ key: "test", folderPath: mangaPath, metadata }],
    libraryRoot: outRoot,
    vaultManager: {
      encryptBufferWithKey: ({ buffer }) => buffer,
      decryptFileToBuffer: async () => ONE_PIXEL_PNG_BUFFER,
    },
    getVaultRelPath: (value) => value,
    movePlainDirectImagesToVault: async ({ outDir }) => {
      const encryptedPaths = movePlan.map((fileName) => {
        const out = path.join(outDir, fileName);
        fs.writeFileSync(out, "encrypted");
        return out;
      });
      return { moved: encryptedPaths.length, encryptedPaths };
    },
    normalizeGalleryId: (value) => String(value || ""),
    writeLibraryIndexEntry: () => {},
  });
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
  assert.equal(a.indexSource, "none");
  assert.equal(a.indexPath, null);
  assert.equal(b.metadataSource, "template");
  assert.equal(b.metadata.title, "B");
  assert.equal(b.indexSource, "none");
});

test("scanImportRoot reports valid index.json discovery", async () => {
  const root = makeTempDir();
  const folder = path.join(root, "WithIndex");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "1.jpg"), "img");
  fs.writeFileSync(path.join(folder, "index.json"), JSON.stringify({ title: "x", pages: 1 }));

  const result = await scanImportRoot(root);
  const item = result.candidates[0];
  assert.equal(item.indexSource, "file");
  assert.equal(item.indexPath, path.join(folder, "index.json"));
  assert.deepEqual(item.indexWarnings, []);
  assert.deepEqual(item.indexErrors, []);
});

test("scanImportRoot reports malformed index.json as invalid", async () => {
  const root = makeTempDir();
  const folder = path.join(root, "BadIndex");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "1.jpg"), "img");
  fs.writeFileSync(path.join(folder, "index.json"), "{");

  const result = await scanImportRoot(root);
  const item = result.candidates[0];
  assert.equal(item.indexSource, "invalid");
  assert.equal(item.indexErrors[0].startsWith("index.json parse failed:"), true);
});

test("readImportIndexFile loads valid index payload", () => {
  const folder = makeTempDir();
  fs.writeFileSync(path.join(folder, "index.json"), JSON.stringify({ pages: 1, pagePaths: ["001.jpg"] }));

  const result = readImportIndexFile(folder);
  assert.equal(result.ok, true);
  assert.equal(result.value.pages, 1);
  assert.deepEqual(result.warnings, []);
});

test("readImportIndexFile rejects oversized index payload", () => {
  const folder = makeTempDir();
  fs.writeFileSync(path.join(folder, "index.json"), "x".repeat(MAX_IMPORT_INDEX_JSON_BYTES + 1));

  const result = readImportIndexFile(folder);
  assert.equal(result.ok, false);
  assert.equal(result.error, "index.json exceeds size limit.");
  assert.equal(result.warnings.length, 1);
});

test("readImportIndexFile rejects symbolic-link index.json", (t) => {
  const folder = makeTempDir();
  const outsideIndex = path.join(makeTempDir(), "index.json");
  fs.writeFileSync(outsideIndex, JSON.stringify({ pages: 1 }));
  if (!createSymlinkOrSkip(t, outsideIndex, path.join(folder, "index.json"))) return;

  const result = readImportIndexFile(folder);
  assert.equal(result.ok, false);
  assert.equal(result.error, "index.json symbolic links are not allowed.");
});

test("normalizeImportedIndex maps safe source metadata onto authoritative imported pages", () => {
  const finalDir = makeTempDir();
  const movedEncryptedPaths = [
    path.join(finalDir, "001.jpg.enc"),
    path.join(finalDir, "002.jpg.enc"),
  ];
  const parsedIndex = {
    title: "Source Index",
    cover: "./pages/002.jpg",
    pagePaths: ["pages/001.jpg", "pages/002.jpg"],
    pageEntries: [
      { w: 1000, h: 1500, bytes: 200000 },
      { file: "pages/002.jpg", w: 1200, h: 1700, bytes: 250000, ignored: true },
    ],
  };
  const fallbackPageEntries = [
    { file: "001.jpg", w: 10, h: 11, bytes: 12, sourceMtimeMs: 1, sourceSize: 2 },
    { file: "002.jpg", w: 20, h: 21, bytes: 22, sourceMtimeMs: 3, sourceSize: 4 },
  ];

  const normalized = normalizeImportedIndex({
    parsedIndex,
    movedEncryptedPaths,
    finalDir,
    fallbackPageEntries,
    fallbackCover: "001.jpg",
  });

  assert.equal(normalized.usedImported, true);
  assert.equal(normalized.indexOutput.cover, "002.jpg");
  assert.equal(normalized.indexOutput.pages, 2);
  assert.equal(normalized.indexOutput.pageEntries[0].file, "001.jpg");
  assert.equal(normalized.indexOutput.pageEntries[0].w, 1000);
  assert.equal(normalized.indexOutput.pageEntries[1].w, 1200);
  assert.equal(normalized.indexOutput.pageEntries[0].sourceMtimeMs, 1);
});

test("normalizeImportedIndex ignores unsafe references and falls back for cover", () => {
  const finalDir = makeTempDir();
  const movedEncryptedPaths = [path.join(finalDir, "001.jpg.enc")];
  const parsedIndex = {
    cover: "../secret.jpg",
    pagePaths: ["../secret.jpg"],
    pageEntries: [{ file: "../secret.jpg", w: 100, h: 100, bytes: 1000 }],
  };

  const normalized = normalizeImportedIndex({
    parsedIndex,
    movedEncryptedPaths,
    finalDir,
    fallbackPageEntries: [{ file: "001.jpg", w: 1, h: 2, bytes: 3 }],
    fallbackCover: "001.jpg",
  });

  assert.equal(normalized.usedImported, true);
  assert.equal(normalized.indexOutput.cover, "001.jpg");
  assert.equal(normalized.indexOutput.pageEntries[0].w, 1);
  assert.equal(normalized.warnings.length >= 2, true);
});

test("normalizeImportedIndex fails closed for invalid top-level index", () => {
  const normalized = normalizeImportedIndex({
    parsedIndex: null,
    movedEncryptedPaths: ["/tmp/001.jpg.enc"],
    finalDir: "/tmp",
    fallbackPageEntries: [{ file: "001.jpg", w: 1, h: 2, bytes: 3 }],
    fallbackCover: "001.jpg",
  });

  assert.equal(normalized.usedImported, false);
  assert.equal(normalized.indexOutput.cover, "001.jpg");
  assert.equal(normalized.indexOutput.pageEntries.length, 1);
});

test("normalizeImportedIndex ignores invalid imported path list and invalid scalar field types", () => {
  const finalDir = makeTempDir();
  const normalized = normalizeImportedIndex({
    parsedIndex: {
      title: 123,
      cover: 456,
      pagePaths: "not-an-array",
      pageEntries: "not-an-array",
    },
    movedEncryptedPaths: [
      path.join(finalDir, "001.jpg.enc"),
      path.join(makeTempDir(), "outside.jpg.enc"),
      path.join(finalDir, "not-encrypted.jpg"),
    ],
    finalDir,
    fallbackPageEntries: [{ file: "001.jpg", w: 1, h: 2, bytes: 3 }],
    fallbackCover: "001.jpg",
  });

  assert.equal(normalized.usedImported, true);
  assert.equal(normalized.indexOutput.cover, "001.jpg");
  assert.equal(normalized.indexOutput.title, undefined);
  assert.equal(normalized.indexOutput.pages, 1);
  assert.equal(normalized.warnings.some((warning) => warning.includes("non-string title")), true);
  assert.equal(normalized.warnings.some((warning) => warning.includes("outside final directory")), true);
  assert.equal(normalized.warnings.some((warning) => warning.includes("non-encrypted")), true);
});

test("scanImportRoot ignores oversized index.json", async () => {
  const root = makeTempDir();
  const folder = path.join(root, "BigIndex");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "1.jpg"), "img");
  fs.writeFileSync(path.join(folder, "index.json"), "x".repeat(MAX_IMPORT_INDEX_JSON_BYTES + 1));

  const result = await scanImportRoot(root);
  const item = result.candidates[0];
  assert.equal(item.indexSource, "invalid");
  assert.equal(item.indexWarnings.length, 1);
  assert.equal(item.indexWarnings[0].includes(String(MAX_IMPORT_INDEX_JSON_BYTES)), true);
});

test("scanImportRoot rejects symbolic-link index.json", async (t) => {
  const root = makeTempDir();
  const folder = path.join(root, "LinkedIndex");
  const outsideIndex = path.join(makeTempDir(), "index.json");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "1.jpg"), "img");
  fs.writeFileSync(outsideIndex, JSON.stringify({ pages: 1 }));
  if (!createSymlinkOrSkip(t, outsideIndex, path.join(folder, "index.json"))) return;

  const result = await scanImportRoot(root);
  const item = result.candidates[0];
  assert.equal(item.indexSource, "invalid");
  assert.equal(item.indexErrors.includes("index.json symbolic links are not allowed."), true);
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
test("importLibraryCandidates uses source index.json when valid and keeps metadata title authoritative", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "WithIndex");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), JSON.stringify({
    title: "Title from index should not win",
    cover: "001.jpg",
    pageEntries: [{ file: "001.jpg", w: 111, h: 222, bytes: 333 }],
  }));

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Title from metadata" },
    movePlan: ["001.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  assert.equal(res.results[0].status, "imported");
  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.title, "Title from metadata");
  assert.equal(writtenIndex.pageEntries[0].w, 111);
  assert.equal(writtenIndex.cover, "001.jpg");
});

test("importLibraryCandidates falls back when source index.json is malformed", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "BadIndex");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), "{");

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Fallback title" },
    movePlan: ["001.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  assert.equal(Array.isArray(res.results[0].warnings), true);
  assert.equal(res.results[0].warnings.some((warning) => warning.startsWith("index.json parse failed:")), true);
  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.title, "Fallback title");
  assert.equal(writtenIndex.pageEntries[0].w, 1);
});

test("importLibraryCandidates keeps legacy fallback behavior when index.json is missing", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "NoIndex");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "No Index Title" },
    movePlan: ["001.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  assert.equal(res.results[0].status, "imported");
  assert.equal("warnings" in res.results[0], false);

  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.title, "No Index Title");
  assert.equal(writtenIndex.cover, "001.jpg");
  assert.equal(writtenIndex.pages, 1);
  assert.equal(writtenIndex.pageEntries[0].w, 1);
});

test("importLibraryCandidates ignores unsafe pagePaths and cover references from index.json", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "UnsafeIndex");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), JSON.stringify({
    cover: "../../outside.jpg",
    pagePaths: ["../../outside.jpg"],
    pageEntries: [{ file: "../../outside.jpg", w: 900, h: 900, bytes: 1000 }],
  }));

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Unsafe fallback title" },
    movePlan: ["001.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  assert.equal(Array.isArray(res.results[0].warnings), true);
  assert.equal(res.results[0].warnings.some((warning) => warning.includes("unsafe")), true);

  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.cover, "001.jpg");
  assert.equal(writtenIndex.pageEntries[0].w, 1);
});

test("importLibraryCandidates recomputes pages from imported files when source count mismatches", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "CountMismatch");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "2.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), JSON.stringify({
    pages: 99,
    pagePaths: ["001.jpg"],
    pageEntries: [{ file: "001.jpg", w: 500, h: 600, bytes: 700 }],
  }));

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Count mismatch" },
    movePlan: ["001.jpg.enc", "002.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.pages, 2);
  assert.equal(writtenIndex.pageEntries.length, 2);
});

test("importLibraryCandidates falls back to first imported image when source cover does not resolve", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "CoverMismatch");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "2.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), JSON.stringify({
    cover: "missing.jpg",
    pageEntries: [{ file: "001.jpg", w: 101, h: 102, bytes: 103 }],
  }));

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Cover fallback" },
    movePlan: ["001.jpg.enc", "002.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.cover, "001.jpg");
  assert.equal(writtenIndex.pages, 2);
});



test("importLibraryCandidates preserves safe Edit pages settings from source index.json", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "EditPages");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "2.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), JSON.stringify({
    pageOrder: ["002.jpg", "001.jpg", "../unsafe.jpg"],
    pageMarks: { "002.jpg": "⭐", "../unsafe.jpg": "x" },
    pageNames: { "002.jpg": "Second", "001.jpg": "First", "../unsafe.jpg": "ignore" },
  }));

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Edit pages round-trip" },
    movePlan: ["001.jpg.enc", "002.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.deepEqual(writtenIndex.pageOrder, ["002.jpg", "001.jpg"]);
  assert.deepEqual(writtenIndex.pageMarks, { "002.jpg": "⭐" });
  assert.deepEqual(writtenIndex.pageNames, { "002.jpg": "Second", "001.jpg": "First" });
});
test("importLibraryCandidates reports oversized index.json and uses fallback index output", async () => {
  const sourceRoot = makeTempDir();
  const manga = path.join(sourceRoot, "LargeIndex");
  const outRoot = makeTempDir();
  fs.mkdirSync(manga);
  fs.writeFileSync(path.join(manga, "1.jpg"), "img");
  fs.writeFileSync(path.join(manga, "index.json"), "x".repeat(MAX_IMPORT_INDEX_JSON_BYTES + 1));

  const res = await runImportWithStubs({
    mangaPath: manga,
    outRoot,
    metadata: { title: "Large fallback" },
    movePlan: ["001.jpg.enc"],
  });

  assert.equal(res.imported, 1);
  assert.equal(Array.isArray(res.results[0].warnings), true);
  assert.equal(res.results[0].warnings.some((warning) => warning.includes("size limit")), true);

  const indexPath = path.join(res.results[0].finalDir, "index.json.enc");
  const writtenIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(writtenIndex.title, "Large fallback");
  assert.equal(writtenIndex.cover, "001.jpg");
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
