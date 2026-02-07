const $ = (id) => document.getElementById(id);

const openBrowserBtn = $("openBrowser");
const openDownloaderBtn = $("openDownloader");
const openDownloaderCountEl = $("openDownloaderCount");
const refreshBtn = $("refresh");
const openSettingsBtn = $("openSettings");
const statusEl = $("status");
const galleryEl = $("gallery");
const searchInput = $("searchInput");
const tagFilterBtn = $("tagFilterBtn");
const tagFilterLabel = $("tagFilterLabel");
const tagFilterClearBtn = $("tagFilterClearBtn");
const languageFilterSelect = $("languageFilterSelect");
const sortSelect = $("sortSelect");

const vaultModalEl = $("vaultModal");
const vaultPassInput = $("vaultPassphrase");
const vaultPassConfirmInput = $("vaultPassphraseConfirm");
const vaultMessageEl = $("vaultMessage");
const vaultErrorEl = $("vaultError");
const vaultUnlockBtn = $("vaultUnlock");
const vaultInitBtn = $("vaultInit");
const vaultStrengthEl = $("vaultStrength");
const vaultStrengthBarEl = $("vaultStrengthBar");
const vaultStrengthLabelEl = $("vaultStrengthLabel");
const vaultPassphraseHelpEl = $("vaultPassphraseHelp");

const readerEl = $("reader");
const readerTitleEl = $("readerTitle");
const pagesEl = $("pages");
const readerPageSelect = $("readerPageSelect");
const favoriteToggleBtn = $("favoriteToggle");
const closeReaderBtn = $("closeReader");
const openFolderBtn = $("openFolder");
const editComicBtn = $("editComic");

const editModalEl = $("editModal");
const closeEditBtn = $("closeEdit");
const saveEditBtn = $("saveEdit");
const deleteComicBtn = $("deleteComic");
const editTitleInput = $("editTitleInput");
const editAuthorInput = $("editAuthorInput");
const editLanguagesInput = $("editLanguagesInput");
const editTagsInput = $("editTagsInput");

const tagModalEl = $("tagModal");
const closeTagModalBtn = $("closeTagModal");
const tagSearchInput = $("tagSearchInput");
const tagMatchAllToggle = $("tagMatchAllToggle");
const tagListEl = $("tagList");
const clearTagFiltersBtn = $("clearTagFilters");
const tagModeLabel = $("tagModeLabel");
const tagSelectionSummary = $("tagSelectionSummary");

const settingsModalEl = $("settingsModal");
const closeSettingsBtn = $("closeSettings");
const saveSettingsBtn = $("saveSettings");
const settingsStartPageInput = $("settingsStartPage");
const settingsStartPageStatus = $("settingsStartPageStatus");
const settingsBlockPopupsInput = $("settingsBlockPopups");
const settingsAllowListEnabledInput = $("settingsAllowListEnabled");
const settingsAllowListDomainsInput = $("settingsAllowListDomains");
const settingsDarkModeInput = $("settingsDarkMode");
const settingsDefaultSortInput = $("settingsDefaultSort");
const settingsCardSizeInput = $("settingsCardSize");
const vaultStatusNote = $("vaultStatusNote");

let settingsCache = {
  startPage: "",
  blockPopups: true,
  allowListEnabled: true,
  allowListDomains: ["*.cloudflare.com"],
  darkMode: false,
  defaultSort: "favorites",
  cardSize: "normal",
};

const VALID_START_PAGE_HASHES = new Set([
  "025cd83ae01cdc332a1698ec3aceec7c84b83557f5388968e02831e877688e07",
  "7939af4c0f1ebe4049e933a07a667d0f58c0529cad7478808e6fabaec343492b",
  "8605b8ba08c20d42f9e455151871896d0e0de980596286fb736d11eec013e2a4",
]);
let startPageValidationToken = 0;

let vaultState = { initialized: false, unlocked: true };
const MIN_VAULT_PASSPHRASE = 10;

const PASS_STRENGTH_LEVELS = [
  { label: "Weak", color: "#d32f2f" },
  { label: "Medium", color: "#f9a825" },
  { label: "Strong", color: "#43a047" },
  { label: "Very strong", color: "#1b5e20" },
];

function scorePassphraseStrength(passphrase) {
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
  } else if (value.length >= MIN_VAULT_PASSPHRASE && classCount >= 2) {
    tier = PASS_STRENGTH_LEVELS[1];
  }

  const percentMap = {
    Weak: 25,
    Medium: 55,
    Strong: 80,
    "Very strong": 100,
  };
  return { percent: percentMap[tier.label] || 25, label: tier.label, color: tier.color };
}

