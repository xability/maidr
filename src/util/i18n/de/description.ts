import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': 'Ausrichtung',
  'description.statSubtitle': 'Untertitel',
  'description.statCaption': 'Bildunterschrift',
  'description.statCurrentlyOn': 'Aktuell bei',
  'description.statChartTypes': 'Diagrammtypen',
  'description.multiPanelFigure': 'Mehrteilige Abbildung',
  'description.valueInfinity': 'unendlich',
  'description.valueNegativeInfinity': 'minus unendlich',
  'description.subplotPosition': 'Teildiagramm {index} von {total}',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': 'Diagrammbeschreibung',
  'description.close': 'Schließen',
  'description.chartTypePrefix': 'Diagrammtyp: ',
  'description.titleLabel': 'Titel',
  'description.titleLabelSubplot': 'Titel des Teildiagramms',
  'description.titleLabelFigure': 'Titel der Abbildung',
  'description.axesHeading': 'Achsen',
  'description.axisEntry': '{axis}-Achse: {label}',
  'description.summaryHeading': 'Zusammenfassung',
  'description.subplotsHeading': 'Teildiagramme ({count})',
  'description.subplotUnknown': 'unbekannt',
  'description.subplotCurrent': ' (aktuell)',

  'description.layersHeading': 'Ebenen ({count})',
  'description.showingLayer': 'Ebene {index} von {total} wird angezeigt',
  'description.layerHint': 'Verwenden Sie die Pfeiltasten links und rechts, um zwischen den Ebenen zu wechseln, und die Leertaste, um eine Ebene zu öffnen.',
  'description.layerUpdated': 'Beschreibung aktualisiert für Ebene {index} von {total}',

  'description.rowOne': 'Zeile',
  'description.rowMany': 'Zeilen',
  'description.tableCaption': 'Daten: {total} {rows}',
  'description.tableCaptionTruncated': 'Daten: {shown} von {total} {rows} werden angezeigt',
  'description.tableShowMore': '{count} weitere von {total} {rows} anzeigen',
  'description.tableColumn': 'Spalte {index}',
} satisfies Partial<Record<MessageKey, string>>;
