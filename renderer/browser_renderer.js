const $ = (id) => document.getElementById(id);

const urlInput = $("url");
const backBtn = $("back");
const forwardBtn = $("forward");
const reloadBtn = $("reload");
const bookmarkMenuBtn = $("bookmarkMenuBtn");
const bookmarkAddBtn = $("bookmarkAdd");
const bookmarkAddLabel = $("bookmarkAddLabel");
const tagMenuBtn = $("tagMenuBtn");
const artistMenuBtn = $("artistMenuBtn");
const sidePanelEl = $("sidePanel");
const panelTitleEl = $("panelTitle");
const panelCloseBtn = $("panelClose");
const panelSearchInput = $("panelSearch");
const panelListEl = $("panelList");

let libraryItems = [];
let tagEntries = [];
let artistEntries = [];
let bookmarkEntries = [];
let bookmarkLoadError = "";
let activePanelType = null;
const bookmarkAddDefaultLabel = bookmarkAddLabel?.textContent || "Add Bookmark";
let bookmarkAddFeedbackTimer = null;

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

function slugifyLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return "";
  const slug = normalized.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return encodeURIComponent(slug);
}

function getApplicationBaseUrl() {
  const raw = urlInput.value || "";
  const normalized = normalize(raw);
  if (!normalized) return "";
  try {
    return new URL(normalized).origin;
  } catch {
    return normalized.replace(/\/+$/, "");
  }
}

function updateUrlField(nextUrl) {
  const value = String(nextUrl || "");
  urlInput.value = value;
  urlInput.title = value;
}

function computeCounts(items, key) {
  const counts = new Map();
  for (const item of items) {
    const isFavorite = item?.favorite === true;
    if (key === "tags") {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      for (const rawTag of tags) {
        const tag = String(rawTag || "").trim();
        if (!tag) continue;
        const current = counts.get(tag) || { total: 0, favorites: 0 };
        counts.set(tag, {
          total: current.total + 1,
          favorites: current.favorites + (isFavorite ? 1 : 0),
        });
      }
    } else if (key === "artists") {
      const artist = String(item.artist || "").trim();
      if (!artist) continue;
      const current = counts.get(artist) || { total: 0, favorites: 0 };
      counts.set(artist, {
        total: current.total + 1,
        favorites: current.favorites + (isFavorite ? 1 : 0),
      });
    }
  }
  return Array.from(counts.entries())
    .map(([label, values]) => [label, values.total, values.favorites])
    .sort((a, b) => {
      if (b[2] !== a[2]) return b[2] - a[2];
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
    });
}

function renderPanelList(entries, query) {
  if (!panelListEl) return;
  panelListEl.innerHTML = "";
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const filtered = normalizedQuery
    ? entries.filter(([label]) => label.toLowerCase().includes(normalizedQuery))
    : entries;
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "No entries found.";
    panelListEl.appendChild(empty);
    return;
  }
  for (const [label, count, favorites] of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-item";
    button.dataset.label = label;

    const name = document.createElement("span");
    name.className = "panel-item-label";
    if (favorites > 0) {
      const favorite = document.createElement("span");
      favorite.className = "panel-favorite-indicator";
      favorite.textContent = "★";
      name.appendChild(favorite);
    }
    const labelText = document.createElement("span");
    labelText.textContent = label;
    name.appendChild(labelText);
    const countEl = document.createElement("span");
    countEl.className = "panel-count";
    countEl.textContent = String(count);

    button.appendChild(name);
    button.appendChild(countEl);
    panelListEl.appendChild(button);
  }
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
    remove.textContent = "✕";

    row.appendChild(button);
    row.appendChild(remove);
    panelListEl.appendChild(row);
  }
}

function renderActivePanel() {
  if (!activePanelType) return;
  if (activePanelType === "bookmarks") {
    renderBookmarksList(bookmarkEntries, panelSearchInput?.value, bookmarkLoadError);
    return;
  }
  const entries = activePanelType === "tags" ? tagEntries : artistEntries;
  renderPanelList(entries, panelSearchInput?.value);
}

function setPanelOpen(isOpen) {
  if (!sidePanelEl) return;
  sidePanelEl.classList.toggle("open", isOpen);
  window.browserApi?.setSidePanelWidth?.(isOpen ? 350 : 0);
}

function closePanel() {
  activePanelType = null;
  bookmarkMenuBtn?.setAttribute("aria-expanded", "false");
  tagMenuBtn?.setAttribute("aria-expanded", "false");
  artistMenuBtn?.setAttribute("aria-expanded", "false");
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
  tagMenuBtn?.setAttribute("aria-expanded", type === "tags" ? "true" : "false");
  artistMenuBtn?.setAttribute("aria-expanded", type === "artists" ? "true" : "false");
  if (panelTitleEl) {
    panelTitleEl.textContent =
      type === "tags" ? "Tags" : type === "artists" ? "Artists" : "Bookmarks";
  }
  if (panelSearchInput) panelSearchInput.value = "";
  setPanelOpen(true);
  renderActivePanel();
  panelSearchInput?.focus();
}

function navigateToOverview(type, label) {
  const baseUrl = getApplicationBaseUrl();
  if (!baseUrl) return;
  const slug = slugifyLabel(label);
  if (!slug) return;
  const path = type === "artists" ? "artist" : "tag";
  const targetUrl = `${baseUrl}/${path}/${slug}`;
  window.browserApi.navigate(targetUrl);
  closePanel();
}

async function loadLibraryData() {
  const res = await window.browserApi.listLibrary();
  if (!res?.ok || !Array.isArray(res.items)) {
    libraryItems = [];
  } else {
    libraryItems = res.items;
  }
  tagEntries = computeCounts(libraryItems, "tags");
  artistEntries = computeCounts(libraryItems, "artists");
  renderActivePanel();
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
});

forwardBtn.addEventListener("click", async () => {
  await window.browserApi.goForward();
  await refreshNavigationState();
});

reloadBtn.addEventListener("click", async () => {
  await window.browserApi.reload();
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

tagMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  openPanel("tags");
});

artistMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  openPanel("artists");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

panelCloseBtn?.addEventListener("click", closePanel);

panelSearchInput?.addEventListener("input", () => {
  renderActivePanel();
});

panelListEl?.addEventListener("click", (e) => {
  if (!activePanelType) return;
  if (activePanelType === "bookmarks") {
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
    return;
  }
  const target = e.target.closest(".panel-item");
  if (!target) return;
  navigateToOverview(activePanelType, target.dataset.label);
});

window.browserApi.onSettingsUpdated((settings) => {
  applyTheme(settings?.darkMode);
});

window.browserApi.onUrlUpdated((url) => {
  updateUrlField(url);
});

window.browserApi.onNavigationStateUpdated((state) => {
  setNavigationButtonsState(Boolean(state?.canGoBack), Boolean(state?.canGoForward));
});

loadSettings();
loadLibraryData();
refreshNavigationState();

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
