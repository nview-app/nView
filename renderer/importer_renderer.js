const __nviewBridgeGuard = window.nviewBridgeGuard;
if (!__nviewBridgeGuard?.guardRenderer?.({ windowName: "Importer", required: ["importerApi"] })) {
  // Bridge API missing: fail fast after rendering guard UI.
} else {
const chooseRootBtn = document.getElementById("chooseRoot");
const chooseSingleMangaBtn = document.getElementById("chooseSingleManga");
const runImportBtn = document.getElementById("runImport");
const importRootPathEl = document.getElementById("importRootPath");
const importSummaryEl = document.getElementById("importSummary");
const candidateListEl = document.getElementById("candidateList");
const candidateTitleEl = document.getElementById("candidateTitle");
const candidateStatusEl = document.getElementById("candidateStatus");
const candidateFilesEl = document.getElementById("candidateFiles");
const importResultsEl = document.getElementById("importResults");
const detailIssuesEl = document.getElementById("candidateIssues");
const detailPreviewEl = document.getElementById("candidatePreviewFiles");
const detailEligibilityEl = document.getElementById("candidateEligibility");
const selectAllBtn = document.getElementById("selectAllCandidates");
const selectReadyBtn = document.getElementById("selectReadyCandidates");
const deselectAllBtn = document.getElementById("deselectAllCandidates");

const metaTitleEl = document.getElementById("metaTitle");
const metaArtistEl = document.getElementById("metaArtist");
const metaLanguageEl = document.getElementById("metaLanguage");
const metaTagsEl = document.getElementById("metaTags");
const metaTagsChipsEl = document.getElementById("metaTagsChips");
const metadataTemplateLinkEl = document.getElementById("metadataTemplateLink");
const stepPill3El = document.getElementById("stepPill3");
const stepPill4El = document.getElementById("stepPill4");
const step4PaneTitleEl = document.getElementById("step4PaneTitle");

const stepSections = Array.from(document.querySelectorAll("[data-step-section]"));
const stepIndicators = Array.from(document.querySelectorAll("[data-step-indicator]"));
const prevStepBtn = document.getElementById("prevStepBtn");
const nextStepBtn = document.getElementById("nextStepBtn");
const applyTemplateBtn = document.getElementById("applyTemplateBtn");
const templateArtistEl = document.getElementById("templateArtist");
const templateLanguageEl = document.getElementById("templateLanguage");
const templateTagsEl = document.getElementById("templateTags");
const templateTagsChipsEl = document.getElementById("templateTagsChips");
const templateInfoEl = document.getElementById("templateInfo");
const progressSummaryEl = document.getElementById("importProgressSummary");
const progressBarEl = document.getElementById("importProgressBar");
const importedCountEl = document.getElementById("importedCount");
const skippedCountEl = document.getElementById("skippedCount");
const failedCountEl = document.getElementById("failedCount");
const metaArtistSuggestionsEl = document.getElementById("metaArtistSuggestions");
const metaLanguageSuggestionsEl = document.getElementById("metaLanguageSuggestions");
const metaTagSuggestionsEl = document.getElementById("metaTagSuggestions");
const templateArtistSuggestionsEl = document.getElementById("templateArtistSuggestions");
const templateLanguageSuggestionsEl = document.getElementById("templateLanguageSuggestions");
const templateTagSuggestionsEl = document.getElementById("templateTagSuggestions");
const stepOneMessageEl = document.getElementById("stepOneMessage");
const stepThreeSectionEl = document.querySelector("[data-step-section=\"3\"]");
const stepTwoSectionEl = document.querySelector("[data-step-section=\"2\"]");
const stepTwoIndicatorEl = document.getElementById("stepPill2");

let rootPath = "";
let candidates = [];
let selectedKey = "";
let runImportBusy = false;
let currentStep = 1;
let latestProgress = null;
let importMode = "";
let metadataSuggestions = {
  artists: [],
  languages: [],
  tags: [],
};
const sharedTagInput = window.nviewTagInput || {};
const normalizeTag = sharedTagInput.normalizeValue || ((value) => String(value || "").trim());
const dedupeTags = sharedTagInput.dedupeValues || ((values) => {
  const normalized = [];
  const seen = new Set();
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = normalizeTag(rawValue);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
});
const createSharedTagInput = sharedTagInput.createTagInput;
const createSharedSuggestionMenu = sharedTagInput.createSuggestionMenu;

function applyTheme(isDark) {
  document.body.classList.toggle("dark", Boolean(isDark));
}

async function loadSettings() {
  const res = await window.importerApi.getSettings();
  if (res?.ok) applyTheme(res.settings?.darkMode);
}

const templateTagInput = createTagInput({
  inputEl: templateTagsEl,
  chipsEl: templateTagsChipsEl,
  suggestionsEl: templateTagSuggestionsEl,
  getSuggestions: () => metadataSuggestions.tags,
  suppressChipClicks: true,
});
const metaTagInput = createTagInput({
  inputEl: metaTagsEl,
  chipsEl: metaTagsChipsEl,
  suggestionsEl: metaTagSuggestionsEl,
  getSuggestions: () => metadataSuggestions.tags,
  suppressChipClicks: true,
  onChange: applyMetadataEdits,
});


function setButtonWithIconLabel(button, { label, iconClass = "", iconAtEnd = false }) {
  if (!button) return;
  const text = document.createElement("span");
  text.textContent = String(label || "");

  if (!iconClass) {
    button.replaceChildren(text);
    return;
  }

  const icon = document.createElement("span");
  icon.className = `icon ${iconClass}`.trim();
  icon.setAttribute("aria-hidden", "true");

  if (iconAtEnd) {
    button.replaceChildren(text, icon);
  } else {
    button.replaceChildren(icon, text);
  }
}

function setRunImportBusy(isBusy) {
  runImportBusy = !!isBusy;
  setButtonWithIconLabel(runImportBtn, {
    iconClass: "icon-download",
    label: isBusy ? "Importing..." : "Import selected",
  });
  summarize();
}

function selectedCandidate() {
  return candidates.find((item) => item.key === selectedKey) || null;
}

function createSuggestionMenu(menuEl) {
  if (typeof createSharedSuggestionMenu === "function") {
    return createSharedSuggestionMenu(menuEl, {
      tableClassName: "importerSuggestionTable",
      optionClassName: "importerSuggestionOption",
      headerLabel: "Select from list",
      tableAriaLabel: "Suggestions",
      mapOptionValue: (item) => item?.value,
      buildRows(entries, onPick, options) {
        return entries.map((item) => {
          const value = String(item?.value || "");
          const row = document.createElement("tr");
          const valueCell = document.createElement("td");
          const optionBtn = document.createElement("button");
          optionBtn.type = "button";
          optionBtn.className = options.optionClassName || "";
          optionBtn.setAttribute("title", `Use ${value}`);
          optionBtn.textContent = value;
          optionBtn.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });
          optionBtn.addEventListener("click", () => {
            onPick(value);
          });
          valueCell.appendChild(optionBtn);
          row.append(valueCell);
          return row;
        });
      },
    });
  }

  function hide() {
    if (!menuEl) return;
    menuEl.hidden = true;
    menuEl.replaceChildren();
  }

  function contains(node) {
    return !!(menuEl && node && menuEl.contains(node));
  }

  function show(items, onPick) {
    if (!menuEl) return;
    const values = Array.isArray(items) ? items : [];
    if (!values.length) {
      hide();
      return;
    }

    const table = document.createElement("table");
    table.className = "importerSuggestionTable";
    table.setAttribute("aria-label", "Suggestions");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const valueHead = document.createElement("th");
    valueHead.textContent = "Select from list";
    headerRow.append(valueHead);
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    for (const item of values) {
      const row = document.createElement("tr");
      const valueCell = document.createElement("td");
      const optionBtn = document.createElement("button");
      optionBtn.type = "button";
      optionBtn.className = "importerSuggestionOption";
      optionBtn.setAttribute("title", `Use ${item.value}`);
      optionBtn.textContent = item.value;
      optionBtn.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      optionBtn.addEventListener("click", () => {
        onPick(item.value);
      });
      valueCell.appendChild(optionBtn);
      row.append(valueCell);
      tbody.appendChild(row);
    }

    table.append(thead, tbody);
    menuEl.replaceChildren();
    menuEl.appendChild(table);
    menuEl.hidden = false;
  }

  return { show, hide, contains };
}

