const MIN_VAULT_PASSPHRASE = 8;

function getVaultPassphraseTooShortError() {
  return `Passphrase must be at least ${MIN_VAULT_PASSPHRASE} characters.`;
}

function getVaultPassphraseHelpText() {
  return `Use a minimum of ${MIN_VAULT_PASSPHRASE} characters. It is recommended to include at least one uppercase letter, one lowercase letter, one digit, and one symbol.`;
}

module.exports = {
  MIN_VAULT_PASSPHRASE,
  getVaultPassphraseTooShortError,
  getVaultPassphraseHelpText,
};
