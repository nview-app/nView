const { matchesUrlHashes, normalizeHashList } = require("./url_identity");

const ADAPTER_EXPORT_SUFFIX = "SourceAdapter";
const SOURCE_ADAPTER_MODULE_EXPORTS = "__SOURCE_ADAPTER_MODULE_EXPORTS__";

function isValidSourceAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") return false;
  if (typeof adapter.sourceId !== "string" || !adapter.sourceId.trim()) return false;
  if (typeof adapter.matchesUrl !== "function") return false;
  if (typeof adapter.extractMetadata !== "function") return false;
  if (typeof adapter.extractPageImageUrls !== "function") return false;
  return true;
}

function findAdapterExport(moduleExports) {
  if (!moduleExports || typeof moduleExports !== "object") return null;
  for (const [exportName, exportValue] of Object.entries(moduleExports)) {
    if (!exportName.endsWith(ADAPTER_EXPORT_SUFFIX)) continue;
    if (isValidSourceAdapter(exportValue)) return exportValue;
  }
  return null;
}

function loadSourceAdapterModuleExportsFromFilesystem() {
  const fs = require("node:fs");
  const path = require("node:path");
  const entries = fs.readdirSync(__dirname, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .filter((name) => name !== "node_modules")
    .map((name) => path.join(__dirname, name, "index.js"))
    .filter((indexPath) => fs.existsSync(indexPath))
    .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath))
    .map((indexPath) => require(indexPath));
}

function getSourceAdapterModuleExports() {
  if (Array.isArray(SOURCE_ADAPTER_MODULE_EXPORTS)) {
    return SOURCE_ADAPTER_MODULE_EXPORTS;
  }
  return loadSourceAdapterModuleExportsFromFilesystem();
}

function loadSourceAdapters() {
  const adaptersById = new Map();

  for (const moduleExports of getSourceAdapterModuleExports()) {
    const adapter = findAdapterExport(moduleExports);
    if (!adapter || adapter.enabled === false) continue;
    if (adaptersById.has(adapter.sourceId)) {
      throw new Error(`Duplicate source adapter id detected: ${adapter.sourceId}`);
    }
    adaptersById.set(adapter.sourceId, adapter);
  }

  return Object.freeze(
    Array.from(adaptersById.entries())
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .reduce((accumulator, [sourceId, adapter]) => {
        accumulator[sourceId] = adapter;
        return accumulator;
      }, {})
  );
}

const SOURCE_ADAPTERS_BY_ID = loadSourceAdapters();
const SOURCE_ADAPTERS = Object.freeze(Object.values(SOURCE_ADAPTERS_BY_ID));
const SOURCE_ADAPTER_IDS = Object.freeze(Object.keys(SOURCE_ADAPTERS_BY_ID));

function resolveSourceAdapter(urlValue) {
  for (const adapter of SOURCE_ADAPTERS) {
    if (adapter.matchesUrl(urlValue)) return adapter;
  }
  return null;
}

function parseHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function matchesStartPageRules(adapter, parsed) {
  if (!adapter || !parsed) return false;
  const hosts = Array.isArray(adapter.directDownloadRules?.hosts)
    ? adapter.directDownloadRules.hosts.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (hosts.length) {
    return hosts.includes(String(parsed.hostname || "").trim().toLowerCase());
  }
  const originHashes = normalizeHashList(adapter.directDownloadRules?.originHashes);
  if (!originHashes.length) return false;
  return matchesUrlHashes(parsed.href, originHashes);
}

function resolveSourceAdapterForStartPage(urlValue) {
  const adapterByUrl = resolveSourceAdapter(urlValue);
  if (adapterByUrl) return adapterByUrl;
  const parsed = parseHttpUrl(urlValue);
  if (!parsed) return null;
  for (const adapter of SOURCE_ADAPTERS) {
    if (matchesStartPageRules(adapter, parsed)) return adapter;
  }
  return null;
}

function getSourceAdapterById(sourceId) {
  const key = String(sourceId || "").trim();
  if (!key) return null;
  return SOURCE_ADAPTERS_BY_ID[key] || null;
}

function listSourceAdapterSlots() {
  return SOURCE_ADAPTERS
    .filter((adapter) => adapter?.sourceId !== "stub-template")
    .map((adapter) => ({
      sourceId: adapter.sourceId,
      displayName: adapter.displayName || adapter.sourceId,
      defaultAllowedDomains: Array.isArray(adapter.defaultAllowedDomains)
        ? adapter.defaultAllowedDomains.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
    }));
}

module.exports = {
  SOURCE_ADAPTERS,
  SOURCE_ADAPTER_IDS,
  SOURCE_ADAPTERS_BY_ID,
  resolveSourceAdapter,
  resolveSourceAdapterForStartPage,
  getSourceAdapterById,
  listSourceAdapterSlots,
};
