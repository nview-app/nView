(function initReaderRuntimeModule(globalObj) {
  function createReaderRuntime({
    doc,
    win,
    readerEl,
    readerTitleEl,
    pagesEl,
    closeReaderBtn,
    favoriteToggleBtn,
    readerPageController,
    contextMenuController,
    onFavoriteToggle = async () => null,
    onReaderOpen = () => {},
    onReaderClose = () => {},
  }) {
    if (!readerEl || !pagesEl || !readerPageController || !contextMenuController) {
      throw new Error("Reader runtime failed to initialize due to missing dependencies");
    }

    let currentComicDir = null;
    let currentComicMeta = null;

    function isOpen() {
      return readerEl.style.display === "block";
    }

    function updateFavoriteToggle(isFavorite) {
      if (!favoriteToggleBtn) return;
      const favored = Boolean(isFavorite);
      favoriteToggleBtn.classList.toggle("is-favorite", favored);
      const icon = favoriteToggleBtn.querySelector(".icon");
      if (icon) {
        icon.classList.toggle("icon-star-filled", favored);
        icon.classList.toggle("icon-star", !favored);
      }
      favoriteToggleBtn.setAttribute(
        "aria-label",
        favored ? "Remove from favorites" : "Add to favorites",
      );
      favoriteToggleBtn.title = favored ? "Remove from favorites" : "Add to favorites";
    }

    function open({ title, comicDir, comicMeta, pages }) {
      readerPageController.close();
      currentComicDir = comicDir || null;
      currentComicMeta = comicMeta || null;
      if (readerTitleEl) {
        readerTitleEl.textContent = title || "Reader";
      }
      updateFavoriteToggle(currentComicMeta?.favorite);
      readerEl.style.display = "block";
      onReaderOpen();
      readerPageController.open({ pages });
    }

    function close() {
      contextMenuController.stopReaderAutoScroll();
      contextMenuController.closeReaderContextMenu();
      readerEl.style.display = "none";
      currentComicDir = null;
      currentComicMeta = null;
      readerPageController.close();
      onReaderClose();
    }

    async function closeAndWait() {
      close();
      await new Promise((resolve) =>
        win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)),
      );
    }

    function isEditableTarget(target) {
      if (!target) return false;
      if (target.isContentEditable) return true;
      const tagName = target.tagName?.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select";
    }

    async function handleFavoriteToggle() {
      if (!currentComicDir) return;
      const nextState = !currentComicMeta?.favorite;
      const updatedMeta = await onFavoriteToggle({
        comicDir: currentComicDir,
        comicMeta: currentComicMeta,
        nextFavorite: nextState,
      });
      if (!updatedMeta) return;
      currentComicMeta = updatedMeta;
      updateFavoriteToggle(currentComicMeta?.favorite);
    }

    function handleReaderSpaceKey(event) {
      if (event.defaultPrevented) return;
      if (event.code !== "Space" && event.key !== " ") return;
      if (!isOpen()) return;
      if (isEditableTarget(event.target)) return;
      if (!readerPageController.hasPages()) return;
      event.preventDefault();
      const currentIndex = readerPageController.getCurrentPageIndex();
      const maxIndex = Math.max(0, readerPageController.getPageCount() - 1);
      const nextIndex = Math.min(currentIndex + 1, maxIndex);
      if (nextIndex === currentIndex) return;
      readerPageController.scrollToPage(
        nextIndex,
        contextMenuController.isReaderAutoScrollEnabled() ? "auto" : "smooth",
      );
    }

    function handleReaderFitKey(event) {
      if (event.defaultPrevented) return;
      if (!isOpen()) return;
      if (isEditableTarget(event.target)) return;
      if (event.key?.toLowerCase() !== "f") return;
      if (event.repeat) return;
      event.preventDefault();
      readerPageController.toggleFitHeight();
    }

    function handleReaderContextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      contextMenuController.showReaderContextMenu(event.clientX, event.clientY);
    }

    function maybeStopReaderAutoScrollOnInteraction(event) {
      if (!contextMenuController.isReaderAutoScrollEnabled()) return;
      if (!event.isTrusted) return;
      if (!pagesEl.contains(event.target)) return;
      contextMenuController.stopReaderAutoScroll();
    }

    closeReaderBtn?.addEventListener("click", close);
    favoriteToggleBtn?.addEventListener("click", () => {
      void handleFavoriteToggle();
    });
    readerEl.addEventListener("click", (event) => {
      if (event.target === readerEl) close();
    });
    pagesEl.addEventListener("contextmenu", handleReaderContextMenu);
    pagesEl.addEventListener("wheel", maybeStopReaderAutoScrollOnInteraction, { passive: true });
    pagesEl.addEventListener("touchstart", maybeStopReaderAutoScrollOnInteraction, { passive: true });
    pagesEl.addEventListener("pointerdown", maybeStopReaderAutoScrollOnInteraction);
    win.addEventListener("keydown", handleReaderSpaceKey, true);
    win.addEventListener("keydown", handleReaderFitKey, true);

    return {
      close,
      closeAndWait,
      getCurrentComicDir() {
        return currentComicDir;
      },
      getCurrentComicMeta() {
        return currentComicMeta;
      },
      isOpen,
      open,
      setCurrentComicMeta(meta) {
        currentComicMeta = meta || null;
        updateFavoriteToggle(currentComicMeta?.favorite);
      },
      setTitle(title) {
        if (!readerTitleEl) return;
        readerTitleEl.textContent = title || "Reader";
      },
      updateFavoriteToggle,
    };
  }

  globalObj.nviewReaderRuntime = {
    createReaderRuntime,
  };
})(window);
