# Developer Code Map

This document replaces the old **Developer docs** section from `README.md`. It lists every tracked code-oriented file in the repository with a short responsibility summary.

## Root bootstrap/config

- `main.js` — Electron app entrypoint; wires lifecycle, windows, protocols, and IPC bootstrap.
- `package-lock.json` — Locked npm dependency graph for reproducible installs.
- `package.json` — Project manifest with scripts, dependencies, and Electron Builder packaging config.

## Main process (`main/`)

- `main/app_paths.js` — Resolves canonical user-data paths and app-managed storage locations.
- `main/bookmarks_store.js` — Encrypted bookmark persistence APIs for browser window usage.
- `main/browser_payloads.js` — Sanitizes and validates browser-side extraction payloads.
- `main/cleanup.js` — Deferred cleanup registries and best-effort file deletion helpers.
- `main/direct_encryption.js` — Download-time encryption helpers and metadata recovery utilities.
- `main/download_manager.js` — Download job queue/state machine (start/retry/resume/finalize).
- `main/export_runtime.js` — Helpers used during export runs (selection, paths, result shaping).
- `main/exporter.js` — Export orchestration from encrypted library to destination folders.
- `main/file_open.js` — Safe wrappers around Electron shell open operations.
- `main/groups_store.js` — Persistence helpers for custom gallery/reader groups.
- `main/image_pipeline.js` — Import/download image staging and final ordering pipeline.
- `main/importer.js` — Folder import pipeline into encrypted nView library format.
- `main/library_index.js` — Read/write/update logic for the encrypted library index cache.
- `main/library_path.js` — Resolves and validates active library root path.
- `main/navigation_history_compat.js` — Compatibility/migration helpers for browser history records.
- `main/page_metadata.js` — Parses and normalizes page-level metadata.
- `main/settings.js` — Settings load/save/migration logic for encrypted/compat modes.
- `main/tag_manager_rollout.js` — Feature rollout/version-gating helpers for tag manager capabilities.
- `main/tag_manager_service.js` — Main-process tag manager business logic and validation.
- `main/tag_manager_store.js` — Tag manager persistence layer and storage helpers.
- `main/utils.js` — Shared filesystem/JSON/concurrency utility helpers.
- `main/vault.js` — Vault lifecycle and cryptographic file operations.
- `main/vault_policy.js` — Main-process passphrase policy validation rules.
- `main/window_runtime.js` — BrowserWindow/BrowserView creation and runtime wiring helpers.

## Main IPC (`main/ipc/`)

- `main/ipc/ipc_sender_auth.js` — IPC sender/frame trust validation and authorization checks.
- `main/ipc/main_ipc_context.js` — Dependency context factory passed into IPC registration modules.
- `main/ipc/reader_open_group_batch_contract.js` — Shared reader group-batch IPC payload contract/validation.
- `main/ipc/register_downloads_files_ipc.js` — Registers download-control and file-open IPC handlers.
- `main/ipc/register_exporter_ipc.js` — Registers exporter window IPC channels.
- `main/ipc/register_groups_ipc.js` — Registers group-management IPC channels.
- `main/ipc/register_importer_ipc.js` — Registers importer window IPC channels.
- `main/ipc/register_library_content_ipc.js` — Registers library-content, page list, and thumbnail IPC handlers.
- `main/ipc/register_main_ipc.js` — Top-level IPC registration composition and wiring.
- `main/ipc/register_settings_library_ipc.js` — Registers settings and library-path IPC handlers.
- `main/ipc/register_tag_manager_ipc.js` — Registers tag manager IPC channels.
- `main/ipc/register_ui_ipc.js` — Registers shared UI event/state IPC handlers.
- `main/ipc/register_vault_browser_ipc.js` — Registers vault actions and browser-view IPC handlers.

## Main native bridge (`main/native/`)

- `main/native/secure_memory_bridge.js` — Node wrapper that loads and interacts with the native secure-memory addon.
- `main/native/secure_memory_policy.js` — Runtime policy/feature checks for secure-memory operations.

## Preload bridges (`preload/`)

