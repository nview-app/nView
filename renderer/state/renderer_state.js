(function initRendererState(globalScope) {
  const VALID_START_PAGE_HASHES = new Set([
    "025cd83ae01cdc332a1698ec3aceec7c84b83557f5388968e02831e877688e07",
    "7939af4c0f1ebe4049e933a07a667d0f58c0529cad7478808e6fabaec343492b",
    "8605b8ba08c20d42f9e455151871896d0e0de980596286fb736d11eec013e2a4",
  ]);

  function createInitialRendererState() {
    const vaultPolicy = {
      minPassphraseLength: 8,
      passphraseHelpText:
        "Use a minimum of 8 characters. It is recommended to include at least one uppercase letter, one lowercase letter, one digit, and one symbol.",
      tooShortError: "Passphrase must be at least 8 characters.",
    };

    return {
      settingsCache: {
        startPage: "",
        blockPopups: true,
        allowListEnabled: true,
        allowListDomains: ["*.cloudflare.com"],
        darkMode: false,
        defaultSort: "favorites",
        cardSize: "normal",
        libraryPath: "",
      },
      libraryPathInfo: {
        configuredPath: "",
        activePath: "-",
        defaultPath: "-",
      },
      moveLibraryState: {
        selectedPath: "",
        permissionOk: false,
        emptyFolderOk: false,
        freeSpaceOk: false,
        requiredBytes: 0,
        availableBytes: 0,
        checking: false,
        moving: false,
      },
      startPageValidationToken: 0,
      vaultState: { initialized: false, unlocked: true },
      vaultPolicy,
      minVaultPassphrase: vaultPolicy.minPassphraseLength,
    };
  }

  globalScope.nviewRendererState = {
    createInitialRendererState,
    VALID_START_PAGE_HASHES,
  };
})(window);
