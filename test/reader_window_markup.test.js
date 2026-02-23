const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("reader window includes read manager controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "reader.html"), "utf8");

  assert.match(html, /id="readManagerToggle"/);
  assert.match(html, /id="readManagerMenu"/);
  assert.match(html, /id="readManagerSessionList"/);
  assert.match(html, /Read list/);
  assert.match(html, /icon-book/);
});

test("reader window loads thumbnail pipeline for edit-page previews", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "reader.html"), "utf8");
  assert.match(html, /renderer\/thumbnail_pipeline\.js/);
});
