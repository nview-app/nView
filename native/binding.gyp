{
  "targets": [
    {
      "target_name": "addon",
      "sources": [
        "src/addon.cc"
      ],
      "conditions": [
        ["OS=='win'", {
          "sources": [
            "src/secure_memory_win.cc"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 0,
              "AdditionalOptions": ["/guard:cf"]
            }
          }
        }, {
          "sources": [
            "src/secure_memory_noop.cc"
          ]
        }]
      ],
      "include_dirs": [
        "include"
      ]
    }
  ]
}
