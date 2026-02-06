const MIN_VAULT_PASSPHRASE = 8;

function validateVaultPassphrase(passphrase) {
  const trimmed = String(passphrase || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Passphrase required." };
  }
  if (trimmed.length < MIN_VAULT_PASSPHRASE) {
    return {
      ok: false,
      error: `Passphrase must be at least ${MIN_VAULT_PASSPHRASE} characters.`,
    };
  }
  return { ok: true, passphrase: trimmed };
}

module.exports = {
  MIN_VAULT_PASSPHRASE,
  validateVaultPassphrase,
};
