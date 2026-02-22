#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");

const repoRoot = path.resolve(__dirname, "..");
const preloadDir = path.join(repoRoot, "preload");
const outdir = path.join(repoRoot, "preload-dist");

const preloadEntries = [
  "preload.js",
  "downloader_preload.js",
  "browser_preload.js",
  "browser_view_preload.js",
  "importer_preload.js",
  "exporter_preload.js",
  "reader_preload.js",
];

const subscribeImportPattern = /const\s+\{\s*subscribeIpc\s*\}\s*=\s*require\(["']\.\/ipc_subscribe\.js["']\);?/;

function loadSubscribeFunctionSource() {
  const src = fs.readFileSync(path.join(preloadDir, "ipc_subscribe.js"), "utf8");
  const withoutExports = src.replace(/\nmodule\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, "").trim();
  if (!withoutExports.includes("function subscribeIpc")) {
    throw new Error("ipc_subscribe.js does not define subscribeIpc");
  }
  return `${withoutExports}\n`;
}

function inlineSharedModules(source, subscribeSource, entryName) {
  if (!subscribeImportPattern.test(source)) return source;
  const stripped = source.replace(subscribeImportPattern, "").trimStart();
  return `${subscribeSource}\n${stripped}`;
}

function assertNoRuntimeRelativeRequire(source, entryName) {
  if (/require\(\s*["']\.\.?\//.test(source)) {
    throw new Error(`${entryName} still has runtime relative require(); preload must be self-contained`);
  }
}

function build() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  const subscribeSource = loadSubscribeFunctionSource();

  for (const entry of preloadEntries) {
    const inputPath = path.join(preloadDir, entry);
    const outputPath = path.join(outdir, entry);
    const source = fs.readFileSync(inputPath, "utf8");
    const transformed = inlineSharedModules(source, subscribeSource, entry);
    assertNoRuntimeRelativeRequire(transformed, entry);
    fs.writeFileSync(outputPath, transformed);
  }

  process.stdout.write(`[build-preload] built ${preloadEntries.length} bundled preload scripts to preload-dist\n`);
}

try {
  build();
} catch (err) {
  console.error("[build-preload] failed", err);
  process.exitCode = 1;
}
