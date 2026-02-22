const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "renderer", "reader", "reader_page_controller.js"),
  "utf8",
);

class FakeImage extends EventTarget {
  constructor() {
    super();
    this.className = "";
    this.loading = "";
    this.decoding = "";
    this.fetchPriority = "";
    this.draggable = false;
    this.dataset = {};
    this.alt = "";
    this.style = {};
    this.naturalWidth = 1200;
    this.naturalHeight = 1800;
    this.isConnected = true;
    this._src = "";
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = String(value);
    if (this._src.startsWith("blob:")) {
      this.dispatchEvent(new Event("load"));
    }
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 200 };
  }

  get offsetHeight() {
    return Number(this.style.minHeight?.replace("px", "") || 200);
  }

  get offsetTop() {
    return 0;
  }
}

function createHarness({
  clampInitialScrollCalls = 0,
  readerRuntimeConfig = null,
  fetchImpl = null,
  readerInstrumentation = null,
  frameQueueMode = false,
  readerDisplay = "block",
  visibilityState = "visible",
} = {}) {
  const revoked = [];
  const created = [];
  const intervalCalls = [];

  class FakeResizeObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  }

  const pages = [];

  let rafId = 0;
  const rafQueue = [];
  function flushAnimationFrames() {
    while (rafQueue.length) {
      const pending = rafQueue.splice(0);
      for (const entry of pending) {
        if (entry.canceled) continue;
        entry.cb();
      }
    }
  }

  const pagesEl = {
    clientWidth: 1000,
    clientHeight: 800,
    scrollTop: 0,
    style: {},
    innerHTML: "",
    appendChild(img) {
      pages.push(img);
    },
    querySelectorAll(selector) {
      return selector === ".page" ? pages.slice() : [];
    },
    addEventListener() {},
    getBoundingClientRect() {
      return { top: 0, bottom: 800 };
    },
    scrollTo({ top }) {
      if (clampInitialScrollCalls > 0) {
        clampInitialScrollCalls -= 1;
        this.scrollTop = 0;
        return;
      }
      this.scrollTop = top;
    },
  };

  const readerEl = { style: { display: readerDisplay }, classList: { toggle() {} } };
  const readerPageSelect = {
    innerHTML: "",
    disabled: true,
    value: "0",
    options: [],
    addEventListener() {},
    appendChild(node) {
      this.options.push(node);
    },
  };

  const windowObj = {
    requestAnimationFrame: (cb) => {
      rafId += 1;
      if (frameQueueMode) {
        rafQueue.push({ id: rafId, cb, canceled: false });
      } else {
        cb();
      }
      return rafId;
    },
    cancelAnimationFrame: (id) => {
      for (const entry of rafQueue) {
        if (entry.id === id) entry.canceled = true;
      }
    },
    clearTimeout: () => {},
    setTimeout: (cb) => {
      cb();
      return 1;
    },
    setInterval: (cb, intervalMs) => {
      intervalCalls.push({ cb, intervalMs });
      return intervalCalls.length;
    },
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    document: {
      visibilityState,
      addEventListener: () => {},
    },
    getComputedStyle: () => ({
      paddingLeft: "0",
      paddingRight: "0",
      paddingTop: "0",
      paddingBottom: "0",
      marginBottom: "0",
    }),
    ResizeObserver: FakeResizeObserver,
    URL: {
      createObjectURL: () => {
        const value = `blob:${created.length + 1}`;
        created.push(value);
        return value;
      },
      revokeObjectURL: (value) => {
        revoked.push(value);
      },
    },
    fetch: fetchImpl || (async () => ({ ok: true, blob: async () => ({}) })),
  };

  const context = {
    window: windowObj,
    document: {
      createElement: (tag) => {
        if (tag === "img") return new FakeImage();
        if (tag === "option") return { value: "", textContent: "" };
        return {};
      },
    },
    URL: windowObj.URL,
    fetch: windowObj.fetch,
    ResizeObserver: FakeResizeObserver,
    AbortController,
    Event,
  };

  vm.runInNewContext(controllerSource, context, { filename: "reader_page_controller.js" });
  const controller = context.window.nviewReaderPageController.createReaderPageController({
    win: windowObj,
    readerEl,
    pagesEl,
    readerPageSelect,
    toAppBlobUrl: (p) => `appblob:///${p}`,
    appBlobFetchOptions: () => ({}),
    readerRuntimeConfig: readerRuntimeConfig || undefined,
    readerInstrumentation: readerInstrumentation || undefined,
  });

  return { controller, pages, revoked, created, readerPageSelect, flushAnimationFrames, intervalCalls };
}

test("reader page controller eagerly loads all pages and does not evict on scroll", async () => {
  const { controller, pages, revoked, created } = createHarness({
    readerRuntimeConfig: { windowedResidency: { enabled: false } },
  });

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pages.length, 2);
  for (const [index, img] of pages.entries()) {
    assert.equal(img.dataset.blobLoaded, "1");
    assert.equal(img.src, created[index]);
  }

  controller.scrollToPageWithOffset(1, 40, "auto");
  assert.deepEqual(revoked, []);
});

