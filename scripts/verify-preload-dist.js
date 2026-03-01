#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const preloadDistDir = path.join(repoRoot, "preload-dist");
const requiredBundles = [
  "preload.js",
  "downloader_preload.js",
  "browser_preload.js",
  "browser_view_preload.js",
  "importer_preload.js",
  "exporter_preload.js",
  "group_manager_preload.js",
  "reader_preload.js",
];

function verifyPreloadDist(rootDir = repoRoot) {
  const targetDir = path.join(rootDir, "preload-dist");
  if (!fs.existsSync(targetDir)) {
    throw new Error("Missing preload-dist/. Run `npm run build:preload` before packaging.");
  }

  for (const bundle of requiredBundles) {
    const bundlePath = path.join(targetDir, bundle);
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`Missing ${path.relative(rootDir, bundlePath)}. Run \`npm run build:preload\` before packaging.`);
    }
    if (!fs.statSync(bundlePath).isFile()) {
      throw new Error(`${path.relative(rootDir, bundlePath)} exists but is not a file.`);
    }
  }

  return requiredBundles.length;
}

async function beforePack(context) {
  const appDir = context?.appDir || repoRoot;
  const count = verifyPreloadDist(appDir);
  console.log(`[verify-preload-dist] verified ${count} preload bundles`);
}

module.exports = beforePack;
module.exports.verifyPreloadDist = verifyPreloadDist;

if (require.main === module) {
  try {
    const count = verifyPreloadDist(repoRoot);
    console.log(`[verify-preload-dist] verified ${count} preload bundles`);
  } catch (err) {
    console.error(`[verify-preload-dist] ${err.message}`);
    process.exit(1);
  }
}
