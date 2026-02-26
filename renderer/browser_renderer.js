const __nviewBridgeGuard = window.nviewBridgeGuard;
if (!__nviewBridgeGuard?.guardRenderer?.({ windowName: "Browser", required: ["browserApi"] })) {
  // Bridge API missing: fail fast after rendering guard UI.
} else {
const $ = (id) => document.getElementById(id);

const urlInput = $("url");
const backBtn = $("back");
const forwardBtn = $("forward");
const reloadBtn = $("reload");
const bookmarkMenuBtn = $("bookmarkMenuBtn");
const bookmarkAddBtn = $("bookmarkAdd");
const bookmarkAddLabel = $("bookmarkAddLabel");
const directDownloadBtn = $("directDownloadBtn");
const sidePanelEl = $("sidePanel");
const panelTitleEl = $("panelTitle");
const panelCloseBtn = $("panelClose");
const panelSearchInput = $("panelSearch");
const panelListEl = $("panelList");
const directDownloadLabelEl = $("directDownloadLabel");
const directDownloadIconEl = $("directDownloadIcon");

let bookmarkEntries = [];
let bookmarkLoadError = "";
let activePanelType = null;
const bookmarkAddDefaultLabel = bookmarkAddLabel?.textContent || "Add Bookmark";
let bookmarkAddFeedbackTimer = null;
let directDownloadUiState = "default";
let lastObservedBrowserUrl = "";


function setDirectDownloadButtonState({
  label = "Direct Download",
  iconClass = "icon-download",
  title = "Queue direct download in Downloader",
  disabled = false,
  variant = "default",
} = {}) {
  if (!directDownloadBtn) return;
  const nextLabel = String(label || "Direct Download");
  if (directDownloadLabelEl) directDownloadLabelEl.textContent = nextLabel;
  directDownloadBtn.setAttribute("aria-label", nextLabel);
  directDownloadBtn.title = String(title || nextLabel);
  directDownloadBtn.disabled = Boolean(disabled);
  directDownloadBtn.classList.toggle("is-failed", variant === "failed");
  directDownloadBtn.classList.toggle("is-already-downloaded", variant === "already-downloaded");
  if (directDownloadIconEl) {
    directDownloadIconEl.classList.remove("icon-download", "icon-alert");
    directDownloadIconEl.classList.add("icon", iconClass === "icon-alert" ? "icon-alert" : "icon-download");
  }
}

function clearTransientDirectDownloadState() {
  if (directDownloadUiState === "failed" || directDownloadUiState === "already-downloaded") {
    directDownloadUiState = "default";
  }
}

function getDirectDownloadFailureMessage(errorMessage) {
  const message = String(errorMessage || "").trim();
  if (!message) return "Direct download failed.";
  if (/no\s+images?\s+found|no\s+image\s+urls?\s+were\s+extracted|missing\s+direct\s+download\s+image\s+list|invalid\s+scrape\s+result/i.test(message)) {
    return "No downloadable content detected on this page.";
  }
  return message;
}


function setNavigationButtonsState(canGoBack, canGoForward) {
  if (backBtn) backBtn.disabled = !canGoBack;
  if (forwardBtn) forwardBtn.disabled = !canGoForward;
}

function showBookmarkAddedFeedback() {
  if (!bookmarkAddLabel) return;
  bookmarkAddLabel.textContent = "Added!";
  if (bookmarkAddFeedbackTimer) {
    clearTimeout(bookmarkAddFeedbackTimer);
  }
  bookmarkAddFeedbackTimer = setTimeout(() => {
    bookmarkAddLabel.textContent = bookmarkAddDefaultLabel;
    bookmarkAddFeedbackTimer = null;
  }, 1200);
}

async function refreshNavigationState() {
  const res = await window.browserApi.getNavigationState();
  if (!res?.ok) {
    setNavigationButtonsState(false, false);
    return;
  }
  setNavigationButtonsState(Boolean(res.canGoBack), Boolean(res.canGoForward));
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark", Boolean(isDark));
}

async function loadSettings() {
  const res = await window.browserApi.getSettings();
  if (res?.ok) applyTheme(res.settings?.darkMode);
}

function normalize(url) {
  let t = String(url || "").trim();
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) t = "https://" + t;
  return t;
}

function updateUrlField(nextUrl) {
  const value = String(nextUrl || "");
  urlInput.value = value;
  urlInput.title = value;
}

function isHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(normalize(raw));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function refreshDirectDownloadState(urlValue) {
  if (!directDownloadBtn) return;
  const candidateUrl = String(urlValue || urlInput?.value || "").trim();
  directDownloadBtn.hidden = false;

  if (!isHttpUrl(candidateUrl)) {
    setDirectDownloadButtonState({
      label: "Direct Download",
      iconClass: "icon-download",
      title: "Direct download is only available for web pages (http/https).",
      disabled: true,
      variant: "default",
    });
    return;
  }

  const state = await window.browserApi.getDirectDownloadState();
  if (!state?.ok || !state?.supported) {
    setDirectDownloadButtonState({
      label: "Direct Download",
      iconClass: "icon-download",
      title: state?.error || state?.reason || "Direct download is unavailable for this source.",
      disabled: true,
      variant: "default",
    });
    return;
  }

  if (state?.alreadyDownloaded && directDownloadUiState !== "failed") {
    directDownloadUiState = "already-downloaded";
  } else if (!state?.alreadyDownloaded && directDownloadUiState === "already-downloaded") {
    directDownloadUiState = "default";
  }

  if (directDownloadUiState === "failed") {
    setDirectDownloadButtonState({
      label: "Download failed",
      iconClass: "icon-alert",
      title: "Direct download failed. Refresh or navigate to re-enable.",
      disabled: true,
      variant: "failed",
    });
    return;
  }

  if (directDownloadUiState === "already-downloaded") {
    setDirectDownloadButtonState({
      label: "Already downloaded",
      iconClass: "icon-download",
      title: "Already downloaded. Click to download again if needed.",
      disabled: false,
      variant: "already-downloaded",
    });
    return;
  }

  setDirectDownloadButtonState({
    label: "Direct Download",
    iconClass: "icon-download",
    title: "Queue direct download in Downloader",
    disabled: false,
    variant: "default",
  });
}

function formatBookmarkTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
  return String(value);
}

function renderBookmarksList(entries, query, errorMessage) {
  if (!panelListEl) return;
  panelListEl.innerHTML = "";
  if (errorMessage) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = errorMessage;
    panelListEl.appendChild(empty);
    return;
  }
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const filtered = normalizedQuery
    ? entries.filter(
        (item) =>
          String(item.title || "").toLowerCase().includes(normalizedQuery) ||
          String(item.url || "").toLowerCase().includes(normalizedQuery),
      )
    : entries;
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "No bookmarks saved yet.";
    panelListEl.appendChild(empty);
    return;
  }
  for (const item of filtered) {
    const row = document.createElement("div");
    row.className = "panel-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-item bookmark-item";
    button.dataset.action = "open";
    button.dataset.url = item.url || "";

    const details = document.createElement("span");
    details.className = "bookmark-details";
    const titleText = document.createElement("span");
    titleText.className = "bookmark-title";
    titleText.textContent = item.title || item.url || "Untitled";
    details.appendChild(titleText);

    const urlText = document.createElement("span");
    urlText.className = "bookmark-url";
    urlText.textContent = item.url || "";
    details.appendChild(urlText);

    const meta = document.createElement("span");
    meta.className = "bookmark-meta";
    meta.textContent = formatBookmarkTimestamp(item.savedAt);

    details.appendChild(meta);
    button.appendChild(details);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-remove";
    remove.dataset.action = "remove";
    remove.dataset.id = item.id || "";
    remove.setAttribute("aria-label", "Remove bookmark");
    const removeIcon = document.createElement("span");
    removeIcon.className = "icon icon-delete";
    remove.appendChild(removeIcon);

    row.appendChild(remove);
    row.appendChild(button);
    panelListEl.appendChild(row);
  }
}

function renderActivePanel() {
  if (!activePanelType) return;
  renderBookmarksList(bookmarkEntries, panelSearchInput?.value, bookmarkLoadError);
}

function setPanelOpen(isOpen) {
  if (!sidePanelEl) return;
  sidePanelEl.classList.toggle("open", isOpen);
  window.browserApi?.setSidePanelWidth?.(isOpen ? 400 : 0);
}

function closePanel() {
  activePanelType = null;
  bookmarkMenuBtn?.setAttribute("aria-expanded", "false");
  setPanelOpen(false);
}

function openPanel(type) {
  const isSameType = activePanelType === type && sidePanelEl?.classList.contains("open");
  if (isSameType) {
    closePanel();
    return;
  }
  activePanelType = type;
  bookmarkMenuBtn?.setAttribute("aria-expanded", type === "bookmarks" ? "true" : "false");
  if (panelTitleEl) {
    panelTitleEl.textContent = "My Bookmarks";
  }
  if (panelSearchInput) panelSearchInput.value = "";
  setPanelOpen(true);
  renderActivePanel();
  panelSearchInput?.focus();
}

