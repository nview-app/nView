const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("groups IPC channels are role-scoped to gallery and group-manager renderers", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main", "ipc", "register_main_ipc.js"), "utf8");

  assert.match(source, /"groups:list": \["gallery", "group-manager"\]/);
  assert.match(source, /"groups:get": \["gallery", "group-manager"\]/);
  assert.match(source, /"groups:create": \["gallery", "group-manager"\]/);
  assert.match(source, /"groups:update-meta": \["gallery", "group-manager"\]/);
  assert.match(source, /"groups:update-membership": \["gallery", "group-manager"\]/);
  assert.match(source, /"groups:delete": \["gallery", "group-manager"\]/);
  assert.match(source, /"groups:resolve-for-reader": \["gallery", "group-manager"\]/);

  assert.doesNotMatch(source, /"groups:list": \[[^\]]*"browser-view"/);
  assert.doesNotMatch(source, /"groups:list": \[[^\]]*"downloader"/);
});
