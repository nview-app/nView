# Build and run nView from source (practical contributor guide)

This guide explains how to run **nView** from source, and *why* the build steps are arranged this way.

It is written for contributors who want to understand both:
- the technical build pipeline, and
- the application context (what nView does, what guarantees it tries to preserve, and what can go wrong if build/runtime pieces are out of sync).

---

## 1) Application context: what nView is

nView is a **Windows desktop application** for managing a **local encrypted manga library**.

At a high level, users:
1. Browse supported websites through the embedded **Web Viewer**.
2. Trigger direct download/import flows.
3. Store content in a local encrypted vault.
4. Read and manage entries in the Gallery/Reader.

Important properties of the app:
- It is **desktop-first**, not a cloud service.
- The local library is intended to remain under the user’s control.
- Security-sensitive paths (especially memory wiping/locking behavior) are part of the app’s design goals.

Because of that, the repo includes both JavaScript/HTML/CSS app code **and** a native addon used in secure-memory workflows.

---

## 2) Runtime architecture (what runs when you start the app)

nView uses Electron, so there are two runtimes:

- **Main process** (`main.js`)
  - Node.js context
  - Window lifecycle, filesystem and app orchestration, process-level policy
- **Renderer process** (UI windows)
  - Chromium context
  - Gallery, Reader, downloader and settings surfaces

There is also a **preload layer** (built into `preload-dist/`) that bridges approved APIs between main and renderer.

When you run `npm start`, preload assets are built first, then Electron launches.

---

## 3) Why this repo has native build steps

nView ships a native Node addon (`native/build/Release/addon.node`) for secure-memory operations.

In practical terms, this means:
- a C/C++ toolchain is required,
- native build artifacts can become stale if Node/Electron headers change,
- troubleshooting often includes rebuilding the addon.

### Native commands you will use

- `npm run rebuild-native` → compile addon
- `npm run verify-native` → check exported behavior
- `npm run check:native` → rebuild + verify
- `npm run secure-memory:ops-check` → broader operational validation for secure-memory behaviors

---

## 4) Prerequisites

### Required baseline

- **Windows** (primary supported path for secure-memory-native flow)
- **Node.js LTS** (18+ recommended)
- **npm** (bundled with Node.js)
- **Visual Studio Build Tools** with C++ workload

### Quick environment checks

```bash
node -v
npm -v
```

If either command fails, install or repair Node.js first.

---

## 5) First-time setup

Run commands from repository root.

### Step 1: Install dependencies

```bash
npm install
```

This resolves dev tooling (Electron, electron-builder, scripts) and creates `node_modules/`.

### Step 2: Build + verify native addon

```bash
npm run check:native
```

This confirms your local machine can compile and load the native module correctly.

### Step 3: Start nView in development mode

```bash
npm start
```

Equivalent flow:
1. `npm run build:preload`
2. `electron .`

At this point you should see the app UI (setup/gallery depending on your local state).

---

## 6) Day-to-day contributor commands

### Core quality gate

```bash
npm run check
```

Runs linting, formatting checks, and tests.

### Native/security validation

```bash
npm run check:native
npm run secure-memory:ops-check
```

Use these after changing native code, secure-memory code paths, preload boundaries, or startup policy logic.

### Packaging checks

```bash
npm run build:win
```

Builds Windows package artifacts via `electron-builder`.

Optional smoke packaging path:

```bash
npm run package:smoke
npm run verify:packaged-artifacts
```

Use this when validating what gets included/excluded before producing installer-focused outputs.

---

## 7) package.json map (what matters most)

### Identity/runtime
- `name`, `version`: package identity and release metadata
- `main`: Electron main entry (`main.js`)

### Build/runtime scripts
- `start`: build preload then launch Electron
- `build:preload`: generate preload bundle output
- `build:win`: create Windows package/installer artifacts
- `package:smoke`: build unpacked smoke artifact
- `verify:packaged-artifacts`: validate smoke package contents

### Validation scripts
- `test`: Node test runner
- `lint`: repo lint checks
- `format:check`: formatting checks
- `check`: combined quality gate
- `rebuild-native`, `verify-native`, `check:native`: native compile/validation sequence
- `secure-memory:ops-check`: security/ops sanity checks for secure-memory flow

### Packaging config notes
- `files`: package include/exclude rules
- `beforePack`: verifies preload output exists/valid before packaging
- `asarUnpack`: keeps native `.node` binaries unpacked so runtime loading works inside Electron

---

## 8) End-to-end build mental model

Think in layers:

1. **Tooling layer**: `npm install`
2. **Native layer**: `npm run check:native`
3. **Bridge layer** (main ↔ renderer APIs): `npm run build:preload`
4. **App runtime**: `npm start`
5. **Quality gate**: `npm run check`
6. **Distribution**: `npm run build:win` (and/or smoke packaging checks)

If launch issues happen after successful install, likely causes are:
- stale/missing native binary,
- preload build output mismatch,
- environment drift (Node/toolchain differences).

---

## 9) Troubleshooting

### `npm run check:native` fails

Common causes:
- missing C++ toolchain,
- missing Windows SDK component,
- stale headers or version mismatch.

Try in order:

1. Confirm prerequisites are installed.
2. Delete `node_modules` and reinstall: `npm install`
3. Rebuild addon: `npm run rebuild-native`
4. Re-verify addon: `npm run verify-native`

### App starts but native addon errors appear

Check:
- `native/build/Release/addon.node` exists
- `npm run check:native` passes
- `NVIEW_SECURE_MEM_ADDON_PATH` is not pointing to an incorrect file

### Debug policy toggles (intentional testing only)

```bash
# Disable native lock path (fallback wipe path remains active)
NVIEW_SECURE_MEM_ENABLED=0 npm start

# Enforce strict lock/unlock guarantees (fail closed if unavailable)
NVIEW_SECURE_MEM_STRICT=1 npm start
```

Only use these for deliberate policy testing; do not rely on them as normal defaults.

---

## 10) Recommended local workflow for contributors

1. `npm install`
2. `npm run check:native`
3. `npm start`
4. Implement changes
5. `npm run check`
6. Re-run native/security checks if your change touched those paths
7. Validate packaging path when release-affecting (`npm run build:win` and optionally smoke checks)

---

## 11) Related docs for deeper context

- User-facing app overview: `README.md`
- Developer code map: `docs/developer-code-map.md`
- Feature inventory: `docs/major-functionality.md`

External references:
- Node.js docs: <https://nodejs.org/en/docs>
- npm docs: <https://docs.npmjs.com>
- Electron docs: <https://www.electronjs.org/docs/latest>
- Electron quick start: <https://www.electronjs.org/docs/latest/tutorial/quick-start>
- node-gyp: <https://github.com/nodejs/node-gyp>
- Microsoft C++ build tools: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
