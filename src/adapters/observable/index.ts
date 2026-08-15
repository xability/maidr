/**
 * Observable Plot adapter for MAIDR.
 *
 * Makes charts drawn with [Observable Plot](https://observablehq.com/plot)
 * navigable — audio sonification, text descriptions, braille, and keyboard
 * navigation — including the ones an `{ojs}` cell draws in a
 * [Quarto](https://quarto.org) document, where the author never calls this
 * adapter at all.
 *
 * @remarks
 * The adapter reads the rendered chart. Plot labels every mark it draws
 * (`<g aria-label="bar">`) and hangs its scales off the returned node, so an
 * element's geometry run back through the matching scale gives the datum it
 * was drawn for. That is why it needs no configuration, and why it works on a
 * plot written before MAIDR was in the picture.
 *
 * ### Marks it reads
 *
 * `barX` / `barY` (plain and stacked), `rectX` / `rectY` including binned
 * histograms, `dot` (as a scatter, or as a Cleveland dot plot on a categorical
 * axis), `line` and `area` (one series per drawn path), and any of those split
 * into facets with `fx` / `fy`, which become MAIDR subplots.
 *
 * ### Marks it does not
 *
 * `cell` — a heatmap keeps its magnitude in an 8-bit fill colour, so several
 * distinct values render as the same pixel and no inversion can separate them.
 * Announcing an approximation to a reader who cannot check it against the
 * picture is worse than announcing nothing, so those marks are skipped.
 *
 * Box plots are skipped too, and for the same reason. `Plot.boxY` is not one
 * mark but four, and nothing in the DOM says they belong together: read
 * individually its interquartile box is an ordinary bar whose height is
 * `q3 - q1`, a number that appears nowhere in the data, while the median and
 * the whiskers go unannounced.
 *
 * @example
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/maidr/dist/observable.js"></script>
 * <script type="module">
 *   import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot/+esm';
 *   const data = [{ day: 'Mon', count: 20 }, { day: 'Tue', count: 14 }];
 *   document.body.append(Plot.plot({
 *     title: 'Visitors',
 *     marks: [Plot.barY(data, { x: 'day', y: 'count' })],
 *   }));
 *   // Nothing else to do: the adapter binds the chart when it appears.
 * </script>
 * ```
 *
 * @packageDocumentation
 */

export { observablePlotToMaidr } from './converters';
export { isObservablePlot } from './introspect';
export type {
  MarkDatum,
  ObservablePlotElement,
  ObservablePlotOptions,
  ObservablePlotResult,
  ObservableWatchOptions,
  PlotScale,
  PlotScales,
  QuartoObservableOptions,
} from './types';
export {
  autoInitObservablePlots,
  autoInitQuartoObservable,
  bindObservablePlot,
  initObservablePlots,
  initQuartoObservable,
  stopObservablePlots,
  stopQuartoObservable,
} from './watcher';
