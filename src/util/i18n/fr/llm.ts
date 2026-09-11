import type { MessageKey } from '../index';

export const llm = {
  'llm.welcome': 'Bienvenue dans l\'Assistant graphique. Vous pouvez sélectionner différents modèles d\'IA et passer de l\'un à l\'autre à l\'aide des listes déroulantes ci-dessous. Actuellement activés : {models}.',
  'llm.welcomeNoAgents': 'Aucun agent n\'est activé. Veuillez activer au moins un agent et fournir une clé API (ou un serveur Ollama local) dans la page des paramètres.',
  'llm.processing': 'Traitement de la demande...',
  'llm.messageError': 'Erreur : {error}',
  'llm.fallbackModelName': 'Assistant IA',

  'llm.suggestionExplain': 'Pouvez-vous expliquer cela plus en détail ?',
  'llm.suggestionCurrentPoint': 'Que pouvez-vous dire du point de données actuel ?',
  'llm.suggestionCompare': 'Comment se compare-t-il aux autres points de données ?',
  'llm.suggestionStatistics': 'Pouvez-vous faire une analyse statistique de ces données ?',
  'llm.suggestionOutliers': 'Quelles sont les valeurs aberrantes potentielles de ce jeu de données ?',

  'llm.errorProcessing': 'Erreur lors du traitement de la demande',
  'llm.errorUnknown': 'Une erreur inconnue est survenue',
  'llm.errorResponseUnavailable': 'Réponse indisponible',
  'llm.errorAborted': 'Demande de discussion annulée',
  'llm.errorInvalidFormat': 'Format de réponse non valide',
  'llm.errorApi': 'Erreur API : {status} - {statusText}',

  'llm.errorGeminiKeyRequired': 'Une clé API est requise pour l\'API Gemini',
  'llm.errorOllamaUrl': 'URL du serveur Ollama non valide : elle doit commencer par http:// ou https://',
  'llm.errorOllamaProxy': 'Les requêtes Ollama ne peuvent pas passer par le proxy MAIDR',
  'llm.errorOllamaUnreachable': 'Impossible de joindre le serveur Ollama. Vérifiez qu\'Ollama est en cours d\'exécution et, pour les pages hors localhost, qu\'OLLAMA_ORIGINS autorise ce site.',
  'llm.errorInvalidModelKey': 'Clé de modèle non valide',
  'llm.errorProviderTimeout': 'Le fournisseur n\'a pas répondu à temps. Vérifiez votre connexion réseau et réessayez.',
  'llm.errorProviderUnreachable': 'Impossible de joindre le fournisseur. Vérifiez votre connexion réseau.',
  'llm.errorInvalidApiKey': 'Clé API non valide',
  'llm.errorProviderStatus': 'Le fournisseur a renvoyé {status}. Ce n\'est pas un problème lié à votre clé ; réessayez plus tard.',
} satisfies Partial<Record<MessageKey, string>>;
