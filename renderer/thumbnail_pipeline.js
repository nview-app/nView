(function initThumbnailPipeline(globalScope) {
  const DEFAULT_MAX_SIZE = { width: 610, height: 813 };
  const FIXED_PROFILE = {
    version: "thumb_v2",
    width: 384,
    height: 512,
    mimeType: "image/jpeg",
    quality: 0.85,
  };
  const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const pipelineMetrics = {
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    sourceFetches: 0,
    generatedCount: 0,
    generatedDurationMs: 0,
    generatedDurationMaxMs: 0,
    outputTransforms: 0,
  };

  function toAppBlobUrl(filePath) {
    let normalizedPath = String(filePath || "").replaceAll("\\", "/");

    if (/^[a-zA-Z]\//.test(normalizedPath)) {
      normalizedPath = normalizedPath[0].toUpperCase() + ":/" + normalizedPath.slice(2);
    }
    if (/^[a-zA-Z]:\//.test(normalizedPath)) {
      normalizedPath = normalizedPath[0].toUpperCase() + normalizedPath.slice(1);
    }

    const segments = normalizedPath
      .split("/")
      .map((segment) => encodeURIComponent(segment).replaceAll("%3A", ":"))
      .join("/");

    return `appblob:///${segments}`;
  }

  function appBlobFetchOptions(signal) {
    const options = {
      cache: "no-store",
      credentials: "omit",
    };
    if (signal) options.signal = signal;
    return options;
  }

  function computeTargetSizeFromRect(rect, maxSize = DEFAULT_MAX_SIZE) {
    const width = Number(rect?.width || 0);
    const height = Number(rect?.height || 0);
    const dpr = Math.max(1, Math.min(2, globalScope.devicePixelRatio || 1));
    return {
      width: Math.max(1, Math.min(maxSize.width, Math.round(width * dpr))),
      height: Math.max(1, Math.min(maxSize.height, Math.round(height * dpr))),
      hasMeasuredSize: Boolean(width && height),
    };
  }

  function computeTargetSizeFromElement(el, maxSize = DEFAULT_MAX_SIZE) {
    const rect = el?.getBoundingClientRect?.() || { width: 0, height: 0 };
    return computeTargetSizeFromRect(rect, maxSize);
  }

  function getThumbCacheApi() {
    if (globalScope.api?.thumbnailCacheGet && globalScope.api?.thumbnailCachePut) return globalScope.api;
    if (globalScope.exporterApi?.thumbnailCacheGet && globalScope.exporterApi?.thumbnailCachePut) {
      return globalScope.exporterApi;
    }
    return null;
  }

  function fixedCacheProfile() {
    return {
      version: FIXED_PROFILE.version,
      width: FIXED_PROFILE.width,
      height: FIXED_PROFILE.height,
      mimeType: FIXED_PROFILE.mimeType,
      quality: FIXED_PROFILE.quality,
    };
  }

  function normalizeOutputProfile(options = {}) {
    const targetWidth = Math.max(1, Math.round(Number(options.targetWidth || 0)));
    const targetHeight = Math.max(1, Math.round(Number(options.targetHeight || 0)));
    return {
      targetWidth,
      targetHeight,
      mimeType: String(options.mimeType || FIXED_PROFILE.mimeType).toLowerCase(),
      quality: Number.isFinite(options.quality) ? Number(options.quality) : FIXED_PROFILE.quality,
      preferCanonicalOutput: options.preferCanonicalOutput !== false,
    };
  }

  function buildCachePayload(filePath, profile) {
    return {
      sourcePath: String(filePath || ""),
      version: profile.version,
      width: profile.width,
      height: profile.height,
      mimeType: profile.mimeType,
      quality: profile.quality,
    };
  }

  async function createCroppedThumbnailBlob(sourceBlob, options = {}) {
    const targetWidth = Math.max(1, Math.round(Number(options.targetWidth || 0)));
    const targetHeight = Math.max(1, Math.round(Number(options.targetHeight || 0)));
    const mimeType = String(options.mimeType || "image/jpeg");
    const quality = Number.isFinite(options.quality) ? Number(options.quality) : 0.85;

    let bitmap;
    try {
      bitmap = await createImageBitmap(sourceBlob);
    } catch {
      return sourceBlob;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
    if (!ctx) {
      if (bitmap.close) bitmap.close();
      return sourceBlob;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const naturalW = bitmap.width;
    const naturalH = bitmap.height;
    const scale = Math.max(targetWidth / naturalW, targetHeight / naturalH);
    const srcW = Math.max(1, Math.round(targetWidth / scale));
    const srcH = Math.max(1, Math.round(targetHeight / scale));
    const srcX = Math.max(0, Math.round((naturalW - srcW) / 2));
    const srcY = Math.max(0, Math.round((naturalH - srcH) / 2));

    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);
    if (bitmap.close) bitmap.close();

    const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
    return thumbBlob || sourceBlob;
  }

  async function createCroppedThumbnailUrl(sourceBlob, options = {}) {
    const blob = await createCroppedThumbnailBlob(sourceBlob, options);
    return URL.createObjectURL(blob);
  }

  async function createOutputBlob(canonicalBlob, options = {}) {
    const output = normalizeOutputProfile(options);
    if (output.preferCanonicalOutput) {
      return canonicalBlob;
    }
    if (
      output.targetWidth === FIXED_PROFILE.width &&
      output.targetHeight === FIXED_PROFILE.height &&
      output.mimeType === FIXED_PROFILE.mimeType &&
      output.quality === FIXED_PROFILE.quality
    ) {
      return canonicalBlob;
    }

    pipelineMetrics.outputTransforms += 1;
    return createCroppedThumbnailBlob(canonicalBlob, output);
  }

  function getMetricsSnapshot() {
    const generatedCount = pipelineMetrics.generatedCount;
    const generatedDurationMs = pipelineMetrics.generatedDurationMs;
    return {
      ...pipelineMetrics,
      avgGeneratedDurationMs: generatedCount ? generatedDurationMs / generatedCount : 0,
    };
  }

  function resetMetrics() {
    pipelineMetrics.requests = 0;
    pipelineMetrics.cacheHits = 0;
    pipelineMetrics.cacheMisses = 0;
    pipelineMetrics.sourceFetches = 0;
    pipelineMetrics.generatedCount = 0;
    pipelineMetrics.generatedDurationMs = 0;
    pipelineMetrics.generatedDurationMaxMs = 0;
    pipelineMetrics.outputTransforms = 0;
  }

  async function fetchAndCreateThumbnailUrl(options = {}) {
    pipelineMetrics.requests += 1;
    const filePath = String(options.filePath || "");
    if (!filePath) {
      return { ok: false, type: "invalid_path" };
    }

    const cacheProfile = fixedCacheProfile();
    const cacheApi = getThumbCacheApi();
    const cachePayload = buildCachePayload(filePath, cacheProfile);

    if (cacheApi?.thumbnailCacheGet) {
      try {
        const cached = await cacheApi.thumbnailCacheGet(cachePayload);
        if (cached?.ok && cached.hit && cached.buffer) {
          pipelineMetrics.cacheHits += 1;
          const buffer = cached.buffer instanceof Uint8Array ? cached.buffer : new Uint8Array(cached.buffer);
          if (!buffer.length) {
            throw new Error("Invalid cached thumbnail buffer");
          }
          const mimeType = String(cached.mimeType || cacheProfile.mimeType).toLowerCase();
          const safeMimeType = ALLOWED_MIME_TYPES.has(mimeType) ? mimeType : cacheProfile.mimeType;
          const canonicalBlob = new Blob([buffer], { type: safeMimeType });
          const outputBlob = await createOutputBlob(canonicalBlob, options);
          return { ok: true, objectUrl: URL.createObjectURL(outputBlob), fromCache: true };
        }
      } catch {
        // Cache failures should never block source loading.
      }
    }

    pipelineMetrics.cacheMisses += 1;
    pipelineMetrics.sourceFetches += 1;

    let response;
    try {
      response = await fetch(toAppBlobUrl(filePath), appBlobFetchOptions(options.signal));
    } catch (error) {
      return { ok: false, type: "network_error", error };
    }

    if (!response.ok) {
      return { ok: false, type: "http_error", status: response.status };
    }

    const sourceBlob = await response.blob();
    const startedAt = performance.now();
    const canonicalBlob = await createCroppedThumbnailBlob(sourceBlob, {
      targetWidth: cacheProfile.width,
      targetHeight: cacheProfile.height,
      mimeType: cacheProfile.mimeType,
      quality: cacheProfile.quality,
    });
    const elapsed = Math.max(0, performance.now() - startedAt);
    pipelineMetrics.generatedCount += 1;
    pipelineMetrics.generatedDurationMs += elapsed;
    pipelineMetrics.generatedDurationMaxMs = Math.max(pipelineMetrics.generatedDurationMaxMs, elapsed);

    if (cacheApi?.thumbnailCachePut) {
      canonicalBlob
        .arrayBuffer()
        .then((arrayBuffer) =>
          cacheApi.thumbnailCachePut({
            ...cachePayload,
            buffer: new Uint8Array(arrayBuffer),
          }),
        )
        .catch(() => {});
    }

    const outputBlob = await createOutputBlob(canonicalBlob, options);
    return { ok: true, objectUrl: URL.createObjectURL(outputBlob), fromCache: false };
  }

  globalScope.nviewThumbPipeline = {
    DEFAULT_MAX_SIZE,
    FIXED_PROFILE,
    toAppBlobUrl,
    appBlobFetchOptions,
    computeTargetSizeFromRect,
    computeTargetSizeFromElement,
    createCroppedThumbnailBlob,
    createCroppedThumbnailUrl,
    fetchAndCreateThumbnailUrl,
    getMetricsSnapshot,
    resetMetrics,
  };
})(window);