function dedupeValues(values) {
  const normalized = [];
  const seen = new Set();
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = String(rawValue || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function buildTagAutocompleteValues(draftTag, selectedTags, getSuggestions) {
  const allTags = dedupeTags(typeof getSuggestions === "function" ? getSuggestions() : []);
  const selectedLookup = new Set(dedupeTags(selectedTags).map((tag) => tag.toLowerCase()));
  const query = normalizeTag(draftTag).toLowerCase();

  return allTags.filter((tag) => {
    const lower = tag.toLowerCase();
    if (selectedLookup.has(lower)) return false;
    if (!query) return true;
    return lower.includes(query);
  });
}

function createTagInput({ inputEl, chipsEl, suggestionsEl, getSuggestions, onChange, suppressChipClicks = false }) {
  if (typeof createSharedTagInput === "function") {
    return createSharedTagInput({
      inputEl,
      chipsEl,
      suggestionsEl,
      getSuggestions,
      onChange,
      suppressChipClicks,
      chipClassName: "tagChip",
      chipRemoveClassName: "tagChipRemove",
      suggestionMenu: {
        tableClassName: "importerSuggestionTable",
        optionClassName: "importerSuggestionOption",
        headerLabel: "Select from list",
        tableAriaLabel: "Suggestions",
      },
      showSuggestionsOn: "pointer",
    });
  }

  const suggestionMenu = createSuggestionMenu(suggestionsEl);
  const state = { tags: [] };
  let suggestionTriggeredByClick = false;

  function emitChange() {
    if (typeof onChange === "function") onChange();
  }

  function showTagSuggestions(draftTag) {
    if (!suggestionTriggeredByClick) {
      suggestionMenu.hide();
      return;
    }
    const rows = buildTagAutocompleteValues(draftTag, state.tags, getSuggestions).map((tag) => ({ value: tag, source: "Library" }));
    suggestionMenu.show(rows, (value) => {
      if (addTags([value])) emitChange();
      inputEl.value = "";
      showTagSuggestions("");
    });
  }

  function render() {
    if (!chipsEl) return;
    chipsEl.replaceChildren();
    for (const tag of state.tags) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tagChip";
      chip.setAttribute("aria-label", `Remove tag ${tag}`);

      const label = document.createElement("span");
      label.textContent = tag;

      const removeBtn = document.createElement("span");
      removeBtn.className = "tagChipRemove";
      removeBtn.textContent = "✕";
      chip.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      chip.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = state.tags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
        if (next.length === state.tags.length) return;
        state.tags = next;
        render();
        emitChange();
      });

      chip.appendChild(label);
      chip.appendChild(removeBtn);
      chipsEl.appendChild(chip);
    }
    if (document.activeElement === inputEl) showTagSuggestions(inputEl.value);
    else suggestionMenu.hide();
  }

  function addTags(tags) {
    const next = dedupeTags([...(state.tags || []), ...(tags || [])]);
    if (next.length === state.tags.length) return false;
    state.tags = next;
    render();
    return true;
  }

  function commitTagDraft({ force = false } = {}) {
    const rawValue = String(inputEl.value || "");
    const segments = rawValue.split(",");
    const completeTags = dedupeTags(segments.slice(0, -1));
    const lastSegment = normalizeTag(segments[segments.length - 1] || "");

    let didChange = false;
    if (completeTags.length) {
      didChange = addTags(completeTags) || didChange;
    }

    if (force && lastSegment) {
      didChange = addTags([lastSegment]) || didChange;
      inputEl.value = "";
      showTagSuggestions("");
      return didChange;
    }

    if (rawValue.includes(",")) {
      inputEl.value = lastSegment;
    }
    showTagSuggestions(lastSegment);
    return didChange;
  }

  inputEl.addEventListener("input", (event) => {
    if (commitTagDraft()) emitChange();

    if (event?.inputType !== "insertReplacementText") return;
    if (commitTagDraft({ force: true })) emitChange();
  });

  inputEl.addEventListener("change", () => {
    const hasDraft = normalizeTag(inputEl.value).length > 0;
    if (!hasDraft) return;
    if (commitTagDraft({ force: true })) emitChange();
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      const hasDraft = normalizeTag(inputEl.value).length > 0;
      if (!hasDraft) return;
      event.preventDefault();
      if (commitTagDraft({ force: true })) emitChange();
      return;
    }
    if (event.key === "Backspace" && !normalizeTag(inputEl.value) && state.tags.length > 0) {
      state.tags = state.tags.slice(0, -1);
      render();
      emitChange();
      return;
    }
    if (event.key === "Escape") {
      suggestionTriggeredByClick = false;
      suggestionMenu.hide();
    }
  });

  inputEl.addEventListener("mousedown", () => {
    suggestionTriggeredByClick = true;
    showTagSuggestions(inputEl.value);
  });
  inputEl.addEventListener("blur", () => {
    suggestionTriggeredByClick = false;
    if (commitTagDraft({ force: true })) emitChange();
    suggestionMenu.hide();
  });

  if (suppressChipClicks) {
    chipsEl?.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    chipsEl?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  return {
    setTags(tags) {
      state.tags = dedupeTags(tags);
      inputEl.value = "";
      render();
    },
    getTags({ includeDraft = true } = {}) {
      const draft = includeDraft ? [normalizeTag(inputEl.value)] : [];
      return dedupeTags([...(state.tags || []), ...draft]);
    },
    clear() {
      state.tags = [];
      inputEl.value = "";
      render();
    },
  };
}


