const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtimeSource = fs.readFileSync(
  path.join(__dirname, "..", "renderer", "reader", "reader_runtime.js"),
  "utf8",
);

class ClassList {
  constructor() {
    this.classes = new Set();
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.classes.has(name)) this.classes.delete(name);
      else this.classes.add(name);
      return this.classes.has(name);
    }
    if (force) this.classes.add(name);
    else this.classes.delete(name);
    return force;
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.style = { display: "none" };
    this.dataset = {};
    this.classList = new ClassList();
    this.attrs = new Map();
    this.icon = null;
  }

  contains(target) {
    return target === this;
  }

  querySelector(selector) {
    if (selector === ".icon") return this.icon;
    return null;
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
}

function createHarness() {
  const win = new EventTarget();
  win.requestAnimationFrame = (cb) => {
    cb();
    return 1;
  };
  const doc = new EventTarget();
  const readerEl = new FakeElement();
  const pagesEl = new FakeElement();
  const readerTitleEl = { textContent: "" };
  const closeReaderBtn = new FakeElement();
  const favoriteToggleBtn = new FakeElement();
  favoriteToggleBtn.icon = { classList: new ClassList() };

  const calls = {
    scrollToPage: [],
    closeReaderContextMenu: 0,
    stopReaderAutoScroll: 0,
    showReaderContextMenu: 0,
    toggleFitHeight: 0,
    onReaderOpen: 0,
    onReaderClose: 0,
  };

  const readerPageController = {
    close: () => {},
    open: () => {},
    hasPages: () => true,
    getCurrentPageIndex: () => 0,
    getPageCount: () => 3,
    scrollToPage: (...args) => calls.scrollToPage.push(args),
    toggleFitHeight: () => {
      calls.toggleFitHeight += 1;
    },
  };

  const contextMenuController = {
    closeReaderContextMenu: () => {
      calls.closeReaderContextMenu += 1;
    },
    isReaderAutoScrollEnabled: () => false,
    showReaderContextMenu: () => {
      calls.showReaderContextMenu += 1;
    },
    stopReaderAutoScroll: () => {
      calls.stopReaderAutoScroll += 1;
    },
  };

  const context = { window: { ...win }, EventTarget };
  vm.runInNewContext(runtimeSource, context, { filename: "reader_runtime.js" });

  const runtime = context.window.nviewReaderRuntime.createReaderRuntime({
    doc,
    win,
    readerEl,
    readerTitleEl,
    pagesEl,
    closeReaderBtn,
    favoriteToggleBtn,
    readerPageController,
    contextMenuController,
    onFavoriteToggle: async ({ comicMeta, nextFavorite }) => ({
      ...comicMeta,
      favorite: nextFavorite,
    }),
    onReaderOpen: () => {
      calls.onReaderOpen += 1;
    },
    onReaderClose: () => {
      calls.onReaderClose += 1;
    },
  });

  return { runtime, doc, win, readerEl, readerTitleEl, favoriteToggleBtn, calls };
}

test("reader runtime opens, handles space/f keys, and closes", async () => {
  const { runtime, doc, win, readerEl, readerTitleEl, calls } = createHarness();

  runtime.open({
    title: "Test Reader",
    comicDir: "/library/test",
    comicMeta: { favorite: false },
    pages: [{ path: "1.jpg" }],
  });

  assert.equal(readerEl.style.display, "block");
  assert.equal(readerTitleEl.textContent, "Test Reader");
  assert.equal(calls.onReaderOpen, 1);

  let prevented = false;
  const spaceEvent = new Event("keydown");
  spaceEvent.code = "Space";
  spaceEvent.key = " ";
  spaceEvent.preventDefault = () => {
    prevented = true;
  };
  win.dispatchEvent(spaceEvent);

  assert.equal(prevented, true);
  assert.equal(calls.scrollToPage.length, 1);
  assert.deepEqual(calls.scrollToPage[0], [1, "smooth"]);

  const fitEvent = new Event("keydown");
  fitEvent.key = "f";
  fitEvent.preventDefault = () => {};
  win.dispatchEvent(fitEvent);

  assert.equal(calls.toggleFitHeight, 1);

  runtime.close();
  assert.equal(readerEl.style.display, "none");
  assert.equal(calls.stopReaderAutoScroll, 1);
  assert.equal(calls.closeReaderContextMenu, 1);
  assert.equal(calls.onReaderClose, 1);
});

test("reader runtime updates favorite toggle state via callback", async () => {
  const { runtime, favoriteToggleBtn } = createHarness();

  runtime.open({
    title: "Reader",
    comicDir: "/library/test",
    comicMeta: { favorite: false },
    pages: [],
  });

  favoriteToggleBtn.dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(favoriteToggleBtn.classList.contains("is-favorite"), true);
  assert.equal(favoriteToggleBtn.attrs.get("aria-label"), "Remove from favorites");
});
