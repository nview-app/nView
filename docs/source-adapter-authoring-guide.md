# Source Adapter Authoring Guide

This guide shows how to create a new **source adapter** so nView can support another site without hardcoding site logic.

It is written as a practical step-by-step workflow, using patterns from the `nhentai` adapter and a multi-step extraction example from `e_hentai`.

---

## What a source adapter is

Each adapter lives in its own folder under:

- `preload/source_adapters/<source-id>/`

And uses these 4 files:

1. `metadata_extractor.js` — extract gallery metadata (title, tags, artists, etc.)
2. `page_list_extractor.js` — extract direct image page URLs
3. `url_rules.js` — URL matching rules + hashed origin(s)
4. `index.js` — adapter identity + exported contract

---

## Before you start

Prepare:

- A sample gallery URL from the source.
- The source's gallery page HTML structure (via browser devtools).
- Expected metadata fields (title, artist, tags, etc.).
- How gallery thumbnails map to full image URLs.
- Whether the source is **single-step** (images can be found on gallery page) or **multi-step** (you must fetch sub-pages first).

Tip: save a few representative pages (simple gallery, large gallery, missing fields) so you can test edge cases early.

---

## Step 1: Create your adapter folder

Create a new folder:

- `preload/source_adapters/<source-id>/`

Use lowercase snake-case ids (examples in repository: `nhentai`, `doujins`, `e_hentai`, `localhost`).

---

## Step 2: Implement `metadata_extractor.js`

Your extractor must return the metadata contract used by the app:

- `sourceUrl`
- `galleryId`
- `comicName`
- `artists`
- `artist`
- `tags`
- `parodies`
- `characters`
- `languages`
- `pages`
- `capturedAt`

### nHentai selector example

The `nhentai` adapter reads title and tag blocks with selectors like:

- `#info h1.title .pretty`
- `#info h2.title .pretty`
- `#tags .tag-container`
- `.tags .name`

Example snippet shape the selectors target:

```html
<div id="info">
  <h1 class="title">
    <span class="before">[Some Artist]</span>
    <span class="pretty">Gallery Title</span>
  </h1>
</div>

<div id="tags">
  <div class="tag-container">
    Tags:
    <span class="tags">
      <span class="name">tag-one</span>
      <span class="name">tag-two</span>
    </span>
  </div>
</div>
```

### Implementation checklist

- Create small helpers for null-safe text extraction.
- Keep `sourceUrl` as `String(locationRef?.href || "")`.
- Return `null` when a field is unknown (instead of invalid values).
- Parse numbers safely (`Number.parseInt(..., 10)` + `Number.isFinite`).
- Always set `capturedAt` to `new Date().toISOString()`.

---

## Step 3: Implement `page_list_extractor.js`

This file should produce a clean list of image URLs for download.

There are two common patterns:

1. **Single-step extraction** (nHentai style)
2. **Multi-step extraction** (e-hentai style)

### A) Single-step extraction (nHentai pattern)

The `nhentai` adapter:

1. Selects images from `.thumbs .thumb-container img`
2. Reads `data-src` first, then `src`, then dataset fallback
3. Resolves relative URLs to absolute URLs
4. Rewrites thumbnail host/path to direct image URL format
5. Deduplicates URLs using `Array.from(new Set(urls))`

Example thumbnail HTML shape:

```html
<div class="thumbs">
  <div class="thumb-container">
    <img data-src="https://t5.example.net/galleries/123/1t.jpg" />
  </div>
</div>
```

### B) Multi-step extraction (e-hentai pattern)

Some sources do **not** expose direct image URLs on the main gallery page.
In that case, use a staged approach like `e_hentai/page_list_extractor.js`:

1. Read gallery page count (for e-hentai, from `#gdd td.gdt2` and derive total pagination).
2. For each gallery list page (`?p=0`, `?p=1`, ...), extract reader-page links from `#gdt a`.
3. Deduplicate reader-page links.
4. Fetch each reader-page URL.
5. Extract the final image URL from `#img`.
6. Deduplicate final image URLs.

Conceptual flow:

```text
gallery page(s) -> reader page URLs -> image URLs
```

Pseudo-code structure:

```js
async function extractPageImageUrls(documentRef, locationRef, helpers = {}) {
  const fetchImpl = helpers.fetchImpl || fetch;
  const galleryBaseUrl = String(locationRef?.href || "").split("?p=")[0];

  const pageCount = parseGalleryPageCount(documentRef);
  const readerUrls = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageDocument = pageIndex === 0
      ? documentRef
      : await fetchAndParse(`${galleryBaseUrl}?p=${pageIndex}`, fetchImpl, helpers);
    readerUrls.push(...extractReaderPageUrls(pageDocument, galleryBaseUrl));
  }

  const uniqueReaderUrls = Array.from(new Set(readerUrls));
  const imageUrls = [];

  for (const readerUrl of uniqueReaderUrls) {
    const readerDocument = await fetchAndParse(readerUrl, fetchImpl, helpers);
    const imageUrl = extractImageUrlFromReaderPage(readerDocument, readerUrl);
    if (imageUrl) imageUrls.push(imageUrl);
  }

  return Array.from(new Set(imageUrls));
}
```

