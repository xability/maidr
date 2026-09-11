import type { MessageKey } from '../index';

export const llm = {
  'llm.welcome': 'Le diamo il benvenuto nell\'Assistente del grafico. È possibile selezionare e cambiare i modelli IA con i menu a discesa qui sotto. Attualmente abilitati: {models}.',
  'llm.welcomeNoAgents': 'Nessun agente è abilitato. Abilitare almeno un agente e fornire una chiave API, oppure un server Ollama locale, nella pagina delle impostazioni.',
  'llm.processing': 'Elaborazione della richiesta...',
  'llm.messageError': 'Errore: {error}',
  'llm.fallbackModelName': 'Assistente IA',

  'llm.suggestionExplain': 'Può spiegarlo più in dettaglio?',
  'llm.suggestionCurrentPoint': 'Cosa può dire del punto dati corrente?',
  'llm.suggestionCompare': 'Come si confronta con gli altri punti dati?',
  'llm.suggestionStatistics': 'Può eseguire un\'analisi statistica di questi dati?',
  'llm.suggestionOutliers': 'Quali sono i possibili valori anomali in questo insieme di dati?',

  'llm.errorProcessing': 'Errore durante l\'elaborazione della richiesta',
  'llm.errorUnknown': 'Si è verificato un errore sconosciuto',
  'llm.errorResponseUnavailable': 'Risposta non disponibile',
  'llm.errorAborted': 'Richiesta della chat interrotta',
  'llm.errorInvalidFormat': 'Formato della risposta non valido',
  'llm.errorApi': 'Errore API: {status} - {statusText}',

  'llm.errorGeminiKeyRequired': 'Per l\'API Gemini è richiesta una chiave API',
  'llm.errorOllamaUrl': 'URL del server Ollama non valido: deve iniziare con http:// o https://',
  'llm.errorOllamaProxy': 'Le richieste a Ollama non possono passare attraverso il proxy MAIDR',
  'llm.errorOllamaUnreachable': 'Impossibile raggiungere il server Ollama. Verificare che Ollama sia in esecuzione e, per le pagine non su localhost, che OLLAMA_ORIGINS consenta questo sito.',
  'llm.errorInvalidModelKey': 'Chiave del modello non valida',
  'llm.errorProviderTimeout': 'Il provider non ha risposto in tempo. Verificare la connessione di rete e riprovare.',
  'llm.errorProviderUnreachable': 'Impossibile raggiungere il provider. Verificare la connessione di rete.',
  'llm.errorInvalidApiKey': 'Chiave API non valida',
  'llm.errorProviderStatus': 'Il provider ha restituito {status}. Non è un problema della chiave; riprovare più tardi.',
} satisfies Partial<Record<MessageKey, string>>;
