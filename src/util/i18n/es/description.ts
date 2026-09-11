import type { MessageKey } from '../index';

/**
 * Spanish renderings of the chart description: the labels and values the
 * description service puts in a description, and the chrome of the dialog
 * that shows it.
 */
export const description = {
  // Stat labels and values built by DescriptionService.
  'description.statOrientation': 'Orientación',
  'description.statSubtitle': 'Subtítulo',
  'description.statCaption': 'Pie de figura',
  'description.statCurrentlyOn': 'Posición actual',
  'description.statChartTypes': 'Tipos de gráfico',
  'description.multiPanelFigure': 'Figura de varios paneles',
  'description.valueInfinity': 'infinito',
  'description.valueNegativeInfinity': 'infinito negativo',
  'description.subplotPosition': 'subgráfico {index} de {total}',
  'description.chartTypeCount': '{kind} ({count})',

  // Dialog chrome.
  'description.title': 'Descripción del gráfico',
  'description.close': 'Cerrar',
  'description.chartTypePrefix': 'Tipo de gráfico: ',
  'description.titleLabel': 'Título',
  'description.titleLabelSubplot': 'Título del subgráfico',
  'description.titleLabelFigure': 'Título de la figura',
  'description.axesHeading': 'Ejes',
  'description.axisEntry': 'Eje {axis}: {label}',
  'description.summaryHeading': 'Resumen',
  'description.subplotsHeading': 'Subgráficos ({count})',
  'description.subplotUnknown': 'desconocido',
  'description.subplotCurrent': ' (actual)',

  // Layer tab strip.
  'description.layersHeading': 'Capas ({count})',
  'description.showingLayer': 'Mostrando la capa {index} de {total}',
  'description.layerHint': 'Use las flechas izquierda y derecha para moverse entre las capas y la barra espaciadora para abrir una.',
  'description.layerUpdated': 'Descripción actualizada para la capa {index} de {total}',

  // Data table. `row` and `rows` are separate keys because the caller picks
  // the one the count calls for; there is no plural engine.
  'description.rowOne': 'fila',
  'description.rowMany': 'filas',
  'description.tableCaption': 'Datos: {total} {rows}',
  'description.tableCaptionTruncated': 'Datos: se muestran {shown} de {total} {rows}',
  'description.tableShowMore': 'Mostrar {count} más de {total} {rows}',
  'description.tableColumn': 'Columna {index}',
} satisfies Partial<Record<MessageKey, string>>;
