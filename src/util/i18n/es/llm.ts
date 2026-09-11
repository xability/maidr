import type { MessageKey } from '../index';

/**
 * Spanish renderings of what the AI assistant says on its own account: the
 * welcome message, the suggested follow-ups, and every failure the chat and
 * the credential probe can report.
 */
export const llm = {
  // Transcript.
  'llm.welcome': 'Le damos la bienvenida al Asistente de gráficos. Puede seleccionar distintos modelos de IA y cambiar entre ellos con las listas desplegables de abajo. Habilitados actualmente: {models}.',
  'llm.welcomeNoAgents': 'No hay agentes habilitados. Habilite al menos un agente e indique una clave de API o un servidor local de Ollama en la página de configuración.',
  'llm.processing': 'Procesando la solicitud...',
  'llm.messageError': 'Error: {error}',
  'llm.fallbackModelName': 'Asistente de IA',

  // Suggested follow-up questions.
  'llm.suggestionExplain': '¿Puede explicarlo con más detalle?',
  'llm.suggestionCurrentPoint': '¿Qué puede decir sobre el punto de datos actual?',
  'llm.suggestionCompare': '¿Cómo se compara con los demás puntos de datos?',
  'llm.suggestionStatistics': '¿Puede hacer un análisis estadístico de estos datos?',
  'llm.suggestionOutliers': '¿Cuáles son los posibles valores atípicos de este conjunto de datos?',

  // Request failures.
  'llm.errorProcessing': 'Error al procesar la solicitud',
  'llm.errorUnknown': 'Ocurrió un error desconocido',
  'llm.errorResponseUnavailable': 'Respuesta no disponible',
  'llm.errorAborted': 'Solicitud de chat cancelada',
  'llm.errorInvalidFormat': 'Formato de respuesta no válido',
  'llm.errorApi': 'Error de API: {status}, {statusText}',

  // Provider and credential failures.
  'llm.errorGeminiKeyRequired': 'Se requiere una clave de API para la API de Gemini',
  'llm.errorOllamaUrl': 'La URL del servidor de Ollama no es válida: debe comenzar con http:// o https://',
  'llm.errorOllamaProxy': 'Las solicitudes a Ollama no pueden enrutarse a través del proxy de MAIDR',
  'llm.errorOllamaUnreachable': 'No se puede conectar con el servidor de Ollama. Asegúrese de que Ollama esté en ejecución y, en páginas que no sean localhost, de que OLLAMA_ORIGINS permita este sitio.',
  'llm.errorInvalidModelKey': 'Clave de modelo no válida',
  'llm.errorProviderTimeout': 'El proveedor no respondió a tiempo. Compruebe su conexión de red e inténtelo de nuevo.',
  'llm.errorProviderUnreachable': 'No se pudo conectar con el proveedor. Compruebe su conexión de red.',
  'llm.errorInvalidApiKey': 'Clave de API no válida',
  'llm.errorProviderStatus': 'El proveedor devolvió {status}. No es un problema de su clave; inténtelo de nuevo más tarde.',
} satisfies Partial<Record<MessageKey, string>>;
