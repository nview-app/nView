const test = require('node:test');
const assert = require('node:assert/strict');

const { MIN_VAULT_PASSPHRASE, getVaultPolicy, validateVaultPassphrase } = require('../main/vault_policy');
const {
  getVaultPassphraseTooShortError,
  getVaultPassphraseHelpText,
} = require('../shared/vault_policy');

test('vault minimum passphrase policy is enforced at 8 characters', () => {
  assert.equal(MIN_VAULT_PASSPHRASE, 8);
  assert.deepEqual(validateVaultPassphrase('1234567'), {
    ok: false,
    error: 'Passphrase must be at least 8 characters.',
  });
});

test('renderer-facing policy text stays aligned with backend validation', () => {
  const shortPassphrase = '1'.repeat(MIN_VAULT_PASSPHRASE - 1);

  assert.deepEqual(validateVaultPassphrase(shortPassphrase), {
    ok: false,
    error: getVaultPassphraseTooShortError(),
  });

  assert.match(getVaultPassphraseHelpText(), new RegExp(String(MIN_VAULT_PASSPHRASE)));
});

test('validateVaultPassphrase trims and accepts valid input', () => {
  assert.deepEqual(validateVaultPassphrase('   secure123   '), {
    ok: true,
    passphrase: 'secure123',
  });
});

test('getVaultPolicy returns shared renderer-facing policy payload', () => {
  assert.deepEqual(getVaultPolicy(), {
    minPassphraseLength: MIN_VAULT_PASSPHRASE,
    passphraseHelpText: getVaultPassphraseHelpText(),
    tooShortError: getVaultPassphraseTooShortError(),
  });
});
