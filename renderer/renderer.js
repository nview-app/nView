const __nviewBridgeGuard = window.nviewBridgeGuard;
if (!__nviewBridgeGuard?.guardRenderer?.({ windowName: "Gallery", required: ["api"] })) {
  // Bridge API missing: fail fast after rendering guard UI.
} else {
const $ = (id) => document.getElementById(id);

const openBrowserBtn = $("openBrowser");
const openDownloaderBtn = $("openDownloader");
const openDownloaderCountEl = $("openDownloaderCount");
const refreshBtn = $("refresh");
const openSettingsBtn = $("openSettings");
const settingsDropdownEl = $("settingsDropdown");
const settingsMenuOpenSettingsBtn = $("settingsMenuOpenSettings");
const settingsMenuMoveLibraryBtn = $("settingsMenuMoveLibrary");
const settingsMenuImportBtn = $("settingsMenuImport");
const settingsMenuExportBtn = $("settingsMenuExport");
const statusEl = $("status");
const galleryEl = $("gallery");
const searchInput = $("searchInput");
const tagFilterBtn = $("tagFilterBtn");
const tagFilterLabel = $("tagFilterLabel");
const tagFilterClearBtn = $("tagFilterClearBtn");
const languageFilterSelect = $("languageFilterSelect");
const sortSelect = $("sortSelect");
const libraryLoadProgressEl = $("libraryLoadProgress");
const libraryLoadProgressCountEl = $("libraryLoadProgressCount");
const libraryLoadProgressTrackEl = $("libraryLoadProgressTrack");
const libraryLoadProgressBarEl = $("libraryLoadProgressBar");

const vaultModalEl = $("vaultModal");
const vaultPanelEl = $("vaultPanel");
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

const openFolderBtn = $("openFolder");

const editModalEl = $("editModal");
const closeEditBtn = $("closeEdit");
const saveEditBtn = $("saveEdit");
const deleteComicBtn = $("deleteComic");
const editTitleInput = $("editTitleInput");
const editAuthorInput = $("editAuthorInput");
const editGalleryIdInput = $("editGalleryIdInput");
const editLanguagesInput = $("editLanguagesInput");
const editPublishingDataInput = $("editPublishingDataInput");
const editAddedDateInput = $("editAddedDateInput");
const editNoteInput = $("editNoteInput");
const editTagsInput = $("editTagsInput");
const editParodiesInput = $("editParodiesInput");
const editCharactersInput = $("editCharactersInput");
const editArtistSuggestions = $("editArtistSuggestions");
const editLanguagesSuggestions = $("editLanguagesSuggestions");
const editTagsSuggestions = $("editTagsSuggestions");
const editParodiesSuggestions = $("editParodiesSuggestions");
const editCharactersSuggestions = $("editCharactersSuggestions");
const editLanguagesChips = $("editLanguagesChips");
const editTagsChips = $("editTagsChips");
const editParodiesChips = $("editParodiesChips");
const editCharactersChips = $("editCharactersChips");
const editPagesModalEl = $("editPagesModal");
const closeEditPagesBtn = $("closeEditPages");
const cancelEditPagesBtn = $("cancelEditPages");
const saveEditPagesBtn = $("saveEditPages");
const editPagesTbodyEl = $("editPagesTbody");
const editPagesEmptyEl = $("editPagesEmpty");
const editPagesBodyEl = $("editPagesBody");

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
const settingsAppVersionEl = $("settingsAppVersion");
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

const appToastEl = $("appToast");
const appConfirmModalEl = $("appConfirmModal");
const appConfirmTitleEl = $("appConfirmTitle");
const appConfirmMessageEl = $("appConfirmMessage");
const appConfirmCancelBtn = $("appConfirmCancel");
const appConfirmProceedBtn = $("appConfirmProceed");

const rendererStateApi = window.nviewRendererState;
const initialRendererState = rendererStateApi?.createInitialRendererState?.() || {
  settingsCache: {
    startPage: "",
    blockPopups: true,
    allowListEnabled: true,
    allowListDomains: ["*.cloudflare.com"],
    darkMode: false,
    defaultSort: "favorites",
    cardSize: "normal",
    libraryPath: "",
  },
  libraryPathInfo: {
    configuredPath: "",
    activePath: "-",
    defaultPath: "-",
  },
  moveLibraryState: {
    selectedPath: "",
    permissionOk: false,
    emptyFolderOk: false,
    freeSpaceOk: false,
    requiredBytes: 0,
    availableBytes: 0,
    checking: false,
    moving: false,
  },
  startPageValidationToken: 0,
  vaultState: { initialized: false, unlocked: true },
  vaultPolicy: {
    minPassphraseLength: 8,
    passphraseHelpText: "Use a minimum of 8 characters. It is recommended to include at least one uppercase letter, one lowercase letter, one digit, and one symbol.",
    tooShortError: "Passphrase must be at least 8 characters.",
  },
  minVaultPassphrase: 8,
};

const VALID_START_PAGE_HASHES = rendererStateApi?.VALID_START_PAGE_HASHES || new Set();
let settingsCache = initialRendererState.settingsCache;
let libraryPathInfo = initialRendererState.libraryPathInfo;
let moveLibraryState = initialRendererState.moveLibraryState;
let startPageValidationToken = initialRendererState.startPageValidationToken;
let vaultState = initialRendererState.vaultState;
let vaultPolicy = initialRendererState.vaultPolicy;
let MIN_VAULT_PASSPHRASE = initialRendererState.minVaultPassphrase;

let appVersionLoaded = false;

let appToastTimeoutId = null;
let appToastToken = 0;
let appConfirmResolver = null;
let activeLibraryLoadRequestId = 0;
let progressiveLibraryItems = [];


const filterEngine = window.nviewFilterEngine;
const FILTER_TAG_SOURCE_LABELS = filterEngine?.FILTER_TAG_SOURCE_LABELS || {
  tags: "Tags",
  parodies: "Parodies",
  characters: "Characters",
};
const FILTER_TAG_SOURCE_ORDER = filterEngine?.FILTER_TAG_SOURCE_ORDER || ["tags", "parodies", "characters"];
const normalizeText = filterEngine?.normalizeText || ((value) => String(value || "").toLowerCase());
const tokenize = filterEngine?.tokenize || ((value) => normalizeText(value).split(/\s+/).filter(Boolean));
const getFilterTagEntries = filterEngine?.getFilterTagEntries || (() => []);
const computeTagCounts = filterEngine?.computeTagCounts || (() => new Map());
const matchesSearch = filterEngine?.matchesSearch || (() => true);
const matchesTags = filterEngine?.matchesTags || (() => true);
const matchesLanguage = filterEngine?.matchesLanguage || (() => true);
const sortItems = filterEngine?.sortItems || ((items) => [...items]);

if (vaultPassphraseHelpEl) {
  vaultPassphraseHelpEl.textContent = vaultPolicy.passphraseHelpText;
}

const vaultUiApi = window.nviewVaultUi || null;

function updateVaultStrength(passphrase, { active = false } = {}) {
  if (!vaultUiApi?.updateVaultStrength) return;
  vaultUiApi.updateVaultStrength(
    passphrase,
    { vaultStrengthEl, vaultStrengthBarEl, vaultStrengthLabelEl },
    MIN_VAULT_PASSPHRASE,
    { active },
  );
}

async function loadVaultPolicy() {
  if (!vaultUiApi?.loadVaultPolicy) return;
  await vaultUiApi.loadVaultPolicy({
    api: window.api,
    vaultPassphraseHelpEl,
    onPolicy: (policy) => {
      vaultPolicy = policy;
      MIN_VAULT_PASSPHRASE = Number(policy.minPassphraseLength) || 8;
    },
  });
}

void loadVaultPolicy();

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

const thumbPipeline = window.nviewThumbPipeline || null;

function toAppBlobUrl(filePath) {
  if (thumbPipeline?.toAppBlobUrl) return thumbPipeline.toAppBlobUrl(filePath);

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
  if (thumbPipeline?.appBlobFetchOptions) return thumbPipeline.appBlobFetchOptions(signal);
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

const galleryThumbController = window.nviewGalleryThumbController?.createGalleryThumbController?.({
  win: window,
  toAppBlobUrl,
  appBlobFetchOptions,
  thumbPipeline,
  fallbackCoverSrc: galleryCoverPlaceholder,
  fallbackNoCoverSrc: galleryNoCoverSvg,
  maxSize: GALLERY_THUMB_MAX_SIZE,
}) || {
  init: () => {},
  unobserve: () => {},
  scheduleEviction: () => {},
  releaseThumb: () => {},
  releaseAll: () => {},
  getMetricsSnapshot: () => null,
  resetMetrics: () => {},
};

let loggedMissingGalleryEvictionScheduler = false;
function scheduleGalleryThumbEviction() {
  if (galleryThumbController?.scheduleEviction) {
    galleryThumbController.scheduleEviction();
    return;
  }

  if (!loggedMissingGalleryEvictionScheduler) {
    loggedMissingGalleryEvictionScheduler = true;
    console.warn("[gallery] thumbnail eviction scheduler unavailable");
  }
}

function releaseGalleryThumbs() {
  galleryThumbController.releaseAll();
}

function getGalleryThumbMetricsSnapshot() {
  return galleryThumbController.getMetricsSnapshot();
}

function resetGalleryThumbMetrics() {
  galleryThumbController.resetMetrics();
}

window.nviewGalleryThumbMetrics = {
  getSnapshot: getGalleryThumbMetricsSnapshot,
  reset: resetGalleryThumbMetrics,
};

function releaseGalleryThumb(img) {
  galleryThumbController.releaseThumb(img);
}

function initGalleryThumbnails(imgs = []) {
  galleryThumbController.init(imgs);
}

const galleryCardByDir = new Map();
const openComicDirs = new Set();


function fmtPages(found) {
  const f = Number(found) || 0;
  return `${f} pages`;
}

let editTargetDir = null;
let editTargetMeta = null;
let editPagesTargetDir = null;
let editPagesList = [];
let editPagesAutoScrollRafId = null;
let editPagesAutoScrollVelocity = 0;
let editPagesPreviewState = null;

const EDIT_PAGES_AUTO_SCROLL_EDGE_PX = 56;
const EDIT_PAGES_AUTO_SCROLL_MAX_SPEED_PX = 16;
const PAGE_MARK_OPTIONS = Object.freeze(["", "❤", "★", "➥", "✂", "⚑", "⚤", "⚣", "⚢", "⚥"]);

function sanitizePageMark(value) {
  const normalized = String(value || "").trim();
  return PAGE_MARK_OPTIONS.includes(normalized) ? normalized : "";
}

let libraryItems = [];
let tagFilters = {
  include: new Set(),
  exclude: new Set(),
  matchAll: false,
  counts: new Map(),
};
let languageOptions = [];
let libraryRenderGeneration = 0;
let libraryLoadSequence = 0;
let skipNextSettingsLibraryLoad = false;
const pendingLocalDeleteChangeEvents = new Set();
const pendingLocalUpdateChangeEvents = new Set();
const sharedTagInput = window.nviewTagInput || {};
const normalizeTagValue = sharedTagInput.normalizeValue || ((tag) => String(tag || "").trim());
const dedupeTagValues = sharedTagInput.dedupeValues || ((values) => {
  const normalized = [];
  const seen = new Set();
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = normalizeTagValue(rawValue);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
});
const createSharedSuggestionMenu = sharedTagInput.createSuggestionMenu;
const createSharedTagInput = sharedTagInput.createTagInput;

function createSuggestionMenu(menuEl) {
  if (typeof createSharedSuggestionMenu === "function") {
    return createSharedSuggestionMenu(menuEl, {
      tableClassName: "editSuggestionTable",
      optionClassName: "editSuggestionOption",
      headerLabel: "Select from list",
    });
  }

  function hide() {
    if (!menuEl) return;
    menuEl.hidden = true;
    menuEl.replaceChildren();
  }

  function show(values, onPick) {
    if (!menuEl) return;
    const options = dedupeTagValues(values).slice(0, 100);
    if (!options.length) {
      hide();
      return;
    }

    const table = document.createElement("table");
    table.className = "editSuggestionTable";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const valueHead = document.createElement("th");
    valueHead.textContent = "Select from list";
    headerRow.appendChild(valueHead);
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    for (const value of options) {
      const row = document.createElement("tr");
      const valueCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editSuggestionOption";
      button.textContent = value;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        if (typeof onPick === "function") onPick(value);
      });
      valueCell.appendChild(button);

      row.appendChild(valueCell);
      tbody.appendChild(row);
    }

    table.appendChild(thead);
    table.appendChild(tbody);

    menuEl.replaceChildren(table);
    menuEl.hidden = false;
  }

  return { show, hide };
}