function buildSuggestionRows(values, sourceLabel) {
  return (Array.isArray(values) ? values : []).map((value) => ({ value, source: sourceLabel }));
}

function createInputAutocomplete(inputEl, suggestionsEl, getItems, onPickValue) {
  const menu = createSuggestionMenu(suggestionsEl);
  const fieldEl = inputEl?.closest(".importerField");
  let suggestionTriggeredByClick = false;
  const pick = typeof onPickValue === "function"
    ? onPickValue
    : (value) => {
      inputEl.value = value;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    };

  function show() {
    if (!suggestionTriggeredByClick) return;
    const query = String(inputEl.value || "").trim().toLowerCase();
    const options = (Array.isArray(getItems()) ? getItems() : []).filter((item) => {
      if (!query) return true;
      return String(item.value || "").toLowerCase().includes(query);
    });
    menu.show(options.slice(0, 100), pick);
  }

  function refresh() {
    if (document.activeElement === inputEl && suggestionTriggeredByClick) {
      show();
      return;
    }
    menu.hide();
  }

  inputEl.addEventListener("click", () => {
    suggestionTriggeredByClick = true;
    show();
  });
  inputEl.addEventListener("input", show);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      suggestionTriggeredByClick = false;
      menu.hide();
    }
  });
  fieldEl?.addEventListener("focusout", (event) => {
    if (fieldEl.contains(event.relatedTarget)) return;
    suggestionTriggeredByClick = false;
    menu.hide();
  });

  return { refresh, hide: menu.hide };
}