test("reader windowed residency loads anchor zone with bounded concurrency", async () => {
  const pendingResolvers = [];
  let activeLoads = 0;
  let maxActiveLoads = 0;
  const fetchImpl = () => {
    activeLoads += 1;
    maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
    return new Promise((resolve) => {
      pendingResolvers.push(() => {
        activeLoads -= 1;
        resolve({ ok: true, blob: async () => ({}) });
      });
    });
  };
  const { controller, pages } = createHarness({
    fetchImpl,
    readerRuntimeConfig: {
      windowedResidency: {
        enabled: true,
        hotRadius: 0,
        warmRadius: 2,
        maxResidentPages: 6,
        maxInflightLoads: 2,
        scrollVelocityPrefetchCutoff: 100,
      },
    },
  });

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
      { path: "p4.jpg", name: "p4" },
      { path: "p5.jpg", name: "p5" },
    ],
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maxActiveLoads <= 2, true);
  assert.equal(pendingResolvers.length, 2);
  assert.equal(pages.filter((img) => img.dataset.blobLoaded === "1").length, 0);

  pendingResolvers.shift()();
  pendingResolvers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(maxActiveLoads <= 2, true);
  assert.equal(pages.filter((img) => img.dataset.blobLoaded === "1").length >= 2, true);
});


test("reader windowed residency aborts in-flight loads after anchor leaves warm zone", async () => {
  const pending = new Map();
  const fetchImpl = (url, options = {}) => {
    return new Promise((resolve, reject) => {
      const signal = options.signal;
      const onAbort = () => {
        pending.delete(url);
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      pending.set(url, () => {
        signal?.removeEventListener("abort", onAbort);
        pending.delete(url);
        resolve({ ok: true, blob: async () => ({}) });
      });
    });
  };
  const { controller, pages } = createHarness({
    fetchImpl,
    readerRuntimeConfig: {
      windowedResidency: {
        enabled: true,
        hotRadius: 0,
        warmRadius: 1,
        maxResidentPages: 4,
        maxInflightLoads: 2,
        scrollVelocityPrefetchCutoff: 100,
      },
    },
  });

  controller.open({
    pages: Array.from({ length: 12 }, (_, i) => ({ path: `p${i + 1}.jpg`, name: `p${i + 1}` })),
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.size, 2);

  controller.scrollToPage(10, "auto");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pages[0].dataset.blobLoaded, "0");
  assert.equal(pages[1].dataset.blobLoaded, "0");
  assert.equal(pending.size <= 2, true);
});
test("reader fit toggle clamps oversized in-page offset to avoid crossing into next page", async () => {
  const { controller } = createHarness();

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));

  controller.scrollToPageWithOffset(0, 1200, "auto");
  const beforeToggleIndex = controller.getCurrentPageIndex();
  assert.equal(beforeToggleIndex, 0);

  controller.toggleFitHeight();

  const afterToggleIndex = controller.getCurrentPageIndex();
  assert.equal(afterToggleIndex, 0);
});

test("reader fit toggle keeps current page and offset when jump select is stale", async () => {
  const { controller, readerPageSelect } = createHarness();

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));

  controller.scrollToPageWithOffset(1, 40, "auto");
  const beforeToggleIndex = controller.getCurrentPageIndex();
  assert.equal(beforeToggleIndex, 1);

  readerPageSelect.value = "0";

  controller.toggleFitHeight();
  const afterToggleIndex = controller.getCurrentPageIndex();
  assert.equal(afterToggleIndex, 1);
  assert.equal(controller.getCurrentPageOffsetPx(), 40);
});

test("reader open pre-allocates fallback min-heights before page blobs load", () => {
  const { controller, pages } = createHarness();

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
    ],
  });

  for (const page of pages) {
    const minHeightPx = Number(String(page.style.minHeight || "0").replace("px", ""));
    assert.equal(Number.isFinite(minHeightPx), true);
    assert.ok(minHeightPx >= 80);
  }
});

test("reader fit toggle applies fallback min-heights for unloaded pages", () => {
  const { controller, pages } = createHarness();

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
    ],
  });

  assert.equal(pages.length, 3);

  controller.toggleFitHeight();

  for (const page of pages) {
    const minHeightPx = Number(String(page.style.minHeight || "0").replace("px", ""));
    assert.equal(Number.isFinite(minHeightPx), true);
    assert.ok(minHeightPx >= 700);
  }
});

test("reader scroll restore uses estimated metrics when DOM offsetTop is stale", () => {
  const { controller } = createHarness();

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
      { path: "p4.jpg", name: "p4" },
    ],
  });

  controller.scrollToPage(3, "auto");

  assert.equal(controller.getCurrentPageIndex(), 3);
});


