const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("reader group batch IPC channels are role-scoped to gallery and reader", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main", "ipc", "register_main_ipc.js"), "utf8");

  assert.match(source, /"ui:readerOpenGroupBatch": \["gallery"\]/);
  assert.match(source, /"ui:readerOpenGroupBatch:result": \["reader"\]/);

  assert.doesNotMatch(source, /"ui:readerOpenGroupBatch": \[[^\]]*"downloader"/);
  assert.doesNotMatch(source, /"ui:readerOpenGroupBatch": \[[^\]]*"browser-view"/);
});
