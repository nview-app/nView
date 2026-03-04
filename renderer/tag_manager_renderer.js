const __nviewBridgeGuard = window.nviewBridgeGuard;
if (!__nviewBridgeGuard?.guardRenderer?.({ windowName: "Tag manager", required: ["tagManagerApi"] })) {
  // Bridge API missing: fail fast after rendering guard UI.
} else {
  const api = window.tagManagerApi;

  const tagSearchInputEl = document.getElementById("tagSearchInput");
  const showOnlyHiddenToggleEl = document.getElementById("showOnlyHiddenToggle");
  const tagInventoryListEl = document.getElementById("tagInventoryList");
  const showAllVisibleBtn = document.getElementById("showAllVisibleBtn");
  const hideAllVisibleBtn = document.getElementById("hideAllVisibleBtn");

  const aliasGroupsListEl = document.getElementById("aliasGroupsList");
  const createAliasBtn = document.getElementById("createAliasBtn");
  const saveCreateAliasBtn = document.getElementById("saveCreateAliasBtn");

  const createAliasModalEl = document.getElementById("createAliasModal");
  const createAliasFormEl = document.getElementById("createAliasForm");
  const createAliasNameInputEl = document.getElementById("createAliasNameInput");
  const createAliasTaxonomySelectEl = document.getElementById("createAliasTaxonomySelect");
  const createAliasTaxonomySelectTriggerEl = document.getElementById("createAliasTaxonomySelectTrigger");
  const createAliasMemberInputEl = document.getElementById("createAliasMemberInput");
  const createAliasMemberSuggestionsEl = document.getElementById("createAliasMemberSuggestions");
  const createAliasMemberChipsEl = document.getElementById("createAliasMemberChips");
  const createAliasMessageEl = document.getElementById("createAliasMessage");
  const closeCreateAliasModalBtn = document.getElementById("closeCreateAliasModalBtn");
  const cancelCreateAliasBtn = document.getElementById("cancelCreateAliasBtn");

  const editAliasModalEl = document.getElementById("editAliasModal");
  const editAliasFormEl = document.getElementById("editAliasForm");
  const editAliasNameInputEl = document.getElementById("editAliasNameInput");
  const editAliasTaxonomySelectEl = document.getElementById("editAliasTaxonomySelect");
  const editAliasMemberInputEl = document.getElementById("editAliasMemberInput");
  const editAliasMemberSuggestionsEl = document.getElementById("editAliasMemberSuggestions");
  const editAliasMemberChipsEl = document.getElementById("editAliasMemberChips");
  const editAliasMessageEl = document.getElementById("editAliasMessage");
  const closeEditAliasModalBtn = document.getElementById("closeEditAliasModalBtn");
  const deleteEditAliasBtn = document.getElementById("deleteEditAliasBtn");
  const saveEditAliasBtn = document.getElementById("saveEditAliasBtn");

  const appToastEl = document.getElementById("appToast");

  const appConfirmModalEl = document.getElementById("appConfirmModal");
  const appConfirmTitleEl = document.getElementById("appConfirmTitle");
  const appConfirmMessageEl = document.getElementById("appConfirmMessage");
  const appConfirmCancelBtn = document.getElementById("appConfirmCancel");
  const appConfirmProceedBtn = document.getElementById("appConfirmProceed");

  const sharedTagInput = window.nviewTagInput || {};
  const createSharedTagInput = sharedTagInput.createTagInput;

  const DEFAULT_TAXONOMY = "tags";
  const TAXONOMY_SET = new Set(["tags", "parodies", "characters"]);

  let allInventoryEntries = [];
  let snapshot = null;
  let selectedAliasId = "";
  let pendingSearchDebounce = null;
  let activeModal = null;
  let modalReturnFocusEl = null;
  let appConfirmResolver = null;
  let appToastTimeoutId = null;
  let appToastToken = 0;
  const dropdownInstances = [];
  let tagManagerSettingsCache = { ui: { customDropdownsV1: true } };

  function isCustomDropdownsEnabled() {
    return Boolean(tagManagerSettingsCache?.ui?.customDropdownsV1 ?? true);
  }

  function collectSelectOptions(selectEl) {
    return Array.from(selectEl?.options || []).map((option) => ({
      value: String(option.value ?? ""),
      label: String(option.textContent ?? ""),
      disabled: Boolean(option.disabled),
    }));
  }

  function setupSelectDropdown(selectEl, triggerEl, { placeholder = "", listClassName = "" } = {}) {
    if (!selectEl || !triggerEl || !isCustomDropdownsEnabled()) return null;
    if (typeof window.nviewDropdown?.createDropdown !== "function") return null;

    const ariaLabel = String(selectEl.getAttribute("aria-label") || "").trim();
    const dropdown = window.nviewDropdown.createDropdown({
      triggerEl,
      options: collectSelectOptions(selectEl),
      value: selectEl.value,
      placeholder,
      ariaLabel: ariaLabel || undefined,
      popoverClassName: listClassName,
      onChange(nextValue) {
        selectEl.value = String(nextValue ?? "");
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });

    const syncFromSelect = () => {
      dropdown.setOptions(collectSelectOptions(selectEl));
      dropdown.setValue(selectEl.value);
      dropdown.setDisabled(selectEl.disabled);
    };

    const observer = new MutationObserver(syncFromSelect);
    observer.observe(selectEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "label", "value"],
    });

    const onSelectChange = () => {
      dropdown.setValue(selectEl.value);
    };

    selectEl.addEventListener("change", onSelectChange);
    selectEl.addEventListener("nview:sync-dropdown", syncFromSelect);

    selectEl.hidden = true;
    triggerEl.hidden = false;
    dropdown.setDisabled(selectEl.disabled);

    return {
      destroy() {
        observer.disconnect();
        selectEl.removeEventListener("change", onSelectChange);
        selectEl.removeEventListener("nview:sync-dropdown", syncFromSelect);
        dropdown.destroy();
        triggerEl.hidden = true;
        selectEl.hidden = false;
      },
    };
  }

  function initCustomSelectDropdowns() {
    if (!isCustomDropdownsEnabled()) return;
    if (dropdownInstances.length > 0) return;
    try {
      const instance = setupSelectDropdown(createAliasTaxonomySelectEl, createAliasTaxonomySelectTriggerEl, {
        placeholder: "Tags",
        listClassName: "tag-manager-taxonomy-dropdown",
      });
      if (instance) dropdownInstances.push(instance);
    } catch {
      createAliasTaxonomySelectTriggerEl.hidden = true;
      createAliasTaxonomySelectEl.hidden = false;
    }
  }

  function teardownCustomSelectDropdowns() {
    for (const instance of dropdownInstances.splice(0, dropdownInstances.length)) {
      instance?.destroy?.();
    }
  }

  function reconcileCustomDropdownRollout() {
    if (isCustomDropdownsEnabled()) {
      initCustomSelectDropdowns();
      return;
    }
    teardownCustomSelectDropdowns();
  }

  function applyTheme(isDark) {
    document.body.classList.toggle("dark", Boolean(isDark));
  }

  async function loadSettings() {
    const result = await api.getSettings();
    if (!result?.ok) return;
    if (result.settings && typeof result.settings === "object") {
      tagManagerSettingsCache = result.settings;
    }
    tagManagerSettingsCache.ui = tagManagerSettingsCache.ui && typeof tagManagerSettingsCache.ui === "object"
      ? tagManagerSettingsCache.ui
      : { customDropdownsV1: true };
    tagManagerSettingsCache.ui.customDropdownsV1 = Boolean(tagManagerSettingsCache.ui.customDropdownsV1 ?? true);
    reconcileCustomDropdownRollout();
    applyTheme(result.settings?.darkMode);
  }

  function normalizeTagKey(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
  }

  function normalizeTaxonomy(value) {
    const taxonomy = String(value || "").trim().toLowerCase();
    if (!TAXONOMY_SET.has(taxonomy)) return DEFAULT_TAXONOMY;
    return taxonomy;
  }

  function sourceLabelForTaxonomy(taxonomy) {
    if (taxonomy === "parodies") return "Parodies";
    if (taxonomy === "characters") return "Characters";
    return "";
  }

  function typedKeyForInventoryEntry(taxonomy, rawTagKey) {
    const safeTaxonomy = normalizeTaxonomy(taxonomy);
    const key = normalizeTagKey(rawTagKey);
    return key ? `${safeTaxonomy}:${key}` : "";
  }

  function inventoryEntryFromPayload(entry) {
    if (!entry || typeof entry !== "object") return null;
    const rawTagKey = normalizeTagKey(entry.rawTagKey);
    if (!rawTagKey) return null;
    const taxonomy = normalizeTaxonomy(entry.taxonomy);
    const typedKey = typedKeyForInventoryEntry(taxonomy, rawTagKey);
    if (!typedKey) return null;
    const sourceLabel = sourceLabelForTaxonomy(taxonomy);
    return {
      taxonomy,
      rawTagKey,
      typedKey,
      sourceLabel,
      label: sourceLabel ? `${rawTagKey} (${sourceLabel})` : rawTagKey,
    };
  }


  function showAppToast(message, { timeoutMs = 3600 } = {}) {
    if (!appToastEl) return;
    appToastToken += 1;
    const token = appToastToken;
    if (appToastTimeoutId !== null) {
      clearTimeout(appToastTimeoutId);
      appToastTimeoutId = null;
    }

    appToastEl.textContent = String(message || "");
    appToastEl.classList.add("is-visible");

    appToastTimeoutId = setTimeout(() => {
      if (token !== appToastToken) return;
      appToastEl.classList.remove("is-visible");
      appToastEl.textContent = "";
      appToastTimeoutId = null;
    }, Math.max(1200, Number(timeoutMs) || 3600));
  }

  function markAliasNameConflict(inputEl, hasConflict) {
    inputEl?.classList.toggle("input-conflict", Boolean(hasConflict));
  }

  function resetAliasValidationState() {
    markAliasNameConflict(createAliasNameInputEl, false);
    markAliasNameConflict(editAliasNameInputEl, false);
    markInUseMemberTags(createAliasMembersInput, []);
    markInUseMemberTags(editAliasMembersInput, []);
    setCreateAliasMessage("", false);
    setEditAliasMessage("", false);
  }

  function parseMemberTags(text) {
    return String(text || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function selectedAlias() {
    return snapshot?.aliasGroups?.find((group) => group.aliasId === selectedAliasId) || null;
  }

  function setAliasEditorMessage(message, error = false) {
    if (error) {
      setEditAliasMessage(message, true);
      setCreateAliasMessage(message, true);
      return;
    }
    setEditAliasMessage("", false);
    setCreateAliasMessage("", false);
  }

  function setCreateAliasMessage(message, error = false) {
    createAliasMessageEl.textContent = String(message || "");
    createAliasMessageEl.classList.toggle("tagManagerError", Boolean(error));
  }

  function setEditAliasMessage(message, error = false) {
    editAliasMessageEl.textContent = String(message || "");
    editAliasMessageEl.classList.toggle("tagManagerError", Boolean(error));
  }

  function getMemberSuggestions() {
    const activeTaxonomy = activeModal === editAliasModalEl
      ? normalizeTaxonomy(editAliasTaxonomySelectEl?.value)
      : normalizeTaxonomy(createAliasTaxonomySelectEl?.value);
    return allInventoryEntries
      .filter((entry) => entry.taxonomy === activeTaxonomy)
      .map((entry) => entry.rawTagKey);
  }

  function markInUseMemberTags(tagInput, memberRawTagsInUse) {
    const rawSet = new Set(
      (Array.isArray(memberRawTagsInUse) ? memberRawTagsInUse : [])
        .map((tag) => normalizeTagKey(tag))
        .filter(Boolean),
    );
    tagInput?.setTagClassNames?.((tag) => (rawSet.has(normalizeTagKey(tag)) ? ["is-conflict"] : []));
  }

  function createAliasMemberTagInput({ inputEl, chipsEl, suggestionsEl }) {
    if (typeof createSharedTagInput !== "function") {
      return {
        setTags(tags) {
          inputEl.value = parseMemberTags(tags.join(", ")).join(", ");
        },
        getTags() {
          return parseMemberTags(inputEl.value);
        },
        clear() {
          inputEl.value = "";
        },
      };
    }

    return createSharedTagInput({
      inputEl,
      chipsEl,
      suggestionsEl,
      getSuggestions: getMemberSuggestions,
      chipClassName: "editTagChip",
      chipRemoveClassName: "editTagChipRemove",
      showSuggestionsOn: "focus",
      removeLastTagOnBackspace: true,
      suggestionMenu: {
        tableClassName: "editSuggestionTable",
        optionClassName: "editSuggestionOption",
        headerLabel: "Suggested tags",
        tableAriaLabel: "Alias member tag suggestions",
      },
    });
  }

  const createAliasMembersInput = createAliasMemberTagInput({
    inputEl: createAliasMemberInputEl,
    chipsEl: createAliasMemberChipsEl,
    suggestionsEl: createAliasMemberSuggestionsEl,
  });

  const editAliasMembersInput = createAliasMemberTagInput({
    inputEl: editAliasMemberInputEl,
    chipsEl: editAliasMemberChipsEl,
    suggestionsEl: editAliasMemberSuggestionsEl,
  });

  function getAliasMap() {
    const map = new Map();
    for (const group of snapshot?.aliasGroups || []) {
      const taxonomy = normalizeTaxonomy(group.taxonomy);
      for (const member of group.memberRawTags || []) {
        const rawTagKey = normalizeTagKey(member);
        const typedKey = typedKeyForInventoryEntry(taxonomy, rawTagKey);
        if (!typedKey) continue;
        map.set(typedKey, group.aliasName);
      }
    }
    return map;
  }

  function isVisible(typedKey) {
    return snapshot?.visibilityRules?.[typedKey]?.visibleInFilter !== false;
  }

  function getVisibleInventoryEntries() {
    const query = normalizeTagKey(tagSearchInputEl.value);
    const hiddenOnly = showOnlyHiddenToggleEl.checked;
    const aliasMap = getAliasMap();

    return allInventoryEntries.filter((entry) => {
      const visible = isVisible(entry.typedKey);
      if (hiddenOnly && visible) return false;
      const aliasName = aliasMap.get(entry.typedKey) || "";
      if (!query) return true;
      return entry.rawTagKey.includes(query)
        || normalizeTagKey(entry.sourceLabel).includes(query)
        || normalizeTagKey(aliasName).includes(query);
    });
  }

  function renderTagInventory() {
    tagInventoryListEl.textContent = "";
    const visibleTags = getVisibleInventoryEntries();
    const aliasMap = getAliasMap();

    if (!visibleTags.length) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "small";
      emptyEl.textContent = "No tags found.";
      tagInventoryListEl.appendChild(emptyEl);
      renderBulkVisibilityActions();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const inventoryEntry of visibleTags.slice(0, 2000)) {
      const rowEl = document.createElement("label");
      rowEl.className = "tagManagerRow";

      const checkEl = document.createElement("input");
      checkEl.type = "checkbox";
      checkEl.checked = isVisible(inventoryEntry.typedKey);
      checkEl.setAttribute("aria-label", `Show ${inventoryEntry.label} in filters`);
      checkEl.addEventListener("change", () => {
        void updateVisibilityOptimistic(inventoryEntry, checkEl.checked);
      });

      const textWrapEl = document.createElement("div");
      const labelEl = document.createElement("div");
      labelEl.textContent = inventoryEntry.label;
      const aliasName = aliasMap.get(inventoryEntry.typedKey);
      const metaEl = document.createElement("div");
      metaEl.className = "small";
      metaEl.textContent = aliasName ? `Alias: ${aliasName}` : "No alias";
      textWrapEl.append(labelEl, metaEl);

      rowEl.append(checkEl, textWrapEl);
      fragment.appendChild(rowEl);
    }
    tagInventoryListEl.appendChild(fragment);
    renderBulkVisibilityActions();
  }

  function renderBulkVisibilityActions() {
    const targetTags = getVisibleInventoryEntries();
    const hasTags = targetTags.length > 0;
    const allVisible = hasTags && targetTags.every((entry) => isVisible(entry.typedKey));
    const someVisible = targetTags.some((entry) => isVisible(entry.typedKey));
    showAllVisibleBtn.disabled = !hasTags || allVisible;
    hideAllVisibleBtn.disabled = !hasTags || !someVisible;
  }

  function hydrateEditAlias(group) {
    if (!group) return;
    editAliasNameInputEl.value = String(group.aliasName || "");
    editAliasTaxonomySelectEl.value = normalizeTaxonomy(group.taxonomy);
    editAliasMembersInput.setTags(Array.isArray(group.memberRawTags) ? group.memberRawTags : []);
    markAliasNameConflict(editAliasNameInputEl, false);
    markInUseMemberTags(editAliasMembersInput, []);
    setEditAliasMessage("", false);
  }

  function openModal(modalEl, focusEl) {
    if (!modalEl) return;
    modalReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalEl.hidden = false;
    activeModal = modalEl;
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      focusEl?.focus();
    }, 0);
  }

  function isConfirmModalVisible() {
    if (!appConfirmModalEl) return false;
    return (appConfirmModalEl.style.display || "none") !== "none";
  }

  function closeModal(modalEl) {
    if (!modalEl || modalEl.hidden) return;
    modalEl.hidden = true;
    if (activeModal === modalEl) activeModal = null;
    if (!activeModal && !isConfirmModalVisible()) document.body.classList.remove("modal-open");
    if (modalReturnFocusEl instanceof HTMLElement) modalReturnFocusEl.focus();
    modalReturnFocusEl = null;
  }

  function closeAppConfirmModal(result) {
    if (!appConfirmModalEl || !appConfirmResolver) return;
    const resolve = appConfirmResolver;
    appConfirmResolver = null;
    appConfirmModalEl.style.display = "none";
    if (!activeModal) document.body.classList.remove("modal-open");
    resolve(Boolean(result));
  }

  function showAppConfirm({
    title = "Confirm action",
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
  } = {}) {
    if (!appConfirmModalEl || !appConfirmProceedBtn || !appConfirmCancelBtn) {
      return Promise.resolve(false);
    }
    if (appConfirmResolver) closeAppConfirmModal(false);

    appConfirmTitleEl.textContent = String(title || "Confirm action");
    appConfirmMessageEl.textContent = String(message || "");
    appConfirmProceedBtn.textContent = String(confirmLabel || "Confirm");
    appConfirmCancelBtn.textContent = String(cancelLabel || "Cancel");

    appConfirmModalEl.style.display = "flex";
    document.body.classList.add("modal-open");

    return new Promise((resolve) => {
      appConfirmResolver = resolve;
      appConfirmCancelBtn.focus();
    });
  }

  function openCreateAliasModal() {
    createAliasNameInputEl.value = "";
    createAliasTaxonomySelectEl.value = DEFAULT_TAXONOMY;
    createAliasTaxonomySelectEl.dispatchEvent(new Event("nview:sync-dropdown"));
    createAliasMembersInput.clear();
    markAliasNameConflict(createAliasNameInputEl, false);
    markInUseMemberTags(createAliasMembersInput, []);
    setCreateAliasMessage("", false);
    openModal(createAliasModalEl, createAliasNameInputEl);
  }

  function closeCreateAliasModal() {
    closeModal(createAliasModalEl);
  }

  function openEditAliasModal(group) {
    if (!group) return;
    selectedAliasId = group.aliasId;
    hydrateEditAlias(group);
    openModal(editAliasModalEl, editAliasNameInputEl);
  }

  function closeEditAliasModal() {
    closeModal(editAliasModalEl);
    setEditAliasMessage("", false);
  }

  function renderAliasGroups() {
    aliasGroupsListEl.textContent = "";
    const groups = Array.isArray(snapshot?.aliasGroups) ? [...snapshot.aliasGroups] : [];
    groups.sort((a, b) => String(a.aliasName || "").localeCompare(String(b.aliasName || ""), "en", { sensitivity: "base" }));

    if (!groups.length) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "small";
      emptyEl.textContent = "No alias groups created yet.";
      aliasGroupsListEl.appendChild(emptyEl);
      return;
    }

    for (const group of groups) {
      const itemBtn = document.createElement("button");
      itemBtn.type = "button";
      itemBtn.className = "groupManagerListItem";
      if (group.aliasId === selectedAliasId) itemBtn.classList.add("is-selected");
      itemBtn.setAttribute("aria-pressed", String(group.aliasId === selectedAliasId));

      const titleEl = document.createElement("div");
      titleEl.className = "groupManagerListItemTitle";
      titleEl.textContent = String(group.aliasName || "Untitled");

      const descriptionEl = document.createElement("div");
      descriptionEl.className = "small";
      const memberCount = Array.isArray(group.memberRawTags) ? group.memberRawTags.length : 0;
      const taxonomy = normalizeTaxonomy(group.taxonomy);
      const sourceLabel = sourceLabelForTaxonomy(taxonomy) || "Tags";
      descriptionEl.textContent = `${memberCount} members · ${sourceLabel}`;

      itemBtn.append(titleEl, descriptionEl);
      itemBtn.addEventListener("click", () => {
        openEditAliasModal(group);
        renderAliasGroups();
      });
      aliasGroupsListEl.appendChild(itemBtn);
    }
  }

  async function promptRecoveryFlow(errorCode) {
    if (!api.recoverStore) return false;
    const canTryBackup = errorCode === "INTEGRITY_ERROR" || errorCode === "STORE_UNAVAILABLE";
    if (canTryBackup) {
      const restoreBackup = window.confirm("Tag manager data appears unavailable. Attempt recovery from encrypted backup?");
      if (restoreBackup) {
        const restored = await api.recoverStore({ strategy: "backup" });
        if (restored?.ok) {
          setAliasEditorMessage("Recovered tag manager data from encrypted backup.", false);
          await refresh();
          return true;
        }
      }
    }

    const resetStore = window.confirm("Unable to recover from backup. Reset Tag Manager encrypted store to defaults?");
    if (!resetStore) return false;
    const reset = await api.recoverStore({ strategy: "reset" });
    if (!reset?.ok) {
      setAliasEditorMessage(reset?.message || "Failed to reset tag manager store.", true);
      return false;
    }
    setAliasEditorMessage("Tag manager store reset to defaults.", false);
    await refresh();
    return true;
  }

  async function refresh() {
    const snapshotResult = await api.getSnapshot({ includeStats: true, includeInventory: true });

    if (!snapshotResult?.ok) {
      setAliasEditorMessage(snapshotResult?.message || "Failed to load tag manager data.", true);
      await promptRecoveryFlow(snapshotResult?.errorCode);
      return;
    }

    allInventoryEntries = Array.isArray(snapshotResult.inventory)
      ? snapshotResult.inventory.map(inventoryEntryFromPayload).filter(Boolean)
      : [];
    snapshot = snapshotResult.snapshot;

    if (selectedAliasId && !selectedAlias()) selectedAliasId = "";

    renderTagInventory();
    renderAliasGroups();
  }

  async function updateVisibilityOptimistic(inventoryEntry, visibleInFilter) {
    const entry = inventoryEntryFromPayload(inventoryEntry);
    if (!entry) return;
    const prevRules = { ...(snapshot?.visibilityRules || {}) };
    if (!snapshot) return;

    if (visibleInFilter) delete snapshot.visibilityRules[entry.typedKey];
    else snapshot.visibilityRules[entry.typedKey] = { visibleInFilter: false };
    renderTagInventory();

    const result = await api.setVisibility({ taxonomy: entry.taxonomy, rawTag: entry.rawTagKey, visibleInFilter });
    if (!result?.ok) {
      snapshot.visibilityRules = prevRules;
      renderTagInventory();
      setAliasEditorMessage("Failed to save visibility update.", true);
    }
  }

  async function bulkVisibilityUpdate(visibleInFilter) {
    const targetEntries = getVisibleInventoryEntries();
    const taxonomyMap = new Map();
    for (const entry of targetEntries) {
      const tags = taxonomyMap.get(entry.taxonomy) || [];
      tags.push(entry.rawTagKey);
      taxonomyMap.set(entry.taxonomy, tags);
    }
    if (!targetEntries.length || !snapshot) return;

    const prevRules = { ...(snapshot.visibilityRules || {}) };
    for (const entry of targetEntries) {
      if (visibleInFilter) delete snapshot.visibilityRules[entry.typedKey];
      else snapshot.visibilityRules[entry.typedKey] = { visibleInFilter: false };
    }
    renderTagInventory();

    let hasFailure = false;
    for (const [taxonomy, rawTags] of taxonomyMap) {
      const result = await api.bulkSetVisibility({ taxonomy, rawTags, visibleInFilter });
      if (!result?.ok) {
        hasFailure = true;
        break;
      }
    }

    if (hasFailure) {
      snapshot.visibilityRules = prevRules;
      renderTagInventory();
      setAliasEditorMessage("Failed to save bulk visibility update.", true);
    }
  }

  async function saveCreateAlias(event) {
    event.preventDefault();
    const aliasName = String(createAliasNameInputEl.value || "").trim();
    const taxonomy = normalizeTaxonomy(createAliasTaxonomySelectEl.value);
    const memberRawTags = createAliasMembersInput.getTags({ includeDraft: true });

    resetAliasValidationState();

    if (!aliasName || memberRawTags.length < 1) {
      showAppToast("Alias name and at least one member are required.");
      return;
    }

    const result = await api.createAliasGroup({ aliasName, taxonomy, memberRawTags });
    if (!result?.ok) {
      if (result?.details?.reason === "MEMBER_CONFLICT") {
        markInUseMemberTags(createAliasMembersInput, result?.details?.memberRawTagsInUse);
      }
      if (result?.details?.reason === "ALIAS_NAME_CONFLICT") {
        markAliasNameConflict(createAliasNameInputEl, true);
      }
      showAppToast(result?.message || "Failed to create alias group.");
      return;
    }

    selectedAliasId = result.aliasGroup?.aliasId || "";
    closeCreateAliasModal();
    await refresh();
    setAliasEditorMessage("Alias group created.", false);
  }

  async function saveEditAlias(event) {
    event.preventDefault();
    const group = selectedAlias();
    if (!group) {
      showAppToast("Alias group no longer exists. Refresh and retry.");
      return;
    }
    const aliasName = String(editAliasNameInputEl.value || "").trim();
    const memberRawTags = editAliasMembersInput.getTags({ includeDraft: true });

    resetAliasValidationState();

    if (!aliasName || memberRawTags.length < 1) {
      showAppToast("Alias name and at least one member are required.");
      return;
    }

    const result = await api.updateAliasGroup({
      aliasId: group.aliasId,
      aliasName,
      memberRawTags,
      expectedUpdatedAt: group.updatedAt,
    });

    if (!result?.ok) {
      if (result?.details?.reason === "MEMBER_CONFLICT") {
        markInUseMemberTags(editAliasMembersInput, result?.details?.memberRawTagsInUse);
      }
      if (result?.details?.reason === "ALIAS_NAME_CONFLICT") {
        markAliasNameConflict(editAliasNameInputEl, true);
      }
      showAppToast(result?.message || "Failed to save alias group.");
      return;
    }

    selectedAliasId = result.aliasGroup?.aliasId || selectedAliasId;
    closeEditAliasModal();
    await refresh();
    setAliasEditorMessage("Alias group saved.", false);
  }

  async function deleteEditAlias() {
    const group = selectedAlias();
    if (!group) return;

    const confirmed = await showAppConfirm({
      title: "Delete alias group",
      message: `Delete this alias group?

${group.aliasName || "Untitled alias"}`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    const result = await api.deleteAliasGroup({
      aliasId: group.aliasId,
      expectedUpdatedAt: group.updatedAt,
    });
    if (!result?.ok) {
      setEditAliasMessage(result?.message || "Failed to delete alias group.", true);
      return;
    }

    selectedAliasId = "";
    closeEditAliasModal();
    await refresh();
    setAliasEditorMessage("Alias group deleted.", false);
  }

  function scheduleTagSearchRender() {
    if (pendingSearchDebounce) clearTimeout(pendingSearchDebounce);
    pendingSearchDebounce = setTimeout(() => {
      pendingSearchDebounce = null;
      renderTagInventory();
    }, 180);
  }

  showAllVisibleBtn.addEventListener("click", () => void bulkVisibilityUpdate(true));
  hideAllVisibleBtn.addEventListener("click", () => void bulkVisibilityUpdate(false));
  tagSearchInputEl.addEventListener("input", scheduleTagSearchRender);
  showOnlyHiddenToggleEl.addEventListener("change", () => renderTagInventory());
  createAliasTaxonomySelectEl.addEventListener("change", () => {
    createAliasMembersInput.setTags(createAliasMembersInput.getTags());
  });
  createAliasNameInputEl.addEventListener("input", () => markAliasNameConflict(createAliasNameInputEl, false));
  editAliasNameInputEl.addEventListener("input", () => markAliasNameConflict(editAliasNameInputEl, false));

  createAliasBtn.addEventListener("click", openCreateAliasModal);
  closeCreateAliasModalBtn.addEventListener("click", closeCreateAliasModal);
  cancelCreateAliasBtn.addEventListener("click", closeCreateAliasModal);
  closeEditAliasModalBtn.addEventListener("click", closeEditAliasModal);

  createAliasFormEl.addEventListener("submit", (event) => void saveCreateAlias(event));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isConfirmModalVisible()) {
      closeAppConfirmModal(false);
      return;
    }
    if (activeModal === editAliasModalEl) {
      closeEditAliasModal();
      return;
    }
    if (activeModal === createAliasModalEl) {
      closeCreateAliasModal();
    }
  });
  editAliasFormEl.addEventListener("submit", (event) => void saveEditAlias(event));
  deleteEditAliasBtn.addEventListener("click", () => void deleteEditAlias());
  appConfirmCancelBtn?.addEventListener("click", () => closeAppConfirmModal(false));
  appConfirmProceedBtn?.addEventListener("click", () => closeAppConfirmModal(true));
  saveCreateAliasBtn.addEventListener("mousedown", (event) => event.preventDefault());
  saveEditAliasBtn.addEventListener("mousedown", (event) => event.preventDefault());

  api.onSettingsUpdated?.((settings) => {
    if (settings && typeof settings === "object") {
      tagManagerSettingsCache = settings;
    }
    tagManagerSettingsCache.ui = tagManagerSettingsCache.ui && typeof tagManagerSettingsCache.ui === "object"
      ? tagManagerSettingsCache.ui
      : { customDropdownsV1: true };
    tagManagerSettingsCache.ui.customDropdownsV1 = Boolean(tagManagerSettingsCache.ui.customDropdownsV1 ?? true);
    reconcileCustomDropdownRollout();
    applyTheme(settings?.darkMode);
  });

  reconcileCustomDropdownRollout();
  void loadSettings();
  void refresh();
}
