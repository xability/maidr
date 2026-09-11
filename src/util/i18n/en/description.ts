/**
 * Messages of the chart description: the labels and values the description
 * service puts in a description, and the chrome of the dialog that shows it.
 */
export const description = {
  // Stat labels and values built by DescriptionService.
  'description.statOrientation': 'Orientation',
  'description.statSubtitle': 'Subtitle',
  'description.statCaption': 'Caption',
  'description.statCurrentlyOn': 'Currently on',
  'description.statChartTypes': 'Chart types',
  'description.multiPanelFigure': 'Multi-panel figure',
  'description.valueInfinity': 'infinity',
  'description.valueNegativeInfinity': 'negative infinity',
  'description.subplotPosition': 'subplot {index} of {total}',
  'description.chartTypeCount': '{kind} ({count})',

  // Dialog chrome.
  'description.title': 'Chart Description',
  'description.close': 'Close',
  'description.chartTypePrefix': 'Chart Type: ',
  'description.titleLabel': 'Title',
  'description.titleLabelSubplot': 'Subplot title',
  'description.titleLabelFigure': 'Figure title',
  'description.axesHeading': 'Axes',
  'description.axisEntry': '{axis} axis: {label}',
  'description.summaryHeading': 'Summary',
  'description.subplotsHeading': 'Subplots ({count})',
  'description.subplotUnknown': 'unknown',
  'description.subplotCurrent': ' (current)',

  // Layer tab strip.
  'description.layersHeading': 'Layers ({count})',
  'description.showingLayer': 'Showing layer {index} of {total}',
  'description.layerHint': 'Use the left and right arrow keys to move between layers and Space to open one.',
  'description.layerUpdated': 'Description updated for layer {index} of {total}',

  // Data table. `row` and `rows` are separate keys because the caller picks
  // the one the count calls for; there is no plural engine.
  'description.rowOne': 'row',
  'description.rowMany': 'rows',
  'description.tableCaption': 'Data: {total} {rows}',
  'description.tableCaptionTruncated': 'Data: showing {shown} of {total} {rows}',
  'description.tableShowMore': 'Show {count} more of {total} {rows}',
  'description.tableColumn': 'Column {index}',
} as const;
