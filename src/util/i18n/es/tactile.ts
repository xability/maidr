import type { MessageKey } from '../index';

/**
 * Spanish renderings of the tactile display: what the view says of itself
 * after a zoom or a pan, why a request was refused, and how the device
 * connection reports itself.
 */
export const tactile = {
  // Viewport.
  'tactile.viewWholePlot': 'Gráfico completo',
  'tactile.viewZoomed': 'Zoom de {zoom} aumentos, centrado en el {x}% horizontal y el {y}% vertical',
  'tactile.viewEmpty': '{view}; no hay nada a la vista',
  'tactile.viewUnchanged': '{view}; los pines no cambiaron',

  // Refusals.
  'tactile.noView': 'Aún no hay nada en el dispositivo táctil',
  'tactile.zoomAtClosest': 'Ya está en el zoom más cercano',
  'tactile.zoomAtWholePlot': 'Ya se muestra el gráfico completo',
  'tactile.panWholePlot': 'Ya se muestra el gráfico completo; acerque el zoom para desplazarse',
  'tactile.panEdgeUp': 'No hay más que mostrar arriba',
  'tactile.panEdgeDown': 'No hay más que mostrar abajo',
  'tactile.panEdgeLeft': 'No hay más que mostrar a la izquierda',
  'tactile.panEdgeRight': 'No hay más que mostrar a la derecha',
  'tactile.brailleOff': 'Active el braille para usar el dispositivo táctil',
  'tactile.notConnected': 'No hay ningún dispositivo táctil conectado',

  // Braille text line.
  'tactile.lineWholeShown': 'Ya se muestra la línea completa',
  'tactile.lineStart': 'Inicio de la línea',
  'tactile.lineEnd': 'Fin de la línea',
  'tactile.linePart': 'Parte {index} de {total} de la línea',
  'tactile.lineUncontracted': 'El braille contraído no está disponible, por lo que la línea de texto del dispositivo táctil se muestra sin contraer',

  // Device connection.
  'tactile.deviceDisconnected': 'DotPad desconectado',
  'tactile.deviceNoBluetooth': 'Esta página no puede conectarse con un DotPad por Bluetooth. Web Bluetooth requiere un navegador Chromium y una página, o un iframe, con permiso para usarlo.',
  'tactile.deviceNoUsb': 'Esta página no puede conectarse con un DotPad por USB. Web Serial requiere un navegador Chromium de escritorio y una página, o un iframe, con permiso para usarlo.',
  'tactile.deviceNoSdk': 'No se encontró el SDK de DotPad en esta página.',
  'tactile.deviceNoneSelected': 'No se seleccionó ningún DotPad.',
  'tactile.deviceConnectFailed': 'No se pudo conectar con el DotPad.',
  'tactile.deviceNotPermitted': 'Esta página no tiene permiso para conectarse con un DotPad. Debe servirse por HTTPS, y un iframe necesita el atributo allow correspondiente.',
} satisfies Partial<Record<MessageKey, string>>;
