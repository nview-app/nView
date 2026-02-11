const fs = require("node:fs");
const path = require("node:path");

const IGNORED_DIRS = new Set(["node_modules", "dist", "coverage"]);

function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) return [];
      return collectJsFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      return [fullPath];
    }
    return [];
  });
}

module.exports = {
  collectJsFiles,
};
