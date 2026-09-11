import type { MessageKey } from '../index';

export const tactile = {
  'tactile.viewWholePlot': 'Grafico intero',
  'tactile.viewZoomed': 'Zoom {zoom}x, centrato al {x}% in orizzontale e al {y}% in verticale',
  'tactile.viewEmpty': '{view}; nulla in vista',
  'tactile.viewUnchanged': '{view}; i pin sono invariati',

  'tactile.noView': 'Non c\'è ancora nulla sul display tattile',
  'tactile.zoomAtClosest': 'Zoom massimo già raggiunto',
  'tactile.zoomAtWholePlot': 'Il grafico intero è già visualizzato',
  'tactile.panWholePlot': 'Il grafico intero è già visualizzato; ingrandire per scorrere',
  'tactile.panEdgeUp': 'Non c\'è altro da mostrare sopra',
  'tactile.panEdgeDown': 'Non c\'è altro da mostrare sotto',
  'tactile.panEdgeLeft': 'Non c\'è altro da mostrare a sinistra',
  'tactile.panEdgeRight': 'Non c\'è altro da mostrare a destra',
  'tactile.brailleOff': 'Attivare il braille per usare il display tattile',
  'tactile.notConnected': 'Nessun display tattile connesso',

  'tactile.lineWholeShown': 'La riga intera è già visualizzata',
  'tactile.lineStart': 'Inizio della riga',
  'tactile.lineEnd': 'Fine della riga',
  'tactile.linePart': 'Parte {index} di {total} della riga',
  'tactile.lineUncontracted': 'Il braille contratto non è disponibile, quindi la riga di testo del display tattile è in braille integrale',

  'tactile.deviceDisconnected': 'DotPad disconnesso',
  'tactile.deviceNoBluetooth': 'Questa pagina non può raggiungere un DotPad via Bluetooth. Web Bluetooth richiede un browser Chromium e una pagina, o un iframe, autorizzata a usarlo.',
  'tactile.deviceNoUsb': 'Questa pagina non può raggiungere un DotPad via USB. Web Serial richiede un browser Chromium su desktop e una pagina, o un iframe, autorizzata a usarlo.',
  'tactile.deviceNoSdk': 'L\'SDK DotPad non è stato trovato in questa pagina.',
  'tactile.deviceNoneSelected': 'Nessun DotPad selezionato.',
  'tactile.deviceConnectFailed': 'Impossibile connettersi al DotPad.',
  'tactile.deviceNotPermitted': 'Questa pagina non è autorizzata a raggiungere un DotPad. Deve essere servita tramite HTTPS e un iframe deve avere l\'attributo allow corrispondente.',
} satisfies Partial<Record<MessageKey, string>>;
