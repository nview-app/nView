(function initFilterEngine(globalScope) {
  const FILTER_TAG_SOURCE_LABELS = {
    tags: "Tags",
    parodies: "Parodies",
    characters: "Characters",
  };
  const FILTER_TAG_SOURCE_ORDER = ["tags", "parodies", "characters"];

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function tokenize(value) {
    return normalizeText(value).split(/\s+/).filter(Boolean);
  }

  function getFilterTagEntries(item) {
    const entries = [];
    for (const source of FILTER_TAG_SOURCE_ORDER) {
      const values = Array.isArray(item?.[source]) ? item[source] : [];
      for (const value of values) {
        const label = String(value || "").trim();
        if (!label) continue;
        entries.push({
          key: normalizeText(label),
          label,
          source,
        });
      }
    }
    return entries;
  }

  function matchesTags(item, selectedTags, matchAll) {
    if (!selectedTags.length) return true;
    const tags = new Set(getFilterTagEntries(item).map((entry) => entry.key));
    if (matchAll) return selectedTags.every((tag) => tags.has(tag));
    return selectedTags.some((tag) => tags.has(tag));
  }

  function computeTagCounts(items, selectedTags, matchAll) {
    const normalizedSelected = selectedTags;
    const sourceItems =
      matchAll && normalizedSelected.length
        ? items.filter((item) => matchesTags(item, normalizedSelected, true))
        : items;
    const counts = new Map();
    for (const item of sourceItems) {
      const seenInItem = new Set();
      for (const entry of getFilterTagEntries(item)) {
        if (!entry.key) continue;
        if (!counts.has(entry.key)) {
          counts.set(entry.key, {
            key: entry.key,
            label: entry.label,
            count: 0,
            sources: new Set(),
          });
        }
        const current = counts.get(entry.key);
        current.sources.add(entry.source);
        if (!seenInItem.has(entry.key)) {
          current.count += 1;
          seenInItem.add(entry.key);
        }
      }
    }
    if (matchAll && normalizedSelected.length) {
      for (const tag of selectedTags) {
        if (!tag) continue;
        if (!counts.has(tag)) {
          counts.set(tag, {
            key: tag,
            label: tag,
            count: 0,
            sources: new Set(),
          });
        }
      }
    }
    return counts;
  }

  function matchesSearch(item, queryTokens) {
    if (!queryTokens.length) return true;
    const haystack = [
      item.title,
      item.artist,
      item.id,
      item.galleryId,
      item.publishedAt,
      ...(Array.isArray(item.tags) ? item.tags : []),
      ...(Array.isArray(item.parodies) ? item.parodies : []),
      ...(Array.isArray(item.characters) ? item.characters : []),
    ]
      .map(normalizeText)
      .join(" ");
    return queryTokens.every((token) => haystack.includes(token));
  }

  function matchesLanguage(item, selectedLanguage) {
    if (!selectedLanguage) return true;
    const languages = Array.isArray(item.languages) ? item.languages.map(normalizeText) : [];
    return languages.includes(selectedLanguage);
  }

  function sortItems(items, sortKey) {
    const sorted = [...items];
    switch (sortKey) {
      case "favorites":
        sorted.sort((a, b) => {
          const favoriteDelta = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
          if (favoriteDelta !== 0) return favoriteDelta;
          return (b.mtimeMs || 0) - (a.mtimeMs || 0);
        });
        break;
      case "oldest":
        sorted.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));
        break;
      case "title-desc":
        sorted.sort((a, b) => normalizeText(b.title).localeCompare(normalizeText(a.title)));
        break;
      case "title-asc":
        sorted.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title)));
        break;
      case "pages-desc":
        sorted.sort((a, b) => (b.pagesFound || 0) - (a.pagesFound || 0));
        break;
      case "pages-asc":
        sorted.sort((a, b) => (a.pagesFound || 0) - (b.pagesFound || 0));
        break;
      case "published-desc":
        sorted.sort((a, b) => {
          const aMs = Date.parse(String(a.publishedAt || "")) || 0;
          const bMs = Date.parse(String(b.publishedAt || "")) || 0;
          if (bMs !== aMs) return bMs - aMs;
          return (b.mtimeMs || 0) - (a.mtimeMs || 0);
        });
        break;
      case "published-asc":
        sorted.sort((a, b) => {
          const aMs = Date.parse(String(a.publishedAt || "")) || 0;
          const bMs = Date.parse(String(b.publishedAt || "")) || 0;
          if (aMs !== bMs) return aMs - bMs;
          return (a.mtimeMs || 0) - (b.mtimeMs || 0);
        });
        break;
      case "artist-asc":
        sorted.sort((a, b) => {
          const artistDelta = normalizeText(a.artist).localeCompare(normalizeText(b.artist));
          if (artistDelta !== 0) return artistDelta;
          return normalizeText(a.title).localeCompare(normalizeText(b.title));
        });
        break;
      case "artist-desc":
        sorted.sort((a, b) => {
          const artistDelta = normalizeText(b.artist).localeCompare(normalizeText(a.artist));
          if (artistDelta !== 0) return artistDelta;
          return normalizeText(b.title).localeCompare(normalizeText(a.title));
        });
        break;
      case "recent":
      default:
        sorted.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
        break;
    }
    return sorted;
  }

  globalScope.nviewFilterEngine = {
    FILTER_TAG_SOURCE_LABELS,
    FILTER_TAG_SOURCE_ORDER,
    normalizeText,
    tokenize,
    getFilterTagEntries,
    computeTagCounts,
    matchesSearch,
    matchesTags,
    matchesLanguage,
    sortItems,
  };
})(window);
