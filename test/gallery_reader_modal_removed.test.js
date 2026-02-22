const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("gallery window no longer contains legacy reader modal or reader runtime scripts", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "index.html"), "utf8");

  assert.equal(html.includes('id="reader"'), false);
  assert.equal(html.includes('../renderer/reader/reader_page_controller.js'), false);
  assert.equal(html.includes('../renderer/reader/reader_runtime.js'), false);
});
