const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("settings:get IPC channel allows group-manager renderer role", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../main/ipc/register_main_ipc.js"), "utf8");

  assert.match(
    source,
    /const UI_AND_BROWSER_VIEW_ROLES = Object\.freeze\(\["gallery", "downloader", "importer", "exporter", "group-manager", "reader", "browser-ui", "browser-view"\]\);/,
  );
  assert.match(source, /"settings:get": UI_AND_BROWSER_VIEW_ROLES,/);
});
