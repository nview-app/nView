function readFlag(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function getSecureMemoryPolicy() {
  const enabled = readFlag("NVIEW_SECURE_MEM_ENABLED", true);
  const strict = readFlag("NVIEW_SECURE_MEM_STRICT", false);
  return {
    enabled,
    strict,
  };
}

module.exports = {
  getSecureMemoryPolicy,
};