- `preload/browser_preload.js` — Browser window preload bridge exposed as `window.browserApi`.
- `preload/browser_view_preload.js` — Injected BrowserView bridge for extraction/download hooks.
- `preload/direct_download_extractor.js` — DOM extraction helpers used by BrowserView direct download workflow.
- `preload/downloader_preload.js` — Downloader window preload bridge (`window.dlApi`).
- `preload/exporter_preload.js` — Exporter window preload bridge and IPC wrappers.
- `preload/group_manager_preload.js` — Group manager window preload bridge and safe IPC helpers.
- `preload/groups_preload.js` — Legacy/shared groups preload API surface for renderer modules.
- `preload/importer_preload.js` — Importer window preload bridge and IPC wrappers.
- `preload/ipc_subscribe.js` — Shared safe event subscription helper for preload bridges.
- `preload/preload.js` — Main gallery/reader preload bridge exposed as `window.api`.
- `preload/reader_preload.js` — Dedicated reader window preload bridge (`window.readerApi`).
- `preload/tag_manager_preload.js` — Tag manager window preload bridge and IPC wrappers.

## Source adapters (`preload/source_adapters/`)

- `preload/source_adapters/doujins/index.js` — Adapter contract entry for `doujins` source support.
- `preload/source_adapters/doujins/metadata_extractor.js` — Extracts gallery metadata for `doujins` pages.
- `preload/source_adapters/doujins/page_list_extractor.js` — Extracts full-size page/image URL lists for `doujins` galleries.
- `preload/source_adapters/doujins/url_rules.js` — URL matching rules and allow-list checks for `doujins`.
- `preload/source_adapters/e_hentai/index.js` — Adapter contract entry for `e_hentai` source support.
- `preload/source_adapters/e_hentai/metadata_extractor.js` — Extracts gallery metadata for `e_hentai` pages.
- `preload/source_adapters/e_hentai/page_list_extractor.js` — Extracts full-size page/image URL lists for `e_hentai` galleries.
- `preload/source_adapters/e_hentai/url_rules.js` — URL matching rules and allow-list checks for `e_hentai`.
- `preload/source_adapters/localhost/index.js` — Adapter contract entry for `localhost` source support.
- `preload/source_adapters/localhost/metadata_extractor.js` — Extracts gallery metadata for `localhost` pages.
- `preload/source_adapters/localhost/page_list_extractor.js` — Extracts full-size page/image URL lists for `localhost` galleries.
- `preload/source_adapters/localhost/url_rules.js` — URL matching rules and allow-list checks for `localhost`.
- `preload/source_adapters/nhentai/index.js` — Adapter contract entry for `nhentai` source support.
- `preload/source_adapters/nhentai/metadata_extractor.js` — Extracts gallery metadata for `nhentai` pages.
- `preload/source_adapters/nhentai/page_list_extractor.js` — Extracts full-size page/image URL lists for `nhentai` galleries.
- `preload/source_adapters/nhentai/url_rules.js` — URL matching rules and allow-list checks for `nhentai`.
- `preload/source_adapters/registry.js` — Source adapter module registration and lookup helpers.
- `preload/source_adapters/stub_template/index.js` — Adapter contract entry for `stub_template` source support.
- `preload/source_adapters/url_identity.js` — Hash/identity helpers for source URL configuration.

## Renderer (`renderer/`)

