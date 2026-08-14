/**
 * Minimal type declarations for the Vega / Vega-Lite API surface used by
 * the MAIDR Vega-Lite adapter.
 *
 * Vega and Vega-Lite are **peer dependencies** of MAIDR. The adapter only
 * references their public API through these lightweight aliases so that the
 * MAIDR bundle does not ship the libraries.
 *
 * @see https://vega.github.io/vega-lite/
 */

/**
 * Minimal subset of a Vega `View` that the adapter needs at runtime.
 *
 * The compiled view exposes processed datasets (post-transform / aggregate)
 * via {@link VegaView.data}, which is the most accurate source for chart
 * data extraction.
 *
 * {@link VegaView.runAsync} is used by the adapter to wait for the first
 * render frame to complete, which guarantees the SVG element exists in the
 * container before MAIDR tries to mount on it.
 */
export interface VegaView {
  data: (name: string) => Record<string, unknown>[];
  container: () => HTMLElement | null;
  runAsync: () => Promise<VegaView>;
  /**
   * Look up a Vega scale by name (e.g. `'x'`, `'y'`, `'color'`).
   *
   * Returns `undefined` if the scale doesn't exist. The scale's
   * `domain()` provides the **rendered** domain in the order Vega uses
   * to lay out marks — used by the adapter to align data ordering with
   * the SVG DOM order so MAIDR's index-based highlighting matches the
   * visible chart.
   */
  scale: (name: string) => { domain: () => unknown[] } | undefined;
  /**
   * Serialise the view's state. The adapter uses it for one thing only:
   * enumerating the **names** of every registered dataset, so it can reach
   * pipelines it cannot address by a name it derived.
   *
   * Two details of the real signature are easy to get wrong, and both fail
   * silently — see `getViewDatasetNames`:
   *
   *  - `data` is a **predicate**, not a boolean. Vega throws
   *    `options.data is not a function` when handed `true`.
   *  - The returned values are Vega's internal state descriptors, **not**
   *    rows. Use {@link VegaView.data} to read records.
   *
   * Optional because the adapter must tolerate a view that predates it or
   * a host that stubs only part of the API.
   */
  getState?: (options?: {
    data?: (name?: string, object?: unknown) => boolean;
    signals?: (name?: string, operator?: unknown) => boolean;
    recurse?: boolean;
  }) => { data?: Record<string, unknown>; signals?: Record<string, unknown> } | undefined;
}

/**
 * Top-level `facet` operator definition.
 *
 * Two shapes exist in Vega-Lite:
 *   - Row/column faceting: `{ row?: {field}, column?: {field} }`.
 *   - Wrapped faceting: a single field definition (`{ field, type }`)
 *     combined with the top-level `columns` property.
 */
export interface VegaLiteFacetDef {
  row?: VegaLiteChannelDef;
  column?: VegaLiteChannelDef;
  field?: string;
  type?: string;
  title?: string;
}

/**
 * Top-level `repeat` operator definition.
 *
 * Either a plain field array (wrapped layout, combined with `columns`)
 * or `{ row?: string[], column?: string[] }` for a repeat grid.
 */
export type VegaLiteRepeatDef = string[] | { row?: string[]; column?: string[] };

/**
 * Minimal Vega-Lite top-level specification shape.
 *
 * Covers single-view, layered (`layer`), composite (`hconcat` / `vconcat`
 * / `concat`), faceted (`facet` operator or `encoding.row` /
 * `encoding.column` shorthand), and repeated (`repeat`) specs.
 */
