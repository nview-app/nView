const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("vault login modal includes compact folder picker under logo with accessible label", () => {
  const html = read("windows/index.html");

  assert.match(html, /id="vaultHeader"[\s\S]*id="vaultChooseLibrary"/);
  assert.match(html, /id="vaultChooseLibrary"[\s\S]*id="vaultLibraryPath"/);
  assert.match(html, /aria-label="Change library folder"/);
  assert.match(html, /Choose a different library folder before unlocking/);
  assert.doesNotMatch(html, /id="vaultLibraryFeedback"/);
});

test("renderer supports unlock and init picker variants and login picker re-evaluation", () => {
  const source = read("renderer/renderer.js");

  assert.match(source, /vaultChooseLibraryBtn\.setAttribute\("aria-label", "Choose library folder"\)/);
  assert.match(source, /vaultChooseLibraryBtn\.setAttribute\("aria-label", "Change library folder"\)/);
  assert.match(source, /window\.api\.chooseLibraryPathForLogin\?\.\(\{ currentPath \}\)/);
  assert.match(source, /skipNextSettingsLibraryLoad = true;/);
  assert.match(source, /window\.api\.applyLibraryPathForLogin\?\.\(\{ path: chooserRes\.path \}\)/);
  assert.match(source, /if \(!updateRes\?\.ok\) \{\s+skipNextSettingsLibraryLoad = false;/);
});
