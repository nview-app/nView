const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "shared", "dropdown.js"), "utf8");

class FakeClassList {
  constructor(host) {
    this.host = host;
    this.values = new Set();
  }

  sync() {
    this.host.className = Array.from(this.values).join(" ");
  }

  add(...tokens) {
    for (const token of tokens) {
      if (token) this.values.add(token);
    }
    this.sync();
  }

  remove(...tokens) {
    for (const token of tokens) {
      this.values.delete(token);
    }
    this.sync();
  }

  contains(token) {
    return this.values.has(token);
  }

  toggle(token, force) {
    const shouldAdd = force === undefined ? !this.values.has(token) : !!force;
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    this.sync();
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.id = "";
    this.tabIndex = 0;
    this.textContent = "";
    this.className = "";
    this.style = {};
    this.classList = new FakeClassList(this);
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...nodes) {
    this.children = [];
    for (const node of nodes) this.appendChild(node);
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((entry) => entry !== handler));
  }

  dispatch(type, event = {}) {
    const list = this.listeners.get(type) || [];
    const payload = {
      type,
      target: this,
      currentTarget: this,
      key: event.key,
      ctrlKey: !!event.ctrlKey,
      metaKey: !!event.metaKey,
      altKey: !!event.altKey,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };
    for (const handler of list.slice()) {
      handler(payload);
    }
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  click() {
    this.dispatch("click");
  }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
    this.body = new FakeElement("body", this);
    this.documentElement = { clientWidth: 1280, clientHeight: 720 };
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((entry) => entry !== handler));
  }

  dispatch(type, event = {}) {
    const list = this.listeners.get(type) || [];
    const payload = {
      type,
      target: event.target || this.body,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };
    for (const handler of list.slice()) {
      handler(payload);
    }
  }
}

function setupDropdown({ options, value, onChange } = {}) {
  const document = new FakeDocument();
  const window = {
    document,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, { window, document }, { filename: "dropdown.js" });

  const triggerEl = document.createElement("button");
  const listEl = document.createElement("div");
  document.body.appendChild(triggerEl);
  document.body.appendChild(listEl);

  const dropdown = window.nviewDropdown.createDropdown({
    triggerEl,
    listEl,
    options: options || [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
      { value: "c", label: "Gamma" },
    ],
    value,
    onChange,
    documentRef: document,
  });

  return { dropdown, triggerEl, listEl, document };
}

test("keyboard navigation skips disabled options and commits selected value", () => {
  const changes = [];
  const { triggerEl, listEl, dropdown } = setupDropdown({
    options: [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: true },
      { value: "c", label: "Gamma" },
    ],
    onChange: (value) => changes.push(value),
  });

  triggerEl.dispatch("keydown", { key: "ArrowDown" });
  listEl.dispatch("keydown", { key: "Enter" });

  assert.equal(dropdown.getValue(), "c");
  assert.deepEqual(changes, ["c"]);
});

test("typeahead focuses matching option and enter commits", async () => {
  const changes = [];
  const { triggerEl, listEl, dropdown } = setupDropdown({
    options: [
      { value: "aa", label: "Alpha" },
      { value: "bb", label: "Beta" },
      { value: "cc", label: "Gamma" },
    ],
    onChange: (value) => changes.push(value),
  });

  triggerEl.dispatch("keydown", { key: "Enter" });
  listEl.dispatch("keydown", { key: "g" });
  listEl.dispatch("keydown", { key: "Enter" });

  assert.equal(dropdown.getValue(), "cc");
  assert.deepEqual(changes, ["cc"]);

  await new Promise((resolve) => setTimeout(resolve, 620));
});

test("setDisabled prevents opening and keeps value unchanged", () => {
  const { triggerEl, listEl, dropdown } = setupDropdown({ value: "a" });
  dropdown.setDisabled(true);

  triggerEl.dispatch("click");

  assert.equal(listEl.hidden, true);
  assert.equal(dropdown.getValue(), "a");
});


