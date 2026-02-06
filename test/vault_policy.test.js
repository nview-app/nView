const test = require('node:test');
const assert = require('node:assert/strict');

const { MIN_VAULT_PASSPHRASE, validateVaultPassphrase } = require('../main/vault_policy');

test('vault minimum passphrase policy is enforced at 8 characters', () => {
  assert.equal(MIN_VAULT_PASSPHRASE, 8);
  assert.deepEqual(validateVaultPassphrase('1234567'), {
    ok: false,
    error: 'Passphrase must be at least 8 characters.',
  });
});

test('validateVaultPassphrase trims and accepts valid input', () => {
  assert.deepEqual(validateVaultPassphrase('   secure123   '), {
    ok: true,
    passphrase: 'secure123',
  });
});
