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

function wipeBufferBestEffort(buffer) {
  if (!Buffer.isBuffer(buffer)) return;
  try {
    buffer.fill(0);
  } catch {
    // Best effort only.
  }
}

function wipeUint8ArrayBestEffort(view) {
  if (!(view instanceof Uint8Array)) return;
  try {
    view.fill(0);
  } catch {
    // Best effort only.
  }
}

function normalizeVaultPassphraseInput(passphraseInput) {
  let rawBuffer;
  const cleanupTargets = new Set();

  const queueCleanup = (value) => {
    if (!value) return;
    cleanupTargets.add(value);
  };

  if (Buffer.isBuffer(passphraseInput)) {
    rawBuffer = passphraseInput;
    queueCleanup(passphraseInput);
  } else if (passphraseInput instanceof Uint8Array) {
    rawBuffer = Buffer.from(passphraseInput);
    queueCleanup(rawBuffer);
    queueCleanup(passphraseInput);
  } else if (passphraseInput && typeof passphraseInput === "object" && passphraseInput.passphraseBytes instanceof Uint8Array) {
    rawBuffer = Buffer.from(passphraseInput.passphraseBytes);
    queueCleanup(rawBuffer);
    queueCleanup(passphraseInput.passphraseBytes);
  } else if (passphraseInput && typeof passphraseInput === "object" && Buffer.isBuffer(passphraseInput.passphraseBytes)) {
    rawBuffer = Buffer.from(passphraseInput.passphraseBytes);
    queueCleanup(rawBuffer);
    queueCleanup(passphraseInput.passphraseBytes);
  } else if (passphraseInput && typeof passphraseInput === "object" && typeof passphraseInput.passphrase === "string") {
    rawBuffer = Buffer.from(passphraseInput.passphrase, "utf8");
    queueCleanup(rawBuffer);
  } else {
    rawBuffer = Buffer.from(String(passphraseInput || ""), "utf8");
    queueCleanup(rawBuffer);
  }

  try {
    const trimmed = rawBuffer.toString("utf8").trim();
    const validation = validateVaultPassphrase(trimmed);
    if (!validation.ok) return validation;
    return {
      ok: true,
      passphraseBuffer: Buffer.from(trimmed, "utf8"),
    };
  } finally {
    for (const target of cleanupTargets) {
      if (Buffer.isBuffer(target)) {
        wipeBufferBestEffort(target);
      } else {
        wipeUint8ArrayBestEffort(target);
      }
    }
  }
}

module.exports = {
  MIN_VAULT_PASSPHRASE,
  getVaultPolicy,
  normalizeVaultPassphraseInput,
  validateVaultPassphrase,
};
