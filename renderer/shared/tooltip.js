(() => {
  const DEFAULTS = Object.freeze({
    root: document,
    defaultPlacement: "auto",
    defaultDelayMs: 150,
    maxTextLength: 240,
    viewportPadding: 8,
  });

  const VALID_PLACEMENTS = new Set(["top", "bottom", "left", "right", "auto"]);
  const VALID_ROLLOUT_STAGES = new Set(["disabled", "index", "index-reader", "all"]);
  const WINDOW_ROLLOUT_ORDER = Object.freeze({
    index: 1,
    reader: 2,
    browser: 3,
    downloader: 3,
    exporter: 3,
    group_manager: 3,
    importer: 3,
    tag_manager: 3,
  });

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function normalizeTooltipText(value, maxTextLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length <= maxTextLength) return text;
    return `${text.slice(0, Math.max(0, maxTextLength - 1))}…`;
  }

  function parsePlacement(trigger, defaultPlacement) {
    const value = String(trigger?.dataset?.tooltipPlacement || "").trim().toLowerCase();
    if (!VALID_PLACEMENTS.has(value)) return defaultPlacement;
    return value;
  }

  function parseDelayMs(trigger, defaultDelayMs) {
    const raw = Number.parseInt(String(trigger?.dataset?.tooltipDelay || ""), 10);
    if (!Number.isFinite(raw)) return defaultDelayMs;
    return clamp(raw, 0, 1000);
  }

  function normalizeRolloutStage(value) {
    const stage = String(value || "").trim().toLowerCase();
    if (!VALID_ROLLOUT_STAGES.has(stage)) return "all";
    return stage;
  }

  function resolveRolloutStage(config) {
    const explicit = normalizeRolloutStage(config.rolloutStage);
    if (explicit !== "all" || String(config.rolloutStage || "").trim()) return explicit;
    return normalizeRolloutStage(window.__NVIEW_TOOLTIP_ROLLOUT_STAGE__);
  }

  function isRolloutEnabledForWindow(windowName, rolloutStage) {
    const target = String(windowName || "").trim().toLowerCase();
    const stage = normalizeRolloutStage(rolloutStage);
    if (stage === "disabled") return false;
    if (stage === "all") return true;
    const order = WINDOW_ROLLOUT_ORDER[target];
    if (!order) return true;
    if (stage === "index") return order <= 1;
    if (stage === "index-reader") return order <= 2;
    return true;
  }

  function canDisplayTooltip(trigger) {
    if (!trigger || !(trigger instanceof Element)) return false;
    if (trigger.dataset?.tooltipDisabled === "true") return false;
    if (trigger.hasAttribute("disabled") || trigger.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function isFocusVisibleTrigger(trigger) {
    if (!trigger || typeof trigger.matches !== "function") return true;
    try {
      return trigger.matches(":focus-visible");
    } catch {
      return true;
    }
  }

  function computePosition(triggerRect, tooltipRect, placement, viewportPadding) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const offset = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tooltip-offset")) || 8;

    const placements = placement === "auto"
      ? ["top", "bottom", "right", "left"]
      : [placement, "top", "bottom", "right", "left"].filter((v, i, arr) => arr.indexOf(v) === i);

    const fits = (left, top) => (
      left >= viewportPadding
      && top >= viewportPadding
      && left + tooltipRect.width <= vw - viewportPadding
      && top + tooltipRect.height <= vh - viewportPadding
    );

    for (const candidate of placements) {
      let left = 0;
      let top = 0;
      if (candidate === "top") {
        left = triggerRect.left + ((triggerRect.width - tooltipRect.width) / 2);
        top = triggerRect.top - tooltipRect.height - offset;
      } else if (candidate === "bottom") {
        left = triggerRect.left + ((triggerRect.width - tooltipRect.width) / 2);
        top = triggerRect.bottom + offset;
      } else if (candidate === "left") {
        left = triggerRect.left - tooltipRect.width - offset;
        top = triggerRect.top + ((triggerRect.height - tooltipRect.height) / 2);
      } else {
        left = triggerRect.right + offset;
        top = triggerRect.top + ((triggerRect.height - tooltipRect.height) / 2);
      }
      if (fits(left, top)) {
        return { left, top, placement: candidate };
      }
    }

    const fallbackLeft = clamp(
      triggerRect.left + ((triggerRect.width - tooltipRect.width) / 2),
      viewportPadding,
      Math.max(viewportPadding, vw - tooltipRect.width - viewportPadding),
    );
    const fallbackTop = clamp(
      triggerRect.top - tooltipRect.height - offset,
      viewportPadding,
      Math.max(viewportPadding, vh - tooltipRect.height - viewportPadding),
    );
    return { left: fallbackLeft, top: fallbackTop, placement: "top" };
  }

  function initTooltips(options = {}) {
    const config = {
      ...DEFAULTS,
      ...(options && typeof options === "object" ? options : {}),
    };

    const root = config.root || document;
    const rolloutStage = resolveRolloutStage(config);
    if (!isRolloutEnabledForWindow(config.windowName, rolloutStage)) {
      return {
        enabled: false,
        rolloutStage,
        reason: "rollout-disabled",
        destroy() {},
        hide() {},
      };
    }
    if (!root || typeof root.addEventListener !== "function") {
      return { destroy() {} };
    }

    const tooltipEl = document.createElement("div");
    tooltipEl.className = "ui-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.setAttribute("aria-hidden", "true");
    tooltipEl.dataset.state = "hidden";

    const tooltipId = `ui-tooltip-${Math.random().toString(36).slice(2, 10)}`;
    tooltipEl.id = tooltipId;
    document.body.appendChild(tooltipEl);

    let activeTrigger = null;
    let activeSource = "";
    let showTimer = null;
    let previousDescribedBy = null;

    function clearTimer() {
      if (showTimer !== null) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
    }

    function restoreAriaDescribedBy() {
      if (!activeTrigger) return;
      if (previousDescribedBy === null) {
        activeTrigger.removeAttribute("aria-describedby");
      } else {
        activeTrigger.setAttribute("aria-describedby", previousDescribedBy);
      }
      previousDescribedBy = null;
    }

    function hideTooltip() {
      clearTimer();
      tooltipEl.dataset.state = "hidden";
      tooltipEl.setAttribute("aria-hidden", "true");
      restoreAriaDescribedBy();
      activeTrigger = null;
      activeSource = "";
    }

    function updatePosition(trigger, placement) {
      const triggerRect = trigger.getBoundingClientRect();
      if (!triggerRect || (triggerRect.width <= 0 && triggerRect.height <= 0)) {
        hideTooltip();
        return;
      }
      const tooltipRect = tooltipEl.getBoundingClientRect();
      const { left, top, placement: resolved } = computePosition(
        triggerRect,
        tooltipRect,
        placement,
        config.viewportPadding,
      );
      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.setAttribute("data-placement", resolved);
    }

    function showTooltip(trigger, source) {
      if (!canDisplayTooltip(trigger)) return;

      const text = normalizeTooltipText(trigger.dataset?.tooltip, config.maxTextLength);
      if (!text) return;

      const placement = parsePlacement(trigger, config.defaultPlacement);
      tooltipEl.textContent = text;
      tooltipEl.dataset.state = "visible";
      tooltipEl.setAttribute("aria-hidden", "false");

      if (activeTrigger !== trigger) {
        restoreAriaDescribedBy();
        previousDescribedBy = trigger.getAttribute("aria-describedby");
      }

      activeTrigger = trigger;
      activeSource = source;
      trigger.setAttribute("aria-describedby", tooltipId);
      updatePosition(trigger, placement);
    }

    function scheduleShow(trigger, source) {
      clearTimer();
      if (!canDisplayTooltip(trigger)) return;
      const delayMs = parseDelayMs(trigger, config.defaultDelayMs);
      showTimer = window.setTimeout(() => {
        showTimer = null;
        showTooltip(trigger, source);
      }, source === "focus" ? 0 : delayMs);
    }

    function tooltipTriggerFromTarget(target) {
      if (!target || !(target instanceof Element)) return null;
      return target.closest("[data-tooltip]");
    }

    function onPointerOver(event) {
      const trigger = tooltipTriggerFromTarget(event.target);
      if (!trigger) return;
      if (trigger === activeTrigger && activeSource === "pointer") return;
      scheduleShow(trigger, "pointer");
    }

    function onPointerOut(event) {
      const trigger = tooltipTriggerFromTarget(event.target);
      if (!trigger) return;
      const next = event.relatedTarget;
      if (next instanceof Element && trigger.contains(next)) return;
      if (activeTrigger === trigger && activeSource === "pointer") {
        hideTooltip();
      } else {
        clearTimer();
      }
    }

    function onFocusIn(event) {
      const trigger = tooltipTriggerFromTarget(event.target);
      if (!trigger) return;
      if (!isFocusVisibleTrigger(trigger)) {
        clearTimer();
        return;
      }
      scheduleShow(trigger, "focus");
    }

    function onFocusOut(event) {
      const trigger = tooltipTriggerFromTarget(event.target);
      if (!trigger) return;
      if (activeTrigger === trigger && activeSource === "focus") {
        hideTooltip();
      } else {
        clearTimer();
      }
    }

    function onPointerDown() {
      hideTooltip();
    }

    function onClick() {
      hideTooltip();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") hideTooltip();
    }

    function onScrollOrResize() {
      if (!activeTrigger || !document.contains(activeTrigger)) {
        hideTooltip();
        return;
      }
      const placement = parsePlacement(activeTrigger, config.defaultPlacement);
      updatePosition(activeTrigger, placement);
    }

    function onWindowBlur() {
      hideTooltip();
    }

    root.addEventListener("mouseover", onPointerOver, true);
    root.addEventListener("mouseout", onPointerOut, true);
    root.addEventListener("focusin", onFocusIn, true);
    root.addEventListener("focusout", onFocusOut, true);
    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("click", onClick, true);
    root.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("blur", onWindowBlur);

    return {
      enabled: true,
      rolloutStage,
      destroy() {
        hideTooltip();
        root.removeEventListener("mouseover", onPointerOver, true);
        root.removeEventListener("mouseout", onPointerOut, true);
        root.removeEventListener("focusin", onFocusIn, true);
        root.removeEventListener("focusout", onFocusOut, true);
        root.removeEventListener("pointerdown", onPointerDown, true);
        root.removeEventListener("click", onClick, true);
        root.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", onScrollOrResize);
        window.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("blur", onWindowBlur);
        tooltipEl.remove();
      },
      hide: hideTooltip,
    };
  }

  function safeInitTooltips(options = {}) {
    try {
      return initTooltips(options);
    } catch (err) {
      console.warn("[tooltip] failed to initialize tooltip framework; continuing without tooltips", String(err));
      return {
        enabled: false,
        reason: "init-error",
        destroy() {},
        hide() {},
      };
    }
  }

  window.nviewTooltip = Object.freeze({
    initTooltips,
    safeInitTooltips,
    normalizeRolloutStage,
    isRolloutEnabledForWindow,
  });
})();
