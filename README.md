<p align="center">
  <img width="500" src="logo/logo-full.png" alt="nView logo">
</p>

# nView

**nView** is a Windows desktop app for collecting, organizing, and reading manga/hentai locally from supported source sites via modular **Source Adapters**.  

Out of the box, nView includes Source Adapters for **nHentai**, **Doujins**, and **E-Hentai**.  

It combines a built-in Web Viewer, a direct download system, a gallery, and a reader into a single **privacy-first workflow**.

Your library is stored **locally**, **encrypted**, and under your control.  
Nothing is uploaded, synced, or shared.


![Gallery](logo/screenshots/0_showcase.png)

| Feature | Description | Preview |
|-------|-------------|---------|
| Setup | First-launch screen where you create the passphrase that unlocks your encrypted local library. | [View screenshot](logo/screenshots/01_setup.png) |
| Settings | Configuration panel for Source Adapter URLs, sorting defaults, display preferences, and viewer safeguards. | [View screenshot](logo/screenshots/02_settings.png) |
| Web Viewer | Minimal embedded browser for navigating supported pages and triggering direct downloads. | [View screenshot](logo/screenshots/03_browser_sfw.png) |
| Downloader | Progress view for active jobs, status updates, and error reporting while downloads run. | [View screenshot](logo/screenshots/04_downloader.png) |
| Gallery/Library | Main library grid with covers and metadata for your locally stored manga collection. | [View screenshot](logo/screenshots/05_gallery.png) |
| Reader | Focused reading mode with page navigation and fit controls for smooth local reading. | [View screenshot](logo/screenshots/06_reader.png) |
| Filters | Search and filter tools for narrowing the library by title, tags, language, and sort mode. | [View screenshot](logo/screenshots/07_filter.png) |
| Edit metadata | Editor dialog to update title, artist, language, tags, and other saved manga details. | [View screenshot](logo/screenshots/08_edit.png) |


---

## What nView is (and is not)

**nView is a desktop application — not a website.**

- The Web Viewer is a tool for browsing supported sites and triggering downloads
- Downloaded content is saved into your **local encrypted library**
- The HTML files in this repository are part of the app UI and are **not meant to be opened in a normal browser**

If you want something cloud-based or synchronized across devices, nView is intentionally not that.

---

## Download & install

### Recommended (easy):
Download the latest installer from GitHub Releases:

[![Download Latest](https://img.shields.io/badge/Download%20Latest-v3.0.0-blue.svg)](https://github.com/nview-app/nView/releases/latest/download/nView.Setup.3.0.0.exe)

Run the `.exe` and follow the installer. Please see: [Windows SmartScreen / Antivirus warnings](#windows-smartscreen--antivirus-warnings)


### Advanced:
Build and run from source (see [Build and run](#build-and-run)).

---

## First launch (important)

On first launch:

1. Install and run the application.
2. Set a **passphrase** used to unlock your encrypted local library.
3. After the passphrase is set, **Settings will open automatically**.
4. Enter one or more **Source Adapter URLs** in Settings.
5. Save settings to continue.

⚠️ **If you forget the passphrase, your library cannot be recovered.**  
⚠️ At least one valid **Source Adapter URL** is required for the Web Viewer and direct downloads to work.

---

## How nView works (the big picture)

Think of nView as four connected parts:

1. **Gallery** – your local library (covers, metadata, filters)  
2. **Reader** – read manga without distractions  
3. **Web Viewer** – browse supported sites and trigger downloads  
4. **Downloader** – tracks and manages active downloads  

Everything flows **into** the Gallery, and nothing leaves your machine.

---

## Using nView

### Gallery (library)

The Gallery is your permanent local library.

Each card represents a manga and supports:
- cover preview
- title, artist, tags
- favorites
- right-click actions

**Right-click menu (Gallery):**
- Add / Remove from favorites
- Edit metadata
- Delete (with confirmation)

The Gallery is incrementally updated to improve performance and memory use for large libraries.

---

### Reader

Click a manga card to open the **Reader**.

The Reader:
- lazy-loads pages
- streams decrypted image data in memory
- revokes page blobs when no longer needed
- keeps RAM usage stable even for large comics
- Right-click to enable auto-scroll and adjust the speed

**Reader controls:**
- **Space** – next page
- **F** – toggle fit mode
- Page dropdown – jump to any page
- Edit metadata directly from the Reader

Deleting a manga automatically closes the Reader first to prevent file-lock issues on Windows.

---

### Filters, search & sorting

In the Gallery you can:
- search by title, artist, and tags
- filter by tags (match any / match all)
- filter by language
- sort by recency, title, page count, artist, or favorites

Tag and language options update dynamically based on your library.

---

### Web Viewer

Open it via **Open Web Viewer** from the Gallery toolbar.

The embedded browser is intentionally minimal:
- no persistent cookies
- no cache
- no saved sessions (everything resets when closed)

It is **not** a general-purpose browser. It exists to:
- browse your configured **Source Adapter URLs**.
- extract metadata and image URLs
- trigger **Direct downloads**
- provide quick navigation via bookmarks

---

### Direct download

Navigate to a supported gallery page in the Web Viewer.  
If a page supports direct download, nView shows a button in the UI.

When clicked:
- nView extracts the **full-size image URLs**
- downloads images directly
- encrypts them **on-the-fly**
- stores them in original format

At no point are plaintext images written to disk.

---

### Import manga

Use **Import manga** from the Gallery toolbar to bring an existing manga folder into your encrypted library.

The importer lets you:
- choose the source folder
- preview detected metadata before import
- confirm and add the manga to your local library

Imported files are processed into nView's local storage format, then become available in the Gallery and Reader like any other entry.

---

### Export manga

Use **Export manga** from the Gallery toolbar to create a portable export of items from your local library.

The exporter lets you:
- select one or more manga entries
- choose an output destination
- generate an export package for backup or transfer

After export finishes, nView keeps your in-app library unchanged while writing the exported data to the destination you selected.

---

### Downloader window

The **Downloader** window shows:
- active jobs
- progress
- completion status
- errors (if any)

When a job completes:
- temporary files are cleaned up
- memory is compacted
- the Gallery refreshes automatically

---

## Settings

Open **Settings** from the Gallery toolbar to configure application behavior, UI preferences, and security boundaries.

### Source Adapter URLs
Each supported source adapter has its own URL field in Settings.  
These URLs are used for Web Viewer start pages, adapter selection, and direct-download matching.

Included Source Adapters in this release: **nHentai**, **Doujins**, **E-Hentai**.

To comply with platform policy requirements, source adapters store hashed URL identities instead of plaintext source domains.
You must enter valid source URLs in Settings for those adapters to activate.

To create or customize your own adapters, see the [Source Adapter Authoring Guide](docs/source-adapter-authoring-guide.md).

### Default sort
Controls how the Gallery is sorted when it opens.

### Manga card size
Controls the width of manga cards in the Gallery grid.

### Dark mode
Applies dark styling across the entire application.

### Block pop-up windows
Prevents websites in the Web Viewer from opening additional windows.

---

### Source adapter rules
Allow-list and direct-download URL checks are now defined per source adapter, not as one global Settings allow list.

This keeps site-specific rules isolated and makes adding or updating source support easier.

---

## Privacy & security

nView is built around **local-only, encrypted storage**.

**Key points:**
- No network sync
- No telemetry
- No background services
- No plaintext image files on disk

### Encryption
- **AES-256-GCM**
- Per-file keys derived via **HKDF**
- Master key protected using **scrypt**
- Files are encrypted as they are downloaded

Even during viewing, images are decrypted **in memory only** and streamed via a custom protocol.

---

## Windows SmartScreen / Antivirus warnings

This application is currently distributed as an unsigned Windows installer.  
Because the installer is not code-signed with a commercial certificate, Windows SmartScreen and some antivirus products may display a warning during download or installation (for example: “Windows protected your PC”).

This is a common limitation for independent and open-source projects and **does not indicate malicious behavior**.

To verify the integrity of the installer:
- Each release includes the SHA-256 checksum of the attached `.exe`
- A corresponding VirusTotal scan is linked in the release notes
- You can independently hash the downloaded file and compare it to the published checksum

Alternatively, you may **build the application yourself from source** using the instructions below.

If you are unsure, do not install the application.

Code signing may be added in a future release.

---

## Developer docs

### Runtime architecture

- **Electron main process** (`main.js`) bootstraps the app lifecycle, windows, IPC registration, protocols, vault state, and downloader/index coordination.
- **Renderer windows**:
  - `windows/index.html` + `renderer/renderer.js`: Gallery + Reader shell.
  - `windows/browser.html` + `renderer/browser_renderer.js`: Web Viewer shell.
  - `windows/downloader.html` + `renderer/downloader_renderer.js`: Downloader queue UI.
  - `windows/importer.html` + `renderer/importer_renderer.js`: Import flow UI.
  - `windows/exporter.html` + `renderer/exporter_renderer.js`: Export flow UI.
- **Preload bridge layer** (`preload/*.js`) provides isolated IPC-safe APIs to each renderer/webview surface.

### Application code map (with responsibilities)

Use this section as a “where should I edit?” index. Only source/code files are listed here (no docs or image/icon assets).

#### Root and bootstrap
- `main.js` — Electron startup entrypoint; wires app lifecycle, windows, protocols, IPC registration, and shared runtime state.
- `package.json` — npm scripts, Electron builder config, and runtime/dev dependencies.

#### Main process core (`main/`)
- `main/app_paths.js` — resolves canonical user-data paths (settings, bookmarks, cleanup queues, library files).
- `main/bookmarks_store.js` — encrypted bookmark persistence/read APIs for the Web Viewer.
- `main/browser_payloads.js` — sanitizes and validates payloads coming from browser-side extraction flows.
- `main/cleanup.js` — deferred file/folder cleanup registries and best-effort deletion helpers.
- `main/direct_encryption.js` — download-time encryption helpers and temp encryption metadata recovery utilities.
- `main/download_manager.js` — job queue/state machine for direct downloads (start/stop/retry/resume/finalize).
- `main/export_runtime.js` — runtime helpers used during export jobs (selection, output paths, result shaping).
- `main/exporter.js` — orchestrates export operations from encrypted library to user-selected destination.
- `main/file_open.js` — safe wrappers for opening files/folders through Electron shell APIs.
- `main/image_pipeline.js` — moves/copies imported or downloaded image files into final comic folders with stable ordering.
- `main/importer.js` — import pipeline that ingests existing manga folders into nView storage/index.
- `main/library_index.js` — maintains the in-memory + encrypted `.library_index.json.enc` cache used for comic metadata and page lookups.
- `main/library_path.js` — resolves and validates active library root, including fallback behavior.
- `main/navigation_history_compat.js` — normalizes and migrates legacy browser navigation history records for compatibility.
- `main/page_metadata.js` — derives and validates page-level metadata used by reader and library indexing flows.
- `main/settings.js` — settings load/update/migration logic (encrypted and compatibility plaintext behavior).
- `main/utils.js` — shared filesystem/json/concurrency utility helpers used across main modules.
- `main/vault.js` — vault initialization/unlock/lock and file encryption/decryption primitives.
- `main/vault_policy.js` — main-process passphrase policy validation rules.
- `main/window_runtime.js` — BrowserWindow/BrowserView creation helpers and shared window runtime wiring.

#### IPC registration and guards (`main/ipc/`)
- `main/ipc/ipc_sender_auth.js` — validates IPC sender/frame origin and trust boundaries.
- `main/ipc/main_ipc_context.js` — builds dependency/context object passed to IPC registration modules.
- `main/ipc/register_downloads_files_ipc.js` — download controls + file open IPC handlers.
- `main/ipc/register_exporter_ipc.js` — exporter-specific IPC channels.
- `main/ipc/register_importer_ipc.js` — importer-specific IPC channels.
- `main/ipc/register_library_content_ipc.js` — IPC handlers for library browsing, page listing, and thumbnail cache/content access.
- `main/ipc/register_main_ipc.js` — top-level IPC composition that registers all handler modules.
- `main/ipc/register_settings_library_ipc.js` — settings + library-path update/get IPC handlers.
- `main/ipc/register_ui_ipc.js` — UI event/state IPC handlers shared by renderer windows.
- `main/ipc/register_vault_browser_ipc.js` — vault actions and browser-view related IPC channels.

#### Shared module (`shared/`)
- `shared/dev_mode.js` — central dev-mode feature flags and environment helpers used across app startup/runtime.
- `shared/vault_policy.js` — shared vault passphrase policy constants and user-facing policy/help text helpers.

#### Preload bridge files (`preload/`)
- `preload/preload.js` — preload bridge for main gallery/reader window (`window.api`).
- `preload/browser_preload.js` — preload bridge for browser shell window (`window.browserApi`).
- `preload/downloader_preload.js` — preload bridge for downloader window (`window.dlApi`).
- `preload/reader_preload.js` — preload bridge for dedicated reader window APIs (`window.readerApi`).
- `preload/importer_preload.js` — preload bridge for importer window APIs.
- `preload/exporter_preload.js` — preload bridge for exporter window APIs.
- `preload/browser_view_preload.js` — BrowserView page-side bridge that injects direct-download controls and extracts metadata/image URLs.
- `preload/ipc_subscribe.js` — shared safe subscription wrapper for event-based IPC listeners.

#### Renderer entry files (`renderer/`)
- `renderer/renderer.js` — primary gallery + reader renderer controller and UI coordination.
- `renderer/browser_renderer.js` — browser shell renderer logic (navigation/bookmarks/filter/download triggers).
- `renderer/downloader_renderer.js` — downloader queue renderer state + actions.
- `renderer/importer_renderer.js` — importer renderer flow, validation, and progress UI.
- `renderer/exporter_renderer.js` — exporter renderer selection/progress/result UI.
- `renderer/reader_renderer.js` — dedicated reader-window renderer controller and event wiring.
- `renderer/thumbnail_pipeline.js` — thumbnail loading/caching pipeline helpers used by the gallery UI.
- `renderer/bridge_guard.js` — guard layer that blocks renderer boot if expected preload APIs are missing.

#### Renderer feature modules (`renderer/**`)
- `renderer/context_menu/context_menu_controller.js` — custom context menu behavior for gallery/library actions.
- `renderer/filters/filter_engine.js` — search/filter/sort matching engine used by gallery listing.
- `renderer/gallery/gallery_thumb_controller.js` — gallery thumbnail lifecycle/virtualization control.
- `renderer/reader/reader_page_controller.js` — reader page loading/navigation/fit-mode state handling.
- `renderer/reader/reader_runtime.js` — reader runtime orchestration for chapter open/close lifecycle and memory handling.
- `renderer/shared/tag_input.js` — reusable tag-input UI helpers shared by metadata/editing flows.
- `renderer/state/renderer_state.js` — centralized renderer-side state container and update helpers.
- `renderer/vault/vault_ui.js` — vault unlock/setup modal workflows and related UI state glue.

#### Window templates (`windows/`)
- `windows/index.html` — markup shell for gallery + reader window.
- `windows/browser.html` — markup shell for Web Viewer window.
- `windows/downloader.html` — markup shell for downloader queue window.
- `windows/reader.html` — markup shell for dedicated reader window.
- `windows/importer.html` — markup shell for importer flow window.
- `windows/exporter.html` — markup shell for exporter flow window.
- `windows/shared.css` — shared styling primitives reused by multiple windows.

#### Tooling scripts (`scripts/`)
- `scripts/build-preload.js` — bundles preload entry files into `dist/preload` outputs used at runtime/packaging.
- `scripts/format-check.js` — formatting compliance checker used by CI/local checks.
- `scripts/js-file-helpers.js` — shared script utilities for scanning/processing JS files.
- `scripts/lint.js` — project lint runner with custom repository checks.
- `scripts/verify-packaged-artifacts.js` — validates packaged build artifacts include required files.
- `scripts/verify-preload-dist.js` — validates generated preload distribution output integrity.

#### Automated tests (`test/`)
- `test/bookmarks_store.test.js` — bookmark encryption/read-write behavior tests.
- `test/bridge_guard.test.js` — renderer preload guard behavior tests.
- `test/browser_payloads.test.js` — browser payload sanitization/normalization tests.
- `test/browser_payloads_limits.test.js` — payload limit/size enforcement tests.
- `test/download_manager.test.js` — download manager queue/state/recovery/finalization tests.
- `test/exporter.test.js` — export runtime helper tests (naming, path resolution, and selection/result shaping).
- `test/file_open.test.js` — shell open-path result normalization tests.
- `test/importer.test.js` — importer flow tests for directory scans, metadata handling, and import result behavior.
- `test/library_index.test.js` — library index CRUD/normalization tests.
- `test/library_path.test.js` — library path resolution/fallback tests.
- `test/page_metadata.test.js` — page metadata parsing/normalization behavior tests.
- `test/main_ipc_context.test.js` — IPC dependency-context construction tests.
- `test/main_ipc_downloads_files_handlers.test.js` — downloads/files IPC handler tests.
- `test/main_ipc_importer_handlers.test.js` — importer IPC handler tests.
- `test/main_ipc_sender_auth.test.js` — IPC sender authorization guard tests.
- `test/main_ipc_settings_library_handlers.test.js` — settings/library IPC handler tests.
- `test/main_ipc_vault_browser_handlers.test.js` — vault/browser IPC handler coverage for security and browser actions.
- `test/gallery_thumb_controller.test.js` — gallery thumbnail controller behavior and lifecycle tests.
- `test/gallery_reader_modal_removed.test.js` — regression tests for removed gallery reader modal flows.
- `test/preload_bundle_integrity.test.js` — preload bundle integrity verification tests.
- `test/preload_ipc_subscribe.test.js` — preload subscription helper tests.
- `test/reader_preload.test.js` — reader preload API exposure and contract tests.
- `test/reader_runtime.test.js` — reader runtime interaction and lifecycle tests.
- `test/reader_page_controller_eviction.test.js` — reader page controller cache-eviction behavior tests.
- `test/reader_page_controller_state_machine.test.js` — reader page controller state machine transition tests.
- `test/reader_window_markup.test.js` — reader window HTML markup structure/safety tests.
- `test/register_library_content_ipc.test.js` — library-content IPC registration and handler tests.
- `test/register_main_ipc.test.js` — aggregate IPC registration behavior tests.
- `test/register_ui_ipc.test.js` — UI IPC registration and renderer event plumbing tests.
- `test/settings_bootstrap.test.js` — bootstrap/migration settings behavior tests.
- `test/utils_helpers.test.js` — utility helper unit tests.
- `test/utils_persistence.test.js` — JSON/persistence utility tests.
- `test/vault_policy.test.js` — passphrase policy validation tests.
- `test/verify_packaged_artifacts.test.js` — packaged artifact verification script tests.

### Persistence layout (`app.getPath("userData")`)
- `settings.json.enc` (encrypted settings when vault is active)
- `settings.json` (compatibility plaintext fallback)
- `bookmarks.enc`
- `pending_cleanup.json`
- `pending_file_cleanup.json`

### Library layout
- Default root: `app.getPath("userData")/Library` (or custom library path from settings).
- Vault/index artifacts:
  - `.vault.json`
  - `.library_index.json`
- Manga folders:
  - `comic_<timestamp>_<id>/`
  - encrypted pages in original extension + encrypted metadata payloads.

### Secure local content delivery

- `appfile://` serves already-decrypted thumbnail/image bytes from controlled paths.
- `appblob://` streams on-demand decrypted image data from encrypted library files.


### Download and indexing flow

1. Browser-side extraction gathers full-size image URLs + parsed metadata.
2. `download_manager` creates a temp workspace/job, streams each file, and encrypts bytes before final persistence.
3. Final assets are moved into `Library/comic_*` and associated encryption metadata is finalized.
4. `library_index` writes/updates the normalized entry (title/artist/tags/pages/favorite/galleryId/path).
5. Main process emits IPC events (`dl:update`, `library:changed`, active count updates) to keep Gallery/Downloader state synchronized.
6. On app restart, unfinished jobs can be resumed and stale temp artifacts are swept via cleanup registries.

### Cryptography model (Vault)

- Vault mode is passphrase-gated and required for encrypted features.
- Passphrase -> KEK derivation uses **scrypt**.
- A randomly generated master key is wrapped with **AES-256-GCM**.
- Per-file keys are derived from the master key using **HKDF-SHA256** with relative file path context.
- File payloads use an authenticated encrypted format (`NVEN` header + version + nonce + tag + ciphertext).
- Direct downloads are encrypted during streaming, so successful download paths avoid plaintext-at-rest writes.

---

## Build and run

### Requirements

- **Windows** (native secure-memory addon is Windows-first)
- **Node.js LTS** (recommended: 18+)
- **npm** (comes with Node)
- **Visual Studio Build Tools** with C++ workload (required for native addon compilation)

### Install dependencies

```bash
npm install
```

### Build preload + native addon

Run this once after install, and again whenever Electron/Node headers change:

```bash
npm run check:native
```

`check:native` runs:

1. `npm run rebuild-native` — compiles `native/src/*.cc` via `node-gyp`.
2. `npm run verify-native` — verifies the addon exports and smoke-checks the secure-memory API.

If you only need to compile without verification:

```bash
npm run rebuild-native
```

### Run (development)

```bash
npm start
```

`npm start` rebuilds preload scripts and launches Electron. The native addon is loaded at runtime from `native/build/Release/addon.node` (or `NVIEW_SECURE_MEM_ADDON_PATH` if set).

### Native security policy toggles (optional)

```bash
# Disable native lock path (fallback wipe path remains active)
NVIEW_SECURE_MEM_ENABLED=0 npm start

# Enforce strict lock/unlock guarantees (fail closed if unavailable)
NVIEW_SECURE_MEM_STRICT=1 npm start
```

### Run automated checks (same as CI + native)

```bash
npm run check
npm run check:native
npm run secure-memory:ops-check
```

CI (GitHub Actions) runs `npm ci` and `npm run check` on every push and pull request. For release validation, run native checks and packaging checks locally as well.

### Build Windows executable

```bash
npm run build:win
```

This packages the app and unpacks the native addon from `native/build/Release/*.node` via `asarUnpack`.

---
