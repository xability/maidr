import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': 'Orientamento',
  'description.statSubtitle': 'Sottotitolo',
  'description.statCaption': 'Didascalia',
  'description.statCurrentlyOn': 'Posizione corrente',
  'description.statChartTypes': 'Tipi di grafico',
  'description.multiPanelFigure': 'Figura a più pannelli',
  'description.valueInfinity': 'infinito',
  'description.valueNegativeInfinity': 'meno infinito',
  'description.subplotPosition': 'sottografico {index} di {total}',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': 'Descrizione del grafico',
  'description.close': 'Chiudi',
  'description.chartTypePrefix': 'Tipo di grafico: ',
  'description.titleLabel': 'Titolo',
  'description.titleLabelSubplot': 'Titolo del sottografico',
  'description.titleLabelFigure': 'Titolo della figura',
  'description.axesHeading': 'Assi',
  'description.axisEntry': 'Asse {axis}: {label}',
  'description.summaryHeading': 'Riepilogo',
  'description.subplotsHeading': 'Sottografici ({count})',
  'description.subplotUnknown': 'sconosciuto',
  'description.subplotCurrent': ' (corrente)',

  'description.layersHeading': 'Livelli ({count})',
  'description.showingLayer': 'Livello {index} di {total} visualizzato',
  'description.layerHint': 'Usare i tasti freccia sinistra e destra per spostarsi tra i livelli e Spazio per aprirne uno.',
  'description.layerUpdated': 'Descrizione aggiornata per il livello {index} di {total}',

  'description.rowOne': 'riga',
  'description.rowMany': 'righe',
  'description.tableCaption': 'Dati: {total} {rows}',
  'description.tableCaptionTruncated': 'Dati: mostrate {shown} su {total} {rows}',
  'description.tableShowMore': 'Mostra ancora {count} {rows} su {total}',
  'description.tableColumn': 'Colonna {index}',
} satisfies Partial<Record<MessageKey, string>>;
