const { ipcRenderer } = require("electron");

const ALT_DOWNLOAD_ID = "nv-alt-download";
const DUPLICATE_NOTE_ID = "nv-duplicate-note";

const state = {
  altHost: "",
  useHttp: false,
};

function textContent(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function hostFromStartPage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return normalizeHost(raw);
  }
}

function isLocalhostHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isLocalhostStartPage(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return isLocalhostHost(new URL(withProtocol).hostname);
  } catch {
    return isLocalhostHost(normalizeHost(raw));
  }
}

function hostMatches(hostname, baseHost) {
  const host = String(hostname || "").toLowerCase();
  const base = normalizeHost(baseHost);
  if (!base) return false;
  return host === base || host.endsWith(`.${base}`);
}

function toAbsoluteUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, window.location.href).toString();
  } catch {
    return "";
  }
}

function toFullImageUrl(raw) {
  const absolute = toAbsoluteUrl(raw);
  if (!absolute) return "";

  let u;
  try {
    u = new URL(absolute);
  } catch {
    return "";
  }

  // Force https to avoid CDN hotlink checks.
  u.protocol = state.useHttp ? "http:" : "https:";

  // t1.domain -> i1.domain
  const host = u.hostname.toLowerCase();
  const m = host.match(/^t(\d+)\.(.+)$/i);
  if (m) {
    u.hostname = `i${m[1]}.${m[2]}`;
  } else {
    // Replace leading "t" only when followed by a digit.
    u.hostname = u.hostname.replace(/^t(?=\d)/i, "i");
  }

  // Remove trailing "t" before extension (foo123t.jpg -> foo123.jpg).
  const segments = u.pathname.split("/");
  const filename = segments.pop();
  if (filename) {
    let next = filename.replace(/t(\.[^.]+)(\.[^.]+)?$/i, "$1$2");

    // De-dupe accidental double extensions.
    const dupMatch = next.match(/(\.[^.]+)\1$/i);
    if (dupMatch) next = next.slice(0, -dupMatch[1].length);

    segments.push(next);
    u.pathname = segments.join("/");
  }

  return u.toString();
}

function extractMeta() {
  const name =
    textContent(document.querySelector("#info h1.title .pretty")) ||
    textContent(document.querySelector("#info h2.title .pretty")) ||
    null;

  const hBefore = textContent(document.querySelector("#info h1.title .before"));
  const artistFromH = hBefore ? hBefore.replace(/^\[|\]$/g, "").trim() : null;

  const containers = Array.from(document.querySelectorAll("#tags .tag-container"));
  const findContainer = (label) =>
    containers.find((c) => (textContent(c) || "").toLowerCase().startsWith(label.toLowerCase()));

  const namesFrom = (container) =>
    container
      ? Array.from(container.querySelectorAll(".tags .name")).map(textContent).filter(Boolean)
      : [];

  const tagsContainer = findContainer("Tags:");
  const artistsContainer = findContainer("Artists:");
  const languagesContainer = findContainer("Languages:");
  const pagesContainer = findContainer("Pages:");

  const tags = namesFrom(tagsContainer);
  const artists = namesFrom(artistsContainer);
  const languages = namesFrom(languagesContainer);

  const pagesStr = pagesContainer ? textContent(pagesContainer.querySelector(".tags .name")) : "";
  const pagesNum = parseInt(pagesStr, 10);

  const galleryIdRaw = textContent(document.querySelector("#gallery_id"));
  const galleryId = galleryIdRaw ? galleryIdRaw.replace("#", "").trim() : null;

  return {
    sourceUrl: location.href,
    galleryId,
    comicName: name,
    artists,
    artist: artists[0] || artistFromH || null,
    tags,
    languages,
    pages: Number.isFinite(pagesNum) ? pagesNum : null,
    capturedAt: new Date().toISOString(),
  };
}

