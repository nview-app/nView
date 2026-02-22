const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "renderer", "reader", "reader_page_controller.js"),
  "utf8",
);

function loadModule(extraWindow = {}) {
  const windowObj = { ...extraWindow };
  const context = { window: windowObj, AbortController };
  vm.runInNewContext(controllerSource, context, { filename: "reader_page_controller.js" });
  return context.window.nviewReaderPageController;
}

test("computeZones handles start, middle and end anchors", () => {
  const mod = loadModule();
  const start = mod.computeZones(0, 10, 2, 4);
  assert.deepEqual([...start.hot], [0, 1, 2]);
  assert.deepEqual([...start.warm], [0, 1, 2, 3, 4]);

  const middle = mod.computeZones(5, 10, 1, 3);
  assert.deepEqual([...middle.hot], [4, 5, 6]);
  assert.deepEqual([...middle.warm], [2, 3, 4, 5, 6, 7, 8]);

  const end = mod.computeZones(9, 10, 2, 4);
  assert.deepEqual([...end.hot], [7, 8, 9]);
  assert.deepEqual([...end.warm], [5, 6, 7, 8, 9]);
});

test("priorityForIndex ranks by anchor distance", () => {
  const mod = loadModule();
  assert.equal(mod.priorityForIndex(10, 10), 0);
  assert.equal(mod.priorityForIndex(10, 8), 2);
  assert.equal(mod.priorityForIndex(10, 14), 4);
});

test("shouldEvict requires outside warm zone, over cap, and hysteresis elapsed", () => {
  const mod = loadModule();
  const zones = mod.computeZones(10, 40, 2, 8);
  const state = mod.createReaderPageState(0, 1_000);
  state.status = mod.READER_PAGE_STATUS.LOADED;
  state.lastVisibleAt = 10_000;

  assert.equal(mod.shouldEvict(state, zones, 5, { maxResidentPages: 16, evictHysteresisMs: 2000 }, 15_000), false);
  assert.equal(mod.shouldEvict(state, zones, 30, { maxResidentPages: 16, evictHysteresisMs: 6000 }, 15_000), false);
  assert.equal(mod.shouldEvict(state, zones, 30, { maxResidentPages: 16, evictHysteresisMs: 2000 }, 15_000), true);
  assert.equal(
    mod.shouldEvict(
      state,
      zones,
      5,
      { maxResidentPages: 16, evictHysteresisMs: 2000, allowOutsideWarmEviction: true },
      15_000,
    ),
    true,
  );
});

test("shouldAbortLoad aborts loading pages that leave warm zone", () => {
  const mod = loadModule();
  const state = mod.createReaderPageState(25, Date.now());
  state.status = mod.READER_PAGE_STATUS.LOADING;
  const zones = mod.computeZones(10, 40, 2, 8);
  assert.equal(mod.shouldAbortLoad(state, zones), true);
  const inZone = mod.createReaderPageState(12, Date.now());
  inZone.status = mod.READER_PAGE_STATUS.LOADING;
  assert.equal(mod.shouldAbortLoad(inZone, zones), false);
});

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
    this.isConnected = true;
    this.naturalWidth = 1200;
    this.naturalHeight = 1800;
    this._src = "";
  }
  get src() {
    return this._src;
  }
  set src(value) {
    this._src = String(value);
    if (this._src.startsWith("blob:")) this.dispatchEvent(new Event("load"));
  }
  getBoundingClientRect() {
    return { top: 0, bottom: 800 };
  }
  get offsetHeight() {
    return Number(this.style.minHeight?.replace("px", "") || 200);
  }
  get offsetTop() {
    return 0;
  }
}

test("session token drops stale async completion after rapid reopen", async () => {
  const revoked = [];
  const created = [];
  let fetchCallCount = 0;
  let firstResolve;

  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }

  const pages = [];
  const pagesEl = {
    clientWidth: 1000,
    clientHeight: 800,
    scrollTop: 0,
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
    scrollTo() {},
  };

  const readerEl = { style: { display: "block" }, classList: { toggle() {} } };
  const readerPageSelect = { innerHTML: "", disabled: true, value: "0", addEventListener() {}, appendChild() {} };

  const windowObj = {
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    cancelAnimationFrame: () => {},
    clearTimeout: () => {},
    setTimeout: (cb) => {
      cb();
      return 1;
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
        const next = `blob:${created.length + 1}`;
        created.push(next);
        return next;
      },
      revokeObjectURL: (value) => revoked.push(value),
    },
    fetch: async () => {
      fetchCallCount += 1;
      if (fetchCallCount === 1) {
        return new Promise((resolve) => {
          firstResolve = resolve;
        });
      }
      return { ok: true, blob: async () => ({}) };
    },
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
  });

  controller.open({ pages: [{ path: "old.jpg", name: "old" }] });
  controller.open({ pages: [{ path: "new.jpg", name: "new" }] });
  firstResolve({ ok: true, blob: async () => ({}) });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(created.length, 2);
  assert.deepEqual(revoked, ["blob:2"]);
  assert.equal(pages[pages.length - 1].src, "blob:1");
});


test("open seeds natural dimensions from encrypted index metadata when provided", () => {
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }
  const pages = [];
  const pagesEl = {
    clientWidth: 1000,
    clientHeight: 800,
    scrollTop: 0,
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
    scrollTo() {},
  };
  const windowObj = {
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    cancelAnimationFrame: () => {},
    clearTimeout: () => {},
    setTimeout: () => 1,
    getComputedStyle: () => ({
      paddingLeft: "0",
      paddingRight: "0",
      paddingTop: "0",
      paddingBottom: "0",
      marginBottom: "0",
    }),
    ResizeObserver: FakeResizeObserver,
    URL: { createObjectURL: () => "blob:1", revokeObjectURL: () => {} },
    fetch: async () => ({ ok: true, blob: async () => ({}) }),
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
    readerEl: { style: { display: "block" }, classList: { toggle() {} } },
    pagesEl,
    readerPageSelect: { innerHTML: "", disabled: true, value: "0", addEventListener() {}, appendChild() {} },
    toAppBlobUrl: (value) => `appblob:///${value}`,
    appBlobFetchOptions: () => ({}),
  });

  controller.open({ pages: [{ path: "001.jpg", name: "001.jpg", w: 1200, h: 1800 }] });
  assert.equal(pages[0].dataset.naturalWidth, "1200");
  assert.equal(pages[0].dataset.naturalHeight, "1800");
});
