function getNavigationHistory(contents) {
  if (!contents) return null;
  const navigationHistory = contents.navigationHistory;
  if (!navigationHistory || typeof navigationHistory !== "object") return null;
  if (typeof navigationHistory.canGoBack !== "function") return null;
  if (typeof navigationHistory.canGoForward !== "function") return null;
  return navigationHistory;
}

function canGoBack(contents) {
  const navigationHistory = getNavigationHistory(contents);
  if (navigationHistory) return navigationHistory.canGoBack();
  if (typeof contents?.canGoBack === "function") return contents.canGoBack();
  return false;
}

function canGoForward(contents) {
  const navigationHistory = getNavigationHistory(contents);
  if (navigationHistory) return navigationHistory.canGoForward();
  if (typeof contents?.canGoForward === "function") return contents.canGoForward();
  return false;
}

module.exports = {
  canGoBack,
  canGoForward,
  getNavigationHistory,
};