- `renderer/bridge_guard.js` — Renderer startup guard that validates expected preload APIs.
- `renderer/browser/url_rule_matcher.js` — Renderer-side URL rule matching helper for source checks.
- `renderer/browser_renderer.js` — Embedded browser window logic (navigation, bookmarks, download triggers).
- `renderer/context_menu/context_menu_controller.js` — Custom context-menu behavior for library interactions.
- `renderer/downloader_renderer.js` — Downloader queue renderer state/actions and progress updates.
- `renderer/exporter_renderer.js` — Exporter flow UI, selection state, and result handling.
- `renderer/filters/filter_engine.js` — Search/filter/sort matching engine used by gallery lists.
- `renderer/gallery/gallery_thumb_controller.js` — Gallery thumbnail virtualization and lifecycle control.
- `renderer/group_manager_renderer.js` — Group management UI flow and renderer-side interactions.
- `renderer/importer_renderer.js` — Importer flow UI and validation/progress state.
- `renderer/reader/reader_group_batch_core.js` — Reader group-batch loading core for grouped reading flows.
- `renderer/reader/reader_page_controller.js` — Reader page loading, fit mode, and navigation state machine.
- `renderer/reader/reader_runtime.js` — Reader runtime lifecycle orchestration and cleanup.
- `renderer/reader_renderer.js` — Dedicated reader window renderer controller.
- `renderer/renderer.js` — Main gallery renderer controller and cross-feature UI orchestration.
- `renderer/shared/dropdown.js` — Reusable dropdown UI helper module.
- `renderer/shared/tag_input.js` — Reusable tag input widget/helper logic.
- `renderer/state/renderer_state.js` — Central renderer-side state container and mutation helpers.
- `renderer/tag_manager_renderer.js` — Tag manager UI renderer logic and interactions.
- `renderer/thumbnail_pipeline.js` — Thumbnail loading/cache pipeline used by gallery rendering.
- `renderer/vault/vault_ui.js` — Vault unlock/setup modal UI logic in renderer.

## Shared runtime (`shared/`)

- `shared/dev_mode.js` — Central dev-mode flags/helpers shared across runtime surfaces.
- `shared/vault_policy.js` — Shared passphrase policy constants and user-facing helper text.

## Windows markup/styles (`windows/`)

- `windows/browser.html` — Window template markup for the `browser` surface.
- `windows/downloader.html` — Window template markup for the `downloader` surface.
- `windows/exporter.html` — Window template markup for the `exporter` surface.
- `windows/group_manager.html` — Window template markup for the `group_manager` surface.
- `windows/importer.html` — Window template markup for the `importer` surface.
- `windows/index.html` — Window template markup for the `index` surface.
- `windows/reader.html` — Window template markup for the `reader` surface.
- `windows/shared.css` — Shared application styles used across renderer windows.
- `windows/tag_manager.html` — Window template markup for the `tag_manager` surface.

## Native addon (`native/`)

- `native/binding.gyp` — node-gyp build definition for native addon targets/sources.
- `native/include/secure_memory_types.h` — Shared native secure-memory type definitions.
- `native/package.json` — Native addon package metadata and scripts.
- `native/scripts/smoke.js` — Native addon smoke test script.
- `native/src/addon.cc` — Node-API addon entrypoint and exported method bindings.
- `native/src/secure_memory_noop.cc` — Fallback no-op secure-memory backend for unsupported platforms.
- `native/src/secure_memory_win.cc` — Windows secure-memory backend implementation.

## Tooling scripts (`scripts/`)

- `scripts/build-preload.js` — Builds/bundles preload entry files into distributable outputs.
- `scripts/format-check.js` — Formatting checks used in CI/local validation.
- `scripts/js-file-helpers.js` — Shared script utilities for scanning/manipulating JS file sets.
- `scripts/lint.js` — Custom lint runner and repository consistency checks.
- `scripts/rebuild-native.js` — Rebuilds the native addon via node-gyp/Electron headers.
- `scripts/secure-memory-ops-check.js` — Validates secure-memory operation support on current platform/runtime.
- `scripts/verify-native-addon.js` — Verifies addon exports and performs smoke tests.
- `scripts/verify-packaged-artifacts.js` — Validates packaged build artifacts include required files.
- `scripts/verify-preload-dist.js` — Verifies generated preload dist outputs are present and valid.

## Automated tests (`test/`)

