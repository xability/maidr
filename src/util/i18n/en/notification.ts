/** Short spoken confirmations: mode toggles, speed changes, and status alerts. */
export const notification = {
  // Autoplay speed.
  'notification.speedUp': 'Speed up',
  'notification.maxSpeed': 'Max speed',
  'notification.speedDown': 'Speed down',
  'notification.minSpeed': 'Min speed',
  'notification.resetSpeed': 'Reset speed',

  // Sonification. The mode word is a message of its own so the sentence can be
  // shaped differently per language.
  'notification.soundIs': 'Sound is {mode}',
  'notification.audioModeOff': 'off',
  'notification.audioModeOn': 'on',
  'notification.audioModeCombined': 'combined',
  'notification.audioModeSeparate': 'separate',

  // Braille.
  'notification.brailleIsOn': 'Braille is on',
  'notification.brailleIsOff': 'Braille is off',
  'notification.brailleNoInfo': 'No info for braille',
  'notification.brailleNotSupported': 'Braille is not supported for plot type: {type}',
  'notification.brailleDisplay': 'Braille display',

  // Monitor mode on live charts.
  'notification.monitoringLiveOnly': 'Monitoring is available only for live charts',
  'notification.monitoringOn': 'Monitoring on',
  'notification.monitoringOff': 'Monitoring off',

  // High contrast.
  'notification.highContrastOn': 'High Contrast Mode on',
  'notification.highContrastOff': 'High Contrast Mode off',

  // Candlestick reference comparison (the virtual delta layer).
  'notification.deltaCandlestickOnly': 'Reference comparison is only available on candlestick charts.',
  'notification.deltaNeedsLineLayer': 'Reference comparison is only available on candlestick charts with a line layer.',
  'notification.deltaReferenceUnavailable': 'The selected reference line is unavailable.',
  'notification.deltaNoMatchingX': 'No matching x values between the candlestick chart and {reference}.',
  'notification.deltaKeepingComparison': 'Keeping the current comparison: {reference} does not reach {x}. Move to a candle it covers, then choose it again.',
  'notification.deltaNoComparisonAtX': 'No reference comparison at {x}: {reference} does not reach this candle. Move to a candle the moving average covers, then press Alt L.',
  'notification.deltaActivationFailed': 'Reference comparison could not be activated here.',
  'notification.deltaActivated': 'Reference comparison on: OHLC price minus {reference}, {count} points, starting on {field}. Positive values are above the line, negative below. Use Left and Right arrows to move between candles, Up and Down to switch between open, high, low and close. Press Alt L to turn the comparison off, G for extrema, and the rotor to browse above-line, below-line, or on-line points. Press Escape to return to the chart.',
  'notification.deltaClosed': 'Reference comparison closed. Returned to the chart layer. Press Alt L to compare again.',
  'notification.deltaClosedByUpdate': 'Reference comparison closed by a data update.',
  'notification.deltaNoReferenceChosen': 'No reference line chosen yet. Use the list to pick a moving average line and press Enter to compare. Press Escape to cancel.',
  'notification.deltaTraceTitle': 'OHLC price vs {reference}',
  'notification.deltaYAxisLabel': '{axis} delta',

  // The reference-line picker.
  'notification.deltaPickerTitle': 'Compare to Reference Line',
  'notification.deltaPickerClose': 'Close reference picker',
  'notification.deltaPickerDescription': 'Choose a reference line to compare each candle against. Use the Up and Down arrows to move, then press Enter. Once chosen, press Alt L to turn the comparison on or off.',
  'notification.deltaPickerListLabel': 'Reference lines',
} as const;
