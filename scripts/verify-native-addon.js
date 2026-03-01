#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const addonPath = path.join(repoRoot, "native", "build", "Release", "addon.node");

function verifyNativeAddon() {
  if (!fs.existsSync(addonPath)) {
    throw new Error(`Missing native addon binary at ${path.relative(repoRoot, addonPath)}. Run npm run rebuild-native first.`);
  }

  const addon = require(addonPath);
  const requiredMethods = ["isSupported", "lockBuffer", "unlockBuffer", "wipeBuffer"];
  for (const method of requiredMethods) {
    if (typeof addon[method] !== "function") {
      throw new Error(`Missing required addon export: ${method}`);
    }
  }

  const probe = Buffer.from("native-addon-probe", "utf8");
  const lockResult = addon.lockBuffer(probe);
  if (!lockResult || lockResult.ok !== true || typeof lockResult.locked !== "boolean") {
    throw new Error("lockBuffer returned invalid response");
  }

  const wipeResult = addon.wipeBuffer(probe);
  if (!wipeResult || wipeResult.ok !== true) {
    throw new Error("wipeBuffer returned invalid response");
  }

  const unlockResult = addon.unlockBuffer(probe);
  if (!unlockResult || unlockResult.ok !== true) {
    throw new Error("unlockBuffer returned invalid response");
  }

  if (!probe.equals(Buffer.alloc(probe.length, 0))) {
    throw new Error("wipeBuffer did not clear probe data");
  }

  return {
    supported: addon.isSupported(),
    addonPath: path.relative(repoRoot, addonPath),
  };
}

if (require.main === module) {
  try {
    const result = verifyNativeAddon();
    console.log(`[verify-native-addon] verified ${result.addonPath}; supported=${result.supported}`);
  } catch (error) {
    console.error(`[verify-native-addon] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { verifyNativeAddon };