- `test/bookmarks_store.test.js` — Test coverage for `bookmarks_store` behavior and regressions.
- `test/bridge_guard.test.js` — Test coverage for `bridge_guard` behavior and regressions.
- `test/browser_payloads.test.js` — Test coverage for `browser_payloads` behavior and regressions.
- `test/browser_payloads_limits.test.js` — Test coverage for `browser_payloads_limits` behavior and regressions.
- `test/dev_mode.test.js` — Test coverage for `dev_mode` behavior and regressions.
- `test/direct_download_extractor.test.js` — Test coverage for `direct_download_extractor` behavior and regressions.
- `test/direct_encryption_secure_memory.test.js` — Test coverage for `direct_encryption_secure_memory` behavior and regressions.
- `test/download_manager.test.js` — Test coverage for `download_manager` behavior and regressions.
- `test/dropdown_rollout_flag.test.js` — Test coverage for `dropdown_rollout_flag` behavior and regressions.
- `test/dropdown_shared.test.js` — Test coverage for `dropdown_shared` behavior and regressions.
- `test/export_runtime.test.js` — Test coverage for `export_runtime` behavior and regressions.
- `test/exporter.test.js` — Test coverage for `exporter` behavior and regressions.
- `test/file_open.test.js` — Test coverage for `file_open` behavior and regressions.
- `test/filter_engine.test.js` — Test coverage for `filter_engine` behavior and regressions.
- `test/gallery_groups_rail_markup.test.js` — Test coverage for `gallery_groups_rail_markup` behavior and regressions.
- `test/gallery_groups_rail_renderer.test.js` — Test coverage for `gallery_groups_rail_renderer` behavior and regressions.
- `test/gallery_groups_reader_launch.test.js` — Test coverage for `gallery_groups_reader_launch` behavior and regressions.
- `test/gallery_reader_modal_removed.test.js` — Test coverage for `gallery_reader_modal_removed` behavior and regressions.
- `test/gallery_thumb_controller.test.js` — Test coverage for `gallery_thumb_controller` behavior and regressions.
- `test/group_manager_markup.test.js` — Test coverage for `group_manager_markup` behavior and regressions.
- `test/group_manager_renderer_step1.test.js` — Test coverage for `group_manager_renderer_step1` behavior and regressions.
- `test/groups_preload.test.js` — Test coverage for `groups_preload` behavior and regressions.
- `test/groups_store.test.js` — Test coverage for `groups_store` behavior and regressions.
- `test/importer.test.js` — Test coverage for `importer` behavior and regressions.
- `test/library_index.test.js` — Test coverage for `library_index` behavior and regressions.
- `test/library_path.test.js` — Test coverage for `library_path` behavior and regressions.
- `test/main_ipc_context.test.js` — Test coverage for `main_ipc_context` behavior and regressions.
- `test/main_ipc_downloads_files_handlers.test.js` — Test coverage for `main_ipc_downloads_files_handlers` behavior and regressions.
- `test/main_ipc_importer_handlers.test.js` — Test coverage for `main_ipc_importer_handlers` behavior and regressions.
- `test/main_ipc_sender_auth.test.js` — Test coverage for `main_ipc_sender_auth` behavior and regressions.
- `test/main_ipc_settings_library_handlers.test.js` — Test coverage for `main_ipc_settings_library_handlers` behavior and regressions.
- `test/main_ipc_vault_browser_handlers.test.js` — Test coverage for `main_ipc_vault_browser_handlers` behavior and regressions.
- `test/metadata_tag_resolution_taxonomy.test.js` — Test coverage for `metadata_tag_resolution_taxonomy` behavior and regressions.
- `test/modal_backdrop_close_behavior.test.js` — Test coverage for `modal_backdrop_close_behavior` behavior and regressions.
- `test/page_metadata.test.js` — Test coverage for `page_metadata` behavior and regressions.
- `test/preload_bundle_integrity.test.js` — Test coverage for `preload_bundle_integrity` behavior and regressions.
- `test/preload_ipc_subscribe.test.js` — Test coverage for `preload_ipc_subscribe` behavior and regressions.
- `test/reader_group_batch_core.test.js` — Test coverage for `reader_group_batch_core` behavior and regressions.
- `test/reader_open_group_batch_contract.test.js` — Test coverage for `reader_open_group_batch_contract` behavior and regressions.
- `test/reader_page_controller_eviction.test.js` — Test coverage for `reader_page_controller_eviction` behavior and regressions.
- `test/reader_page_controller_state_machine.test.js` — Test coverage for `reader_page_controller_state_machine` behavior and regressions.
- `test/reader_preload.test.js` — Test coverage for `reader_preload` behavior and regressions.
- `test/reader_runtime.test.js` — Test coverage for `reader_runtime` behavior and regressions.
- `test/reader_window_markup.test.js` — Test coverage for `reader_window_markup` behavior and regressions.
- `test/register_groups_ipc.test.js` — Test coverage for `register_groups_ipc` behavior and regressions.
- `test/register_library_content_ipc.test.js` — Test coverage for `register_library_content_ipc` behavior and regressions.
- `test/register_main_ipc.test.js` — Test coverage for `register_main_ipc` behavior and regressions.
- `test/register_main_ipc_groups_policy.test.js` — Test coverage for `register_main_ipc_groups_policy` behavior and regressions.
- `test/register_main_ipc_reader_group_policy.test.js` — Test coverage for `register_main_ipc_reader_group_policy` behavior and regressions.
- `test/register_main_ipc_settings_policy.test.js` — Test coverage for `register_main_ipc_settings_policy` behavior and regressions.
- `test/register_main_ipc_tag_manager_policy.test.js` — Test coverage for `register_main_ipc_tag_manager_policy` behavior and regressions.
- `test/register_tag_manager_ipc.test.js` — Test coverage for `register_tag_manager_ipc` behavior and regressions.
- `test/register_ui_ipc.test.js` — Test coverage for `register_ui_ipc` behavior and regressions.
- `test/register_vault_browser_ipc.test.js` — Test coverage for `register_vault_browser_ipc` behavior and regressions.
- `test/renderer_state.test.js` — Test coverage for `renderer_state` behavior and regressions.
- `test/secure_memory_bridge.test.js` — Test coverage for `secure_memory_bridge` behavior and regressions.
- `test/secure_memory_ops_check.test.js` — Test coverage for `secure_memory_ops_check` behavior and regressions.
- `test/secure_memory_policy.test.js` — Test coverage for `secure_memory_policy` behavior and regressions.
- `test/settings_bootstrap.test.js` — Test coverage for `settings_bootstrap` behavior and regressions.
- `test/source_adapter_config.test.js` — Test coverage for `source_adapter_config` behavior and regressions.
- `test/source_adapter_doujins.test.js` — Test coverage for `source_adapter_doujins` behavior and regressions.
- `test/source_adapter_e_hentai.test.js` — Test coverage for `source_adapter_e_hentai` behavior and regressions.
- `test/source_adapter_registry.test.js` — Test coverage for `source_adapter_registry` behavior and regressions.
- `test/source_adapter_url_identity.test.js` — Test coverage for `source_adapter_url_identity` behavior and regressions.
- `test/tag_input_shared.test.js` — Test coverage for `tag_input_shared` behavior and regressions.
- `test/tag_manager_filter_integration_phaseF.test.js` — Test coverage for `tag_manager_filter_integration_phaseF` behavior and regressions.
- `test/tag_manager_markup.test.js` — Test coverage for `tag_manager_markup` behavior and regressions.
- `test/tag_manager_phase7_performance.test.js` — Test coverage for `tag_manager_phase7_performance` behavior and regressions.
- `test/tag_manager_phase8_security.test.js` — Test coverage for `tag_manager_phase8_security` behavior and regressions.
- `test/tag_manager_phaseG_security_rollout.test.js` — Test coverage for `tag_manager_phaseG_security_rollout` behavior and regressions.
- `test/tag_manager_renderer_phaseE.test.js` — Test coverage for `tag_manager_renderer_phaseE` behavior and regressions.
- `test/tag_manager_rollout.test.js` — Test coverage for `tag_manager_rollout` behavior and regressions.
- `test/tag_manager_service.test.js` — Test coverage for `tag_manager_service` behavior and regressions.
- `test/tag_manager_store.test.js` — Test coverage for `tag_manager_store` behavior and regressions.
- `test/url_rule_matcher.test.js` — Test coverage for `url_rule_matcher` behavior and regressions.
- `test/utils_helpers.test.js` — Test coverage for `utils_helpers` behavior and regressions.
- `test/utils_persistence.test.js` — Test coverage for `utils_persistence` behavior and regressions.
- `test/vault_policy.test.js` — Test coverage for `vault_policy` behavior and regressions.
- `test/vault_secure_memory.test.js` — Test coverage for `vault_secure_memory` behavior and regressions.
- `test/verify_packaged_artifacts.test.js` — Test coverage for `verify_packaged_artifacts` behavior and regressions.
