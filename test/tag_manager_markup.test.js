const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("tag manager markup includes tag inventory and alias management controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "tag_manager.html"), "utf8");
  assert.match(html, /id="tagSearchInput"/);
  assert.match(html, /id="showOnlyHiddenToggle"/);
  assert.match(html, /id="showAllVisibleBtn"/);
  assert.match(html, /id="hideAllVisibleBtn"/);
  assert.match(html, /id="aliasGroupsList"/);
  assert.match(html, /id="createAliasBtn"/);
  assert.match(html, /id="createAliasModal"/);
  assert.match(html, /id="createAliasForm"/);
  assert.match(html, /id="createAliasTaxonomySelect"/);
  assert.match(html, /id="createAliasMemberChips"/);
  assert.match(html, /id="editAliasModal"/);
  assert.match(html, /id="editAliasForm"/);
  assert.match(html, /id="editAliasTaxonomySelect"/);
  assert.match(html, /Type is fixed after creation\./);
  assert.match(html, /id="editAliasMemberChips"/);
  assert.match(html, /id="appToast"/);
  assert.match(html, /renderer\/shared\/tag_input\.js/);
  assert.match(html, /renderer\/tag_manager_renderer\.js/);
});
