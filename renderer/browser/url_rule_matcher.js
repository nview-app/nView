(function initUrlRuleMatcher(globalScope) {
  let nodeCrypto = null;
  try {
    if (typeof require === "function") {
      nodeCrypto = require("crypto");
    }
  } catch {
    nodeCrypto = null;
  }

  function normalizeHostname(hostname) {
    return String(hostname || "").trim().toLowerCase();
  }

  function parseHttpUrl(urlValue) {
    const raw = String(urlValue || "").trim();
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function patternToRegExp(pathPattern) {
    const normalized = String(pathPattern || "").trim();
    if (!normalized.startsWith("/")) return null;
    const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "u");
  }

  function matchesPathPattern(pathname, pathPattern) {
    const regex = patternToRegExp(pathPattern);
    if (!regex) return false;
    return regex.test(String(pathname || ""));
  }

  function matchesUrlRules(urlValue, rules) {
    const parsed = parseHttpUrl(urlValue);
    if (!parsed) return false;
    const host = normalizeHostname(parsed.hostname);
    const hosts = Array.isArray(rules?.hosts) ? rules.hosts.map(normalizeHostname).filter(Boolean) : [];
    const originHashes = Array.isArray(rules?.originHashes)
      ? rules.originHashes.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const pathPatterns = Array.isArray(rules?.pathPatterns)
      ? rules.pathPatterns.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    if ((!hosts.length && !originHashes.length) || !pathPatterns.length) return false;
    let hostMatches = hosts.includes(host);
    if (!hostMatches && originHashes.length && nodeCrypto?.createHash) {
      const originHash = nodeCrypto
        .createHash("sha256")
        .update(`${parsed.protocol}//${parsed.host}`, "utf8")
        .digest("hex");
      hostMatches = originHashes.includes(String(originHash || "").toLowerCase());
    }
    if (!hostMatches) return false;
    return pathPatterns.some((pattern) => matchesPathPattern(parsed.pathname, pattern));
  }

  const api = Object.freeze({
    parseHttpUrl,
    matchesPathPattern,
    matchesUrlRules,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.nviewUrlRuleMatcher = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