function createEditAutocompleteInput({ inputEl, suggestionsEl, getSuggestions }) {
  const suggestionMenu = createSuggestionMenu(suggestionsEl);
  const fieldEl = inputEl?.closest(".editField");

  function show() {
    const query = normalizeTagValue(inputEl.value).toLowerCase();
    const options = dedupeTagValues(getSuggestions()).filter((value) => {
      if (!query) return true;
      return value.toLowerCase().includes(query);
    });
    suggestionMenu.show(options, (value) => {
      inputEl.value = value;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.focus({ preventScroll: true });
      show();
    });
  }

  inputEl.addEventListener("focus", show);
  inputEl.addEventListener("input", show);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") suggestionMenu.hide();
  });
  fieldEl?.addEventListener("focusout", (event) => {
    if (fieldEl.contains(event.relatedTarget)) return;
    suggestionMenu.hide();
  });

  return {
    refresh() {
      if (document.activeElement === inputEl) show();
    },
  };
}

function createEditTagInput({ inputEl, chipsEl, suggestionsEl, getSuggestions, maxTags = Number.POSITIVE_INFINITY, suppressChipClicks = false }) {
  if (typeof createSharedTagInput === "function") {
    return createSharedTagInput({
      inputEl,
      chipsEl,
      suggestionsEl,
      getSuggestions,
      maxTags,
      suppressChipClicks,
      chipClassName: "editTagChip",
      chipRemoveClassName: "editTagChipRemove",
      suggestionMenu: {
        tableClassName: "editSuggestionTable",
        optionClassName: "editSuggestionOption",
        headerLabel: "Select from list",
      },
      showSuggestionsOn: "pointer",
    });
  }

  const suggestionMenu = createSuggestionMenu(suggestionsEl);
  const state = { tags: [] };
  let suggestionTriggeredByPointer = false;

  function shouldShowSuggestions() {
    return suggestionTriggeredByPointer && document.activeElement === inputEl;
  }

  function render() {
    chipsEl.replaceChildren();
    for (const tag of state.tags) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "editTagChip";
      chip.setAttribute("aria-label", `Remove tag ${tag}`);

      const label = document.createElement("span");
      label.textContent = tag;
      const remove = document.createElement("span");
      remove.className = "editTagChipRemove";
      remove.textContent = "✕";
      chip.addEventListener("mousedown", (event) => event.preventDefault());
      chip.addEventListener("click", (event) => {
        event.preventDefault();
        state.tags = state.tags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
        render();
      });
      chip.appendChild(label);
      chip.appendChild(remove);
      chipsEl.appendChild(chip);
    }

    if (shouldShowSuggestions()) {
      showSuggestions(inputEl.value);
      return;
    }
    suggestionMenu.hide();
  }

  function showSuggestions(query) {
    if (!shouldShowSuggestions()) {
      suggestionMenu.hide();
      return;
    }
    const selectedLookup = new Set(state.tags.map((tag) => tag.toLowerCase()));
    const normalizedQuery = normalizeTagValue(query).toLowerCase();
    const options = dedupeTagValues(getSuggestions()).filter((value) => {
      const lower = value.toLowerCase();
      if (selectedLookup.has(lower)) return false;
      if (!normalizedQuery) return true;
      return lower.includes(normalizedQuery);
    });
    suggestionMenu.show(options, (value) => {
      if (addTags([value])) {
        inputEl.value = "";
      }
      inputEl.focus({ preventScroll: true });
      showSuggestions("");
    });
  }

  function addTags(tags) {
    const incoming = dedupeTagValues(tags);
    if (!incoming.length) return false;
    let next = dedupeTagValues([...(state.tags || []), ...incoming]);
    if (Number.isFinite(maxTags)) next = next.slice(0, Math.max(0, maxTags));
    if (next.length === state.tags.length && next.every((tag, index) => tag === state.tags[index])) return false;
    state.tags = next;
    render();
    return true;
  }

  function commitDraft({ force = false } = {}) {
    const rawValue = String(inputEl.value || "");
    const segments = rawValue.split(",");
    const complete = dedupeTagValues(segments.slice(0, -1));
    const last = normalizeTagValue(segments[segments.length - 1] || "");
    let changed = false;
    if (complete.length) changed = addTags(complete) || changed;
    if (force && last) {
      changed = addTags([last]) || changed;
      inputEl.value = "";
      showSuggestions("");
      return changed;
    }
    if (rawValue.includes(",")) inputEl.value = last;
    showSuggestions(last);
    return changed;
  }

  inputEl.addEventListener("input", () => {
    commitDraft();
  });
  inputEl.addEventListener("change", () => {
    if (normalizeTagValue(inputEl.value)) commitDraft({ force: true });
  });
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      if (!normalizeTagValue(inputEl.value)) return;
      event.preventDefault();
      commitDraft({ force: true });
      return;
    }
    if (event.key === "Backspace" && !normalizeTagValue(inputEl.value) && state.tags.length > 0) {
      state.tags = state.tags.slice(0, -1);
      render();
    }
    if (event.key === "Escape") {
      suggestionTriggeredByPointer = false;
      suggestionMenu.hide();
    }
  });
  inputEl.addEventListener("mousedown", () => {
    suggestionTriggeredByPointer = true;
  });
  inputEl.addEventListener("blur", () => {
    suggestionTriggeredByPointer = false;
    if (normalizeTagValue(inputEl.value)) commitDraft({ force: true });
    suggestionMenu.hide();
  });

  if (suppressChipClicks) {
    chipsEl.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    chipsEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  return {
    setTags(tags) {
      let nextTags = dedupeTagValues(tags);
      if (Number.isFinite(maxTags)) nextTags = nextTags.slice(0, Math.max(0, maxTags));
      state.tags = nextTags;
      inputEl.value = "";
      render();
    },
    getTags() {
      const pendingTag = normalizeTagValue(inputEl.value);
      let nextTags = dedupeTagValues([...(state.tags || []), pendingTag]);
      if (Number.isFinite(maxTags)) nextTags = nextTags.slice(0, Math.max(0, maxTags));
      return nextTags;
    },
    getValue() {
      return this.getTags()[0] || "";
    },
  };
}

