import type { MessageKey } from '../index';

/**
 * Spanish renderings of the chrome of the dialogs: what names a dialog, its
 * regions and its controls, and what its live regions announce.
 */
export const dialogs = {
  // Chat dialog.
  'dialogs.chatTitle': 'Asistente de gráficos',
  'dialogs.chatClose': 'Cerrar el diálogo de chat',
  'dialogs.chatMessagesRegion': 'Mensajes del chat',
  'dialogs.chatInputRegion': 'Entrada de mensaje',
  'dialogs.chatPlaceholder': '¿En qué puedo ayudarle?',
  'dialogs.chatInputLabel': 'Escriba su mensaje para el asistente de IA',
  'dialogs.chatSend': 'Enviar el mensaje al asistente de IA',
  'dialogs.chatSuggestionsRegion': 'Respuestas sugeridas',
  'dialogs.chatSuggestion': 'Sugerencia: {text}',

  // One message in the transcript.
  'dialogs.chatUserMessage': 'Su mensaje',
  'dialogs.chatAssistantMessage': 'Mensaje del asistente de IA',
  'dialogs.chatMessageFrom': ' de {model}',
  'dialogs.chatMessageTyping': ' (escribiendo)',
  'dialogs.chatModelName': 'Modelo: {model}',
  'dialogs.chatOpenSettings': 'Abrir configuración',
  'dialogs.chatOpenSettingsLabel': 'Abrir la configuración',
  'dialogs.chatSentAt': 'Enviado a las {time}',
  'dialogs.chatTyping': 'La IA está escribiendo',
  'dialogs.chatCodeBlock': 'Bloque de código',
  'dialogs.chatImageAlt': 'Imagen en el mensaje',
  'dialogs.chatSelectVersion': 'Seleccionar la versión de {name}',

  // Go To (extrema) dialog.
  'dialogs.extremaTitle': 'Ir a',
  'dialogs.extremaClose': 'Cerrar el diálogo',
  'dialogs.extremaDescription': 'Navegue a los puntos de interés del gráfico actual de tipo {traceType}',
  'dialogs.extremaDescriptionFallback': 'Navegue a los puntos de interés',
  'dialogs.extremaTargets': 'Destinos de navegación',
  'dialogs.extremaXValues': 'Valores de X disponibles',
  'dialogs.extremaSearchOption': 'Buscar y navegar a un valor de X concreto',
  'dialogs.extremaSearchCombobox': 'Buscar y seleccionar un valor de X',
  'dialogs.extremaSearchLabel': 'Buscar valores de X',
  'dialogs.extremaSearchPlaceholder': 'Escriba para buscar entre {count} valores',
  'dialogs.extremaOpenDropdown': 'Abrir la lista desplegable',
  'dialogs.extremaCloseDropdown': 'Cerrar la lista desplegable',

  // Extrema target labels.
  'dialogs.extremaPointIntersection': 'Intersección de puntos',
  'dialogs.extremaSlopeIntersection': 'Intersección de pendientes',
  'dialogs.extremaIntersection': 'Intersección',
  'dialogs.extremaIntersectionAt': '{prefix} con {otherLines} en {coords}',
  'dialogs.extremaValueAt': '{label}, valor: {value} en {x}',
  'dialogs.extremaValue': '{label}, valor: {value}',

  'dialogs.extremaCell': '{x}, {y}',

  // What focus does not announce on its own.
  'dialogs.extremaMovedToSearch': 'Se movió a la búsqueda. Escriba para filtrar los valores de X.',
  'dialogs.extremaFirstOption': 'En la primera opción de valores extremos',
  'dialogs.extremaNoResults': 'Sin resultados de búsqueda',
  'dialogs.extremaLastResult': 'En el último resultado de búsqueda',
  'dialogs.extremaSelectedResult': 'Seleccionado: {label}',
  'dialogs.extremaReturningTo': 'Volviendo a las opciones de valores extremos: {label}',
  'dialogs.extremaReturning': 'Volviendo a las opciones de valores extremos',
} satisfies Partial<Record<MessageKey, string>>;
