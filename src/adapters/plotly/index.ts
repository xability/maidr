/**
 * Plotly.js adapter — public API.
 *
 * Re-exports everything external consumers need from the Plotly adapter
 * modules. Internal helpers remain private to each module.
 */

export { claimPlotlyExamination } from './examination';
export { extractPlotlyData } from './extractor';
export { disconnectPlotlyObservers, isPlotlyPlot, normalizePlotlySvg } from './normalizer';
