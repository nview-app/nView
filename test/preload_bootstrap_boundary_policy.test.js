const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("preload bridge does not expose direct filesystem mutation primitives for bootstrap settings", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../preload/preload.js"), "utf8");

  assert.doesNotMatch(source, /require\(["']fs["']\)/);
  assert.doesNotMatch(source, /writeFile|writeFileSync|renameSync|unlinkSync|mkdirSync/);
  assert.doesNotMatch(source, /basic_settings\.json/);
  assert.match(source, /updateSettings:\s*\(payload\) => ipcRenderer\.invoke\("settings:update", payload\)/);
  assert.match(source, /applyLibraryPathForLogin:\s*\(payload\) => ipcRenderer\.invoke\("library:applyPathForLogin", payload\)/);
});
