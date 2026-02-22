(function initContextMenuModule(globalObj) {
  function createMenuItem(doc, { label, iconClass, action, danger = false }) {
    const button = doc.createElement("button");
    button.className = `menu-item${danger ? " danger" : ""}`;
    button.type = "button";
    button.dataset.action = action;

    const icon = doc.createElement("span");
    icon.className = `icon ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");

    const text = doc.createElement("span");
    text.textContent = label;

    button.appendChild(icon);
    button.appendChild(text);
    return button;
  }

  function createContextMenuController({
    doc,
    win,
    readerEl,
    pagesEl,
    onToggleFavorite,
    onEditEntry,
    onDeleteEntry,
  }) {
    let galleryContextMenuEl = null;
    let galleryContextMenuEntry = null;
    let readerContextMenuEl = null;

    let readerAutoScrollRaf = null;
    let readerAutoScrollLastTs = 0;
    let readerAutoScrollSpeed = 120;
    let readerAutoScrollCarry = 0;
    let readerAutoScrollEnabled = false;
    const READER_AUTOSCROLL_MIN_SPEED = 80;
    const READER_AUTOSCROLL_MAX_SPEED = 300;

    function closeGalleryContextMenu() {
      if (!galleryContextMenuEl) return;
      galleryContextMenuEl.style.display = "none";
      galleryContextMenuEl.replaceChildren();
      galleryContextMenuEntry = null;
    }

    function positionContextMenu(menu, x, y) {
      const margin = 8;
      menu.style.left = "0px";
      menu.style.top = "0px";
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      const maxX = Math.max(margin, win.innerWidth - menuWidth - margin);
      const maxY = Math.max(margin, win.innerHeight - menuHeight - margin);
      menu.style.left = `${Math.max(margin, Math.min(x, maxX))}px`;
      menu.style.top = `${Math.max(margin, Math.min(y, maxY))}px`;
    }

    function ensureGalleryContextMenu() {
      if (galleryContextMenuEl) return galleryContextMenuEl;
      const menu = doc.createElement("div");
      menu.className = "context-menu";
      menu.setAttribute("role", "menu");
      menu.style.display = "none";
      menu.addEventListener("click", async (event) => {
        const actionEl = event.target.closest("[data-action]");
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        const entry = galleryContextMenuEntry;
        closeGalleryContextMenu();
        if (!entry) return;
        if (action === "favorite") await onToggleFavorite(entry);
        if (action === "edit") onEditEntry(entry);
        if (action === "delete") await onDeleteEntry(entry);
      });
      doc.body.appendChild(menu);
      galleryContextMenuEl = menu;
      return menu;
    }

    function setReaderAutoScrollState(active) {
      readerAutoScrollEnabled = Boolean(active);
      if (!readerAutoScrollEnabled) {
        if (readerAutoScrollRaf) {
          win.cancelAnimationFrame(readerAutoScrollRaf);
          readerAutoScrollRaf = null;
        }
        readerAutoScrollLastTs = 0;
        readerAutoScrollCarry = 0;
      }
      const toggleBtn = readerContextMenuEl?.querySelector('[data-action="reader-autoscroll-toggle"]');
      const toggleBtnLabel = readerContextMenuEl?.querySelector(
        '[data-role="reader-autoscroll-toggle-label"]',
      );
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-pressed", readerAutoScrollEnabled ? "true" : "false");
        toggleBtn.title = readerAutoScrollEnabled ? "Stop auto-scroll" : "Start auto-scroll";
      }
      if (toggleBtnLabel) {
        toggleBtnLabel.textContent = readerAutoScrollEnabled ? "Stop auto-scroll" : "Start auto-scroll";
      }
    }

    function runReaderAutoScroll(timestamp) {
      if (!readerAutoScrollEnabled || readerEl.style.display !== "block") {
        setReaderAutoScrollState(false);
        return;
      }
      const maxTop = Math.max(0, pagesEl.scrollHeight - pagesEl.clientHeight);
      if (pagesEl.scrollTop >= maxTop - 1) {
        setReaderAutoScrollState(false);
        return;
      }
      if (!readerAutoScrollLastTs) readerAutoScrollLastTs = timestamp;
      const deltaSeconds = Math.max(0, Math.min(0.1, (timestamp - readerAutoScrollLastTs) / 1000));
      readerAutoScrollLastTs = timestamp;
      const rawDelta = readerAutoScrollSpeed * deltaSeconds + readerAutoScrollCarry;
      const step = Math.max(1, Math.floor(rawDelta));
      readerAutoScrollCarry = rawDelta - step;
      pagesEl.scrollBy(0, step);
      readerAutoScrollRaf = win.requestAnimationFrame(runReaderAutoScroll);
    }

    function startReaderAutoScroll() {
      if (readerAutoScrollEnabled) return;
      setReaderAutoScrollState(true);
      closeReaderContextMenu();
      readerAutoScrollRaf = win.requestAnimationFrame(runReaderAutoScroll);
    }

    function stopReaderAutoScroll() {
      setReaderAutoScrollState(false);
    }

    function ensureReaderContextMenu() {
      if (readerContextMenuEl) return readerContextMenuEl;
      const menu = doc.createElement("div");
      menu.className = "context-menu reader-context-menu";
      menu.setAttribute("role", "menu");
      menu.style.display = "none";

      const toggleAutoScrollBtn = createMenuItem(doc, {
        label: "Start auto-scroll",
        iconClass: "icon-play",
        action: "reader-autoscroll-toggle",
      });
      toggleAutoScrollBtn.classList.add("reader-menu-item-start");
      toggleAutoScrollBtn.setAttribute("aria-pressed", "false");
      toggleAutoScrollBtn.querySelector("span:last-child")?.setAttribute(
        "data-role",
        "reader-autoscroll-toggle-label",
      );

      const speedRow = doc.createElement("div");
      speedRow.className = "reader-menu-row";
      const speedValue = doc.createElement("span");
      speedValue.className = "reader-menu-speed";
      speedValue.dataset.role = "reader-autoscroll-speed-label";
      speedValue.textContent = `${readerAutoScrollSpeed}px/sec`;

      const speedInput = doc.createElement("input");
      speedInput.id = "readerAutoScrollSpeed";
      speedInput.className = "reader-menu-range";
      speedInput.type = "range";
      speedInput.min = String(READER_AUTOSCROLL_MIN_SPEED);
      speedInput.max = String(READER_AUTOSCROLL_MAX_SPEED);
      speedInput.step = "10";
      speedInput.value = String(readerAutoScrollSpeed);

      speedRow.appendChild(speedInput);
      speedRow.appendChild(speedValue);

      menu.appendChild(speedRow);
      menu.appendChild(toggleAutoScrollBtn);

      menu.addEventListener("click", (event) => {
        const actionEl = event.target.closest("[data-action]");
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        if (action === "reader-autoscroll-toggle") {
          if (readerAutoScrollEnabled) stopReaderAutoScroll();
          else startReaderAutoScroll();
        }
      });

      speedInput.addEventListener("input", () => {
        readerAutoScrollSpeed = Math.max(
          READER_AUTOSCROLL_MIN_SPEED,
          Math.min(READER_AUTOSCROLL_MAX_SPEED, Number(speedInput.value) || READER_AUTOSCROLL_MIN_SPEED),
        );
        speedValue.textContent = `${readerAutoScrollSpeed}px/sec`;
      });

      doc.body.appendChild(menu);
      readerContextMenuEl = menu;
      return menu;
    }

    function closeReaderContextMenu() {
      if (!readerContextMenuEl) return;
      readerContextMenuEl.style.display = "none";
    }

    function showReaderContextMenu(x, y) {
      readerAutoScrollSpeed = Math.max(
        READER_AUTOSCROLL_MIN_SPEED,
        Math.min(READER_AUTOSCROLL_MAX_SPEED, readerAutoScrollSpeed),
      );
      const menu = ensureReaderContextMenu();
      const speedInput = menu.querySelector("#readerAutoScrollSpeed");
      const speedLabel = menu.querySelector('[data-role="reader-autoscroll-speed-label"]');
      if (speedInput) speedInput.value = String(readerAutoScrollSpeed);
      if (speedLabel) speedLabel.textContent = `${readerAutoScrollSpeed}px/sec`;
      setReaderAutoScrollState(readerAutoScrollEnabled);
      menu.style.display = "block";
      positionContextMenu(menu, x, y);
    }

    function showGalleryContextMenu(x, y, entry) {
      const menu = ensureGalleryContextMenu();
      galleryContextMenuEntry = entry;
      const favoriteLabel = entry.favorite ? "Remove from favorites" : "Add to favorites";
      const favoriteIcon = entry.favorite ? "icon-star-filled" : "icon-star";

      const favoriteBtn = createMenuItem(doc, {
        label: favoriteLabel,
        iconClass: favoriteIcon,
        action: "favorite",
      });
      const editBtn = createMenuItem(doc, {
        label: "Edit metadata",
        iconClass: "icon-edit",
        action: "edit",
      });
      const divider = doc.createElement("div");
      divider.className = "menu-divider";
      divider.setAttribute("role", "separator");
      const deleteBtn = createMenuItem(doc, {
        label: "Delete",
        iconClass: "icon-delete",
        action: "delete",
        danger: true,
      });

      menu.replaceChildren(favoriteBtn, editBtn, divider, deleteBtn);
      menu.style.display = "block";
      positionContextMenu(menu, x, y);
    }

    function syncWithVisibleEntries(visibleDirs) {
      if (!galleryContextMenuEntry?.dir) return;
      if (visibleDirs.has(galleryContextMenuEntry.dir)) return;
      closeGalleryContextMenu();
    }

    function isClickInsideContextMenus(target) {
      return Boolean(
        (galleryContextMenuEl && galleryContextMenuEl.contains(target)) ||
          (readerContextMenuEl && readerContextMenuEl.contains(target)),
      );
    }

    function closeAllContextMenus() {
      closeGalleryContextMenu();
      closeReaderContextMenu();
    }

    return {
      closeAllContextMenus,
      closeGalleryContextMenu,
      closeReaderContextMenu,
      isClickInsideContextMenus,
      isReaderAutoScrollEnabled: () => readerAutoScrollEnabled,
      showGalleryContextMenu,
      showReaderContextMenu,
      startReaderAutoScroll,
      stopReaderAutoScroll,
      syncWithVisibleEntries,
    };
  }

  globalObj.nviewContextMenu = { createContextMenuController };
})(window);
