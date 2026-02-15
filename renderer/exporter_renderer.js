const mangaListEl = document.getElementById("mangaList");
const searchInputEl = document.getElementById("searchMangaInput");
const selectAllBtn = document.getElementById("selectAll");
const deselectAllBtn = document.getElementById("deselectAll");
const mangaTitleEl = document.getElementById("mangaTitle");
const mangaMetaEl = document.getElementById("mangaMeta");
const mangaDetailEl = document.getElementById("mangaDetail");
const mangaPreviewImageEl = document.getElementById("mangaPreviewImage");
const mangaPreviewEmptyEl = document.getElementById("mangaPreviewEmpty");
const mangaPreviewFrameEl = mangaPreviewImageEl?.parentElement || null;
const selectionSummaryEl = document.getElementById("selectionSummary");
const stepSections = Array.from(document.querySelectorAll("[data-step-section]"));
const stepIndicators = Array.from(document.querySelectorAll("[data-step-indicator]"));
const prevStepBtn = document.getElementById("prevStepBtn");
const nextStepBtn = document.getElementById("nextStepBtn");
const chooseDestinationBtn = document.getElementById("chooseDestinationBtn");
const destinationPathEl = document.getElementById("destinationPath");
const permissionCheckEl = document.getElementById("permissionCheck");
const emptyCheckEl = document.getElementById("emptyCheck");
const spaceCheckEl = document.getElementById("spaceCheck");
const checkErrorEl = document.getElementById("checkError");
const runExportBtn = document.getElementById("runExportBtn");
const exportProgressBarEl = document.getElementById("exportProgressBar");
const exportProgressTextEl = document.getElementById("exportProgressText");
const exportedCountEl = document.getElementById("exportedCount");
const skippedCountEl = document.getElementById("skippedCount");
const failedCountEl = document.getElementById("failedCount");
const exportResultsEl = document.getElementById("exportResults");

let currentStep = 1;
let allManga = [];
let highlightedId = "";
const selectedIds = new Set();
let destinationPath = "";
let destinationChecksOk = false;
let isRunning = false;
let currentPreviewUrl = "";
let previewRequestToken = 0;
const EXPORT_PREVIEW_MAX_SIZE = { width: 610, height: 813 };
const EXPORT_PREVIEW_MAX_RETRIES = 4;
const thumbPipeline = window.nviewThumbPipeline || null;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark", Boolean(isDark));
}

function selectedManga() {
  return allManga.find((item) => item.id === highlightedId) || null;
}

