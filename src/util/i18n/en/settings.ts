/** Everything the settings dialog says, plus the labels it borrows from utils. */
export const settings = {
  // Dialog chrome: title, tablist, and the badge on a tab holding a blocked edit.
  'settings.title': 'Settings',
  'settings.sections': 'Settings sections',
  'settings.tabGeneral': 'General',
  'settings.tabAudio': 'Audio',
  'settings.tabVisual': 'Visual',
  'settings.tabBraille': 'Braille & Tactile',
  'settings.tabAi': 'AI',
  'settings.tabAbout': 'About',
  // Extends a tab's name rather than replacing it, so it leads with a space:
  // an accessible name is the concatenation of the contents.
  'settings.needsAttention': ' needs attention',

  // General tab.
  'settings.language': 'Language',
  'settings.languageAuto': 'Browser default',
  'settings.autoplayDurationRow': 'Autoplay Duration (ms)',
  'settings.autoplayDuration': 'Autoplay Duration',
  'settings.ariaMode': 'ARIA Mode',
  'settings.ariaAssertive': 'Assertive',
  'settings.ariaPolite': 'Polite',
  'settings.hoverMode': 'Hover Mode',
  'settings.hoverOnHover': 'Hover',
  'settings.hoverOnClick': 'Click',

  // Audio tab.
  'settings.volume': 'Volume',
  'settings.minFrequencyRow': 'Min Frequency (Hz)',
  'settings.minFrequency': 'Minimum Frequency',
  'settings.maxFrequencyRow': 'Max Frequency (Hz)',
  'settings.maxFrequency': 'Maximum Frequency',
  'settings.echoCount': '3D Echo Count',
  'settings.echoVolume': 'Echo Volume',
  'settings.echoDuration': 'Echo Duration (s)',

  // Visual tab.
  'settings.outlineColor': 'Outline Color',
  'settings.highlightColor': 'Highlight Color',
  'settings.highContrastMode': 'High Contrast Mode',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.highContrastLevels': 'High Contrast Levels',
  'settings.highContrastLightColor': 'High Contrast Light Color',
  'settings.highContrastDarkColor': 'High Contrast Dark Color',

  // Braille & Tactile tab.
  'settings.brailleDisplay': 'Braille Display',
  'settings.brailleSingleLine': 'Single line',
  'settings.brailleMultiLine': 'Multi-line',
  'settings.brailleManual': 'Configure manually',
  'settings.singleLineDisplay': 'Single-Line Display',
  'settings.selectSingleLineDisplay': 'Select a single-line display',
  'settings.multiLineDisplay': 'Multi-Line Display',
  'settings.selectMultiLineDisplay': 'Select a multi-line display',
  'settings.braillePresetHint': 'Don\'t see your display? Choose "Configure manually".',
  'settings.manualBrailleGroup': 'Manual braille display configuration',
  'settings.brailleDisplaySize': 'Braille Display Size',
  'settings.brailleDisplaySizeHelp': 'Cells per row on a physical braille display (1-{max}).',
  'settings.brailleDisplayLines': 'Braille Display Lines',
  'settings.brailleDisplayLinesHelp': 'Number of rows on a physical braille display (1-{max}). Set above 1 to enable multi-line output.',
  'settings.tactileDisplay': 'Tactile Graphics Display',
  'settings.selectTactileDisplay': 'Select a tactile display',
  'settings.connectBluetooth': 'Connect over Bluetooth',
  'settings.connectUsb': 'Connect over USB',
  'settings.disconnect': 'Disconnect',

  // How the tactile display's connection is announced. Every branch says what
  // the reader can do next.
  'settings.tactileConnectedBluetooth': 'Connected to {device} over Bluetooth. Press b on the chart to show it.',
  'settings.tactileConnectedUsb': 'Connected to {device} over USB. Press b on the chart to show it.',
  'settings.tactileGenericDevice': 'a tactile display',
  'settings.tactileConnecting': 'Connecting…',
  'settings.tactileRetry': '{message} Select the device again to retry.',
  'settings.tactileNotConnected': 'Not connected.',

  // Braille display presets, as the pickers list them.
  'settings.braillePresetSingle': '{label} — {manufacturer} ({cells} cells)',
  'settings.braillePresetMulti': '{label} — {manufacturer} ({lines} lines × {cells} cells)',

  // AI tab. `{name}` is the provider's own name and is never translated.
  'settings.enableProvider': 'Enable {name}',
  'settings.providerApiKey': '{name} API Key',
  'settings.providerServerUrl': '{name} Server URL',
  'settings.providerModelVersion': '{name} Model Version',
  'settings.apiKeyPlaceholder': 'Enter {name} API Key',
  'settings.ollamaUrlPlaceholder': 'Enter Ollama server URL (e.g. http://localhost:11434)',
  'settings.checkingOllamaServerHelp': 'Checking Ollama server...',
  'settings.validatingApiKeyHelp': 'Validating API key...',
  'settings.ollamaUnreachableHelp': 'Ollama server is unreachable. Make sure Ollama is running and, for non-localhost pages, that OLLAMA_ORIGINS allows this site.',
  'settings.providerApiKeyInvalid': '{name} API key is invalid',
  'settings.ollamaReachable': 'Ollama server is reachable',
  'settings.providerApiKeyValid': '{name} API key is valid',
  'settings.checkingOllamaServer': 'Checking Ollama server',
  'settings.validatingApiKey': 'Validating API key',
  'settings.apiKeyValid': 'API key is valid',
  'settings.ollamaUnreachable': 'Ollama server is unreachable',
  'settings.apiKeyInvalid': 'API key is invalid',
  'settings.modelRetired': '"{version}" is not in {name}\'s current model list — it may have been retired. Consider selecting another model.',
  'settings.expertiseLevel': 'Expertise Level',
  'settings.expertiseBasic': 'Basic',
  'settings.expertiseIntermediate': 'Intermediate',
  'settings.expertiseAdvanced': 'Advanced',
  'settings.expertiseCustom': 'Custom',
  'settings.customInstructions': 'Custom Instructions',
  'settings.customInstructionPlaceholder': 'Enter custom instruction...',
  // Beside the field, where the tab holding it is not in question.
  'settings.customInstructionTooShort': 'Custom instructions must be at least {min} characters long',
  // Away from that field — the footer hint and the Save button's description
  // — where it has to name the tab as well.
  'settings.customInstructionTooShortOnAiTab': 'Custom instructions on the AI tab must be at least {min} characters long',

  // About tab, including how `describeMaidrSource` names the bundle's origin.
  'settings.maidrVersion': 'maidr.js Version',
  'settings.loadedFrom': 'Loaded From',
  'settings.browser': 'Browser',
  'settings.operatingSystem': 'Operating System',
  'settings.diagnostics': 'Diagnostics',
  'settings.copyDiagnostics': 'Copy diagnostics',
  'settings.copyDiagnosticsAria': 'Copy diagnostics to clipboard',
  'settings.copiedToClipboard': 'Copied to clipboard',
  'settings.copyFailed': 'Could not copy — select the values above and copy them manually',
  'settings.sourceLocal': 'Local assets',
  'settings.sourceInline': 'Embedded in the page',
  'settings.sourceUnknown': 'Unknown',

  // Footer. Each button's visible text and its longer accessible name.
  'settings.reset': 'Reset',
  'settings.resetAria': 'Reset Settings',
  'settings.close': 'Close',
  'settings.closeAria': 'Close Settings with no changes',
  'settings.save': 'Save & Close',
  'settings.saveAria': 'Save & Close Settings',
} as const;
