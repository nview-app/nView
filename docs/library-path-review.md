# Library / Install Path Implementation Review

Date: 2026-02-11

## Scope reviewed

- `main/library_path.js`
- `main.js` (IPC and settings update flow)
- `main/settings.js`
- `main/app_paths.js`
- `renderer/renderer.js`
- `preload/preload.js`
- `test/library_path.test.js`

## Findings

### 1) High: `library:cleanupOldPath` can trash arbitrary folders

`library:cleanupOldPath` accepts a renderer-provided path and only checks that it exists and is not the current active library root. A compromised renderer (or any bug in UI flow) can request trashing unrelated locations.

Current checks in `main.js`:
- Resolve input path
- Ensure exists
- Ensure not active root
- `shell.trashItem(oldPath)`

Suggested hardening:
- Only allow cleanup of the exact `fromRoot` from the most recent successful migration (store it in main process memory with a short TTL).
- Require a one-time migration token returned from `settings:update` and validate it in `library:cleanupOldPath`.
- Reject system/home/app-data critical paths defensively.

### 2) Medium: path ancestry checks are case-sensitive and not realpath-aware

`isSameOrChildPath` relies on `path.resolve` + string prefix checks. On Windows (case-insensitive filesystem), path case differences can bypass expected equivalence.

Suggested hardening:
- Normalize with `path.normalize` and compare lowercased paths on Windows.
- Prefer `fs.realpathSync.native` (when available) before comparison so symlink aliases resolve consistently.

### 3) Medium: migration can partially copy, then fail, without rollback guidance

`migrateLibraryContents` does copy + verify and returns errors, but a mid-copy failure leaves a partially populated destination. This is safe-ish but operationally confusing.

Suggested improvements:
- Stage copy to a temporary subfolder under destination and atomically rename after verification.
- Or return a detailed `partial: true` status with explicit renderer guidance to retry into a clean folder.

### 4) Medium: migration integrity checks only validate file sizes

Verification currently compares relative paths and byte sizes. Corruption with same-size bytes (rare but possible) would not be detected.

Suggested improvement:
- Optional content hashing (e.g., SHA-256) for sampled or all files during verify mode.
- At minimum, hash support files (`.vault.json`, index files) after copy.

### 5) Low: `scanLibraryContents` does not guard against symlink traversal explicitly

The scanner uses `Dirent.isDirectory()` and `isFile()` and does not explicitly process symlinks. Behavior depends on platform/Dirent handling and may be surprising with junctions or unusual links.

Suggested improvement:
- Explicitly detect `entry.isSymbolicLink()` and skip with counters/telemetry.
- Optionally provide a strict mode that fails when symlinks are encountered.

### 6) Low: tests cover happy paths but miss edge and security cases

Current tests are strong for baseline behavior but do not exercise:
- Windows case-insensitive ancestry behavior.
- Symlink/junction handling in scans/moves.
- `cleanupOldPath` abuse scenarios.
- Partial migration and retry ergonomics.

Suggested additions:
- Unit tests for case normalization behavior.
- Tests for migration conflict/partial states.
- IPC tests (or integration tests) for cleanup authorization.

## Positive notes

- Good split of path helpers into `main/library_path.js`.
- `settings:update` blocks path changes while downloads are active.
- UI flow includes estimate + explicit user confirmation before move.
- Fallback behavior for invalid configured paths is implemented and surfaced.
