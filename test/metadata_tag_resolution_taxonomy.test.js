const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("metadata tag alias resolution sends tags taxonomy across renderers", () => {
  const gallerySource = readRepoFile("renderer/renderer.js");
  const readerSource = readRepoFile("renderer/reader_renderer.js");
  const importerSource = readRepoFile("renderer/importer_renderer.js");

  assert.match(gallerySource, /resolveTagsForMetadata\(\{ taxonomy: "tags", rawTags: tags \}\)/);
  assert.match(readerSource, /resolveTagsForMetadata\(\{ taxonomy: "tags", rawTags: tags \}\)/);
  assert.match(importerSource, /resolveTagsForMetadata\(\{ taxonomy: "tags", rawTags: tags \}\)/);
});
