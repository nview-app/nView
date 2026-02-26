(function initRendererState(globalScope) {
  function createInitialRendererState() {
    const vaultPolicy = {
      minPassphraseLength: 8,
      passphraseHelpText:
        "Use a minimum of 8 characters. It is recommended to include at least one uppercase letter, one lowercase letter, one digit, and one symbol.",
      tooShortError: "Passphrase must be at least 8 characters.",
    };

    return {
      settingsCache: {
        startPages: [],
        startPage: "",
        sourceAdapterUrls: {},
        blockPopups: true,
        allowListEnabled: true,
        allowListDomainsSchemaVersion: 2,
        allowListDomainsBySourceAdapter: {},
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
  };
})(window);
