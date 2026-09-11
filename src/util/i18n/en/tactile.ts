/**
 * The tactile display: what the view says of itself after a zoom or a pan,
 * why a request was refused, and how the device connection reports itself.
 */
export const tactile = {
  // Viewport.
  'tactile.viewWholePlot': 'Whole plot',
  'tactile.viewZoomed': 'Zoom {zoom}x, centred {x}% across and {y}% down',
  'tactile.viewEmpty': '{view}; nothing is in view',
  'tactile.viewUnchanged': '{view}; the pins are unchanged',

  // Refusals.
  'tactile.noView': 'Nothing is on the tactile display yet',
  'tactile.zoomAtClosest': 'Already at the closest zoom',
  'tactile.zoomAtWholePlot': 'Already showing the whole plot',
  'tactile.panWholePlot': 'The whole plot is already shown; zoom in to pan',
  'tactile.panEdgeUp': 'No more to show above',
  'tactile.panEdgeDown': 'No more to show below',
  'tactile.panEdgeLeft': 'No more to show to the left',
  'tactile.panEdgeRight': 'No more to show to the right',
  'tactile.brailleOff': 'Turn braille on to use the tactile display',
  'tactile.notConnected': 'No tactile display is connected',

  // Braille text line.
  'tactile.lineWholeShown': 'The whole line is already shown',
  'tactile.lineStart': 'Start of the line',
  'tactile.lineEnd': 'End of the line',
  'tactile.linePart': 'Line part {index} of {total}',
  'tactile.lineUncontracted': 'Contracted braille is unavailable, so the tactile display\'s text line is uncontracted',

  // Device connection.
  'tactile.deviceDisconnected': 'DotPad disconnected',
  'tactile.deviceNoBluetooth': 'This page cannot reach a DotPad over Bluetooth. Web Bluetooth needs a Chromium browser, and a page — or an iframe — permitted to use it.',
  'tactile.deviceNoUsb': 'This page cannot reach a DotPad over USB. Web Serial needs a Chromium browser on desktop, and a page — or an iframe — permitted to use it.',
  'tactile.deviceNoSdk': 'The DotPad SDK was not found on this page.',
  'tactile.deviceNoneSelected': 'No DotPad was selected.',
  'tactile.deviceConnectFailed': 'Could not connect to the DotPad.',
  'tactile.deviceNotPermitted': 'This page is not permitted to reach a DotPad. It needs to be served over HTTPS, and an iframe needs the matching allow attribute.',
} as const;