async function navigateFromInput() {
  const target = normalize(urlInput.value);
  if (!target) return;

  const res = await window.browserApi.navigate(target);
  if (!res.ok) {
    // Show the error via the input tooltip.
    urlInput.title = res.error || "Navigation error";
  }
}

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigateFromInput();
});

backBtn.addEventListener("click", async () => {
  await window.browserApi.goBack();
  await refreshNavigationState();
  refreshDirectDownloadState(urlInput?.value).catch(() => {});
});

forwardBtn.addEventListener("click", async () => {
  await window.browserApi.goForward();
  await refreshNavigationState();
  refreshDirectDownloadState(urlInput?.value).catch(() => {});
});

reloadBtn.addEventListener("click", async () => {
  clearTransientDirectDownloadState();
  await window.browserApi.reload();
  refreshDirectDownloadState(urlInput?.value).catch(() => {});
});

directDownloadBtn?.addEventListener("click", async () => {
  setDirectDownloadButtonState({
    label: "Downloading…",
    iconClass: "icon-download",
    title: "Submitting direct download…",
    disabled: true,
    variant: "default",
  });
  const res = await window.browserApi.triggerDirectDownload();
  if (!res?.ok) {
    const failureMessage = getDirectDownloadFailureMessage(res?.error);
    directDownloadUiState = "failed";
  } else if (res?.alreadyDownloaded) {
    directDownloadUiState = "already-downloaded";
  } else {
    directDownloadUiState = "default";
  }
  await refreshDirectDownloadState();
});

bookmarkAddBtn?.addEventListener("click", async () => {
  const res = await window.browserApi.addBookmark();
  if (!res?.ok) {
    urlInput.title = res?.error || "Failed to add bookmark";
    return;
  }
  showBookmarkAddedFeedback();
  bookmarkEntries = Array.isArray(res.bookmarks) ? res.bookmarks : bookmarkEntries;
  if (activePanelType === "bookmarks") {
    bookmarkLoadError = "";
    renderActivePanel();
  }
});

bookmarkMenuBtn?.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (activePanelType !== "bookmarks") {
    await loadBookmarks();
  }
  openPanel("bookmarks");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePanel();
  }
});

panelCloseBtn?.addEventListener("click", closePanel);

panelSearchInput?.addEventListener("input", () => {
  renderActivePanel();
});

panelListEl?.addEventListener("click", (e) => {
  if (!activePanelType) return;
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === "remove") {
    const id = actionEl.dataset.id;
    if (!id) return;
    window.browserApi.removeBookmark(id).then((res) => {
      if (!res?.ok) {
        bookmarkLoadError = res?.error || "Failed to remove bookmark.";
        renderActivePanel();
        return;
      }
      bookmarkEntries = Array.isArray(res.bookmarks) ? res.bookmarks : [];
      bookmarkLoadError = "";
      renderActivePanel();
    });
    return;
  }
  if (action === "open") {
    const url = actionEl.dataset.url;
    if (!url) return;
    window.browserApi.navigate(url);
    closePanel();
  }
});

window.browserApi.onSettingsUpdated((settings) => {
  applyTheme(settings?.darkMode);
});

window.browserApi.onUrlUpdated((url) => {
  const nextUrl = String(url || "").trim();
  if (nextUrl && nextUrl !== lastObservedBrowserUrl) {
    clearTransientDirectDownloadState();
  }
  lastObservedBrowserUrl = nextUrl;
  updateUrlField(url);
  refreshDirectDownloadState(url).catch(() => {});
});

window.browserApi.onNavigationStateUpdated((state) => {
  setNavigationButtonsState(Boolean(state?.canGoBack), Boolean(state?.canGoForward));
});

window.browserApi.onBookmarksUpdated((payload) => {
  bookmarkEntries = Array.isArray(payload?.bookmarks) ? payload.bookmarks : bookmarkEntries;
  if (activePanelType === "bookmarks") {
    bookmarkLoadError = "";
    renderActivePanel();
  }
});

closePanel();
loadSettings();
refreshNavigationState();
refreshDirectDownloadState(urlInput?.value).catch(() => {});
// Intentionally no custom context menu in the browser UI; the BrowserView handles native menus.

async function loadBookmarks() {
  const res = await window.browserApi.listBookmarks();
  if (!res?.ok) {
    bookmarkEntries = [];
    bookmarkLoadError = res?.error || "Unable to load bookmarks.";
    renderActivePanel();
    return;
  }
  bookmarkEntries = Array.isArray(res.bookmarks) ? res.bookmarks : [];
  bookmarkLoadError = "";
  renderActivePanel();
}

}
