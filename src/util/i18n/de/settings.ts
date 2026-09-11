import type { MessageKey } from '../index';

export const settings = {
  // Dialog chrome: title, tablist, and the badge on a tab holding a blocked edit.
  'settings.title': 'Einstellungen',
  'settings.sections': 'Einstellungsbereiche',
  'settings.tabGeneral': 'Allgemein',
  'settings.tabAudio': 'Audio',
  'settings.tabVisual': 'Darstellung',
  'settings.tabBraille': 'Braille und Taktil',
  'settings.tabAi': 'KI',
  'settings.tabAbout': 'Info',
  // Extends a tab's name rather than replacing it, so it leads with a space.
  'settings.needsAttention': ' erfordert Aufmerksamkeit',

  // General tab.
  'settings.language': 'Sprache',
  'settings.languageAuto': 'Browserstandard',
  'settings.autoplayDurationRow': 'Dauer der automatischen Wiedergabe (ms)',
  'settings.autoplayDuration': 'Dauer der automatischen Wiedergabe',
  'settings.ariaMode': 'ARIA-Modus',
  'settings.ariaAssertive': 'Assertiv',
  'settings.ariaPolite': 'Höflich',
  'settings.hoverMode': 'Hover-Modus',
  'settings.hoverOnHover': 'Zeigen',
  'settings.hoverOnClick': 'Klicken',

  // Audio tab.
  'settings.volume': 'Lautstärke',
  'settings.minFrequencyRow': 'Minimale Frequenz (Hz)',
  'settings.minFrequency': 'Minimale Frequenz',
  'settings.maxFrequencyRow': 'Maximale Frequenz (Hz)',
  'settings.maxFrequency': 'Maximale Frequenz',
  'settings.echoCount': 'Anzahl der 3D-Echos',
  'settings.echoVolume': 'Echo-Lautstärke',
  'settings.echoDuration': 'Echo-Dauer (s)',

  // Visual tab.
  'settings.outlineColor': 'Umrissfarbe',
  'settings.highlightColor': 'Hervorhebungsfarbe',
  'settings.highContrastMode': 'Modus mit hohem Kontrast',
  'settings.on': 'An',
  'settings.off': 'Aus',
  'settings.highContrastLevels': 'Stufen für hohen Kontrast',
  'settings.highContrastLightColor': 'Helle Farbe für hohen Kontrast',
  'settings.highContrastDarkColor': 'Dunkle Farbe für hohen Kontrast',

  // Braille & Tactile tab.
  'settings.brailleDisplay': 'Braillezeile',
  'settings.brailleSingleLine': 'Einzeilig',
  'settings.brailleMultiLine': 'Mehrzeilig',
  'settings.brailleManual': 'Manuell konfigurieren',
  'settings.singleLineDisplay': 'Einzeilige Braillezeile',
  'settings.selectSingleLineDisplay': 'Wählen Sie eine einzeilige Braillezeile',
  'settings.multiLineDisplay': 'Mehrzeilige Braillezeile',
  'settings.selectMultiLineDisplay': 'Wählen Sie eine mehrzeilige Braillezeile',
  'settings.braillePresetHint': 'Ihre Braillezeile fehlt? Wählen Sie "Manuell konfigurieren".',
  'settings.manualBrailleGroup': 'Manuelle Konfiguration der Braillezeile',
  'settings.brailleDisplaySize': 'Größe der Braillezeile',
  'settings.brailleDisplaySizeHelp': 'Zellen pro Zeile auf einer physischen Braillezeile (1-{max}).',
  'settings.brailleDisplayLines': 'Zeilen der Braillezeile',
  'settings.brailleDisplayLinesHelp': 'Anzahl der Zeilen auf einer physischen Braillezeile (1-{max}). Wählen Sie mehr als 1, um die mehrzeilige Ausgabe zu aktivieren.',
  'settings.tactileDisplay': 'Taktiles Grafikdisplay',
  'settings.selectTactileDisplay': 'Wählen Sie ein taktiles Display',
  'settings.connectBluetooth': 'Über Bluetooth verbinden',
  'settings.connectUsb': 'Über USB verbinden',
  'settings.disconnect': 'Trennen',

  // How the tactile display's connection is announced. Every branch says what
  // the reader can do next.
  'settings.tactileConnectedBluetooth': 'Verbunden mit {device} über Bluetooth. Drücken Sie im Diagramm b, um es dort anzuzeigen.',
  'settings.tactileConnectedUsb': 'Verbunden mit {device} über USB. Drücken Sie im Diagramm b, um es dort anzuzeigen.',
  'settings.tactileGenericDevice': 'einem taktilen Display',
  'settings.tactileConnecting': 'Verbindung wird hergestellt…',
  'settings.tactileRetry': '{message} Wählen Sie das Gerät erneut aus, um es noch einmal zu versuchen.',
  'settings.tactileNotConnected': 'Nicht verbunden.',

  // Braille display presets, as the pickers list them.
  'settings.braillePresetSingle': '{label} — {manufacturer} ({cells} Zellen)',
  'settings.braillePresetMulti': '{label} — {manufacturer} ({lines} Zeilen × {cells} Zellen)',

  // AI tab. `{name}` is the provider's own name and is never translated.
  'settings.enableProvider': '{name} aktivieren',
  'settings.providerApiKey': '{name} API-Schlüssel',
  'settings.providerServerUrl': '{name} Server-URL',
  'settings.providerModelVersion': '{name} Modellversion',
  'settings.apiKeyPlaceholder': '{name} API-Schlüssel eingeben',
  'settings.ollamaUrlPlaceholder': 'URL des Ollama-Servers eingeben (z. B. http://localhost:11434)',
  'settings.checkingOllamaServerHelp': 'Ollama-Server wird geprüft...',
  'settings.validatingApiKeyHelp': 'API-Schlüssel wird geprüft...',
  'settings.ollamaUnreachableHelp': 'Der Ollama-Server ist nicht erreichbar. Stellen Sie sicher, dass Ollama läuft und dass OLLAMA_ORIGINS diese Seite zulässt, wenn die Seite nicht auf localhost liegt.',
  'settings.providerApiKeyInvalid': '{name} API-Schlüssel ist ungültig',
  'settings.ollamaReachable': 'Ollama-Server ist erreichbar',
  'settings.providerApiKeyValid': '{name} API-Schlüssel ist gültig',
  'settings.checkingOllamaServer': 'Ollama-Server wird geprüft',
  'settings.validatingApiKey': 'API-Schlüssel wird geprüft',
  'settings.apiKeyValid': 'API-Schlüssel ist gültig',
  'settings.ollamaUnreachable': 'Ollama-Server ist nicht erreichbar',
  'settings.apiKeyInvalid': 'API-Schlüssel ist ungültig',
  'settings.modelRetired': '"{version}" steht nicht in der aktuellen Modellliste von {name} — möglicherweise wurde es eingestellt. Wählen Sie gegebenenfalls ein anderes Modell.',
  'settings.expertiseLevel': 'Kenntnisstand',
  'settings.expertiseBasic': 'Grundlagen',
  'settings.expertiseIntermediate': 'Fortgeschritten',
  'settings.expertiseAdvanced': 'Experte',
  'settings.expertiseCustom': 'Benutzerdefiniert',
  'settings.customInstructions': 'Benutzerdefinierte Anweisungen',
  'settings.customInstructionPlaceholder': 'Benutzerdefinierte Anweisung eingeben...',
  // Beside the field, where the tab holding it is not in question.
  'settings.customInstructionTooShort': 'Benutzerdefinierte Anweisungen müssen mindestens {min} Zeichen lang sein',
  // Away from that field, where it has to name the tab as well.
  'settings.customInstructionTooShortOnAiTab': 'Benutzerdefinierte Anweisungen auf der Registerkarte KI müssen mindestens {min} Zeichen lang sein',

  // About tab, including how `describeMaidrSource` names the bundle's origin.
  'settings.maidrVersion': 'maidr.js-Version',
  'settings.loadedFrom': 'Geladen von',
  'settings.browser': 'Browser',
  'settings.operatingSystem': 'Betriebssystem',
  'settings.diagnostics': 'Diagnose',
  'settings.copyDiagnostics': 'Diagnose kopieren',
  'settings.copyDiagnosticsAria': 'Diagnose in die Zwischenablage kopieren',
  'settings.copiedToClipboard': 'In die Zwischenablage kopiert',
  'settings.copyFailed': 'Kopieren nicht möglich — markieren Sie die Werte oben und kopieren Sie sie manuell',
  'settings.sourceLocal': 'Lokale Dateien',
  'settings.sourceInline': 'In die Seite eingebettet',
  'settings.sourceUnknown': 'Unbekannt',

  // Footer. Each button's visible text and its longer accessible name.
  'settings.reset': 'Zurücksetzen',
  'settings.resetAria': 'Einstellungen zurücksetzen',
  'settings.close': 'Schließen',
  'settings.closeAria': 'Einstellungen ohne Änderungen schließen',
  'settings.save': 'Speichern und schließen',
  'settings.saveAria': 'Einstellungen speichern und schließen',
} satisfies Partial<Record<MessageKey, string>>;