const metaArtistAutocomplete = createInputAutocomplete(
  metaArtistEl,
  metaArtistSuggestionsEl,
  () => buildSuggestionRows(metadataSuggestions.artists, "Library"),
);
const metaLanguageAutocomplete = createInputAutocomplete(
  metaLanguageEl,
  metaLanguageSuggestionsEl,
  () => buildSuggestionRows(metadataSuggestions.languages, "Library"),
);
const templateArtistAutocomplete = createInputAutocomplete(
  templateArtistEl,
  templateArtistSuggestionsEl,
  () => buildSuggestionRows(metadataSuggestions.artists, "Library"),
);
const templateLanguageAutocomplete = createInputAutocomplete(
  templateLanguageEl,
  templateLanguageSuggestionsEl,
  () => buildSuggestionRows(metadataSuggestions.languages, "Library"),
);


async function loadMetadataSuggestions() {
  try {
    const res = await window.importerApi.getMetadataSuggestions();
    if (!res?.ok) {
      metadataSuggestions = { artists: [], languages: [], tags: [] };
      return;
    }
    metadataSuggestions = {
      artists: Array.isArray(res.artists) ? res.artists : [],
      languages: Array.isArray(res.languages) ? res.languages : [],
      tags: Array.isArray(res.tags) ? res.tags : [],
    };
    metaArtistAutocomplete.refresh();
    metaLanguageAutocomplete.refresh();
    templateArtistAutocomplete.refresh();
    templateLanguageAutocomplete.refresh();
  } catch {
    metadataSuggestions = { artists: [], languages: [], tags: [] };
  }
}

