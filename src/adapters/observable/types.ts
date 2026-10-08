/**
 * Type definitions for MAIDR's Observable Plot adapter.
 *
 * Observable Plot renders a chart to an `<svg>` element — wrapped in a
 * `<figure>` when the plot declares a title, subtitle, caption, or legend —
 * and hangs two functions off the returned node: `scale(name)` and
 * `legend(name)`. Those functions are how the adapter recovers the data behind
 * the drawn marks, so the types below describe them rather than the chart
 * options a user passed to `Plot.plot()`, which the adapter never sees.
 *
 * @packageDocumentation
 */

import type { PercentileBandOption } from '@adapters/shared/percentileBandOption';
import type { Maidr, MaidrLayer } from '@type/grammar';

/**
 * A scale descriptor as returned by `plot.scale(name)`.
 *
 * Plot exposes a plain object rather than a d3 scale: the configuration fields
 * (`type`, `domain`, `range`, and — for band scales — `bandwidth` and `step`)
 * plus `apply`, and, when the scale is invertible, `invert`. Ordinal and band
 * scales carry no `invert`, which is why {@link valueAtPixel} maps a pixel back
 * to a category by walking the domain instead.
 *
 * The descriptor deliberately has no `label`: Plot keeps the axis label in the
 * DOM (`g[aria-label="x-axis label"]`), and {@link readAxisLabel} reads it from
 * there.
 */
export interface PlotScale {
  /** Scale kind, e.g. `'linear'`, `'log'`, `'utc'`, `'band'`, `'point'`, `'ordinal'`. */
  type: string;
  /** Input domain. Categories for band/ordinal scales, endpoints for continuous ones. */
  domain: unknown[];
  /** Output range in pixels (or colors, for a color scale). */
  range?: unknown[];
  /** Width of one band, for band scales only. */
  bandwidth?: number;
  /** Distance between band starts, for band scales only. */
  step?: number;
  /** Maps a domain value to its output value. */
  apply?: (value: unknown) => unknown;
  /** Maps an output value back to the domain. Absent on band/ordinal scales. */
  invert?: (value: unknown) => unknown;
}

/** The scales of one plot, keyed by Plot's scale names. */
export interface PlotScales {
  x?: PlotScale;
  y?: PlotScale;
  fx?: PlotScale;
  fy?: PlotScale;
  color?: PlotScale;
  r?: PlotScale;
  /** Sizes a `spike` or `vector`'s drawn length from its magnitude channel. */
  length?: PlotScale;
}

/**
 * The element `Plot.plot()` returns: an `<svg>`, or a `<figure>` wrapping one.
 *
 * `scale` and `legend` are own properties of that element. They survive in the
 * DOM — Quarto inserts the very node Plot returned — but they do **not**
 * survive serialization, so an adapter that finds a plot in a static HTML file
 * gets the markup without them. Both are therefore optional here, and the
 * adapter falls back to reading the rendered axis ticks when `scale` is gone.
 */
export interface ObservablePlotElement extends Element {
  scale?: (name: string) => PlotScale | undefined;
  legend?: (name: string, options?: unknown) => Element | undefined;
}

/**
 * Options for {@link bindObservablePlot}.
 *
 * Every field is optional: the adapter's whole point is that a plot drawn by
 * somebody else, in a Quarto document it does not control, still becomes
 * navigable. These exist for the cases where the DOM cannot carry the intent —
 * a chart with no title, an axis Plot labelled from a column name, or a mark
 * whose type the adapter would otherwise have to guess.
 */
