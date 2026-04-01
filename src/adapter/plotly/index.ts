/**
 * Plotly.js adapter — public API.
 *
 * Re-exports everything external consumers need from the Plotly adapter
 * modules. Internal helpers remain private to each module.
 */

export { isPlotlyPlot, normalizePlotlySvg, disconnectPlotlyObservers } from './normalizer';
export { extractPlotlyData } from './extractor';
