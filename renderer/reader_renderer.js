const $ = (id) => document.getElementById(id);

const readerEl = $("reader");
const readerTitleEl = $("readerTitle");
const pagesEl = $("pages");
const readerPageSelect = $("readerPageSelect");
const favoriteToggleBtn = $("favoriteToggle");
const editComicBtn = $("editComic");
const readerEditDropdownEl = $("readerEditDropdown");
const readerEditMetadataBtn = $("readerEditMetadata");
const readerEditPagesBtn = $("readerEditPages");
const readManagerToggleBtn = $("readManagerToggle");
const readManagerMenuEl = $("readManagerMenu");
const readManagerSessionListEl = $("readManagerSessionList");

const editModalEl = $("editModal");
const closeEditBtn = $("closeEdit");
const saveEditBtn = $("saveEdit");
const deleteComicBtn = $("deleteComic");
const openFolderBtn = $("openFolder");

const editPagesModalEl = $("editPagesModal");
const closeEditPagesBtn = $("closeEditPages");
const cancelEditPagesBtn = $("cancelEditPages");
const saveEditPagesBtn = $("saveEditPages");
const editPagesTbodyEl = $("editPagesTbody");
const editPagesEmptyEl = $("editPagesEmpty");
const editPagesBodyEl = $("editPagesBody");

const editSourceUrlInput = $("editSourceUrlInput");
const editPublishingDataInput = $("editPublishingDataInput");
const editAddedDateInput = $("editAddedDateInput");
const editNoteInput = $("editNoteInput");
const editTitleInput = $("editTitleInput");
const editAuthorInput = $("editAuthorInput");

const appConfirmModalEl = $("appConfirmModal");
const appConfirmTitleEl = $("appConfirmTitle");
const appConfirmMessageEl = $("appConfirmMessage");
const appConfirmCancelBtn = $("appConfirmCancel");
const appConfirmProceedBtn = $("appConfirmProceed");

let activeComicDir = null;
let activeComicMeta = null;
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

const pendingLocalUpdateChangeEvents = new Set();
const pendingLocalDeleteChangeEvents = new Set();

const readManagerState = {
  sessions: [],
  activeSessionId: null,
};
let isRestoringSessionPage = false;
let sessionActivationToken = 0;

