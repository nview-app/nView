const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "shared", "tag_input.js"), "utf8");

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.className = "";
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute() {}

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatch(type, event = {}) {
    const list = this.listeners.get(type) || [];
    for (const handler of list) {
      handler({
        type,
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {},
        ...event,
      });
    }
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains && child.contains(node));
  }
}

function setup() {
  const document = {
    activeElement: null,
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
  };
  const window = { document };
  vm.runInNewContext(source, { window, document }, { filename: "tag_input.js" });
  return { tagInput: window.nviewTagInput, document };
}

test("createTagInput shows suggestions on focus without typing", () => {
  const { tagInput, document } = setup();
  const inputEl = new FakeElement("input", document);
  const chipsEl = new FakeElement("div", document);
  const suggestionsEl = new FakeElement("div", document);

  tagInput.createTagInput({
    inputEl,
    chipsEl,
    suggestionsEl,
    getSuggestions: () => ["alpha", "beta"],
    showSuggestionsOn: "focus",
  });

  inputEl.focus();
  inputEl.dispatch("focus");

  assert.equal(suggestionsEl.hidden, false);
  assert.equal(suggestionsEl.children.length, 1);
});

test("createTagInput does not remove latest tag on empty backspace by default", () => {
  const { tagInput, document } = setup();
  const inputEl = new FakeElement("input", document);
  const chipsEl = new FakeElement("div", document);
  const suggestionsEl = new FakeElement("div", document);

  const field = tagInput.createTagInput({
    inputEl,
    chipsEl,
    suggestionsEl,
    getSuggestions: () => [],
    showSuggestionsOn: "focus",
  });
  field.setTags(["one", "two"]);

  inputEl.dispatch("keydown", { key: "Backspace" });

  assert.deepEqual(Array.from(field.getTags({ includeDraft: false })), ["one", "two"]);
});
