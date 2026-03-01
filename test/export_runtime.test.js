const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createExportRuntime } = require("../main/export_runtime");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nviewer-export-runtime-"));
}

test("exportSingleManga preserves Edit pages settings in exported index.json", async () => {
  const root = makeTempDir();
  const comicDir = path.join(root, "comic_1");
  const contentDir = path.join(comicDir, "content");
  const destination = path.join(root, "out");
  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(destination, { recursive: true });

  fs.writeFileSync(path.join(contentDir, "001.jpg.enc"), Buffer.from("enc-1"));
  fs.writeFileSync(path.join(contentDir, "002.jpg.enc"), Buffer.from("enc-2"));

  const metadata = {
    title: "Meta title",
    comicName: "Meta title",
  };
  const index = {
    pageOrder: ["002.jpg", "001.jpg"],
    pageMarks: { "002.jpg": "★", "../unsafe.jpg": "x" },
    pageNames: { "002.jpg": "Page 2", "001.jpg": "Page 1", "../unsafe.jpg": "ignore" },
  };

  const runtime = createExportRuntime({
    fs,
    path,
    LIBRARY_ROOT: () => root,
    buildComicEntry: async () => null,
    listEncryptedImagesRecursiveSorted: async () => [
      path.join(contentDir, "001.jpg.enc"),
      path.join(contentDir, "002.jpg.enc"),
    ],
    summarizeError: (err) => String(err?.message || err),
    resolveUniquePath: (base, name) => path.join(base, name),
    sanitizeExportName: (value) => value,
    getVaultRelPath: (value) => value,
    vaultManager: {
      decryptFileToBuffer: async ({ inputPath }) => {
        if (inputPath.endsWith("metadata.json.enc")) {
          return Buffer.from(JSON.stringify(metadata), "utf8");
        }
        if (inputPath.endsWith("index.json.enc")) {
          return Buffer.from(JSON.stringify(index), "utf8");
        }
        if (inputPath.endsWith("001.jpg.enc")) return Buffer.from("image-1");
        if (inputPath.endsWith("002.jpg.enc")) return Buffer.from("image-2");
        throw new Error("unexpected path");
      },
    },
  });

  const outputPath = await runtime.exportSingleManga({
    entry: {
      dir: comicDir,
      contentDir,
      id: "comic_1",
      title: "Entry title",
    },
    destinationPath: destination,
  });

  const exportedIndex = JSON.parse(fs.readFileSync(path.join(outputPath, "index.json"), "utf8"));
  assert.deepEqual(exportedIndex.pageOrder, ["002.jpg", "001.jpg"]);
  assert.deepEqual(exportedIndex.pagePaths, ["002.jpg", "001.jpg"]);
  assert.deepEqual(exportedIndex.pageMarks, { "002.jpg": "★" });
  assert.deepEqual(exportedIndex.pageNames, { "002.jpg": "Page 2", "001.jpg": "Page 1" });
  assert.equal(fs.readFileSync(path.join(outputPath, "002.jpg"), "utf8"), "image-2");
  assert.equal(fs.readFileSync(path.join(outputPath, "001.jpg"), "utf8"), "image-1");
});
