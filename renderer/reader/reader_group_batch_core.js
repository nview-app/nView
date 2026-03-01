(function initReaderGroupBatchCore(globalScope) {
  function normalizeComicDirs(values) {
    const normalized = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
      const comicDir = String(raw || "").trim();
      if (!comicDir || seen.has(comicDir)) continue;
      seen.add(comicDir);
      normalized.push(comicDir);
    }
    return normalized;
  }

  function computeBatchMutationPlan({ currentComicDirs, requestComicDirs, mode }) {
    const current = normalizeComicDirs(currentComicDirs);
    const request = normalizeComicDirs(requestComicDirs);
    const currentSet = new Set(current);

    const reusedComicDirs = request.filter((comicDir) => currentSet.has(comicDir));
    const newComicDirs = request.filter((comicDir) => !currentSet.has(comicDir));

    const closeComicDirs = [];
    if (mode === "replace") {
      const requestSet = new Set(request);
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const comicDir = current[i];
        if (!requestSet.has(comicDir)) closeComicDirs.push(comicDir);
      }
    }

    return {
      requestComicDirs: request,
      reusedComicDirs,
      newComicDirs,
      closeComicDirs,
    };
  }

  function resolveActivationSessionId({
    focusPolicy,
    focusComicDir,
    previousActiveSessionId,
    currentActiveSessionId,
    firstNewSessionId,
    lastNewSessionId,
    requestOrderedSessionIds,
    openSessionIds,
  }) {
    const openSet = openSessionIds instanceof Set ? openSessionIds : new Set(openSessionIds || []);
    const normalizedFocusPolicy = String(focusPolicy || "").trim();
    const explicitSessionId = String(focusComicDir || "").trim();

    if (normalizedFocusPolicy === "explicit" && explicitSessionId && openSet.has(explicitSessionId)) {
      return explicitSessionId;
    }
    if (normalizedFocusPolicy === "first-new" && firstNewSessionId && openSet.has(firstNewSessionId)) {
      return firstNewSessionId;
    }
    if (normalizedFocusPolicy === "last-new" && lastNewSessionId && openSet.has(lastNewSessionId)) {
      return lastNewSessionId;
    }
    if (normalizedFocusPolicy === "preserve-active" && previousActiveSessionId && openSet.has(previousActiveSessionId)) {
      return previousActiveSessionId;
    }

    for (let i = requestOrderedSessionIds.length - 1; i >= 0; i -= 1) {
      const sessionId = requestOrderedSessionIds[i];
      if (openSet.has(sessionId)) return sessionId;
    }

    if (currentActiveSessionId && openSet.has(currentActiveSessionId)) return currentActiveSessionId;
    return openSet.values().next().value || null;
  }

  const api = {
    normalizeComicDirs,
    computeBatchMutationPlan,
    resolveActivationSessionId,
  };

  if (globalScope && typeof globalScope === "object") {
    globalScope.nviewReaderGroupBatchCore = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
