const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldUseDarkBootstrapTheme,
  applyBootstrapThemeClass,
} = require('../preload/theme_bootstrap');

test('shouldUseDarkBootstrapTheme returns true only for explicit dark bootstrap query', () => {
  assert.equal(shouldUseDarkBootstrapTheme('?bootstrapTheme=dark'), true);
  assert.equal(shouldUseDarkBootstrapTheme('?bootstrapTheme=light'), false);
  assert.equal(shouldUseDarkBootstrapTheme('?foo=bar'), false);
  assert.equal(shouldUseDarkBootstrapTheme(''), false);
});

test('applyBootstrapThemeClass adds bootstrap-dark class for dark bootstrap query', () => {
  const classSet = new Set();
  const fakeWindow = {
    location: { search: '?bootstrapTheme=dark' },
    document: {
      documentElement: {
        classList: {
          add: (name) => classSet.add(name),
        },
      },
    },
  };

  assert.equal(applyBootstrapThemeClass(fakeWindow), true);
  assert.equal(classSet.has('bootstrap-dark'), true);
});

test('applyBootstrapThemeClass is a no-op when bootstrap query is not dark', () => {
  const classSet = new Set();
  const fakeWindow = {
    location: { search: '?bootstrapTheme=light' },
    document: {
      documentElement: {
        classList: {
          add: (name) => classSet.add(name),
        },
      },
    },
  };

  assert.equal(applyBootstrapThemeClass(fakeWindow), false);
  assert.equal(classSet.size, 0);
});
