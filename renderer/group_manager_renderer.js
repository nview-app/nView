const __nviewBridgeGuard = window.nviewBridgeGuard;
if (!__nviewBridgeGuard?.guardRenderer?.({ windowName: "Group manager", required: ["groupManagerApi"] })) {
  // Bridge API missing: fail fast after rendering guard UI.
} else {
  const groupManagerApi = window.groupManagerApi;

  const stepSections = Array.from(document.querySelectorAll("[data-step-section]"));
  const stepIndicators = Array.from(document.querySelectorAll("[data-step-indicator]"));
  const prevStepBtn = document.getElementById("prevStepBtn");
  const nextStepBtn = document.getElementById("nextStepBtn");

  const groupsListEl = document.getElementById("groupsList");
  const groupSearchInputEl = document.getElementById("groupSearchInput");
  const createGroupModalEl = document.getElementById("createGroupModal");
  const openCreateGroupModalBtn = document.getElementById("openCreateGroupModalBtn");
  const closeCreateGroupModalBtn = document.getElementById("closeCreateGroupModalBtn");
  const cancelCreateGroupBtn = document.getElementById("cancelCreateGroupBtn");
  const groupCreateFormEl = document.getElementById("groupCreateForm");
  const groupNameInputEl = document.getElementById("groupNameInput");
  const groupDescriptionInputEl = document.getElementById("groupDescriptionInput");
  const groupSelectionHintEl = document.getElementById("groupSelectionHint");
  const groupMetaPaneTitleEl = document.getElementById("groupMetaPaneTitle");

  const groupMetaFormEl = document.getElementById("groupMetaForm");
  const groupEditNameInputEl = document.getElementById("groupEditNameInput");
  const groupEditDescriptionInputEl = document.getElementById("groupEditDescriptionInput");
  const groupMetaValidationMessageEl = document.getElementById("groupMetaValidationMessage");
  const saveGroupMetaBtn = document.getElementById("saveGroupMetaBtn");
  const deleteGroupBtn = document.getElementById("deleteGroupBtn");

  const membershipSearchInputEl = document.getElementById("membershipSearchInput");
  const selectAllMembershipBtn = document.getElementById("selectAllMembershipBtn");
  const clearAllMembershipBtn = document.getElementById("clearAllMembershipBtn");
  const librarySelectionListEl = document.getElementById("librarySelectionList");
  const selectedMembershipListEl = document.getElementById("selectedMembershipList");
  const saveMembershipBtn = document.getElementById("saveMembershipBtn");

  let currentStep = 1;
  let groups = [];
  let selectedGroupId = "";
  let selectedGroupSnapshot = null;
  let groupSearchTerm = "";

  let groupMetaSnapshot = null;
  let hasDirtyMeta = false;

  let library = [];
  let selectedMembershipIds = new Set();
  let selectedMembershipOrder = [];
  let membershipSearchTerm = "";
  let membershipSearchDebounceId = null;
  let hasDirtyMembership = false;
  let createModalReturnFocusEl = null;
  let membershipPreviewState = null;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function formatPages(found) {
    const pages = Number(found) || 0;
    return `${pages} pages`;
  }

  function destroyMembershipPreview() {
    if (!membershipPreviewState) return;
    membershipPreviewState.abortController?.abort();
    if (membershipPreviewState.objectUrl) {
      URL.revokeObjectURL(membershipPreviewState.objectUrl);
    }
    membershipPreviewState.hostEl?.remove();
    membershipPreviewState = null;
  }

  function createMembershipPreviewHost(anchorEl) {
    const hostEl = document.createElement("div");
    hostEl.className = "groupManagerPreviewTooltip";
    hostEl.setAttribute("role", "tooltip");
    hostEl.textContent = "Loading preview…";
    document.body.appendChild(hostEl);

    const anchorRect = anchorEl.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - 276);
    hostEl.style.top = `${Math.max(12, Math.round(anchorRect.bottom + 6))}px`;
    hostEl.style.left = `${Math.max(12, Math.min(maxLeft, Math.round(anchorRect.left)))}px`;
    return hostEl;
  }

  async function openMembershipPreview(anchorEl, firstPagePath) {
    if (!(anchorEl instanceof HTMLElement)) return;
    const resolvedPath = String(firstPagePath || "").trim();
    if (membershipPreviewState?.anchorEl === anchorEl) {
      destroyMembershipPreview();
      return;
    }

    destroyMembershipPreview();

    const hostEl = createMembershipPreviewHost(anchorEl);
    if (!resolvedPath) {
      hostEl.textContent = "Preview unavailable.";
      return;
    }

    const abortController = new AbortController();
    membershipPreviewState = {
      anchorEl,
      hostEl,
      abortController,
      objectUrl: "",
    };

    const thumbnailPipeline = window.nviewThumbPipeline;
    const result = thumbnailPipeline?.fetchAndCreateThumbnailUrl
      ? await thumbnailPipeline.fetchAndCreateThumbnailUrl({
        filePath: resolvedPath,
        targetWidth: 256,
        targetHeight: 336,
        signal: abortController.signal,
        preferCanonicalOutput: false,
      })
      : { ok: false };

    if (abortController.signal.aborted || membershipPreviewState?.anchorEl !== anchorEl) return;

    if (!result?.ok || !result.objectUrl) {
      hostEl.textContent = "Preview unavailable.";
      return;
    }

    membershipPreviewState.objectUrl = result.objectUrl;
    hostEl.replaceChildren();
    const imageEl = document.createElement("img");
    imageEl.className = "groupManagerPreviewImage";
    imageEl.alt = "Selected manga cover preview";
    imageEl.decoding = "async";
    imageEl.loading = "eager";
    imageEl.referrerPolicy = "no-referrer";
    imageEl.src = result.objectUrl;
    hostEl.appendChild(imageEl);
  }


  function applyTheme(isDark) {
    document.body.classList.toggle("dark", Boolean(isDark));
  }

  async function loadSettings() {
    if (typeof groupManagerApi.getSettings !== "function") return;
    const res = await groupManagerApi.getSettings();
    if (res?.ok) applyTheme(res.settings?.darkMode);
  }

  function selectedGroup() {
    return groups.find((group) => group.groupId === selectedGroupId) || null;
  }

  function getFilteredGroups() {
    if (!groupSearchTerm) return groups;
    const term = groupSearchTerm.toLowerCase();
    return groups.filter((group) => {
      const name = String(group.name || "").toLowerCase();
      const description = String(group.description || "").toLowerCase();
      return name.includes(term) || description.includes(term);
    });
  }

  function setStepButtonLabel(button, { label, iconClass = "", iconAtEnd = false }) {
    if (!(button instanceof HTMLElement)) return;
    button.textContent = "";
    const labelEl = document.createElement("span");
    labelEl.className = "buttonLabel";
    labelEl.textContent = label;
    const iconEl = iconClass
      ? Object.assign(document.createElement("span"), { className: `icon ${iconClass}`.trim() })
      : null;
    if (iconAtEnd) {
      button.append(labelEl);
      if (iconEl) {
        iconEl.setAttribute("aria-hidden", "true");
        button.append(iconEl);
      }
      return;
    }
    if (iconEl) {
      iconEl.setAttribute("aria-hidden", "true");
      button.append(iconEl);
    }
    button.append(labelEl);
  }

  function setStep(step) {
    currentStep = step;
    for (const section of stepSections) {
      section.hidden = Number(section.dataset.stepSection) !== currentStep;
    }
    for (const indicator of stepIndicators) {
      const indicatorStep = Number(indicator.dataset.stepIndicator);
      indicator.classList.toggle("is-active", indicatorStep === currentStep);
      indicator.classList.toggle("is-complete", indicatorStep < currentStep);
    }
    prevStepBtn.disabled = currentStep === 1;

    const group = selectedGroup();
    const canAdvance = currentStep === 1 && Boolean(group);
    if (currentStep === 1) {
      setStepButtonLabel(nextStepBtn, { label: "Next step", iconClass: "icon-forward", iconAtEnd: true });
      nextStepBtn.disabled = !canAdvance;
    } else {
      setStepButtonLabel(nextStepBtn, { label: "Back to groups" });
      nextStepBtn.disabled = false;
    }
  }

  function closeCreateModal(options = {}) {
    if (!createGroupModalEl || createGroupModalEl.hidden) return;
    createGroupModalEl.hidden = true;
    document.body.classList.remove("modal-open");
    if (!options.keepValues) {
      groupNameInputEl.value = "";
      groupDescriptionInputEl.value = "";
    }
    if (createModalReturnFocusEl instanceof HTMLElement) {
      createModalReturnFocusEl.focus();
    }
    createModalReturnFocusEl = null;
  }

  function openCreateModal() {
    if (!createGroupModalEl) return;
    createModalReturnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : openCreateGroupModalBtn;
    createGroupModalEl.hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      groupNameInputEl.focus();
    }, 0);
  }

  function renderGroupsList() {
    groupsListEl.textContent = "";
    const visibleGroups = getFilteredGroups();
    if (!visibleGroups.length) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = groups.length ? "No groups match your search." : "No groups created yet.";
      groupsListEl.appendChild(empty);
      return;
    }

    for (const group of visibleGroups) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "groupManagerListItem";
      button.setAttribute("aria-pressed", String(group.groupId === selectedGroupId));
      if (group.groupId === selectedGroupId) button.classList.add("is-selected");

      const titleEl = document.createElement("div");
      titleEl.className = "groupManagerListItemTitle";
      titleEl.textContent = String(group.name || "Untitled group");

      const descriptionEl = document.createElement("div");
      descriptionEl.className = "groupManagerListItemDescription small";
      descriptionEl.textContent = String(group.description || "No description");

      const metaEl = document.createElement("div");
      metaEl.className = "groupManagerListItemMeta";
      const countEl = document.createElement("div");
      countEl.className = "small";
      countEl.textContent = `${Number(group.count || group.mangaIds?.length || 0)} manga`;
      metaEl.append(countEl);

      button.append(titleEl, descriptionEl, metaEl);
      button.addEventListener("click", () => {
        selectedGroupId = group.groupId;
        selectedGroupSnapshot = null;
        hasDirtyMembership = false;
        hydrateGroupMetaForm(selectedGroup());
        renderGroupsList();
        renderSelectionHint();
        setStep(currentStep);
      });
      groupsListEl.appendChild(button);
    }
  }

  function renderSelectionHint() {
    const selected = selectedGroup();
    if (!selected) {
      groupSelectionHintEl.textContent = "Select an existing group or create a new one.";
      groupMetaPaneTitleEl.textContent = "Edit group";
      return;
    }

    groupSelectionHintEl.textContent = "";
    groupMetaPaneTitleEl.textContent = `Edit group: ${selected.name}`;
  }

  function hydrateGroupMetaForm(group) {
    if (!group) {
      groupMetaSnapshot = null;
      hasDirtyMeta = false;
      groupEditNameInputEl.value = "";
      groupEditDescriptionInputEl.value = "";
      groupEditNameInputEl.disabled = true;
      groupEditDescriptionInputEl.disabled = true;
      groupMetaValidationMessageEl.textContent = "Select a group to edit its details.";
      renderGroupMetaActions();
      return;
    }

    groupMetaSnapshot = {
      groupId: group.groupId,
      name: String(group.name || ""),
      description: String(group.description || ""),
      expectedUpdatedAt: String(group.updatedAt || ""),
    };
    groupEditNameInputEl.disabled = false;
    groupEditDescriptionInputEl.disabled = false;
    groupEditNameInputEl.value = groupMetaSnapshot.name;
    groupEditDescriptionInputEl.value = groupMetaSnapshot.description;
    groupMetaValidationMessageEl.textContent = "";
    hasDirtyMeta = false;
    renderGroupMetaActions();
  }

  function validateGroupMetaInputs() {
    const name = normalizeText(groupEditNameInputEl.value);
    const description = normalizeText(groupEditDescriptionInputEl.value);
    if (!groupMetaSnapshot) {
      return { ok: false, message: "Select a group first." };
    }
    if (!name) {
      return { ok: false, message: "Group name is required.", field: "name" };
    }
    if (name.length > 80) {
      return { ok: false, message: "Group name exceeds 80 characters.", field: "name" };
    }
    if (description.length > 500) {
      return { ok: false, message: "Group description exceeds 500 characters.", field: "description" };
    }
    return { ok: true, name, description };
  }

  function renderGroupMetaActions() {
    const hasSelection = Boolean(groupMetaSnapshot);
    const validation = validateGroupMetaInputs();

    saveGroupMetaBtn.disabled = !hasSelection || !hasDirtyMeta || !validation.ok;
    deleteGroupBtn.disabled = !hasSelection;

    if (!hasSelection) return;
    if (!validation.ok) {
      groupMetaValidationMessageEl.textContent = validation.message;
      return;
    }

    if (hasDirtyMeta) {
      const candidateName = normalizeText(groupEditNameInputEl.value);
      const duplicateNameCount = groups.filter((group) => group.groupId !== groupMetaSnapshot.groupId && group.name === candidateName).length;
      groupMetaValidationMessageEl.textContent = duplicateNameCount > 0
        ? `Warning: ${duplicateNameCount} other group(s) already use this name.`
        : "Unsaved group detail changes.";
      return;
    }

    groupMetaValidationMessageEl.textContent = "";
  }

  function dedupeMangaIds(ids) {
    const seen = new Set();
    const output = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      const mangaId = String(id || "").trim();
      if (!mangaId || seen.has(mangaId)) continue;
      seen.add(mangaId);
      output.push(mangaId);
    }
    return output;
  }

  function getVisibleLibrary() {
    if (!membershipSearchTerm) return library;
    const term = membershipSearchTerm.toLowerCase();
    return library.filter((entry) => {
      const mangaId = String(entry.id || "").toLowerCase();
      const title = String(entry.title || "").toLowerCase();
      const artist = String(entry.artist || "").toLowerCase();
      const tags = Array.isArray(entry.tags)
        ? entry.tags.map((tag) => String(tag || "").toLowerCase()).filter(Boolean)
        : [];
      return mangaId.includes(term)
        || title.includes(term)
        || artist.includes(term)
        || tags.some((tag) => tag.includes(term));
    });
  }

  function toggleMembership(mangaId, shouldSelect) {
    if (!mangaId) return;
    if (shouldSelect) {
      if (!selectedMembershipIds.has(mangaId)) {
        selectedMembershipIds.add(mangaId);
        selectedMembershipOrder.push(mangaId);
      }
      return;
    }

    selectedMembershipIds.delete(mangaId);
    selectedMembershipOrder = selectedMembershipOrder.filter((id) => id !== mangaId);
  }

  function renderMembershipLists() {
    destroyMembershipPreview();
    librarySelectionListEl.textContent = "";
    selectedMembershipListEl.textContent = "";

    const visibleLibrary = getVisibleLibrary();
    if (!visibleLibrary.length) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = library.length ? "No library entries match your search." : "Library is empty.";
      librarySelectionListEl.appendChild(empty);
    }

    for (const manga of visibleLibrary) {
      const mangaId = String(manga.id || "").trim();
      if (!mangaId) continue;

      const row = document.createElement("div");
      row.className = "groupManagerCheckboxRow";
      row.dataset.mangaId = mangaId;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedMembershipIds.has(mangaId);
      checkbox.className = "groupManagerCheckbox";
      checkbox.addEventListener("change", () => {
        toggleMembership(mangaId, checkbox.checked);
        refreshMembershipDirtyState();
        renderMembershipLists();
        renderMembershipActions();
      });

      const textWrap = document.createElement("div");
      textWrap.className = "groupManagerMembershipMeta";
      const titleEl = document.createElement("button");
      titleEl.type = "button";
      titleEl.className = "groupManagerMembershipMetaTitle groupManagerPreviewTrigger";
      titleEl.textContent = String(manga.title || mangaId);
      titleEl.title = "Click to preview";
      titleEl.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await openMembershipPreview(titleEl, manga.firstPagePath);
      });
      const subtitleEl = document.createElement("div");
      subtitleEl.className = "small";
      subtitleEl.textContent = [manga.artist, formatPages(manga.pagesFound)].filter(Boolean).join(" • ");
      textWrap.append(titleEl, subtitleEl);
      row.append(checkbox, textWrap);
      librarySelectionListEl.appendChild(row);
    }

    const nextMembershipOrder = selectedMembershipOrder.filter((id) => selectedMembershipIds.has(id));
    selectedMembershipOrder = nextMembershipOrder;

    if (!selectedMembershipOrder.length) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = "No manga selected for this group.";
      selectedMembershipListEl.appendChild(empty);
    } else {
      for (const mangaId of selectedMembershipOrder) {
        const item = library.find((entry) => entry.id === mangaId);
        const row = document.createElement("div");
        row.className = "groupManagerListItem groupManagerSelectedMembershipItem";

        const removeBtn = document.createElement("button");
        removeBtn.className = "membershipRemoveIconBtn";
        removeBtn.type = "button";
        removeBtn.setAttribute("aria-label", `Remove ${item?.title || mangaId} from this group`);

        const removeIcon = document.createElement("span");
        removeIcon.className = "icon icon-delete";
        removeIcon.setAttribute("aria-hidden", "true");
        removeBtn.append(removeIcon);
        removeBtn.addEventListener("click", () => {
          toggleMembership(mangaId, false);
          refreshMembershipDirtyState();
          renderMembershipLists();
          renderMembershipActions();
        });

        const textWrap = document.createElement("div");
        textWrap.className = "groupManagerMembershipMeta";
        const titleEl = document.createElement("button");
        titleEl.type = "button";
        titleEl.className = "groupManagerListItemTitle groupManagerPreviewTrigger";
        titleEl.textContent = String(item?.title || mangaId);
        titleEl.title = "Click to preview";
        titleEl.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await openMembershipPreview(titleEl, item?.firstPagePath);
        });

        const subtitleEl = document.createElement("div");
        subtitleEl.className = "small";
        subtitleEl.textContent = [item?.artist, formatPages(item?.pagesFound)].filter(Boolean).join(" • ");

        textWrap.append(titleEl, subtitleEl);
        row.append(removeBtn, textWrap);
        selectedMembershipListEl.appendChild(row);
      }
    }
  }


  function refreshMembershipDirtyState() {
    const previous = dedupeMangaIds(selectedGroupSnapshot?.mangaIds || []);
    const next = dedupeMangaIds(selectedMembershipOrder);
    if (previous.length !== next.length) {
      hasDirtyMembership = true;
      return;
    }
    hasDirtyMembership = previous.some((id, index) => id !== next[index]);
  }

  function renderMembershipActions() {
    const canSave = Boolean(selectedGroupId) && hasDirtyMembership;
    saveMembershipBtn.disabled = !canSave;

    const visibleIds = getVisibleLibrary().map((entry) => String(entry.id || "").trim()).filter(Boolean);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedMembershipIds.has(id));
    const someVisibleSelected = visibleIds.some((id) => selectedMembershipIds.has(id));
    selectAllMembershipBtn.disabled = visibleIds.length === 0 || allVisibleSelected;
    clearAllMembershipBtn.disabled = visibleIds.length === 0 || !someVisibleSelected;
  }

  async function loadGroups() {
    const res = await groupManagerApi.listGroups();
    if (!res?.ok) {
      groups = [];
      selectedGroupId = "";
    } else {
      groups = Array.isArray(res.groups) ? res.groups : [];
      if (!groups.some((group) => group.groupId === selectedGroupId)) {
        selectedGroupId = groups[0]?.groupId || "";
      }
    }
    hydrateGroupMetaForm(selectedGroup());
    renderGroupsList();
    renderSelectionHint();
    setStep(currentStep);
  }

  async function loadLibrary() {
    const res = await groupManagerApi.listLibrary({ includeFirstPagePath: true });
    if (!res?.ok) {
      library = [];
      return;
    }

    const candidates = Array.isArray(res.items)
      ? res.items
      : (Array.isArray(res.comics) ? res.comics : []);
    library = candidates;
  }

  async function prepareStepTwo() {
    const group = selectedGroup();
    if (!group) return;
    if (!library.length) await loadLibrary();

    const fullRes = await groupManagerApi.getGroup(group.groupId);
    if (!fullRes?.ok || !fullRes.group) {
      hasDirtyMembership = false;
      selectedMembershipIds = new Set();
      selectedMembershipOrder = [];
      return;
    }

    selectedGroupSnapshot = fullRes.group;
    selectedMembershipOrder = dedupeMangaIds(fullRes.group.mangaIds);
    selectedMembershipIds = new Set(selectedMembershipOrder);
    hasDirtyMembership = false;
    membershipSearchTerm = "";
    membershipSearchInputEl.value = "";
    renderMembershipLists();
    renderMembershipActions();
  }

  async function createGroup(event) {
    event.preventDefault();
    const name = normalizeText(groupNameInputEl.value);
    const description = normalizeText(groupDescriptionInputEl.value);
    if (!name) {
      groupSelectionHintEl.textContent = "Name is required.";
      return;
    }

    const duplicateNameCount = groups.filter((group) => group.name === name).length;
    if (duplicateNameCount > 0) {
      groupSelectionHintEl.textContent = `Creating group with duplicate name. ${duplicateNameCount} group(s) already use this name.`;
    }

    const res = await groupManagerApi.createGroup({ name, description });
    if (!res?.ok || !res.group) {
      groupSelectionHintEl.textContent = String(res?.message || "Failed creating group.");
      return;
    }

    closeCreateModal({ keepValues: true });
    selectedGroupId = res.group.groupId;
    await loadGroups();
  }

  async function saveGroupMeta(event) {
    event.preventDefault();
    const validation = validateGroupMetaInputs();
    if (!validation.ok || !groupMetaSnapshot) {
      groupMetaValidationMessageEl.textContent = validation.message || "Unable to save group details.";
      return;
    }

    const res = await groupManagerApi.updateGroupMeta({
      groupId: groupMetaSnapshot.groupId,
      name: validation.name,
      description: validation.description,
      expectedUpdatedAt: groupMetaSnapshot.expectedUpdatedAt,
    });

    if (!res?.ok || !res.group) {
      groupMetaValidationMessageEl.textContent = String(res?.message || "Unable to save group details.");
      if (res?.errorCode === "CONFLICT") {
        await loadGroups();
      }
      return;
    }

    selectedGroupId = res.group.groupId;
    hasDirtyMeta = false;
    await loadGroups();
    groupMetaValidationMessageEl.textContent = "Group details saved.";
  }

  async function deleteSelectedGroup() {
    if (!groupMetaSnapshot) return;

    const deletePayload = {
      groupId: groupMetaSnapshot.groupId,
      expectedUpdatedAt: groupMetaSnapshot.expectedUpdatedAt,
    };
    let res = await groupManagerApi.deleteGroup(deletePayload);

    if (!res?.ok && res?.errorCode === "CONFLICT") {
      const latest = await groupManagerApi.getGroup({ groupId: groupMetaSnapshot.groupId });
      if (latest?.ok && latest.group?.updatedAt) {
        res = await groupManagerApi.deleteGroup({
          groupId: groupMetaSnapshot.groupId,
          expectedUpdatedAt: String(latest.group.updatedAt),
        });
      }
    }

    if (!res?.ok) {
      groupMetaValidationMessageEl.textContent = String(res?.message || "Unable to delete group.");
      if (res?.errorCode === "CONFLICT" || res?.errorCode === "NOT_FOUND") await loadGroups();
      return;
    }

    if (selectedGroupId === groupMetaSnapshot.groupId) {
      selectedGroupId = "";
      if (currentStep !== 1) {
        setStep(1);
      }
    }

    selectedGroupSnapshot = null;
    hasDirtyMembership = false;
    await loadGroups();
    groupMetaValidationMessageEl.textContent = "Group deleted.";
  }

  prevStepBtn.addEventListener("click", () => {
    setStep(1);
  });

  nextStepBtn.addEventListener("click", async () => {
    if (currentStep === 1) {
      if (!selectedGroup()) return;
      if (hasDirtyMeta) {
        const ok = window.confirm("You have unsaved group detail changes. Continue to membership without saving?");
        if (!ok) return;
      }
      setStep(2);
      await prepareStepTwo();
      return;
    }

    if (hasDirtyMembership) {
      const ok = window.confirm("You have unsaved membership changes. Discard and return to group selection?");
      if (!ok) return;
      hasDirtyMembership = false;
    }
    setStep(1);
  });

  groupCreateFormEl.addEventListener("submit", (event) => {
    void createGroup(event);
  });

  openCreateGroupModalBtn.addEventListener("click", () => {
    openCreateModal();
  });

  closeCreateGroupModalBtn.addEventListener("click", () => {
    closeCreateModal();
  });

  cancelCreateGroupBtn.addEventListener("click", () => {
    closeCreateModal();
  });

  groupMetaFormEl.addEventListener("submit", (event) => {
    void saveGroupMeta(event);
  });

  deleteGroupBtn.addEventListener("click", () => {
    void deleteSelectedGroup();
  });

  groupSearchInputEl.addEventListener("input", () => {
    groupSearchTerm = normalizeText(groupSearchInputEl.value).toLowerCase();
    renderGroupsList();
  });

  membershipSearchInputEl.addEventListener("input", () => {
    if (membershipSearchDebounceId) window.clearTimeout(membershipSearchDebounceId);
    membershipSearchDebounceId = window.setTimeout(() => {
      membershipSearchTerm = normalizeText(membershipSearchInputEl.value).toLowerCase();
      renderMembershipLists();
      renderMembershipActions();
    }, 120);
  });

  selectAllMembershipBtn.addEventListener("click", () => {
    for (const entry of getVisibleLibrary()) {
      const mangaId = String(entry.id || "").trim();
      if (!mangaId) continue;
      toggleMembership(mangaId, true);
    }
    refreshMembershipDirtyState();
    renderMembershipLists();
    renderMembershipActions();
  });

  clearAllMembershipBtn.addEventListener("click", () => {
    for (const entry of getVisibleLibrary()) {
      const mangaId = String(entry.id || "").trim();
      if (!mangaId) continue;
      toggleMembership(mangaId, false);
    }
    refreshMembershipDirtyState();
    renderMembershipLists();
    renderMembershipActions();
  });

  for (const input of [groupEditNameInputEl, groupEditDescriptionInputEl]) {
    input.addEventListener("input", () => {
      if (!groupMetaSnapshot) return;
      const nextName = normalizeText(groupEditNameInputEl.value);
      const nextDescription = normalizeText(groupEditDescriptionInputEl.value);
      hasDirtyMeta = nextName !== groupMetaSnapshot.name || nextDescription !== groupMetaSnapshot.description;
      renderGroupMetaActions();
    });
  }

  saveMembershipBtn.addEventListener("click", async () => {
    if (!selectedGroupSnapshot || !selectedGroupId) return;
    const payload = {
      groupId: selectedGroupId,
      mangaIds: selectedMembershipOrder,
      expectedUpdatedAt: selectedGroupSnapshot.updatedAt,
    };
    const res = await groupManagerApi.updateGroupMembership(payload);
    if (!res?.ok || !res.group) {
      if (res?.errorCode === "CONFLICT") {
        await prepareStepTwo();
      }
      window.alert(String(res?.message || "Unable to save group membership."));
      return;
    }
    selectedGroupSnapshot = res.group;
    selectedMembershipOrder = dedupeMangaIds(res.group.mangaIds);
    selectedMembershipIds = new Set(selectedMembershipOrder);
    hasDirtyMembership = false;
    renderMembershipLists();
    renderMembershipActions();
    await loadGroups();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!membershipPreviewState) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (membershipPreviewState.hostEl?.contains(target) || membershipPreviewState.anchorEl?.contains(target)) return;
    destroyMembershipPreview();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") destroyMembershipPreview();
  });

  window.addEventListener("blur", () => {
    destroyMembershipPreview();
  });

  if (typeof groupManagerApi.onSettingsUpdated === "function") {
    groupManagerApi.onSettingsUpdated((payload) => {
      applyTheme(payload?.settings?.darkMode);
    });
  }

  void loadSettings();
  void loadGroups();
  setStep(1);
}