const editArtistField = createEditAutocompleteInput({
  inputEl: editAuthorInput,
  suggestionsEl: editArtistSuggestions,
  getSuggestions: () => libraryItems.flatMap((item) => [item.artist]).filter(Boolean),
});

const editLanguagesField = createEditTagInput({
  inputEl: editLanguagesInput,
  chipsEl: editLanguagesChips,
  suggestionsEl: editLanguagesSuggestions,
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item.languages) ? item.languages : [])),
});

const editTagsField = createEditTagInput({
  inputEl: editTagsInput,
  chipsEl: editTagsChips,
  suggestionsEl: editTagsSuggestions,
  suppressChipClicks: true,
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item.tags) ? item.tags : [])),
});

const editParodiesField = createEditTagInput({
  inputEl: editParodiesInput,
  chipsEl: editParodiesChips,
  suggestionsEl: editParodiesSuggestions,
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item.parodies) ? item.parodies : [])),
});

const editCharactersField = createEditTagInput({
  inputEl: editCharactersInput,
  chipsEl: editCharactersChips,
  suggestionsEl: editCharactersSuggestions,
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item.characters) ? item.characters : [])),
});

const contextMenuController = window.nviewContextMenu?.createContextMenuController?.({
  doc: document,
  win: window,
  onToggleFavorite: toggleFavoriteForEntry,
  onEditEntry: (entry) => openEditModal(entry, entry?.dir),
  onEditPagesEntry: (entry) => { void openEditPagesModal(entry?.dir); },
  onDeleteEntry: deleteComicEntry,
}) || {
  closeAllContextMenus: () => {},
  closeGalleryContextMenu: () => {},
  closeReaderContextMenu: () => {},
  isClickInsideContextMenus: () => false,
  isReaderAutoScrollEnabled: () => false,
  showGalleryContextMenu: () => {},
  showReaderContextMenu: () => {},
  startReaderAutoScroll: () => {},
  stopReaderAutoScroll: () => {},
  syncWithVisibleEntries: () => {},
};

function createGalleryCard(entry) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.dir = entry.dir || "";

  const img = document.createElement("img");
  img.className = "cover";
  img.loading = "lazy";
  img.draggable = false;

  const openIndicator = document.createElement("div");
  openIndicator.className = "open-indicator";
  openIndicator.title = "Open in reader";

  const openIndicatorIcon = document.createElement("span");
  openIndicatorIcon.className = "icon icon-book";
  openIndicatorIcon.setAttribute("aria-hidden", "true");
  openIndicator.appendChild(openIndicatorIcon);

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
  card.appendChild(openIndicator);
  card.appendChild(meta);

  card.addEventListener("click", async () => {
    const activeEntry = galleryCardByDir.get(card.dataset.dir || "")?.entry;
    if (activeEntry) await openComicFromLibraryEntry(activeEntry);
  });
  card.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const activeEntry = galleryCardByDir.get(card.dataset.dir || "")?.entry;
    if (activeEntry) contextMenuController.showGalleryContextMenu(event.clientX, event.clientY, activeEntry);
  });

  return {
    card,
    img,
    openIndicator,
    favorite,
    titleText,
    sub,
    tags,
    entry,
  };
}

function updateGalleryCard(cardEntry, entry) {
  if (!cardEntry) return;
  const { card, img, openIndicator, favorite, titleText, sub, tags } = cardEntry;
  card.dataset.dir = entry.dir || "";
  cardEntry.entry = entry;

  favorite.style.display = entry.favorite ? "inline" : "none";
  openIndicator.style.display = openComicDirs.has(entry.dir) ? "inline-flex" : "none";
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
  contextMenuController.syncWithVisibleEntries?.(validDirs);
  for (const [dir, cardEntry] of galleryCardByDir.entries()) {
    if (validDirs.has(dir)) continue;
    if (cardEntry.img) {
      galleryThumbController.unobserve(cardEntry.img);
    }
    releaseGalleryThumb(cardEntry.img);
    cardEntry.card.remove();
    galleryCardByDir.delete(dir);
  }
}


