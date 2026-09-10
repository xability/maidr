/**
 * What the AI assistant says on its own account: the welcome message, the
 * suggested follow-ups, and every failure the chat and the credential probe
 * can report.
 */
export const llm = {
  // Transcript.
  'llm.welcome': 'Welcome to the Chart Assistant. You can select and switch between different AI models using the dropdowns below. Currently enabled: {models}.',
  'llm.welcomeNoAgents': 'No agents are enabled. Please enable at least one agent and provide an API key (or a local Ollama server) in the settings page.',
  'llm.processing': 'Processing request...',
  'llm.messageError': 'Error: {error}',
  'llm.fallbackModelName': 'AI Assistant',

  // Suggested follow-up questions.
  'llm.suggestionExplain': 'Can you explain that in more detail?',
  'llm.suggestionCurrentPoint': 'What can you say about the current datapoint?',
  'llm.suggestionCompare': 'How does this compare to other data points?',
  'llm.suggestionStatistics': 'Can you perform a statistical analysis of this data?',
  'llm.suggestionOutliers': 'What are the potential outliers in this dataset?',

  // Request failures.
  'llm.errorProcessing': 'Error processing request',
  'llm.errorUnknown': 'Unknown error occurred',
  'llm.errorResponseUnavailable': 'Response unavailable',
  'llm.errorAborted': 'Chat request aborted',
  'llm.errorInvalidFormat': 'Invalid response format',
  'llm.errorApi': 'API Error: {status} - {statusText}',

  // Provider and credential failures.
  'llm.errorGeminiKeyRequired': 'API key is required for Gemini API',
  'llm.errorOllamaUrl': 'Invalid Ollama server URL: it must start with http:// or https://',
  'llm.errorOllamaProxy': 'Ollama requests cannot be routed through the MAIDR proxy',
  'llm.errorOllamaUnreachable': 'Cannot reach Ollama server. Make sure Ollama is running and, for non-localhost pages, that OLLAMA_ORIGINS allows this site.',
  'llm.errorInvalidModelKey': 'Invalid model key',
  'llm.errorProviderTimeout': 'The provider did not respond in time. Check your network connection and try again.',
  'llm.errorProviderUnreachable': 'Could not reach the provider. Check your network connection.',
  'llm.errorInvalidApiKey': 'Invalid API key',
  'llm.errorProviderStatus': 'The provider returned {status}. This is not a problem with your key; try again later.',
} as const;