function updateVaultStrength(passphrase, { active = false } = {}) {
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
  const strength = scorePassphraseStrength(passphrase);
  vaultStrengthBarEl.style.width = `${strength.percent}%`;
  vaultStrengthBarEl.style.backgroundColor = strength.color || PASS_STRENGTH_LEVELS[0].color;
  vaultStrengthBarEl.setAttribute("aria-valuenow", String(strength.percent));

  if (!passphrase) {
    vaultStrengthLabelEl.textContent = "";
    return;
  }

  vaultStrengthLabelEl.textContent = `Strength: ${strength.label}`;
}

function toAppFileUrl(filePath) {
  let p = String(filePath || "").replaceAll("\\", "/");

  // Ensure Windows drive has colon (C:/...)
  if (/^[a-zA-Z]\//.test(p)) {
    p = p[0].toUpperCase() + ":/" + p.slice(2);
  }
  if (/^[a-zA-Z]:\//.test(p)) {
    p = p[0].toUpperCase() + p.slice(1);
  }

  // Encode per segment, BUT keep ":" (drive colon) unescaped
  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg).replaceAll("%3A", ":"))
    .join("/");

  return "appfile:///" + encoded;
}


function fmtPages(found) {
  const f = Number(found) || 0;
  return `${f} pages`;
}

let currentComicDir = null;
let currentComicMeta = null;
let readerPageEls = [];
let readerScrollRaf = null;
let readerFitHeight = false;
let libraryItems = [];
let tagFilters = {
  selected: new Set(),
  matchAll: false,
  counts: new Map(),
};
let languageOptions = [];

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function tokenize(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function computeTagCounts(items, selectedTags, matchAll) {
  const normalizedSelected = selectedTags.map(normalizeText);
  const sourceItems =
    matchAll && normalizedSelected.length
      ? items.filter((item) => matchesTags(item, normalizedSelected, true))
      : items;
  const counts = new Map();
  for (const item of sourceItems) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const tag of tags) {
      const t = String(tag || "").trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  if (matchAll && normalizedSelected.length) {
    for (const tag of selectedTags) {
      const t = String(tag || "").trim();
      if (!t) continue;
      if (!counts.has(t)) counts.set(t, 0);
    }
  }
  return counts;
}

function buildTagOptions(items) {
  const counts = computeTagCounts(items, Array.from(tagFilters.selected), tagFilters.matchAll);
  tagFilters.counts = counts;
  const normalizedAvailable = new Set(
    Array.from(counts.keys()).map((tag) => normalizeText(tag)),
  );
  tagFilters.selected = new Set(
    Array.from(tagFilters.selected).filter((tag) =>
      normalizedAvailable.has(normalizeText(tag)),
    ),
  );
  renderTagList();
  updateTagFilterSummary();
}

function buildLanguageOptions(items) {
  if (!languageFilterSelect) return;
  const previous = languageFilterSelect.value;
  const labelByNormalized = new Map();
  for (const item of items) {
    const languages = Array.isArray(item.languages) ? item.languages : [];
    for (const language of languages) {
      const raw = String(language || "").trim();
      if (!raw) continue;
      const normalized = normalizeText(raw);
      if (!labelByNormalized.has(normalized)) {
        labelByNormalized.set(normalized, raw);
      }
    }
  }
  languageOptions = Array.from(labelByNormalized.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  languageFilterSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All languages";
  languageFilterSelect.appendChild(allOption);
  for (const option of languageOptions) {
    const opt = document.createElement("option");
    opt.value = option.key;
    opt.textContent = option.label;
    languageFilterSelect.appendChild(opt);
  }
  const stillExists = previous && languageOptions.some((opt) => opt.key === previous);
  languageFilterSelect.value = stillExists ? previous : "";
}

function matchesSearch(item, queryTokens) {
  if (!queryTokens.length) return true;
  const haystack = [
    item.title,
    item.artist,
    item.id,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .map(normalizeText)
    .join(" ");
  return queryTokens.every((token) => haystack.includes(token));
}

function matchesTags(item, selectedTags, matchAll) {
  if (!selectedTags.length) return true;
  const tags = Array.isArray(item.tags) ? item.tags.map(normalizeText) : [];
  if (matchAll) {
    return selectedTags.every((tag) => tags.includes(tag));
  }
  return selectedTags.some((tag) => tags.includes(tag));
}

function matchesLanguage(item, selectedLanguage) {
  if (!selectedLanguage) return true;
  const languages = Array.isArray(item.languages) ? item.languages.map(normalizeText) : [];
  return languages.includes(selectedLanguage);
}

function sortItems(items, sortKey) {
  const sorted = [...items];
  switch (sortKey) {
    case "favorites":
      sorted.sort((a, b) => {
        const favoriteDelta = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
        if (favoriteDelta !== 0) return favoriteDelta;
        return (b.mtimeMs || 0) - (a.mtimeMs || 0);
      });
      break;
    case "oldest":
      sorted.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));
      break;
    case "title-desc":
      sorted.sort((a, b) => normalizeText(b.title).localeCompare(normalizeText(a.title)));
      break;
    case "title-asc":
      sorted.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title)));
      break;
    case "pages-desc":
      sorted.sort((a, b) => (b.pagesFound || 0) - (a.pagesFound || 0));
      break;
    case "pages-asc":
      sorted.sort((a, b) => (a.pagesFound || 0) - (b.pagesFound || 0));
      break;
    case "recent":
    default:
      sorted.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
      break;
  }
  return sorted;
}

