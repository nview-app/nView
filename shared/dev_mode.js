// Toggle startup performance instrumentation here.
// Keep this out of in-app settings so only code changes can modify behavior.
const ENABLE_STARTUP_PERF_LOGGING = false;
// Toggle detailed direct download lifecycle logs in the app CMD/terminal.
const ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING = false;

module.exports = {
  ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING,
  ENABLE_STARTUP_PERF_LOGGING,
};
