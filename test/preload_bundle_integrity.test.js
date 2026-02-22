const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const bundleDir = path.join(repoRoot, "preload-dist");
const preloadEntries = [
  "preload.js",
  "downloader_preload.js",
  "browser_preload.js",
  "browser_view_preload.js",
  "importer_preload.js",
  "exporter_preload.js",
  "reader_preload.js",
];

function buildPreloads() {
  execFileSync(process.execPath, [path.join(repoRoot, "scripts", "build-preload.js")], {
    cwd: repoRoot,
    stdio: "pipe",
  });
}

test("window runtime uses bundled sandbox preloads", () => {
  const runtimeSource = fs.readFileSync(path.join(repoRoot, "main", "window_runtime.js"), "utf8");
  assert.match(runtimeSource, /preloadBundleDir\s*=\s*path\.join\(appRootDir,\s*"preload-dist"\)/);
  assert.doesNotMatch(runtimeSource, /path\.join\(appRootDir,\s*"preload",\s*"preload\.js"\)/);
});

test("sandboxed preload bundles are generated with no runtime relative requires", () => {
  buildPreloads();

  for (const entry of preloadEntries) {
    const outputPath = path.join(bundleDir, entry);
    assert.equal(fs.existsSync(outputPath), true, `${entry} bundle should exist`);

    const source = fs.readFileSync(outputPath, "utf8");
    assert.doesNotMatch(
      source,
      /require\(\s*["']\.\.?\//,
      `${entry} bundle must not include runtime relative require()`
    );
  }

  const galleryPreloadBundle = fs.readFileSync(path.join(bundleDir, "preload.js"), "utf8");
  assert.match(galleryPreloadBundle, /function subscribeIpc\(/);
});

test("electron-builder packaging config includes and validates preload bundles", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["build:win"], "npm run build:preload && electron-builder --win");
  assert.equal(packageJson.scripts["package:smoke"], "electron-builder --dir -c.asar=false -c.directories.output=dist-smoke");
  assert.equal(packageJson.scripts["verify:packaged-artifacts"], "node scripts/verify-packaged-artifacts.js dist-smoke");
  assert.equal(packageJson.build.beforePack, "scripts/verify-preload-dist.js");
  assert.match(packageJson.build.files.join("\n"), /preload-dist\/\*\*\/\*/);
});

test("ci runs packaged artifact smoke checks", () => {
  const ciSource = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ciSource, /- name: Packaged artifact smoke test/);
  assert.match(ciSource, /npm run build:preload/);
  assert.match(ciSource, /npm run package:smoke/);
  assert.match(ciSource, /npm run verify:packaged-artifacts/);
});