function applyFilters() {
  const queryTokens = tokenize(searchInput.value);
  const selectedTags = Array.from(tagFilters.selected).map(normalizeText);
  const matchAll = tagFilters.matchAll;
  const languageSelection = normalizeText(languageFilterSelect?.value || "");
  const filteredByTags = libraryItems.filter(
    (item) => matchesSearch(item, queryTokens) && matchesTags(item, selectedTags, matchAll),
  );
  const filtered = filteredByTags.filter((item) => matchesLanguage(item, languageSelection));
  const sorted = sortItems(filtered, sortSelect.value);
  renderLibrary(sorted);

  const total = libraryItems.length;
  const shown = sorted.length;
  statusEl.textContent = `Library: ${shown}/${total} comic${total === 1 ? "" : "s"} • Root: ${
    statusEl.dataset.root || "-"
  }`;
}

function updateTagModeLabel() {
  if (!tagModeLabel) return;
  tagModeLabel.textContent = tagFilters.matchAll
    ? "Match all selected tags"
    : "Match any selected tags";
}

function clearTagFilters() {
  tagFilters.selected.clear();
  buildTagOptions(libraryItems);
  applyFilters();
}

function updateDownloaderBadge(count) {
  if (!openDownloaderCountEl) return;
  const active = Math.max(0, Number(count) || 0);
  if (!active) {
    openDownloaderCountEl.style.display = "none";
    openDownloaderCountEl.textContent = "0";
    return;
  }
  openDownloaderCountEl.textContent = active > 99 ? "99+" : String(active);
  openDownloaderCountEl.style.display = "inline-block";
}

function updateTagFilterSummary() {
  const count = tagFilters.selected.size;
  if (tagFilterLabel) {
    tagFilterLabel.textContent = count ? `Tags (${count} selected)` : "Filter tags";
  }
  if (tagFilterClearBtn) {
    tagFilterClearBtn.style.display = count ? "inline-flex" : "none";
  }
  if (tagSelectionSummary) {
    tagSelectionSummary.textContent = count
      ? `${count} tag${count === 1 ? "" : "s"} selected`
      : "No tags selected";
  }
}

function renderTagList() {
  if (!tagListEl) return;
  const query = normalizeText(tagSearchInput?.value || "");
  tagListEl.innerHTML = "";
  const tags = Array.from(tagFilters.counts.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [tag, count] of tags) {
    if (query && !normalizeText(tag).includes(query)) continue;
    const label = document.createElement("label");
    label.className = "tagOption";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tag;
    checkbox.checked = tagFilters.selected.has(tag);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        tagFilters.selected.add(tag);
      } else {
        tagFilters.selected.delete(tag);
      }
      buildTagOptions(libraryItems);
      applyFilters();
    });

    const text = document.createElement("span");
    text.textContent = tag;

    const countEl = document.createElement("span");
    countEl.className = "tagOptionCount";
    countEl.textContent = count;

    label.appendChild(checkbox);
    label.appendChild(text);
    label.appendChild(countEl);
    tagListEl.appendChild(label);
  }

  if (!tagListEl.children.length) {
    const empty = document.createElement("div");
    empty.className = "tagOption";
    empty.textContent = "No tags found.";
    tagListEl.appendChild(empty);
  }
}

function openTagModal() {
  if (!tagModalEl) return;
  if (tagMatchAllToggle) {
    tagMatchAllToggle.checked = tagFilters.matchAll;
  }
  tagModalEl.style.display = "block";
  updateTagModeLabel();
  buildTagOptions(libraryItems);
  tagSearchInput?.focus();
}

function closeTagModal() {
  if (!tagModalEl) return;
  tagModalEl.style.display = "none";
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark", Boolean(isDark));
}

