import type { MessageKey } from '../index';

export const tactile = {
  // Viewport.
  'tactile.viewWholePlot': 'Gesamtes Diagramm',
  'tactile.viewZoomed': 'Zoom {zoom}-fach, Mitte bei {x} % von links und {y} % von oben',
  'tactile.viewEmpty': '{view}; nichts ist zu sehen',
  'tactile.viewUnchanged': '{view}; die Pins sind unverändert',

  // Refusals.
  'tactile.noView': 'Auf dem taktilen Display ist noch nichts zu sehen',
  'tactile.zoomAtClosest': 'Bereits auf der nächsten Zoomstufe',
  'tactile.zoomAtWholePlot': 'Das gesamte Diagramm wird bereits angezeigt',
  'tactile.panWholePlot': 'Das gesamte Diagramm wird bereits angezeigt; zoomen Sie hinein, um den Ausschnitt zu verschieben',
  'tactile.panEdgeUp': 'Oben gibt es nichts mehr anzuzeigen',
  'tactile.panEdgeDown': 'Unten gibt es nichts mehr anzuzeigen',
  'tactile.panEdgeLeft': 'Links gibt es nichts mehr anzuzeigen',
  'tactile.panEdgeRight': 'Rechts gibt es nichts mehr anzuzeigen',
  'tactile.brailleOff': 'Schalten Sie Braille ein, um das taktile Display zu verwenden',
  'tactile.notConnected': 'Es ist kein taktiles Display verbunden',

  // Braille text line.
  'tactile.lineWholeShown': 'Die ganze Zeile wird bereits angezeigt',
  'tactile.lineStart': 'Anfang der Zeile',
  'tactile.lineEnd': 'Ende der Zeile',
  'tactile.linePart': 'Zeilenteil {index} von {total}',
  'tactile.lineUncontracted': 'Kurzschrift ist nicht verfügbar, daher wird die Textzeile des taktilen Displays in Vollschrift ausgegeben',

  // Device connection.
  'tactile.deviceDisconnected': 'DotPad getrennt',
  'tactile.deviceNoBluetooth': 'Diese Seite kann kein DotPad über Bluetooth erreichen. Web Bluetooth benötigt einen Chromium-Browser und eine Seite oder ein iframe mit der Berechtigung, es zu verwenden.',
  'tactile.deviceNoUsb': 'Diese Seite kann kein DotPad über USB erreichen. Web Serial benötigt einen Chromium-Browser auf einem Desktop-Rechner und eine Seite oder ein iframe mit der Berechtigung, es zu verwenden.',
  'tactile.deviceNoSdk': 'Das DotPad-SDK wurde auf dieser Seite nicht gefunden.',
  'tactile.deviceNoneSelected': 'Es wurde kein DotPad ausgewählt.',
  'tactile.deviceConnectFailed': 'Verbindung mit dem DotPad nicht möglich.',
  'tactile.deviceNotPermitted': 'Diese Seite darf kein DotPad erreichen. Sie muss über HTTPS ausgeliefert werden, und ein iframe benötigt das passende allow-Attribut.',
} satisfies Partial<Record<MessageKey, string>>;