export interface VegaLiteSpec {
  $schema?: string;
  title?: string | { text?: string; subtitle?: string };
  description?: string;
  data?: unknown;
  transform?: VegaLiteTransform[];
  /**
   * The mark, as a shorthand string or a mark def. `interpolate` is how
   * Vega-Lite joins consecutive points: the `step`, `step-before` and
   * `step-after` values draw a piecewise-constant staircase, the rest
   * interpolate. `innerRadius` is what turns an `arc` pie into a doughnut —
   * purely visual, so the two convert identically. `extent` is how far a
   * composite mark's interval reaches — `stderr`, `ci`, `stdev`, `iqr` —
   * which the adapter reads only when it has to aggregate the raw
   * observations itself.
   */
  mark?: string | {
    type: string;
    interpolate?: string;
    innerRadius?: number;
    extent?: string;
  };
  encoding?: VegaLiteEncoding;
  layer?: VegaLiteSpec[];
  hconcat?: VegaLiteSpec[];
  vconcat?: VegaLiteSpec[];
  concat?: VegaLiteSpec[];
  facet?: VegaLiteFacetDef;
  spec?: VegaLiteSpec;
  repeat?: VegaLiteRepeatDef;
  /**
   * Wrap column count for `concat`, wrapped `facet` (single-field form),
   * and wrapped `repeat` (array form). Vega-Lite's default when omitted
   * is an unbounded number of columns (a single row).
   */
  columns?: number;
}

/**
 * The encoding channels that the adapter inspects when mapping a
 * Vega-Lite spec to a MAIDR trace.
 */
export interface VegaLiteEncoding {
  x?: VegaLiteChannelDef;
  y?: VegaLiteChannelDef;
  /**
   * Secondary positional channels — the far end of a mark that spans a
   * range instead of standing on a baseline.
   *
   * A `bar` carrying `x` **and** `x2` draws an interval between two
   * positions on the same axis rather than a magnitude measured from zero,
   * which is what a gantt chart, a ranged bar and a waterfall step all
   * are. Vega-Lite's own `y2` accepts a `datum` constant as well as a
   * field, so the adapter checks for a *field* before reading either as an
   * interval: a constant baseline is a bar drawn the ordinary way.
   */
  x2?: VegaLiteChannelDef;
  /** Vertical counterpart of `x2`. */
  y2?: VegaLiteChannelDef;
  /**
   * Modern Vega-Lite dodge channel — when paired with a categorical
   * `field`, Vega-Lite places bars of each subcategory **side-by-side**
   * within the same x slot. The adapter inspects this to classify a
   * `bar` mark as DODGED rather than STACKED.
   */
  xOffset?: VegaLiteChannelDef;
  /** Vertical counterpart of `xOffset`. */
  yOffset?: VegaLiteChannelDef;
  /**
   * Angular extent of an `arc` mark — the channel that makes one a pie (or,
   * with `mark.innerRadius`, a doughnut). It carries the slice magnitudes;
   * the slice labels come from `color`/`fill`, since an arc has no x or y.
   */
  theta?: VegaLiteChannelDef;
  /**
   * Radial extent of an `arc` mark — the channel that turns a pie into a
   * polar area (coxcomb, rose) chart, where the wedge's *radius* carries
   * the magnitude and the angle only says which category it is.
   *
   * A pie may also set a radius, but as a constant (`{value: 100}`) or a
   * scale tweak rather than a data field, so only a bound `field` marks
   * the mark as radial.
   */
  radius?: VegaLiteChannelDef;
  color?: VegaLiteChannelDef;
  fill?: VegaLiteChannelDef;
  /**
   * Grouping without a visual channel: it splits one mark into several
   * without colouring or otherwise marking them apart. Vega-Lite's ranged
   * dot plot uses it to draw one connector per category.
   *
   * Modelled so such a spec type-checks, not dispatched on: the same chart
   * puts its grouping on `detail` in one layer and on `color` in the next,
   * so the adapter decides whether the rows really are paired by looking at
   * the rows.
   */
  detail?: VegaLiteChannelDef;
  row?: VegaLiteChannelDef;
  column?: VegaLiteChannelDef;
}

/**
 * Subset of a Vega-Lite channel definition fields read by the adapter.
 *
 * Note on `field`: inside a `repeat` spec's child, Vega-Lite allows a
 * repeat reference object (`{ repeat: 'row' | 'column' | 'repeat' }`)
 * instead of a field name. The adapter substitutes those references with
 * concrete field names (per repeated cell) *before* any conversion runs,
 * so every code path past `substituteRepeatFields` only ever sees strings.
 */
