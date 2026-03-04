const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("tag manager renderer sends taxonomy-aware payloads and scopes suggestions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "tag_manager_renderer.js"), "utf8");

  assert.match(source, /const createAliasTaxonomySelectEl = document\.getElementById\("createAliasTaxonomySelect"\)/);
  assert.match(source, /const editAliasTaxonomySelectEl = document\.getElementById\("editAliasTaxonomySelect"\)/);
  assert.match(source, /api\.createAliasGroup\(\{ aliasName, taxonomy, memberRawTags \}\)/);
  assert.match(source, /api\.setVisibility\(\{ taxonomy: entry\.taxonomy, rawTag: entry\.rawTagKey, visibleInFilter \}\)/);
  assert.match(source, /api\.bulkSetVisibility\(\{ taxonomy, rawTags, visibleInFilter \}\)/);
  assert.match(source, /filter\(\(entry\) => entry\.taxonomy === activeTaxonomy\)/);
  assert.match(source, /labelEl\.textContent = inventoryEntry\.label/);
  assert.match(source, /normalizeTagKey\(entry\.sourceLabel\)\.includes\(query\)/);
  assert.match(source, /editAliasTaxonomySelectEl\.value = normalizeTaxonomy\(group\.taxonomy\)/);
  assert.match(source, /function showAppToast\(message, \{ timeoutMs = 3600 \} = \{\}\)/);
  assert.match(source, /result\?\.details\?\.reason === "ALIAS_NAME_CONFLICT"/);
  assert.match(source, /classList\.toggle\("input-conflict", Boolean\(hasConflict\)\)/);
});