function filteredManga() {
  const q = String(searchInputEl.value || "").trim().toLowerCase();
  if (!q) return allManga;
  return allManga.filter((item) => {
    const haystack = [item.title, item.artist, ...(item.tags || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function renderSelectionSummary() {
  selectionSummaryEl.textContent = `${selectedIds.size} selected`;
  selectionSummaryEl.classList.toggle("is-ready", selectedIds.size > 0);
  selectionSummaryEl.classList.toggle("is-blocked", selectedIds.size === 0);
}

function renderDetail() {
  const item = selectedManga();
  if (!item) {
    mangaTitleEl.textContent = "Select a manga";
    mangaMetaEl.textContent = "";
    mangaDetailEl.textContent = "";
    renderMetadataFields(null);
    setPreviewState({ loading: false, message: "Select a manga to preview first page." });
    return;
  }

  mangaTitleEl.textContent = item.title || item.id;
  mangaMetaEl.textContent = `${item.artist || "Unknown artist"} • ${item.pagesFound || 0} pages`;
  renderMetadataFields(item);
  void loadFirstPagePreview(item);
}

function renderMetadataFields(item) {
  mangaDetailEl.textContent = "";
  if (!item) {
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "Select a manga to view its metadata.";
    mangaDetailEl.appendChild(empty);
    return;
  }

  const fields = [
    ["Title", item.title || "-"],
    ["Artist", item.artist || "Unknown artist"],
    ["Pages", String(item.pagesFound || 0)],
    ["Languages", Array.isArray(item.languages) && item.languages.length ? item.languages.join(", ") : "-"],
    ["Tags", Array.isArray(item.tags) && item.tags.length ? item.tags.join(", ") : "-", true],
    ["Library ID", item.id || "-"],
  ];

  for (const [label, value, multiline] of fields) {
    const row = document.createElement("div");
    row.className = "exportMetadataRow";
    const labelEl = document.createElement("label");
    labelEl.className = "exportMetadataLabel";
    labelEl.textContent = label;
    const valueEl = document.createElement(multiline ? "textarea" : "input");
    valueEl.className = "exportMetadataValueInput";
    valueEl.value = value;
    valueEl.readOnly = true;
    valueEl.setAttribute("aria-readonly", "true");
    if (!multiline) valueEl.type = "text";
    if (multiline) {
      valueEl.rows = 3;
    }
    row.append(labelEl, valueEl);
    mangaDetailEl.appendChild(row);
  }
}

function setPreviewState({ loading, message }) {
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = "";
  }
  mangaPreviewImageEl.hidden = true;
  mangaPreviewImageEl.removeAttribute("src");
  mangaPreviewEmptyEl.textContent = loading ? "Loading first page preview..." : message;
  mangaPreviewEmptyEl.hidden = false;
}

function getPreviewTargetSize() {
  if (thumbPipeline?.computeTargetSizeFromElement) {
    return thumbPipeline.computeTargetSizeFromElement(mangaPreviewFrameEl, EXPORT_PREVIEW_MAX_SIZE);
  }
  const rect = mangaPreviewFrameEl?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.min(EXPORT_PREVIEW_MAX_SIZE.width, Math.round((rect.width || 0) * dpr)));
  const height = Math.max(1, Math.min(EXPORT_PREVIEW_MAX_SIZE.height, Math.round((rect.height || 0) * dpr)));
  return {
    width,
    height,
    hasMeasuredSize: Boolean(rect.width && rect.height),
  };
}

async function loadFirstPagePreviewForToken(item, token, retries = EXPORT_PREVIEW_MAX_RETRIES) {
  const previewPath = String(item?.firstPagePath || "");
  if (!previewPath) {
    setPreviewState({ loading: false, message: "No preview image available." });
    return;
  }

  setPreviewState({ loading: true, message: "" });
  const target = getPreviewTargetSize();
  if (!target.hasMeasuredSize && retries > 0) {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (token !== previewRequestToken) return;
    return loadFirstPagePreviewForToken(item, token, retries - 1);
  }

  let result;
  if (thumbPipeline?.fetchAndCreateThumbnailUrl) {
    result = await thumbPipeline.fetchAndCreateThumbnailUrl({
      filePath: previewPath,
      targetWidth: target.width,
      targetHeight: target.height,
      mimeType: "image/jpeg",
      quality: 0.85,
      preferCanonicalOutput: false,
    });
  } else {
    let response;
    try {
      let fallbackPath = String(previewPath || "").replaceAll("\\", "/");
      if (/^[a-zA-Z]\//.test(fallbackPath)) {
        fallbackPath = fallbackPath[0].toUpperCase() + ":/" + fallbackPath.slice(2);
      }
      if (/^[a-zA-Z]:\//.test(fallbackPath)) {
        fallbackPath = fallbackPath[0].toUpperCase() + fallbackPath.slice(1);
      }
      const encoded = fallbackPath
        .split("/")
        .map((seg) => encodeURIComponent(seg).replaceAll("%3A", ":"))
        .join("/");
      response = await fetch(`appblob:///${encoded}`, { cache: "no-store", credentials: "omit" });
    } catch {
      if (token !== previewRequestToken) return;
      setPreviewState({ loading: false, message: "Unable to load preview image." });
      return;
    }
    if (!response.ok) {
      result = { ok: false, status: response.status };
    } else {
      const blob = await response.blob();
      result = {
        ok: true,
        objectUrl: URL.createObjectURL(blob),
      };
    }
  }

  if (token !== previewRequestToken) return;
  if (!result?.ok) {
    if (result?.status === 401) {
      setPreviewState({ loading: false, message: "Vault is locked. Unlock vault in Gallery and retry." });
    } else if (result?.status === 404) {
      setPreviewState({ loading: false, message: "No preview image available." });
    } else {
      setPreviewState({ loading: false, message: "Unable to load preview image." });
    }
    return;
  }

  currentPreviewUrl = result.objectUrl;
  if (token !== previewRequestToken) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = "";
    return;
  }
  mangaPreviewImageEl.src = currentPreviewUrl;
  mangaPreviewImageEl.hidden = false;
  mangaPreviewEmptyEl.hidden = true;
}

async function loadFirstPagePreview(item) {
  const token = ++previewRequestToken;
  await loadFirstPagePreviewForToken(item, token);
}

async function refreshChecksIfNeeded() {
  if (currentStep >= 2 && destinationPath) {
    await runDestinationChecks();
  }
}

function toggleSelection(mangaId, selected) {
  if (selected) selectedIds.add(mangaId);
  else selectedIds.delete(mangaId);
  renderSelectionSummary();
  renderNav();
  void refreshChecksIfNeeded();
}

function renderList() {
  const rows = filteredManga();
  mangaListEl.textContent = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "exportResultsEmpty";
    empty.textContent = "No manga found.";
    mangaListEl.appendChild(empty);
    return;
  }

  for (const item of rows) {
    const row = document.createElement("label");
    row.className = `exporterCandidate ${item.id === highlightedId ? "selected" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIds.has(item.id);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      toggleSelection(item.id, checkbox.checked);
    });

    const label = document.createElement("div");
    label.className = "exporterCandidateLabel";
    label.textContent = item.title || item.id;

    row.addEventListener("click", () => {
      highlightedId = item.id;
      renderList();
      renderDetail();
    });

    row.append(checkbox, label);
    mangaListEl.appendChild(row);
  }
}

function setCheckRow(el, label, ok, detail) {
  el.className = `exporterCheck ${ok === true ? "pass" : ok === false ? "fail" : ""}`;
  el.textContent = "";

  const labelEl = document.createElement("td");
  labelEl.className = "exporterCheckLabel";
  labelEl.textContent = label;

  const statusEl = document.createElement("td");
  statusEl.className = "exporterCheckStatus";
  statusEl.textContent = ok === true ? "✓" : ok === false ? "✕" : "-";

  const detailEl = document.createElement("td");
  detailEl.className = "exporterCheckDetail";
  detailEl.textContent = detail || "";

  el.append(labelEl, statusEl, detailEl);
}

async function runDestinationChecks() {
  destinationChecksOk = false;
  if (!destinationPath) {
    setCheckRow(permissionCheckEl, "Permission check", null, "Waiting for folder selection.");
    setCheckRow(emptyCheckEl, "Empty folder check", null, "Waiting for folder selection.");
    setCheckRow(spaceCheckEl, "Free space check", null, "Waiting for folder selection.");
    checkErrorEl.textContent = "";
    renderNav();
    return;
  }

  const res = await window.exporterApi.checkDestination({
    destinationPath,
    selectedMangaIds: Array.from(selectedIds),
  });
  if (!res?.ok) {
    checkErrorEl.textContent = res?.error || "Failed to check destination.";
    renderNav();
    return;
  }

  checkErrorEl.textContent = res.error || "";
  const checks = res.checks || {};
  setCheckRow(permissionCheckEl, "Permission check", checks.permission?.ok, checks.permission?.message);
  setCheckRow(emptyCheckEl, "Empty folder check", checks.emptyFolder?.ok, checks.emptyFolder?.message);
  const free = checks.freeSpace || {};
  setCheckRow(
    spaceCheckEl,
    "Free space check",
    free.ok,
    `${free.message || ""} Required: ${formatBytes(free.requiredBytes)} • Available: ${formatBytes(free.availableBytes)}`,
  );
  destinationChecksOk = Boolean(res.allOk);
  renderNav();
}

function renderResultsTable(results) {
  const rows = Array.isArray(results) ? results : [];
  exportResultsEl.textContent = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "exportResultsEmpty";
    empty.textContent = "No export results yet.";
    exportResultsEl.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "exportResultsTable";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const heading of ["Manga", "Status", "Output path", "Message"]) {
    const th = document.createElement("th");
    th.textContent = heading;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");

    const mangaCell = document.createElement("td");
    mangaCell.textContent = row.title || row.mangaId || "-";

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    statusBadge.className = `exportResultsStatus is-${row.status}`;
    statusBadge.textContent = row.status || "unknown";
    statusCell.appendChild(statusBadge);

    const outputCell = document.createElement("td");
    outputCell.textContent = row.outputPath || "-";

    const messageCell = document.createElement("td");
    messageCell.textContent = row.message || "";

    tr.append(mangaCell, statusCell, outputCell, messageCell);
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  exportResultsEl.appendChild(table);
}

function renderSteps() {
  for (const section of stepSections) {
    section.hidden = Number(section.dataset.stepSection) !== currentStep;
  }
  for (const indicator of stepIndicators) {
    const step = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle("is-active", step === currentStep);
    indicator.classList.toggle("is-complete", step < currentStep);
  }
}

function renderNav() {
  prevStepBtn.disabled = currentStep <= 1 || isRunning;
  let canContinue = true;
  if (currentStep === 1) canContinue = selectedIds.size > 0;
  if (currentStep === 2) canContinue = destinationChecksOk;
  if (currentStep === 3) canContinue = false;
  nextStepBtn.disabled = !canContinue || isRunning;
  runExportBtn.disabled = isRunning || selectedIds.size === 0 || !destinationPath || !destinationChecksOk;
}

async function runExport() {
  if (isRunning) return;
  isRunning = true;
  renderNav();
  const res = await window.exporterApi.runExport({
    destinationPath,
    items: Array.from(selectedIds).map((mangaId) => ({ mangaId })),
  });
  isRunning = false;
  renderNav();

  if (!res?.ok) {
    exportProgressTextEl.textContent = res?.error || "Export failed.";
    return;
  }
  exportedCountEl.textContent = String(res.exported || 0);
  skippedCountEl.textContent = String(res.skipped || 0);
  failedCountEl.textContent = String(res.failed || 0);
  renderResultsTable(res.results || []);
  exportProgressBarEl.value = 1;
  exportProgressTextEl.textContent = `Completed: ${res.exported} exported, ${res.skipped} skipped, ${res.failed} failed.`;
}

searchInputEl.addEventListener("input", renderList);
selectAllBtn.addEventListener("click", () => {
  for (const item of filteredManga()) selectedIds.add(item.id);
  renderList();
  renderSelectionSummary();
  renderNav();
  void refreshChecksIfNeeded();
});

deselectAllBtn.addEventListener("click", () => {
  for (const item of filteredManga()) selectedIds.delete(item.id);
  renderList();
  renderSelectionSummary();
  renderNav();
  void refreshChecksIfNeeded();
});

prevStepBtn.addEventListener("click", () => {
  currentStep = Math.max(1, currentStep - 1);
  renderSteps();
  renderNav();
});

nextStepBtn.addEventListener("click", async () => {
  if (currentStep === 1) {
    currentStep = 2;
    renderSteps();
    await runDestinationChecks();
    return;
  }
  if (currentStep === 2) {
    currentStep = 3;
    renderSteps();
    renderNav();
  }
});

chooseDestinationBtn.addEventListener("click", async () => {
  const res = await window.exporterApi.chooseDestination({ defaultPath: destinationPath });
  if (!res?.ok) return;
  destinationPath = String(res.destinationPath || "");
  destinationPathEl.value = destinationPath;
  await runDestinationChecks();
});

runExportBtn.addEventListener("click", runExport);

window.exporterApi.onProgress((payload) => {
  const current = Number(payload?.current || 0);
  const total = Number(payload?.total || 0);
  if (total > 0) exportProgressBarEl.value = current / total;
  exportProgressTextEl.textContent = `Processing ${current}/${total}: ${payload?.message || payload?.status || "..."}`;
});

(async () => {
  const settingsRes = await window.exporterApi.getSettings();
  if (settingsRes?.ok) applyTheme(settingsRes.settings?.darkMode);

  const listRes = await window.exporterApi.listLibrary();
  if (!listRes?.ok) {
    checkErrorEl.textContent = listRes?.locked
      ? "Vault is locked. Unlock the vault in the gallery and reopen Export."
      : listRes?.requiresVault
        ? "Vault mode is required before exporting."
        : (listRes?.error || "Failed to load library.");
    allManga = [];
  } else {
    allManga = listRes.items || [];
  }

  if (allManga[0]) highlightedId = allManga[0].id;
  renderList();
  renderDetail();
  renderSelectionSummary();
  setCheckRow(permissionCheckEl, "Permission check", null, "Waiting for folder selection.");
  setCheckRow(emptyCheckEl, "Empty folder check", null, "Waiting for folder selection.");
  setCheckRow(spaceCheckEl, "Free space check", null, "Waiting for folder selection.");
  renderResultsTable([]);
  renderSteps();
  renderNav();
})();