function applyDefaultSort(value) {
  const normalized = String(value || "favorites");
  const optionExists = Array.from(sortSelect?.options || []).some(
    (option) => option.value === normalized,
  );
  if (optionExists) {
    sortSelect.value = normalized;
  }
}

function applyCardSize(value) {
  const size = String(value || "normal");
  document.documentElement.style.setProperty(
    "--gallery-columns",
    size === "small"
      ? "repeat(auto-fill, minmax(250px, 1fr))"
      : size === "large"
        ? "repeat(auto-fill, minmax(350px, 1fr))"
        : "repeat(auto-fill, minmax(300px, 1fr))",
  );
}

function setStartPageValidationState(state) {
  if (!settingsStartPageInput || !settingsStartPageStatus || !openBrowserBtn) return;
  settingsStartPageInput.classList.remove("input-valid", "input-invalid");
  settingsStartPageStatus.classList.remove("is-valid", "is-invalid");
  settingsStartPageStatus.textContent = "";

  if (state === "valid") {
    settingsStartPageInput.classList.add("input-valid");
    settingsStartPageStatus.classList.add("is-valid");
    settingsStartPageStatus.textContent = "✓";
    openBrowserBtn.disabled = false;
    return;
  }

  if (state === "invalid") {
    settingsStartPageInput.classList.add("input-invalid");
    settingsStartPageStatus.classList.add("is-invalid");
    settingsStartPageStatus.textContent = "✕";
  }
  openBrowserBtn.disabled = true;
}