function buildTagOptions(items) {
  const include = Array.from(tagFilters.include);
  const exclude = Array.from(tagFilters.exclude);
  const counts = computeTagCounts(items, include, tagFilters.matchAll, exclude);
  tagFilters.counts = counts;
  tagFilters.include = new Set(include.filter((tag) => counts.has(tag)));
  tagFilters.exclude = new Set(exclude.filter((tag) => counts.has(tag)));
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



function setLibraryLoadProgress({ visible = false, loaded = 0, total = 0 } = {}) {
  if (!libraryLoadProgressEl || !libraryLoadProgressCountEl || !libraryLoadProgressBarEl) return;
  if (!visible) {
    libraryLoadProgressEl.hidden = true;
    return;
  }
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLoaded = Math.min(safeTotal, Math.max(0, Number(loaded) || 0));
  const percent = safeTotal > 0 ? (safeLoaded / safeTotal) * 100 : 0;
  libraryLoadProgressEl.hidden = false;
  libraryLoadProgressCountEl.textContent = `${safeLoaded}/${safeTotal}`;
  libraryLoadProgressBarEl.style.width = `${percent.toFixed(2)}%`;
  if (libraryLoadProgressTrackEl) {
    libraryLoadProgressTrackEl.setAttribute("aria-valuemin", "0");
    libraryLoadProgressTrackEl.setAttribute("aria-valuemax", String(safeTotal));
    libraryLoadProgressTrackEl.setAttribute("aria-valuenow", String(safeLoaded));
  }
}

function setLibraryStatus(shown, total, rendered = shown) {
  const renderedCount = Math.min(rendered, shown);
  statusEl.textContent = `${shown}/${total} manga match current filters • rendered ${renderedCount}/${shown}.\nLibrary folder: ${
    statusEl.dataset.root || "-"
  }`;
}

function applyLocalLibraryItems(nextItems, { rebuildFacets = true } = {}) {
  libraryItems = Array.isArray(nextItems) ? nextItems : [];
  if (rebuildFacets) {
    buildTagOptions(libraryItems);
    buildLanguageOptions(libraryItems);
  }
  applyFilters();
}

function applyFilters() {
  // Filtering/sorting always runs against the full indexed libraryItems dataset.
  const queryTokens = tokenize(searchInput.value);
  const includedTags = Array.from(tagFilters.include);
  const excludedTags = Array.from(tagFilters.exclude);
  const matchAll = tagFilters.matchAll;
  const languageSelection = normalizeText(languageFilterSelect?.value || "");
  const filteredByTags = libraryItems.filter(
    (item) => matchesSearch(item, queryTokens) && matchesTags(item, includedTags, matchAll, excludedTags),
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
  tagFilters.include.clear();
  tagFilters.exclude.clear();
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
  const includeCount = tagFilters.include.size;
  const excludeCount = tagFilters.exclude.size;
  const totalCount = includeCount + excludeCount;
  if (tagFilterLabel) {
    tagFilterLabel.textContent = totalCount ? `Tags (${totalCount} selected)` : "Filter tags";
  }
  if (tagFilterClearBtn) {
    tagFilterClearBtn.style.display = totalCount ? "inline-flex" : "none";
  }
  if (tagSelectionSummary) {
    if (!totalCount) {
      tagSelectionSummary.textContent = "No tags selected";
    } else {
      const parts = [];
      if (includeCount) parts.push(`${includeCount} include`);
      if (excludeCount) parts.push(`${excludeCount} exclude`);
      tagSelectionSummary.textContent = `${parts.join(" • ")} tag filter${totalCount === 1 ? "" : "s"}`;
    }
  }
}

function renderTagList() {
  if (!tagListEl) return;
  const query = normalizeText(tagSearchInput?.value || "");
  tagListEl.innerHTML = "";
  const tags = Array.from(tagFilters.counts.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [, option] of tags) {
    if (query && !normalizeText(option.label).includes(query)) continue;
    const row = document.createElement("div");
    row.className = "tagOption";

    const includeButton = document.createElement("button");
    includeButton.type = "button";
    includeButton.className = "tagOptionIconBtn";
    includeButton.value = option.key;
    includeButton.dataset.mode = "include";
    includeButton.setAttribute("aria-label", `Include ${option.label}`);

    const includeIcon = document.createElement("span");
    includeIcon.className = "icon icon-include";
    includeIcon.setAttribute("aria-hidden", "true");
    includeButton.appendChild(includeIcon);

    const excludeButton = document.createElement("button");
    excludeButton.type = "button";
    excludeButton.className = "tagOptionIconBtn";
    excludeButton.value = option.key;
    excludeButton.dataset.mode = "exclude";
    excludeButton.setAttribute("aria-label", `Exclude ${option.label}`);

    const excludeIcon = document.createElement("span");
    excludeIcon.className = "icon icon-exclude";
    excludeIcon.setAttribute("aria-hidden", "true");
    excludeButton.appendChild(excludeIcon);

    const syncTagModeButtons = () => {
      const isInclude = tagFilters.include.has(option.key);
      const isExclude = tagFilters.exclude.has(option.key);
      includeButton.setAttribute("aria-pressed", String(isInclude));
      excludeButton.setAttribute("aria-pressed", String(isExclude));
      includeButton.classList.toggle("is-active", isInclude);
      excludeButton.classList.toggle("is-active", isExclude);
    };

    const setTagMode = (nextMode) => {
      if (nextMode === "include") {
        tagFilters.exclude.delete(option.key);
        tagFilters.include.add(option.key);
      } else if (nextMode === "exclude") {
        tagFilters.include.delete(option.key);
        tagFilters.exclude.add(option.key);
      } else {
        tagFilters.include.delete(option.key);
        tagFilters.exclude.delete(option.key);
      }
      buildTagOptions(libraryItems);
      applyFilters();
    };

    includeButton.addEventListener("click", () => {
      const isActive = tagFilters.include.has(option.key);
      setTagMode(isActive ? "none" : "include");
    });
    excludeButton.addEventListener("click", () => {
      const isActive = tagFilters.exclude.has(option.key);
      setTagMode(isActive ? "none" : "exclude");
    });

    syncTagModeButtons();

    const text = document.createElement("span");
    text.className = "tagOptionText";
    text.textContent = option.label;

    const source = document.createElement("span");
    source.className = "tagOptionSource";
    const sourceLabels = FILTER_TAG_SOURCE_ORDER
      .filter((key) => key !== "tags" && option.sources.has(key))
      .map((key) => FILTER_TAG_SOURCE_LABELS[key]);
    source.textContent = sourceLabels.length ? `(${sourceLabels.join(", ")})` : "";

    const countEl = document.createElement("span");
    countEl.className = "tagOptionCount";
    countEl.textContent = option.count;

    const controls = document.createElement("span");
    controls.className = "tagOptionControls";

    controls.appendChild(includeButton);
    controls.appendChild(excludeButton);

    row.appendChild(controls);
    row.appendChild(text);
    row.appendChild(source);
    row.appendChild(countEl);
    tagListEl.appendChild(row);
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
  const wasOpen = isModalVisible(tagModalEl);
  if (tagMatchAllToggle) {
    tagMatchAllToggle.checked = tagFilters.matchAll;
  }
  tagModalEl.style.display = "block";
  updateModalScrollLocks();
  updateTagModeLabel();
  buildTagOptions(libraryItems);
  if (!wasOpen) tagSearchInput?.focus();
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
    editModalEl,
    editPagesModalEl,
    appConfirmModalEl,
  ].some(isModalVisible);
  document.body.classList.toggle("modal-open", modalOpen);
}


function showAppToast(message, { timeoutMs = 3600 } = {}) {
  if (!appToastEl) return;
  appToastToken += 1;
  const token = appToastToken;
  if (appToastTimeoutId !== null) {
    clearTimeout(appToastTimeoutId);
    appToastTimeoutId = null;
  }

  appToastEl.textContent = String(message || "");
  appToastEl.classList.add("is-visible");

  appToastTimeoutId = setTimeout(() => {
    if (token !== appToastToken) return;
    appToastEl.classList.remove("is-visible");
    appToastEl.textContent = "";
    appToastTimeoutId = null;
  }, Math.max(1200, Number(timeoutMs) || 3600));
}

function closeAppConfirmModal(result) {
  if (!appConfirmModalEl || !appConfirmResolver) return;
  const resolve = appConfirmResolver;
  appConfirmResolver = null;
  appConfirmModalEl.style.display = "none";
  updateModalScrollLocks();
  resolve(Boolean(result));
}

function showAppConfirm({
  title = "Confirm action",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
} = {}) {
  if (!appConfirmModalEl || !appConfirmProceedBtn || !appConfirmCancelBtn) {
    console.warn("[ui] confirm modal unavailable", String(message || ""));
    return Promise.resolve(false);
  }
  if (appConfirmResolver) {
    closeAppConfirmModal(false);
  }

  appConfirmTitleEl.textContent = String(title || "Confirm action");
  appConfirmMessageEl.textContent = String(message || "");
  appConfirmProceedBtn.textContent = String(confirmLabel || "Confirm");
  appConfirmCancelBtn.textContent = String(cancelLabel || "Cancel");

  appConfirmModalEl.style.display = "flex";
  updateModalScrollLocks();

  return new Promise((resolve) => {
    appConfirmResolver = resolve;
    appConfirmCancelBtn.focus();
  });
}

appConfirmCancelBtn?.addEventListener("click", () => closeAppConfirmModal(false));
appConfirmProceedBtn?.addEventListener("click", () => closeAppConfirmModal(true));
appConfirmModalEl?.addEventListener("click", (event) => {
  if (event.target === appConfirmModalEl) {
    closeAppConfirmModal(false);
  }
});

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

async function loadAppVersion() {
  if (!settingsAppVersionEl || appVersionLoaded) return;
  const res = await window.api.getAppVersion?.();
  if (res?.ok && res.version) {
    settingsAppVersionEl.textContent = String(res.version);
    appVersionLoaded = true;
    return;
  }
  settingsAppVersionEl.textContent = "Unavailable";
}

async function notifyLibraryMoveCompleted(migration) {
  if (!migration?.attempted || !migration?.moved || !migration?.fromRoot) return;
  const skippedSymlinks = Number(migration.skippedSymlinks || 0);
  const symlinkNote = skippedSymlinks > 0
    ? `\n\nSkipped symbolic links: ${skippedSymlinks.toLocaleString()} (not migrated).`
    : "";
  showAppToast(`Library move completed. Moved ${Number(migration.copiedFiles || 0).toLocaleString()} files (${formatBytes(migration.totalBytes || 0)}).${symlinkNote ? ` ${symlinkNote.replace(/\n+/g, " ").trim()}` : ""}`);
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
  const wasOpen = isModalVisible(vaultModalEl);
  vaultModalEl.style.display = "block";
  updateModalScrollLocks();
  vaultErrorEl.textContent = "";
  if (vaultPanelEl) vaultPanelEl.classList.remove("vault-shake");
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
  if (!wasOpen) vaultPassInput.focus();
}

function hideVaultModal() {
  if (!vaultModalEl) return;
  vaultModalEl.style.display = "none";
  updateModalScrollLocks();
  vaultErrorEl.textContent = "";
  if (vaultPanelEl) vaultPanelEl.classList.remove("vault-shake");
}

function showVaultError(message, { shake = false } = {}) {
  if (!vaultErrorEl) return;
  vaultErrorEl.textContent = message;
  if (!shake || !vaultPanelEl) return;
  vaultPanelEl.classList.remove("vault-shake");
  void vaultPanelEl.offsetWidth;
  vaultPanelEl.classList.add("vault-shake");
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


openFolderBtn.addEventListener("click", async () => {
  const targetDir = editTargetDir;
  if (!targetDir) return;
  await window.api.showInFolder(targetDir);
});

function openEditModal(targetMeta, targetDir) {
  if (!targetMeta || !targetDir) return;
  contextMenuController.closeAllContextMenus();
  editTargetDir = targetDir;
  editTargetMeta = targetMeta;
  editGalleryIdInput.value = targetMeta.galleryId || "-";
  editPublishingDataInput.value = toDateInputValue(targetMeta.publishedAt || "");
  editAddedDateInput.value = targetMeta.savedAt || "-";
  editNoteInput.value = targetMeta.note || "";
  editTitleInput.value = targetMeta.title || "";
  editAuthorInput.value = targetMeta.artist || "";
  editLanguagesField.setTags(targetMeta.languages);
  editArtistField.refresh();
  editTagsField.setTags(targetMeta.tags);
  editParodiesField.setTags(targetMeta.parodies);
  editCharactersField.setTags(targetMeta.characters);
  editModalEl.style.display = "block";
  updateModalScrollLocks();
  editTitleInput.focus();
  editTitleInput.select();
}

function closeEditModal() {
  editModalEl.style.display = "none";
  editTargetDir = null;
  editTargetMeta = null;
  updateModalScrollLocks();
}

function closeEditPagesModal() {
  if (!editPagesModalEl) return;
  stopEditPagesAutoScroll();
  destroyEditPagesPreview();
  editPagesModalEl.style.display = "none";
  editPagesTargetDir = null;
  editPagesList = [];
  updateModalScrollLocks();
}

function destroyEditPagesPreview() {
  if (!editPagesPreviewState) return;
  editPagesPreviewState.abortController?.abort();
  if (editPagesPreviewState.objectUrl) {
    URL.revokeObjectURL(editPagesPreviewState.objectUrl);
  }
  editPagesPreviewState.hostEl?.remove();
  editPagesPreviewState = null;
}

function createEditPagesPreviewHost(anchorEl) {
  const hostEl = document.createElement("div");
  hostEl.className = "editPagesPreviewTooltip";
  hostEl.setAttribute("role", "tooltip");
  hostEl.textContent = "Loading preview…";
  document.body.appendChild(hostEl);

  const anchorRect = anchorEl.getBoundingClientRect();
  const maxLeft = Math.max(12, window.innerWidth - 276);
  hostEl.style.top = `${Math.max(12, Math.round(anchorRect.bottom + 6))}px`;
  hostEl.style.left = `${Math.max(12, Math.min(maxLeft, Math.round(anchorRect.left)))}px`;
  return hostEl;
}

async function openEditPagesPreview(anchorEl, filePath) {
  const resolvedPath = String(filePath || "").trim();
  if (!anchorEl || !resolvedPath) return;
  if (editPagesPreviewState?.anchorEl === anchorEl) {
    destroyEditPagesPreview();
    return;
  }

  destroyEditPagesPreview();
  const hostEl = createEditPagesPreviewHost(anchorEl);
  const abortController = new AbortController();
  editPagesPreviewState = {
    anchorEl,
    hostEl,
    abortController,
    objectUrl: "",
  };

  const thumbnailPipeline = window.nviewThumbPipeline;
  const result = thumbnailPipeline?.fetchAndCreateThumbnailUrl
    ? await thumbnailPipeline.fetchAndCreateThumbnailUrl({
      filePath: resolvedPath,
      targetWidth: 256,
      targetHeight: 336,
      signal: abortController.signal,
      preferCanonicalOutput: false,
    })
    : { ok: false };

  if (abortController.signal.aborted || editPagesPreviewState?.anchorEl !== anchorEl) return;

  if (!result?.ok || !result.objectUrl) {
    hostEl.textContent = "Preview unavailable.";
    return;
  }

  editPagesPreviewState.objectUrl = result.objectUrl;
  hostEl.replaceChildren();
  const imageEl = document.createElement("img");
  imageEl.className = "editPagesPreviewImage";
  imageEl.alt = "Selected page preview";
  imageEl.decoding = "async";
  imageEl.loading = "eager";
  imageEl.referrerPolicy = "no-referrer";
  imageEl.src = result.objectUrl;
  hostEl.appendChild(imageEl);
}

function stopEditPagesAutoScroll() {
  editPagesAutoScrollVelocity = 0;
  if (editPagesAutoScrollRafId !== null) {
    window.cancelAnimationFrame(editPagesAutoScrollRafId);
    editPagesAutoScrollRafId = null;
  }
}

function runEditPagesAutoScroll() {
  if (!editPagesBodyEl || editPagesAutoScrollVelocity === 0) {
    editPagesAutoScrollRafId = null;
    return;
  }
  const nextScrollTop = editPagesBodyEl.scrollTop + editPagesAutoScrollVelocity;
  const maxScrollTop = editPagesBodyEl.scrollHeight - editPagesBodyEl.clientHeight;
  editPagesBodyEl.scrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
  editPagesAutoScrollRafId = window.requestAnimationFrame(runEditPagesAutoScroll);
}

function updateEditPagesAutoScroll(pointerClientY) {
  if (!editPagesBodyEl) return;
  const rect = editPagesBodyEl.getBoundingClientRect();
  const distanceToTop = pointerClientY - rect.top;
  const distanceToBottom = rect.bottom - pointerClientY;
  let velocity = 0;
  if (distanceToTop >= 0 && distanceToTop < EDIT_PAGES_AUTO_SCROLL_EDGE_PX) {
    velocity = -Math.ceil(((EDIT_PAGES_AUTO_SCROLL_EDGE_PX - distanceToTop) / EDIT_PAGES_AUTO_SCROLL_EDGE_PX) * EDIT_PAGES_AUTO_SCROLL_MAX_SPEED_PX);
  } else if (distanceToBottom >= 0 && distanceToBottom < EDIT_PAGES_AUTO_SCROLL_EDGE_PX) {
    velocity = Math.ceil(((EDIT_PAGES_AUTO_SCROLL_EDGE_PX - distanceToBottom) / EDIT_PAGES_AUTO_SCROLL_EDGE_PX) * EDIT_PAGES_AUTO_SCROLL_MAX_SPEED_PX);
  }
  editPagesAutoScrollVelocity = velocity;
  if (velocity !== 0 && editPagesAutoScrollRafId === null) {
    editPagesAutoScrollRafId = window.requestAnimationFrame(runEditPagesAutoScroll);
  } else if (velocity === 0) {
    stopEditPagesAutoScroll();
  }
}

function renderEditPagesRows() {
  if (!editPagesTbodyEl || !editPagesEmptyEl) return;
  editPagesTbodyEl.replaceChildren();
  editPagesEmptyEl.hidden = editPagesList.length > 0;
  for (const [index, page] of editPagesList.entries()) {
    const row = document.createElement("tr");
    row.draggable = true;
    row.dataset.fileName = page.name;

    const pageCell = document.createElement("td");
    pageCell.textContent = String(index + 1);
    const nameCell = document.createElement("td");
    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "editPagesPreviewTrigger";
    previewBtn.textContent = page.name;
    previewBtn.title = "Click to preview";
    previewBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openEditPagesPreview(previewBtn, page.path);
    });
    nameCell.appendChild(previewBtn);

    const markCell = document.createElement("td");
    const markSelect = document.createElement("select");
    markSelect.className = "editPagesMarkSelect";
    markSelect.setAttribute("aria-label", `Mark for page ${index + 1}`);
    for (const markOption of PAGE_MARK_OPTIONS) {
      const optionEl = document.createElement("option");
      optionEl.value = markOption;
      optionEl.textContent = markOption || "None";
      markSelect.appendChild(optionEl);
    }
    markSelect.value = sanitizePageMark(page.mark);
    markSelect.addEventListener("change", () => {
      page.mark = sanitizePageMark(markSelect.value);
    });
    markCell.appendChild(markSelect);

    const actionCell = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "editPagesDeleteBtn button-with-icon danger";
    const deleteIcon = document.createElement("span");
    deleteIcon.className = "icon icon-delete";
    deleteIcon.setAttribute("aria-hidden", "true");
    delBtn.append(deleteIcon, "Delete");
    delBtn.addEventListener("click", () => {
      editPagesList = editPagesList.filter((item) => item.name !== page.name);
      renderEditPagesRows();
    });
    actionCell.appendChild(delBtn);

    row.append(pageCell, nameCell, markCell, actionCell);

    row.addEventListener("dragstart", () => {
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      stopEditPagesAutoScroll();
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      updateEditPagesAutoScroll(event.clientY);
      const draggingEl = editPagesTbodyEl.querySelector("tr.dragging");
      if (!draggingEl || draggingEl === row) return;
      const rect = row.getBoundingClientRect();
      const shouldInsertBefore = event.clientY < rect.top + rect.height / 2;
      if (shouldInsertBefore) {
        editPagesTbodyEl.insertBefore(draggingEl, row);
      } else {
        editPagesTbodyEl.insertBefore(draggingEl, row.nextSibling);
      }
    });

    editPagesTbodyEl.appendChild(row);
  }
}

editPagesBodyEl?.addEventListener("dragover", (event) => {
  if (!editPagesTbodyEl?.querySelector("tr.dragging")) return;
  event.preventDefault();
  updateEditPagesAutoScroll(event.clientY);
});

editPagesBodyEl?.addEventListener("dragleave", (event) => {
  const bodyRect = editPagesBodyEl.getBoundingClientRect();
  const pointerOutsideBody =
    event.clientX < bodyRect.left ||
    event.clientX > bodyRect.right ||
    event.clientY < bodyRect.top ||
    event.clientY > bodyRect.bottom;
  if (pointerOutsideBody) stopEditPagesAutoScroll();
});

editPagesBodyEl?.addEventListener("drop", stopEditPagesAutoScroll);

function syncEditPagesListFromDom() {
  if (!editPagesTbodyEl) return;
  const order = Array.from(editPagesTbodyEl.querySelectorAll("tr[data-file-name]"))
    .map((row) => String(row.dataset.fileName || "").trim())
    .filter(Boolean);
  const lookup = new Map(editPagesList.map((item) => [item.name, item]));
  editPagesList = order.map((name) => lookup.get(name)).filter(Boolean);
}

async function openEditPagesModal(targetDir) {
  const resolvedDir = String(targetDir || "").trim();
  if (!resolvedDir || !editPagesModalEl) return;
  contextMenuController.closeAllContextMenus();
  const res = await window.api.listComicPages(resolvedDir);
  if (!res?.ok) return;
  editPagesTargetDir = resolvedDir;
  editPagesList = (Array.isArray(res.pages) ? res.pages : []).map((page) => ({
    name: String(page?.name || "").trim(),
    path: String(page?.path || "").trim(),
    mark: sanitizePageMark(page?.mark),
  })).filter((page) => page.name && page.path);
  destroyEditPagesPreview();
  renderEditPagesRows();
  editPagesModalEl.style.display = "block";
  updateModalScrollLocks();
}

document.addEventListener("pointerdown", (event) => {
  if (!editPagesPreviewState) return;
  const target = event.target;
  if (!(target instanceof Element)) {
    destroyEditPagesPreview();
    return;
  }
  if (editPagesPreviewState.hostEl?.contains(target) || editPagesPreviewState.anchorEl?.contains(target)) return;
  destroyEditPagesPreview();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") destroyEditPagesPreview();
});

function sanitizeMetadataText(value, maxLength) {
  const normalized = String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.slice(0, maxLength);
}

function sanitizeMetadataNote(value) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 500);
}

