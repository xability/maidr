import type { MessageKey } from '../index';

export const notification = {
  'notification.speedUp': 'Più veloce',
  'notification.maxSpeed': 'Velocità massima',
  'notification.speedDown': 'Più lento',
  'notification.minSpeed': 'Velocità minima',
  'notification.resetSpeed': 'Velocità reimpostata',

  'notification.soundIs': 'Audio {mode}',
  'notification.audioModeOff': 'disattivato',
  'notification.audioModeOn': 'attivato',
  'notification.audioModeCombined': 'combinato',
  'notification.audioModeSeparate': 'separato',

  'notification.brailleIsOn': 'Braille attivato',
  'notification.brailleIsOff': 'Braille disattivato',
  'notification.brailleNoInfo': 'Nessuna informazione per il braille',
  'notification.brailleNotSupported': 'Il braille non è supportato per il tipo di grafico: {type}',
  'notification.brailleDisplay': 'Display braille',

  'notification.monitoringLiveOnly': 'Il monitoraggio è disponibile solo per i grafici in tempo reale',
  'notification.monitoringOn': 'Monitoraggio attivato',
  'notification.monitoringOff': 'Monitoraggio disattivato',

  'notification.highContrastOn': 'Modalità alto contrasto attivata',
  'notification.highContrastOff': 'Modalità alto contrasto disattivata',

  'notification.deltaCandlestickOnly': 'Il confronto con il riferimento è disponibile solo nei grafici a candele.',
  'notification.deltaNeedsLineLayer': 'Il confronto con il riferimento è disponibile solo nei grafici a candele con un livello a linee.',
  'notification.deltaReferenceUnavailable': 'La linea di riferimento selezionata non è disponibile.',
  'notification.deltaNoMatchingX': 'Nessun valore x in comune tra il grafico a candele e {reference}.',
  'notification.deltaKeepingComparison': 'Il confronto corrente viene mantenuto: {reference} non arriva a {x}. Spostarsi su una candela coperta dalla linea, poi sceglierla di nuovo.',
  'notification.deltaNoComparisonAtX': 'Nessun confronto con il riferimento in {x}: {reference} non arriva a questa candela. Spostarsi su una candela coperta dalla media mobile, poi premere Alt L.',
  'notification.deltaActivationFailed': 'Impossibile attivare qui il confronto con il riferimento.',
  'notification.deltaActivated': 'Confronto con il riferimento attivato: prezzo OHLC meno {reference}, {count} punti, a partire da {field}. I valori positivi sono sopra la linea, quelli negativi sotto. Usare le frecce sinistra e destra per spostarsi tra le candele, su e giù per passare tra apertura, massimo, minimo e chiusura. Premere Alt L per disattivare il confronto, G per i valori estremi e il rotore per scorrere i punti sopra la linea, sotto la linea o sulla linea. Premere Escape per tornare al grafico.',
  'notification.deltaClosed': 'Confronto con il riferimento chiuso. Ritorno al livello del grafico. Premere Alt L per confrontare di nuovo.',
  'notification.deltaClosedByUpdate': 'Confronto con il riferimento chiuso da un aggiornamento dei dati.',
  'notification.deltaNoReferenceChosen': 'Nessuna linea di riferimento ancora scelta. Usare l\'elenco per scegliere una linea di media mobile e premere Enter per confrontare. Premere Escape per annullare.',
  'notification.deltaTraceTitle': 'Prezzo OHLC rispetto a {reference}',
  'notification.deltaYAxisLabel': 'Delta {axis}',

  'notification.deltaPickerTitle': 'Confronta con una linea di riferimento',
  'notification.deltaPickerClose': 'Chiudi il selettore di riferimento',
  'notification.deltaPickerDescription': 'Scegliere una linea di riferimento con cui confrontare ogni candela. Usare le frecce su e giù per spostarsi, poi premere Enter. Una volta scelta, premere Alt L per attivare o disattivare il confronto.',
  'notification.deltaPickerListLabel': 'Linee di riferimento',
} satisfies Partial<Record<MessageKey, string>>;
