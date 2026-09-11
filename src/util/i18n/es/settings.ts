import type { MessageKey } from '../index';

/** Spanish renderings of everything the settings dialog says, plus the labels it borrows from utils. */
export const settings = {
  // Dialog chrome: title, tablist, and the badge on a tab holding a blocked edit.
  'settings.title': 'Configuración',
  'settings.sections': 'Secciones de la configuración',
  'settings.tabGeneral': 'General',
  'settings.tabAudio': 'Audio',
  'settings.tabVisual': 'Visual',
  'settings.tabBraille': 'Braille y táctil',
  'settings.tabAi': 'IA',
  'settings.tabAbout': 'Acerca de',
  // Extends a tab's name rather than replacing it, so it leads with a space:
  // an accessible name is the concatenation of the contents.
  'settings.needsAttention': ' requiere atención',

  // General tab.
  'settings.language': 'Idioma',
  'settings.languageAuto': 'Predeterminado del navegador',
  'settings.autoplayDurationRow': 'Duración de la reproducción automática (ms)',
  'settings.autoplayDuration': 'Duración de la reproducción automática',
  'settings.ariaMode': 'Modo ARIA',
  'settings.ariaAssertive': 'Asertivo',
  'settings.ariaPolite': 'Cortés',
  'settings.hoverMode': 'Modo de activación con el puntero',
  'settings.hoverOnHover': 'Al pasar el puntero',
  'settings.hoverOnClick': 'Al hacer clic',

  // Audio tab.
  'settings.volume': 'Volumen',
  'settings.minFrequencyRow': 'Frecuencia mínima (Hz)',
  'settings.minFrequency': 'Frecuencia mínima',
  'settings.maxFrequencyRow': 'Frecuencia máxima (Hz)',
  'settings.maxFrequency': 'Frecuencia máxima',
  'settings.echoCount': 'Número de ecos 3D',
  'settings.echoVolume': 'Volumen del eco',
  'settings.echoDuration': 'Duración del eco (s)',

  // Visual tab.
  'settings.outlineColor': 'Color del contorno',
  'settings.highlightColor': 'Color de resaltado',
  'settings.highContrastMode': 'Modo de alto contraste',
  'settings.on': 'Activado',
  'settings.off': 'Desactivado',
  'settings.highContrastLevels': 'Niveles de alto contraste',
  'settings.highContrastLightColor': 'Color claro de alto contraste',
  'settings.highContrastDarkColor': 'Color oscuro de alto contraste',

  // Braille & Tactile tab.
  'settings.brailleDisplay': 'Pantalla braille',
  'settings.brailleSingleLine': 'Una línea',
  'settings.brailleMultiLine': 'Varias líneas',
  'settings.brailleManual': 'Configurar manualmente',
  'settings.singleLineDisplay': 'Pantalla de una línea',
  'settings.selectSingleLineDisplay': 'Seleccione una pantalla de una línea',
  'settings.multiLineDisplay': 'Pantalla de varias líneas',
  'settings.selectMultiLineDisplay': 'Seleccione una pantalla de varias líneas',
  'settings.braillePresetHint': '¿No encuentra su pantalla? Elija "Configurar manualmente".',
  'settings.manualBrailleGroup': 'Configuración manual de la pantalla braille',
  'settings.brailleDisplaySize': 'Tamaño de la pantalla braille',
  'settings.brailleDisplaySizeHelp': 'Celdas por fila de una pantalla braille física (de 1 a {max}).',
  'settings.brailleDisplayLines': 'Líneas de la pantalla braille',
  'settings.brailleDisplayLinesHelp': 'Número de filas de una pantalla braille física (de 1 a {max}). Indique más de 1 para habilitar la salida en varias líneas.',
  'settings.tactileDisplay': 'Dispositivo de gráficos táctiles',
  'settings.selectTactileDisplay': 'Seleccione un dispositivo táctil',
  'settings.connectBluetooth': 'Conectar por Bluetooth',
  'settings.connectUsb': 'Conectar por USB',
  'settings.disconnect': 'Desconectar',

  // How the tactile display's connection is announced. Every branch says what
  // the reader can do next.
  'settings.tactileConnectedBluetooth': 'Conectado a {device} por Bluetooth. Presione b en el gráfico para mostrarlo.',
  'settings.tactileConnectedUsb': 'Conectado a {device} por USB. Presione b en el gráfico para mostrarlo.',
  'settings.tactileGenericDevice': 'un dispositivo táctil',
  'settings.tactileConnecting': 'Conectando…',
  'settings.tactileRetry': '{message} Vuelva a seleccionar el dispositivo para reintentar.',
  'settings.tactileNotConnected': 'No conectado.',

  // Braille display presets, as the pickers list them.
  'settings.braillePresetSingle': '{label}, {manufacturer}, {cells} celdas',
  'settings.braillePresetMulti': '{label}, {manufacturer}, {lines} líneas de {cells} celdas',

  // AI tab. `{name}` is the provider's own name and is never translated.
  'settings.enableProvider': 'Habilitar {name}',
  'settings.providerApiKey': 'Clave de API de {name}',
  'settings.providerServerUrl': 'URL del servidor de {name}',
  'settings.providerModelVersion': 'Versión del modelo de {name}',
  'settings.apiKeyPlaceholder': 'Introduzca la clave de API de {name}',
  'settings.ollamaUrlPlaceholder': 'Introduzca la URL del servidor de Ollama, por ejemplo http://localhost:11434',
  'settings.checkingOllamaServerHelp': 'Comprobando el servidor de Ollama...',
  'settings.validatingApiKeyHelp': 'Validando la clave de API...',
  'settings.ollamaUnreachableHelp': 'No se puede conectar con el servidor de Ollama. Asegúrese de que Ollama esté en ejecución y, en páginas que no sean localhost, de que OLLAMA_ORIGINS permita este sitio.',
  'settings.providerApiKeyInvalid': 'La clave de API de {name} no es válida',
  'settings.ollamaReachable': 'El servidor de Ollama está accesible',
  'settings.providerApiKeyValid': 'La clave de API de {name} es válida',
  'settings.checkingOllamaServer': 'Comprobando el servidor de Ollama',
  'settings.validatingApiKey': 'Validando la clave de API',
  'settings.apiKeyValid': 'La clave de API es válida',
  'settings.ollamaUnreachable': 'No se puede conectar con el servidor de Ollama',
  'settings.apiKeyInvalid': 'La clave de API no es válida',
  'settings.modelRetired': '"{version}" no figura en la lista actual de modelos de {name}; es posible que se haya retirado. Considere seleccionar otro modelo.',
  'settings.expertiseLevel': 'Nivel de experiencia',
  'settings.expertiseBasic': 'Básico',
  'settings.expertiseIntermediate': 'Intermedio',
  'settings.expertiseAdvanced': 'Avanzado',
  'settings.expertiseCustom': 'Personalizado',
  'settings.customInstructions': 'Instrucciones personalizadas',
  'settings.customInstructionPlaceholder': 'Introduzca una instrucción personalizada...',
  // Beside the field, where the tab holding it is not in question.
  'settings.customInstructionTooShort': 'Las instrucciones personalizadas deben tener al menos {min} caracteres',
  // Away from that field — the footer hint and the Save button's description
  // — where it has to name the tab as well.
  'settings.customInstructionTooShortOnAiTab': 'Las instrucciones personalizadas de la pestaña IA deben tener al menos {min} caracteres',

  // About tab, including how `describeMaidrSource` names the bundle's origin.
  'settings.maidrVersion': 'Versión de maidr.js',
  'settings.loadedFrom': 'Cargado desde',
  'settings.browser': 'Navegador',
  'settings.operatingSystem': 'Sistema operativo',
  'settings.diagnostics': 'Diagnóstico',
  'settings.copyDiagnostics': 'Copiar el diagnóstico',
  'settings.copyDiagnosticsAria': 'Copiar el diagnóstico al portapapeles',
  'settings.copiedToClipboard': 'Copiado al portapapeles',
  'settings.copyFailed': 'No se pudo copiar; seleccione los valores de arriba y cópielos manualmente',
  'settings.sourceLocal': 'Recursos locales',
  'settings.sourceInline': 'Incrustado en la página',
  'settings.sourceUnknown': 'Desconocido',

  // Footer. Each button's visible text and its longer accessible name.
  'settings.reset': 'Restablecer',
  'settings.resetAria': 'Restablecer la configuración',
  'settings.close': 'Cerrar',
  'settings.closeAria': 'Cerrar la configuración sin cambios',
  'settings.save': 'Guardar y cerrar',
  'settings.saveAria': 'Guardar y cerrar la configuración',
} satisfies Partial<Record<MessageKey, string>>;
