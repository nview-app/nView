(function initNviewDropdown(globalScope) {
  const TYPEAHEAD_TIMEOUT_MS = 600;
  let dropdownIdSeq = 0;

  function clampIndex(index, length) {
    if (!Number.isFinite(index)) return -1;
    if (length <= 0) return -1;
    return Math.max(0, Math.min(length - 1, index));
  }

  function normalizeOption(option, index) {
    const raw = option || {};
    const value = String(raw.value ?? "");
    return {
      value,
      label: String(raw.label ?? value),
      disabled: !!raw.disabled,
      index,
    };
  }

  function normalizeOptions(options) {
    return (Array.isArray(options) ? options : []).map(normalizeOption);
  }

  function isPrintableKey(event) {
    return event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  function tokenizeClassName(value) {
    if (typeof value !== "string") return [];
    return value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function parsePx(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function computeTriggerMinWidth(triggerEl, triggerRect, globalScope) {
    const fallbackWidth = Math.max(0, triggerRect && Number.isFinite(triggerRect.width) ? triggerRect.width : 0);
    const computedStyle = typeof globalScope.getComputedStyle === "function" ? globalScope.getComputedStyle(triggerEl) : null;
    if (!computedStyle) return Math.max(160, Math.ceil(fallbackWidth));

    const horizontalInset =
      parsePx(computedStyle.paddingLeft) +
      parsePx(computedStyle.paddingRight) +
      parsePx(computedStyle.borderLeftWidth) +
      parsePx(computedStyle.borderRightWidth);
    const adjustedWidth = Math.max(0, fallbackWidth - horizontalInset);
    return Math.max(160, Math.ceil(adjustedWidth));
  }

  function createDropdown(config = {}) {
    const triggerEl = config.triggerEl;
    if (!triggerEl) throw new Error("createDropdown requires triggerEl");

    const type = config.type === "menu" ? "menu" : "select";
    const onChange = typeof config.onChange === "function" ? config.onChange : null;
    const onOpen = typeof config.onOpen === "function" ? config.onOpen : null;
    const onClose = typeof config.onClose === "function" ? config.onClose : null;
    const onAction = typeof config.onAction === "function" ? config.onAction : null;
    const typeaheadTimeoutMs = Math.max(150, Number(config.typeaheadTimeoutMs) || TYPEAHEAD_TIMEOUT_MS);
    const triggerClassTokens = tokenizeClassName(config.triggerClassName || config.className);
    const popoverClassTokens = tokenizeClassName(config.popoverClassName);
    const optionClassTokens = tokenizeClassName(config.optionClassName);
    const applyTriggerClass = config.applyTriggerClass !== false;
    const applyPopoverClass = config.applyPopoverClass !== false;

    const documentRef = config.documentRef || triggerEl.ownerDocument || globalScope.document;
    const rootForOutsideClick = config.rootForOutsideClick || documentRef;

    const dropdownId = `nview-dropdown-${++dropdownIdSeq}`;
    const listEl = config.listEl || documentRef.createElement("div");
    const listProvidedByCaller = !!config.listEl;

    if (!listProvidedByCaller) {
      if (documentRef.body && typeof documentRef.body.appendChild === "function") {
        documentRef.body.appendChild(listEl);
      }
    }

    const state = {
      type,
      options: normalizeOptions(config.options),
      value: config.value == null ? "" : String(config.value),
      open: false,
      disabled: !!config.disabled,
      activeIndex: -1,
      typeaheadBuffer: "",
      typeaheadTimer: null,
      disposed: false,
    };

    const teardownFns = [];

    function listen(target, type, handler, options) {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener(type, handler, options);
      teardownFns.push(() => target.removeEventListener(type, handler, options));
    }

    function clearTypeahead() {
      state.typeaheadBuffer = "";
      if (state.typeaheadTimer) {
        globalScope.clearTimeout(state.typeaheadTimer);
        state.typeaheadTimer = null;
      }
    }

    function syncStateAttributes() {
      triggerEl.dataset.open = state.open ? "true" : "false";
      triggerEl.dataset.disabled = state.disabled ? "true" : "false";
      listEl.dataset.open = state.open ? "true" : "false";
      listEl.dataset.disabled = state.disabled ? "true" : "false";
    }

    function setAria() {
      triggerEl.setAttribute("aria-haspopup", state.type === "menu" ? "menu" : "listbox");
      triggerEl.setAttribute("aria-expanded", state.open ? "true" : "false");
      triggerEl.setAttribute("aria-controls", listEl.id || `${dropdownId}-listbox`);
      triggerEl.setAttribute("aria-disabled", state.disabled ? "true" : "false");
      const role = state.type === "menu" ? "menu" : "listbox";
      listEl.setAttribute("role", role);
      listEl.id = listEl.id || `${dropdownId}-${role}`;
      listEl.tabIndex = -1;
      listEl.hidden = !state.open;
      syncStateAttributes();
      if (config.ariaLabel) listEl.setAttribute("aria-label", String(config.ariaLabel));
      if (state.activeIndex >= 0) {
        const active = listEl.children[state.activeIndex];
        if (active && active.id) {
          if (state.type === "select") listEl.setAttribute("aria-activedescendant", active.id);
        }
      } else {
        listEl.removeAttribute("aria-activedescendant");
      }
    }

    function positionPopover() {
      if (!state.open) return;
      if (typeof triggerEl.getBoundingClientRect !== "function" || typeof listEl.getBoundingClientRect !== "function") {
        return;
      }
      const triggerRect = triggerEl.getBoundingClientRect();
      const viewportWidth = globalScope.innerWidth || documentRef.documentElement.clientWidth || 0;
      const viewportHeight = globalScope.innerHeight || documentRef.documentElement.clientHeight || 0;
      const scrollX = globalScope.scrollX || globalScope.pageXOffset || 0;
      const scrollY = globalScope.scrollY || globalScope.pageYOffset || 0;
      const gutter = 8;

      const minWidth = computeTriggerMinWidth(triggerEl, triggerRect, globalScope);
      listEl.style.minWidth = `${minWidth}px`;

      const listRect = listEl.getBoundingClientRect();
      const estimatedHeight = listRect.height || Math.min(320, Math.max(140, state.options.length * 38));
      const placeAbove = triggerRect.bottom + estimatedHeight + gutter > viewportHeight && triggerRect.top > estimatedHeight;
      const top = placeAbove
        ? (triggerRect.top + scrollY - estimatedHeight - 4)
        : (triggerRect.bottom + scrollY + 4);

      const maxLeft = Math.max(gutter, viewportWidth - listRect.width - gutter);
      const left = Math.min(maxLeft, Math.max(gutter, triggerRect.left + scrollX));
      listEl.style.top = `${Math.max(gutter, top)}px`;
      listEl.style.left = `${left}px`;
    }

    function findEnabledIndex(start, direction) {
      if (!state.options.length) return -1;
      const step = direction >= 0 ? 1 : -1;
      let idx = clampIndex(start, state.options.length);
      for (let loops = 0; loops < state.options.length; loops += 1) {
        const option = state.options[idx];
        if (option && !option.disabled) return idx;
        idx = (idx + step + state.options.length) % state.options.length;
      }
      return -1;
    }

    function indexByValue(value) {
      return state.options.findIndex((option) => option.value === value);
    }

    function updateOptionSelectionUI() {
      if (state.type === "menu") {
        const menuItems = collectMenuItems();
        for (let i = 0; i < menuItems.length; i += 1) {
          const child = menuItems[i];
          const option = state.options[i];
          const active = i === state.activeIndex;
          child.dataset.active = active ? "true" : "false";
          child.classList.toggle("is-active", active);
          child.classList.toggle("is-disabled", !!option && !!option.disabled);
          child.tabIndex = active ? 0 : -1;
        }
        setAria();
        return;
      }
      for (let i = 0; i < listEl.children.length; i += 1) {
        const child = listEl.children[i];
        const option = state.options[i];
        const selected = !!option && option.value === state.value;
        const active = i === state.activeIndex;
        child.setAttribute("aria-selected", selected ? "true" : "false");
        child.dataset.selected = selected ? "true" : "false";
        child.dataset.active = active ? "true" : "false";
        child.classList.toggle("is-selected", selected);
        child.classList.toggle("is-active", active);
        child.classList.toggle("is-disabled", !!option && !!option.disabled);
      }
      setAria();
    }

    function setActiveIndex(nextIndex) {
      state.activeIndex = clampIndex(nextIndex, state.options.length);
      updateOptionSelectionUI();
    }

    function renderOptions() {
      listEl.replaceChildren();
      for (const option of state.options) {
        const row = documentRef.createElement("div");
        row.id = `${dropdownId}-option-${option.index}`;
        row.setAttribute("role", "option");
        row.classList.add("ui-dropdown-option", ...optionClassTokens);
        row.dataset.value = option.value;
        row.dataset.index = String(option.index);
        row.dataset.disabled = option.disabled ? "true" : "false";
        row.textContent = option.label;
        if (option.disabled) row.setAttribute("aria-disabled", "true");

        listen(row, "mousedown", (event) => {
          event.preventDefault();
        });
        listen(row, "click", () => {
          if (option.disabled || state.disabled) return;
          commitValueByIndex(option.index, { source: "click" });
        });

        listEl.appendChild(row);
      }
      if (indexByValue(state.value) < 0) {
        state.value = "";
      }
      if (state.open) {
        const selectedIndex = indexByValue(state.value);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : findEnabledIndex(0, 1));
      } else {
        state.activeIndex = -1;
      }
      updateOptionSelectionUI();
    }

    function setTriggerLabel() {
      const selected = state.options.find((option) => option.value === state.value);
      const fallback = config.placeholder == null ? "" : String(config.placeholder);
      const label = selected ? selected.label : fallback;
      triggerEl.textContent = label;
      triggerEl.dataset.value = state.value;
    }

    function close({ restoreFocus = true } = {}) {
      if (!state.open) return;
      state.open = false;
      state.activeIndex = -1;
      clearTypeahead();
      setAria();
      if (restoreFocus && typeof triggerEl.focus === "function") {
        triggerEl.focus({ preventScroll: true });
      }
      if (onClose) onClose();
    }

    function open({ focusList = true } = {}) {
      if (state.disabled || state.open) return;
      state.open = true;
      const selectedIndex = state.type === "select" ? indexByValue(state.value) : -1;
      const firstEnabled = findEnabledIndex(selectedIndex >= 0 ? selectedIndex : 0, 1);
      state.activeIndex = selectedIndex >= 0 ? selectedIndex : firstEnabled;
      setAria();
      updateOptionSelectionUI();
      if (state.type === "select") positionPopover();
      if (focusList && typeof listEl.focus === "function") {
        listEl.focus({ preventScroll: true });
      }
      if (onOpen) onOpen();
    }

    function commitValueByIndex(index, meta = {}) {
      const safeIndex = clampIndex(index, state.options.length);
      if (safeIndex < 0) return;
      const option = state.options[safeIndex];
      if (!option || option.disabled) return;
      const changed = state.value !== option.value;
      state.value = option.value;
      setTriggerLabel();
      updateOptionSelectionUI();
      close({ restoreFocus: true });
      if (changed && onChange) {
        onChange(option.value, { source: meta.source || "keyboard", option: { ...option } });
      }
    }

    function moveActive(delta) {
      if (!state.open) return;
      const base = state.activeIndex >= 0 ? state.activeIndex : 0;
      const next = findEnabledIndex((base + delta + state.options.length) % Math.max(1, state.options.length), delta);
      if (next >= 0) setActiveIndex(next);
    }

    function collectMenuItems() {
      const rows = [];
      for (const child of Array.from(listEl.children || [])) {
        const role = child.getAttribute && child.getAttribute("role");
        if (role === "menuitem" || child.tagName === "BUTTON" || child.tagName === "A") {
          rows.push(child);
        }
      }
      return rows;
    }

    function ensureMenuItemIds() {
      for (const [idx, item] of collectMenuItems().entries()) {
        if (!item.id) item.id = `${dropdownId}-menuitem-${idx}`;
        item.dataset.index = String(idx);
        item.dataset.disabled = item.disabled ? "true" : "false";
      }
      state.options = collectMenuItems().map((item, idx) => ({
        value: String(idx),
        label: String(item.textContent || ""),
        disabled: !!item.disabled,
        index: idx,
      }));
    }

    function activateMenuItem(index, meta = {}) {
      const menuItems = collectMenuItems();
      const safeIndex = clampIndex(index, menuItems.length);
      if (safeIndex < 0) return;
      const item = menuItems[safeIndex];
      if (!item || item.disabled || state.disabled) return;
      close({ restoreFocus: true });
      if (onAction) {
        onAction(item, {
          source: meta.source || "keyboard",
          index: safeIndex,
          id: item.id || "",
        });
        return;
      }
      if (typeof item.click === "function") item.click();
    }

    function handleTypeahead(char) {
      if (!state.open || !char) return;
      clearTypeahead();
      state.typeaheadBuffer += String(char).toLowerCase();
      const from = state.activeIndex >= 0 ? state.activeIndex + 1 : 0;
      for (let offset = 0; offset < state.options.length; offset += 1) {
        const idx = (from + offset) % state.options.length;
        const option = state.options[idx];
        if (!option || option.disabled) continue;
        if (option.label.toLowerCase().startsWith(state.typeaheadBuffer)) {
          setActiveIndex(idx);
          break;
        }
      }
      state.typeaheadTimer = globalScope.setTimeout(() => {
        state.typeaheadBuffer = "";
        state.typeaheadTimer = null;
      }, typeaheadTimeoutMs);
    }

    function onTriggerKeyDown(event) {
      if (state.disabled) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open({ focusList: true });
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!state.open) open({ focusList: true });
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!state.open) open({ focusList: true });
        moveActive(-1);
        return;
      }
      if (state.type === "menu" && isPrintableKey(event)) {
        open({ focusList: true });
        handleTypeahead(event.key);
      }
    }

    function onListKeyDown(event) {
      if (!state.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close({ restoreFocus: true });
        return;
      }
      if (event.key === "Tab") {
        close({ restoreFocus: false });
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(findEnabledIndex(0, 1));
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(findEnabledIndex(state.options.length - 1, -1));
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (state.type === "menu") {
          activateMenuItem(state.activeIndex, { source: "keyboard" });
        } else {
          commitValueByIndex(state.activeIndex, { source: "keyboard" });
        }
        return;
      }
      if (isPrintableKey(event)) {
        handleTypeahead(event.key);
      }
    }

    function onOutsidePointer(event) {
      if (!state.open) return;
      const target = event && event.target;
      if (triggerEl.contains(target) || listEl.contains(target)) return;
      close({ restoreFocus: false });
    }

    function init() {
      triggerEl.setAttribute("role", "button");
      triggerEl.tabIndex = state.disabled ? -1 : 0;
      if (applyTriggerClass) triggerEl.classList.add("ui-dropdown-trigger", ...triggerClassTokens);
      if (applyPopoverClass) listEl.classList.add("ui-dropdown-popover", ...popoverClassTokens);

      listen(triggerEl, "click", () => {
        if (state.disabled) return;
        if (state.open) {
          close({ restoreFocus: false });
        } else {
          open({ focusList: true });
        }
      });
      listen(triggerEl, "keydown", onTriggerKeyDown);
      listen(listEl, "keydown", onListKeyDown);
      listen(listEl, "click", (event) => {
        if (state.type !== "menu" || state.disabled) return;
        const menuItems = collectMenuItems();
        const target = event && event.target;
        const idx = menuItems.findIndex((item) => item === target || (typeof item.contains === "function" && item.contains(target)));
        if (idx >= 0) activateMenuItem(idx, { source: "click" });
      });
      listen(rootForOutsideClick, "mousedown", onOutsidePointer);
      listen(globalScope, "resize", positionPopover);
      listen(documentRef, "scroll", positionPopover, true);


      if (state.type === "menu") {
        ensureMenuItemIds();
      } else {
        renderOptions();
        setTriggerLabel();
      }
      setAria();
    }

    init();

    return {
      open,
      close,
      setOptions(nextOptions) {
        if (state.type !== "select") return;
        state.options = normalizeOptions(nextOptions);
        renderOptions();
        setTriggerLabel();
      },
      setValue(nextValue) {
        if (state.type !== "select") return;
        const normalized = String(nextValue ?? "");
        if (indexByValue(normalized) < 0) return;
        state.value = normalized;
        setTriggerLabel();
        updateOptionSelectionUI();
      },
      setDisabled(nextDisabled) {
        state.disabled = !!nextDisabled;
        triggerEl.tabIndex = state.disabled ? -1 : 0;
        if (state.disabled) close({ restoreFocus: false });
        setAria();
      },
      getValue() {
        if (state.type !== "select") return "";
        return state.value;
      },
      refresh() {
        if (state.type !== "menu") return;
        ensureMenuItemIds();
        if (state.open) {
          setActiveIndex(findEnabledIndex(0, 1));
        }
      },
      destroy() {
        if (state.disposed) return;
        state.disposed = true;
        clearTypeahead();
        close({ restoreFocus: false });
        while (teardownFns.length) {
          const teardown = teardownFns.pop();
          if (typeof teardown === "function") teardown();
        }
        if (!listProvidedByCaller && listEl.parentNode) {
          listEl.parentNode.removeChild(listEl);
        }
      },
    };
  }

  globalScope.nviewDropdown = {
    createDropdown,
  };
})(window);
