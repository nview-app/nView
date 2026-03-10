const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const tooltipSource = fs.readFileSync(path.join(__dirname, "..", "renderer", "shared", "tooltip.js"), "utf8");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.attrs = new Map();
    this.rect = { left: 100, top: 100, right: 140, bottom: 120, width: 40, height: 20 };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }


  matches(selector) {
    if (selector === ":focus-visible") return this.focusVisible !== false;
    return false;
  }

  closest(selector) {
    if (selector !== "[data-tooltip]") return null;
    let node = this;
    while (node) {
      if (Object.prototype.hasOwnProperty.call(node.dataset || {}, "tooltip")) return node;
      node = node.parentElement;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  hasAttribute(name) {
    return this.attrs.has(name);
  }

  removeAttribute(name) {
    this.attrs.delete(name);
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeEventHub {
  constructor() {
    this.handlers = new Map();
  }

  addEventListener(type, handler) {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.handlers.get(type) || [];
    this.handlers.set(type, list.filter((item) => item !== handler));
  }

  emit(type, event = {}) {
    const list = this.handlers.get(type) || [];
    for (const handler of list) handler(event);
  }
}

function createHarness() {
  const root = new FakeEventHub();
  const win = new FakeEventHub();
  win.innerWidth = 1280;
  win.innerHeight = 720;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;

  const body = new FakeElement("body");
  const doc = {
    body,
    documentElement: new FakeElement("html"),
    createElement: (tagName) => new FakeElement(tagName),
    contains: (node) => body.contains(node),
  };

  const context = {
    window: win,
    document: doc,
    Element: FakeElement,
    getComputedStyle: () => ({ getPropertyValue: () => "8" }),
  };

  vm.runInNewContext(tooltipSource, context, { filename: "tooltip.js" });
  const api = context.window.nviewTooltip.initTooltips({ root, defaultDelayMs: 0 });
  const tooltipEl = body.children[0];

  return { root, win, doc, api, tooltipEl };
}

test("tooltip shows on focus and restores aria-describedby on escape", async () => {
  const { root, api, tooltipEl } = createHarness();
  const trigger = new FakeElement("button");
  trigger.dataset.tooltip = "  Refresh   current   library  ";
  trigger.setAttribute("aria-describedby", "existing-id");

  root.emit("focusin", { target: trigger });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(tooltipEl.dataset.state, "visible");
  assert.equal(tooltipEl.textContent, "Refresh current library");
  assert.equal(tooltipEl.getAttribute("role"), "tooltip");
  assert.match(trigger.getAttribute("aria-describedby"), /^ui-tooltip-/);

  root.emit("keydown", { key: "Escape" });
  assert.equal(tooltipEl.dataset.state, "hidden");
  assert.equal(trigger.getAttribute("aria-describedby"), "existing-id");

  api.destroy();
});

test("disabled controls do not show tooltip", async () => {
  const { root, api, tooltipEl } = createHarness();
  const trigger = new FakeElement("button");
  trigger.dataset.tooltip = "Should never show";
  trigger.setAttribute("disabled", "");

  root.emit("focusin", { target: trigger });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(tooltipEl.dataset.state, "hidden");
  assert.equal(trigger.getAttribute("aria-describedby"), null);

  api.destroy();
});



test("focus-driven tooltip requires focus-visible state", async () => {
  const { root, api, tooltipEl } = createHarness();
  const trigger = new FakeElement("button");
  trigger.dataset.tooltip = "Open Downloader";
  trigger.focusVisible = false;

  root.emit("focusin", { target: trigger });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tooltipEl.dataset.state, "hidden");

  trigger.focusVisible = true;
  root.emit("focusin", { target: trigger });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tooltipEl.dataset.state, "visible");

  api.destroy();
});

test("pointer and click interactions dismiss active tooltips", async () => {
  const { root, api, tooltipEl } = createHarness();
  const trigger = new FakeElement("button");
  trigger.dataset.tooltip = "Open settings menu";

  root.emit("mouseover", { target: trigger });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tooltipEl.dataset.state, "visible");

  root.emit("click", { target: trigger });
  assert.equal(tooltipEl.dataset.state, "hidden");

  root.emit("mouseover", { target: trigger });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tooltipEl.dataset.state, "visible");

  root.emit("pointerdown", { target: trigger });
  assert.equal(tooltipEl.dataset.state, "hidden");

  api.destroy();
});

test("scoped windows avoid native title tooltips and load shared tooltip module", () => {
  const windowsDir = path.join(__dirname, "..", "windows");
  const scopedWindows = [
    "browser.html",
    "downloader.html",
    "exporter.html",
    "group_manager.html",
    "importer.html",
    "index.html",
    "reader.html",
    "tag_manager.html",
  ];

  for (const name of scopedWindows) {
    const html = fs.readFileSync(path.join(windowsDir, name), "utf8");
    assert.doesNotMatch(html, /\stitle\s*=/i, `${name} should not rely on native title tooltips`);
    assert.match(html, /renderer\/shared\/tooltip\.js/, `${name} should load shared tooltip framework`);
    assert.match(html, /data-tooltip=/, `${name} should contain tooltip API usage`);
  }
});

test("tooltip module keeps safe text rendering primitives", () => {
  assert.match(tooltipSource, /tooltipEl\.textContent\s*=/);
  assert.doesNotMatch(tooltipSource, /tooltipEl\.innerHTML\s*=/);
});
