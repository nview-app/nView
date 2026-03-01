(function initNviewTagInput(globalScope) {
  function normalizeValue(value) {
    return String(value || "").trim();
  }

  function dedupeValues(values) {
    const normalized = [];
    const seen = new Set();
    for (const rawValue of Array.isArray(values) ? values : []) {
      const value = normalizeValue(rawValue);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(value);
    }
    return normalized;
  }

  function createSuggestionMenu(menuEl, config = {}) {
    const {
      tableClassName,
      optionClassName,
      headerLabel = "Select from list",
      tableAriaLabel,
      buildRows,
      maxRows = 100,
      mapOptionValue,
    } = config;

    function hide() {
      if (!menuEl) return;
      menuEl.hidden = true;
      menuEl.replaceChildren();
    }

    function contains(node) {
      return !!(menuEl && node && menuEl.contains(node));
    }

    function show(values, onPick) {
      if (!menuEl) return;
      const entries = (Array.isArray(values) ? values : [])
        .slice(0, Math.max(1, Number(maxRows) || 100));
      if (!entries.length) {
        hide();
        return;
      }

      const table = document.createElement("table");
      if (tableClassName) table.className = tableClassName;
      if (tableAriaLabel) table.setAttribute("aria-label", tableAriaLabel);

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const valueHead = document.createElement("th");
      valueHead.textContent = headerLabel;
      headerRow.appendChild(valueHead);
      thead.appendChild(headerRow);

      const tbody = document.createElement("tbody");
      const rows = typeof buildRows === "function"
        ? buildRows(entries, onPick, { optionClassName, mapOptionValue })
        : buildDefaultRows(entries, onPick, { optionClassName, mapOptionValue });
      for (const row of rows) {
        if (row) tbody.appendChild(row);
      }

      table.append(thead, tbody);
      menuEl.replaceChildren(table);
      menuEl.hidden = false;
    }

    return { show, hide, contains };
  }

  function buildDefaultRows(entries, onPick, options = {}) {
    const { optionClassName, mapOptionValue } = options;
    return entries.map((entry) => {
      const value = typeof mapOptionValue === "function"
        ? mapOptionValue(entry)
        : String(entry || "");
      const row = document.createElement("tr");
      const valueCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      if (optionClassName) button.className = optionClassName;
      button.textContent = value;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        if (typeof onPick === "function") onPick(value);
      });
      valueCell.appendChild(button);
      row.appendChild(valueCell);
      return row;
    });
  }

  function createTagInput(config = {}) {
    const {
      inputEl,
      chipsEl,
      suggestionsEl,
      getSuggestions,
      onChange,
      suppressChipClicks = false,
      maxTags = Number.POSITIVE_INFINITY,
      suggestionMenu: suggestionMenuConfig = {},
      chipClassName,
      chipRemoveClassName,
      chipRemoveLabel = "✕",
      showSuggestionsOn = "pointer",
      removeLastTagOnBackspace = false,
    } = config;

    if (!inputEl) throw new Error("createTagInput requires inputEl");
    const suggestionMenu = createSuggestionMenu(suggestionsEl, suggestionMenuConfig);
    const state = { tags: [] };
    let suggestionEnabled = showSuggestionsOn !== "pointer";

    function emitChange() {
      if (typeof onChange === "function") onChange();
    }

    function shouldShowSuggestions() {
      if (showSuggestionsOn === "focus") return document.activeElement === inputEl;
      return suggestionEnabled && document.activeElement === inputEl;
    }

    function render() {
      if (chipsEl) {
        chipsEl.replaceChildren();
        for (const tag of state.tags) {
          const chip = document.createElement("button");
          chip.type = "button";
          if (chipClassName) chip.className = chipClassName;
          chip.setAttribute("aria-label", `Remove tag ${tag}`);

          const label = document.createElement("span");
          label.textContent = tag;
          const remove = document.createElement("span");
          if (chipRemoveClassName) remove.className = chipRemoveClassName;
          remove.textContent = chipRemoveLabel;

          chip.addEventListener("mousedown", (event) => event.preventDefault());
          chip.addEventListener("click", (event) => {
            event.preventDefault();
            if (suppressChipClicks) {
              event.stopPropagation();
            }
            const nextTags = state.tags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
            if (nextTags.length === state.tags.length) return;
            state.tags = nextTags;
            render();
            emitChange();
          });

          chip.append(label, remove);
          chipsEl.appendChild(chip);
        }
      }

      if (shouldShowSuggestions()) {
        showSuggestions(inputEl.value);
      } else {
        suggestionMenu.hide();
      }
    }

    function showSuggestions(query) {
      if (!shouldShowSuggestions()) {
        suggestionMenu.hide();
        return;
      }
      const selectedLookup = new Set(state.tags.map((tag) => tag.toLowerCase()));
      const normalizedQuery = normalizeValue(query).toLowerCase();
      const options = dedupeValues(typeof getSuggestions === "function" ? getSuggestions() : [])
        .filter((value) => {
          const lower = value.toLowerCase();
          if (selectedLookup.has(lower)) return false;
          if (!normalizedQuery) return true;
          return lower.includes(normalizedQuery);
        });

      suggestionMenu.show(options, (value) => {
        const changed = addTags([value]);
        inputEl.value = "";
        inputEl.focus({ preventScroll: true });
        showSuggestions("");
        if (changed) emitChange();
      });
    }

    function addTags(tags) {
      const incoming = dedupeValues(tags);
      if (!incoming.length) return false;
      let nextTags = dedupeValues([...(state.tags || []), ...incoming]);
      if (Number.isFinite(maxTags)) nextTags = nextTags.slice(0, Math.max(0, maxTags));
      if (nextTags.length === state.tags.length && nextTags.every((tag, idx) => tag === state.tags[idx])) {
        return false;
      }
      state.tags = nextTags;
      render();
      return true;
    }

    function commitDraft({ force = false } = {}) {
      const rawValue = String(inputEl.value || "");
      const segments = rawValue.split(",");
      const complete = dedupeValues(segments.slice(0, -1));
      const last = normalizeValue(segments[segments.length - 1] || "");
      let changed = false;
      if (complete.length) changed = addTags(complete) || changed;
      if (force && last) {
        changed = addTags([last]) || changed;
        inputEl.value = "";
        showSuggestions("");
        return changed;
      }
      if (rawValue.includes(",")) inputEl.value = last;
      showSuggestions(last);
      return changed;
    }

    inputEl.addEventListener("input", () => {
      if (commitDraft()) emitChange();
    });
    inputEl.addEventListener("change", () => {
      if (normalizeValue(inputEl.value) && commitDraft({ force: true })) emitChange();
    });
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Tab") {
        if (!normalizeValue(inputEl.value)) return;
        event.preventDefault();
        if (commitDraft({ force: true })) emitChange();
        return;
      }
      if (
        removeLastTagOnBackspace
        && event.key === "Backspace"
        && !normalizeValue(inputEl.value)
        && state.tags.length > 0
      ) {
        state.tags = state.tags.slice(0, -1);
        render();
        emitChange();
      }
      if (event.key === "Escape") {
        suggestionEnabled = false;
        suggestionMenu.hide();
      }
    });
    inputEl.addEventListener("mousedown", () => {
      if (showSuggestionsOn !== "pointer") return;
      suggestionEnabled = true;
      if (document.activeElement === inputEl) showSuggestions(inputEl.value);
    });
    inputEl.addEventListener("focus", () => {
      if (showSuggestionsOn === "focus" || suggestionEnabled) {
        showSuggestions(inputEl.value);
      }
    });
    inputEl.addEventListener("blur", () => {
      suggestionEnabled = false;
      if (normalizeValue(inputEl.value) && commitDraft({ force: true })) emitChange();
      suggestionMenu.hide();
    });

    if (suppressChipClicks && chipsEl) {
      chipsEl.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      chipsEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }

    return {
      setTags(tags) {
        let nextTags = dedupeValues(tags);
        if (Number.isFinite(maxTags)) nextTags = nextTags.slice(0, Math.max(0, maxTags));
        state.tags = nextTags;
        inputEl.value = "";
        render();
      },
      getTags({ includeDraft = true } = {}) {
        const draft = includeDraft ? [normalizeValue(inputEl.value)] : [];
        let nextTags = dedupeValues([...(state.tags || []), ...draft]);
        if (Number.isFinite(maxTags)) nextTags = nextTags.slice(0, Math.max(0, maxTags));
        return nextTags;
      },
      getValue() {
        return this.getTags()[0] || "";
      },
      clear() {
        state.tags = [];
        inputEl.value = "";
        render();
      },
    };
  }

  globalScope.nviewTagInput = {
    normalizeValue,
    dedupeValues,
    createSuggestionMenu,
    createTagInput,
  };
})(window);
