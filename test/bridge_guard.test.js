const test = require("node:test");
const assert = require("node:assert/strict");

const { guardRenderer } = require("../renderer/bridge_guard.js");

function createFakeDom() {
  const bodyChildren = [];
  const body = {
    firstChild: null,
    appendChild(node) {
      bodyChildren.push(node);
      this.firstChild = bodyChildren[0] || null;
      return node;
    },
    insertBefore(node) {
      bodyChildren.unshift(node);
      this.firstChild = bodyChildren[0] || null;
      return node;
    },
  };

  const document = {
    body,
    createElement(tagName) {
      return {
        tagName,
        attributes: {},
        style: { cssText: "" },
        innerHTML: "",
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
  };

  return { document, bodyChildren };
}

test("guardRenderer displays error panel and does not throw when window.api is missing", () => {
  const { document, bodyChildren } = createFakeDom();
  const previousDocument = global.document;
  const previousApi = global.api;
  const previousConsoleError = console.error;
  const errors = [];

  global.document = document;
  delete global.api;
  console.error = (...args) => errors.push(args.map(String).join(" "));

  try {
    assert.doesNotThrow(() => {
      const result = guardRenderer({ required: ["api"] });
      assert.equal(result, false);
    });

    assert.equal(bodyChildren.length, 1);
    const panelHtml = bodyChildren[0].innerHTML;
    assert.match(panelHtml, /Preload bridge API missing/);
    assert.match(panelHtml, /window\.api/);
    assert.match(panelHtml, /npm run build:preload/);
    assert.equal(errors.length >= 1, true);
    assert.match(errors[0], /Renderer boot halted: preload bridge API missing/);
    assert.match(errors[0], /api/);
  } finally {
    global.document = previousDocument;
    global.api = previousApi;
    console.error = previousConsoleError;
  }
});
