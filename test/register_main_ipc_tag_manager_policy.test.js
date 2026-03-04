const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("tag manager IPC channels are role-scoped and least privilege", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main", "ipc", "register_main_ipc.js"), "utf8");

  assert.match(source, /"tagManager:getSnapshot": \["gallery"\]/);
  assert.match(source, /"tagManager:setVisibility": \["gallery"\]/);
  assert.match(source, /"tagManager:bulkSetVisibility": \["gallery"\]/);
  assert.match(source, /"tagManager:resetVisibility": \["gallery"\]/);
  assert.match(source, /"tagManager:createAliasGroup": \["gallery"\]/);
  assert.match(source, /"tagManager:updateAliasGroup": \["gallery"\]/);
  assert.match(source, /"tagManager:deleteAliasGroup": \["gallery"\]/);
  assert.match(source, /"tagManager:recoverStore": \["gallery"\]/);
  assert.match(source, /"tagManager:resolveForFilter": \["gallery", "reader", "importer"\]/);
  assert.match(source, /"tagManager:resolveForMetadata": \["gallery", "reader", "importer"\]/);

  assert.doesNotMatch(source, /"tagManager:getSnapshot": \[[^\]]*"browser-view"/);
  assert.doesNotMatch(source, /"tagManager:setVisibility": \[[^\]]*"reader"/);

  assert.match(source, /const TAG_MANAGER_CONTEXT_KEYS = Object\.freeze\(\[\s*"ipcMain", "tagManagerStore", "auditLogger", "telemetryLogger", "settingsManager", "loadLibraryIndexCache",\s*\]\);/m);
});
