#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");

const repoRoot = path.resolve(__dirname, "..");
const preloadDir = path.join(repoRoot, "preload");
const outdir = path.join(repoRoot, "preload-dist");
const sourceAdaptersDir = path.join(preloadDir, "source_adapters");
const sourceAdapterRegistryPath = path.join(sourceAdaptersDir, "registry.js");

const preloadEntries = [
  "preload.js",
  "downloader_preload.js",
  "browser_preload.js",
  "browser_view_preload.js",
  "importer_preload.js",
  "exporter_preload.js",
  "reader_preload.js",
];

const subscribeImportPattern = /const\s+\{\s*subscribeIpc\s*\}\s*=\s*require\(["']\.\/ipc_subscribe\.js["']\);?/;
const staticRequirePattern = /require\(\s*(["'])([^"']+)\1\s*\)/g;
const sourceAdapterExportsToken = '"__SOURCE_ADAPTER_MODULE_EXPORTS__"';

function isValidSourceAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") return false;
  if (typeof adapter.sourceId !== "string" || !adapter.sourceId.trim()) return false;
  if (typeof adapter.matchesUrl !== "function") return false;
  if (typeof adapter.extractMetadata !== "function") return false;
  if (typeof adapter.extractPageImageUrls !== "function") return false;
  return true;
}

function findSourceAdapterExport(moduleExports) {
  if (!moduleExports || typeof moduleExports !== "object") return null;
  for (const [exportName, exportValue] of Object.entries(moduleExports)) {
    if (!exportName.endsWith("SourceAdapter")) continue;
    if (isValidSourceAdapter(exportValue)) return exportValue;
  }
  return null;
}

function loadSubscribeFunctionSource() {
  const src = fs.readFileSync(path.join(preloadDir, "ipc_subscribe.js"), "utf8");
  const withoutExports = src.replace(/\nmodule\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, "").trim();
  if (!withoutExports.includes("function subscribeIpc")) {
    throw new Error("ipc_subscribe.js does not define subscribeIpc");
  }
  return `${withoutExports}\n`;
}

function inlineSharedModules(source) {
  if (!subscribeImportPattern.test(source)) return source;
  const subscribeSource = loadSubscribeFunctionSource();
  const stripped = source.replace(subscribeImportPattern, "").trimStart();
  return `${subscribeSource}\n${stripped}`;
}

function listSourceAdapterDirs() {
  return fs
    .readdirSync(sourceAdaptersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .filter((name) => name !== "node_modules")
    .filter((name) => fs.existsSync(path.join(sourceAdaptersDir, name, "index.js")))
    .sort((left, right) => left.localeCompare(right));
}

function validateSourceAdapters(adapterDirs) {
  const seenSourceIds = new Set();
  for (const dir of adapterDirs) {
    const indexPath = path.join(sourceAdaptersDir, dir, "index.js");
    let moduleExports;
    try {
      moduleExports = require(indexPath);
    } catch (error) {
      throw new Error(`Failed loading source adapter module ${dir}: ${error?.message || error}`);
    }

    const adapter = findSourceAdapterExport(moduleExports);
    if (!adapter) {
      throw new Error(`Source adapter ${dir} does not export a valid *SourceAdapter object.`);
    }

    const sourceId = String(adapter.sourceId || "").trim();
    if (seenSourceIds.has(sourceId)) {
      throw new Error(`Duplicate source adapter id detected during build: ${sourceId}`);
    }
    seenSourceIds.add(sourceId);
  }
}

function buildSourceAdapterExportsLiteral() {
  const adapterDirs = listSourceAdapterDirs();
  validateSourceAdapters(adapterDirs);
  const requires = adapterDirs.map((dir) => `require("./${dir}")`).join(", ");
  return `[${requires}]`;
}

function sourceOverrides() {
  const overrides = new Map();
  const registrySource = fs.readFileSync(sourceAdapterRegistryPath, "utf8");
  const exportsLiteral = buildSourceAdapterExportsLiteral();
  if (!registrySource.includes(sourceAdapterExportsToken)) {
    throw new Error("registry.js is missing source adapter exports token");
  }
  overrides.set(sourceAdapterRegistryPath, registrySource.replace(sourceAdapterExportsToken, exportsLiteral));
  return overrides;
}

function resolveModulePath(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.js`,
    path.join(basePath, "index.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Unable to resolve preload module '${specifier}' from ${path.relative(repoRoot, fromFile)}`);
}

function bundleEntryModule(entryPath, sourceOverrideMap = new Map()) {
  const idByPath = new Map();
  const modules = [];
  let nextModuleId = 0;

  function register(absPath) {
    if (idByPath.has(absPath)) return idByPath.get(absPath);
    const id = nextModuleId++;
    idByPath.set(absPath, id);
    const raw = sourceOverrideMap.has(absPath) ? sourceOverrideMap.get(absPath) : fs.readFileSync(absPath, "utf8");
    let transformed = raw;

    transformed = transformed.replace(staticRequirePattern, (full, quote, specifier) => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        return full;
      }
      const depPath = resolveModulePath(absPath, specifier);
      const depId = register(depPath);
      return `__bundleRequire(${depId})`;
    });

    modules.push({ id, source: transformed, file: absPath });
    return id;
  }

  const entryId = register(entryPath);

  const renderedModules = modules
    .map((module) => `
${module.id}: function(module, exports, __bundleRequire, require) {
${module.source}
}`)
    .join(",\n");

  return `(() => {
const __bundleModules = {${renderedModules}
};
const __bundleCache = new Map();
function __bundleRequire(id) {
  if (__bundleCache.has(id)) return __bundleCache.get(id).exports;
  const factory = __bundleModules[id];
  if (!factory) throw new Error(\`Unknown preload module id: \${id}\`);
  const module = { exports: {} };
  __bundleCache.set(id, module);
  factory(module, module.exports, __bundleRequire, require);
  return module.exports;
}
__bundleRequire(${entryId});
})();
`;
}

function assertNoRuntimeRelativeRequire(source, entryName) {
  if (/require\(\s*["']\.\.?\//.test(source)) {
    throw new Error(`${entryName} still has runtime relative require(); preload must be self-contained`);
  }
}

function build() {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  const commonSourceOverrides = sourceOverrides();

  for (const entry of preloadEntries) {
    const inputPath = path.join(preloadDir, entry);
    const outputPath = path.join(outdir, entry);
    const source = fs.readFileSync(inputPath, "utf8");
    const transformed = inlineSharedModules(source);
    const entryOverrides = new Map(commonSourceOverrides);
    entryOverrides.set(inputPath, transformed);
    const bundled = bundleEntryModule(inputPath, entryOverrides);
    assertNoRuntimeRelativeRequire(bundled, entry);
    fs.writeFileSync(outputPath, bundled);
  }

  process.stdout.write(`[build-preload] built ${preloadEntries.length} bundled preload scripts to preload-dist\n`);
}

try {
  build();
} catch (err) {
  console.error("[build-preload] failed", err);
  process.exitCode = 1;
}
