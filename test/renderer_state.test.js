const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('renderer state exposes state factory but no hash allowlist', () => {
  const filePath = path.join(__dirname, '..', 'renderer', 'state', 'renderer_state.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);

  const stateApi = context.window.nviewRendererState;
  assert.equal(typeof stateApi.createInitialRendererState, 'function');
  assert.equal('VALID_START_PAGE_HASHES' in stateApi, false);
});