async function hashStartPage(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateStartPageInput() {
  if (!settingsStartPageInput) return;
  const value = settingsStartPageInput.value.trim();
  const token = ++startPageValidationToken;

  if (!value) {
    setStartPageValidationState("empty");
    return;
  }

  try {
    const hash = await hashStartPage(value);
    if (token !== startPageValidationToken) return;
    setStartPageValidationState(VALID_START_PAGE_HASHES.has(hash) ? "valid" : "invalid");
  } catch {
    if (token !== startPageValidationToken) return;
    setStartPageValidationState("invalid");
  }
}

function applySettingsToUI(nextSettings) {
  settingsCache = nextSettings || settingsCache;
  settingsStartPageInput.value = settingsCache.startPage || "";
  settingsBlockPopupsInput.checked = Boolean(settingsCache.blockPopups);
  if (settingsAllowListEnabledInput) {
    settingsAllowListEnabledInput.checked = Boolean(settingsCache.allowListEnabled);
  }
  if (settingsAllowListDomainsInput) {
    const domains = Array.isArray(settingsCache.allowListDomains)
      ? settingsCache.allowListDomains
      : [];
    settingsAllowListDomainsInput.value = domains.join("\n");
  }
  settingsDarkModeInput.checked = Boolean(settingsCache.darkMode);
  if (settingsDefaultSortInput) {
    settingsDefaultSortInput.value = settingsCache.defaultSort || "favorites";
  }
  if (settingsCardSizeInput) {
    settingsCardSizeInput.value = settingsCache.cardSize || "normal";
  }
  applyTheme(settingsCache.darkMode);
  applyDefaultSort(settingsCache.defaultSort);
  applyCardSize(settingsCache.cardSize);
  void validateStartPageInput();
}

async function loadSettings() {
  const res = await window.api.getSettings();
  if (!res?.ok) return;
  applySettingsToUI(res.settings || settingsCache);
  updateVaultSettingsUI();
}

function updateVaultSettingsUI() {
  if (!vaultStatusNote) return;
  if (!vaultState.initialized) {
    vaultStatusNote.textContent = "Vault Mode is required. Set a passphrase to continue.";
    return;
  }
  vaultStatusNote.textContent = vaultState.unlocked
    ? "Vault Mode is active."
    : "Vault Mode is locked. Unlock to access your library.";
}

function showVaultModal(mode) {
  if (!vaultModalEl) return;
  vaultModalEl.style.display = "block";
  vaultErrorEl.textContent = "";
  vaultPassInput.value = "";
  vaultPassConfirmInput.value = "";
  updateVaultStrength("", { active: false });

  if (mode === "init") {
    vaultMessageEl.textContent =
      "Create a vault passphrase to continue.";
    vaultUnlockBtn.style.display = "none";
    vaultInitBtn.style.display = "inline-flex";
    vaultPassConfirmInput.style.display = "block";
    if (vaultPassphraseHelpEl) vaultPassphraseHelpEl.style.display = "block";
    updateVaultStrength("", { active: true });
  } else {
    vaultMessageEl.textContent = "Enter your vault passphrase to unlock the library.";
    vaultUnlockBtn.style.display = "inline-flex";
    vaultInitBtn.style.display = "none";
    vaultPassConfirmInput.style.display = "none";
    if (vaultPassphraseHelpEl) vaultPassphraseHelpEl.style.display = "none";
    updateVaultStrength("", { active: false });
  }
  vaultPassInput.focus();
}

function hideVaultModal() {
  if (!vaultModalEl) return;
  vaultModalEl.style.display = "none";
  vaultErrorEl.textContent = "";
}

async function fetchVaultStatus() {
  const res = await window.api.vaultStatus();
  if (!res?.ok) return;
  vaultState = res.status || vaultState;
  updateVaultSettingsUI();
  return vaultState;
}

function updateVaultModals() {
  if (!vaultState.initialized) {
    showVaultModal("init");
    return;
  }

  if (!vaultState.unlocked) {
    showVaultModal("unlock");
  } else {
    hideVaultModal();
  }
}

async function refreshVaultStatus() {
  await fetchVaultStatus();
  updateVaultModals();
}

function openReader({ title, comicDir, pages }) {
  currentComicDir = comicDir;
  readerTitleEl.textContent = title || "Reader";
  pagesEl.innerHTML = "";
  readerEl.classList.toggle("fit-height", readerFitHeight);
  updateFavoriteToggle(currentComicMeta?.favorite);
  readerEl.style.display = "block";

  // Vertical scroll reader, lazy-load
  for (const p of pages) {
    const img = document.createElement("img");
    img.className = "page";
    img.loading = "lazy";
    img.draggable = false;
    img.src = toAppFileUrl(p.path);
    img.alt = p.name;
    img.title = p.path;
    pagesEl.appendChild(img);
  }

  readerPageEls = Array.from(pagesEl.querySelectorAll(".page"));
  populateReaderJump(pages);
  updateReaderPageSelect();
  window.requestAnimationFrame(() => {
    scrollToPage(0, "auto");
  });
}

function updateFavoriteToggle(isFavorite) {
  if (!favoriteToggleBtn) return;
  const favored = Boolean(isFavorite);
  favoriteToggleBtn.classList.toggle("is-favorite", favored);
  const icon = favoriteToggleBtn.querySelector(".icon");
  if (icon) {
    icon.classList.toggle("icon-star-filled", favored);
    icon.classList.toggle("icon-star", !favored);
  }
  favoriteToggleBtn.setAttribute(
    "aria-label",
    favored ? "Remove from favorites" : "Add to favorites",
  );
  favoriteToggleBtn.title = favored ? "Remove from favorites" : "Add to favorites";
}

function toggleReaderFitHeight() {
  const selectedIndex = Number(readerPageSelect?.value);
  const targetIndex = Number.isFinite(selectedIndex) ? selectedIndex : getCurrentPageIndex();
  readerFitHeight = !readerFitHeight;
  readerEl.classList.toggle("fit-height", readerFitHeight);
  if (targetIndex >= 0) {
    window.requestAnimationFrame(() => {
      scrollToPage(targetIndex, "auto");
    });
  }
}

function closeReader() {
  readerEl.style.display = "none";
  pagesEl.innerHTML = "";
  currentComicDir = null;
  currentComicMeta = null;
  readerPageEls = [];
  readerPageSelect.innerHTML = "";
  closeEditModal();
}

closeReaderBtn.addEventListener("click", closeReader);

favoriteToggleBtn?.addEventListener("click", async () => {
  if (!currentComicDir) return;
  const nextState = !currentComicMeta?.favorite;
  const res = await window.api.toggleFavorite(currentComicDir, nextState);
  if (!res?.ok) {
    return;
  }
  currentComicMeta = res.entry || { ...currentComicMeta, favorite: nextState };
  updateFavoriteToggle(currentComicMeta?.favorite);
  libraryItems = libraryItems.map((item) =>
    item.dir === currentComicDir ? { ...item, favorite: currentComicMeta?.favorite } : item,
  );
  applyFilters();
});

// click outside the panel closes
readerEl.addEventListener("click", (e) => {
  if (e.target === readerEl) closeReader();
});

function populateReaderJump(pages) {
  if (!readerPageSelect) return;
  readerPageSelect.innerHTML = "";
  const safePages = Array.isArray(pages) ? pages : [];
  for (let i = 0; i < safePages.length; i += 1) {
    const page = safePages[i];
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `Page ${i + 1}${page?.name ? ` — ${page.name}` : ""}`;
    readerPageSelect.appendChild(option);
  }
  readerPageSelect.disabled = safePages.length === 0;
}

function getReaderScrollPaddingTop() {
  if (!pagesEl) return 0;
  const styles = window.getComputedStyle(pagesEl);
  return Number.parseFloat(styles.paddingTop) || 0;
}

function getPageOffsetTop(pageEl) {
  if (!pagesEl || !pageEl) return 0;
  const pagesRect = pagesEl.getBoundingClientRect();
  const pageRect = pageEl.getBoundingClientRect();
  return pageRect.top - pagesRect.top + pagesEl.scrollTop;
}

function scrollToPage(index, behavior = "smooth") {
  if (!readerPageEls.length) return;
  const clamped = Math.max(0, Math.min(index, readerPageEls.length - 1));
  const target = readerPageEls[clamped];
  if (!target) return;
  const paddingTop = getReaderScrollPaddingTop();
  const targetTop = Math.max(0, getPageOffsetTop(target) - paddingTop);
  pagesEl.scrollTo({ top: targetTop, behavior });
}

function getCurrentPageIndex() {
  if (!readerPageEls.length) return -1;
  const paddingTop = getReaderScrollPaddingTop();
  if (pagesEl.scrollTop <= paddingTop + 1) return 0;
  const viewTop = pagesEl.scrollTop + paddingTop + 1;
  for (let i = 0; i < readerPageEls.length; i += 1) {
    const page = readerPageEls[i];
    const pageTop = getPageOffsetTop(page);
    const pageBottom = pageTop + page.offsetHeight;
    if (pageBottom >= viewTop) return i;
  }
  return readerPageEls.length - 1;
}

function updateReaderPageSelect() {
  if (!readerPageSelect || readerPageSelect.disabled) return;
  const index = getCurrentPageIndex();
  if (index < 0) return;
  if (readerPageSelect.value !== String(index)) {
    readerPageSelect.value = String(index);
  }
}

readerPageSelect.addEventListener("change", () => {
  const index = Number(readerPageSelect.value);
  if (!Number.isFinite(index)) return;
  scrollToPage(index);
});

pagesEl.addEventListener("scroll", () => {
  if (readerScrollRaf) return;
  readerScrollRaf = window.requestAnimationFrame(() => {
    readerScrollRaf = null;
    updateReaderPageSelect();
  });
});

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.key !== " ") return;
  if (readerEl.style.display !== "block") return;
  if (isEditableTarget(event.target)) return;
  if (!readerPageEls.length) return;
  event.preventDefault();
  const currentIndex = getCurrentPageIndex();
  const nextIndex = Math.min(currentIndex + 1, readerPageEls.length - 1);
  if (nextIndex === currentIndex) return;
  scrollToPage(nextIndex);
});

