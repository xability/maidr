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
 * `barX` / `barY` (plain, stacked, and 100% stacked), `rectX` / `rectY`
 * including binned histograms, `dot` (a scatter, a Cleveland dot plot on a
 * categorical axis, or a hexbin lattice when the caller declares one), `tick`
 * given a categorical axis (a strip plot, read as a dot plot), `line` and
 * `area` (one series per drawn path, with the step curves read as steps),
 * `linearRegressionX` / `linearRegressionY` (the fitted line, as a smooth),
 * `waffle` (counted from the cells rather than inverted from a colour),
 * `link` / `arrow`, `rule`, `vector` (which is also what `Plot.spike` draws),
 * `text` (a labelled scatter when it stands alone, and another mark's names
 * when it sits on one), and `boxX` / `boxY`, which Plot draws as four
 * separate marks that are recognised and read as one distribution. Any of them split into facets with
 * `fx` / `fy` become MAIDR subplots.
 *
 * A `link`, an `arrow` and a `rule` each draw a segment between two points,
 * which is a span in a lane when its ends share the other coordinate — read as
 * a gantt. A spike stands a magnitude at a place, read as a scatter carrying
 * `z`, which the trace speaks and sounds alongside the position.
 *
 * A `text` mark is the same markup put to two uses, and where it sits says
 * which: Plot writes a label's position from the same channel it writes the
 * labelled point's, so a `text` under which another mark's points lie is that
 * mark's names — they move onto it and the group is not read again — and one
 * with nothing beneath it is a series, which is how `Plot.tree` and a
 * hand-drawn `Plot.dot` + `Plot.text` scatter come out as one named layer
 * each rather than as two or three at the same coordinates.
 *
 * ### Marks it does not
 *
 * `cell`, `contour` and `density` — one exclusion rather than three, because
 * Plot puts the magnitude in a colour and its colour scales are continuous. A
 * heatmap keeps its value in an 8-bit fill, so several distinct values render
 * as the same pixel; a contour band carries its level only in that fill,
 * sampled from a linear scale rather than a thresholded one; and a density's
 * isolines share a single stroke colour, encoding the level nowhere at all.
 * Announcing an approximation to a reader who cannot check it against the
 * picture is worse than announcing nothing, so those marks are skipped.
 *
 * A mark of a kind listed above is handed back when reading it would mean
 * announcing something the drawing does not state: a `vector` that points
 * somewhere, since the grammar has no field for a bearing; an `area` whose
 * floor follows the data, which is an interval rather than a magnitude; a
 * `rule` whose lines all share an end, which is a reference line or a
 * lollipop's stem rather than a measurement; a `tick` with no cross-channel,
 * which has no category to announce; a line drawn through control points that
 * are not data points; and a line or area broken by a gap. `docs/observable.md`
 * gives each case and the reasoning behind it.
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
