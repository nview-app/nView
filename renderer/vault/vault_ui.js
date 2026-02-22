(function initVaultUiModule(globalObj) {
  const PASS_STRENGTH_LEVELS = [
    { label: "Weak", color: "#d32f2f" },
    { label: "Medium", color: "#f9a825" },
    { label: "Strong", color: "#43a047" },
    { label: "Very strong", color: "#1b5e20" },
  ];

  function scorePassphraseStrength(passphrase, minLength) {
    const value = String(passphrase || "");
    if (!value.length) return { percent: 0, label: "", color: PASS_STRENGTH_LEVELS[0].color };

    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSymbol = /[^A-Za-z0-9]/.test(value);
    const classCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

    let tier = PASS_STRENGTH_LEVELS[0];
    if (value.length >= 10 && classCount === 4) {
      tier = PASS_STRENGTH_LEVELS[3];
    } else if (value.length >= 8 && classCount >= 3) {
      tier = PASS_STRENGTH_LEVELS[2];
    } else if (value.length >= minLength && classCount >= 2) {
      tier = PASS_STRENGTH_LEVELS[1];
    }

    const percentMap = { Weak: 25, Medium: 55, Strong: 80, "Very strong": 100 };
    return { percent: percentMap[tier.label] || 25, label: tier.label, color: tier.color };
  }

  function updateVaultStrength(passphrase, elements, minLength, { active = false } = {}) {
    const { vaultStrengthEl, vaultStrengthBarEl, vaultStrengthLabelEl } = elements;
    if (!vaultStrengthBarEl || !vaultStrengthLabelEl || !vaultStrengthEl) return;

    if (!active) {
      vaultStrengthEl.style.display = "none";
      vaultStrengthLabelEl.textContent = "";
      vaultStrengthBarEl.style.width = "0%";
      vaultStrengthBarEl.style.backgroundColor = PASS_STRENGTH_LEVELS[0].color;
      vaultStrengthBarEl.setAttribute("aria-valuenow", "0");
      return;
    }

    vaultStrengthEl.style.display = "block";
    const strength = scorePassphraseStrength(passphrase, minLength);
    vaultStrengthBarEl.style.width = `${strength.percent}%`;
    vaultStrengthBarEl.style.backgroundColor = strength.color || PASS_STRENGTH_LEVELS[0].color;
    vaultStrengthBarEl.setAttribute("aria-valuenow", String(strength.percent));

    vaultStrengthLabelEl.textContent = passphrase ? `Strength: ${strength.label}` : "";
  }

  async function loadVaultPolicy({ api, onPolicy, vaultPassphraseHelpEl }) {
    try {
      const res = await api.getVaultPolicy();
      if (!res?.ok || !res?.policy) return;
      onPolicy(res.policy);
      if (vaultPassphraseHelpEl) {
        vaultPassphraseHelpEl.textContent = res.policy.passphraseHelpText;
      }
    } catch (_err) {
      // Keep bootstrap fallback policy so startup remains resilient.
    }
  }

  globalObj.nviewVaultUi = { loadVaultPolicy, updateVaultStrength };
})(window);
