const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ENABLE_LIBRARY_PATH_TRACE_CMD_LOGGING,
  isTagManagerConsoleLoggingEnabled,
} = require("../shared/dev_mode");

test("isTagManagerConsoleLoggingEnabled is disabled by default and enabled by explicit env toggle", () => {
  const original = process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS;
  try {
    delete process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS;
    assert.equal(isTagManagerConsoleLoggingEnabled(), false);

    process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS = "true";
    assert.equal(isTagManagerConsoleLoggingEnabled(), true);

    process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS = "0";
    assert.equal(isTagManagerConsoleLoggingEnabled(), false);
  } finally {
    if (original === undefined) delete process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS;
    else process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS = original;
  }
});


test("library path trace logging toggle is disabled by default", () => {
  assert.equal(ENABLE_LIBRARY_PATH_TRACE_CMD_LOGGING, false);
});
