import type { MessageKey } from '../index';

/**
 * Spanish renderings of everything the text service, the review service and
 * the announcing commands say: the per-point readings, the lobby and layer
 * navigation cues, the label and position announcements, and the boundary
 * messages.
 */
export const text = {
  // Reading fragments the per-point announcements are composed from. Every
  // clause of a verbose reading is one of these, joined with ", ".
  'text.labelIsValue': '{label} es {value}',
  'text.labelAreValues': '{label} son {values}',
  'text.labelIsRange': '{label} va de {min} a {max}',
  'text.rangeThrough': 'de {min} a {max}',
  'text.sectionLabel': '{section} de {label}',
  // The plot type words under `model.plotType*` are the phrase that follows
  // "gráfico" -- "de barras", "circular" -- so this supplies the noun.
  'text.plotOfType': 'gráfico {type}',
  'text.gridCell': 'Celda {row}, {col}',

  // Layer navigation (Page Up / Page Down) and the states with nothing to read.
  'text.layerOfSize': 'Capa {index} de {size}: {identity}',
  'text.layerSwitchAt': '{layer} en {details}',
  'text.noAdditionalLayer': 'No hay más capas',
  'text.noPlotInfo': 'No hay información del gráfico para mostrar',
  'text.noFigureInfo': 'No hay información de la figura para mostrar',

  // The multi-panel figure lobby: what a subplot is, and how to enter it.
  'text.figureSingleType': 'Este es un gráfico {type}',
  'text.figureMultiType': 'Este es un gráfico de varias capas que contiene gráficos {types}',
  'text.subplotOfSize': 'Subgráfico {index} de {size}',
  'text.subplotOfSizeTitled': 'Subgráfico {index} de {size}, {title}',
  'text.subplotIndex': 'Subgráfico {index}',
  'text.figureLobbyDetails': '{position}: {details}. {prompt}',
  'text.pressEnterToSelect': 'Presione ENTER para seleccionar este subgráfico.',

  // Entering a subplot, refusing to enter an empty one, and returning to the
  // lobby. Each combination of an authored title and a known plot type has its
  // own key so no locale has to glue clauses together in English word order.
  'text.enteredSubplot': 'Se accedió al subgráfico {index} de {size}.',
  'text.enteredSubplotTitled': 'Se accedió al subgráfico {index} de {size}, {title}.',
  'text.enteredSubplotTyped': 'Se accedió al subgráfico {index} de {size}, gráfico {type}.',
  'text.enteredSubplotTitledTyped': 'Se accedió al subgráfico {index} de {size}, {title}, gráfico {type}.',
  'text.terseEmptySubplot': '{label}, vacío',
  'text.subplotEmpty': 'El subgráfico {index} de {size} está vacío, no hay nada que describir.',
  'text.subplotEmptyTitled': 'El subgráfico {index} de {size}, {title}, está vacío, no hay nada que describir.',
  'text.figureTerse': 'Figura',
  'text.figureTerseTitled': 'Figura, {title}',
  'text.figureTerseSubplot': 'Figura, subgráfico {index}',
  'text.returnedToFigure': 'Se volvió a la vista general de la figura.',
  'text.returnedToFigureSubplot': 'Se volvió a la vista general de la figura, subgráfico {index} de {size}.',
  'text.returnedToFigureSubplotTitled': 'Se volvió a la vista general de la figura, subgráfico {index} de {size}, {title}.',

  // Box plot outlier sections, which read as a list rather than as one value.
  // The section name is plural in Spanish ("valores atípicos inferiores"), so
  // both the one and the many form introduce the list with a colon rather
  // than agreeing a verb with the count.
  'text.noOutliersFor': 'sin {section} para {label}',
  'text.outliersForOne': '{section} de {label}: {values}',
  'text.outliersForMany': '{section} de {label}: {values}',
  'text.terseNoOutliers': '{value}, sin {section}',
  'text.terseOutliers': '{value}, {count} {section} {values}',

  // Facts announced after the point's own value: its share of a stack, and
  // the uncertainty drawn around it.
  'text.shareOfTotal': '{percent}% del total',
  'text.intervalRange': 'intervalo de {min} a {max}',
  'text.intervalFrom': 'intervalo desde {min}',
  'text.intervalUpTo': 'intervalo hasta {max}',

  // Scatter grid cells: the points a cell holds, and entering one that has none.
  'text.noPoints': 'sin puntos',
  'text.pointIsOne': 'el punto es: {points}',
  'text.pointsAreMany': 'los puntos son: {points}',
  'text.tersePoints': 'puntos: {points}',
  'text.noPointsInCell': 'No hay puntos en esta celda',

  // Reaching an edge of the data or of the lobby, in each verbosity.
  'text.noMoreData': 'No hay más datos',
  'text.noMoreDataVerbose': 'No hay más datos para mostrar',
  'text.noMoreSubplots': 'No hay más subgráficos',
  'text.noMoreSubplotsVerbose': 'No hay más subgráficos para mostrar',

  // Text mode itself.
  'text.textMode': 'El modo de texto está {mode}',
  'text.modeOff': 'desactivado',
  'text.modeTerse': 'en modo breve',
  'text.modeVerbose': 'en modo detallado',
  'text.textModeOffHint': 'El modo de texto está desactivado. Para activarlo, presione la tecla T.',

  // A candlestick's trend, which is a word rather than a measurement.
  'text.trendBull': 'alcista',
  'text.trendBear': 'bajista',
  'text.trendNeutral': 'neutral',

  // Review mode.
  'text.noInfoForReview': 'No hay información para revisar',
  'text.reviewMode': 'La revisión está {mode}',
  'text.reviewOn': 'activada',
  'text.reviewOff': 'desactivada',

  // The modifier key as a reader hears it spoken, and the unassigned-key
  // warning that names it. The key names themselves are not translated.
  'text.modifierControl': 'Control',
  'text.modifierCommand': 'Command',
  'text.invalidKey': 'Tecla no válida. Presione {modifier} y barra diagonal para ver la ayuda del teclado.',

  // Offering the braille key where braille has nothing to encode.
  'text.brailleUnavailableHere': 'El braille no está disponible aquí. Presione Enter para seleccionar primero un subgráfico.',

  // Label announcements. `text.subplotPrefix` keeps its trailing space: it is
  // prepended to an announcement rather than joined with one.
  'text.subplotPrefix': 'Subgráfico {index}, ',
  'text.figureAxisLabelIs': 'La etiqueta del eje {axis} de la figura es {label}',
  'text.axisLabelIs': 'La etiqueta del eje {axis} es {label}',
  'text.axisLabelUnavailable': 'La etiqueta del eje {axis} no está disponible',
  'text.unavailable': 'no disponible',
  'text.figureTitle': 'Título de la figura',
  'text.subplotTitleIndexed': 'Título del subgráfico {index}',
  'text.subplotTitle': 'Título del subgráfico',
  'text.title': 'Título',
  'text.noTitleAvailable': 'No hay título disponible',
  'text.subtitle': 'Subtítulo',
  'text.noSubtitleAvailable': 'No hay subtítulo disponible',
  'text.caption': 'Pie de figura',
  'text.noCaptionAvailable': 'No hay pie de figura disponible',

  // Position announcements, one shape per chart family.
  'text.notInChart': 'No está en un gráfico, no se puede mostrar la posición.',
  'text.indexOfSize': '{index} de {size}',
  'text.positionIs': 'La posición es {position} de {total}',
  'text.positionIsColumnRow': 'La posición es columna {col} de {cols}, fila {row} de {rows}',
  'text.positionInSection': 'La posición es {position} de {total} en {section}',
  'text.positionOfTotalWith': 'La posición es {position} de {total}, {detail}',
  'text.level': 'Nivel',
  'text.violinOfTotal': 'Violín {index} de {total}',
  'text.seriesOfTotal': '{noun} {index} de {total}',
  'text.seriesNounLine': 'Línea',
  'text.seriesNounObservation': 'Observación',
  'text.seriesNounCompetitor': 'Competidor',
  'text.seriesNounSeries': 'Serie',
  'text.columnRowPosition': 'Columna {col} de {cols}, fila {row} de {rows}',
  'text.wholeCircle': 'el círculo completo',
  'text.nearlyWholeCircle': 'casi todo el círculo',
  'text.atClockHour': 'a las {hour} en punto',
  'text.fromClockHourTo': 'de las {start} a las {end} en punto',

  // Jumping straight to a layer's extreme value.
  'text.noMinimumValue': 'No hay un valor mínimo al que ir en esta capa',
  'text.noMaximumValue': 'No hay un valor máximo al que ir en esta capa',
  'text.pointPosition': '{point}, {position} de {total}',
} satisfies Partial<Record<MessageKey, string>>;
