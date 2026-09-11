import type { MessageKey } from '../index';

export const dialogs = {
  // Chat dialog.
  'dialogs.chatTitle': 'Diagramm-Assistent',
  'dialogs.chatClose': 'Chat-Dialog schließen',
  'dialogs.chatMessagesRegion': 'Chat-Nachrichten',
  'dialogs.chatInputRegion': 'Nachrichteneingabe',
  'dialogs.chatPlaceholder': 'Wobei kann ich Ihnen helfen?',
  'dialogs.chatInputLabel': 'Geben Sie Ihre Nachricht an den KI-Assistenten ein',
  'dialogs.chatSend': 'Nachricht an den KI-Assistenten senden',
  'dialogs.chatSuggestionsRegion': 'Vorgeschlagene Antworten',
  'dialogs.chatSuggestion': 'Vorschlag: {text}',

  // One message in the transcript.
  'dialogs.chatUserMessage': 'Ihre Nachricht',
  'dialogs.chatAssistantMessage': 'Nachricht des KI-Assistenten',
  'dialogs.chatMessageFrom': ' von {model}',
  'dialogs.chatMessageTyping': ' (schreibt)',
  'dialogs.chatModelName': 'Modell: {model}',
  'dialogs.chatOpenSettings': 'Einstellungen öffnen',
  'dialogs.chatOpenSettingsLabel': 'Einstellungen öffnen',
  'dialogs.chatSentAt': 'Gesendet um {time}',
  'dialogs.chatTyping': 'KI schreibt',
  'dialogs.chatCodeBlock': 'Codeblock',
  'dialogs.chatImageAlt': 'Bild in der Nachricht',
  'dialogs.chatSelectVersion': '{name}-Version auswählen',

  // Go To (extrema) dialog.
  'dialogs.extremaTitle': 'Gehe zu',
  'dialogs.extremaClose': 'Dialog schließen',
  'dialogs.extremaDescription': 'Zu interessanten Punkten im aktuellen Diagramm vom Typ {traceType} navigieren',
  'dialogs.extremaDescriptionFallback': 'Zu interessanten Punkten navigieren',
  'dialogs.extremaTargets': 'Navigationsziele',
  'dialogs.extremaXValues': 'Verfügbare X-Werte',
  'dialogs.extremaSearchOption': 'Bestimmten X-Wert suchen und ansteuern',
  'dialogs.extremaSearchCombobox': 'X-Wert suchen und auswählen',
  'dialogs.extremaSearchLabel': 'X-Werte suchen',
  'dialogs.extremaSearchPlaceholder': 'Tippen Sie, um {count} Werte zu durchsuchen',
  'dialogs.extremaOpenDropdown': 'Auswahlliste öffnen',
  'dialogs.extremaCloseDropdown': 'Auswahlliste schließen',

  // Extrema target labels.
  'dialogs.extremaPointIntersection': 'Schnittpunkt am Datenpunkt',
  'dialogs.extremaSlopeIntersection': 'Schnittpunkt zwischen Datenpunkten',
  'dialogs.extremaIntersection': 'Schnittpunkt',
  'dialogs.extremaIntersectionAt': '{prefix} mit {otherLines} bei {coords}',
  'dialogs.extremaValueAt': '{label} Wert: {value} bei {x}',
  'dialogs.extremaValue': '{label} Wert: {value}',

  'dialogs.extremaCell': '{x}, {y}',

  // What focus does not announce on its own.
  'dialogs.extremaMovedToSearch': 'Zur Suche gewechselt. Tippen Sie, um die X-Werte zu filtern.',
  'dialogs.extremaFirstOption': 'Bei der ersten Extremwert-Option',
  'dialogs.extremaNoResults': 'Keine Suchergebnisse',
  'dialogs.extremaLastResult': 'Beim letzten Suchergebnis',
  'dialogs.extremaSelectedResult': 'Ausgewählt: {label}',
  'dialogs.extremaReturningTo': 'Zurück zu den Extremwert-Optionen: {label}',
  'dialogs.extremaReturning': 'Zurück zu den Extremwert-Optionen',
} satisfies Partial<Record<MessageKey, string>>;
