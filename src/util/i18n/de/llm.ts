import type { MessageKey } from '../index';

export const llm = {
  // Transcript.
  'llm.welcome': 'Willkommen beim Diagramm-Assistenten. Über die Auswahllisten unten können Sie verschiedene KI-Modelle auswählen und zwischen ihnen wechseln. Derzeit aktiviert: {models}.',
  'llm.welcomeNoAgents': 'Es sind keine Agenten aktiviert. Bitte aktivieren Sie auf der Einstellungsseite mindestens einen Agenten und geben Sie einen API-Schlüssel oder einen lokalen Ollama-Server an.',
  'llm.processing': 'Anfrage wird verarbeitet...',
  'llm.messageError': 'Fehler: {error}',
  'llm.fallbackModelName': 'KI-Assistent',

  // Suggested follow-up questions.
  'llm.suggestionExplain': 'Können Sie das genauer erklären?',
  'llm.suggestionCurrentPoint': 'Was können Sie zum aktuellen Datenpunkt sagen?',
  'llm.suggestionCompare': 'Wie verhält sich das im Vergleich zu anderen Datenpunkten?',
  'llm.suggestionStatistics': 'Können Sie eine statistische Analyse dieser Daten durchführen?',
  'llm.suggestionOutliers': 'Welche möglichen Ausreißer gibt es in diesem Datensatz?',

  // Request failures.
  'llm.errorProcessing': 'Fehler bei der Verarbeitung der Anfrage',
  'llm.errorUnknown': 'Ein unbekannter Fehler ist aufgetreten',
  'llm.errorResponseUnavailable': 'Antwort nicht verfügbar',
  'llm.errorAborted': 'Chat-Anfrage abgebrochen',
  'llm.errorInvalidFormat': 'Ungültiges Antwortformat',
  'llm.errorApi': 'API-Fehler: {status} - {statusText}',

  // Provider and credential failures.
  'llm.errorGeminiKeyRequired': 'Für die Gemini-API ist ein API-Schlüssel erforderlich',
  'llm.errorOllamaUrl': 'Ungültige URL des Ollama-Servers: Sie muss mit http:// oder https:// beginnen',
  'llm.errorOllamaProxy': 'Ollama-Anfragen können nicht über den MAIDR-Proxy geleitet werden',
  'llm.errorOllamaUnreachable': 'Der Ollama-Server ist nicht erreichbar. Stellen Sie sicher, dass Ollama läuft und dass OLLAMA_ORIGINS diese Seite zulässt, wenn die Seite nicht auf localhost liegt.',
  'llm.errorInvalidModelKey': 'Ungültiger Modellschlüssel',
  'llm.errorProviderTimeout': 'Der Anbieter hat nicht rechtzeitig geantwortet. Prüfen Sie Ihre Netzwerkverbindung und versuchen Sie es erneut.',
  'llm.errorProviderUnreachable': 'Der Anbieter konnte nicht erreicht werden. Prüfen Sie Ihre Netzwerkverbindung.',
  'llm.errorInvalidApiKey': 'Ungültiger API-Schlüssel',
  'llm.errorProviderStatus': 'Der Anbieter hat {status} zurückgegeben. Das liegt nicht an Ihrem Schlüssel; versuchen Sie es später erneut.',
} satisfies Partial<Record<MessageKey, string>>;
