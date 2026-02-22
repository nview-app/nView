const fs = require('fs');
const path = require('path');

const MAX_EXPORT_NAME_LENGTH = 80;

function sanitizeExportName(input, fallback = 'untitled') {
  const raw = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/[^\p{L}\p{N} ._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '')
    .slice(0, MAX_EXPORT_NAME_LENGTH)
    .replace(/[.\s_-]+$/g, '');
  return raw || fallback;
}

function resolveUniquePath(baseDir, baseName, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const safeBase = sanitizeExportName(baseName);
  let candidate = path.join(baseDir, safeBase);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = path.join(baseDir, `${safeBase} (${suffix})`);
    suffix += 1;
  }
  return candidate;
}

function mapExportResult({ mangaId, title, status, outputPath = null, message = '' }) {
  return {
    mangaId: String(mangaId || ''),
    title: String(title || ''),
    status,
    outputPath: outputPath || null,
    message: String(message || ''),
  };
}

async function buildSelectedEntries({ selectedMangaIds, listLibraryEntries }) {
  const selectedIds = Array.isArray(selectedMangaIds)
    ? selectedMangaIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const entries = await listLibraryEntries();
  const byId = new Map(entries.map((entry) => [String(entry.id || ''), entry]));
  return selectedIds.map((id) => ({ id, entry: byId.get(id) || null }));
}

module.exports = {
  sanitizeExportName,
  resolveUniquePath,
  mapExportResult,
  buildSelectedEntries,
};
