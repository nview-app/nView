const fs = require("node:fs");
const path = require("node:path");
const { collectJsFiles } = require("./js-file-helpers");

const rootDir = path.resolve(__dirname, "..");

function checkFormatting(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);
  const trailingWhitespace = lines.findIndex((line) => /\s+$/.test(line));
  const hasFinalNewline = contents.endsWith("\n");

  return {
    trailingWhitespace,
    hasFinalNewline,
  };
}

const files = collectJsFiles(rootDir);
const failures = [];

for (const file of files) {
  const result = checkFormatting(file);
  if (result.trailingWhitespace !== -1 || !result.hasFinalNewline) {
    failures.push({
      file,
      trailingWhitespace: result.trailingWhitespace,
      hasFinalNewline: result.hasFinalNewline,
    });
  }
}

if (failures.length > 0) {
  console.error("Formatting check failed:");
  for (const failure of failures) {
    if (failure.trailingWhitespace !== -1) {
      console.error(
        `- ${failure.file}: trailing whitespace on line ${failure.trailingWhitespace + 1}`,
      );
    }
    if (!failure.hasFinalNewline) {
      console.error(`- ${failure.file}: missing final newline`);
    }
  }
  process.exit(1);
}

console.log(`Formatting check passed for ${files.length} files.`);