function normalizePublishedAtForStorage(value) {
  const normalized = sanitizeMetadataText(value, 64);
  if (!normalized) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map((part) => Number.parseInt(part, 10));
    if (!Number.isInteger(year) || year < 1 || year > 9999) return "";
    if (!Number.isInteger(month) || month < 1 || month > 12) return "";
    if (!Number.isInteger(day) || day < 1 || day > 31) return "";
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year) return "";
    if (candidate.getUTCMonth() !== month - 1) return "";
    if (candidate.getUTCDate() !== day) return "";
    return candidate.toISOString();
  }

  const candidate = new Date(normalized);
  if (!Number.isFinite(candidate.getTime())) return "";
  return candidate.toISOString();
}

function toDateInputValue(value) {
  const normalized = normalizePublishedAtForStorage(value);
  if (!normalized) return "";
  return normalized.slice(0, 10);
}

closeEditBtn.addEventListener("click", closeEditModal);
closeEditPagesBtn?.addEventListener("click", closeEditPagesModal);
cancelEditPagesBtn?.addEventListener("click", closeEditPagesModal);

editModalEl.addEventListener("click", (e) => {
  if (e.target === editModalEl) closeEditModal();
});

editPagesModalEl?.addEventListener("click", (e) => {
  if (e.target === editPagesModalEl) closeEditPagesModal();
});