function isImportable(candidate) {
  return candidate && candidate.status === "ready" && String(candidate.metadata?.title || "").trim();
}

function hasValidMangaCandidates() {
  return candidates.some((candidate) => candidate.status !== "no_images");
}

function isSingleMangaMode() {
  return importMode === "single";
}

function setStepOneMessage(message) {
  if (!stepOneMessageEl) return;
  stepOneMessageEl.textContent = message || "";
}

function getStepOneValidation() {
  if (!rootPath) {
    return { ok: false, message: "Choose a folder to continue." };
  }
  if (candidates.length === 0) {
    return isSingleMangaMode()
      ? { ok: false, message: "The selected manga folder could not be loaded." }
      : { ok: false, message: "No subfolders found in the selected root folder." };
  }
  if (!hasValidMangaCandidates()) {
    return isSingleMangaMode()
      ? { ok: false, message: "Selected folder has no supported images (.jpg, .jpeg, .png, .webp)." }
      : { ok: false, message: "No valid manga found. Add at least one subfolder with image files before continuing." };
  }
  return { ok: true, message: "" };
}

function formatStatus(status) {
  return String(status || "").replaceAll("_", " ");
}

function updateStepUI() {
  for (const section of stepSections) {
    const sectionStep = Number(section.dataset.stepSection || 0);
    section.hidden = sectionStep !== currentStep;
  }

  for (const indicator of stepIndicators) {
    const indicatorStep = Number(indicator.dataset.stepIndicator || 0);
    indicator.classList.toggle("is-active", indicatorStep === currentStep);
    indicator.classList.toggle("is-complete", indicatorStep < currentStep);
  }

  const singleMode = isSingleMangaMode();
  if (stepPill3El) stepPill3El.textContent = `${singleMode ? 2 : 3}. Preview & customizing`;
  if (stepPill4El) stepPill4El.textContent = `${singleMode ? 3 : 4}. Import & reporting`;
  if (step4PaneTitleEl) step4PaneTitleEl.textContent = `Step ${singleMode ? 3 : 4}: Import and reporting`;
  prevStepBtn.disabled = currentStep === 1 || runImportBusy;
  stepThreeSectionEl?.classList.toggle("single-manga-mode", singleMode);
  if (stepTwoIndicatorEl) stepTwoIndicatorEl.hidden = singleMode;
  if (stepTwoSectionEl) stepTwoSectionEl.hidden = singleMode || Number(stepTwoSectionEl.dataset.stepSection || 0) !== currentStep;
  nextStepBtn.disabled = runImportBusy || !canMoveToStep(currentStep + 1);
  setButtonWithIconLabel(nextStepBtn, currentStep >= 4
    ? { label: "Done" }
    : { label: "Next step", iconClass: "icon-forward", iconAtEnd: true });
}

function canMoveToStep(step) {
  if (step <= 1 || step > 4) return false;
  if (step === 2) return !isSingleMangaMode() && getStepOneValidation().ok;
  if (step === 3) return getStepOneValidation().ok && candidates.length > 0;
  if (step === 4) return getStepOneValidation().ok && candidates.length > 0;
  return true;
}

function goToStep(step) {
  const requested = Math.max(1, Math.min(4, step));
  let target = requested;
  if (isSingleMangaMode() && requested === 2) {
    target = requested > currentStep ? 3 : 1;
  }
  if (target > currentStep && !canMoveToStep(target)) return;
  currentStep = target;
  updateStepUI();
}

