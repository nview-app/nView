const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("gallery renderer wires groups rail load and keyboard navigation", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "renderer", "renderer.js"), "utf8");

  assert.match(js, /function isGroupsRailEnabled\(\)/);
  assert.match(js, /applyGroupsRailVisibility\(\)/);
  assert.match(js, /async function loadGroupsRail\(\)/);
  assert.match(js, /if \(!isGroupsRailEnabled\(\)\) \{/);
  assert.match(js, /window\.api\.listGroups\(/);
  assert.match(js, /groupsRailEl\?\.addEventListener\("keydown"/);
  assert.match(js, /Create your first group/);
  assert.match(js, /function filterGroupsBySearch\(groups, queryTokens\)/);
  assert.match(js, /const groupName = normalizeText\(group\?\.name \|\| ""\);/);
  assert.match(js, /renderFilteredGroupsRail\(galleryGroups\);/);
  assert.match(js, /await loadGroupsRail\(\);\n  await logUnlockLoadTiming\(unlockStartedAt\);/);
  assert.match(js, /await loadGroupsRail\(\);\n  await maybeOpenSettingsAfterVaultInit\(\);/);
});