function toAppBlobUrl(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    const drive = normalized[0].toUpperCase();
    const rest = normalized.slice(3);
    return `appblob://${drive}/${rest.split("/").map(encodeURIComponent).join("/")}`;
  }
  return `appblob:///${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

function appBlobFetchOptions(signal) {
  return {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    mode: "same-origin",
    signal,
  };
}

const readerPageControllerModule = window.nviewReaderPageController || {};
const normalizeWindowedResidencyConfig =
  readerPageControllerModule.normalizeWindowedResidencyConfig || ((value) => ({ enabled: Boolean(value?.enabled) }));
const defaultWindowedResidencyConfig =
  readerPageControllerModule.DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG || { enabled: false };

function buildReaderRuntimeConfig(settings) {
  const configured = settings?.reader?.windowedResidency;
  const merged = { ...defaultWindowedResidencyConfig, ...(configured || {}) };
  return {
    windowedResidency: normalizeWindowedResidencyConfig(merged),
  };
}

const readerInstrumentation =
  readerPageControllerModule.createNoopReaderInstrumentation?.() || {
    count: () => {},
    gauge: () => {},
    event: () => {},
    log: () => {},
  };

let readerRuntimeConfig = buildReaderRuntimeConfig(null);

const contextMenuController = window.nviewContextMenu?.createContextMenuController?.({
  doc: document,
  win: window,
  readerEl,
  pagesEl,
  onToggleFavorite: async () => {},
  onEditEntry: () => {},
  onEditPagesEntry: (entry) => { void openEditPagesModal(entry?.dir); },
  onDeleteEntry: async () => {},
}) || {
  closeAllContextMenus: () => {},
  closeReaderContextMenu: () => {},
  isClickInsideContextMenus: () => false,
  isReaderAutoScrollEnabled: () => false,
  showReaderContextMenu: () => {},
  stopReaderAutoScroll: () => {},
};

const readerPageController = readerPageControllerModule.createReaderPageController?.({
  win: window,
  readerEl,
  pagesEl,
  readerPageSelect,
  toAppBlobUrl,
  appBlobFetchOptions,
  readerRuntimeConfig,
  readerInstrumentation,
}) || null;

if (!readerPageController) {
  throw new Error("Reader page controller module failed to initialize");
}

let libraryItems = [];

function applyTheme(isDark) {
  document.body.classList.toggle("dark", Boolean(isDark));
}

function isModalVisible(el) {
  return Boolean(el && el.style.display === "block");
}

function updateModalScrollLocks() {
  const modalOpen = [editModalEl, editPagesModalEl, appConfirmModalEl].some(isModalVisible);
  document.body.classList.toggle("modal-open", modalOpen);
}

const sharedTagInput = window.nviewTagInput || {};
const normalizeTagValue = sharedTagInput.normalizeValue || ((value) => String(value || "").trim());
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

function createSuggestionMenu(menuEl) {
  const sharedCreateSuggestionMenu = sharedTagInput.createSuggestionMenu;
  if (typeof sharedCreateSuggestionMenu === "function") {
    return sharedCreateSuggestionMenu(menuEl, {
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

    table.append(thead, tbody);
    menuEl.replaceChildren(table);
    menuEl.hidden = false;
  }

  return { show, hide };
}

function createEditAutocompleteInput({ inputEl, suggestionsEl, getSuggestions }) {
  if (!inputEl) {
    return {
      setValue: () => {},
      getValue: () => "",
      refresh: () => {},
    };
  }

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
    setValue(value) {
      inputEl.value = normalizeTagValue(value);
    },
    getValue() {
      return normalizeTagValue(inputEl.value);
    },
    refresh() {
      if (document.activeElement === inputEl) show();
    },
  };
}

const emptyTagInput = {
  clear: () => {},
  getTags: () => [],
  setTags: () => {},
};

function createTagInput(inputId, chipsId, suggestionsId, { maxTags = Number.POSITIVE_INFINITY, getSuggestions = () => [] } = {}) {
  const inputEl = $(inputId);
  const chipsEl = $(chipsId);
  const suggestionsEl = $(suggestionsId);
  if (!inputEl) return emptyTagInput;
  if (!window.nviewTagInput?.createTagInput) return emptyTagInput;
  return window.nviewTagInput.createTagInput({
    inputEl,
    chipsEl,
    suggestionsEl,
    getSuggestions,
    maxTags,
    suppressChipClicks: true,
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

const editArtistField = createEditAutocompleteInput({
  inputEl: editAuthorInput,
  suggestionsEl: $("editArtistSuggestions"),
  getSuggestions: () => libraryItems.map((item) => item?.artist).filter(Boolean),
});
const editLanguagesField = createTagInput("editLanguagesInput", "editLanguagesChips", "editLanguagesSuggestions", {
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item?.languages) ? item.languages : [])),
});
const editParodiesField = createTagInput("editParodiesInput", "editParodiesChips", "editParodiesSuggestions", {
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item?.parodies) ? item.parodies : [])),
});
const editCharactersField = createTagInput("editCharactersInput", "editCharactersChips", "editCharactersSuggestions", {
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item?.characters) ? item.characters : [])),
});
const editTagsField = createTagInput("editTagsInput", "editTagsChips", "editTagsSuggestions", {
  getSuggestions: () => libraryItems.flatMap((item) => (Array.isArray(item?.tags) ? item.tags : [])),
});

function createSessionId(comicDir) {
  return `session:${String(comicDir || "").trim().toLowerCase()}`;
}

function getActiveSession() {
  if (!readManagerState.activeSessionId) return null;
  return readManagerState.sessions.find((session) => session.id === readManagerState.activeSessionId) || null;
}

function updateActiveSessionRefs() {
  const activeSession = getActiveSession();
  activeComicDir = activeSession?.comicDir || null;
  activeComicMeta = activeSession?.comicMeta || null;
}

function closeReadManagerMenu() {
  if (!readManagerMenuEl) return;
  readManagerMenuEl.hidden = true;
  readManagerToggleBtn?.setAttribute("aria-expanded", "false");
}

function openReadManagerMenu() {
  if (!readManagerMenuEl) return;
  readManagerMenuEl.hidden = false;
  readManagerToggleBtn?.setAttribute("aria-expanded", "true");
}

function toggleReadManagerMenu() {
  if (!readManagerMenuEl) return;
  if (readManagerMenuEl.hidden) openReadManagerMenu();
  else closeReadManagerMenu();
}

function captureSessionState(sessionId) {
  const session = readManagerState.sessions.find((entry) => entry.id === sessionId);
  if (!session) return;
  const pageIndex = Number(readerPageController.getCurrentPageIndex?.());
  if (!Number.isInteger(pageIndex) || pageIndex < 0) return;
  const maxIndex = Math.max(0, (readerPageController.getPageCount?.() || 1) - 1);
  session.selectedPageIndex = Math.max(0, Math.min(pageIndex, maxIndex));
  session.lastOpenedAt = Date.now();
}

function captureActiveSessionState() {
  if (!readManagerState.activeSessionId) return;
  captureSessionState(readManagerState.activeSessionId);
}

function renderReadManager() {
  if (!readManagerSessionListEl) return;
  readManagerSessionListEl.textContent = "";

  if (!readManagerState.sessions.length) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "read-manager-empty";
    emptyEl.textContent = "No open manga.";
    readManagerSessionListEl.appendChild(emptyEl);
    return;
  }

  for (const session of readManagerState.sessions) {
    const sessionEl = document.createElement("button");
    sessionEl.type = "button";
    sessionEl.className = "read-manager-session-item";
    sessionEl.setAttribute("role", "menuitem");
    if (session.id === readManagerState.activeSessionId) {
      sessionEl.classList.add("is-active");
    }

    const labelWrap = document.createElement("span");
    const titleEl = document.createElement("span");
    titleEl.className = "read-manager-session-title";
    titleEl.textContent = session.title || "Reader";
    const subEl = document.createElement("span");
    subEl.className = "read-manager-session-sub";
    subEl.textContent = formatSessionSubtitle(session);
    labelWrap.append(titleEl, subEl);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "read-manager-session-close";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close";
    closeBtn.setAttribute("aria-label", `Close ${session.title || "session"}`);
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      void closeSessionById(session.id);
    });

    sessionEl.append(labelWrap, closeBtn);
    sessionEl.addEventListener("click", () => {
      void activateSession(session.id);
      closeReadManagerMenu();
    });
    readManagerSessionListEl.appendChild(sessionEl);
  }
}

function formatSessionSubtitle(session) {
  const artist = String(session?.comicMeta?.artist || "").trim() || "Unknown artist";
  const pages = Math.max(
    0,
    Number(
      session?.comicMeta?.pagesFound
      || session?.comicMeta?.pageCount
      || session?.comicMeta?.page_count
      || (Array.isArray(session?.pages) ? session.pages.length : 0),
    ) || 0,
  );
  return `${artist} • ${pages} pages`;
}

function closeReaderWindow() {
  window.close();
}

async function syncOpenComicDirs() {
  const syncFn = window.readerApi?.syncOpenComics;
  if (!syncFn) return;
  const dirs = readManagerState.sessions.map((session) => session?.comicDir).filter(Boolean);
  await syncFn(dirs);
}

const readerRuntime = window.nviewReaderRuntime?.createReaderRuntime?.({
  doc: document,
  win: window,
  readerEl,
  readerTitleEl,
  pagesEl,
  closeReaderBtn: null,
  favoriteToggleBtn,
  readerPageController,
  contextMenuController,
  onFavoriteToggle: async ({ comicDir, comicMeta, nextFavorite }) => {
    const res = await window.readerApi.toggleFavorite(comicDir, nextFavorite);
    if (!res?.ok) return null;
    activeComicMeta = res.entry || { ...comicMeta, favorite: nextFavorite };
    const activeSession = getActiveSession();
    if (activeSession) {
      activeSession.comicMeta = activeComicMeta;
      activeSession.title = activeComicMeta?.title || activeSession.title;
    }
    renderReadManager();
    return activeComicMeta;
  },
  onReaderOpen: () => {
    document.title = activeComicMeta?.title ? `${activeComicMeta.title} · Reader` : "Reader";
  },
  onReaderClose: () => {
    activeComicDir = null;
    activeComicMeta = null;
    closeEditModal();
    closeEditPagesModal();
    document.title = "Reader";
  },
});

if (!readerRuntime) {
  throw new Error("Reader runtime failed to initialize");
}

function openEditModal(targetMeta = activeComicMeta, targetDir = activeComicDir) {
  if (!targetMeta || !targetDir || !editModalEl) return;
  contextMenuController.closeAllContextMenus();
  editTargetDir = targetDir;
  editTargetMeta = targetMeta;

  if (editSourceUrlInput) editSourceUrlInput.value = targetMeta.sourceUrl || "-";
  if (editPublishingDataInput) {
    editPublishingDataInput.value = toDateInputValue(targetMeta.publishedAt || "");
  }
  if (editAddedDateInput) {
    editAddedDateInput.value = targetMeta.savedAt || "-";
  }
  if (editNoteInput) {
    editNoteInput.value = targetMeta.note || "";
  }
  if (editTitleInput) editTitleInput.value = targetMeta.title || "";
  editArtistField.setValue(targetMeta.artist || "");
  editArtistField.refresh();
  editLanguagesField.setTags(targetMeta.languages);
  editTagsField.setTags(targetMeta.tags);
  editParodiesField.setTags(targetMeta.parodies);
  editCharactersField.setTags(targetMeta.characters);

  editModalEl.style.display = "block";
  updateModalScrollLocks();
  editTitleInput?.focus();
  editTitleInput?.select();
}

function closeEditModal() {
  if (!editModalEl) return;
  editModalEl.style.display = "none";
  updateModalScrollLocks();
  editTargetDir = null;
  editTargetMeta = null;
}


function setReaderEditDropdownOpen(open) {
  if (!editComicBtn || !readerEditDropdownEl) return;
  editComicBtn.setAttribute("aria-expanded", open ? "true" : "false");
  readerEditDropdownEl.hidden = !open;
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

    row.addEventListener("dragstart", () => row.classList.add("dragging"));
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
      if (shouldInsertBefore) editPagesTbodyEl.insertBefore(draggingEl, row);
      else editPagesTbodyEl.insertBefore(draggingEl, row.nextSibling);
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
  const orderedNames = Array.from(editPagesTbodyEl.querySelectorAll("tr[data-file-name]"))
    .map((row) => String(row.dataset.fileName || "").trim())
    .filter(Boolean);
  const lookup = new Map(editPagesList.map((item) => [item.name, item]));
  editPagesList = orderedNames.map((name) => lookup.get(name)).filter(Boolean);
}

async function openEditPagesModal(targetDir = activeComicDir) {
  const resolvedDir = String(targetDir || "").trim();
  if (!resolvedDir || !editPagesModalEl) return;
  contextMenuController.closeAllContextMenus();
  const res = await window.readerApi.listComicPages(resolvedDir);
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

function showAppConfirm({ title, message, confirmLabel, cancelLabel }) {
  return new Promise((resolve) => {
    if (!appConfirmModalEl) {
      resolve(window.confirm(message || title || "Confirm action?"));
      return;
    }

    if (appConfirmTitleEl) appConfirmTitleEl.textContent = title || "Confirm action";
    if (appConfirmMessageEl) appConfirmMessageEl.textContent = message || "";
    if (appConfirmProceedBtn) appConfirmProceedBtn.textContent = confirmLabel || "Confirm";
    if (appConfirmCancelBtn) appConfirmCancelBtn.textContent = cancelLabel || "Cancel";

    const close = (accepted) => {
      appConfirmModalEl.style.display = "none";
      updateModalScrollLocks();
      appConfirmCancelBtn?.removeEventListener("click", onCancel);
      appConfirmProceedBtn?.removeEventListener("click", onProceed);
      appConfirmModalEl.removeEventListener("click", onBackdrop);
      resolve(accepted);
    };

    const onCancel = () => close(false);
    const onProceed = () => close(true);
    const onBackdrop = (event) => {
      if (event.target === appConfirmModalEl) close(false);
    };

    appConfirmCancelBtn?.addEventListener("click", onCancel);
    appConfirmProceedBtn?.addEventListener("click", onProceed);
    appConfirmModalEl.addEventListener("click", onBackdrop);
    appConfirmModalEl.style.display = "flex";
    updateModalScrollLocks();
    appConfirmCancelBtn?.focus();
  });
}

async function activateSession(sessionId) {
  const targetSession = readManagerState.sessions.find((session) => session.id === sessionId);
  if (!targetSession) return;

  const previousSessionId = readManagerState.activeSessionId;
  if (previousSessionId && previousSessionId !== sessionId) {
    captureSessionState(previousSessionId);
  }

  const activationToken = sessionActivationToken + 1;
  sessionActivationToken = activationToken;
  isRestoringSessionPage = true;
  readManagerState.activeSessionId = sessionId;
  targetSession.lastOpenedAt = Date.now();
  updateActiveSessionRefs();

  readerRuntime.open({
    title: targetSession.title || "Reader",
    comicDir: targetSession.comicDir,
    comicMeta: targetSession.comicMeta,
    pages: targetSession.pages || [],
  });

  if (readerPageController.hasPages?.()) {
    const maxIndex = Math.max(0, (readerPageController.getPageCount?.() || 1) - 1);
    const savedIndex = Number.isInteger(targetSession.selectedPageIndex)
      ? Math.max(0, Math.min(targetSession.selectedPageIndex, maxIndex))
      : 0;
    targetSession.selectedPageIndex = savedIndex;
    readerPageController.scrollToPage?.(savedIndex, "auto", false);
  }

  window.requestAnimationFrame(() => {
    if (activationToken !== sessionActivationToken) return;
    isRestoringSessionPage = false;
  });

  renderReadManager();
}

async function closeSessionById(sessionId) {
  const targetIndex = readManagerState.sessions.findIndex((session) => session.id === sessionId);
  if (targetIndex < 0) return;
  const wasActive = readManagerState.activeSessionId === sessionId;
  if (wasActive) captureActiveSessionState();

  readManagerState.sessions.splice(targetIndex, 1);

  if (!readManagerState.sessions.length) {
    readManagerState.activeSessionId = null;
    updateActiveSessionRefs();
    readerRuntime.close();
    renderReadManager();
    await syncOpenComicDirs();
    closeReaderWindow();
    return;
  }

  if (wasActive) {
    const nextSession = readManagerState.sessions[0];
    await activateSession(nextSession.id);
  }

  renderReadManager();
  await syncOpenComicDirs();
}

async function openComicByDir(comicDir) {
  const targetDir = String(comicDir || "").trim();
  if (!targetDir) return;
  const sessionId = createSessionId(targetDir);
  const existingSession = readManagerState.sessions.find((session) => session.id === sessionId);
  if (existingSession) {
    await activateSession(existingSession.id);
    await syncOpenComicDirs();
    return;
  }

  const res = await window.readerApi.listComicPages(targetDir);
  if (!res?.ok) return;

  readManagerState.sessions.push({
    id: sessionId,
    comicDir: targetDir,
    title: res.comic?.title || "Reader",
    comicMeta: res.comic || null,
    pages: Array.isArray(res.pages) ? res.pages : [],
    selectedPageIndex: 0,
    lastOpenedAt: Date.now(),
  });

  await activateSession(sessionId);
  await syncOpenComicDirs();
}


async function syncReaderTheme() {
  const response = await window.readerApi.getSettings?.();
  if (!response?.ok) return;
  applyTheme(response.settings?.darkMode);
  readerRuntimeConfig = buildReaderRuntimeConfig(response.settings);
  readerPageController.setRuntimeConfig?.(readerRuntimeConfig);
}

async function hydrateEditSuggestions() {
  const response = await window.readerApi.listAllComics?.();
  if (!response?.ok) return;
  const nextItems = Array.isArray(response.comics)
    ? response.comics
    : (Array.isArray(response.items) ? response.items : []);
  libraryItems = nextItems;
}

window.readerApi.onOpenComic?.(({ comicDir }) => {
  void openComicByDir(comicDir);
});

void syncOpenComicDirs();
window.addEventListener("beforeunload", () => {
  void window.readerApi?.syncOpenComics?.([]);
});

window.readerApi.onLibraryChanged?.((payload) => {
  const action = String(payload?.action || "");
  const payloadDir = String(payload?.comicDir || "");

  if (action === "delete" && payloadDir && pendingLocalDeleteChangeEvents.has(payloadDir)) {
    pendingLocalDeleteChangeEvents.delete(payloadDir);
    return;
  }

  if (action === "update" && payloadDir && pendingLocalUpdateChangeEvents.has(payloadDir)) {
    pendingLocalUpdateChangeEvents.delete(payloadDir);
    return;
  }

  void hydrateEditSuggestions();

  if (!payloadDir) return;

  const targetSession = readManagerState.sessions.find((session) => session.comicDir === payloadDir);
  if (!targetSession) return;

  if (action === "delete") {
    void closeSessionById(targetSession.id);
    return;
  }

  if (action === "update") {
    if (payload?.pagesUpdated) {
      void (async () => {
        const refreshed = await window.readerApi.listComicPages(payloadDir);
        if (!refreshed?.ok) return;
        targetSession.pages = Array.isArray(refreshed.pages) ? refreshed.pages : [];
        targetSession.comicMeta = refreshed.comic || targetSession.comicMeta;
        targetSession.title = targetSession.comicMeta?.title || targetSession.title;
        if (targetSession.id === readManagerState.activeSessionId) {
          const activeIndex = Math.max(0, readerPageController.getCurrentPageIndex?.() || 0);
          readerRuntime.open({
            title: targetSession.title || "Reader",
            comicDir: targetSession.comicDir,
            comicMeta: targetSession.comicMeta,
            pages: targetSession.pages,
          });
          const maxIndex = Math.max(0, (readerPageController.getPageCount?.() || 1) - 1);
          readerPageController.scrollToPage?.(Math.min(activeIndex, maxIndex), "auto", false);
        }
        renderReadManager();
      })();
      return;
    }
    const incomingEntry = payload?.entry && typeof payload.entry === "object"
      ? { ...payload.entry, dir: payloadDir }
      : null;

    if (incomingEntry) {
      targetSession.comicMeta = { ...(targetSession.comicMeta || {}), ...incomingEntry };
      targetSession.title = incomingEntry.title || targetSession.title;
      targetSession.lastOpenedAt = Date.now();
      if (targetSession.id === readManagerState.activeSessionId && activeComicDir === payloadDir) {
        activeComicMeta = { ...(activeComicMeta || {}), ...incomingEntry };
        const updatedTitle = activeComicMeta?.title || targetSession.title || "Reader";
        readerRuntime.setTitle(updatedTitle);
        readerRuntime.setCurrentComicMeta(activeComicMeta);
        document.title = `${updatedTitle} · Reader`;
      }
      renderReadManager();
      return;
    }

    if (targetSession.id !== readManagerState.activeSessionId) {
      targetSession.lastOpenedAt = Date.now();
      renderReadManager();
      return;
    }
    const currentDir = activeComicDir;
    if (currentDir) {
      readManagerState.sessions = readManagerState.sessions.filter((session) => session.id !== targetSession.id);
      readManagerState.activeSessionId = null;
      void openComicByDir(currentDir);
    }
  }
});


window.readerApi.onSettingsUpdated?.((settings) => {
  applyTheme(settings?.darkMode);
  readerRuntimeConfig = buildReaderRuntimeConfig(settings);
  readerPageController.setRuntimeConfig?.(readerRuntimeConfig);
});

openFolderBtn?.addEventListener("click", async () => {
  const targetDir = editTargetDir || activeComicDir;
  if (!targetDir) return;
  await window.readerApi.showInFolder(targetDir);
});

editComicBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = editComicBtn.getAttribute("aria-expanded") === "true";
  setReaderEditDropdownOpen(!isOpen);
});

readerEditMetadataBtn?.addEventListener("click", () => {
  setReaderEditDropdownOpen(false);
  if (!activeComicMeta) return;
  openEditModal();
});

readerEditPagesBtn?.addEventListener("click", () => {
  setReaderEditDropdownOpen(false);
  void openEditPagesModal();
});

closeEditBtn?.addEventListener("click", closeEditModal);
closeEditPagesBtn?.addEventListener("click", closeEditPagesModal);
cancelEditPagesBtn?.addEventListener("click", closeEditPagesModal);

editModalEl?.addEventListener("click", (event) => {
  if (event.target === editModalEl) closeEditModal();
});

editPagesModalEl?.addEventListener("click", (event) => {
  if (event.target === editPagesModalEl) closeEditPagesModal();
});

saveEditBtn?.addEventListener("click", async () => {
  if (!editTargetDir || !activeComicDir) return;
  const targetDir = editTargetDir;
  const payload = {
    title: editTitleInput?.value.trim() || "",
    author: editArtistField.getValue?.() || "",
    languages: editLanguagesField.getTags(),
    tags: editTagsField.getTags(),
    parodies: editParodiesField.getTags(),
    characters: editCharactersField.getTags(),
    publishedAt: normalizePublishedAtForStorage(editPublishingDataInput?.value),
    note: sanitizeMetadataNote(editNoteInput?.value),
  };

  pendingLocalUpdateChangeEvents.add(targetDir);
  const res = await window.readerApi.updateComicMeta(targetDir, payload);
  if (!res?.ok) {
    pendingLocalUpdateChangeEvents.delete(targetDir);
    return;
  }

  if (targetDir === activeComicDir) {
    const updatedTitle = res.entry?.title || payload.title || readerTitleEl.textContent;
    readerRuntime.setTitle(updatedTitle);
    document.title = `${updatedTitle} · Reader`;
    activeComicMeta = res.entry || activeComicMeta;
    const activeSession = getActiveSession();
    if (activeSession) {
      activeSession.comicMeta = activeComicMeta;
      activeSession.title = updatedTitle;
    }
    readerRuntime.setCurrentComicMeta(activeComicMeta);
    renderReadManager();
  }

  closeEditModal();
});

saveEditPagesBtn?.addEventListener("click", async () => {
  if (!editPagesTargetDir) return;
  syncEditPagesListFromDom();
  if (!editPagesList.length) return;
  const targetDir = editPagesTargetDir;
  pendingLocalUpdateChangeEvents.add(targetDir);
  const res = await window.readerApi.updateComicPages?.(targetDir, {
    pageOrder: editPagesList.map((item) => item.name),
    pageMarks: Object.fromEntries(
      editPagesList
        .map((item) => [item.name, sanitizePageMark(item.mark)])
        .filter(([, mark]) => Boolean(mark)),
    ),
  });
  if (!res?.ok) {
    pendingLocalUpdateChangeEvents.delete(targetDir);
    return;
  }

  const targetSession = readManagerState.sessions.find((session) => session.comicDir === targetDir);
  if (targetSession) {
    const refreshed = await window.readerApi.listComicPages(targetDir);
    if (refreshed?.ok) {
      targetSession.pages = Array.isArray(refreshed.pages) ? refreshed.pages : [];
      targetSession.comicMeta = refreshed.comic || targetSession.comicMeta;
      targetSession.title = targetSession.comicMeta?.title || targetSession.title;

      if (targetSession.id === readManagerState.activeSessionId) {
        const activeIndex = Math.max(0, readerPageController.getCurrentPageIndex?.() || 0);
        readerRuntime.open({
          title: targetSession.title || "Reader",
          comicDir: targetSession.comicDir,
          comicMeta: targetSession.comicMeta,
          pages: targetSession.pages,
        });
        const maxIndex = Math.max(0, (readerPageController.getPageCount?.() || 1) - 1);
        readerPageController.scrollToPage?.(Math.min(activeIndex, maxIndex), "auto", false);
      }
      renderReadManager();
    }
  }

  closeEditPagesModal();
});

deleteComicBtn?.addEventListener("click", async () => {
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
  if (activeComicDir === targetDir) {
    const activeSession = getActiveSession();
    if (activeSession) {
      void closeSessionById(activeSession.id);
    }
  }

  pendingLocalDeleteChangeEvents.add(targetDir);
  const res = await window.readerApi.deleteComic(targetDir);
  if (!res?.ok) {
    pendingLocalDeleteChangeEvents.delete(targetDir);
    if (activeComicDir !== targetDir) return;
  }
});

readManagerToggleBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleReadManagerMenu();
});

document.addEventListener("click", (event) => {
  if (
    readManagerMenuEl
    && !readManagerMenuEl.hidden
    && !readManagerMenuEl.contains(event.target)
    && event.target !== readManagerToggleBtn
  ) {
    closeReadManagerMenu();
  }
  if (readerEditDropdownEl && !readerEditDropdownEl.hidden && !event.target.closest("#readerEditMenu")) {
    setReaderEditDropdownOpen(false);
  }
  if (!contextMenuController.isClickInsideContextMenus?.(event.target)) {
    contextMenuController.closeAllContextMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeReadManagerMenu();
  setReaderEditDropdownOpen(false);
  contextMenuController.closeAllContextMenus();
  contextMenuController.stopReaderAutoScroll();
  if (editPagesModalEl?.style.display === "block") {
    closeEditPagesModal();
    event.preventDefault();
    return;
  }
  if (editModalEl?.style.display === "block") {
    closeEditModal();
    event.preventDefault();
  }
});

window.addEventListener("blur", () => {
  closeReadManagerMenu();
  setReaderEditDropdownOpen(false);
  contextMenuController.closeAllContextMenus();
});


pagesEl?.addEventListener("scroll", () => {
  if (isRestoringSessionPage) return;
  captureActiveSessionState();
}, { passive: true });

window.addEventListener("beforeunload", () => {
  captureActiveSessionState();
});

void Promise.all([syncReaderTheme(), hydrateEditSuggestions()]);
renderReadManager();
