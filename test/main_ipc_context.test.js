const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { MAIN_IPC_REQUIRED_CONTEXT_KEYS } = require("../main/ipc/register_main_ipc");

function extractMainIpcContextBlock(source) {
  const match = source.match(/const mainIpcContext = buildMainIpcContext\(\{([\s\S]*?)\n\}\);/);
  assert.ok(match, "Could not find mainIpcContext buildMainIpcContext(...) call in main.js");
  return match[1];
}

test("mainIpcContext provides all dependencies required by registerMainIpcHandlers", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const mainSource = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");

  const contextBlock = extractMainIpcContextBlock(mainSource);

  const missing = MAIN_IPC_REQUIRED_CONTEXT_KEYS.filter((key) => {
    const escaped = key.replace(/[$()*+.?[\\\]^{|}-]/g, "\\$&");
    const re = new RegExp(`\\n\\s*${escaped}\\s*(?::|,)`);
    return !re.test(`\n${contextBlock}`);
  });

  assert.deepEqual(
    missing,
    [],
    `mainIpcContext is missing required keys: ${missing.join(", ")}`,
  );
});

test("register_main_ipc explicit context dependencies stay declared", () => {
  const explicitDependencies = ["validateWritableDirectory", "isDirectoryEmpty", "normalizeTagsInput", "listFilesRecursive", "buildComicEntry", "fs", "path", "shell"];
  const missing = explicitDependencies.filter((dep) => !MAIN_IPC_REQUIRED_CONTEXT_KEYS.includes(dep));

  assert.deepEqual(
    missing,
    [],
    `register_main_ipc required dependency list is missing: ${missing.join(", ")}`,
  );
});
