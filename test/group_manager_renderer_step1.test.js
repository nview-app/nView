const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("group manager renderer wires step 1 lifecycle actions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "group_manager_renderer.js"), "utf8");

  assert.match(source, /openCreateGroupModalBtn\.addEventListener\("click"/);
  assert.match(source, /groupSearchInputEl\.addEventListener\("input"/);
  assert.match(source, /groupManagerApi\.updateGroupMeta\(/);
  assert.match(source, /groupManagerApi\.deleteGroup\(/);
  assert.match(source, /if \(!res\?\.ok && res\?\.errorCode === "CONFLICT"\)/);
  assert.match(source, /groupManagerApi\.getGroup\(\{ groupId: groupMetaSnapshot\.groupId \}\)/);
  assert.match(source, /deleteGroupBtn\.addEventListener\("click", \(\) => \{/);
  assert.doesNotMatch(source, /window\.prompt\(/);
  assert.match(source, /hasDirtyMeta/);
  assert.match(source, /window\.confirm\("You have unsaved group detail changes\. Continue to membership without saving\?"\)/);
  assert.match(source, /groupManagerApi\.getSettings\(\)/);
  assert.match(source, /groupManagerApi\.onSettingsUpdated\(/);
  assert.match(source, /document\.body\.classList\.toggle\("dark"/);
});

test("group manager renderer wires step 2 membership search, bulk actions, and diff save", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "group_manager_renderer.js"), "utf8");

  assert.match(source, /membershipSearchInputEl\.addEventListener\("input"/);
  assert.match(source, /selectAllMembershipBtn\.addEventListener\("click"/);
  assert.match(source, /clearAllMembershipBtn\.addEventListener\("click"/);
  assert.match(source, /saveMembershipBtn\.addEventListener\("click"/);
  assert.doesNotMatch(source, /discardMembershipBtn\.addEventListener\("click"/);
  assert.match(source, /Array\.isArray\(res\.items\)/);
  assert.match(source, /includeFirstPagePath: true/);
  assert.match(source, /openMembershipPreview\(/);
  assert.match(source, /destroyMembershipPreview\(/);
  assert.match(source, /groupManagerApi\.updateGroupMembership\(payload\)/);
});
