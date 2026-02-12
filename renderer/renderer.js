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
const settingsLibraryPathValueEl = $("settingsLibraryPathValue");
const openMoveLibraryModalBtn = $("openMoveLibraryModal");
const vaultStatusNote = $("vaultStatusNote");

const moveLibraryModalEl = $("moveLibraryModal");
const closeMoveLibraryModalBtn = $("closeMoveLibraryModal");
const cancelMoveLibraryBtn = $("cancelMoveLibrary");
const confirmMoveLibraryBtn = $("confirmMoveLibrary");
const moveLibraryCurrentPathInput = $("moveLibraryCurrentPath");
const moveLibraryCurrentSizeEl = $("moveLibraryCurrentSize");
const selectMoveLibraryPathBtn = $("selectMoveLibraryPath");
const moveLibrarySelectedPathInput = $("moveLibrarySelectedPath");
const moveLibraryPermissionCheckEl = $("moveLibraryPermissionCheck");
const moveLibraryEmptyCheckEl = $("moveLibraryEmptyCheck");
const moveLibrarySpaceCheckEl = $("moveLibrarySpaceCheck");
const moveLibraryErrorEl = $("moveLibraryError");
const moveLibraryProgressLabelEl = $("moveLibraryProgressLabel");
const moveLibraryProgressBarEl = $("moveLibraryProgressBar");

let settingsCache = {
  startPage: "",
  blockPopups: true,
  allowListEnabled: true,
  allowListDomains: ["*.cloudflare.com"],
  darkMode: false,
  defaultSort: "favorites",
  cardSize: "normal",
  libraryPath: "",
};

let libraryPathInfo = {
  configuredPath: "",
  activePath: "-",
  defaultPath: "-",
};

let moveLibraryState = {
  selectedPath: "",
  permissionOk: false,
  emptyFolderOk: false,
  freeSpaceOk: false,
  requiredBytes: 0,
  availableBytes: 0,
  checking: false,
  moving: false,
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

function toAppBlobUrl(filePath) {
  let p = String(filePath || "").replaceAll("\\", "/");

  if (/^[a-zA-Z]\//.test(p)) {
    p = p[0].toUpperCase() + ":/" + p.slice(2);
  }
  if (/^[a-zA-Z]:\//.test(p)) {
    p = p[0].toUpperCase() + p.slice(1);
  }

  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg).replaceAll("%3A", ":"))
    .join("/");

  return "appblob:///" + encoded;
}

function appBlobFetchOptions(signal) {
  const options = {
    cache: "no-store",
    credentials: "omit",
  };
  if (signal) options.signal = signal;
  return options;
}

