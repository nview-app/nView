const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("gallery tag filtering uses taxonomy-scoped typed keys and visibility lookups", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "renderer.js"), "utf8");
  assert.match(source, /function buildFilterTypedKey\(taxonomy, rawTagKey\)/);
  assert.match(source, /indexes\.visibilityRules\?\.\[rawEntry\.typedKey\]\?\.visibleInFilter === false/);
  assert.match(source, /indexes\.aliasIdByMember\.get\(rawEntry\.typedKey\)/);
  assert.match(source, /optionsByKey\.set\(rawEntry\.typedKey/);
});