document.addEventListener("keydown", (event) => {
  if (readerEl.style.display !== "block") return;
  if (isEditableTarget(event.target)) return;
  if (event.key?.toLowerCase() !== "f") return;
  event.preventDefault();
  toggleReaderFitHeight();
});

openFolderBtn.addEventListener("click", async () => {
  if (!currentComicDir) return;
  await window.api.showInFolder(currentComicDir);
});

function openEditModal() {
  if (!currentComicMeta) return;
  editTitleInput.value = currentComicMeta.title || "";
  editAuthorInput.value = currentComicMeta.artist || "";
  editLanguagesInput.value = Array.isArray(currentComicMeta.languages)
    ? currentComicMeta.languages.join(", ")
    : "";
  editTagsInput.value = Array.isArray(currentComicMeta.tags) ? currentComicMeta.tags.join(", ") : "";
  editModalEl.style.display = "block";
}

function closeEditModal() {
  editModalEl.style.display = "none";
}

editComicBtn.addEventListener("click", () => {
  if (!currentComicMeta) return;
  openEditModal();
});

closeEditBtn.addEventListener("click", closeEditModal);

editModalEl.addEventListener("click", (e) => {
  if (e.target === editModalEl) closeEditModal();
});

saveEditBtn.addEventListener("click", async () => {
  if (!currentComicDir) return;
  const payload = {
    title: editTitleInput.value.trim(),
    author: editAuthorInput.value.trim(),
    languages: editLanguagesInput.value,
    tags: editTagsInput.value,
  };
  const res = await window.api.updateComicMeta(currentComicDir, payload);
  if (res?.ok) {
    closeEditModal();
    await loadLibrary();
    const updatedTitle = res.entry?.title || payload.title || readerTitleEl.textContent;
    readerTitleEl.textContent = updatedTitle;
    currentComicMeta = res.entry || currentComicMeta;
  }
});