### How to find image URLs reliably (practical workflow)

When reverse-engineering a new site, use this sequence:

1. Open a gallery page and inspect network + DOM.
2. Check if final image URLs are present in initial HTML.
3. If not present, click first thumbnail and inspect the reader page HTML.
4. Identify the stable selector for the final image (e.g. `img#img`, `img.main-image`, etc.).
5. Confirm if reader pages are server-rendered HTML (easy) or API-driven (might need JSON parsing).
6. Test at least one short and one large gallery.

Red flags to account for:

- Lazy-loading attributes (`data-src`, `data-original`, etc.).
- Relative URLs that must be normalized against page URL.
- Duplicate pages/URLs across pagination.
- Non-http(s) URLs or malformed strings.

### Implementation checklist

- Accept only valid `http/https` URLs.
- If URL parsing fails, return empty string for that entry and filter it out.
- Deduplicate output.
- Keep source-specific URL rewrite rules isolated in this file.
- For multi-step sources, isolate helper functions (`parseGalleryPageCount`, `extractReaderPageUrls`, `extractImageUrlFromReaderPage`) so tests can target each stage.

---

## Step 4: Implement `url_rules.js` with hashed origins

This file controls URL identity and matching behavior.

Each adapter defines:

- `DIRECT_DOWNLOAD_RULES.originHashes`
- `DIRECT_DOWNLOAD_RULES.pathPatterns`

And usually exports:

- `parseUrl(value)`
- `matches<Source>NameGalleryUrl(value)`

### Why hashes are required

To avoid publishing plaintext source origins in repository code, adapters store SHA-256 hashes of normalized origins.

Hash input format:

- `<protocol>//<host>`
- UTF-8 bytes
- lowercase hex digest

Example from your note:

- `https://google.com` → `05046f26c83e8c88b3ddab2eab63d0d16224ac1e564535fc75cdceee47a0938d`

### Generate a hash locally

```bash
node -e "const crypto=require('node:crypto');const origin='https://google.com';console.log(crypto.createHash('sha256').update(origin,'utf8').digest('hex'));"
```

### Matching best practice

- Normalize URL with `normalizeHttpUrl`.
- Reject invalid/non-http(s) URLs early.
- Verify `originHashes` via `matchesUrlHashes(parsed.href, hashes)`.
- Enforce source-specific path regex after origin verification.

---

## Step 5: Implement `index.js`

Export one adapter object whose export name ends with `SourceAdapter`.

Required fields/functions:

- `sourceId` (stable id)
- `displayName` (human readable)
- `defaultAllowedDomains` (network allowlist defaults)
- `matchesUrl(urlValue)`
- `extractMetadata(documentRef, locationRef)`
- `extractPageImageUrls(documentRef, locationRef)`
- `directDownloadRules`

Optional extras if your source needs them:

- `extractGalleryId`
- URL rewrite helper exports
- `enabled: false` (to keep adapter in tree but disable registration)

---

## Step 6: Ensure registry auto-discovers your adapter

The registry scans `preload/source_adapters/*/index.js` and loads adapters whose export name ends in `SourceAdapter`.

If your export shape is valid, there is no manual registry edit needed.

---

## Step 7: Configure source URL in Settings

Because origins are hashed in code, the user must provide the source URL in settings.

Expected flow:

1. User enters source URL for your adapter slot.
2. App resolves adapter identity using the URL and `originHashes`.
3. URL/path checks determine if direct download should be enabled on the current page.

If the adapter is correct but button visibility fails, usually either:

- Origin hash does not match actual source origin, or
- `pathPatterns` / URL regex are too strict or incorrect.

---

## Step 8: Add/adjust tests

At minimum, validate:

- URL identity matching (`originHashes` + path conditions)
- Metadata extraction for representative HTML
- Page URL extraction + deduplication
- Multi-step extraction behavior if your source fetches intermediate pages

Helpful existing test files to mirror:

- `test/source_adapter_url_identity.test.js`
- `test/source_adapter_config.test.js`
- `test/source_adapter_e_hentai.test.js`
- `test/source_adapter_<source>.test.js`

---

## Step 9: Quick self-review checklist

Before opening a PR:

- [ ] Folder has exactly the expected 4 files.
- [ ] No plaintext restricted source origins are committed.
- [ ] `originHashes` are SHA-256 UTF-8 lowercase hex of normalized origin.
- [ ] `matchesUrl` only accepts valid target pages.
- [ ] Metadata payload always returns all required keys.
- [ ] Page extractor returns only deduplicated `http/https` URLs.
- [ ] Multi-step extractors handle pagination and intermediate fetch failures safely.
- [ ] Adapter export name ends with `SourceAdapter`.
- [ ] Tests pass.

---

## Minimal file skeleton

```text
preload/source_adapters/my_source/
  metadata_extractor.js
  page_list_extractor.js
  url_rules.js
  index.js
```

If you want a starter, begin from `preload/source_adapters/stub_template/index.js`, then split extraction and URL logic into the dedicated files above.