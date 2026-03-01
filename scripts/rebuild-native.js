#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativeDir = path.join(repoRoot, "native");

function resolveElectronVersion() {
  // Prefer static metadata from installed dependencies so we do not need to
  // execute Electron itself (which can fail in minimal CI/sandbox hosts).
  try {
    const electronPackageJson = require.resolve("electron/package.json", {
      paths: [repoRoot],
    });
    const electronPackage = JSON.parse(fs.readFileSync(electronPackageJson, "utf8"));
    if (typeof electronPackage.version === "string" && electronPackage.version.trim().length > 0) {
      return electronPackage.version.trim();
    }
  } catch (_) {
    // Fall through to command-based probing for environments without local deps.
  }

  // Keep a command-based fallback for edge cases where package metadata is
  // unavailable. Try platform-specific command names to support Windows shells.
  const npxCandidates = process.platform === "win32" ? ["npx.cmd", "npx"] : ["npx"];
  try {
    for (const npxBin of npxCandidates) {
      try {
        const version = execFileSync(npxBin, ["--yes", "electron", "--version"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
        if (version) {
          return version.startsWith("v") ? version.slice(1) : version;
        }
      } catch (_) {
        // Try the next candidate command.
      }
    }
    throw new Error("Electron version command returned an empty response");
  } catch (error) {
    throw new Error(
      `Failed to resolve Electron version from installed package metadata and command probe: ${error.message}`,
    );
  }
}

function resolveNodeGypBin() {
  const npmConfiguredNodeGyp = process.env.npm_config_node_gyp;
  if (npmConfiguredNodeGyp && fs.existsSync(npmConfiguredNodeGyp)) {
    return npmConfiguredNodeGyp;
  }

  try {
    return require.resolve("node-gyp/bin/node-gyp.js", { paths: [repoRoot] });
  } catch (_) {
    // Fall through to npm-bundled node-gyp lookup.
  }

  const nodeBinDir = path.dirname(process.execPath);
  const npmRoot = path.resolve(nodeBinDir, "..", "lib", "node_modules", "npm", "node_modules");
  const nodeGypBin = path.join(npmRoot, "node-gyp", "bin", "node-gyp.js");
  if (!fs.existsSync(nodeGypBin)) {
    throw new Error(`Unable to locate bundled node-gyp at ${nodeGypBin}`);
  }
  return nodeGypBin;
}

function runNodeGyp(nodeGypBin, args) {
  execFileSync(process.execPath, [nodeGypBin, ...args], {
    cwd: nativeDir,
    stdio: "inherit",
  });
}

function resolveDistUrlCandidates() {
  const envDistUrl = process.env.npm_config_disturl || process.env.ELECTRON_DIST_URL;
  const candidates = [
    envDistUrl,
    "https://electronjs.org/headers",
    "https://artifacts.electronjs.org/headers/dist",
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  return [...new Set(candidates.map((value) => value.trim()))];
}

function rebuildNative() {
  if (!fs.existsSync(nativeDir)) {
    throw new Error(`Missing native workspace at ${nativeDir}`);
  }

  const electronVersion = resolveElectronVersion();
  const nodeGypBin = resolveNodeGypBin();
  const distUrlCandidates = resolveDistUrlCandidates();

  let lastError = null;
  for (const distUrl of distUrlCandidates) {
    const commonArgs = [`--target=${electronVersion}`, `--dist-url=${distUrl}`];
    try {
      console.log(`[rebuild-native] Rebuilding addon for Electron ${electronVersion} using ${distUrl}`);
      runNodeGyp(nodeGypBin, ["configure", ...commonArgs]);
      runNodeGyp(nodeGypBin, ["rebuild", ...commonArgs]);
      console.log("[rebuild-native] Native addon rebuild complete");
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[rebuild-native] Rebuild attempt failed with ${distUrl}; trying next dist-url`);
    }
  }

  if (lastError) {
    throw new Error(lastError.message);
  }
  throw new Error("No dist-url candidates available for node-gyp rebuild");
}

if (require.main === module) {
  try {
    rebuildNative();
  } catch (error) {
    console.error(`[rebuild-native] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { rebuildNative, resolveElectronVersion, resolveNodeGypBin, resolveDistUrlCandidates };