test("reader scroll restore retries alignment when initial auto scroll is clamped", () => {
  const { controller } = createHarness({ clampInitialScrollCalls: 1 });

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
      { path: "p4.jpg", name: "p4" },
    ],
  });

  controller.scrollToPage(3, "auto");

  assert.equal(controller.getCurrentPageIndex(), 3);
});


test("reader metrics rebuilds are RAF-batched under load burst", async () => {
  const metrics = { rebuilds: 0 };
  const { controller, flushAnimationFrames } = createHarness({
    frameQueueMode: true,
    readerInstrumentation: {
      count: (name, amount = 1) => {
        if (name === "reader.metrics.rebuild.count") metrics.rebuilds += amount;
      },
    },
  });

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
    ],
  });

  flushAnimationFrames();
  await new Promise((resolve) => setImmediate(resolve));
  flushAnimationFrames();

  assert.equal(metrics.rebuilds <= 4, true);
});


test("reader windowed residency defaults are exposed and enabled by default", () => {
  const context = {
    window: {},
    AbortController,
  };
  vm.runInNewContext(controllerSource, context, { filename: "reader_page_controller.js" });
  const config = context.window.nviewReaderPageController.DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG;
  assert.equal(config.enabled, true);
  assert.equal(config.maxResidentPages, 16);
});

test("reader controller runtime config normalizes invalid windowed residency values", () => {
  const { controller } = createHarness();
  controller.setRuntimeConfig({
    windowedResidency: {
      enabled: true,
      hotRadius: -5,
      warmRadius: "bogus",
      maxResidentPages: 0,
      maxInflightLoads: 500,
      evictHysteresisMs: -100,
      sweepIntervalMs: 5,
      scrollVelocityPrefetchCutoff: "nope",
    },
  });
  const runtimeConfig = controller.getRuntimeConfig();
  assert.equal(runtimeConfig.windowedResidency.enabled, true);
  assert.equal(runtimeConfig.windowedResidency.hotRadius, 0);
  assert.equal(runtimeConfig.windowedResidency.warmRadius, 8);
  assert.equal(runtimeConfig.windowedResidency.maxResidentPages, 1);
  assert.equal(runtimeConfig.windowedResidency.maxInflightLoads, 20);
  assert.equal(runtimeConfig.windowedResidency.evictHysteresisMs, 0);
  assert.equal(runtimeConfig.windowedResidency.sweepIntervalMs, 250);
  assert.equal(runtimeConfig.windowedResidency.scrollVelocityPrefetchCutoff, 1.6);
});


test("reader sweeper starts only while reader is visible", () => {
  const hiddenHarness = createHarness({
    readerRuntimeConfig: { windowedResidency: { enabled: true } },
    readerDisplay: "none",
  });
  hiddenHarness.controller.open({ pages: [{ path: "p1.jpg", name: "p1" }] });
  assert.equal(hiddenHarness.intervalCalls.length, 0);

  const visibleHarness = createHarness({
    readerRuntimeConfig: { windowedResidency: { enabled: true } },
  });
  visibleHarness.controller.open({ pages: [{ path: "p1.jpg", name: "p1" }] });
  assert.equal(visibleHarness.intervalCalls.length >= 1, true);
});

test("reader aggressive mode evicts quickly when resident pages exceed cap", async () => {
  const metrics = { aggressiveEntries: 0 };
  const { controller, pages } = createHarness({
    readerInstrumentation: {
      count: (name, amount = 1) => {
        if (name === "reader.residency.aggressive.entries") metrics.aggressiveEntries += amount;
      },
    },
  });

  controller.open({
    pages: [
      { path: "p1.jpg", name: "p1" },
      { path: "p2.jpg", name: "p2" },
      { path: "p3.jpg", name: "p3" },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 350));

  controller.setRuntimeConfig({
    windowedResidency: {
      enabled: true,
      hotRadius: 0,
      warmRadius: 0,
      maxResidentPages: 1,
      evictHysteresisMs: 20_000,
      maxInflightLoads: 3,
      scrollVelocityPrefetchCutoff: 10,
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const loadedCount = pages.filter((img) => img.dataset.blobLoaded === "1").length;
  assert.equal(loadedCount <= 2, true);
  assert.equal(loadedCount < 3, true);
  assert.equal(metrics.aggressiveEntries >= 1, true);
});

test("reader accepts memory pressure hints and records telemetry", () => {
  const metrics = { hints: 0 };
  const { controller } = createHarness({
    readerRuntimeConfig: { windowedResidency: { enabled: true } },
    readerInstrumentation: {
      count: (name, amount = 1) => {
        if (name === "reader.residency.memoryPressureHint") metrics.hints += amount;
      },
    },
  });

  controller.open({ pages: [{ path: "p1.jpg", name: "p1" }] });
  controller.handleMemoryPressureHint({ level: "critical" });
  assert.equal(metrics.hints, 1);
});
