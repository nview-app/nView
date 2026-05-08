(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("bootstrapTheme") === "dark") {
    document.documentElement.classList.add("bootstrap-dark");
  }
})();
