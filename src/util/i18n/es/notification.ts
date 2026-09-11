import type { MessageKey } from '../index';

/** Spanish renderings of the short spoken confirmations: mode toggles, speed changes, and status alerts. */
export const notification = {
  // Autoplay speed.
  'notification.speedUp': 'Velocidad aumentada',
  'notification.maxSpeed': 'Velocidad máxima',
  'notification.speedDown': 'Velocidad reducida',
  'notification.minSpeed': 'Velocidad mínima',
  'notification.resetSpeed': 'Velocidad restablecida',

  // Sonification. The mode word is a message of its own so the sentence can be
  // shaped differently per language.
  'notification.soundIs': 'El sonido está {mode}',
  'notification.audioModeOff': 'desactivado',
  'notification.audioModeOn': 'activado',
  'notification.audioModeCombined': 'en modo combinado',
  'notification.audioModeSeparate': 'en modo separado',

  // Braille.
  'notification.brailleIsOn': 'Braille activado',
  'notification.brailleIsOff': 'Braille desactivado',
  'notification.brailleNoInfo': 'No hay información para braille',
  'notification.brailleNotSupported': 'El braille no es compatible con el tipo de gráfico: {type}',
  'notification.brailleDisplay': 'Pantalla braille',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': 'El monitoreo solo está disponible para gráficos en vivo',
  'notification.monitoringOn': 'Monitoreo activado',
  'notification.monitoringOff': 'Monitoreo desactivado',

  // High contrast.
  'notification.highContrastOn': 'Modo de alto contraste activado',
  'notification.highContrastOff': 'Modo de alto contraste desactivado',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': 'La comparación con la referencia solo está disponible en gráficos de velas.',
  'notification.deltaNeedsLineLayer': 'La comparación con la referencia solo está disponible en gráficos de velas con una capa de líneas.',
  'notification.deltaReferenceUnavailable': 'La línea de referencia seleccionada no está disponible.',
  'notification.deltaNoMatchingX': 'No hay valores de x coincidentes entre el gráfico de velas y {reference}.',
  'notification.deltaKeepingComparison': 'Se mantiene la comparación actual: {reference} no llega hasta {x}. Muévase a una vela que sí cubra y vuelva a elegirla.',
  'notification.deltaNoComparisonAtX': 'No hay comparación con la referencia en {x}: {reference} no llega hasta esta vela. Muévase a una vela cubierta por la media móvil y presione Alt L.',
  'notification.deltaActivationFailed': 'No se pudo activar aquí la comparación con la referencia.',
  'notification.deltaActivated': 'Comparación con la referencia activada: precio OHLC menos {reference}, {count} puntos, comenzando en {field}. Los valores positivos están por encima de la línea y los negativos por debajo. Use las flechas izquierda y derecha para moverse entre las velas, y arriba y abajo para cambiar entre apertura, máximo, mínimo y cierre. Presione Alt L para desactivar la comparación, G para los valores extremos y el rotor para recorrer los puntos por encima, por debajo o sobre la línea. Presione Escape para volver al gráfico.',
  'notification.deltaClosed': 'Comparación con la referencia cerrada. Se volvió a la capa del gráfico. Presione Alt L para comparar de nuevo.',
  'notification.deltaClosedByUpdate': 'La comparación con la referencia se cerró por una actualización de los datos.',
  'notification.deltaNoReferenceChosen': 'Aún no se ha elegido una línea de referencia. Use la lista para elegir una línea de media móvil y presione Enter para comparar. Presione Escape para cancelar.',
  'notification.deltaTraceTitle': 'Precio OHLC frente a {reference}',
  'notification.deltaYAxisLabel': 'Delta de {axis}',

  // The reference-line picker.
  'notification.deltaPickerTitle': 'Comparar con una línea de referencia',
  'notification.deltaPickerClose': 'Cerrar el selector de referencia',
  'notification.deltaPickerDescription': 'Elija una línea de referencia con la que comparar cada vela. Use las flechas arriba y abajo para moverse y luego presione Enter. Una vez elegida, presione Alt L para activar o desactivar la comparación.',
  'notification.deltaPickerListLabel': 'Líneas de referencia',
} satisfies Partial<Record<MessageKey, string>>;