test("applies shared class contract and state data attributes", () => {
  const { triggerEl, listEl, dropdown } = setupDropdown({
    value: "a",
  });

  assert.equal(triggerEl.classList.contains("ui-dropdown-trigger"), true);
  assert.equal(listEl.classList.contains("ui-dropdown-popover"), true);
  assert.equal(triggerEl.dataset.open, "false");
  assert.equal(triggerEl.dataset.disabled, "false");

  triggerEl.dispatch("keydown", { key: "Enter" });
  assert.equal(triggerEl.dataset.open, "true");
  assert.equal(listEl.children[0].classList.contains("is-selected"), true);

  dropdown.setDisabled(true);
  assert.equal(triggerEl.getAttribute("aria-disabled"), "true");
  assert.equal(triggerEl.dataset.disabled, "true");
});

test("option labels are rendered as text only", () => {
  const { listEl } = setupDropdown({
    options: [{ value: "x", label: '<img src=x onerror=alert(1)>' }],
    value: "x",
  });

  assert.equal(listEl.children[0].textContent, '<img src=x onerror=alert(1)>');
});

test("destroy detaches listeners so events no longer mutate state", () => {
  const changes = [];
  const { triggerEl, listEl, dropdown } = setupDropdown({
    onChange: (value) => changes.push(value),
  });

  dropdown.destroy();
  triggerEl.dispatch("keydown", { key: "Enter" });
  listEl.dispatch("keydown", { key: "ArrowDown" });
  listEl.dispatch("keydown", { key: "Enter" });

  assert.deepEqual(changes, []);
  assert.equal(dropdown.getValue(), "");
});


test("menu mode preserves menu semantics and activates items via keyboard", () => {
  const document = new FakeDocument();
  const window = { document, setTimeout, clearTimeout };
  vm.runInNewContext(source, { window, document }, { filename: "dropdown.js" });

  const triggerEl = document.createElement("button");
  const listEl = document.createElement("div");
  const first = document.createElement("button");
  first.setAttribute("role", "menuitem");
  first.textContent = "Open";
  const second = document.createElement("button");
  second.setAttribute("role", "menuitem");
  second.textContent = "Settings";
  listEl.appendChild(first);
  listEl.appendChild(second);
  document.body.appendChild(triggerEl);
  document.body.appendChild(listEl);

  let activated = "";
  window.nviewDropdown.createDropdown({
    type: "menu",
    triggerEl,
    listEl,
    documentRef: document,
    onAction(item) {
      activated = item.textContent;
    },
  });

  assert.equal(triggerEl.getAttribute("aria-haspopup"), "menu");
  triggerEl.dispatch("keydown", { key: "Enter" });
  listEl.dispatch("keydown", { key: "ArrowDown" });
  listEl.dispatch("keydown", { key: "Enter" });

  assert.equal(activated, "Settings");
  assert.equal(triggerEl.getAttribute("aria-expanded"), "false");
});

test("popover min width uses trigger content box width", () => {
  const document = new FakeDocument();
  const window = {
    document,
    setTimeout,
    clearTimeout,
    innerWidth: 1280,
    innerHeight: 720,
    getComputedStyle() {
      return {
        paddingLeft: "12px",
        paddingRight: "12px",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
      };
    },
  };
  vm.runInNewContext(source, { window, document }, { filename: "dropdown.js" });

  const triggerEl = document.createElement("button");
  const listEl = document.createElement("div");
  triggerEl.getBoundingClientRect = () => ({ left: 16, top: 24, bottom: 56, width: 300 });
  listEl.getBoundingClientRect = () => ({ width: 180, height: 160 });
  document.body.appendChild(triggerEl);
  document.body.appendChild(listEl);

  window.nviewDropdown.createDropdown({
    triggerEl,
    listEl,
    options: [{ value: "a", label: "Alpha" }],
    documentRef: document,
  });

  triggerEl.dispatch("click");

  assert.equal(listEl.style.minWidth, "274px");
});