export interface VegaLiteChannelDef {
  field?: string;
  /**
   * A constant bound to the channel instead of a data field
   * (`{"color": {"datum": "Adelie"}}`).
   *
   * Vega-Lite's documented idiom for giving each child of a `layer:` spec
   * its own legend entry; Altair emits it for `color=alt.datum(name)`.
   * Because the constant *is* the series' display name, the adapter uses
   * it to label layers that a merge would otherwise leave anonymous.
   */
  datum?: string | number | boolean;
  type?: string;
  aggregate?: string;
  title?: string;
  axis?: { title?: string } | null;
  bin?: boolean | Record<string, unknown>;
  stack?: boolean | string | null;
}

/**
 * The object form of a `filter` transform predicate.
 *
 * Vega-Lite accepts either a predicate object (`{field, equal}`) or a raw
 * expression string; Altair emits the former for
 * `alt.FieldEqualPredicate(...)` and the latter for `alt.datum.f == v`.
 */
export interface VegaLiteFilterPredicate {
  field?: string;
  equal?: string | number | boolean;
}

/**
 * A single entry of a spec's `transform` array.
 *
 * Only the transforms that tell one chart from another are modelled.
 * `filter` identifies the subset of the data a layer draws, and is
 * therefore the only one that can name a per-group layer; `window`,
 * `fold` and `density` each mark a chart whose mark alone does not say
 * what it is. Every other transform (`aggregate`, `calculate`,
 * `joinaggregate`, …) is passed over.
 */
export interface VegaLiteTransform {
  filter?: string | VegaLiteFilterPredicate;
  /**
   * Window operations, of which the adapter reads two things.
   *
   * A running `sum` is what separates a waterfall from any other ranged
   * bar: both draw a floating bar between `y` and `y2`, but a waterfall's
   * two bounds are consecutive running totals, and a running total is a
   * `window` sum. A ranged bar whose bounds are two measured values (a
   * monthly temperature low and high, say) has no such transform, and
   * announcing its bounds as contributions to a total would invent an
   * accumulation the chart does not draw.
   *
   * A `rank` is what separates a bump chart from any other line chart:
   * the y axis carries a *place in a table* rather than a magnitude, and
   * Vega-Lite has one way to compute one. `as` is required by the
   * Vega-Lite schema for every window operation, so the ranked column is
   * always named.
   */
  window?: { op?: string; field?: string; as?: string }[];
  /**
   * The columns a `fold` transform turns into rows.
   *
   * That is how a parallel coordinates plot is built: several variables
   * are folded into one `key` / `value` pair so a single `line` mark can
   * draw one polyline per observation across all of them. No Vega-Lite
   * mark says "parallel coordinates"; the fold does.
   */
  fold?: string[];
  /** The field a `density` transform estimates a distribution over. */
  density?: string;
  /** The grouping keys of a `density` or `aggregate` transform. */
  groupby?: string[];
  /**
   * The output column names of whichever transform declares them.
   *
   * `fold` and `density` both emit a pair (`["key", "value"]` and
   * `["value", "density"]` by default); `calculate` and friends emit one.
   */
  as?: string | string[];
  [key: string]: unknown;
}

/**
 * Options accepted by the {@link vegaLiteToMaidr} converter.
 */
export interface VegaLiteToMaidrOptions {
  /** Override the chart id (defaults to `"vl-chart"`). */
  id?: string;
  /** Override the chart title (extracted from the spec by default). */
  title?: string;
  /**
   * Override how MAIDR maps the rendered SVG of a segmented (stacked /
   * normalised / dodged) bar trace back onto the 2-D `data[seriesIndex][barIndex]`
   * grid. Supplied as a hint to {@link MaidrLayer.domMapping}.
   *
   * - `'series-major'` — DOM emits **all bars of one colour** before
   *   moving to the next colour. This is Vega-Lite's default for
   *   stacked / normalised bars.
   * - `'subject-major'` — DOM emits **all colours of one x-subject**
   *   before moving to the next subject. This is Vega-Lite's default
   *   for dodged bars.
   *
   * Leave undefined to use the type-based defaults
   * (stacked/normalised → series-major, dodged → subject-major).
   * Only set this if your Vega-Lite spec uses a non-default mark order
   * or transform that changes the DOM emission sequence.
   */
  domOrder?: 'series-major' | 'subject-major';
}