function extractGalleryId() {
  const galleryIdRaw = textContent(document.querySelector("#gallery_id"));
  if (galleryIdRaw) return galleryIdRaw.replace("#", "").trim();
  const match = String(location.pathname || "").match(/\/g\/(\d+)\//i);
  return match ? match[1] : "";
}

function extractImageUrls() {
  const nodes = Array.from(document.querySelectorAll(".thumbs .thumb-container img"));

  const urls = nodes
    .map((img) => img.getAttribute("data-src") || img.getAttribute("src") || img.dataset?.src || "")
    .map((raw) => toFullImageUrl(raw))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

function ensureDuplicateNote(afterEl) {
  if (!afterEl) return null;
  let note = document.getElementById(DUPLICATE_NOTE_ID);
  if (!note) {
    note = document.createElement("div");
    note.id = DUPLICATE_NOTE_ID;
    note.style.marginTop = "8px";
    note.style.fontSize = "12px";
    note.style.color = "#cc3c3c";
    note.style.display = "none";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    afterEl.insertAdjacentElement("afterend", note);
  }
  return note;
}

const duplicateState = {
  lastUrl: "",
  lastCheckedAt: 0,
  timer: null,
  inFlight: false,
};

async function updateDuplicateNote(noteEl, galleryId) {
  if (!noteEl) return;
  noteEl.style.display = "none";
  noteEl.textContent = "";
  if (!galleryId) return;
  if (duplicateState.inFlight) return;
  duplicateState.inFlight = true;

  try {
    const res = await ipcRenderer.invoke("library:lookupGalleryId", galleryId);
    if (res?.exists) {
      noteEl.textContent = "This comic is already downloaded";
      noteEl.style.display = "block";
    }
  } catch {}
  duplicateState.inFlight = false;
}

function scheduleDuplicateCheck(noteEl) {
  if (!noteEl) return;
  const galleryId = extractGalleryId();
  if (!galleryId) return;
  const now = Date.now();
  if (duplicateState.lastUrl === galleryId && now - duplicateState.lastCheckedAt < 1500) {
    return;
  }
  if (duplicateState.timer) clearTimeout(duplicateState.timer);
  duplicateState.timer = setTimeout(() => {
    duplicateState.timer = null;
    duplicateState.lastUrl = galleryId;
    duplicateState.lastCheckedAt = Date.now();
    updateDuplicateNote(noteEl, galleryId);
  }, 300);
}

function ensureAltButton() {
  // Keep the button scoped to the configured host.
  if (!hostMatches(location.hostname, state.altHost)) return;

  const buttons = document.querySelector(".buttons");
  const downloadBtn = document.querySelector(".buttons #download");
  if (!buttons || !downloadBtn) return;
  const existingAlt = document.getElementById(ALT_DOWNLOAD_ID);
  if (existingAlt) {
    const duplicateNote = ensureDuplicateNote(existingAlt);
    scheduleDuplicateCheck(duplicateNote);
    return;
  }

  if (!downloadBtn.dataset?.nvDisabled) {
    downloadBtn.dataset.nvDisabled = "1";
    downloadBtn.classList.add("btn-disabled", "disabled", "tooltip");
    downloadBtn.setAttribute("aria-disabled", "true");
    if (!downloadBtn.title) {
      downloadBtn.title = "Downloads are disabled in nView.";
    }
    if (downloadBtn.tagName.toLowerCase() === "a") {
      downloadBtn.removeAttribute("href");
      downloadBtn.setAttribute("tabindex", "-1");
      downloadBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    } else if ("disabled" in downloadBtn) {
      downloadBtn.disabled = true;
    }
  }

  const altBtn = document.createElement("button");
  altBtn.id = ALT_DOWNLOAD_ID;
  altBtn.type = "button";
  const classTokens = (downloadBtn.className || "btn btn-secondary")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const classSet = new Set(classTokens);
  classSet.delete("btn-disabled");
  classSet.delete("disabled");
  classSet.delete("tooltip");
  altBtn.className = classSet.size ? Array.from(classSet).join(" ") : "btn btn-secondary";
  altBtn.innerHTML = `<i class="fa fa-download"></i> Direct download`;

  altBtn.addEventListener("click", async () => {
    const meta = extractMeta();
    const imageUrls = extractImageUrls();

    if (!imageUrls.length) {
      window.alert("No thumbnails found for alternate download.");
      return;
    }

    altBtn.disabled = true;
    altBtn.classList.add("disabled");

    try {
      const res = await ipcRenderer.invoke("browser:altDownload", {
        meta,
        imageUrls,

        // Request context for anti-hotlinking.
        referer: location.href,
        origin: location.origin,
        userAgent: navigator.userAgent,

        // Optional hint if the main process needs session/partition context.
        partitionHint: window?.location?.hostname || "",
      });

      if (!res?.ok) {
        window.alert(res?.error || "Alternate download failed.");
      }
    } catch (err) {
      window.alert(`Alternate download failed: ${String(err)}`);
    } finally {
      altBtn.disabled = false;
      altBtn.classList.remove("disabled");
    }
  });

  downloadBtn.insertAdjacentElement("afterend", altBtn);
  const duplicateNote = ensureDuplicateNote(altBtn);
  scheduleDuplicateCheck(duplicateNote);
}

window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer
    .invoke("settings:get")
    .then((res) => {
      if (res?.ok) {
        const startPage = res.settings?.startPage;
        state.altHost = hostFromStartPage(startPage);
        state.useHttp = isLocalhostStartPage(startPage);
      }
    })
    .catch(() => {})
    .finally(() => {
      ensureAltButton();
    });
});

ipcRenderer.on("settings:updated", (_e, settings) => {
  const startPage = settings?.startPage;
  state.altHost = hostFromStartPage(startPage);
  state.useHttp = isLocalhostStartPage(startPage);
  ensureAltButton();
});

// Keep the button alive on DOM updates.
const observer = new MutationObserver(() => ensureAltButton());
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  window.addEventListener(
    "DOMContentLoaded",
    () => observer.observe(document.body, { childList: true, subtree: true }),
    { once: true }
  );
}
