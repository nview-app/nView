const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("group manager step 1 includes create modal trigger, search, metadata editor, and destructive action controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "group_manager.html"), "utf8");

  assert.match(html, /id="openCreateGroupModalBtn"/);
  assert.match(html, /id="groupSearchInput"/);
  assert.match(html, /id="createGroupModal"/);
  assert.match(html, /id="groupMetaForm"/);
  assert.match(html, /id="groupEditNameInput"/);
  assert.match(html, /id="saveGroupMetaBtn"/);
  assert.match(html, /id="deleteGroupBtn"/);
  assert.doesNotMatch(html, /Deleting a group is irreversible/);
  assert.match(html, /Save group/);
  assert.match(html, /Delete group/);
});

test("group manager step 2 includes membership search and bulk selection controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "group_manager.html"), "utf8");

  assert.match(html, /id="membershipSearchInput"/);
  assert.match(html, /id="selectAllMembershipBtn"/);
  assert.match(html, /id="clearAllMembershipBtn"/);
  assert.match(html, /id="selectedMembershipList"/);
  assert.match(html, /renderer\/thumbnail_pipeline\.js/);
});
