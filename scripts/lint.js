const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { collectJsFiles } = require("./js-file-helpers");

const rootDir = path.resolve(__dirname, "..");

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