function summarize() {
  const total = candidates.length;
  const selected = candidates.filter((candidate) => candidate.selected !== false).length;
  const importable = candidates.filter((candidate) => candidate.selected !== false && isImportable(candidate)).length;
  const byStatus = {
    ready: candidates.filter((candidate) => candidate.status === "ready").length,
    needs_metadata: candidates.filter((candidate) => candidate.status === "needs_metadata").length,
    metadata_error: candidates.filter((candidate) => candidate.status === "metadata_error").length,
    no_images: candidates.filter((candidate) => candidate.status === "no_images").length,
  };
  const summary = `${total} discovered • ${selected} selected • ${importable} ready • ${byStatus.needs_metadata} needs metadata • ${byStatus.metadata_error} metadata errors • ${byStatus.no_images} no images`;
  const stepOneValidation = getStepOneValidation();
  importSummaryEl.textContent = stepOneValidation.ok ? summary : `${summary} • ${stepOneValidation.message}`;
  setStepOneMessage(stepOneValidation.message);
  runImportBtn.disabled = runImportBusy || importable === 0;
  updateStepUI();
}

function renderList() {
  candidateListEl.replaceChildren();
  for (const candidate of candidates) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `importerCandidate ${candidate.key === selectedKey ? "selected" : ""}`;
    row.addEventListener("click", () => {
      selectedKey = candidate.key;
      renderList();
      renderDetail();
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = candidate.selected !== false;
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      candidate.selected = checkbox.checked;
      summarize();
    });

    const label = document.createElement("div");
    label.className = "importerCandidateLabel";
    label.textContent = `${candidate.folderName} (${candidate.imageFiles.length})`;

    const badge = document.createElement("div");
    badge.className = `importerBadge ${candidate.status}`;
    badge.textContent = formatStatus(candidate.status);

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(badge);
    candidateListEl.appendChild(row);
  }
  summarize();
}

function reconcileCandidateAfterMetadataChange(candidate) {
  if (!candidate || candidate.status === "no_images") return;

  const hasTitle = String(candidate.metadata?.title || "").trim().length > 0;
  if (!hasTitle) {
    candidate.status = "needs_metadata";
    return;
  }

  if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
    const promotedWarnings = candidate.errors.map((error) => `Recovered metadata issue: ${error}`);
    candidate.warnings = dedupeValues([...(candidate.warnings || []), ...promotedWarnings]);
    candidate.errors = [];
    candidate.metadataSource = "template";
  }

  candidate.status = "ready";
}

function applyMetadataEdits() {
  const current = selectedCandidate();
  if (!current) return;
  current.metadata = {
    ...current.metadata,
    title: metaTitleEl.value.trim(),
    comicName: metaTitleEl.value.trim(),
    artist: metaArtistEl.value.trim(),
    language: metaLanguageEl.value.trim(),
    tags: metaTagInput.getTags(),
  };

  reconcileCandidateAfterMetadataChange(current);

  candidateStatusEl.textContent = `Status: ${formatStatus(current.status)} • Metadata source: ${current.metadataSource}`;
  detailEligibilityEl.textContent = isImportable(current)
    ? "Eligible for import"
    : "Not eligible (add title, fix metadata errors, and ensure at least one image exists).";
  detailEligibilityEl.className = `eligibilityTag ${isImportable(current) ? "is-ready" : "is-blocked"}`;

  renderList();
}

function renderDetail() {
  const current = selectedCandidate();
  if (!current) {
    candidateTitleEl.textContent = "Select a folder";
    candidateStatusEl.textContent = "";
    candidateFilesEl.textContent = "";
    detailIssuesEl.textContent = "No warnings or errors.";
    detailPreviewEl.textContent = "Select a folder to preview files.";
    detailEligibilityEl.textContent = "No folder selected";
    detailEligibilityEl.className = "eligibilityTag";
    metaTitleEl.value = "";
    metaArtistEl.value = "";
    metaLanguageEl.value = "";
    metaTagInput.clear();
    return;
  }

  candidateTitleEl.textContent = current.folderName;
  candidateStatusEl.textContent = `Status: ${formatStatus(current.status)} • Metadata source: ${current.metadataSource}`;
  candidateFilesEl.textContent = `${current.imageFiles.length} image file(s)`;
  detailEligibilityEl.textContent = isImportable(current)
    ? "Eligible for import"
    : "Not eligible (add title, fix metadata errors, and ensure at least one image exists).";
  detailEligibilityEl.className = `eligibilityTag ${isImportable(current) ? "is-ready" : "is-blocked"}`;

  const issues = [];
  for (const warning of current.warnings || []) issues.push(`⚠️ ${warning}`);
  for (const error of current.errors || []) issues.push(`❌ ${error}`);
  detailIssuesEl.textContent = issues.length ? issues.join("\n") : "No warnings or errors.";

  const files = current.imageFiles || [];
  if (!files.length) {
    detailPreviewEl.textContent = "No image files found.";
  } else {
    const previewLines = files.slice(0, 15).map((file) => `• ${file.relPath}`);
    if (files.length > 15) previewLines.push(`…and ${files.length - 15} more file(s)`);
    detailPreviewEl.textContent = previewLines.join("\n");
  }

  metaTitleEl.value = current.metadata?.title || "";
  metaArtistEl.value = current.metadata?.artist || "";
  metaLanguageEl.value = current.metadata?.language || "";
  metaTagInput.setTags(current.metadata?.tags);
}

