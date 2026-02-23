const test = require("node:test");
const assert = require("node:assert/strict");

const { PAGE_MARK_OPTIONS, getImageMetadataFromBuffer, sanitizePageEntry, sanitizePageMark } = require("../main/page_metadata");

test("getImageMetadataFromBuffer parses png dimensions", () => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000004b000000708080200000000000000",
    "hex",
  );
  const meta = getImageMetadataFromBuffer(png);
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 1800);
  assert.equal(meta.bytes, png.length);
});

test("sanitizePageEntry clamps invalid dimensions", () => {
  const entry = sanitizePageEntry({ file: "001.jpg", w: -1, h: "oops", bytes: 20, sourceMtimeMs: 50, sourceSize: 10 });
  assert.equal(entry.file, "001.jpg");
  assert.equal(entry.w, null);
  assert.equal(entry.h, null);
  assert.equal(entry.bytes, 20);
  assert.equal(entry.sourceMtimeMs, 50);
  assert.equal(entry.sourceSize, 10);
});


test("sanitizePageMark only accepts known symbols", () => {
  assert.equal(sanitizePageMark("❤"), "❤");
  assert.equal(sanitizePageMark("⚥"), "⚥");
  assert.equal(sanitizePageMark("unknown"), "");
  assert.equal(sanitizePageMark("  ★  "), "★");
  assert.equal(PAGE_MARK_OPTIONS.includes(""), true);
});
