import type { MessageKey } from '../index';

export const notification = {
  // Autoplay speed.
  'notification.speedUp': 'Schneller',
  'notification.maxSpeed': 'Höchstgeschwindigkeit',
  'notification.speedDown': 'Langsamer',
  'notification.minSpeed': 'Mindestgeschwindigkeit',
  'notification.resetSpeed': 'Geschwindigkeit zurückgesetzt',

  // Sonification. The mode word is a message of its own so the sentence can be
  // shaped differently per language.
  'notification.soundIs': 'Ton ist {mode}',
  'notification.audioModeOff': 'aus',
  'notification.audioModeOn': 'an',
  'notification.audioModeCombined': 'kombiniert',
  'notification.audioModeSeparate': 'getrennt',

  // Braille.
  'notification.brailleIsOn': 'Braille ist an',
  'notification.brailleIsOff': 'Braille ist aus',
  'notification.brailleNoInfo': 'Keine Informationen für Braille',
  'notification.brailleNotSupported': 'Braille wird für den Diagrammtyp {type} nicht unterstützt',
  'notification.brailleDisplay': 'Braillezeile',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': 'Die Überwachung ist nur bei Live-Diagrammen verfügbar',
  'notification.monitoringOn': 'Überwachung an',
  'notification.monitoringOff': 'Überwachung aus',

  // High contrast.
  'notification.highContrastOn': 'Modus mit hohem Kontrast an',
  'notification.highContrastOff': 'Modus mit hohem Kontrast aus',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': 'Der Referenzvergleich ist nur in Kerzendiagrammen verfügbar.',
  'notification.deltaNeedsLineLayer': 'Der Referenzvergleich ist nur in Kerzendiagrammen mit einer Linienebene verfügbar.',
  'notification.deltaReferenceUnavailable': 'Die ausgewählte Referenzlinie ist nicht verfügbar.',
  'notification.deltaNoMatchingX': 'Keine übereinstimmenden X-Werte zwischen dem Kerzendiagramm und {reference}.',
  'notification.deltaKeepingComparison': 'Der aktuelle Vergleich bleibt bestehen: {reference} reicht nicht bis {x}. Wechseln Sie zu einer Kerze, die davon abgedeckt wird, und wählen Sie sie dann erneut.',
  'notification.deltaNoComparisonAtX': 'Kein Referenzvergleich bei {x}: {reference} reicht nicht bis zu dieser Kerze. Wechseln Sie zu einer Kerze, die der gleitende Durchschnitt abdeckt, und drücken Sie dann Alt L.',
  'notification.deltaActivationFailed': 'Der Referenzvergleich konnte hier nicht aktiviert werden.',
  'notification.deltaActivated': 'Referenzvergleich an: OHLC-Kurs minus {reference}, {count} Punkte, beginnend bei {field}. Positive Werte liegen über der Linie, negative darunter. Verwenden Sie die Pfeiltasten links und rechts, um zwischen den Kerzen zu wechseln, und die Pfeiltasten auf und ab, um zwischen Eröffnung, Hoch, Tief und Schluss zu wechseln. Drücken Sie Alt L, um den Vergleich auszuschalten, G für Extremwerte und den Rotor, um Punkte über, unter oder auf der Linie zu durchsuchen. Drücken Sie Escape, um zum Diagramm zurückzukehren.',
  'notification.deltaClosed': 'Referenzvergleich geschlossen. Zurück zur Diagrammebene. Drücken Sie Alt L, um erneut zu vergleichen.',
  'notification.deltaClosedByUpdate': 'Der Referenzvergleich wurde durch eine Datenaktualisierung geschlossen.',
  'notification.deltaNoReferenceChosen': 'Noch keine Referenzlinie gewählt. Wählen Sie in der Liste eine Linie des gleitenden Durchschnitts und drücken Sie Enter, um zu vergleichen. Drücken Sie Escape, um abzubrechen.',
  'notification.deltaTraceTitle': 'OHLC-Kurs gegenüber {reference}',
  'notification.deltaYAxisLabel': 'Delta {axis}',

  // The reference-line picker.
  'notification.deltaPickerTitle': 'Mit Referenzlinie vergleichen',
  'notification.deltaPickerClose': 'Referenzauswahl schließen',
  'notification.deltaPickerDescription': 'Wählen Sie eine Referenzlinie, mit der jede Kerze verglichen wird. Bewegen Sie sich mit den Pfeiltasten auf und ab und drücken Sie dann Enter. Nach der Auswahl drücken Sie Alt L, um den Vergleich ein- oder auszuschalten.',
  'notification.deltaPickerListLabel': 'Referenzlinien',
} satisfies Partial<Record<MessageKey, string>>;
