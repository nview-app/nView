function shouldUseDarkBootstrapTheme(locationSearch) {
  const params = new URLSearchParams(String(locationSearch || ""));
  return params.get("bootstrapTheme") === "dark";
}

function applyBootstrapThemeClass(win = window) {
  try {
    const search = String(win?.location?.search || "");
    if (!shouldUseDarkBootstrapTheme(search)) return false;
    const root = win?.document?.documentElement;
    if (!root?.classList) return false;
    root.classList.add("bootstrap-dark");
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  shouldUseDarkBootstrapTheme,
  applyBootstrapThemeClass,
};

