(function initGalleryThumbControllerModule(globalObj) {
  const DEFAULT_TUNING = {
    loadMarginPx: 800,
    retainMarginPx: 2600,
    maxInFlight: 6,
    maxActiveUrls: 180,
  };

  function parseTuningNumber(rawValue, fallback, { min, max }) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function loadGalleryThumbTuning(win) {
    let tuning = {};
    try {
      const raw = win.localStorage?.getItem("nview.galleryThumbTuning");
      if (raw) tuning = JSON.parse(raw) || {};
    } catch {
      tuning = {};
    }

    return {
      loadMarginPx: parseTuningNumber(tuning.loadMarginPx, DEFAULT_TUNING.loadMarginPx, {
        min: 200,
        max: 2400,
      }),
      retainMarginPx: parseTuningNumber(tuning.retainMarginPx, DEFAULT_TUNING.retainMarginPx, {
        min: 800,
        max: 8000,
      }),
      maxInFlight: parseTuningNumber(tuning.maxInFlight, DEFAULT_TUNING.maxInFlight, {
        min: 1,
        max: 12,
      }),
      maxActiveUrls: parseTuningNumber(tuning.maxActiveUrls, DEFAULT_TUNING.maxActiveUrls, {
        min: 24,
        max: 500,
      }),
    };
  }

  function createGalleryThumbController({
    win,
    toAppBlobUrl,
    appBlobFetchOptions,
    thumbPipeline,
    fallbackCoverSrc,
    fallbackNoCoverSrc,
    maxSize = { width: 610, height: 813 },
  }) {
    const pipelineContract = {
      hasFetchAndCreateThumbnailUrl: typeof thumbPipeline?.fetchAndCreateThumbnailUrl === "function",
      hasClassifyThumbnailFailure: typeof thumbPipeline?.classifyThumbnailFailure === "function",
    };
    let loggedPipelineContractError = false;

    const tuning = loadGalleryThumbTuning(win);
    const thumbUrls = new Map();
    const thumbLastAccess = new Map();
    const thumbQueue = [];
    const thumbRetryTimers = new WeakMap();

    const metrics = {
      enqueueCount: 0,
      dequeueCount: 0,
      loadSuccessCount: 0,
      loadFailureCount: 0,
      cacheHitCount: 0,
      cacheMissCount: 0,
      evictions: 0,
      evictionsByReason: {
        retainWindow: 0,
        activeCap: 0,
      },
      loadDurationMsTotal: 0,
      loadDurationMsMax: 0,
      peakActiveThumbs: 0,
      peakQueueDepth: 0,
      peakInFlight: 0,
    };

    let thumbObserver = null;
    let thumbEvictObserver = null;
    let thumbInFlight = 0;
    let thumbEvictRaf = null;

    function assertPipelineContract() {
      if (pipelineContract.hasFetchAndCreateThumbnailUrl) return true;
      if (loggedPipelineContractError) return false;
      loggedPipelineContractError = true;
      console.error(
        "[gallery] thumbnail pipeline contract missing: fetchAndCreateThumbnailUrl(filePath, target profile). Falling back to direct source fetches.",
      );
      return false;
    }

    function getFailurePolicy(result, retryCount) {
      if (pipelineContract.hasClassifyThumbnailFailure) {
        const classified = thumbPipeline.classifyThumbnailFailure(result, {
          defaultRetryDelayMs: 3500 + retryCount * 1000,
          vaultLockedRetryDelayMs: 15000,
        });
        if (classified) return classified;
      }

      const status = Number(result?.status || 0);
      if (status === 401) {
        return { status, code: "vault_locked", shouldRetry: true, retryDelayMs: 15000 };
      }
      if (status === 404) {
        return { status, code: "not_found", shouldRetry: false, retryDelayMs: 0 };
      }
      return {
        status,
        code: "unavailable",
        shouldRetry: true,
        retryDelayMs: Math.min(20000, 3500 + retryCount * 1000),
      };
    }

    function updateWatermarks() {
      metrics.peakActiveThumbs = Math.max(metrics.peakActiveThumbs, thumbUrls.size);
      metrics.peakQueueDepth = Math.max(metrics.peakQueueDepth, thumbQueue.length);
      metrics.peakInFlight = Math.max(metrics.peakInFlight, thumbInFlight);
    }

    function releaseThumb(img) {
      if (!img) return;
      const retryTimer = thumbRetryTimers.get(img);
      if (retryTimer) {
        win.clearTimeout(retryTimer);
        thumbRetryTimers.delete(img);
      }
      const url = thumbUrls.get(img);
      if (url) URL.revokeObjectURL(url);
      thumbUrls.delete(img);
      thumbLastAccess.delete(img);
      delete img.dataset.thumbQueued;
    }

    function releaseAll() {
      for (const url of thumbUrls.values()) {
        URL.revokeObjectURL(url);
      }
      thumbUrls.clear();
      thumbLastAccess.clear();
      thumbQueue.length = 0;
      thumbInFlight = 0;
      if (thumbObserver) {
        thumbObserver.disconnect();
        thumbObserver = null;
      }
      if (thumbEvictObserver) {
        thumbEvictObserver.disconnect();
        thumbEvictObserver = null;
      }
    }

    function isWithinRetainWindow(img) {
      const rect = img?.getBoundingClientRect?.();
      if (!rect) return false;
      const viewportW = win.innerWidth || win.document.documentElement.clientWidth || 0;
      const viewportH = win.innerHeight || win.document.documentElement.clientHeight || 0;
      const margin = tuning.retainMarginPx;
      return (
        rect.right >= -margin &&
        rect.left <= viewportW + margin &&
        rect.bottom >= -margin &&
        rect.top <= viewportH + margin
      );
    }

    function viewportDistance(img) {
      const rect = img?.getBoundingClientRect?.();
      if (!rect) return Number.POSITIVE_INFINITY;
      const viewportW = win.innerWidth || win.document.documentElement.clientWidth || 0;
      const viewportH = win.innerHeight || win.document.documentElement.clientHeight || 0;
      const dx = rect.left > viewportW ? rect.left - viewportW : rect.right < 0 ? -rect.right : 0;
      const dy = rect.top > viewportH ? rect.top - viewportH : rect.bottom < 0 ? -rect.bottom : 0;
      return Math.max(dx, dy);
    }

    function evictThumb(img, reason = "retainWindow") {
      if (!img) return;
      if (!thumbUrls.has(img)) return;
      if (img.dataset.thumbLoading === "1") return;
      if (isWithinRetainWindow(img)) return;
      releaseThumb(img);
      img.src = fallbackCoverSrc;
      img.dataset.thumbLoaded = "0";
      metrics.evictions += 1;
      if (reason === "activeCap") metrics.evictionsByReason.activeCap += 1;
      else metrics.evictionsByReason.retainWindow += 1;
    }

    function enforceActiveCap() {
      if (thumbUrls.size <= tuning.maxActiveUrls) return;
      const candidates = [];
      for (const [img, at] of thumbLastAccess.entries()) {
        if (!img?.isConnected) continue;
        if (isWithinRetainWindow(img)) continue;
        candidates.push({ img, at, distance: viewportDistance(img) });
      }
      candidates.sort((a, b) => {
        if (b.distance !== a.distance) return b.distance - a.distance;
        return a.at - b.at;
      });
      while (thumbUrls.size > tuning.maxActiveUrls && candidates.length) {
        const candidate = candidates.shift();
        evictThumb(candidate.img, "activeCap");
      }
    }

    function runEviction() {
      thumbEvictRaf = null;
      for (const img of thumbUrls.keys()) {
        if (!img?.isConnected) {
          releaseThumb(img);
          continue;
        }
        evictThumb(img, "retainWindow");
      }
      enforceActiveCap();
      updateWatermarks();
    }

    function scheduleEviction() {
      if (thumbEvictRaf) return;
      thumbEvictRaf = win.requestAnimationFrame(runEviction);
    }

    function enqueueThumb(img, { prioritize = false } = {}) {
      if (!img?.dataset?.coverPath) return;
      if (img.dataset.thumbQueued === "1") return;
      img.dataset.thumbQueued = "1";
      if (prioritize) thumbQueue.unshift(img);
      else thumbQueue.push(img);
      metrics.enqueueCount += 1;
      updateWatermarks();
      drainQueue();
    }

    function drainQueue() {
      while (thumbInFlight < tuning.maxInFlight && thumbQueue.length) {
        const img = thumbQueue.shift();
        if (!img) continue;
        delete img.dataset.thumbQueued;
        metrics.dequeueCount += 1;
        if (!img.isConnected) continue;
        if (img.dataset.thumbLoaded === "1" || img.dataset.thumbLoading === "1") continue;
        if (!isWithinRetainWindow(img)) continue;
        thumbInFlight += 1;
        updateWatermarks();
        void loadThumb(img).finally(() => {
          thumbInFlight = Math.max(0, thumbInFlight - 1);
          updateWatermarks();
          drainQueue();
          scheduleEviction();
        });
      }
    }

    function scheduleRetry(img, delayMs = 2000) {
      if (!img) return;
      img.dataset.thumbRetryAt = String(Date.now() + Math.max(0, Number(delayMs) || 0));

      const existing = thumbRetryTimers.get(img);
      if (existing) win.clearTimeout(existing);

      if (!img.isConnected) return;

      const timer = win.setTimeout(() => {
        thumbRetryTimers.delete(img);
        if (!img.isConnected) return;
        if (img.dataset.thumbLoaded === "1" || img.dataset.thumbLoading === "1") return;
        enqueueThumb(img, { prioritize: true });
      }, Math.max(16, Math.round(Number(delayMs) || 0)));
      thumbRetryTimers.set(img, timer);

      ensureObserver().observe(img);
    }

    async function loadThumb(img) {
      const coverPath = img?.dataset?.coverPath;
      if (!coverPath) return;

      const startedAt = (win.performance || performance).now();
      img.dataset.thumbLoading = "1";

      try {
        const cached = thumbUrls.get(img);
        if (cached) {
          thumbLastAccess.set(img, Date.now());
          img.src = cached;
          img.dataset.thumbLoaded = "1";
          metrics.cacheHitCount += 1;
          return;
        }

        metrics.cacheMissCount += 1;
        let objectUrl = "";
        let blob = null;

        let generatedResult = null;
        if (assertPipelineContract()) {
          const measuredTarget = thumbPipeline.computeTargetSizeFromElement
            ? thumbPipeline.computeTargetSizeFromElement(img, maxSize)
            : null;
          const targetWidth = measuredTarget?.hasMeasuredSize ? measuredTarget.width : maxSize.width;
          const targetHeight = measuredTarget?.hasMeasuredSize ? measuredTarget.height : maxSize.height;
          generatedResult = await thumbPipeline.fetchAndCreateThumbnailUrl({
            filePath: coverPath,
            targetWidth,
            targetHeight,
            mimeType: "image/jpeg",
            quality: 0.85,
            preferCanonicalOutput: false,
          });
          if (generatedResult?.ok && generatedResult.objectUrl) {
            objectUrl = generatedResult.objectUrl;
          }
        }

        const retryCount = Math.max(0, Number(img.dataset.thumbRetryCount || 0));
        const failurePolicy = getFailurePolicy(generatedResult, retryCount);
        const canFallbackToRawFetch =
          !objectUrl && (!generatedResult || generatedResult?.type === "network_error");

        if (canFallbackToRawFetch) {
          let response = null;
          try {
            response = await fetch(toAppBlobUrl(coverPath), appBlobFetchOptions());
          } catch {
            response = null;
          }
          if (response?.ok) {
            blob = await response.blob();
          }
        }

        if (!objectUrl && !blob) {
          img.src = fallbackNoCoverSrc;
          img.dataset.thumbLoaded = "0";
          if (failurePolicy?.status) img.dataset.thumbErrorStatus = String(failurePolicy.status);
          else delete img.dataset.thumbErrorStatus;
          img.dataset.thumbRetryCount = String(retryCount + 1);
          metrics.loadFailureCount += 1;
          if (failurePolicy.shouldRetry) {
            scheduleRetry(img, failurePolicy.retryDelayMs);
          }
          return;
        }

        if (!objectUrl && blob) {
          objectUrl = URL.createObjectURL(blob);
        }

        thumbUrls.set(img, objectUrl);
        thumbLastAccess.set(img, Date.now());
        img.src = objectUrl;
        img.dataset.thumbLoaded = "1";
        delete img.dataset.thumbRetryAt;
        delete img.dataset.thumbErrorStatus;
        delete img.dataset.thumbRetryCount;
        metrics.loadSuccessCount += 1;

        const durationMs = (win.performance || performance).now() - startedAt;
        metrics.loadDurationMsTotal += durationMs;
        metrics.loadDurationMsMax = Math.max(metrics.loadDurationMsMax, durationMs);
        updateWatermarks();
      } finally {
        delete img.dataset.thumbLoading;
      }
    }

    function ensureObserver() {
      if (thumbObserver) return thumbObserver;
      thumbObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const img = entry.target;
            const retryAt = Number(img.dataset.thumbRetryAt || 0);
            if (retryAt && Date.now() < retryAt) continue;
            if (img.dataset.thumbLoaded === "1" || img.dataset.thumbLoading === "1") continue;
            enqueueThumb(img, { prioritize: true });
          }
        },
        { root: null, rootMargin: `${tuning.loadMarginPx}px`, threshold: 0.01 },
      );
      return thumbObserver;
    }

    function ensureEvictObserver() {
      if (thumbEvictObserver) return thumbEvictObserver;
      thumbEvictObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) continue;
            const img = entry.target;
            if (img?.dataset?.thumbLoaded !== "1") continue;
            evictThumb(img, "retainWindow");
          }
        },
        {
          root: null,
          rootMargin: `${tuning.retainMarginPx}px`,
          threshold: 0,
        },
      );
      return thumbEvictObserver;
    }

    function init(images = []) {
      if (!images.length) return;
      const observer = ensureObserver();
      const evictObserver = ensureEvictObserver();
      for (const img of images) {
        if (!img?.dataset?.coverPath) continue;
        observer.unobserve(img);
        evictObserver.unobserve(img);
        observer.observe(img);
        evictObserver.observe(img);

        if (img.dataset.thumbLoaded === "1" || img.dataset.thumbLoading === "1") continue;
        if (!isWithinRetainWindow(img)) continue;

        const retryAt = Number(img.dataset.thumbRetryAt || 0);
        if (retryAt && Date.now() < retryAt) {
          const delayMs = Math.max(16, retryAt - Date.now());
          scheduleRetry(img, delayMs);
          continue;
        }

        enqueueThumb(img, { prioritize: true });
      }
    }

    function unobserve(img) {
      if (!img) return;
      thumbObserver?.unobserve(img);
      thumbEvictObserver?.unobserve(img);
    }

    function getMetricsSnapshot() {
      const pipelineMetrics = thumbPipeline?.getMetricsSnapshot?.() || null;
      const successfulLoads = metrics.loadSuccessCount;
      return {
        tuning: {
          ...tuning,
          defaults: { ...DEFAULT_TUNING },
        },
        ...metrics,
        activeThumbs: thumbUrls.size,
        queuedThumbs: thumbQueue.length,
        inFlightThumbs: thumbInFlight,
        avgLoadDurationMs: successfulLoads ? metrics.loadDurationMsTotal / successfulLoads : 0,
        pipeline: pipelineMetrics,
      };
    }

    function resetMetrics() {
      metrics.enqueueCount = 0;
      metrics.dequeueCount = 0;
      metrics.loadSuccessCount = 0;
      metrics.loadFailureCount = 0;
      metrics.cacheHitCount = 0;
      metrics.cacheMissCount = 0;
      metrics.evictions = 0;
      metrics.evictionsByReason.retainWindow = 0;
      metrics.evictionsByReason.activeCap = 0;
      metrics.loadDurationMsTotal = 0;
      metrics.loadDurationMsMax = 0;
      metrics.peakActiveThumbs = thumbUrls.size;
      metrics.peakQueueDepth = thumbQueue.length;
      metrics.peakInFlight = thumbInFlight;
      thumbPipeline?.resetMetrics?.();
    }

    return {
      init,
      unobserve,
      scheduleEviction,
      releaseThumb,
      releaseAll,
      getMetricsSnapshot,
      resetMetrics,
    };
  }

  globalObj.nviewGalleryThumbController = {
    createGalleryThumbController,
  };
})(window);
