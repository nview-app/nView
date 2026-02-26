const test = require("node:test");
const assert = require("node:assert/strict");

const fromHex = (hex) => Buffer.from(hex, "hex").toString("utf8");

const {
  normalizeHttpUrl,
  sha256Hex,
  matchesUrlHashes,
} = require("../preload/source_adapters/url_identity");

test("normalizeHttpUrl handles missing protocol and invalid input", () => {
  assert.equal(normalizeHttpUrl("example.com")?.href, "https://example.com/");
  assert.equal(normalizeHttpUrl(""), null);
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), null);
});

test("sha256Hex matches known UTF-8 digest vectors", () => {
  assert.equal(
    sha256Hex(fromHex("68747470733a2f2f6e68656e7461692e6e6574")),
    "025cd83ae01cdc332a1698ec3aceec7c84b83557f5388968e02831e877688e07",
  );
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("matchesUrlHashes compares URL origin hash", () => {
  assert.equal(
    matchesUrlHashes(fromHex("68747470733a2f2f6e68656e7461692e6e65742f672f3132332f"), ["025cd83ae01cdc332a1698ec3aceec7c84b83557f5388968e02831e877688e07"]),
    true,
  );
  assert.equal(
    matchesUrlHashes("https://example.com/g/123/", ["025cd83ae01cdc332a1698ec3aceec7c84b83557f5388968e02831e877688e07"]),
    false,
  );
});
