const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("gallery renderer modals are not dismissed by backdrop click handlers", () => {
  const source = readRepoFile("renderer/renderer.js");

  assert.equal(source.includes("if (event.target === appConfirmModalEl)"), false);
  assert.equal(source.includes("if (e.target === editModalEl) closeEditModal();"), false);
  assert.equal(source.includes("if (e.target === editPagesModalEl) closeEditPagesModal();"), false);
  assert.equal(source.includes("if (e.target === settingsModalEl)"), false);
  assert.equal(source.includes("if (event.target === moveLibraryModalEl)"), false);
  assert.equal(source.includes("if (event.target === adapterAllowListModalEl)"), false);
  assert.equal(source.includes("if (e.target === tagModalEl) closeTagModal();"), false);
});

test("reader renderer modals are not dismissed by backdrop click handlers", () => {
  const source = readRepoFile("renderer/reader_renderer.js");

  assert.equal(source.includes("if (event.target === appConfirmModalEl) close(false);"), false);
  assert.equal(source.includes("if (event.target === editModalEl) closeEditModal();"), false);
  assert.equal(source.includes("if (event.target === editPagesModalEl) closeEditPagesModal();"), false);
});