function updateTemplateInfo() {
  const targets = candidates.filter((candidate) => candidate.metadataSource === "template");
  templateInfoEl.textContent = targets.length
    ? `Template will apply to ${targets.length} folder(s) that do not have metadata.json.`
    : "No template targets found. All folders already have metadata.json.";
}

function applyTemplateToCandidates() {
  const artist = templateArtistEl.value.trim();
  const language = templateLanguageEl.value.trim();
  const tags = templateTagInput.getTags();

  let updated = 0;
  for (const candidate of candidates) {
    if (candidate.metadataSource !== "template") continue;
    candidate.metadata = {
      ...candidate.metadata,
      artist,
      language,
      tags,
    };
    reconcileCandidateAfterMetadataChange(candidate);
    updated += 1;
  }
  if (updated === 0) {
    templateInfoEl.textContent = "No candidates were updated (none were template-based).";
  } else {
    templateInfoEl.textContent = `Applied template to ${updated} candidate(s). You can still customize each item in Step 3.`;
  }
  renderList();
  renderDetail();
}

function setImportReportCounts(imported, skipped, failed) {
  importedCountEl.textContent = String(Math.max(0, Number(imported || 0)));
  skippedCountEl.textContent = String(Math.max(0, Number(skipped || 0)));
  failedCountEl.textContent = String(Math.max(0, Number(failed || 0)));
}

function renderImportResultsTable(results) {
  const rows = Array.isArray(results) ? results : [];
  importResultsEl.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "importResultsEmpty";
    empty.textContent = "No import entries yet.";
    importResultsEl.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "importResultsTable";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of ["Status", "Folder", "Message"]) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const item of rows) {
    const tr = document.createElement("tr");

    const statusTd = document.createElement("td");
    const status = String(item?.status || "unknown");
    const statusPill = document.createElement("span");
    statusPill.className = `importResultsStatus is-${status}`;
    statusPill.textContent = status;
    statusTd.appendChild(statusPill);

    const folderTd = document.createElement("td");
    folderTd.textContent = String(item?.folderPath || "-");

    const messageTd = document.createElement("td");
    messageTd.textContent = String(item?.message || "-");

    tr.append(statusTd, folderTd, messageTd);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  importResultsEl.appendChild(table);
}

function resetProgress() {
  latestProgress = null;
  progressSummaryEl.textContent = "No import running.";
  progressBarEl.value = 0;
  setImportReportCounts(0, 0, 0);
  renderImportResultsTable([]);
}

function renderProgress(payload) {
  latestProgress = payload;
  const total = Number(payload?.total || 0);
  const completed = Number(payload?.completed || 0);
  const status = payload?.status || "running";
  const message = payload?.message ? ` • ${payload.message}` : "";
  progressBarEl.max = total || 1;
  progressBarEl.value = Math.min(completed, total || 1);
  progressSummaryEl.textContent = `${completed}/${total || 0} processed • ${status}${message}`;
}

async function scanSelectedRoot(pathValue, mode = "root") {
  await loadMetadataSuggestions();
  importMode = mode;
  const res = mode === "single"
    ? await window.importerApi.scanSingleManga(pathValue)
    : await window.importerApi.scanRoot(pathValue);
  if (!res?.ok) {
    rootPath = "";
    candidates = [];
    selectedKey = "";
    importRootPathEl.textContent = "No folder selected.";
    importSummaryEl.textContent = res?.error || "Scan failed.";
    setStepOneMessage(res?.error || "Scan failed.");
    renderList();
    renderDetail();
    updateTemplateInfo();
    resetProgress();
    return;
  }

  rootPath = res.rootPath;
  candidates = (res.candidates || [])
    .slice()
    .sort((a, b) => String(a.folderName || "").localeCompare(String(b.folderName || ""), undefined, { numeric: true }))
    .map((candidate) => ({ ...candidate, selected: isImportable(candidate) }));
  selectedKey = candidates[0]?.key || "";
  importRootPathEl.textContent = rootPath;
  setStepOneMessage("");
  renderList();
  renderDetail();
  updateTemplateInfo();
  resetProgress();
}

