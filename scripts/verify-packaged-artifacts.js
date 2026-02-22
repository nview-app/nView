#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const expectedPreloadBundles = [
  "preload.js",
  "downloader_preload.js",
  "browser_preload.js",
  "browser_view_preload.js",
  "importer_preload.js",
  "exporter_preload.js",
  "reader_preload.js",
];

function listDirectories(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}

function findPackagedAppDir(outputRoot) {
  const absOutputRoot = path.resolve(outputRoot);
  const candidates = [];

  for (const childDir of listDirectories(absOutputRoot)) {
    const name = path.basename(childDir);

    if (name.endsWith("-unpacked")) {
      const resourcesApp = path.join(childDir, "resources", "app");
      if (fs.existsSync(resourcesApp) && fs.statSync(resourcesApp).isDirectory()) {
        candidates.push(resourcesApp);
      }
      continue;
    }

    if (name.endsWith(".app")) {
      const appBundleRoot = path.join(childDir, "Contents", "Resources", "app");
      if (fs.existsSync(appBundleRoot) && fs.statSync(appBundleRoot).isDirectory()) {
        candidates.push(appBundleRoot);
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Could not find packaged app directory under ${absOutputRoot}. Expected a '*-unpacked/resources/app' or '*.app/Contents/Resources/app' output.`
    );
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function verifyPackagedArtifacts(options = {}) {
  const outputRoot = options.outputRoot || path.join(repoRoot, "dist-smoke");
  const appDir = options.appDir || findPackagedAppDir(outputRoot);

  const preloadDistDir = path.join(appDir, "preload-dist");
  if (!fs.existsSync(preloadDistDir) || !fs.statSync(preloadDistDir).isDirectory()) {
    throw new Error(`Missing packaged preload-dist/ directory at ${preloadDistDir}`);
  }

  for (const bundle of expectedPreloadBundles) {
    const bundlePath = path.join(preloadDistDir, bundle);
    if (!fs.existsSync(bundlePath) || !fs.statSync(bundlePath).isFile()) {
      throw new Error(`Missing packaged preload bundle: ${path.relative(repoRoot, bundlePath)}`);
    }
  }

  const runtimePath = path.join(appDir, "main", "window_runtime.js");
  if (!fs.existsSync(runtimePath) || !fs.statSync(runtimePath).isFile()) {
    throw new Error(`Missing runtime source in packaged app: ${path.relative(repoRoot, runtimePath)}`);
  }

  const runtimeSource = fs.readFileSync(runtimePath, "utf8");
  if (!runtimeSource.includes('path.join(appRootDir, "preload-dist")')) {
    throw new Error(`Packaged runtime is not referencing preload-dist in ${path.relative(repoRoot, runtimePath)}`);
  }
  if (runtimeSource.includes('path.join(appRootDir, "preload", "preload.js")')) {
    throw new Error(`Packaged runtime still references legacy preload path in ${path.relative(repoRoot, runtimePath)}`);
  }

  return { appDir, preloadCount: expectedPreloadBundles.length };
}

if (require.main === module) {
  try {
    const outputRootArg = process.argv[2];
    const result = verifyPackagedArtifacts({ outputRoot: outputRootArg ? path.resolve(outputRootArg) : undefined });
    console.log(
      `[verify-packaged-artifacts] verified ${result.preloadCount} preload bundles in ${path.relative(repoRoot, result.appDir)}`
    );
  } catch (err) {
    console.error(`[verify-packaged-artifacts] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { verifyPackagedArtifacts, expectedPreloadBundles, findPackagedAppDir };