deleteComicBtn.addEventListener("click", async () => {
  if (!currentComicDir) return;
  const confirmDelete = window.confirm(
    `Delete this comic permanently?\n\n${currentComicMeta?.title || "Untitled comic"}`,
  );
  if (!confirmDelete) return;
  const res = await window.api.deleteComic(currentComicDir);
  if (res?.ok) {
    closeEditModal();
    closeReader();
    await loadLibrary();
  }
});

openSettingsBtn.addEventListener("click", async () => {
  await openSettingsModal();
});

async function openSettingsModal() {
  await loadSettings();
  await fetchVaultStatus();
  settingsModalEl.style.display = "block";
}

async function maybeOpenSettingsAfterVaultInit() {
  if (localStorage.getItem("vaultSettingsPrompted")) return;
  const res = await window.api.getSettings();
  const startPage = res?.settings?.startPage || "";
  localStorage.setItem("vaultSettingsPrompted", "true");
  if (!startPage) {
    await openSettingsModal();
  }
}

closeSettingsBtn.addEventListener("click", () => {
  settingsModalEl.style.display = "none";
});

settingsModalEl.addEventListener("click", (e) => {
  if (e.target === settingsModalEl) settingsModalEl.style.display = "none";
});

settingsStartPageInput?.addEventListener("input", () => {
  void validateStartPageInput();
});

saveSettingsBtn.addEventListener("click", async () => {
  const allowListRaw = settingsAllowListDomainsInput?.value || "";
  const allowListDomains = allowListRaw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const payload = {
    startPage: settingsStartPageInput.value,
    blockPopups: settingsBlockPopupsInput.checked,
    allowListEnabled: settingsAllowListEnabledInput?.checked ?? false,
    allowListDomains,
    darkMode: settingsDarkModeInput.checked,
    defaultSort: settingsDefaultSortInput?.value || settingsCache.defaultSort,
    cardSize: settingsCardSizeInput?.value || settingsCache.cardSize,
  };
  const res = await window.api.updateSettings(payload);
  if (res?.ok) {
    settingsCache = res.settings || settingsCache;
    applyTheme(settingsCache.darkMode);
    applyDefaultSort(settingsCache.defaultSort);
    applyCardSize(settingsCache.cardSize);
    applyFilters();
    settingsModalEl.style.display = "none";
  }
});

vaultUnlockBtn.addEventListener("click", async () => {
  const passphrase = vaultPassInput.value.trim();
  if (!passphrase) {
    vaultErrorEl.textContent = "Passphrase required.";
    return;
  }
  const res = await window.api.vaultUnlock(passphrase);
  if (!res?.ok) {
    vaultErrorEl.textContent = res?.error || "Wrong passphrase.";
    return;
  }
  vaultState = { ...vaultState, unlocked: true, initialized: true };
  hideVaultModal();
  await loadLibrary();
});

vaultInitBtn.addEventListener("click", async () => {
  const passphrase = vaultPassInput.value.trim();
  const confirmation = vaultPassConfirmInput.value.trim();
  if (!passphrase) {
    vaultErrorEl.textContent = "Passphrase required.";
    return;
  }
  if (passphrase.length < MIN_VAULT_PASSPHRASE) {
    vaultErrorEl.textContent = `Passphrase must be at least ${MIN_VAULT_PASSPHRASE} characters.`;
    return;
  }
  if (passphrase !== confirmation) {
    vaultErrorEl.textContent = "Passphrases do not match.";
    return;
  }
  const res = await window.api.vaultEnable(passphrase);
  if (!res?.ok) {
    vaultErrorEl.textContent = res?.error || "Failed to set vault passphrase.";
    return;
  }
  vaultState = { initialized: true, unlocked: true };
  hideVaultModal();
  await loadLibrary();
  await maybeOpenSettingsAfterVaultInit();
});

vaultPassInput.addEventListener("input", () => {
  if (!vaultState.initialized) {
    updateVaultStrength(vaultPassInput.value, { active: true });
  }
});

vaultPassInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (vaultState.initialized) {
    vaultUnlockBtn.click();
  } else {
    vaultInitBtn.click();
  }
});

vaultPassConfirmInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (!vaultState.initialized) {
    vaultInitBtn.click();
  }
});

async function openComicFromLibraryEntry(entry) {
  if (!entry) return;
  const res = await window.api.listComicPages(entry.dir);
  if (!res?.ok) {
    if (res?.locked) showVaultModal("unlock");
    return;
  }

  currentComicMeta = res.comic || null;
  openReader({
    title: res.comic?.title || entry.title || entry.id,
    comicDir: entry.dir,
    pages: res.pages || [],
  });
}

