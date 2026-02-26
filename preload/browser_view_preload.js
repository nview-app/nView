const { ipcRenderer } = require("electron");
const { ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING } = require("../shared/dev_mode");
const { resolveSourceAdapter } = require("./source_adapters/registry");

const state = {
  useHttp: false,
  inFlightRequestId: "",
};

function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function isLocalhostHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}


function logDirectDownload(stage, details) {
  if (!ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING) return;
  const prefix = `[direct-download][browser-view] ${stage}`;
  if (details === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, details);
}

function emitDebugLog(stage, requestId, details) {
  if (!ENABLE_DIRECT_DOWNLOAD_CMD_LOGGING) return;
  ipcRenderer.invoke("browser:directDownload:debugLog", {
    stage,
    requestId,
    details,
  }).catch(() => {});
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

async function collectDirectDownloadPayload() {
  const adapter = resolveSourceAdapter(location.href);
  const collectStartDetails = {
    url: location.origin + location.pathname,
    hasAdapter: Boolean(adapter),
    sourceId: adapter?.sourceId || null,
  };
  logDirectDownload("scrape:collect-start", collectStartDetails);
  emitDebugLog("scrape:collect-start", state.inFlightRequestId, collectStartDetails);
  if (!adapter) {
    return { ok: false, error: "No matching source adapter." };
  }
  const meta = adapter.extractMetadata(document, location, { useHttp: state.useHttp });
  const imageUrls = await adapter.extractPageImageUrls(document, location, { useHttp: state.useHttp });
  const collectFinishedDetails = {
    imageCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
    hasTitle: Boolean(meta?.title),
  };
  logDirectDownload("scrape:collect-finished", collectFinishedDetails);
  emitDebugLog("scrape:collect-finished", state.inFlightRequestId, collectFinishedDetails);
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { ok: false, error: "No image URLs were extracted." };
  }

  return {
    ok: true,
    payload: {
      meta,
      imageUrls,
      referer: location.href,
      origin: location.origin,
      userAgent: navigator.userAgent,
    },
  };
}

window.addEventListener("DOMContentLoaded", () => {
  emitDebugLog("dom-content-loaded", "", { href: location.origin + location.pathname });
  ipcRenderer
    .invoke("settings:get")
    .then((res) => {
      if (res?.ok) {
        const startPage = res.settings?.startPage;
        state.useHttp = isLocalhostStartPage(startPage);
      }
    })
    .catch(() => {});
});

ipcRenderer.on("settings:updated", (_event, settings) => {
  state.useHttp = isLocalhostStartPage(settings?.startPage);
});

ipcRenderer.on("browser:direct-download:scrape-request", async (_event, payload) => {
  const requestId = String(payload?.requestId || "").trim();
  const requestReceivedDetails = { requestId: requestId || null };
  logDirectDownload("scrape:request-received", requestReceivedDetails);
  emitDebugLog("scrape:request-received", requestId, requestReceivedDetails);
  if (!requestId) return;
  if (state.inFlightRequestId) {
    const rejectedInFlightDetails = { inFlightRequestId: state.inFlightRequestId, requestId };
    logDirectDownload("scrape:rejected-in-flight", rejectedInFlightDetails);
    emitDebugLog("scrape:rejected-in-flight", requestId, rejectedInFlightDetails);
    ipcRenderer.invoke("browser:directDownload:scrapeResult", {
      requestId,
      ok: false,
      error: "A scrape request is already in progress.",
    }).catch(() => {});
    return;
  }

  state.inFlightRequestId = requestId;
  try {
    const processingDetails = { requestId };
    logDirectDownload("scrape:processing", processingDetails);
    emitDebugLog("scrape:processing", requestId, processingDetails);
    const result = await collectDirectDownloadPayload();
    const submittingResultDetails = {
      requestId,
      ok: result.ok,
      error: result.ok ? null : result.error,
    };
    logDirectDownload("scrape:submitting-result", submittingResultDetails);
    emitDebugLog("scrape:submitting-result", requestId, submittingResultDetails);
    ipcRenderer.invoke("browser:directDownload:scrapeResult", {
      requestId,
      ok: result.ok,
      payload: result.ok ? result.payload : undefined,
      error: result.ok ? undefined : result.error,
    }).catch(() => {});
  } finally {
    const completedDetails = { requestId };
    logDirectDownload("scrape:completed", completedDetails);
    emitDebugLog("scrape:completed", requestId, completedDetails);
    state.inFlightRequestId = "";
  }
});

ipcRenderer.on("browser:direct-download:scrape-cancel", (_event, payload) => {
  const requestId = String(payload?.requestId || "").trim();
  const cancelDetails = { requestId: requestId || null, inFlightRequestId: state.inFlightRequestId || null };
  logDirectDownload("scrape:cancel-received", cancelDetails);
  emitDebugLog("scrape:cancel-received", requestId, cancelDetails);
  if (requestId && requestId === state.inFlightRequestId) {
    state.inFlightRequestId = "";
  }
});
