/**
 * uPlot integration for MAIDR.
 *
 * uPlot is a small, fast canvas time-series library, and the engine behind
 * Grafana's time-series panel. This adapter reads a live uPlot instance --
 * its columnar `u.data`, its series, axes and scales -- into MAIDR, mounts
 * MAIDR's accessible interface around the chart, draws the reader's position
 * back onto the canvas, and keeps the reading in step with `u.setData(...)`
 * so streaming metrics can be monitored (`M`) as they arrive.
 *
 * @remarks
 * `uplot` (v1.6+) is loaded by the host page; this module never imports it.
 *
 * @example
 * ```js
 * import uPlot from 'uplot';
 * import { maidrPlugin } from 'maidr/uplot';
 *
 * new uPlot({
 *   title: 'CPU usage',
 *   width: 640,
 *   height: 320,
 *   series: [{}, { label: 'CPU %', stroke: 'steelblue' }],
 *   plugins: [maidrPlugin()],
 * }, [timestamps, cpu], document.getElementById('chart'));
 * ```
 *
 * @packageDocumentation
 */

export type { Maidr as MaidrData } from '../../type/grammar';
export { bindUPlot, maidrPlugin } from './binder';
export { extractUPlotData } from './extractor';
export type { UPlotExtraction, UPlotLayerSource } from './extractor';
export type {
  MaidrUPlotHandle,
  MaidrUPlotOptions,
  UPlotInstance,
  UPlotPlugin,
  UPlotSeriesKind,
  UPlotSeriesMaidrOptions,
} from './types';
