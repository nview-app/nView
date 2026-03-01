const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("gallery window includes top groups rail section and container", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "windows", "index.html"), "utf8");

  assert.match(html, /id="groupsRailSection"/);
  assert.match(html, /id="groupsRailTitle"/);
  assert.match(html, /id="groupsRail"/);
});

test("gallery shared styles include groups rail card and empty state", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "windows", "shared.css"), "utf8");

  assert.match(css, /\.gallery-page \.groupsRail\s*\{/);
  assert.match(css, /\.gallery-page \.groupsRailCard\s*\{/);
  assert.match(css, /\.gallery-page \.groupsRailEmpty\s*\{/);
});
