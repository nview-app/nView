# nView Major Functionality Inventory

This document lists the major user-facing and system-level functionality currently implemented in nView. It is the expanded reference for the summary list in `README.md`.

## 1) Local encrypted library (privacy-first core)

nView stores your collection locally and encrypts content at rest.

- Local-only storage model (no mandatory cloud sync).
- Passphrase-protected vault initialization on first launch.
- AES-256-GCM encryption for stored content.
- HKDF-derived per-file keys.
- scrypt-based passphrase hardening for master-key protection.
- Encrypt-on-ingest workflow for both downloads and imports.
- In-memory-only decryption path for reading (no plaintext image writes to disk).

## 2) Gallery / Library browsing

The gallery is the main library surface for browsing and managing your collection.

- Grid-based gallery with cover thumbnails and metadata cards.
- Library browsing for all stored manga entries.
- Favorite/unfavorite actions.
- Context menu actions (edit metadata, delete, open actions).
- Incremental and virtualized rendering behavior for larger libraries.
- Adjustable card size / visual density settings.

## 3) Search, filtering, and sorting

nView provides multiple ways to narrow and organize large libraries.

- Free-text search over title/artist/tags.
- Tag filtering with positive/include and negative/exclude matching.
- Tag filtering supports both match-any and match-all behavior.
- Language filtering.
- Sorting by recency, title, page count, artist, and favorites.
- Dynamic filter option generation from the current library index.

## 4) Reader experience (scroll-viewer)

The dedicated reader is optimized for long-form manga reading.

- Dedicated reader window/view for selected manga.
- Vertical/scroll-based reading experience.
- Page lazy-loading with memory-aware lifecycle.
- Page jump/dropdown navigation.
- Fit/zoom controls.
- Auto-scroll and speed controls.
- Keyboard hotkeys:
  - `Space`: jump to the next page.
  - `F`: toggle reader width between fit/zoom extremes.
  - `H`: hide/show the reader top bar.
- Reader-level metadata editing access.
- Safe close behavior when deleting currently opened manga.

## 5) Group management

Groups let you organize entries into custom collections.

- Create manga groups/collections.
- Rename and manage existing groups.
- Add/remove manga entries from groups.
- Group-driven browsing workflows in the library UI.

## 6) Tag management

A dedicated tag workflow supports curation and cleanup.

- Centralized tag manager window.
- Create, rename, and delete tags.
- Apply/remove tags to library entries.
- Tag normalization support for consistent filtering/searching.

## 7) Metadata editing

Metadata editing is available throughout the main user flow.

- Dedicated metadata editing workflow for title, artist, language, tags, and related fields.
- Save metadata updates back into local index/store.
- Metadata editing available from both gallery and reader flows.

## 8) Page editor

The page editor provides page-level control within library entries.

- Page-level editor for library entries.
- Assign and maintain page marks.
- Rename individual pages.
- Change/reorder page sequence.

## 9) Embedded Web Viewer (site navigation)

The built-in Web Viewer is used to access supported source pages.

- Built-in browser view for configured source websites.
- Minimal-session behavior (non-persistent browser profile pattern).
- Bookmark support for quick access.
- Optional popup-blocking safeguards.
- URL-rule-driven source matching via modular adapter logic.

## 10) Source Adapter architecture

Adapters isolate source-specific logic and make integrations extensible.

- Modular adapter registry and per-source implementations.
- Included adapters: nHentai, Doujins, E-Hentai, localhost/testing adapter.
- Designed for easy extension so new sources can be integrated with minimal core changes.
- Per-adapter URL rules.
- Per-adapter metadata extraction.
- Per-adapter page list extraction for downloader/ingest workflows.

## 11) Direct download pipeline

Direct download captures supported source pages into the encrypted library.

- Trigger direct download from supported source pages.
- Extract full gallery metadata and page/image URL sets.
- Download manager with queued/active job state.
- On-the-fly encryption during ingest.
- Download progress and error reporting.
- Post-download library refresh/update behavior.

## 12) Import pipeline

Import brings existing local folders into nView storage.

- Import manga from existing local folders.
- Preview/confirm metadata before import commit.
- Convert imported input into encrypted nView library format.
- Make imported items immediately available in gallery/reader flows.

## 13) Export pipeline

Export creates portable outputs from selected entries.

- Export selected manga entries from local library.
- Destination selection and packaging workflow.
- Preserve in-app library state while creating export output.

## 14) Downloader operations UI

The downloader window provides visibility into running and completed jobs.

- Separate downloader window with active/completed jobs.
- Progress display and status transitions.
- Error visibility for failed jobs.
- Cleanup behavior for temporary job artifacts.

## 15) Settings and app customization

Settings controls source integration, behavior defaults, and safeguards.

- Source Adapter URL configuration.
- Default sort selection.
- Card-size configuration.
- Dark mode toggle.
- Popup blocking toggle.
- Built-in option to move/migrate library storage location.
- Adapter-specific activation behavior from configured URLs.

## 16) Security hardening beyond encryption

Additional hardening controls are available for stricter runtime policies.

- Native secure-memory addon bridge support.
- Optional strict secure-memory policy toggles.
- Vault policy helpers and bridge guards.
- Source URL identity hashing and adapter-isolated URL checks.

## 17) Multi-window desktop workflow

nView uses specialized windows and explicit process boundaries.

- Dedicated windows/views for gallery, reader, downloader, importer, exporter, group manager, and tag manager.
- IPC-based main/renderer/preload separation.
- Preload bridge boundaries for safer renderer access.

## 18) Navigation/history helpers

Browser workflows include compatibility-oriented navigation handling.

- Compatibility-aware navigation history behavior for browser workflows.
- Window-level navigation/runtime coordination.

## 19) Thumbnail/image processing pipeline

Image handling is optimized for stability and responsiveness.

- Thumbnail generation and caching pipeline.
- Reader-oriented image streaming/decode flow.
- Memory-aware image lifecycle controls for stability.

## 20) Developer and operations tooling

The repository includes supporting tooling for quality and maintainability.

- Scripted checks for lint/format/security-sensitive operations.
- Native addon rebuild/verification scripts.
- Packaged artifact verification scripts.
- Source Adapter authoring documentation.