saveEditBtn.addEventListener("click", async () => {
  if (!editTargetDir) return;
  const targetDir = editTargetDir;
  const payload = {
    title: editTitleInput.value.trim(),
    author: editAuthorInput.value.trim(),
    languages: editLanguagesField.getTags(),
    tags: editTagsField.getTags(),
    parodies: editParodiesField.getTags(),
    characters: editCharactersField.getTags(),
    publishedAt: normalizePublishedAtForStorage(editPublishingDataInput.value),
    note: sanitizeMetadataNote(editNoteInput.value),
  };
  pendingLocalUpdateChangeEvents.add(targetDir);
  const res = await window.api.updateComicMeta(targetDir, payload);
  if (!res?.ok) {
    pendingLocalUpdateChangeEvents.delete(targetDir);
    return;
  }
  closeEditModal();
  const entryDir = res.entry?.dir || targetDir;
  const updatedEntry = {
    ...(libraryItems.find((item) => item.dir === entryDir) || {}),
    ...(res.entry || {}),
    dir: entryDir,
  };
  applyLocalLibraryItems(libraryItems.map((item) =>
    item.dir === entryDir ? updatedEntry : item,
  ));
});

saveEditPagesBtn?.addEventListener("click", async () => {
  if (!editPagesTargetDir) return;
  syncEditPagesListFromDom();
  if (!editPagesList.length) return;
  const targetDir = editPagesTargetDir;
  const payload = {
    pageOrder: editPagesList.map((page) => page.name),
    pageMarks: Object.fromEntries(
      editPagesList
        .map((page) => [page.name, sanitizePageMark(page.mark)])
        .filter(([, mark]) => Boolean(mark)),
    ),
  };
  pendingLocalUpdateChangeEvents.add(targetDir);
  const res = await window.api.updateComicPages?.(targetDir, payload);
  if (!res?.ok) {
    pendingLocalUpdateChangeEvents.delete(targetDir);
    return;
  }
  const entryDir = res.entry?.dir || targetDir;
  const updatedEntry = {
    ...(libraryItems.find((item) => item.dir === entryDir) || {}),
    ...(res.entry || {}),
    dir: entryDir,
  };
  applyLocalLibraryItems(libraryItems.map((item) =>
    item.dir === entryDir ? updatedEntry : item,
  ));
  closeEditPagesModal();
});

