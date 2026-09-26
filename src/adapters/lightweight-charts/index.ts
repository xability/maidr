/**
 * TradingView Lightweight Charts integration for MAIDR.
 *
 * Makes Lightweight Charts (v5) price charts -- candlesticks, OHLC bars,
 * lines, areas, baselines and volume histograms, across any number of panes
 * -- navigable by keyboard and readable through sonification, text and
 * braille, and keeps MAIDR in step with the chart as it streams.
 *
 * @remarks
 * Lightweight Charts is **not** bundled: the adapter reads the chart the host
 * page created. Two ways to use it:
 *
 * 1. {@link bindLightweightChart} (recommended) mounts MAIDR around the chart,
 *    highlights the reader's bar over the canvas, and follows every
 *    `series.update(...)` / `series.setData(...)` -- a new bar is announced in
 *    monitor mode (`M`).
 * 2. {@link fromLightweightChart} returns plain MAIDR JSON for the `maidr`
 *    attribute or `<Maidr data={...}>`: audio, text and braille, but no
 *    highlight and no live sync.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/lightweight-charts@5/dist/lightweight-charts.standalone.production.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/lightweight-charts.js"></script>
 * <div id="chart" style="width: 720px; height: 420px"></div>
 * <script>
 *   const chart = LightweightCharts.createChart(document.getElementById('chart'));
 *   const candles = chart.addSeries(LightweightCharts.CandlestickSeries, { title: 'ACME' });
 *   candles.setData(ohlc);
 *   maidrLightweightCharts.bindLightweightChart(chart, { title: 'ACME daily prices' });
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export { bindLightweightChart } from './binder';
export type { LightweightChartsBinding, LightweightChartsBindOptions } from './binder';
export { fromLightweightChart } from './converters';
export type { LightweightChartsOptions } from './converters';
export type {
  LwcBusinessDay,
  LwcChart,
  LwcDataItem,
  LwcPane,
  LwcSeries,
  LwcTime,
  LwcTimeScale,
} from './types';
