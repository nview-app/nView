// Toggle startup performance instrumentation here.
// Keep this out of in-app settings so only code changes can modify behavior.
const ENABLE_STARTUP_PERF_LOGGING = false;
// Toggle detailed direct download lifecycle logs in the app CMD/terminal.
const ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING = false;
// Toggle tag-manager security/telemetry IPC logs in the app CMD/terminal.
const ENABLE_TAG_MANAGER_CMD_LOGGING = false;
// Toggle browser allow-list block diagnostics in the app CMD/terminal.
const ENABLE_BROWSER_ALLOWLIST_CMD_LOGGING = false;

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function isTagManagerConsoleLoggingEnabled() {
  const raw = String(process.env.NVIEW_TAG_MANAGER_CONSOLE_LOGS || "").trim().toLowerCase();
  return TRUTHY_ENV_VALUES.has(raw);
}

module.exports = {
  ENABLE_BROWSER_ALLOWLIST_CMD_LOGGING,
  ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING,
  ENABLE_STARTUP_PERF_LOGGING,
  ENABLE_TAG_MANAGER_CMD_LOGGING,
  isTagManagerConsoleLoggingEnabled,
};
