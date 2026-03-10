const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tooltipSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'shared', 'tooltip.js'), 'utf8');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.attrs = new Map();
    this.rect = { left: 100, top: 100, right: 140, bottom: 120, width: 40, height: 20 };
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  contains(node) { if (node === this) return true; return this.children.some((child) => child.contains(node)); }
  remove() {}
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  getBoundingClientRect() { return this.rect; }
  closest(selector) {
    if (selector !== '[data-tooltip]') return null;
    let node = this;
    while (node) {
      if (Object.prototype.hasOwnProperty.call(node.dataset || {}, 'tooltip')) return node;
      node = node.parentElement;
    }
    return null;
  }
}

class FakeEventHub {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, handler) {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
  }
  removeEventListener(type, handler) {
    const list = this.handlers.get(type) || [];
    this.handlers.set(type, list.filter((item) => item !== handler));
  }
}

function buildContext() {
  const root = new FakeEventHub();
  const win = new FakeEventHub();
  win.innerWidth = 1280;
  win.innerHeight = 720;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;

  const body = new FakeElement('body');
  const doc = {
    body,
    documentElement: new FakeElement('html'),
    createElement: (tagName) => new FakeElement(tagName),
    contains: (node) => body.contains(node),
  };

  const context = {
    window: win,
    document: doc,
    Element: FakeElement,
    getComputedStyle: () => ({ getPropertyValue: () => '8' }),
    console: { warn() {} },
  };

  vm.runInNewContext(tooltipSource, context, { filename: 'tooltip.js' });
  return { context, root };
}

test('rollout stage gating enables only configured windows', () => {
  const { context, root } = buildContext();
  const api = context.window.nviewTooltip.initTooltips({
    root,
    windowName: 'reader',
    rolloutStage: 'index',
  });

  assert.equal(api.enabled, false);
  assert.equal(api.reason, 'rollout-disabled');
});

test('invalid rollout values normalize safely to all', () => {
  const { context } = buildContext();
  assert.equal(context.window.nviewTooltip.normalizeRolloutStage('bad-stage'), 'all');
  assert.equal(context.window.nviewTooltip.normalizeRolloutStage(' index-reader '), 'index-reader');
});

test('safe initialization catches unexpected initialization errors', () => {
  const { context, root } = buildContext();
  context.document.body.appendChild = () => { throw new Error('append-failed'); };
  const api = context.window.nviewTooltip.safeInitTooltips({ root });
  assert.equal(api.enabled, false);
  assert.equal(api.reason, 'init-error');
});

test('all renderers bootstrap tooltip controller through safe initializer', () => {
  const rendererFiles = [
    'renderer/renderer.js',
    'renderer/browser_renderer.js',
    'renderer/downloader_renderer.js',
    'renderer/exporter_renderer.js',
    'renderer/group_manager_renderer.js',
    'renderer/importer_renderer.js',
    'renderer/reader_renderer.js',
    'renderer/tag_manager_renderer.js',
  ];

  for (const filePath of rendererFiles) {
    const source = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    assert.match(source, /safeInitTooltips/);
    assert.match(source, /windowName:\s*"[a-z_]+"/);
  }
});