deleteComicBtn.addEventListener("click", async () => {
  if (!editTargetDir) return;
  const targetDir = editTargetDir;
  const confirmDelete = await showAppConfirm({
    title: "Delete manga",
    message: `Delete this manga permanently?\n\n${editTargetMeta?.title || "Untitled manga"}`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  });
  if (!confirmDelete) return;
  closeEditModal();
  pendingLocalDeleteChangeEvents.add(targetDir);
  const res = await window.api.deleteComic(targetDir);
  if (!res?.ok) {
    pendingLocalDeleteChangeEvents.delete(targetDir);
    return;
  }
  applyLocalLibraryItems(libraryItems.filter((item) => item.dir !== targetDir));
});

function setSettingsDropdownOpen(open) {
  if (!openSettingsBtn || !settingsDropdownEl) return;
  openSettingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
  settingsDropdownEl.hidden = !open;
}

openSettingsBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = openSettingsBtn.getAttribute("aria-expanded") === "true";
  setSettingsDropdownOpen(!isOpen);
});

settingsMenuOpenSettingsBtn?.addEventListener("click", async () => {
  setSettingsDropdownOpen(false);
  await openSettingsModal();
});

settingsMenuMoveLibraryBtn?.addEventListener("click", async () => {
  setSettingsDropdownOpen(false);
  await openMoveLibraryModal();
});

settingsMenuImportBtn?.addEventListener("click", () => {
  setSettingsDropdownOpen(false);
  window.api.openImporterWindow();
});

settingsMenuExportBtn?.addEventListener("click", () => {
  setSettingsDropdownOpen(false);
  window.api.openExporterWindow();
});

document.addEventListener("click", (event) => {
  if (!settingsDropdownEl || settingsDropdownEl.hidden) return;
  if (!event.target.closest("#settingsMenu")) {
    setSettingsDropdownOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (isModalVisible(appConfirmModalEl)) {
    closeAppConfirmModal(false);
    return;
  }
  if (isModalVisible(editPagesModalEl)) {
    closeEditPagesModal();
    return;
  }
  setSettingsDropdownOpen(false);
});

async function openSettingsModal() {
  await loadSettings();
  await loadAppVersion();
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

async function openMoveLibraryModal() {
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
}

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
      showAppToast(res.warning);
    }
    closeMoveLibraryModal();
    void (async () => {
      await notifyLibraryMoveCompleted(res.migration);
      await loadLibraryPathInfo();
      applyLibraryPathInfo();
      await loadLibrary("library:moved");
    })();
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
      showAppToast(res.warning);
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
    showAppToast(`${res.error}${guidance}`, { timeoutMs: 6000 });
  }
});

vaultUnlockBtn.addEventListener("click", async () => {
  const passphrase = vaultPassInput.value.trim();
  if (!passphrase) {
    showVaultError("Passphrase required.");
    return;
  }

  skipNextSettingsLibraryLoad = true;
  const unlockStartedAt = performance.now();
  const res = await window.api.vaultUnlock(passphrase);
  if (!res?.ok) {
    skipNextSettingsLibraryLoad = false;
    showVaultError(res?.error || "Wrong passphrase.", { shake: true });
    return;
  }
  vaultState = { ...vaultState, unlocked: true, initialized: true };
  hideVaultModal();
  await loadLibrary("vault-unlock");
  await logUnlockLoadTiming(unlockStartedAt);
});

