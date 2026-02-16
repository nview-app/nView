function normalizeOpenPathResult(result) {
  if (typeof result !== "string") {
    return { ok: true };
  }

  const error = result.trim();
  if (!error) return { ok: true };
  return { ok: false, error };
}

module.exports = {
  normalizeOpenPathResult,
};
