(function installBridgeGuard(globalScope) {
  function ensureBridgeApis(options = {}) {
    const windowName = String(options.windowName || "Renderer").trim() || "Renderer";
    const required = Array.isArray(options.required) ? options.required : [];
    const missing = required
      .map((name) => String(name || "").trim())
      .filter((name) => !name || globalScope[name] == null)
      .map((name) => (name ? `window.${name}` : "(invalid api name)"));

    if (missing.length === 0) {
      return { ok: true, missing: [] };
    }

    const doc = globalScope.document;
    if (!doc?.body || typeof doc.createElement !== "function") {
      return { ok: false, missing };
    }

    const panel = doc.createElement("section");
    panel.setAttribute("role", "alert");
    panel.style.cssText = [
      "box-sizing:border-box",
      "max-width:760px",
      "margin:40px auto",
      "padding:16px 18px",
      "border:1px solid #ef4444",
      "border-radius:8px",
      "background:#fff1f2",
      "color:#111827",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      "line-height:1.45",
    ].join(";");

    const missingCode = missing.map((name) => `<code>${name}</code>`).join(", ");
    panel.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:20px;">Preload bridge API missing</h2>
      <p style="margin:0 0 8px;"><strong>${windowName} window:</strong> renderer startup checks failed.</p>
      <p style="margin:0 0 8px;">Renderer startup was blocked because required bridge APIs are unavailable: ${missingCode}</p>
      <p style="margin:0 0 8px;">Likely causes: preload build not run, packaging missing <code>preload-dist</code>, or preload process crashed during startup.</p>
      <p style="margin:0;">Immediate next step: run <code>npm run build:preload</code> and rebuild/restart the app.</p>
    `;

    if (doc.body.firstChild) {
      doc.body.insertBefore(panel, doc.body.firstChild);
    } else {
      doc.body.appendChild(panel);
    }

    return { ok: false, missing };
  }

  function guardRenderer(options = {}) {
    const result = ensureBridgeApis(options);
    if (!result.ok) {
      try {
        console.error("Renderer boot halted: preload bridge API missing", result.missing);
      } catch {}
    }
    return result.ok;
  }

  const api = {
    ensureBridgeApis,
    guardRenderer,
  };

  globalScope.nviewBridgeGuard = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
