const {
  MIN_VAULT_PASSPHRASE,
  getVaultPassphraseHelpText,
  getVaultPassphraseTooShortError,
} = require("../shared/vault_policy");


function getVaultPolicy() {
  return {
    minPassphraseLength: MIN_VAULT_PASSPHRASE,
    passphraseHelpText: getVaultPassphraseHelpText(),
    tooShortError: getVaultPassphraseTooShortError(),
  };
}

function validateVaultPassphrase(passphrase) {
  const trimmed = String(passphrase || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Passphrase required." };
  }
  if (trimmed.length < MIN_VAULT_PASSPHRASE) {
    return {
      ok: false,
      error: getVaultPassphraseTooShortError(),
    };
  }
  return { ok: true, passphrase: trimmed };
}

module.exports = {
  MIN_VAULT_PASSPHRASE,
  getVaultPolicy,
  validateVaultPassphrase,
};
