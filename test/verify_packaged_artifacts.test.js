const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { verifyPackagedArtifacts, expectedPreloadBundles } = require("../scripts/verify-packaged-artifacts");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nviewer-packaged-artifacts-"));
}

function writeFile(filePath, contents = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function buildFakePackagedOutput(root) {
  const appDir = path.join(root, "win-unpacked", "resources", "app");
  const preloadDir = path.join(appDir, "preload-dist");
  fs.mkdirSync(preloadDir, { recursive: true });

  for (const bundle of expectedPreloadBundles) {
    writeFile(path.join(preloadDir, bundle), "// bundled preload\n");
  }

  writeFile(
    path.join(appDir, "main", "window_runtime.js"),
    'const preloadBundleDir = path.join(appRootDir, "preload-dist");\n'
  );

  return appDir;
}

test("verifyPackagedArtifacts passes for unpacked output containing preload-dist bundles", () => {
  const root = makeTempDir();
  const appDir = buildFakePackagedOutput(root);

  const result = verifyPackagedArtifacts({ outputRoot: root });
  assert.equal(result.appDir, appDir);
  assert.equal(result.preloadCount, expectedPreloadBundles.length);
});

test("verifyPackagedArtifacts fails when packaged preload bundle is missing", () => {
  const root = makeTempDir();
  buildFakePackagedOutput(root);

  fs.rmSync(path.join(root, "win-unpacked", "resources", "app", "preload-dist", "importer_preload.js"));

  assert.throws(() => verifyPackagedArtifacts({ outputRoot: root }), /Missing packaged preload bundle/);
});
