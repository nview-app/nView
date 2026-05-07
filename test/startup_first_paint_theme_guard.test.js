const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WINDOW_HTML_FILES = [
  'index.html',
  'browser.html',
  'downloader.html',
  'importer.html',
  'exporter.html',
  'group_manager.html',
  'tag_manager.html',
  'reader.html',
];

test('window HTML bootstraps theme class from trusted bootstrapTheme query before renderer hydration', () => {
  for (const fileName of WINDOW_HTML_FILES) {
    const filePath = path.join(process.cwd(), 'windows', fileName);
    const source = fs.readFileSync(filePath, 'utf8');

    assert.match(source, /new URLSearchParams\(window\.location\.search\)/, `${fileName}: reads search params`);
    assert.match(source, /params\.get\("bootstrapTheme"\) === "dark"/, `${fileName}: only dark token enables dark bootstrap`);
    assert.match(source, /document\.documentElement\.classList\.add\("bootstrap-dark"\)/, `${fileName}: sets bootstrap class on html element`);
  }
});

test('shared stylesheet honors bootstrap-dark class before renderer applies body.dark', () => {
  const filePath = path.join(process.cwd(), 'windows', 'shared.css');
  const source = fs.readFileSync(filePath, 'utf8');

  assert.match(source, /body\.dark,\s*\nhtml\.bootstrap-dark body\s*\{/, 'dark theme tokens include bootstrap-dark fallback selector');
  assert.match(source, /html:has\(body\.dark\),\s*\nhtml\.bootstrap-dark\s*\{/, 'root color-scheme selector includes bootstrap-dark');
});