function selectCandidates(strategy) {
  for (const candidate of candidates) {
    if (strategy === "all") candidate.selected = true;
    else candidate.selected = isImportable(candidate);
  }
  renderList();
  renderDetail();
}

chooseRootBtn.addEventListener("click", async () => {
  const picked = await window.importerApi.chooseFolder("root");
  if (!picked?.ok || !picked.rootPath) return;
  await scanSelectedRoot(picked.rootPath, "root");
  goToStep(canMoveToStep(2) ? 2 : 1);
});

chooseSingleMangaBtn?.addEventListener("click", async () => {
  const picked = await window.importerApi.chooseFolder("single");
  if (!picked?.ok || !picked.rootPath) return;
  await scanSelectedRoot(picked.rootPath, "single");
  goToStep(canMoveToStep(3) ? 3 : 1);
});

for (const input of [metaTitleEl, metaArtistEl, metaLanguageEl]) {
  input.addEventListener("input", applyMetadataEdits);
}

metadataTemplateLinkEl?.addEventListener("click", (event) => {
  event.preventDefault();
  const template = {
    title: "",
    artist: "",
    language: "",
    tags: [],
  };
  const json = `${JSON.stringify(template, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "metadata.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

runImportBtn.addEventListener("click", async () => {
  setRunImportBusy(true);
  goToStep(4);
  try {
    const items = candidates
      .filter((candidate) => candidate.selected !== false && isImportable(candidate))
      .map((candidate) => ({
        key: candidate.key,
        folderPath: candidate.folderPath,
        metadata: candidate.metadata,
      }));

    if (items.length === 0) {
      progressSummaryEl.textContent = "No eligible candidates selected.";
      return;
    }

    progressSummaryEl.textContent = `Starting import for ${items.length} selected item(s)...`;

    const res = await window.importerApi.runImport({ rootPath, items });
    if (!res?.ok) {
      setImportReportCounts(0, 0, 1);
      renderImportResultsTable([{
        status: "failed",
        folderPath: rootPath || "-",
        message: res?.error || "Import failed.",
      }]);
      summarize();
      return;
    }

    setImportReportCounts(res.imported, res.skipped, res.failed);
    renderImportResultsTable(res.results || []);
    if (latestProgress) {
      renderProgress({ ...latestProgress, status: "done", message: "Import completed." });
    }
    summarize();
  } catch (err) {
    setImportReportCounts(0, 0, 1);
    renderImportResultsTable([{
      status: "failed",
      folderPath: rootPath || "-",
      message: `Import failed: ${String(err)}`,
    }]);
  } finally {
    setRunImportBusy(false);
  }
});

selectAllBtn.addEventListener("click", () => selectCandidates("all"));
selectReadyBtn.addEventListener("click", () => selectCandidates("ready"));
deselectAllBtn?.addEventListener("click", () => {
  for (const candidate of candidates) candidate.selected = false;
  renderList();
  renderDetail();
});

prevStepBtn.addEventListener("click", () => goToStep(currentStep - 1));
nextStepBtn.addEventListener("click", () => {
  if (currentStep >= 4) return;
  if (currentStep === 1 && isSingleMangaMode()) {
    goToStep(3);
    return;
  }
  goToStep(currentStep + 1);
});
applyTemplateBtn.addEventListener("click", () => {
  applyTemplateToCandidates();
  goToStep(3);
});

window.importerApi.onProgress((payload) => {
  renderProgress(payload);
});

window.importerApi.onSettingsUpdated((settings) => {
  applyTheme(settings?.darkMode);
});

loadSettings();
loadMetadataSuggestions();
updateTemplateInfo();
resetProgress();
updateStepUI();

}
