const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadRendererSource() {
  return fs.readFileSync(path.join(__dirname, "..", "renderer", "renderer.js"), "utf8");
}

test("gallery groups rail launches reader via resolve-for-reader and dedicated batch flow", () => {
  const js = loadRendererSource();

  assert.match(js, /async function openGroupInReader\(/);
  assert.match(js, /window\.api\.resolveGroupForReader\(\{ groupId: normalizedGroupId \}\)/);
  assert.match(js, /const openRes = await window\.api\.openReaderGroupBatch\(\{/);
  assert.match(js, /source: "group"/);
  assert.match(js, /mode: "merge"/);
  assert.match(js, /focusPolicy: "preserve-active"/);
  assert.match(js, /comicDirs: orderedDirs/);
  assert.match(js, /showAppToast\(buildGroupLaunchSummaryMessage\(/);
});

test("gallery group launch request id uses dedicated generator", () => {
  const js = loadRendererSource();

  assert.match(js, /function createReaderGroupRequestId\(groupId\)/);
  assert.match(js, /return `grpopen:\$\{suffix\}:\$\{globalThis\.crypto\.randomUUID\(\)\}`/);
  assert.match(js, /return `grpopen:\$\{suffix\}:\$\{Date\.now\(\)\.toString\(36\)\}:\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 10\)\}`/);
});
