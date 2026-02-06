const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const ignoredDirs = new Set(["node_modules", "dist", "coverage"]);

function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) return [];
      return collectJsFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      return [fullPath];
    }
    return [];
  });
}

const files = collectJsFiles(rootDir);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${file}`);
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} files.`);
