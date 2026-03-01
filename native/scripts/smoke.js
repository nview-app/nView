'use strict';

const path = require('node:path');

const addonPath = path.join(__dirname, '..', 'build', 'Release', 'addon.node');

const addon = require(addonPath);

if (typeof addon.isSupported !== 'function') {
  throw new Error('Expected isSupported function export');
}

if (typeof addon.lockBuffer !== 'function') {
  throw new Error('Expected lockBuffer function export');
}

const input = Buffer.from('sensitive-data', 'utf8');
const lockResult = addon.lockBuffer(input);
if (!lockResult || typeof lockResult.ok !== 'boolean' || typeof lockResult.locked !== 'boolean') {
  throw new Error('Unexpected lockBuffer result shape');
}

const wipeResult = addon.wipeBuffer(input);
if (!wipeResult || wipeResult.ok !== true) {
  throw new Error('Expected wipeBuffer to report success');
}

const unlockResult = addon.unlockBuffer(input);
if (!unlockResult || unlockResult.ok !== true) {
  throw new Error('Expected unlockBuffer to report success');
}

if (!input.equals(Buffer.alloc(input.length, 0))) {
  throw new Error('Expected buffer to be zeroized by wipeBuffer');
}

console.log('Native addon smoke test passed.');
