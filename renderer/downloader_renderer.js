const $ = (id) => document.getElementById(id);

const listEl = $("list");
const toastEl = $("toast");
const clearCompletedBtn = $("clearCompleted");
const fileModal = $("fileModal");
const fileModalTitle = $("fileModalTitle");
const fileModalMeta = $("fileModalMeta");
const fileModalList = $("fileModalList");
const fileModalClose = $("fileModalClose");

const jobs = new Map();
let openFileJobId = null;

function applyTheme(isDark) {
  document.body.classList.toggle("dark", Boolean(isDark));
}

async function loadSettings() {
  const res = await window.dlApi.getSettings();
  if (res?.ok) applyTheme(res.settings?.darkMode);
}

function setToast(msg) {
  toastEl.textContent = msg || "";
  if (msg) setTimeout(() => (toastEl.textContent = ""), 2500);
}

function attachImmediateAction(button, handler) {
  let inFlight = false;
  let lastPointerDownAt = 0;
  const CLICK_SUPPRESS_MS = 500;
  const run = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (inFlight || button.disabled) return;
    inFlight = true;
    const wasDisabled = button.disabled;
    button.disabled = true;
    try {
      await handler();
    } finally {
      inFlight = false;
      button.disabled = wasDisabled;
    }
  };

  button.addEventListener("pointerdown", (event) => {
    lastPointerDownAt = performance.now();
    run(event);
  });
  button.addEventListener("click", (event) => {
    if (performance.now() - lastPointerDownAt < CLICK_SUPPRESS_MS) return;
    run(event);
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") run(event);
  });
}

function pct(p) {
  const x = Math.max(0, Math.min(1, Number(p) || 0)) * 100;
  return x.toFixed(1) + "%";
}

function setFileModalOpen(isOpen) {
  fileModal.classList.toggle("open", isOpen);
  fileModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function closeFileModal() {
  openFileJobId = null;
  fileModalTitle.textContent = "";
  fileModalMeta.textContent = "";
  fileModalList.innerHTML = "";
  setFileModalOpen(false);
}

function renderFileModal(job) {
  if (!job) {
    closeFileModal();
    return;
  }

  fileModalTitle.textContent = `${job.name} — [${job.status}]`;
  fileModalMeta.textContent = `${job.downloaded} / ${job.total}`;

  if (!Array.isArray(job.files) || job.files.length === 0) {
    fileModalList.innerHTML = `<div style="color:#666;font-size:12px;">No file details available.</div>`;
    return;
  }

  fileModalList.innerHTML = "";

  const files = [...job.files].sort((a, b) =>
    a.done === b.done ? (a.progress || 0) - (b.progress || 0) : a.done ? 1 : -1
  );

  for (const f of files.slice(0, 150)) {
    const r = document.createElement("div");
    r.className = "fileRow";

    const fn = document.createElement("div");
    fn.className = "fileName";
    fn.textContent = f.name;

    const fp = document.createElement("div");
    fp.textContent = f.done ? "✅" : `${pct(f.progress)} … (${f.missingPieces ?? "?"})`;

    r.appendChild(fn);
    r.appendChild(fp);
    fileModalList.appendChild(r);
  }
}

function openFileModal(job) {
  openFileJobId = job.id;
  renderFileModal(job);
  setFileModalOpen(true);
}

function render() {
  const arr = Array.from(jobs.values());

  // Sort: active first, then newest
  arr.sort((a, b) => {
    const rank = (j) => {
      if (j.status === "downloading" || j.status === "moving") return 0;
      if (j.status === "completed") return 1;
      if (j.status === "failed") return 2;
      return 3;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  listEl.innerHTML = "";

  const hasCompleted = arr.some((j) => j.status === "completed");
  clearCompletedBtn.disabled = !hasCompleted;

  if (arr.length === 0) {
    listEl.innerHTML = `<div style="color:#666;font-size:13px;">No jobs yet. Use Direct download in the Web Viewer.</div>`;
    return;
  }

  for (const j of arr) {
    const card = document.createElement("div");
    card.className = "job";

    const top = document.createElement("div");
    top.className = "row";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${j.name}  —  [${j.status}]`;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    attachImmediateAction(removeBtn, async () => {
      await window.dlApi.remove(j.id);
    });

    const toggleBtn = document.createElement("button");
    const isStopped = j.status === "stopped";
    toggleBtn.textContent = isStopped ? "Start" : "Stop";
    attachImmediateAction(toggleBtn, async () => {
      const res = isStopped ? await window.dlApi.start(j.id) : await window.dlApi.stop(j.id);
      if (!res?.ok) {
        setToast(res?.error || "Update failed.");
      }
    });

    const canToggle = !["completed", "failed", "finalizing", "moving", "cleaning"].includes(
      j.status,
    );
    if (!canToggle) {
      toggleBtn.style.display = "none";
    }

    top.appendChild(title);
    top.appendChild(toggleBtn);
    top.appendChild(removeBtn);
    card.appendChild(top);

    const barWrap = document.createElement("div");
    barWrap.className = "barWrap";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = pct(j.progress);
    barWrap.appendChild(bar);
    card.appendChild(barWrap);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [j.message, `${j.downloaded} / ${j.total}`, j.downloadSpeed, j.uploadSpeed].filter(Boolean).join("  |  ");
    card.appendChild(meta);

    // Per-file view
    if (Array.isArray(j.files) && j.files.length > 0 && j.status === "downloading") {
      const filesBtn = document.createElement("button");
      filesBtn.textContent = "View files";
      filesBtn.onclick = () => openFileModal(j);
      card.appendChild(filesBtn);
    }

    listEl.appendChild(card);
  }

  if (openFileJobId) {
    renderFileModal(jobs.get(openFileJobId));
  }
}

async function init() {
  const res = await window.dlApi.list();
  if (res?.ok && Array.isArray(res.jobs)) {
    for (const j of res.jobs) jobs.set(j.id, j);
    render();
  }
}

window.dlApi.onUpdate((job) => {
  jobs.set(job.id, job);
  render();
});

window.dlApi.onRemove(({ id }) => {
  jobs.delete(id);
  render();
});

window.dlApi.onToast(({ message }) => setToast(message));

window.dlApi.onSettingsUpdated((settings) => {
  applyTheme(settings?.darkMode);
});

fileModalClose.addEventListener("click", closeFileModal);
fileModal.addEventListener("click", (event) => {
  if (event.target === fileModal) closeFileModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openFileJobId) closeFileModal();
});

init();
loadSettings();

attachImmediateAction(clearCompletedBtn, async () => {
  const res = await window.dlApi.clearCompleted();
  if (!res?.ok) {
    setToast(res?.error || "Clear failed.");
    return;
  }
  if (!res.removed) {
    setToast("No completed downloads to clear.");
    return;
  }
  setToast(`Cleared ${res.removed} completed download${res.removed === 1 ? "" : "s"}.`);
});
