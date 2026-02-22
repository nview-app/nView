(function initReaderPageControllerModule(globalObj) {
  const READER_PAGE_PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const READER_PAGE_MAX_WIDTH = 980;
  const READER_PAGE_FIT_HEIGHT_PADDING_PX = 28;
  const READER_PAGE_FALLBACK_ASPECT_RATIO = 1.45;
  const READER_PAGE_JUMP_SELECT_DEBOUNCE_MS = 90;
  const DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG = Object.freeze({
    enabled: true,
    hotRadius: 2,
    warmRadius: 8,
    maxResidentPages: 16,
    maxInflightLoads: 3,
    evictHysteresisMs: 2000,
    sweepIntervalMs: 7000,
    scrollVelocityPrefetchCutoff: 1.6,
  });
  const READER_RESIDENCY_AGGRESSIVE_MODE_MIN_MS = 8000;
  const READER_PAGE_STATUS = Object.freeze({
    IDLE: "idle",
    LOADING: "loading",
    LOADED: "loaded",
    EVICTED: "evicted",
    ERROR: "error",
  });

  function computeZones(anchorIndex, totalPages, hotRadius, warmRadius) {
    const total = Math.max(0, Math.floor(Number(totalPages) || 0));
    if (total === 0) {
      return { hot: new Set(), warm: new Set(), hotStart: -1, hotEnd: -1, warmStart: -1, warmEnd: -1 };
    }
    const normalizedAnchor = Math.max(0, Math.min(total - 1, Math.floor(Number(anchorIndex) || 0)));
    const normalizedHotRadius = Math.max(0, Math.floor(Number(hotRadius) || 0));
    const normalizedWarmRadius = Math.max(normalizedHotRadius, Math.floor(Number(warmRadius) || 0));
    const hotStart = Math.max(0, normalizedAnchor - normalizedHotRadius);
    const hotEnd = Math.min(total - 1, normalizedAnchor + normalizedHotRadius);
    const warmStart = Math.max(0, normalizedAnchor - normalizedWarmRadius);
    const warmEnd = Math.min(total - 1, normalizedAnchor + normalizedWarmRadius);
    const hot = new Set();
    const warm = new Set();
    for (let i = hotStart; i <= hotEnd; i += 1) hot.add(i);
    for (let i = warmStart; i <= warmEnd; i += 1) warm.add(i);
    return { hot, warm, hotStart, hotEnd, warmStart, warmEnd };
  }

  function priorityForIndex(anchorIndex, pageIndex) {
    return Math.abs((Number(anchorIndex) || 0) - (Number(pageIndex) || 0));
  }

  function shouldAbortLoad(state, zones, now = Date.now()) {
    if (!state || state.status !== READER_PAGE_STATUS.LOADING) return false;
    const pageIndex = Number(state.index);
    if (!Number.isFinite(pageIndex) || pageIndex < 0) return true;
    if (!zones?.warm?.has(pageIndex)) return true;
    if (state.lastLoadStartedAt == null) return false;
    const startedAt = Number(state.lastLoadStartedAt);
    if (!Number.isFinite(startedAt)) return false;
    return now < startedAt;
  }

  function shouldEvict(state, zones, residentCount, caps, now = Date.now()) {
    if (!state || state.status !== READER_PAGE_STATUS.LOADED) return false;
    const pageIndex = Number(state.index);
    if (!Number.isFinite(pageIndex) || pageIndex < 0) return false;
    if (zones?.hot?.has(pageIndex)) return false;
    if (zones?.warm?.has(pageIndex)) return false;
    const maxResidentPages = Math.max(1, Math.floor(Number(caps?.maxResidentPages) || 1));
    const allowOutsideWarmEviction = Boolean(caps?.allowOutsideWarmEviction);
    if (residentCount <= maxResidentPages && !allowOutsideWarmEviction) return false;
    const hysteresisMs = Math.max(0, Math.floor(Number(caps?.evictHysteresisMs) || 0));
    const lastVisibleAt = Number(state.lastVisibleAt || 0);
    if (!Number.isFinite(lastVisibleAt)) return false;
    return now - lastVisibleAt >= hysteresisMs;
  }

  function normalizePageDimension(value) {
    const numeric = Math.floor(Number(value));
    if (!Number.isFinite(numeric)) return null;
    if (numeric < 1 || numeric > 100000) return null;
    return numeric;
  }

  function createReaderPageState(index, now = Date.now()) {
    return {
      index,
      status: READER_PAGE_STATUS.IDLE,
      objectUrl: null,
      abortController: null,
      knownWidth: null,
      knownHeight: null,
      cachedSlotHeight: null,
      lastVisibleAt: now,
      lastLoadStartedAt: null,
      lastLoadCompletedAt: null,
      retryCount: 0,
      nextRetryAt: null,
      sessionTokenAtLoad: null,
    };
  }

  function toFiniteNumber(value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const next = Number(value);
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
  }

  function normalizeWindowedResidencyConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      enabled: Boolean(source.enabled),
      hotRadius: Math.round(
        toFiniteNumber(source.hotRadius, DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.hotRadius, { min: 0, max: 200 }),
      ),
      warmRadius: Math.round(
        toFiniteNumber(source.warmRadius, DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.warmRadius, { min: 0, max: 400 }),
      ),
      maxResidentPages: Math.round(
        toFiniteNumber(source.maxResidentPages, DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.maxResidentPages, {
          min: 1,
          max: 2000,
        }),
      ),
      maxInflightLoads: Math.round(
        toFiniteNumber(source.maxInflightLoads, DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.maxInflightLoads, {
          min: 1,
          max: 20,
        }),
      ),
      evictHysteresisMs: Math.round(
        toFiniteNumber(source.evictHysteresisMs, DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.evictHysteresisMs, {
          min: 0,
          max: 60_000,
        }),
      ),
      sweepIntervalMs: Math.round(
        toFiniteNumber(source.sweepIntervalMs, DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.sweepIntervalMs, {
          min: 250,
          max: 120_000,
        }),
      ),
      scrollVelocityPrefetchCutoff: toFiniteNumber(
        source.scrollVelocityPrefetchCutoff,
        DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG.scrollVelocityPrefetchCutoff,
        { min: 0, max: 20 },
      ),
    };
  }

  function createNoopReaderInstrumentation() {
    return {
      count: () => {},
      gauge: () => {},
      event: () => {},
      log: () => {},
    };
  }

  function createReaderPageController({
    win,
    readerEl,
    pagesEl,
    readerPageSelect,
    toAppBlobUrl,
    appBlobFetchOptions,
    onVaultLocked = () => {},
    readerRuntimeConfig = {},
    readerInstrumentation = null,
  }) {
    let readerPageEls = [];
    let readerFitHeight = false;
    let readerResizeObserver = null;
    let readerResizeRaf = null;
    let readerFitToggleRaf = null;
    let readerScrollRaf = null;
    let readerMetricsRaf = null;
    let readerMetricsVersion = 0;
    let readerMetricsLastRebuiltVersion = -1;
    let readerScrollAlignTimer = null;
    let readerScrollAlignRaf = null;
    let readerScrollAlignAttempts = 0;
    let readerPageSelectDebounceTimer = null;
    let readerPageMetrics = [];
    let readerPageStates = [];
    let readerSessionToken = 0;
    let readerResidencyRaf = null;
    let readerResidencySweepTimer = null;
    let readerPendingAnchorIndex = -1;
    let readerLastScrollSampleAt = 0;
    let readerLastScrollSampleTop = 0;
    let readerScrollVelocityPxPerMs = 0;
    let readerInflightLoads = 0;
    let readerAggressiveModeUntil = 0;
    let readerPressureHintHandler = null;
    let readerVisibilityChangeHandler = null;
    const readerLoadQueue = [];
    const readerQueuedPageIndices = new Set();

    const readerPageBlobUrls = new Map();
    const readerPageAbortControllers = new Map();
    let runtimeConfig = {
      windowedResidency: normalizeWindowedResidencyConfig(readerRuntimeConfig.windowedResidency),
    };
    const instrumentation =
      readerInstrumentation && typeof readerInstrumentation === "object"
        ? { ...createNoopReaderInstrumentation(), ...readerInstrumentation }
        : createNoopReaderInstrumentation();

    function setRuntimeConfig(nextConfig = {}) {
      runtimeConfig = {
        windowedResidency: normalizeWindowedResidencyConfig(nextConfig.windowedResidency),
      };
      instrumentation.gauge("reader.windowedResidency.enabled", runtimeConfig.windowedResidency.enabled ? 1 : 0);
      startResidencySweeper();
      scheduleWindowedResidencyUpdate();
    }

    function getReaderContentSize() {
      if (!pagesEl) return { width: 0, height: 0 };
      const styles = win.getComputedStyle(pagesEl);
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
        const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
        return Math.round(naturalHeight * scale);
      }
      const maxWidth = Math.min(contentWidth, READER_PAGE_MAX_WIDTH);
      const scale = Math.min(1, maxWidth / naturalWidth);
      return Math.round(naturalHeight * scale);
    }

    function computeReaderPageFallbackHeight() {
      const { width: contentWidth, height: contentHeight } = getReaderContentSize();
      const fitHeightFallback = Math.max(0, contentHeight - READER_PAGE_FIT_HEIGHT_PADDING_PX);
      const widthFallback =
        Math.min(contentWidth || READER_PAGE_MAX_WIDTH, READER_PAGE_MAX_WIDTH) *
        READER_PAGE_FALLBACK_ASPECT_RATIO;
      return Math.max(80, Math.round(readerFitHeight ? fitHeightFallback : widthFallback));
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
      const knownHeight = Number(img.dataset.pageHeight || 0);
      const height =
        computeReaderPageHeight(img) ||
        (Number.isFinite(knownHeight) && knownHeight > 1 ? knownHeight : computeReaderPageFallbackHeight());
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
      queueReaderMetricsRebuild();
    }

    function markReaderMetricsDirty() {
      readerMetricsVersion += 1;
    }

    function queueReaderMetricsRebuild() {
      markReaderMetricsDirty();
      if (readerMetricsRaf) return;
      readerMetricsRaf = win.requestAnimationFrame(() => {
        readerMetricsRaf = null;
        rebuildReaderPageMetrics();
      });
    }

    function ensureReaderMetricsReady() {
      if (readerMetricsVersion === readerMetricsLastRebuiltVersion) return;
      if (readerMetricsRaf) {
        win.cancelAnimationFrame(readerMetricsRaf);
        readerMetricsRaf = null;
      }
      rebuildReaderPageMetrics();
    }

    function scheduleReaderPageResize() {
      if (readerResizeRaf) return;
      readerResizeRaf = win.requestAnimationFrame(() => {
        readerResizeRaf = null;
        updateReaderPageHeights();
      });
    }

    function beginReaderSession() {
      readerSessionToken += 1;
      return readerSessionToken;
    }

    function getReaderPageState(index) {
      return readerPageStates[index] || null;
    }

    function isWindowedResidencyEnabled() {
      return Boolean(runtimeConfig.windowedResidency.enabled);
    }

    function getResidentPageCount() {
      let count = 0;
      for (const state of readerPageStates) {
        if (!state) continue;
        if (state.status === READER_PAGE_STATUS.LOADED) count += 1;
      }
      return count;
    }

    function isReaderVisible() {
      if (!readerEl || readerEl.style.display !== "block") return false;
      const visibilityState = win?.document?.visibilityState;
      return visibilityState !== "hidden";
    }

    function isAggressiveModeActive(now = Date.now()) {
      return now < readerAggressiveModeUntil;
    }

    function activateAggressiveMode(reason = "resident_over_cap", now = Date.now()) {
      const nextUntil = now + READER_RESIDENCY_AGGRESSIVE_MODE_MIN_MS;
      if (nextUntil <= readerAggressiveModeUntil) {
        instrumentation.event("reader.residency.aggressive.extend", { reason });
      } else {
        instrumentation.count("reader.residency.aggressive.entries", 1);
        instrumentation.event("reader.residency.aggressive.enter", { reason });
      }
      readerAggressiveModeUntil = nextUntil;
      instrumentation.gauge("reader.residency.aggressive.active", 1);
    }

    function getEffectiveResidencyConfig(now = Date.now()) {
      const base = runtimeConfig.windowedResidency;
      if (!isAggressiveModeActive(now)) {
        instrumentation.gauge("reader.residency.aggressive.active", 0);
        return { ...base, aggressive: false };
      }
      const hotRadius = Math.max(1, Math.floor(base.hotRadius / 2));
      const warmRadius = Math.max(hotRadius, Math.floor(base.warmRadius / 2));
      return {
        ...base,
        hotRadius,
        warmRadius,
        maxInflightLoads: Math.max(1, base.maxInflightLoads - 1),
        evictHysteresisMs: Math.min(base.evictHysteresisMs, 300),
        aggressive: true,
      };
    }

    function consumeNextQueuedLoad() {
      while (readerLoadQueue.length) {
        const nextIndex = readerLoadQueue.shift();
        readerQueuedPageIndices.delete(nextIndex);
        const state = getReaderPageState(nextIndex);
        if (!state) continue;
        if (state.status === READER_PAGE_STATUS.LOADING || state.status === READER_PAGE_STATUS.LOADED) continue;
        return nextIndex;
      }
      return null;
    }

    function flushReaderLoadQueue() {
      const maxInflightLoads = Math.max(1, runtimeConfig.windowedResidency.maxInflightLoads);
      while (readerInflightLoads < maxInflightLoads) {
        const pageIndex = consumeNextQueuedLoad();
        if (pageIndex == null) break;
        const img = readerPageEls[pageIndex];
        if (!img) continue;
        readerInflightLoads += 1;
        void loadReaderPageBlob(img, pageIndex).finally(() => {
          readerInflightLoads = Math.max(0, readerInflightLoads - 1);
          flushReaderLoadQueue();
        });
      }
    }

    function queueReaderPageLoad(pageIndex) {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= readerPageEls.length) return;
      if (readerQueuedPageIndices.has(pageIndex)) return;
      const state = getReaderPageState(pageIndex);
      if (!state) return;
      if (state.status === READER_PAGE_STATUS.LOADING || state.status === READER_PAGE_STATUS.LOADED) return;
      if (state.status === READER_PAGE_STATUS.ERROR && state.nextRetryAt && Date.now() < state.nextRetryAt) return;
      readerLoadQueue.push(pageIndex);
      readerQueuedPageIndices.add(pageIndex);
    }

    function measureReaderScrollVelocity() {
      if (!pagesEl) return 0;
      const now = Date.now();
      const top = Number(pagesEl.scrollTop || 0);
      if (readerLastScrollSampleAt > 0 && now > readerLastScrollSampleAt) {
        const dt = now - readerLastScrollSampleAt;
        const dy = Math.abs(top - readerLastScrollSampleTop);
        readerScrollVelocityPxPerMs = dt > 0 ? dy / dt : 0;
      }
      readerLastScrollSampleAt = now;
      readerLastScrollSampleTop = top;
      return readerScrollVelocityPxPerMs;
    }

    function scheduleWindowedResidencyUpdate() {
      if (!isWindowedResidencyEnabled()) return;
      if (readerResidencyRaf) return;
      readerResidencyRaf = win.requestAnimationFrame(() => {
        readerResidencyRaf = null;
        updateWindowedResidency();
      });
    }

    function getEvictionCandidates(zones, caps, now = Date.now()) {
      const candidates = [];
      const residentCount = getResidentPageCount();
      for (const state of readerPageStates) {
        if (!shouldEvict(state, zones, residentCount, caps, now)) continue;
        candidates.push(state);
      }
      candidates.sort((a, b) => {
        const aLastVisibleAt = Number(a?.lastVisibleAt || 0);
        const bLastVisibleAt = Number(b?.lastVisibleAt || 0);
        if (aLastVisibleAt !== bLastVisibleAt) return aLastVisibleAt - bLastVisibleAt;
        return (Number(a?.index) || 0) - (Number(b?.index) || 0);
      });
      return candidates;
    }

    function evictReaderPage(pageIndex, reason = "out_of_zone") {
      const state = getReaderPageState(pageIndex);
      const img = readerPageEls[pageIndex];
      if (!state || !img) return false;
      if (state.status !== READER_PAGE_STATUS.LOADED) return false;

      const knownWidth = Number(img.dataset.naturalWidth || 0);
      const knownHeight = Number(img.dataset.naturalHeight || 0);
      if (knownWidth > 0 && knownHeight > 0) {
        state.knownWidth = knownWidth;
        state.knownHeight = knownHeight;
      }
      const cachedHeight = Number(img.dataset.pageHeight || 0);
      if (Number.isFinite(cachedHeight) && cachedHeight > 1) {
        state.cachedSlotHeight = Math.round(cachedHeight);
      }

      if (state.objectUrl) {
        URL.revokeObjectURL(state.objectUrl);
        instrumentation.count("reader.blobs.revoked", 1);
      }
      readerPageBlobUrls.delete(img);
      state.objectUrl = null;
      state.abortController = null;
      state.sessionTokenAtLoad = null;
      state.status = READER_PAGE_STATUS.EVICTED;

      img.src = READER_PAGE_PLACEHOLDER;
      img.dataset.blobLoaded = "0";

      if (state.knownWidth && state.knownHeight) {
        img.dataset.naturalWidth = String(state.knownWidth);
        img.dataset.naturalHeight = String(state.knownHeight);
      }
      if (state.cachedSlotHeight && state.cachedSlotHeight > 1) {
        img.dataset.pageHeight = String(state.cachedSlotHeight);
      }
      applyReaderPageMinHeight(img);
      instrumentation.count("reader.evictions.count", 1);
      instrumentation.event("reader.evictions.page", { pageIndex, reason });
      return true;
    }

    function applyWindowedEvictions(
      zones,
      caps,
      { forceToCap = false, enforceZoneResidency = false, reason = "residency_update" } = {},
    ) {
      const maxResidentPages = Math.max(1, caps.maxResidentPages);
      let residentCount = getResidentPageCount();
      if (!forceToCap && !enforceZoneResidency && residentCount <= maxResidentPages) return;
      const candidates = getEvictionCandidates(zones, {
        ...caps,
        allowOutsideWarmEviction: enforceZoneResidency,
      });
      if (!candidates.length) return;
      let evictedCount = 0;
      for (const candidate of candidates) {
        if (!enforceZoneResidency && residentCount <= maxResidentPages) break;
        if (!evictReaderPage(candidate.index, reason)) continue;
        residentCount -= 1;
        evictedCount += 1;
      }
      if (evictedCount > 0) {
        queueReaderMetricsRebuild();
      }
    }

    function stopResidencySweeper() {
      if (!readerResidencySweepTimer) return;
      if (typeof win.clearInterval === "function") {
        win.clearInterval(readerResidencySweepTimer);
      } else {
        win.clearTimeout(readerResidencySweepTimer);
      }
      readerResidencySweepTimer = null;
    }

    function startResidencySweeper() {
      stopResidencySweeper();
      if (!isWindowedResidencyEnabled()) return;
      if (!isReaderVisible()) return;
      const intervalMs = Math.max(250, runtimeConfig.windowedResidency.sweepIntervalMs);
      if (typeof win.setInterval === "function") {
        readerResidencySweepTimer = win.setInterval(() => {
          if (!isReaderVisible()) {
            stopResidencySweeper();
            return;
          }
          scheduleWindowedResidencyUpdate();
        }, intervalMs);
      }
    }

    function updateWindowedResidency() {
      if (!isWindowedResidencyEnabled()) return;
      if (!readerPageEls.length) return;
      if (!isReaderVisible()) {
        stopResidencySweeper();
        return;
      }
      readerPendingAnchorIndex = getViewportAnchorPageIndex();
      const anchorIndex = Math.max(0, Math.min(readerPendingAnchorIndex, readerPageEls.length - 1));
      const now = Date.now();
      const residentCount = getResidentPageCount();
      if (residentCount > runtimeConfig.windowedResidency.maxResidentPages) {
        activateAggressiveMode("resident_over_cap", now);
      }
      const config = getEffectiveResidencyConfig(now);
      const zones = computeZones(anchorIndex, readerPageEls.length, config.hotRadius, config.warmRadius);
      for (const pageIndex of zones.hot) {
        const state = getReaderPageState(pageIndex);
        if (!state) continue;
        state.lastVisibleAt = now;
      }

      for (const state of readerPageStates) {
        if (!shouldAbortLoad(state, zones, now)) continue;
        state.abortController?.abort();
      }

      const hotCandidates = [];
      const warmCandidates = [];
      for (let i = 0; i < readerPageStates.length; i += 1) {
        const state = readerPageStates[i];
        if (!state) continue;
        if (state.status === READER_PAGE_STATUS.LOADING || state.status === READER_PAGE_STATUS.LOADED) continue;
        if (state.status === READER_PAGE_STATUS.ERROR && state.nextRetryAt && now < state.nextRetryAt) continue;
        if (zones.hot.has(i)) {
          hotCandidates.push(i);
        } else if (zones.warm.has(i)) {
          warmCandidates.push(i);
        }
      }
      hotCandidates.sort((a, b) => priorityForIndex(anchorIndex, a) - priorityForIndex(anchorIndex, b));
      warmCandidates.sort((a, b) => priorityForIndex(anchorIndex, a) - priorityForIndex(anchorIndex, b));
      for (const index of hotCandidates) queueReaderPageLoad(index);

      const velocity = measureReaderScrollVelocity();
      if (
        velocity <= config.scrollVelocityPrefetchCutoff &&
        readerInflightLoads < config.maxInflightLoads &&
        getResidentPageCount() < config.maxResidentPages
      ) {
        for (const index of warmCandidates) queueReaderPageLoad(index);
      }
      applyWindowedEvictions(zones, config, {
        forceToCap: true,
        enforceZoneResidency: true,
        reason: config.aggressive ? "aggressive_pressure" : "outside_warm",
      });
      instrumentation.gauge("reader.residentPages.current", getResidentPageCount());
      instrumentation.gauge("reader.loads.inflight", readerInflightLoads);
      flushReaderLoadQueue();
    }

    function handleMemoryPressureHint(payload = {}) {
      if (!isWindowedResidencyEnabled()) return;
      instrumentation.count("reader.residency.memoryPressureHint", 1);
      activateAggressiveMode("memory_pressure_hint");
      instrumentation.event("reader.residency.memoryPressureHint", {
        level: String(payload?.level || "unknown"),
      });
      scheduleWindowedResidencyUpdate();
    }

    async function loadReaderPageBlob(img, pageIndex) {
      if (!img || img.dataset.blobLoaded === "1") return;
      const pagePath = img.dataset.pagePath;
      if (!pagePath) return;
      const state = getReaderPageState(pageIndex);
      if (!state) return;
      if (state.status === READER_PAGE_STATUS.LOADING || state.status === READER_PAGE_STATUS.LOADED) return;
      if (state.status === READER_PAGE_STATUS.ERROR && state.nextRetryAt && Date.now() < state.nextRetryAt) return;

      const sessionToken = readerSessionToken;
      state.status = READER_PAGE_STATUS.LOADING;
      state.lastLoadStartedAt = Date.now();
      state.sessionTokenAtLoad = sessionToken;
      instrumentation.count("reader.loads.started", 1);
      const controller = new AbortController();
      state.abortController = controller;
      readerPageAbortControllers.set(img, controller);
      let response;
      try {
        response = await fetch(toAppBlobUrl(pagePath), appBlobFetchOptions(controller.signal));
      } catch (error) {
        img.dataset.blobLoaded = "0";
        state.abortController = null;
        state.status = error?.name === "AbortError" ? READER_PAGE_STATUS.IDLE : READER_PAGE_STATUS.ERROR;
        if (error?.name === "AbortError") {
          state.nextRetryAt = null;
        } else {
          state.retryCount += 1;
          state.nextRetryAt = Date.now() + Math.min(5000, 250 * 2 ** Math.min(state.retryCount, 4));
        }
        readerPageAbortControllers.delete(img);
        if (error?.name === "AbortError") {
          instrumentation.count("reader.loads.aborted", 1);
        } else {
          instrumentation.count("reader.loads.failed", 1);
        }
        if (error?.name !== "AbortError") {
          // Keep failures non-fatal; image remains placeholder and can be retried when re-observed.
        }
        return;
      }
      readerPageAbortControllers.delete(img);
      state.abortController = null;

      if (!response.ok) {
        img.dataset.blobLoaded = "0";
        state.status = READER_PAGE_STATUS.ERROR;
        state.retryCount += 1;
        state.nextRetryAt = Date.now() + Math.min(5000, 250 * 2 ** Math.min(state.retryCount, 4));
        instrumentation.count("reader.loads.failed", 1);
        if (response.status === 401) onVaultLocked();
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (readerSessionToken !== sessionToken || state.sessionTokenAtLoad !== sessionToken) {
        URL.revokeObjectURL(objectUrl);
        state.status = READER_PAGE_STATUS.IDLE;
        state.objectUrl = null;
        return;
      }
      if (!img.isConnected) {
        URL.revokeObjectURL(objectUrl);
        state.status = READER_PAGE_STATUS.IDLE;
        state.objectUrl = null;
        return;
      }

      readerPageBlobUrls.set(img, objectUrl);
      img.dataset.blobLoaded = "1";
      state.status = READER_PAGE_STATUS.LOADED;
      state.objectUrl = objectUrl;
      state.lastLoadCompletedAt = Date.now();
      state.retryCount = 0;
      state.nextRetryAt = null;
      instrumentation.count("reader.loads.completed", 1);
      img.addEventListener(
        "load",
        () => {
          if (state.status !== READER_PAGE_STATUS.LOADED) return;
          img.dataset.naturalWidth = String(img.naturalWidth || 0);
          img.dataset.naturalHeight = String(img.naturalHeight || 0);
          const naturalWidth = Number(img.dataset.naturalWidth || 0);
          const naturalHeight = Number(img.dataset.naturalHeight || 0);
          if (naturalWidth > 0 && naturalHeight > 0) {
            state.knownWidth = naturalWidth;
            state.knownHeight = naturalHeight;
          }
          win.requestAnimationFrame(() => {
            setReaderPageMinHeight(img);
            const cachedHeight = Number(img.dataset.pageHeight || 0);
            if (Number.isFinite(cachedHeight) && cachedHeight > 1) {
              state.cachedSlotHeight = Math.round(cachedHeight);
            }
            queueReaderMetricsRebuild();
          });
        },
        { once: true },
      );
      img.src = objectUrl;
      scheduleWindowedResidencyUpdate();
    }

    function initReaderResizeObserver() {
      if (readerResizeObserver) readerResizeObserver.disconnect();
      if (!pagesEl) return;
      readerResizeObserver = new ResizeObserver(() => {
        scheduleReaderPageResize();
      });
      readerResizeObserver.observe(pagesEl);
    }

    function populateReaderJump(pages) {
      if (!readerPageSelect) return;
      readerPageSelect.innerHTML = "";
      const safePages = Array.isArray(pages) ? pages : [];
      for (let i = 0; i < safePages.length; i += 1) {
        const page = safePages[i];
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `Page ${i + 1}${page?.name ? ` (${page.name})` : ""}`;
        readerPageSelect.appendChild(option);
      }
      readerPageSelect.disabled = safePages.length === 0;
    }

    function getReaderScrollPaddingTop() {
      if (!pagesEl) return 0;
      const styles = win.getComputedStyle(pagesEl);
      return Number.parseFloat(styles.paddingTop) || 0;
    }

    function getReaderPageVerticalGap() {
      const sample = readerPageEls[0];
      if (!sample) return 0;
      const styles = win.getComputedStyle(sample);
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
        readerMetricsLastRebuiltVersion = readerMetricsVersion;
        instrumentation.count("reader.metrics.rebuild.count", 1);
        return;
      }

      const fallbackHeight = computeReaderPageFallbackHeight();

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
      readerMetricsLastRebuiltVersion = readerMetricsVersion;
      instrumentation.count("reader.metrics.rebuild.count", 1);
    }

    function getPageOffsetTop(pageEl) {
      if (!pagesEl || !pageEl) return 0;
      const index = readerPageEls.indexOf(pageEl);
      if (index < 0) return 0;
      const metric = readerPageMetrics[index];
      if (metric && Number.isFinite(metric.top) && metric.top >= 0) {
        return metric.top;
      }
      const directOffsetTop = Number(pageEl.offsetTop);
      if (Number.isFinite(directOffsetTop) && directOffsetTop >= 0) {
        return directOffsetTop;
      }
      ensureReaderMetricsReady();
      return readerPageMetrics[index]?.top || 0;
    }

    function alignReaderPageToTop(index) {
      if (!pagesEl || !readerPageEls.length) return;
      ensureReaderMetricsReady();
      const clamped = Math.max(0, Math.min(index, readerPageEls.length - 1));
      const target = readerPageEls[clamped];
      if (!target) return;
      const paddingTop = getReaderScrollPaddingTop();
      const targetTop = Math.max(0, getPageOffsetTop(target) - paddingTop);
      if (Math.abs(pagesEl.scrollTop - targetTop) <= 2) return;
      pagesEl.scrollTo({ top: targetTop, behavior: "auto" });
    }

    function scheduleReaderScrollAlignment(index) {
      if (!pagesEl) return;
      if (readerScrollAlignTimer) {
        win.clearTimeout(readerScrollAlignTimer);
        readerScrollAlignTimer = null;
      }
      if (readerScrollAlignRaf) {
        win.cancelAnimationFrame(readerScrollAlignRaf);
        readerScrollAlignRaf = null;
      }

      readerScrollAlignTimer = win.setTimeout(() => {
        readerScrollAlignTimer = null;
        readerScrollAlignRaf = win.requestAnimationFrame(() => {
          readerScrollAlignRaf = null;
          alignReaderPageToTop(index);
          readerScrollAlignAttempts += 1;
          if (readerScrollAlignAttempts < 3) {
            scheduleReaderScrollAlignment(index);
          }
        });
      }, 180);
    }

    function scrollToPage(index, behavior = "smooth", scheduleAlignment = true) {
      if (!readerPageEls.length) return;
      const clamped = Math.max(0, Math.min(index, readerPageEls.length - 1));
      const target = readerPageEls[clamped];
      if (!target) return;
      ensureReaderMetricsReady();
      const paddingTop = getReaderScrollPaddingTop();
      const targetTop = Math.max(0, getPageOffsetTop(target) - paddingTop);
      pagesEl.scrollTo({ top: targetTop, behavior });
      if (scheduleAlignment) {
        readerScrollAlignAttempts = 0;
        scheduleReaderScrollAlignment(clamped);
      }
    }

    function getViewportAnchorPageIndex() {
      if (!readerPageEls.length || !pagesEl) return -1;
      if (typeof document.elementFromPoint === "function") {
        const containerRect = pagesEl.getBoundingClientRect();
        const left = Number.isFinite(containerRect.left) ? containerRect.left : 0;
        const width = Number.isFinite(containerRect.width) ? containerRect.width : 0;
        const top = Number.isFinite(containerRect.top) ? containerRect.top : 0;
        const bottom = Number.isFinite(containerRect.bottom)
          ? containerRect.bottom
          : top + (Number.isFinite(containerRect.height) ? containerRect.height : 0);
        const x = left + Math.max(1, Math.round((width || 2) / 2));
        const y = Math.min(bottom - 1, top + getReaderScrollPaddingTop() + 2);
        let anchor = document.elementFromPoint(x, y);
        while (anchor && anchor !== pagesEl && !anchor.classList?.contains("page")) {
          anchor = anchor.parentElement;
        }
        if (anchor && anchor.classList?.contains("page")) {
          const index = readerPageEls.indexOf(anchor);
          if (index >= 0) return index;
        }
      }
      return getCurrentPageIndex();
    }

    function getCurrentPageIndex() {
      if (!readerPageEls.length) return -1;
      ensureReaderMetricsReady();
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
    function getCurrentPageOffsetPx() {
      const index = getCurrentPageIndex();
      if (index < 0 || !pagesEl) return 0;
      const metric = readerPageMetrics[index];
      if (!metric) return 0;
      const paddingTop = getReaderScrollPaddingTop();
      const viewTop = pagesEl.scrollTop + paddingTop;
      return Math.max(0, Math.round(viewTop - metric.top));
    }

    function scrollToPageWithOffset(index, offsetPx = 0, behavior = "auto") {
      if (!readerPageEls.length || !pagesEl) return;
      const clamped = Math.max(0, Math.min(Number(index) || 0, readerPageEls.length - 1));
      ensureReaderMetricsReady();
      const metric = readerPageMetrics[clamped];
      if (!metric) {
        scrollToPage(clamped, behavior);
        return;
      }
      const requestedOffset = Math.max(0, Number(offsetPx) || 0);
      const maxOffset = Math.max(0, Math.round(metric.height || 0) - 2);
      const safeOffset = Math.min(requestedOffset, maxOffset);
      const targetTop = Math.max(0, getPageOffsetTop(readerPageEls[clamped]) + safeOffset - getReaderScrollPaddingTop());
      pagesEl.scrollTo({ top: targetTop, behavior });
    }


    function updateReaderPageSelect() {
      if (!readerPageSelect || readerPageSelect.disabled) return;
      const index = getCurrentPageIndex();
      if (index < 0) return;
      if (readerPageSelect.value !== String(index)) {
        readerPageSelect.value = String(index);
      }
    }

    function scheduleReaderPageSelectUpdate() {
      if (!readerPageSelect || readerPageSelect.disabled) return;
      if (readerPageSelectDebounceTimer) {
        win.clearTimeout(readerPageSelectDebounceTimer);
      }
      readerPageSelectDebounceTimer = win.setTimeout(() => {
        readerPageSelectDebounceTimer = null;
        updateReaderPageSelect();
      }, READER_PAGE_JUMP_SELECT_DEBOUNCE_MS);
    }

    function releaseReaderPageBlobs() {
      beginReaderSession();
      for (const controller of readerPageAbortControllers.values()) {
        controller.abort();
      }
      readerPageAbortControllers.clear();
      for (const url of readerPageBlobUrls.values()) {
        URL.revokeObjectURL(url);
      }
      if (readerPageBlobUrls.size > 0) {
        instrumentation.count("reader.blobs.revoked", readerPageBlobUrls.size);
      }
      readerPageBlobUrls.clear();
      if (readerResizeObserver) {
        readerResizeObserver.disconnect();
        readerResizeObserver = null;
      }
      if (readerResizeRaf) {
        win.cancelAnimationFrame(readerResizeRaf);
        readerResizeRaf = null;
      }
      if (readerScrollAlignTimer) {
        win.clearTimeout(readerScrollAlignTimer);
        readerScrollAlignTimer = null;
      }
      if (readerScrollAlignRaf) {
        win.cancelAnimationFrame(readerScrollAlignRaf);
        readerScrollAlignRaf = null;
      }
      if (readerScrollRaf) {
        win.cancelAnimationFrame(readerScrollRaf);
        readerScrollRaf = null;
      }
      if (readerResidencyRaf) {
        win.cancelAnimationFrame(readerResidencyRaf);
        readerResidencyRaf = null;
      }
      if (readerMetricsRaf) {
        win.cancelAnimationFrame(readerMetricsRaf);
        readerMetricsRaf = null;
      }
      stopResidencySweeper();
      if (readerFitToggleRaf) {
        win.cancelAnimationFrame(readerFitToggleRaf);
        readerFitToggleRaf = null;
      }
      if (readerPageSelectDebounceTimer) {
        win.clearTimeout(readerPageSelectDebounceTimer);
        readerPageSelectDebounceTimer = null;
      }
      readerScrollAlignAttempts = 0;
      readerInflightLoads = 0;
      readerLoadQueue.length = 0;
      readerQueuedPageIndices.clear();
      readerPendingAnchorIndex = -1;
      readerMetricsVersion = 0;
      readerMetricsLastRebuiltVersion = -1;
      readerLastScrollSampleAt = 0;
      readerLastScrollSampleTop = 0;
      readerScrollVelocityPxPerMs = 0;
      readerAggressiveModeUntil = 0;
      for (const state of readerPageStates) {
        if (!state) continue;
        state.abortController = null;
        state.objectUrl = null;
        state.sessionTokenAtLoad = null;
        state.nextRetryAt = null;
        if (state.status !== READER_PAGE_STATUS.ERROR) state.status = READER_PAGE_STATUS.IDLE;
      }
    }

    function open({ pages = [] }) {
      releaseReaderPageBlobs();
      pagesEl.innerHTML = "";
      readerEl.classList.toggle("fit-height", readerFitHeight);
      readerPageStates = [];
      const openedAt = Date.now();

      for (const [index, p] of pages.entries()) {
        const img = document.createElement("img");
        img.className = "page";
        img.loading = "eager";
        img.decoding = "async";
        img.fetchPriority = "high";
        img.draggable = false;
        img.src = READER_PAGE_PLACEHOLDER;
        img.dataset.blobLoaded = "0";
        img.dataset.pagePath = p.path;
        img.alt = p.name;
        const preloadedWidth = normalizePageDimension(p?.w);
        const preloadedHeight = normalizePageDimension(p?.h);
        if (preloadedWidth && preloadedHeight) {
          img.dataset.naturalWidth = String(preloadedWidth);
          img.dataset.naturalHeight = String(preloadedHeight);
        }
        applyReaderPageMinHeight(img);
        const state = createReaderPageState(index, openedAt);
        if (preloadedWidth && preloadedHeight) {
          state.knownWidth = preloadedWidth;
          state.knownHeight = preloadedHeight;
        }
        const cachedHeight = Number(String(img.style.minHeight || "0").replace("px", ""));
        if (Number.isFinite(cachedHeight) && cachedHeight > 1) state.cachedSlotHeight = Math.round(cachedHeight);
        readerPageStates.push(state);
        pagesEl.appendChild(img);
        if (!isWindowedResidencyEnabled()) {
          void loadReaderPageBlob(img, index);
        }
      }

      readerPageEls = Array.from(pagesEl.querySelectorAll(".page"));
      populateReaderJump(pages);
      queueReaderMetricsRebuild();
      ensureReaderMetricsReady();
      updateReaderPageSelect();
      initReaderResizeObserver();
      startResidencySweeper();
      scheduleWindowedResidencyUpdate();
    }

    function close() {
      releaseReaderPageBlobs();
      pagesEl.innerHTML = "";
      readerPageEls = [];
      readerPageMetrics = [];
      readerPageStates = [];
      if (readerPageSelect) {
        readerPageSelect.innerHTML = "";
        readerPageSelect.disabled = true;
      }
      readerScrollAlignAttempts = 0;
    }

    function toggleFitHeight() {
      const anchorIndex = getCurrentPageIndex();
      const anchorOffset = anchorIndex >= 0 ? getCurrentPageOffsetPx() : 0;
      readerFitHeight = !readerFitHeight;
      readerEl.classList.toggle("fit-height", readerFitHeight);
      if (readerFitToggleRaf) {
        win.cancelAnimationFrame(readerFitToggleRaf);
        readerFitToggleRaf = null;
      }
      if (anchorIndex >= 0) {
        readerFitToggleRaf = win.requestAnimationFrame(() => {
          readerFitToggleRaf = null;
          for (const img of readerPageEls) {
            if (img.dataset.blobLoaded === "1") {
              setReaderPageMinHeight(img);
            } else {
              applyReaderPageMinHeight(img);
            }
          }
          queueReaderMetricsRebuild();
          ensureReaderMetricsReady();
          scrollToPageWithOffset(anchorIndex, anchorOffset, "auto");
        });
      }
      return readerFitHeight;
    }

    readerPageSelect?.addEventListener("change", () => {
      const index = Number(readerPageSelect.value);
      if (!Number.isFinite(index)) return;
      scrollToPage(index, "auto");
    });

    pagesEl?.addEventListener("scroll", () => {
      if (readerScrollRaf) return;
      readerScrollRaf = win.requestAnimationFrame(() => {
        readerScrollRaf = null;
        scheduleReaderPageSelectUpdate();
        scheduleWindowedResidencyUpdate();
      });
    });

    if (typeof win.addEventListener === "function") {
      readerPressureHintHandler = (event) => {
        handleMemoryPressureHint(event?.detail || {});
      };
      win.addEventListener("nview:reader-memory-pressure", readerPressureHintHandler);
    }
    if (win.document && typeof win.document.addEventListener === "function") {
      readerVisibilityChangeHandler = () => {
        if (isReaderVisible()) {
          startResidencySweeper();
          scheduleWindowedResidencyUpdate();
        } else {
          stopResidencySweeper();
        }
      };
      win.document.addEventListener("visibilitychange", readerVisibilityChangeHandler);
    }

    return {
      open,
      close,
      toggleFitHeight,
      scrollToPage,
      getCurrentPageIndex,
      getCurrentPageOffsetPx,
      scrollToPageWithOffset,
      getPageCount: () => readerPageEls.length,
      hasPages: () => readerPageEls.length > 0,
      getRuntimeConfig: () => ({
        windowedResidency: { ...runtimeConfig.windowedResidency },
      }),
      setRuntimeConfig,
      handleMemoryPressureHint,
    };
  }

  globalObj.nviewReaderPageController = {
    createReaderPageController,
    DEFAULT_READER_WINDOWED_RESIDENCY_CONFIG,
    READER_PAGE_STATUS,
    normalizeWindowedResidencyConfig,
    createNoopReaderInstrumentation,
    computeZones,
    priorityForIndex,
    shouldAbortLoad,
    shouldEvict,
    createReaderPageState,
  };
})(window);
