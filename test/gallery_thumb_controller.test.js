const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "renderer", "gallery", "gallery_thumb_controller.js"),
  "utf8",
);

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createHarness({ thumbPipeline, fetchImpl } = {}) {
  const timeouts = [];
  const errors = [];
  let timeoutId = 0;
  const win = {
    nviewThumbPipeline: thumbPipeline,
    localStorage: { getItem: () => null },
    innerWidth: 1200,
    innerHeight: 900,
    document: { documentElement: { clientWidth: 1200, clientHeight: 900 } },
    performance: { now: () => 10 },
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    setTimeout: (fn, delay) => {
      const id = ++timeoutId;
      timeouts.push({ id, fn, delay });
      return id;
    },
    clearTimeout: () => {},
    URL: {
      createObjectURL: () => "blob:generated",
      revokeObjectURL: () => {},
    },
    fetch: fetchImpl || (async () => ({ ok: false, status: 500 })),
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    console: {
      error: (...args) => errors.push(args.join(" ")),
      warn: () => {},
      log: () => {},
    },
  };

  const context = {
    window: win,
    URL: win.URL,
    fetch: (...args) => win.fetch(...args),
    IntersectionObserver: win.IntersectionObserver,
    console: win.console,
    performance: win.performance,
  };

  vm.runInNewContext(controllerSource, context, {
    filename: "gallery_thumb_controller.js",
  });

  const controller = win.nviewGalleryThumbController.createGalleryThumbController({
    win,
    toAppBlobUrl: (p) => `appblob:///${p}`,
    appBlobFetchOptions: () => ({ cache: "no-store", credentials: "omit" }),
    thumbPipeline,
    fallbackCoverSrc: "data:image/gif;base64,placeholder",
    fallbackNoCoverSrc: "data:image/svg+xml,empty",
  });

  return { controller, timeouts, errors };
}

function createImage(coverPath = "covers/one.jpg") {
  return {
    dataset: { coverPath },
    isConnected: true,
    src: "",
    getBoundingClientRect() {
      return { top: 10, bottom: 200, left: 10, right: 200, width: 190, height: 190 };
    },
  };
}

test("gallery controller does not raw-fetch or retry for not-found pipeline response", async () => {
  let fetchCalls = 0;
  const thumbPipeline = {
    fetchAndCreateThumbnailUrl: async () => ({ ok: false, type: "http_error", status: 404 }),
    classifyThumbnailFailure: (result) => ({
      status: result.status,
      code: "not_found",
      shouldRetry: false,
      retryDelayMs: 0,
    }),
  };

  const { controller, timeouts } = createHarness({
    thumbPipeline,
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, blob: async () => new Blob(["x"], { type: "image/jpeg" }) };
    },
  });

  const img = createImage();
  controller.init([img]);
  await flushMicrotasks();

  assert.equal(fetchCalls, 0);
  assert.equal(timeouts.length, 0);
  assert.equal(img.dataset.thumbLoaded, "0");
  assert.equal(img.dataset.thumbErrorStatus, "404");
});

test("gallery controller uses slower retry delay for vault locked responses", async () => {
  const thumbPipeline = {
    fetchAndCreateThumbnailUrl: async () => ({ ok: false, type: "http_error", status: 401 }),
    classifyThumbnailFailure: () => ({
      status: 401,
      code: "vault_locked",
      shouldRetry: true,
      retryDelayMs: 15000,
    }),
  };

  const { controller, timeouts } = createHarness({ thumbPipeline });

  const img = createImage();
  controller.init([img]);
  await flushMicrotasks();

  assert.equal(timeouts.length, 1);
  assert.equal(timeouts[0].delay, 15000);
  assert.equal(img.dataset.thumbErrorStatus, "401");
});

test("gallery controller logs loud contract error when pipeline API is missing", async () => {
  let fetchCalls = 0;
  const { controller, errors } = createHarness({
    thumbPipeline: {},
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        blob: async () => new Blob(["x"], { type: "image/jpeg" }),
      };
    },
  });

  const img = createImage();
  controller.init([img]);
  await flushMicrotasks();

  assert.equal(fetchCalls, 1);
  assert.equal(img.dataset.thumbLoaded, "1");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /thumbnail pipeline contract missing/);
});