async function openComicByDir(comicDir) {
  const targetDir = String(comicDir || "").trim();
  if (!targetDir) return;

  let entry = libraryItems.find((item) => item.dir === targetDir);
  if (!entry) {
    await loadLibrary();
    entry = libraryItems.find((item) => item.dir === targetDir);
  }
  if (!entry) {
    statusEl.textContent = "Downloaded comic not found in gallery.";
    return;
  }

  await openComicFromLibraryEntry(entry);
}

function renderLibrary(items) {
  galleryEl.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    galleryEl.innerHTML = `<div style="color:#666;font-size:13px;">Library empty. Use Web Viewer to start a direct download.</div>`;
    return;
  }

  for (const c of items) {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.className = "cover";
    img.loading = "lazy";
    img.draggable = false;

    if (c.coverPath) {
      img.src = toAppFileUrl(c.coverPath);
    } else {
      img.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
          <rect width="100%" height="100%" fill="#f0f0f0"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#999" font-size="28" font-family="Arial">
            No cover
          </text>
        </svg>`);
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "title";
    if (c.favorite) {
      const favorite = document.createElement("span");
      favorite.className = "favorite-indicator";
      favorite.textContent = "★";
      title.appendChild(favorite);
    }
    const titleText = document.createElement("span");
    titleText.className = "title-text";
    titleText.textContent = c.title || c.id;
    title.appendChild(titleText);

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = [c.artist, fmtPages(c.pagesFound)].filter(Boolean).join(" • ");

    const tags = document.createElement("div");
    tags.className = "tags";
    if (Array.isArray(c.tags) && c.tags.length) {
      const list = c.tags.slice(0, 3);
      const more = c.tags.length - list.length;
      tags.textContent = `${list.join(", ")}${more > 0 ? ` +${more}` : ""}`;
    } else {
      tags.textContent = "No tags";
    }

    meta.appendChild(title);
    meta.appendChild(sub);
    meta.appendChild(tags);

    card.appendChild(img);
    card.appendChild(meta);

    card.addEventListener("click", async () => {
      await openComicFromLibraryEntry(c);
    });

    galleryEl.appendChild(card);
  }
}

async function loadLibrary() {
  const res = await window.api.listLibrary();

  if (!res?.ok) {
    if (res?.locked) {
      statusEl.textContent = "Vault locked. Unlock to load library.";
      showVaultModal("unlock");
      return;
    }
    statusEl.textContent = "Failed to load library.";
    return;
  }

  const items = res.items || [];
  statusEl.dataset.root = res.root || "-";
  libraryItems = items;
  buildTagOptions(items);
  buildLanguageOptions(items);
  applyFilters();
}

openBrowserBtn.addEventListener("click", () => window.api.openBrowser());
openDownloaderBtn.addEventListener("click", () => window.api.openDownloader());
refreshBtn.addEventListener("click", loadLibrary);
searchInput.addEventListener("input", applyFilters);
sortSelect.addEventListener("change", applyFilters);
languageFilterSelect?.addEventListener("change", applyFilters);

tagFilterBtn.addEventListener("click", openTagModal);
closeTagModalBtn.addEventListener("click", closeTagModal);
tagModalEl.addEventListener("click", (e) => {
  if (e.target === tagModalEl) closeTagModal();
});
tagSearchInput.addEventListener("input", renderTagList);
tagMatchAllToggle.addEventListener("change", () => {
  tagFilters.matchAll = tagMatchAllToggle.checked;
  updateTagModeLabel();
  buildTagOptions(libraryItems);
  applyFilters();
});
clearTagFiltersBtn.addEventListener("click", clearTagFilters);

tagFilterClearBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearTagFilters();
});

window.api.onLibraryChanged(() => loadLibrary());
window.api.onOpenComic?.(({ comicDir }) => {
  void openComicByDir(comicDir);
});
window.api.onSettingsUpdated?.((settings) => {
  if (!settings) return;
  applySettingsToUI(settings);
});

window.api.onDownloadCountChanged?.((payload) => {
  updateDownloaderBadge(payload?.count || 0);
});

async function initApp() {
  const activeDownloadCount = await window.api.getActiveDownloadCount?.();
  updateDownloaderBadge(activeDownloadCount?.count || 0);

  if (tagMatchAllToggle) {
    tagFilters.matchAll = tagMatchAllToggle.checked;
  }
  updateTagModeLabel();
  await loadSettings();
  await refreshVaultStatus();
  if (vaultState.initialized && vaultState.unlocked) {
    await loadLibrary();
  }
}

initApp();