const galleryCoverPlaceholder =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const galleryNoCoverSvg =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
          <rect width="100%" height="100%" fill="#f0f0f0"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#999" font-size="28" font-family="Arial">
            No cover
          </text>
        </svg>`);
const GALLERY_THUMB_MAX_SIZE = { width: 610, height: 813 };
const galleryThumbUrls = new Map();
let galleryThumbObserver = null;
const galleryCardByDir = new Map();

function releaseGalleryThumbs() {
  for (const url of galleryThumbUrls.values()) {
    URL.revokeObjectURL(url);
  }
  galleryThumbUrls.clear();
  if (galleryThumbObserver) {
    galleryThumbObserver.disconnect();
    galleryThumbObserver = null;
  }
}

function releaseGalleryThumb(img) {
  if (!img) return;
  const url = galleryThumbUrls.get(img);
  if (url) URL.revokeObjectURL(url);
  galleryThumbUrls.delete(img);
}

async function loadGalleryThumbnail(img) {
  if (!img || img.dataset.thumbLoaded === "1") return;
  if (img.dataset.thumbLoading === "1") return;
  const coverPath = img.dataset.coverPath;
  if (!coverPath) return;

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  img.dataset.thumbLoading = "1";
  let loaded = false;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const targetW = Math.max(
    1,
    Math.min(GALLERY_THUMB_MAX_SIZE.width, Math.round(rect.width * dpr)),
  );
  const targetH = Math.max(
    1,
    Math.min(GALLERY_THUMB_MAX_SIZE.height, Math.round(rect.height * dpr)),
  );

  try {
    let response;
    try {
      response = await fetch(toAppBlobUrl(coverPath), appBlobFetchOptions());
    } catch {
      img.dataset.thumbRetryAt = String(Date.now() + 2000);
      if (img.isConnected) ensureGalleryThumbObserver().observe(img);
      return;
    }

    if (!response.ok) {
      if (response.status === 401) showVaultModal("unlock");
      if (![401, 404].includes(response.status)) {
        img.dataset.thumbRetryAt = String(Date.now() + 2000);
        if (img.isConnected) ensureGalleryThumbObserver().observe(img);
      }
      return;
    }

    const sourceBlob = await response.blob();
    let bitmap;
    try {
      bitmap = await createImageBitmap(sourceBlob);
    } catch {
      img.dataset.thumbRetryAt = String(Date.now() + 2000);
      if (img.isConnected) ensureGalleryThumbObserver().observe(img);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
    if (!ctx) {
      img.dataset.thumbRetryAt = String(Date.now() + 2000);
      if (img.isConnected) ensureGalleryThumbObserver().observe(img);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const naturalW = bitmap.width;
    const naturalH = bitmap.height;
    const scale = Math.max(targetW / naturalW, targetH / naturalH);
    const srcW = Math.max(1, Math.round(targetW / scale));
    const srcH = Math.max(1, Math.round(targetH / scale));
    const srcX = Math.max(0, Math.round((naturalW - srcW) / 2));
    const srcY = Math.max(0, Math.round((naturalH - srcH) / 2));
    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
    if (bitmap.close) bitmap.close();

    const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!thumbBlob) {
      img.dataset.thumbRetryAt = String(Date.now() + 2000);
      if (img.isConnected) ensureGalleryThumbObserver().observe(img);
      return;
    }

    const objectUrl = URL.createObjectURL(thumbBlob);
    if (!img.isConnected) {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    galleryThumbUrls.set(img, objectUrl);
    img.src = objectUrl;
    img.dataset.thumbLoaded = "1";
    loaded = true;
    delete img.dataset.thumbRetryAt;
    if (galleryThumbObserver) {
      galleryThumbObserver.unobserve(img);
    }
  } finally {
    img.dataset.thumbLoading = "0";
    if (!loaded) {
      img.dataset.thumbLoaded = "0";
    }
  }
}

function ensureGalleryThumbObserver() {
  if (galleryThumbObserver) return galleryThumbObserver;
  galleryThumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        const retryAt = Number(img.dataset.thumbRetryAt || 0);
        if (retryAt && Date.now() < retryAt) continue;
        if (img.dataset.thumbLoaded === "1" || img.dataset.thumbLoading === "1") continue;
        void loadGalleryThumbnail(img);
      }
    },
    { root: null, rootMargin: "800px", threshold: 0.01 },
  );
  return galleryThumbObserver;
}

function initGalleryThumbnails(imgs = []) {
  if (!imgs.length) return;
  const observer = ensureGalleryThumbObserver();
  for (const img of imgs) {
    if (img.dataset.thumbLoaded === "1") continue;
    observer.observe(img);
  }
}


function fmtPages(found) {
  const f = Number(found) || 0;
  return `${f} pages`;
}

let currentComicDir = null;
let currentComicMeta = null;
let editTargetDir = null;
let editTargetMeta = null;
let galleryContextMenuEl = null;
let galleryContextMenuEntry = null;
let readerPageEls = [];
let readerScrollRaf = null;
let readerContextMenuEl = null;
let readerAutoScrollRaf = null;
let readerAutoScrollLastTs = 0;
let readerAutoScrollSpeed = 120;
let readerAutoScrollCarry = 0;
let readerAutoScrollEnabled = false;
const READER_AUTOSCROLL_MIN_SPEED = 80;
const READER_AUTOSCROLL_MAX_SPEED = 300;
let readerFitHeight = false;
let readerPageObserver = null;
let readerPageEvictObserver = null;
let readerResizeObserver = null;
let readerResizeRaf = null;
let readerScrollAlignTimer = null;
let readerScrollAlignRaf = null;
let readerScrollAlignAttempts = 0;
let readerPageMetrics = [];
const readerPageBlobUrls = new Map();
const readerPageAbortControllers = new Map();
const readerPageLoadedQueue = [];
const readerPagePlaceholder =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const READER_PAGE_EVICT_MARGIN_PX = 5000;
const READER_PAGE_MAX_LOADED = 60;
const READER_PAGE_MAX_WIDTH = 980;
const READER_PAGE_FIT_HEIGHT_PADDING_PX = 28;
const READER_PAGE_FALLBACK_ASPECT_RATIO = 1.45;
let libraryItems = [];
let tagFilters = {
  selected: new Set(),
  matchAll: false,
  counts: new Map(),
};
let languageOptions = [];
let libraryRenderGeneration = 0;
const LIBRARY_RENDER_BATCH_SIZE = 25;

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function createGalleryCard(entry) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.dir = entry.dir || "";

  const img = document.createElement("img");
  img.className = "cover";
  img.loading = "lazy";
  img.draggable = false;

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "title";

  const favorite = document.createElement("span");
  favorite.className = "favorite-indicator";
  favorite.textContent = "★";

  const titleText = document.createElement("span");
  titleText.className = "title-text";

  title.appendChild(favorite);
  title.appendChild(titleText);

  const sub = document.createElement("div");
  sub.className = "sub";

  const tags = document.createElement("div");
  tags.className = "tags";

  meta.appendChild(title);
  meta.appendChild(sub);
  meta.appendChild(tags);

  card.appendChild(img);
  card.appendChild(meta);

  card.addEventListener("click", async () => {
    const activeEntry = galleryCardByDir.get(card.dataset.dir || "")?.entry;
    if (activeEntry) await openComicFromLibraryEntry(activeEntry);
  });
  card.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const activeEntry = galleryCardByDir.get(card.dataset.dir || "")?.entry;
    if (activeEntry) showGalleryContextMenu(event.clientX, event.clientY, activeEntry);
  });

  return {
    card,
    img,
    favorite,
    titleText,
    sub,
    tags,
    entry,
  };
}

function updateGalleryCard(cardEntry, entry) {
  if (!cardEntry) return;
  const { card, img, favorite, titleText, sub, tags } = cardEntry;
  card.dataset.dir = entry.dir || "";
  cardEntry.entry = entry;

  favorite.style.display = entry.favorite ? "inline" : "none";
  titleText.textContent = entry.title || entry.id;
  sub.textContent = [entry.artist, fmtPages(entry.pagesFound)].filter(Boolean).join(" • ");
  if (Array.isArray(entry.tags) && entry.tags.length) {
    const list = entry.tags.slice(0, 3);
    const more = entry.tags.length - list.length;
    tags.textContent = `${list.join(", ")}${more > 0 ? ` +${more}` : ""}`;
  } else {
    tags.textContent = "No tags";
  }

  if (entry.coverPath) {
    if (img.dataset.coverPath !== entry.coverPath) {
      releaseGalleryThumb(img);
      img.dataset.thumbLoaded = "0";
      img.dataset.thumbLoading = "0";
      delete img.dataset.thumbRetryAt;
      img.src = galleryCoverPlaceholder;
    }
    img.dataset.coverPath = entry.coverPath;
  } else {
    if (img.dataset.coverPath) {
      releaseGalleryThumb(img);
    }
    delete img.dataset.coverPath;
    img.dataset.thumbLoaded = "0";
    img.dataset.thumbLoading = "0";
    delete img.dataset.thumbRetryAt;
    img.src = galleryNoCoverSvg;
  }
}

function pruneGalleryCards(items) {
  const validDirs = new Set((items || []).map((item) => item.dir));
  for (const [dir, cardEntry] of galleryCardByDir.entries()) {
    if (validDirs.has(dir)) continue;
    if (cardEntry.img && galleryThumbObserver) {
      galleryThumbObserver.unobserve(cardEntry.img);
    }
    releaseGalleryThumb(cardEntry.img);
    cardEntry.card.remove();
    galleryCardByDir.delete(dir);
  }
  if (galleryContextMenuEntry && !validDirs.has(galleryContextMenuEntry.dir)) {
    closeGalleryContextMenu();
  }
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
    case "artist-asc":
      sorted.sort((a, b) => {
        const artistDelta = normalizeText(a.artist).localeCompare(normalizeText(b.artist));
        if (artistDelta !== 0) return artistDelta;
        return normalizeText(a.title).localeCompare(normalizeText(b.title));
      });
      break;
    case "recent":
    default:
      sorted.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
      break;
  }
  return sorted;
}

function setLibraryStatus(shown, total, rendered = shown) {
  const renderedCount = Math.min(rendered, shown);
  statusEl.textContent = `${shown}/${total} manga matched • rendered ${renderedCount}/${shown}.\nLibrary folder: ${
    statusEl.dataset.root || "-"
  }`;
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function applyFilters() {
  // Filtering/sorting always runs against the full indexed libraryItems dataset.
  // Batched rendering only affects how quickly cards appear in the DOM.
  const queryTokens = tokenize(searchInput.value);
  const selectedTags = Array.from(tagFilters.selected).map(normalizeText);
  const matchAll = tagFilters.matchAll;
  const languageSelection = normalizeText(languageFilterSelect?.value || "");
  const filteredByTags = libraryItems.filter(
    (item) => matchesSearch(item, queryTokens) && matchesTags(item, selectedTags, matchAll),
  );
  const filtered = filteredByTags.filter((item) => matchesLanguage(item, languageSelection));
  const sorted = sortItems(filtered, sortSelect.value);
  setLibraryStatus(sorted.length, libraryItems.length, 0);
  void renderLibrary(sorted);
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
  updateModalScrollLocks();
  updateTagModeLabel();
  buildTagOptions(libraryItems);
  tagSearchInput?.focus();
}

function closeTagModal() {
  if (!tagModalEl) return;
  tagModalEl.style.display = "none";
  updateModalScrollLocks();
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

function isModalVisible(el) {
  return Boolean(el && el.style.display === "block");
}

function updateModalScrollLocks() {
  const modalOpen = [
    tagModalEl,
    settingsModalEl,
    moveLibraryModalEl,
    vaultModalEl,
    readerEl,
    editModalEl,
  ].some(isModalVisible);
  document.body.classList.toggle("modal-open", modalOpen);
  if (readerEl) {
    readerEl.classList.toggle("modal-locked", isModalVisible(editModalEl));
  }
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
  settingsCache.libraryPath = settingsCache.libraryPath || "";
  applyLibraryPathInfo();
  applyTheme(settingsCache.darkMode);
  applyDefaultSort(settingsCache.defaultSort);
  applyCardSize(settingsCache.cardSize);
  void validateStartPageInput();
}

function applyLibraryPathInfo() {
  if (!settingsLibraryPathValueEl) return;
  const activePath = String(libraryPathInfo.activePath || "").trim();
  const configuredPath = String(settingsCache.libraryPath || "").trim();
  const defaultPath = String(libraryPathInfo.defaultPath || "").trim();
  settingsLibraryPathValueEl.textContent = activePath || configuredPath || defaultPath || "-";
}

function normalizePathValue(value) {
  return String(value || "").trim().replace(/[\\/]+$/, "");
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  const decimals = idx === 0 ? 0 : size < 10 ? 2 : 1;
  return `${size.toFixed(decimals)} ${units[idx]}`;
}

function updateCheckRow(el, label, state, detail = "") {
  if (!el) return;
  const value = state === true ? "✓" : state === false ? "✕" : "–";
  el.innerHTML = "";
  const labelEl = document.createElement("td");
  labelEl.className = "moveLibraryCheckLabel";
  labelEl.textContent = label;
  const statusEl = document.createElement("td");
  statusEl.className = "moveLibraryCheckStatus";
  statusEl.textContent = value;
  const detailEl = document.createElement("td");
  detailEl.className = "moveLibraryCheckDetail";
  detailEl.textContent = detail;
  el.append(labelEl, statusEl, detailEl);
  el.classList.toggle("pass", state === true);
  el.classList.toggle("fail", state === false);
}

let moveLibraryCheckRunId = 0;

function setMoveProgress({ label = "", percent = 0, indeterminate = false } = {}) {
  if (moveLibraryProgressLabelEl) {
    moveLibraryProgressLabelEl.textContent = label;
  }
  if (moveLibraryProgressBarEl) {
    moveLibraryProgressBarEl.classList.toggle("is-indeterminate", Boolean(indeterminate));
    if (!indeterminate) {
      moveLibraryProgressBarEl.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    }
  }
}

function updateMoveLibraryModalUI() {
  if (!moveLibraryModalEl) return;
  const canMove = Boolean(
    moveLibraryState.selectedPath
      && moveLibraryState.permissionOk
      && moveLibraryState.emptyFolderOk
      && moveLibraryState.freeSpaceOk
      && !moveLibraryState.checking
      && !moveLibraryState.moving,
  );
  if (confirmMoveLibraryBtn) confirmMoveLibraryBtn.disabled = !canMove;
  if (selectMoveLibraryPathBtn) selectMoveLibraryPathBtn.disabled = moveLibraryState.checking || moveLibraryState.moving;
  if (cancelMoveLibraryBtn) cancelMoveLibraryBtn.disabled = moveLibraryState.moving;
  if (closeMoveLibraryModalBtn) closeMoveLibraryModalBtn.disabled = moveLibraryState.moving;
}

function resetMoveLibraryState() {
  moveLibraryCheckRunId += 1;
  moveLibraryState = {
    selectedPath: "",
    permissionOk: false,
    emptyFolderOk: false,
    freeSpaceOk: false,
    requiredBytes: 0,
    availableBytes: 0,
    checking: false,
    moving: false,
  };
  if (moveLibrarySelectedPathInput) moveLibrarySelectedPathInput.value = "";
  if (moveLibraryErrorEl) moveLibraryErrorEl.textContent = "";
  updateCheckRow(moveLibraryPermissionCheckEl, "Permission check", null, "Waiting for folder selection.");
  updateCheckRow(moveLibraryEmptyCheckEl, "Empty folder check", null, "Waiting for folder selection.");
  updateCheckRow(moveLibrarySpaceCheckEl, "Free space check", null, "Waiting for folder selection.");
  setMoveProgress({ label: "Waiting for checks.", percent: 0 });
  updateMoveLibraryModalUI();
}

async function runMoveChecks(selectedPath) {
  const checkRunId = moveLibraryCheckRunId + 1;
  moveLibraryCheckRunId = checkRunId;
  moveLibraryState.checking = true;
  moveLibraryState.selectedPath = selectedPath;
  moveLibraryState.permissionOk = false;
  moveLibraryState.emptyFolderOk = false;
  moveLibraryState.freeSpaceOk = false;
  if (moveLibraryErrorEl) moveLibraryErrorEl.textContent = "";
  if (moveLibrarySelectedPathInput) moveLibrarySelectedPathInput.value = selectedPath;
  updateCheckRow(moveLibraryPermissionCheckEl, "Permission check", null, "Checking folder permissions...");
  updateCheckRow(moveLibraryEmptyCheckEl, "Empty folder check", null, "Checking folder contents...");
  updateCheckRow(moveLibrarySpaceCheckEl, "Free space check", null, "Checking free space...");
  updateMoveLibraryModalUI();

  let res;
  try {
    res = await window.api.validateLibraryMoveTarget?.({ toPath: selectedPath });
  } catch (err) {
    if (checkRunId !== moveLibraryCheckRunId) return;
    moveLibraryState.checking = false;
    moveLibraryState.permissionOk = false;
    moveLibraryState.emptyFolderOk = false;
    moveLibraryState.freeSpaceOk = false;
    updateCheckRow(moveLibraryPermissionCheckEl, "Permission check", false, "Validation failed.");
    updateCheckRow(moveLibraryEmptyCheckEl, "Empty folder check", false, "Validation failed.");
    updateCheckRow(moveLibrarySpaceCheckEl, "Free space check", false, "Validation failed.");
    if (moveLibraryErrorEl) {
      moveLibraryErrorEl.textContent = `Could not validate the selected folder: ${String(err)}`;
    }
    setMoveProgress({ label: "Checks failed.", percent: 0 });
    updateMoveLibraryModalUI();
    return;
  }

  if (checkRunId !== moveLibraryCheckRunId) return;
  moveLibraryState.checking = false;
  if (!res?.ok) {
    moveLibraryState.permissionOk = false;
    moveLibraryState.emptyFolderOk = false;
    moveLibraryState.freeSpaceOk = false;
    updateCheckRow(
      moveLibraryPermissionCheckEl,
      "Permission check",
      false,
      res?.permissionMessage || "Could not validate this folder.",
    );
    updateCheckRow(
      moveLibraryEmptyCheckEl,
      "Empty folder check",
      false,
      res?.emptyFolderMessage || "Could not validate this folder.",
    );
    updateCheckRow(
      moveLibrarySpaceCheckEl,
      "Free space check",
      false,
      res?.freeSpaceMessage || "Unable to verify available space.",
    );
    if (moveLibraryErrorEl) moveLibraryErrorEl.textContent = "";
    setMoveProgress({ label: "Checks failed.", percent: 0 });
    updateMoveLibraryModalUI();
    return;
  }

  moveLibraryState.permissionOk = Boolean(res.permissionOk);
  moveLibraryState.emptyFolderOk = Boolean(res.emptyFolderOk);
  moveLibraryState.freeSpaceOk = Boolean(res.freeSpaceOk);
  moveLibraryState.requiredBytes = Number(res.requiredBytes || 0);
  moveLibraryState.availableBytes = Number(res.availableBytes || 0);
  const permissionDetail = res.permissionMessage || (moveLibraryState.permissionOk
    ? "Selected folder is writable."
    : "Selected folder is not writable.");
  updateCheckRow(
    moveLibraryPermissionCheckEl,
    "Permission check",
    moveLibraryState.permissionOk,
    permissionDetail,
  );

  const emptyFolderDetail = res.emptyFolderMessage || (moveLibraryState.emptyFolderOk
    ? "Destination folder is empty."
    : "Destination folder is not empty.");
  updateCheckRow(
    moveLibraryEmptyCheckEl,
    "Empty folder check",
    moveLibraryState.emptyFolderOk,
    emptyFolderDetail,
  );

  const required = formatBytes(moveLibraryState.requiredBytes);
  const available = formatBytes(moveLibraryState.availableBytes);
  const freeSpaceDetail = res.freeSpaceMessage || (moveLibraryState.freeSpaceOk
    ? `Enough free space (${available} available).`
    : `Not enough free space (${required} required, ${available} available).`);
  updateCheckRow(
    moveLibrarySpaceCheckEl,
    "Free space check",
    moveLibraryState.freeSpaceOk,
    freeSpaceDetail,
  );

  if (!moveLibraryState.permissionOk || !moveLibraryState.emptyFolderOk || !moveLibraryState.freeSpaceOk) {
    if (moveLibraryErrorEl) moveLibraryErrorEl.textContent = "";
    setMoveProgress({ label: "Checks failed.", percent: 0 });
  } else {
    setMoveProgress({ label: "Ready to move.", percent: 0 });
  }
  updateMoveLibraryModalUI();
}

async function loadLibraryPathInfo() {
  const res = await window.api.getLibraryPathInfo?.();
  if (!res?.ok) return;
  libraryPathInfo = {
    configuredPath: res.configuredPath || "",
    activePath: res.activePath || "-",
    defaultPath: res.defaultPath || "-",
  };
  if (!settingsCache.libraryPath) {
    settingsCache.libraryPath = libraryPathInfo.configuredPath || "";
  }
  applyLibraryPathInfo();
}

async function loadSettings() {
  const res = await window.api.getSettings();
  if (!res?.ok) return;
  applySettingsToUI(res.settings || settingsCache);
  await loadLibraryPathInfo();
  updateVaultSettingsUI();
}

async function notifyLibraryMoveCompleted(migration) {
  if (!migration?.attempted || !migration?.moved || !migration?.fromRoot) return;
  const skippedSymlinks = Number(migration.skippedSymlinks || 0);
  const symlinkNote = skippedSymlinks > 0
    ? `\n\nSkipped symbolic links: ${skippedSymlinks.toLocaleString()} (not migrated).`
    : "";
  window.alert(
    `Library move completed.\n\nMoved ${Number(migration.copiedFiles || 0).toLocaleString()} files (${formatBytes(migration.totalBytes || 0)}).${symlinkNote}`,
  );
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
  updateModalScrollLocks();
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
  updateModalScrollLocks();
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

function releaseReaderPageBlobs() {
  for (const controller of readerPageAbortControllers.values()) {
    controller.abort();
  }
  readerPageAbortControllers.clear();
  for (const url of readerPageBlobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  readerPageBlobUrls.clear();
  readerPageLoadedQueue.length = 0;
  if (readerPageObserver) {
    readerPageObserver.disconnect();
    readerPageObserver = null;
  }
  if (readerPageEvictObserver) {
    readerPageEvictObserver.disconnect();
    readerPageEvictObserver = null;
  }
  if (readerResizeObserver) {
    readerResizeObserver.disconnect();
    readerResizeObserver = null;
  }
  if (readerResizeRaf) {
    window.cancelAnimationFrame(readerResizeRaf);
    readerResizeRaf = null;
  }
  if (readerScrollAlignTimer) {
    window.clearTimeout(readerScrollAlignTimer);
    readerScrollAlignTimer = null;
  }
  if (readerScrollAlignRaf) {
    window.cancelAnimationFrame(readerScrollAlignRaf);
    readerScrollAlignRaf = null;
  }
  readerScrollAlignAttempts = 0;
}

function isReaderPageFarFromViewport(img) {
  if (!pagesEl) return true;
  const containerRect = pagesEl.getBoundingClientRect();
  const rect = img.getBoundingClientRect();
  return (
    rect.bottom < containerRect.top - READER_PAGE_EVICT_MARGIN_PX ||
    rect.top > containerRect.bottom + READER_PAGE_EVICT_MARGIN_PX
  );
}

function removeReaderPageFromQueue(img) {
  const idx = readerPageLoadedQueue.indexOf(img);
  if (idx >= 0) readerPageLoadedQueue.splice(idx, 1);
}

function getReaderContentSize() {
  if (!pagesEl) return { width: 0, height: 0 };
  const styles = window.getComputedStyle(pagesEl);
  const paddingX =
    (Number.parseFloat(styles.paddingLeft) || 0) +
    (Number.parseFloat(styles.paddingRight) || 0);
  const paddingY =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0);
  return {
    width: Math.max(0, pagesEl.clientWidth - paddingX),
    height: Math.max(0, pagesEl.clientHeight - paddingY),
  };
}

function getReaderPageNaturalSize(img) {
  if (!img) return null;
  const naturalWidth = Number(img.dataset.naturalWidth || img.naturalWidth || 0);
  const naturalHeight = Number(img.dataset.naturalHeight || img.naturalHeight || 0);
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) return null;
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;
  return { naturalWidth, naturalHeight };
}

function computeReaderPageHeight(img) {
  const natural = getReaderPageNaturalSize(img);
  if (!natural) return 0;
  const { width: contentWidth, height: contentHeight } = getReaderContentSize();
  if (contentWidth <= 0 || contentHeight <= 0) return 0;
  const { naturalWidth, naturalHeight } = natural;
  if (readerFitHeight) {
    const maxWidth = contentWidth;
    const maxHeight = Math.max(0, contentHeight - READER_PAGE_FIT_HEIGHT_PADDING_PX);
    const scale = Math.min(
      1,
      maxWidth / naturalWidth,
      maxHeight / naturalHeight,
    );
    return Math.round(naturalHeight * scale);
  }
  const maxWidth = Math.min(contentWidth, READER_PAGE_MAX_WIDTH);
  const scale = Math.min(1, maxWidth / naturalWidth);
  return Math.round(naturalHeight * scale);
}

function setReaderPageMinHeight(img) {
  if (!img) return;
  let height = computeReaderPageHeight(img);
  if (!height) {
    const rect = img.getBoundingClientRect();
    height = Math.round(rect.height || 0);
  }
  if (height > 1) {
    img.dataset.pageHeight = String(height);
    img.style.minHeight = `${height}px`;
  }
}

function applyReaderPageMinHeight(img) {
  if (!img) return;
  const height =
    computeReaderPageHeight(img) || Number(img.dataset.pageHeight || 0);
  if (Number.isFinite(height) && height > 1) {
    img.style.minHeight = `${height}px`;
  }
}

function updateReaderPageHeights() {
  if (readerEl.style.display !== "block") return;
  if (!readerPageEls.length) return;
  for (const img of readerPageEls) {
    if (img.dataset.blobLoaded === "1") {
      setReaderPageMinHeight(img);
    } else {
      applyReaderPageMinHeight(img);
    }
  }
  rebuildReaderPageMetrics();
}

function scheduleReaderPageResize() {
  if (readerResizeRaf) return;
  readerResizeRaf = window.requestAnimationFrame(() => {
    readerResizeRaf = null;
    updateReaderPageHeights();
  });
}

function evictReaderPageBlob(img) {
  if (!img || img.dataset.blobLoaded !== "1") return;
  setReaderPageMinHeight(img);
  const controller = readerPageAbortControllers.get(img);
  if (controller) {
    controller.abort();
    readerPageAbortControllers.delete(img);
  }
  const url = readerPageBlobUrls.get(img);
  if (url) {
    URL.revokeObjectURL(url);
    readerPageBlobUrls.delete(img);
  }
  removeReaderPageFromQueue(img);
  img.dataset.blobLoaded = "0";
  img.src = readerPagePlaceholder;
  applyReaderPageMinHeight(img);
  rebuildReaderPageMetrics();
  if (readerPageObserver) {
    readerPageObserver.observe(img);
  }
}

function trimReaderPageCache() {
  if (readerPageLoadedQueue.length <= READER_PAGE_MAX_LOADED) return;
  let remaining = readerPageLoadedQueue.length;
  while (readerPageLoadedQueue.length > READER_PAGE_MAX_LOADED && remaining > 0) {
    const candidate = readerPageLoadedQueue[0];
    if (!candidate) {
      readerPageLoadedQueue.shift();
      remaining -= 1;
      continue;
    }
    if (!isReaderPageFarFromViewport(candidate)) {
      readerPageLoadedQueue.push(readerPageLoadedQueue.shift());
      remaining -= 1;
      continue;
    }
    evictReaderPageBlob(candidate);
    remaining -= 1;
  }
}

async function loadReaderPageBlob(img) {
  if (!img || img.dataset.blobLoaded === "1") return;
  const pagePath = img.dataset.pagePath;
  if (!pagePath) return;

  img.dataset.blobLoaded = "1";
  const controller = new AbortController();
  readerPageAbortControllers.set(img, controller);
  let response;
  try {
    response = await fetch(toAppBlobUrl(pagePath), appBlobFetchOptions(controller.signal));
  } catch {
    img.dataset.blobLoaded = "0";
    readerPageAbortControllers.delete(img);
    return;
  }
  readerPageAbortControllers.delete(img);

  if (!response.ok) {
    img.dataset.blobLoaded = "0";
    if (response.status === 401) showVaultModal("unlock");
    return;
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (!img.isConnected || img.dataset.blobLoaded !== "1") {
    URL.revokeObjectURL(objectUrl);
    return;
  }

  readerPageBlobUrls.set(img, objectUrl);
  removeReaderPageFromQueue(img);
  readerPageLoadedQueue.push(img);
  img.addEventListener(
    "load",
    () => {
      if (img.dataset.blobLoaded !== "1") return;
      img.dataset.naturalWidth = String(img.naturalWidth || 0);
      img.dataset.naturalHeight = String(img.naturalHeight || 0);
      window.requestAnimationFrame(() => {
        setReaderPageMinHeight(img);
        rebuildReaderPageMetrics();
      });
    },
    { once: true },
  );
  img.src = objectUrl;
  trimReaderPageCache();
}

function initReaderPageObserver() {
  if (readerPageObserver) readerPageObserver.disconnect();
  readerPageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        readerPageObserver.unobserve(img);
        void loadReaderPageBlob(img);
      }
    },
    { root: pagesEl, rootMargin: "800px", threshold: 0.01 },
  );
  if (readerPageEvictObserver) readerPageEvictObserver.disconnect();
  readerPageEvictObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) continue;
        const img = entry.target;
        if (img.dataset.blobLoaded !== "1") continue;
        evictReaderPageBlob(img);
      }
    },
    {
      root: pagesEl,
      rootMargin: `${READER_PAGE_EVICT_MARGIN_PX}px`,
      threshold: 0.01,
    },
  );
  for (const img of readerPageEls) {
    readerPageObserver.observe(img);
    readerPageEvictObserver.observe(img);
  }
}

function initReaderResizeObserver() {
  if (readerResizeObserver) readerResizeObserver.disconnect();
  if (!pagesEl) return;
  readerResizeObserver = new ResizeObserver(() => {
    scheduleReaderPageResize();
  });
  readerResizeObserver.observe(pagesEl);
}

function openReader({ title, comicDir, pages }) {
  releaseReaderPageBlobs();
  currentComicDir = comicDir;
  readerTitleEl.textContent = title || "Reader";
  pagesEl.innerHTML = "";
  readerEl.classList.toggle("fit-height", readerFitHeight);
  updateFavoriteToggle(currentComicMeta?.favorite);
  readerEl.style.display = "block";
  updateModalScrollLocks();

  // Vertical scroll reader, lazy-load
  for (const p of pages) {
    const img = document.createElement("img");
    img.className = "page";
    img.loading = "lazy";
    img.draggable = false;
    img.src = readerPagePlaceholder;
    img.dataset.blobLoaded = "0";
    img.dataset.pagePath = p.path;
    img.alt = p.name;
    pagesEl.appendChild(img);
  }

  readerPageEls = Array.from(pagesEl.querySelectorAll(".page"));
  populateReaderJump(pages);
  rebuildReaderPageMetrics();
  updateReaderPageSelect();
  initReaderPageObserver();
  initReaderResizeObserver();
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
      for (const img of readerPageEls) {
        if (img.dataset.blobLoaded === "1") {
          setReaderPageMinHeight(img);
        } else {
          applyReaderPageMinHeight(img);
        }
      }
      rebuildReaderPageMetrics();
      scrollToPage(targetIndex, "auto");
    });
  }
}

function closeReader() {
  stopReaderAutoScroll();
  closeReaderContextMenu();
  readerEl.style.display = "none";
  pagesEl.innerHTML = "";
  currentComicDir = null;
  currentComicMeta = null;
  readerPageEls = [];
  readerPageMetrics = [];
  readerPageSelect.innerHTML = "";
  readerScrollAlignAttempts = 0;
  releaseReaderPageBlobs();
  closeEditModal();
  updateModalScrollLocks();
}

async function closeReaderAndWait() {
  closeReader();
  await new Promise((resolve) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
  );
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

pagesEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  showReaderContextMenu(event.clientX, event.clientY);
});

function maybeStopReaderAutoScrollOnInteraction(event) {
  if (!readerAutoScrollEnabled) return;
  if (!event.isTrusted) return;
  if (!pagesEl.contains(event.target)) return;
  stopReaderAutoScroll();
}

pagesEl.addEventListener("wheel", maybeStopReaderAutoScrollOnInteraction, { passive: true });
pagesEl.addEventListener("touchstart", maybeStopReaderAutoScrollOnInteraction, { passive: true });
pagesEl.addEventListener("pointerdown", maybeStopReaderAutoScrollOnInteraction);

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

function getReaderPageVerticalGap() {
  const sample = readerPageEls[0];
  if (!sample) return 0;
  const styles = window.getComputedStyle(sample);
  return Number.parseFloat(styles.marginBottom) || 0;
}

function estimateReaderPageHeight(img, fallbackHeight) {
  if (!img) return fallbackHeight;
  const measuredHeight = Math.round(img.offsetHeight || 0);
  if (measuredHeight > 1) return measuredHeight;
  const cachedHeight = Number(img.dataset.pageHeight || 0);
  if (Number.isFinite(cachedHeight) && cachedHeight > 1) return Math.round(cachedHeight);
  const computedHeight = computeReaderPageHeight(img);
  if (computedHeight > 1) return computedHeight;
  return fallbackHeight;
}

function rebuildReaderPageMetrics() {
  if (!readerPageEls.length) {
    readerPageMetrics = [];
    return;
  }

  const { width: contentWidth, height: contentHeight } = getReaderContentSize();
  const fallbackHeight = Math.max(
    80,
    Math.round(
      readerFitHeight
        ? Math.max(0, contentHeight - READER_PAGE_FIT_HEIGHT_PADDING_PX)
        : Math.min(contentWidth || READER_PAGE_MAX_WIDTH, READER_PAGE_MAX_WIDTH) *
            READER_PAGE_FALLBACK_ASPECT_RATIO,
    ),
  );

  let sum = 0;
  let count = 0;
  for (const img of readerPageEls) {
    const knownHeight = Number(img.dataset.pageHeight || 0);
    if (Number.isFinite(knownHeight) && knownHeight > 1) {
      sum += knownHeight;
      count += 1;
    }
  }
  const averageKnownHeight = count > 0 ? Math.round(sum / count) : fallbackHeight;
  const gap = getReaderPageVerticalGap();
  const paddingTop = getReaderScrollPaddingTop();
  const metrics = [];
  let top = paddingTop;
  for (let i = 0; i < readerPageEls.length; i += 1) {
    const pageEl = readerPageEls[i];
    const height = estimateReaderPageHeight(pageEl, averageKnownHeight || fallbackHeight);
    metrics.push({ top, height, bottom: top + height });
    top += height + gap;
  }
  readerPageMetrics = metrics;
}

function getPageOffsetTop(pageEl) {
  if (!pagesEl || !pageEl) return 0;
  const index = readerPageEls.indexOf(pageEl);
  if (index < 0) return 0;
  const metric = readerPageMetrics[index];
  if (metric) return metric.top;
  rebuildReaderPageMetrics();
  return readerPageMetrics[index]?.top || 0;
}

function scrollToPage(index, behavior = "smooth") {
  if (!readerPageEls.length) return;
  const clamped = Math.max(0, Math.min(index, readerPageEls.length - 1));
  const target = readerPageEls[clamped];
  if (!target) return;
  rebuildReaderPageMetrics();
  const paddingTop = getReaderScrollPaddingTop();
  const targetTop = Math.max(0, getPageOffsetTop(target) - paddingTop);
  pagesEl.scrollTo({ top: targetTop, behavior });
  if (behavior === "smooth") {
    readerScrollAlignAttempts = 0;
    scheduleReaderScrollAlignment(clamped);
  }
}

function scheduleReaderScrollAlignment(index) {
  if (!pagesEl) return;
  if (readerScrollAlignTimer) {
    window.clearTimeout(readerScrollAlignTimer);
    readerScrollAlignTimer = null;
  }
  if (readerScrollAlignRaf) {
    window.cancelAnimationFrame(readerScrollAlignRaf);
    readerScrollAlignRaf = null;
  }

  // During smooth scrolling, virtualized page load/evict can shift layout.
  // Re-align a few times while the animation settles.
  readerScrollAlignTimer = window.setTimeout(() => {
    readerScrollAlignTimer = null;
    readerScrollAlignRaf = window.requestAnimationFrame(() => {
      readerScrollAlignRaf = null;
      alignReaderPageToTop(index);
      readerScrollAlignAttempts += 1;
      if (readerScrollAlignAttempts < 3) {
        scheduleReaderScrollAlignment(index);
      }
    });
  }, 180);
}

function alignReaderPageToTop(index) {
  if (!pagesEl || !readerPageEls.length) return;
  rebuildReaderPageMetrics();
  const clamped = Math.max(0, Math.min(index, readerPageEls.length - 1));
  const target = readerPageEls[clamped];
  if (!target) return;
  const paddingTop = getReaderScrollPaddingTop();
  const targetTop = Math.max(0, getPageOffsetTop(target) - paddingTop);
  if (Math.abs(pagesEl.scrollTop - targetTop) <= 2) return;
  pagesEl.scrollTo({ top: targetTop, behavior: "auto" });
}

function getCurrentPageIndex() {
  if (!readerPageEls.length) return -1;
  rebuildReaderPageMetrics();
  const paddingTop = getReaderScrollPaddingTop();
  if (pagesEl.scrollTop <= paddingTop + 1) return 0;
  const viewTop = pagesEl.scrollTop + paddingTop + 1;
  let left = 0;
  let right = readerPageMetrics.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const metric = readerPageMetrics[mid];
    if (!metric) break;
    if (viewTop <= metric.bottom) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return Math.max(0, Math.min(left, readerPageEls.length - 1));
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
  scrollToPage(nextIndex, readerAutoScrollEnabled ? "auto" : "smooth");
});

document.addEventListener("keydown", (event) => {
  if (readerEl.style.display !== "block") return;
  if (isEditableTarget(event.target)) return;
  if (event.key?.toLowerCase() !== "f") return;
  event.preventDefault();
  toggleReaderFitHeight();
});

openFolderBtn.addEventListener("click", async () => {
  const targetDir = editTargetDir || currentComicDir;
  if (!targetDir) return;
  await window.api.showInFolder(targetDir);
});

function openEditModal(targetMeta = currentComicMeta, targetDir = currentComicDir) {
  if (!targetMeta || !targetDir) return;
  editTargetDir = targetDir;
  editTargetMeta = targetMeta;
  editTitleInput.value = targetMeta.title || "";
  editAuthorInput.value = targetMeta.artist || "";
  editLanguagesInput.value = Array.isArray(targetMeta.languages)
    ? targetMeta.languages.join(", ")
    : "";
  editTagsInput.value = Array.isArray(targetMeta.tags) ? targetMeta.tags.join(", ") : "";
  editModalEl.style.display = "block";
  updateModalScrollLocks();
}

function closeEditModal() {
  editModalEl.style.display = "none";
  editTargetDir = null;
  editTargetMeta = null;
  updateModalScrollLocks();
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
  if (!editTargetDir) return;
  const payload = {
    title: editTitleInput.value.trim(),
    author: editAuthorInput.value.trim(),
    languages: editLanguagesInput.value,
    tags: editTagsInput.value,
  };
  const res = await window.api.updateComicMeta(editTargetDir, payload);
  if (res?.ok) {
    closeEditModal();
    await loadLibrary();
    if (editTargetDir === currentComicDir) {
      const updatedTitle = res.entry?.title || payload.title || readerTitleEl.textContent;
      readerTitleEl.textContent = updatedTitle;
      currentComicMeta = res.entry || currentComicMeta;
      updateFavoriteToggle(currentComicMeta?.favorite);
    }
    if (res.entry?.dir || editTargetDir) {
      const entryDir = res.entry?.dir || editTargetDir;
      libraryItems = libraryItems.map((item) =>
        item.dir === entryDir ? { ...item, ...res.entry } : item,
      );
    }
  }
});

deleteComicBtn.addEventListener("click", async () => {
  if (!editTargetDir) return;
  const targetDir = editTargetDir;
  const confirmDelete = window.confirm(
    `Delete this manga permanently?\n\n${editTargetMeta?.title || "Untitled manga"}`,
  );
  if (!confirmDelete) return;
  if (currentComicDir === targetDir) {
    await closeReaderAndWait();
  } else {
    closeEditModal();
  }
  const res = await window.api.deleteComic(targetDir);
  if (res?.ok) {
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
  updateModalScrollLocks();
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
  updateModalScrollLocks();
});

settingsModalEl.addEventListener("click", (e) => {
  if (e.target === settingsModalEl) {
    settingsModalEl.style.display = "none";
    updateModalScrollLocks();
  }
});

settingsStartPageInput?.addEventListener("input", () => {
  void validateStartPageInput();
});

openMoveLibraryModalBtn?.addEventListener("click", async () => {
  const stats = await window.api.getCurrentLibraryStats?.();
  if (moveLibraryCurrentPathInput) {
    moveLibraryCurrentPathInput.value = stats?.activePath || libraryPathInfo.activePath || "";
  }
  if (moveLibraryCurrentSizeEl) {
    const totalBytes = Number(stats?.totalBytes || 0);
    moveLibraryCurrentSizeEl.textContent = `Size: ${formatBytes(totalBytes)} • Files: ${Number(stats?.fileCount || 0).toLocaleString()}`;
  }
  resetMoveLibraryState();
  moveLibraryModalEl.style.display = "block";
  updateModalScrollLocks();
});

function closeMoveLibraryModal() {
  if (moveLibraryState.moving) return;
  moveLibraryModalEl.style.display = "none";
  updateModalScrollLocks();
}

closeMoveLibraryModalBtn?.addEventListener("click", closeMoveLibraryModal);
cancelMoveLibraryBtn?.addEventListener("click", closeMoveLibraryModal);

moveLibraryModalEl?.addEventListener("click", (event) => {
  if (event.target === moveLibraryModalEl) {
    closeMoveLibraryModal();
  }
});

selectMoveLibraryPathBtn?.addEventListener("click", async () => {
  const currentPath = libraryPathInfo.activePath || settingsCache.libraryPath || "";
  const res = await window.api.chooseLibraryPath?.({ currentPath });
  if (!res?.path) {
    if (res?.error && moveLibraryErrorEl) {
      moveLibraryErrorEl.textContent = res.error;
    }
    return;
  }
  await runMoveChecks(res.path);
});

confirmMoveLibraryBtn?.addEventListener("click", async () => {
  if (!moveLibraryState.permissionOk || !moveLibraryState.emptyFolderOk || !moveLibraryState.freeSpaceOk || !moveLibraryState.selectedPath) {
    return;
  }
  moveLibraryState.moving = true;
  updateMoveLibraryModalUI();
  setMoveProgress({ label: "Preparing move…", percent: 0 });
  if (moveLibraryErrorEl) moveLibraryErrorEl.textContent = "";

  const res = await window.api.updateSettings({
    libraryPath: moveLibraryState.selectedPath,
    moveLibraryContent: true,
  });

  moveLibraryState.moving = false;
  if (res?.ok) {
    setMoveProgress({ label: "Move completed.", percent: 100 });
    settingsCache = res.settings || settingsCache;
    if (res.warning) {
      window.alert(res.warning);
    }
    await notifyLibraryMoveCompleted(res.migration);
    await loadLibraryPathInfo();
    await loadLibrary();
    applyLibraryPathInfo();
    setTimeout(() => {
      closeMoveLibraryModal();
    }, 350);
  } else {
    setMoveProgress({ label: "Move failed.", percent: 0 });
    if (moveLibraryErrorEl) {
      moveLibraryErrorEl.textContent = res?.error || "Failed to move library.";
    }
  }
  updateMoveLibraryModalUI();
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
    libraryPath: settingsCache.libraryPath || "",
  };
  const res = await window.api.updateSettings(payload);
  if (res?.ok) {
    if (res.warning) {
      window.alert(res.warning);
    }
    settingsCache = res.settings || settingsCache;
    applyTheme(settingsCache.darkMode);
    applyDefaultSort(settingsCache.defaultSort);
    applyCardSize(settingsCache.cardSize);
    await loadLibraryPathInfo();
    await notifyLibraryMoveCompleted(res.migration);
    applyFilters();
    settingsModalEl.style.display = "none";
    updateModalScrollLocks();
  } else if (res?.error) {
    const guidance = res?.migration?.partial && res?.migration?.guidance
      ? `\n\n${res.migration.guidance}`
      : "";
    window.alert(`${res.error}${guidance}`);
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
    statusEl.textContent = "Downloaded manga not found in gallery.";
    return;
  }

  await openComicFromLibraryEntry(entry);
}

function ensureGalleryContextMenu() {
  if (galleryContextMenuEl) return galleryContextMenuEl;
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");
  menu.style.display = "none";
  menu.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const entry = galleryContextMenuEntry;
    closeGalleryContextMenu();
    if (!entry) return;
    if (action === "favorite") {
      await toggleFavoriteForEntry(entry);
      return;
    }
    if (action === "edit") {
      openEditModal(entry, entry.dir);
      return;
    }
    if (action === "delete") {
      await deleteComicEntry(entry);
    }
  });
  document.body.appendChild(menu);
  galleryContextMenuEl = menu;
  return menu;
}

function closeGalleryContextMenu() {
  if (!galleryContextMenuEl) return;
  galleryContextMenuEl.style.display = "none";
  galleryContextMenuEl.innerHTML = "";
  galleryContextMenuEntry = null;
}

function setReaderAutoScrollState(active) {
  readerAutoScrollEnabled = Boolean(active);
  if (!readerAutoScrollEnabled) {
    if (readerAutoScrollRaf) {
      window.cancelAnimationFrame(readerAutoScrollRaf);
      readerAutoScrollRaf = null;
    }
    readerAutoScrollLastTs = 0;
    readerAutoScrollCarry = 0;
  }
  const toggleBtn = readerContextMenuEl?.querySelector('[data-action="reader-autoscroll-toggle"]');
  const toggleBtnLabel = readerContextMenuEl?.querySelector(
    '[data-role="reader-autoscroll-toggle-label"]',
  );
  if (toggleBtn) {
    toggleBtn.setAttribute(
      "aria-label",
      readerAutoScrollEnabled ? "Stop auto-scroll" : "Start auto-scroll",
    );
  }
  if (toggleBtnLabel) {
    toggleBtnLabel.textContent = readerAutoScrollEnabled ? "Stop auto-scroll" : "Start auto-scroll";
  }
}

function runReaderAutoScroll(timestamp) {
  if (!readerAutoScrollEnabled || readerEl.style.display !== "block") {
    setReaderAutoScrollState(false);
    return;
  }
  const maxScrollTop = Math.max(0, pagesEl.scrollHeight - pagesEl.clientHeight);
  if (maxScrollTop <= 0) {
    setReaderAutoScrollState(false);
    return;
  }
  if (!readerAutoScrollLastTs) {
    readerAutoScrollLastTs = timestamp;
  }
  const deltaSeconds = Math.max(0, Math.min(0.1, (timestamp - readerAutoScrollLastTs) / 1000));
  readerAutoScrollLastTs = timestamp;
  const rawDelta = readerAutoScrollSpeed * deltaSeconds + readerAutoScrollCarry;
  const step = Math.trunc(rawDelta);
  readerAutoScrollCarry = rawDelta - step;
  const appliedDelta = step > 0 ? step : 0;
  const nextTop = Math.min(maxScrollTop, pagesEl.scrollTop + appliedDelta);
  if (appliedDelta > 0) {
    pagesEl.scrollTop = nextTop;
  }
  if (nextTop >= maxScrollTop - 1) {
    setReaderAutoScrollState(false);
    return;
  }
  readerAutoScrollRaf = window.requestAnimationFrame(runReaderAutoScroll);
}

function startReaderAutoScroll() {
  if (readerEl.style.display !== "block") return;
  if (readerAutoScrollEnabled) return;
  setReaderAutoScrollState(true);
  readerAutoScrollRaf = window.requestAnimationFrame(runReaderAutoScroll);
}

function stopReaderAutoScroll() {
  setReaderAutoScrollState(false);
}

function ensureReaderContextMenu() {
  if (readerContextMenuEl) return readerContextMenuEl;
  const menu = document.createElement("div");
  menu.className = "context-menu reader-context-menu";
  menu.setAttribute("role", "menu");
  menu.style.display = "none";
  menu.innerHTML = `
    <div class="reader-menu-row">
      <label class="reader-menu-label" for="readerAutoScrollSpeed">Auto-scroll speed</label>
      <span class="reader-menu-speed" data-role="reader-autoscroll-speed-label">${readerAutoScrollSpeed}px/s</span>
    </div>
    <input
      id="readerAutoScrollSpeed"
      class="reader-menu-range"
      data-role="reader-autoscroll-speed"
      type="range"
      min="${READER_AUTOSCROLL_MIN_SPEED}"
      max="${READER_AUTOSCROLL_MAX_SPEED}"
      step="10"
      value="${readerAutoScrollSpeed}"
      aria-label="Auto-scroll speed"
    />
    <button class="menu-item reader-menu-item-start" type="button" data-action="reader-autoscroll-toggle" aria-label="Start auto-scroll">
      <span class="icon icon-play" aria-hidden="true"></span>
      <span data-role="reader-autoscroll-toggle-label">Start auto-scroll</span>
    </button>
  `;
  const speedInput = menu.querySelector('[data-role="reader-autoscroll-speed"]');
  const speedLabel = menu.querySelector('[data-role="reader-autoscroll-speed-label"]');

  speedInput?.addEventListener("input", () => {
    const nextSpeed = Number(speedInput.value);
    if (!Number.isFinite(nextSpeed)) return;
    readerAutoScrollSpeed = Math.max(
      READER_AUTOSCROLL_MIN_SPEED,
      Math.min(READER_AUTOSCROLL_MAX_SPEED, nextSpeed),
    );
    if (speedLabel) speedLabel.textContent = `${readerAutoScrollSpeed}px/s`;
  });

  menu.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) return;
    if (target.dataset.action !== "reader-autoscroll-toggle") return;
    if (readerAutoScrollEnabled) {
      stopReaderAutoScroll();
      return;
    }
    startReaderAutoScroll();
  });

  document.body.appendChild(menu);
  readerContextMenuEl = menu;
  return menu;
}

function closeReaderContextMenu() {
  if (!readerContextMenuEl) return;
  readerContextMenuEl.style.display = "none";
}

function showReaderContextMenu(x, y) {
  if (readerEl.style.display !== "block") return;
  readerAutoScrollSpeed = Math.max(
    READER_AUTOSCROLL_MIN_SPEED,
    Math.min(READER_AUTOSCROLL_MAX_SPEED, readerAutoScrollSpeed),
  );
  const menu = ensureReaderContextMenu();
  const speedInput = menu.querySelector('[data-role="reader-autoscroll-speed"]');
  const speedLabel = menu.querySelector('[data-role="reader-autoscroll-speed-label"]');
  if (speedInput) speedInput.value = String(readerAutoScrollSpeed);
  if (speedLabel) speedLabel.textContent = `${readerAutoScrollSpeed}px/s`;
  setReaderAutoScrollState(readerAutoScrollEnabled);
  menu.style.display = "block";
  positionContextMenu(menu, x, y);
}

function positionContextMenu(menu, x, y) {
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  const nextX = Math.max(8, Math.min(x, maxX));
  const nextY = Math.max(8, Math.min(y, maxY));
  menu.style.left = `${nextX}px`;
  menu.style.top = `${nextY}px`;
}

async function toggleFavoriteForEntry(entry) {
  const nextState = !entry.favorite;
  const res = await window.api.toggleFavorite(entry.dir, nextState);
  if (!res?.ok) return;
  const updated = res.entry || { ...entry, favorite: nextState };
  libraryItems = libraryItems.map((item) =>
    item.dir === entry.dir ? { ...item, favorite: updated.favorite } : item,
  );
  if (currentComicDir === entry.dir) {
    currentComicMeta = updated;
    updateFavoriteToggle(currentComicMeta?.favorite);
  }
  applyFilters();
}

async function deleteComicEntry(entry) {
  const confirmDelete = window.confirm(
    `Delete this manga permanently?\n\n${entry?.title || "Untitled manga"}`,
  );
  if (!confirmDelete) return;
  if (currentComicDir === entry.dir) {
    closeReader();
  }
  closeEditModal();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const res = await window.api.deleteComic(entry.dir);
  if (res?.ok) {
    await loadLibrary();
  }
}

function showGalleryContextMenu(x, y, entry) {
  const menu = ensureGalleryContextMenu();
  galleryContextMenuEntry = entry;
  const favoriteLabel = entry.favorite ? "Remove from favorites" : "Add to favorites";
  const favoriteIcon = entry.favorite ? "icon-star-filled" : "icon-star";
  menu.innerHTML = `
    <button class="menu-item" type="button" data-action="favorite">
      <span class="icon ${favoriteIcon}" aria-hidden="true"></span>
      <span>${favoriteLabel}</span>
    </button>
    <button class="menu-item" type="button" data-action="edit">
      <span class="icon icon-edit" aria-hidden="true"></span>
      <span>Edit metadata</span>
    </button>
    <div class="menu-divider" role="separator"></div>
    <button class="menu-item danger" type="button" data-action="delete">
      <span class="icon icon-delete" aria-hidden="true"></span>
      <span>Delete</span>
    </button>
  `;
  menu.style.display = "block";
  positionContextMenu(menu, x, y);
}

async function renderLibrary(items) {
  const renderGeneration = ++libraryRenderGeneration;

  if (!Array.isArray(items) || items.length === 0) {
    pruneGalleryCards([]);
    galleryEl.innerHTML = `<div style="color:#666;font-size:13px;">Library empty. Use Web Viewer to start a direct download.</div>`;
    setLibraryStatus(0, libraryItems.length, 0);
    return;
  }

  pruneGalleryCards(items);
  galleryEl.replaceChildren();

  for (let i = 0; i < items.length; i += LIBRARY_RENDER_BATCH_SIZE) {
    if (renderGeneration !== libraryRenderGeneration) return;

    const fragment = document.createDocumentFragment();
    const observedImgs = [];
    const batch = items.slice(i, i + LIBRARY_RENDER_BATCH_SIZE);

    for (const c of batch) {
      let cardEntry = galleryCardByDir.get(c.dir);
      if (!cardEntry) {
        cardEntry = createGalleryCard(c);
        galleryCardByDir.set(c.dir, cardEntry);
      }
      updateGalleryCard(cardEntry, c);
      fragment.appendChild(cardEntry.card);
      if (cardEntry.img && cardEntry.img.dataset.coverPath) {
        observedImgs.push(cardEntry.img);
      }
    }

    galleryEl.appendChild(fragment);
    initGalleryThumbnails(observedImgs);
    setLibraryStatus(items.length, libraryItems.length, i + batch.length);

    if (i + LIBRARY_RENDER_BATCH_SIZE < items.length) {
      await yieldToBrowser();
    }
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
  pruneGalleryCards(items);
  buildTagOptions(items);
  buildLanguageOptions(items);
  applyFilters();
}

openBrowserBtn.addEventListener("click", () => window.api.openBrowser());
openDownloaderBtn.addEventListener("click", () => window.api.openDownloader());
refreshBtn.addEventListener("click", () => window.location.reload());
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
  void loadLibraryPathInfo();
  void loadLibrary();
});

window.api.onDownloadCountChanged?.((payload) => {
  updateDownloaderBadge(payload?.count || 0);
});

window.api.onLibraryMoveProgress?.((payload) => {
  if (!moveLibraryState.moving) return;
  const label = String(payload?.label || "Moving library…");
  const percent = Math.max(0, Math.min(100, Number(payload?.percent) || 0));
  setMoveProgress({ label, percent, indeterminate: false });
});

document.addEventListener("click", (event) => {
  if (galleryContextMenuEl && !galleryContextMenuEl.contains(event.target)) {
    closeGalleryContextMenu();
  }
  if (readerContextMenuEl && !readerContextMenuEl.contains(event.target)) {
    closeReaderContextMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeGalleryContextMenu();
    closeReaderContextMenu();
    stopReaderAutoScroll();
  }
});

window.addEventListener("blur", () => {
  closeGalleryContextMenu();
  closeReaderContextMenu();
});
window.addEventListener("resize", () => {
  closeGalleryContextMenu();
  closeReaderContextMenu();
});
window.addEventListener(
  "scroll",
  () => {
    closeGalleryContextMenu();
    closeReaderContextMenu();
  },
  true,
);

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