export interface ObservablePlotOptions {
  /** Figure id. Generated when omitted. */
  id?: string;
  /** Chart title. Overrides the `<h2>` Plot renders from its `title` option. */
  title?: string;
  /** Chart subtitle. Overrides Plot's `<h3>`. */
  subtitle?: string;
  /** Chart caption. Overrides Plot's `<figcaption>`. */
  caption?: string;
  /** Axis labels. Each overrides the label Plot drew for that axis. */
  axes?: {
    x?: string;
    y?: string;
    z?: string;
  };
  /**
   * Forces the MAIDR trace type of a mark, keyed by the mark's Plot
   * `aria-label`.
   *
   * Three keys are read. `rect` takes `TraceType.HISTOGRAM`: a `rect` mark is
   * otherwise taken for a histogram when both axes are continuous and for a
   * bar chart when one is categorical, which is right for the marks Plot's own
   * examples produce. A binned rect drawn against a categorical axis is the
   * case that needs telling. `dot` takes `TraceType.HEXBIN`, for hexagons a
   * `symbol: 'hexagon'` scatter draws just the same. `line` takes
   * `TraceType.PR_CURVE`, for a precision-recall curve whose axes are not
   * labelled `recall` and `precision`; its points must still be fractions of
   * one on both axes.
   *
   * Other keys are accepted and ignored, so a future release can honour them
   * without breaking a caller that set one.
   *
   * @example
   * markTypes: { rect: TraceType.HISTOGRAM }
   */
  markTypes?: Record<string, string>;
  /**
   * Fan charts drawn on the plot, each read as one `percentile_band` layer.
   *
   * `Plot.areaY` given `y1` and `y2` draws a band, and nothing in the drawn
   * chart says which quantiles its edges are, so a band is otherwise skipped.
   * Each mark is named by the `className` Plot puts on its group: `median`
   * names a `line` mark, and each band's `series` an `area` mark, with the
   * band's two levels as fractions. The values are read back out of the
   * paths, as every line and area is, and matched to the median by x.
   *
   * @example
   * // Plot.areaY(rows, {x: 'step', y1: 'p5', y2: 'p95', className: 'p90'}),
   * // Plot.lineY(rows, {x: 'step', y: 'p50', className: 'median'})
   * percentileBands: [{
   *   median: 'median',
   *   bands: [{ series: 'p90', lower: 0.05, upper: 0.95 }],
   * }]
   */
  percentileBands?: PercentileBandOption[];
  /**
   * When `false`, the schema is returned but not written to the DOM, and no
   * `maidr:bindchart` event fires. Use it to post-process the schema before
   * handing it to `<Maidr>` yourself.
   *
   * @defaultValue true
   */
  autoApply?: boolean;
}

/** What {@link bindObservablePlot} returns. */
export interface ObservablePlotResult {
  /** The generated MAIDR schema. */
  maidr: Maidr;
  /** The layers it contains, in mark order. */
  layers: MaidrLayer[];
  /** The element the schema was written to. */
  element: Element;
}

/** Options for {@link initObservablePlots}. */
export interface ObservableWatchOptions {
  /**
   * Root to watch for plots. Defaults to `document.body`.
   *
   * Quarto puts every OJS cell's output in `div[id^="ojs-cell-"]`, but those
   * divs are filled asynchronously and re-filled whenever a reactive input
   * changes, so the observer watches a stable ancestor rather than the cells.
   */
  root?: ParentNode;
  /** Options applied to every plot the observer binds. */
  plot?: ObservablePlotOptions;
  /**
   * Called after each successful bind. Useful for logging, or for
   * post-processing a schema the adapter inferred.
   */
  onBind?: (result: ObservablePlotResult) => void;
  /** Called when a plot fails to convert, instead of the console warning. */
  onError?: (error: unknown, element: Element) => void;
}

/**
 * One drawn element of a mark, paired with what it encodes.
 *
 * The adapter walks a mark group into these before it knows which MAIDR trace
 * type it is building, because the decision depends on what the walk finds —
 * two rects sharing a band make a stacked bar, one rect per band makes a plain
 * one.
 */
export interface MarkDatum {
  /** The rendered SVG element, for selector stamping. */
  element: Element;
  /** Value on the categorical or independent axis. */
  x: string | number;
  /** Value on the dependent axis. */
  y: number;
  /** Series name, from the mark's color channel, when the mark is split. */
  series?: string;
  /** Lower bound of a stacked segment or a bin, in data units. */
  yMin?: number;
  /** Upper bound of a stacked segment or a bin, in data units. */
  yMax?: number;
  /** Bin start, for binned rect marks. */
  xMin?: number;
  /** Bin end, for binned rect marks. */
  xMax?: number;
}

/**
 * @deprecated Renamed to {@link ObservableWatchOptions}. The options were never
 * Quarto's — they configure the watcher, which binds Plot charts on any page.
 * Kept so the released name goes on working; it will be removed in the next
 * major.
 */
export type QuartoObservableOptions = ObservableWatchOptions;