vaultInitBtn.addEventListener("click", async () => {
  const passphrase = vaultPassInput.value.trim();
  const confirmation = vaultPassConfirmInput.value.trim();
  if (!passphrase) {
    showVaultError("Passphrase required.");
    return;
  }
  if (passphrase.length < MIN_VAULT_PASSPHRASE) {
    showVaultError(vaultPolicy.tooShortError);
    return;
  }
  if (passphrase !== confirmation) {
    showVaultError("Passphrases do not match.");
    return;
  }
  skipNextSettingsLibraryLoad = true;
  const res = await window.api.vaultEnable(passphrase);
  if (!res?.ok) {
    skipNextSettingsLibraryLoad = false;
    showVaultError(res?.error || "Failed to set vault passphrase.");
    return;
  }
  vaultState = { initialized: true, unlocked: true };
  hideVaultModal();
  await loadLibrary("vault-enable");
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


async function logUnlockLoadTiming(startedAtMs) {
  const durationMs = Math.max(0, performance.now() - Number(startedAtMs || 0));
  const payload = {
    name: "vault-unlock-library-load",
    durationMs,
    meta: {
      mangaCount: Array.isArray(libraryItems) ? libraryItems.length : 0,
    },
  };
  if (typeof window.api?.logPerfEvent === "function") {
    await window.api.logPerfEvent(payload);
  } else {
    console.log(`[perf] ${payload.name}: ${durationMs.toFixed(2)}ms`);
  }
}

async function openComicFromLibraryEntry(entry) {
  if (!entry?.dir) return;
  await window.api.openReaderWindow(entry.dir);
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

async function toggleFavoriteForEntry(entry) {
  const nextState = !entry.favorite;
  pendingLocalUpdateChangeEvents.add(entry.dir);
  const res = await window.api.toggleFavorite(entry.dir, nextState);
  if (!res?.ok) {
    pendingLocalUpdateChangeEvents.delete(entry.dir);
    return;
  }
  const updated = res.entry || { ...entry, favorite: nextState };
  applyLocalLibraryItems(libraryItems.map((item) =>
    item.dir === entry.dir ? { ...item, favorite: updated.favorite } : item,
  ), { rebuildFacets: false });
}

async function deleteComicEntry(entry) {
  const confirmDelete = await showAppConfirm({
    title: "Delete manga",
    message: `Delete this manga permanently?\n\n${entry?.title || "Untitled manga"}`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  });
  if (!confirmDelete) return;
  closeEditModal();
  await new Promise((resolve) => setTimeout(resolve, 100));
  pendingLocalDeleteChangeEvents.add(entry.dir);
  const res = await window.api.deleteComic(entry.dir);
  if (!res?.ok) {
    pendingLocalDeleteChangeEvents.delete(entry.dir);
    return;
  }
  applyLocalLibraryItems(libraryItems.filter((item) => item.dir !== entry.dir));
}

function createGalleryEmptyState(message) {
  const emptyMessage = document.createElement("div");
  emptyMessage.className = "galleryEmptyMessage";
  emptyMessage.textContent = message;
  return emptyMessage;
}

async function renderLibrary(items) {
  const renderGeneration = ++libraryRenderGeneration;

  if (!Array.isArray(items) || items.length === 0) {
    pruneGalleryCards([]);
    galleryEl.replaceChildren(
      createGalleryEmptyState("Library empty. Use Web Viewer to start a direct download."),
    );
    setLibraryStatus(0, libraryItems.length, 0);
    return;
  }

  pruneGalleryCards(items);
  if (galleryEl.firstElementChild?.classList?.contains("galleryEmptyMessage")) {
    galleryEl.replaceChildren();
  }

  let cursor = galleryEl.firstChild;
  const observedImgs = [];

  for (const c of items) {
    if (renderGeneration !== libraryRenderGeneration) return;

    let cardEntry = galleryCardByDir.get(c.dir);
    if (!cardEntry) {
      cardEntry = createGalleryCard(c);
      galleryCardByDir.set(c.dir, cardEntry);
    }
    updateGalleryCard(cardEntry, c);

    const cardNode = cardEntry.card;
    if (cardNode !== cursor) {
      galleryEl.insertBefore(cardNode, cursor);
    }
    cursor = cardNode.nextSibling;

    if (cardEntry.img && cardEntry.img.dataset.coverPath) {
      observedImgs.push(cardEntry.img);
    }
  }

  initGalleryThumbnails(observedImgs);
  scheduleGalleryThumbEviction();
  setLibraryStatus(items.length, libraryItems.length, items.length);

  while (cursor) {
    const next = cursor.nextSibling;
    const dir = cursor.dataset?.dir;
    if (!dir || !galleryCardByDir.has(dir)) {
      cursor.remove();
    }
    cursor = next;
  }
}

async function loadLibrary(reason = "unspecified") {
  const sequence = ++libraryLoadSequence;
  const requestId = sequence;
  activeLibraryLoadRequestId = requestId;
  progressiveLibraryItems = [];
  setLibraryLoadProgress({ visible: true, loaded: 0, total: 0 });

  const listStartedAt = performance.now();
  const res = await window.api.listLibrary({
    requestId,
    progressive: true,
  });
  const listDurationMs = Math.max(0, performance.now() - listStartedAt);

  if (typeof window.api?.logPerfEvent === "function") {
    await window.api.logPerfEvent({
      name: "gallery-library-list-ipc",
      durationMs: listDurationMs,
      meta: {
        ok: res?.ok === true,
        locked: res?.locked === true,
        reason,
        sequence,
      },
    });
  }

  if (requestId !== activeLibraryLoadRequestId) {
    return;
  }

  if (!res?.ok) {
    setLibraryLoadProgress({ visible: false });
    if (res?.locked) {
      statusEl.textContent = "Vault locked. Unlock to load library.";
      showVaultModal("unlock");
      return;
    }
    statusEl.textContent = "Failed to load library.";
    return;
  }

  const items = res.items || [];
  const domStartedAt = performance.now();
  statusEl.dataset.root = res.root || "-";
  libraryItems = items;
  progressiveLibraryItems = items;
  pruneGalleryCards(items);
  buildTagOptions(items);
  buildLanguageOptions(items);
  applyFilters();
  setLibraryLoadProgress({ visible: false });
  const domDurationMs = Math.max(0, performance.now() - domStartedAt);

  if (typeof window.api?.logPerfEvent === "function") {
    await window.api.logPerfEvent({
      name: "gallery-library-dom-apply",
      durationMs: domDurationMs,
      meta: {
        mangaCount: items.length,
        reason,
        sequence,
      },
    });
  }
}

window.addEventListener("scroll", scheduleGalleryThumbEviction, { passive: true });
window.addEventListener("resize", scheduleGalleryThumbEviction);

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


window.api.onLibraryLoadProgress?.((payload) => {
  if (!payload || Number(payload.requestId) !== activeLibraryLoadRequestId) return;
  const phase = String(payload.phase || "");
  const total = Math.max(0, Number(payload.total) || 0);
  const loaded = Math.max(0, Number(payload.loaded) || 0);

  if (phase === "start") {
    progressiveLibraryItems = [];
    libraryItems = [];
    setLibraryLoadProgress({ visible: true, loaded: 0, total });
    return;
  }

  if (phase === "chunk") {
    const chunkItems = Array.isArray(payload.items) ? payload.items : [];
    if (chunkItems.length > 0) {
      progressiveLibraryItems = progressiveLibraryItems.concat(chunkItems);
      applyLocalLibraryItems(progressiveLibraryItems, { rebuildFacets: false });
    }
    setLibraryLoadProgress({ visible: true, loaded, total });
    return;
  }

  if (phase === "complete") {
    setLibraryLoadProgress({ visible: false });
  }
});

window.api.onLibraryChanged((payload) => {
  const action = String(payload?.action || "");
  const comicDir = String(payload?.comicDir || "");
  if (action === "delete" && comicDir && pendingLocalDeleteChangeEvents.has(comicDir)) {
    pendingLocalDeleteChangeEvents.delete(comicDir);
    return;
  }
  if (action === "update" && comicDir && pendingLocalUpdateChangeEvents.has(comicDir)) {
    pendingLocalUpdateChangeEvents.delete(comicDir);
    return;
  }

  if (action === "delete" && comicDir) {
    applyLocalLibraryItems(libraryItems.filter((item) => item.dir !== comicDir));
    return;
  }

  if (action === "update" && comicDir && payload?.entry && typeof payload.entry === "object") {
    const incomingEntry = { ...payload.entry, dir: comicDir };
    const hasExisting = libraryItems.some((item) => item.dir === comicDir);
    if (!hasExisting) {
      applyLocalLibraryItems([incomingEntry, ...libraryItems]);
      return;
    }
    applyLocalLibraryItems(
      libraryItems.map((item) => (item.dir === comicDir ? { ...item, ...incomingEntry } : item)),
    );
    return;
  }

  void loadLibrary("library:changed");
});
window.api.onOpenComic?.(({ comicDir }) => {
  void openComicByDir(comicDir);
});
window.api.onReaderOpenComics?.((payload) => {
  const nextDirs = Array.isArray(payload?.comicDirs) ? payload.comicDirs : [];
  openComicDirs.clear();
  for (const comicDir of nextDirs) {
    const normalized = String(comicDir || "").trim();
    if (normalized) openComicDirs.add(normalized);
  }
  for (const cardEntry of galleryCardByDir.values()) {
    updateGalleryCard(cardEntry, cardEntry.entry);
  }
});
window.api.onSettingsUpdated?.((settings) => {
  if (!settings) return;
  applySettingsToUI(settings);
  void loadLibraryPathInfo();
  if (skipNextSettingsLibraryLoad) {
    skipNextSettingsLibraryLoad = false;
    return;
  }
  void loadLibrary("settings:updated");
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
  if (!contextMenuController.isClickInsideContextMenus?.(event.target)) {
    contextMenuController.closeAllContextMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    contextMenuController.closeAllContextMenus();
    contextMenuController.stopReaderAutoScroll();
  }
});

window.addEventListener("blur", () => {
  contextMenuController.closeAllContextMenus();
});
window.addEventListener("resize", () => {
  contextMenuController.closeAllContextMenus();
});
window.addEventListener(
  "scroll",
  () => {
    contextMenuController.closeAllContextMenus();
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
    await loadLibrary("init-app-unlocked");
  }
}

initApp();

}
