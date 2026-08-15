/**
 * Minimal type definitions for AnyChart chart instances.
 *
 * These types describe the subset of the AnyChart API that the MAIDR adapter
 * needs in order to extract chart metadata, series data, and SVG elements.
 * They are intentionally narrow to avoid a hard dependency on the AnyChart
 * library while still providing type safety for the adapter code.
 */

/** Iterator for traversing data rows in an AnyChart data view. */
export interface AnyChartIterator {
  advance: () => boolean;
  get: (field: string) => unknown;
  getIndex: () => number;
  getRowsCount: () => number;
  reset: () => void;
}

/** A wrapped data point returned by `series.getPoint(index)`. */
export interface AnyChartPoint {
  get: (field: string) => unknown;
  getIndex: () => number;
  exists: () => boolean;

  /**
   * The bound geo feature's own properties, on a point of a map series.
   *
   * This is where a region's human-readable name lives: the data row carries
   * only the id it was matched on (`'US.CA'`), and the name (`'California'`)
   * belongs to the feature the geodata declared. Absent on every non-map
   * series, and on builds that predate the map module's point API — the
   * region then keeps the id as its name, which is poorer but still true.
   */
  getFeatureProp?: () => unknown;

  /**
   * The drawn bounds of the bound geo feature, in the stage's pixels.
   *
   * The only handle a map offers on WHICH shape it drew for a region:
   * AnyChart paints every feature of the geodata, not only the rows it was
   * given, and the paths carry no id. Matching a path's own box against this
   * is what lets a region be highlighted rather than counted off.
   */
  getFeatureBounds?: () => unknown;
}

/** A data view (mapping / set) backing a series. */
export interface AnyChartDataView {
  getIterator: () => AnyChartIterator;
}

/**
 * Marker configuration for a series.
 *
 * Returned by `series.markers()` on line / area / spline / scatter series.
 * Calling `enabled(true)` turns on visible marker rendering, which is what
 * MAIDR relies on to stamp per-point highlight attributes.
 */
export interface AnyChartMarkers {
  /**
   * Getter / setter. With no argument, returns the current enabled state.
   * With a boolean argument, enables or disables marker rendering.
   */
  enabled: ((value: boolean) => AnyChartMarkers) & (() => boolean);
}

/** An individual series within a chart. */
export interface AnyChartSeries {
  id: () => string | number;
  name: () => string;
  seriesType: () => string;
  /**
   * Some AnyChart series expose `getIterator()` directly, while in
   * production builds the iterator must be obtained via the data view
   * returned by `series.data()`. The adapter handles both shapes.
   */
  getIterator?: () => AnyChartIterator;
  data?: () => AnyChartDataView;
  getPoint: (index: number) => AnyChartPoint;
  getStat: (key: string) => unknown;
  /**
   * Marker configuration accessor.
   *
   * Only present on series types that support marker rendering
   * (line, spline, step-line, area variants, scatter). Bar / column / box /
   * candlestick series do not expose this method.
   */
  markers?: () => AnyChartMarkers;
}

/**
 * One node of the task tree backing a gantt chart.
 *
 * A gantt is the one AnyChart chart type whose data is neither a series nor a
 * flat data view: `chart.data()` hands back an `anychart.data.Tree` whose
 * items carry `actualStart` / `actualEnd` (a project chart) or a `periods`
 * array (a resource chart), and whose children are the rows drawn beneath
 * their parent.
 */
export interface AnyChartTreeItem {
  /** Reads one field of the task — `'name'`, `'actualStart'`, `'periods'`. */
  get: (field: string) => unknown;
  /**
   * Reads a value the chart computed for the task rather than one the author
   * wrote. A parent task states no dates of its own: AnyChart derives them
   * from its children and stores them as `'autoStart'` / `'autoEnd'`.
   */
  meta?: (key: string) => unknown;
  numChildren?: () => number;
  getChildAt?: (index: number) => AnyChartTreeItem | null;
}

/** The task tree returned by a gantt chart's `data()`. */
export interface AnyChartTree {
  numChildren: () => number;
  getChildAt: (index: number) => AnyChartTreeItem | null;
}

/** Title object returned by `chart.title()`. */
export interface AnyChartTitle {
  text: () => string | undefined;
}

/** Axis label configuration. */
export interface AnyChartAxisLabels {
  enabled: () => boolean;
}

/** Axis title configuration. */
export interface AnyChartAxisTitle {
  text: () => string | undefined;
}

/** An axis instance on a Cartesian chart. */
export interface AnyChartAxis {
  title: () => AnyChartAxisTitle;
  labels: () => AnyChartAxisLabels;
}

/**
 * A scale bound to one of a Cartesian chart's axes.
 *
 * Only the stacking mode is read. Stacking is a property of the SCALE rather
 * than of a series — AnyChart reports every area series as `'area'` whether or
 * not the chart sums them — so the series API cannot answer whether the bands
 * sit on one another.
 */
export interface AnyChartScale {
  /**
   * `'none'` on an ordinary scale, `'value'` when series are summed, and
   * `'percent'` when they are drawn as shares of a common total. Absent on
   * scale types that cannot stack (an ordinal x scale, a colour scale).
   */
  stackMode?: () => string;

  /**
   * The scale's own kind: `'ordinal'`, `'linear'`, `'log'`, `'date-time'`.
   *
   * Read on the X scale only, and only to answer one question: whether the
   * categories are named or measured. A `marker` series on an ordinal x scale
   * is a Cleveland dot plot rather than a scatter, and nothing on the series
   * itself says so.
   */
  getType?: () => string;
}

/** Rendering stage / container element. */
export interface AnyChartStage {
  container: () => HTMLElement | null;
  domElement: () => HTMLElement | null;
  /**
   * Register a one-shot listener for a Stage event such as
   * `'stagerendered'`. AnyChart fires `'stagerendered'` after the chart SVG
   * has been attached to the DOM, in both sync and async render modes.
   */
  listenOnce?: (event: string, handler: () => void) => void;
}

/**
 * The minimal chart interface the adapter requires.
 *
 * All supported AnyChart chart types (Cartesian, Pie, etc.) expose these
 * methods once the chart has been drawn.
 */
export interface AnyChartInstance {
  /** Chart title accessor. */
  title: () => AnyChartTitle | string;

  /** Rendering container / stage. */
  container: () => AnyChartStage | HTMLElement | string;

  /** Number of series in the chart. */
  getSeriesCount: () => number;

  /** Get a series by its numeric index. */
  getSeriesAt: (index: number) => AnyChartSeries | null;

  /** X-axis accessor (Cartesian charts). Returns null for non-Cartesian. */
  xAxis?: (index?: number) => AnyChartAxis | null;

  /** Y-axis accessor (Cartesian charts). Returns null for non-Cartesian. */
  yAxis?: (index?: number) => AnyChartAxis | null;

  /**
   * Y-scale accessor (Cartesian charts). Carries the chart's stacking mode,
   * which is what tells an area series apart from a stacked one — see
   * {@link AnyChartScale}. Absent on chart types with no Cartesian scales.
   */
  yScale?: () => AnyChartScale | null;

  /**
   * X-scale accessor (Cartesian charts). Only its {@link AnyChartScale.getType}
   * is read, to tell a dot plot's named categories from a scatter's measured
   * ones. Absent on chart types with no Cartesian scales.
   */
  xScale?: () => AnyChartScale | null;

  /** Chart type string (e.g. "bar", "line", "pie"). */
  getType?: () => string;

  /**
   * How a waterfall chart reads its series values (`'diff'` by default, or
   * `'absolute'`). In diff mode a row's `value` IS the step's contribution; in
   * absolute mode it is the running total the step arrives at. Present only on
   * a waterfall chart.
   */
  dataMode?: () => string;

  /**
   * Whether a waterfall draws a step marked `isTotal` at its own value rather
   * than at the running total it arrived at. Off by default, and present only
   * on a waterfall chart.
   */
  drawTotalsAsAbsolute?: () => boolean;

  /**
   * Chart-level data accessor. Present on single-dataset chart types such
   * as Heatmap, which do not expose a series-based API and instead store
   * their cells in a top-level data view. Absent on multi-series Cartesian
   * charts (bar, line, scatter, box, candlestick).
   *
   * A gantt chart answers with an {@link AnyChartTree} instead of a data
   * view — the two are told apart by whether the result can hand out an
   * iterator, never by the chart type alone.
   */
  data?: () => AnyChartDataView | AnyChartTree;

  /**
   * The geodata a map was bound to (`anychart.maps.*`), as GeoJSON or
   * TopoJSON. Read for one thing only: the region names, which the data rows
   * do not carry. Present on a map chart.
   */
  geoData?: () => unknown;

  /**
   * Which property of a geo feature the data rows' `id` is matched against.
   * Defaults to `'id'`. Present on a map chart.
   */
  geoIdField?: () => string | undefined;

  /** SVG string export. */
  toSvg?: () => string;
}

/**
 * Options the consumer can pass when binding an AnyChart chart to MAIDR.
 */
export interface AnyChartBinderOptions {
  /**
   * Override the chart ID used in the MAIDR schema.
   * Defaults to the chart container element's `id` attribute.
   */
  id?: string;

  /**
   * Override the chart title.
   * Defaults to `chart.title().text()`.
   */
  title?: string;

  /**
   * Override axis labels.
   */
  axes?: {
    x?: string;
    y?: string;
  };

  /**
   * Read this chart's bar series as the two sides of a diverging bar chart —
   * a tornado chart, or a population pyramid.
   *
   * Opt-in rather than inferred, because AnyChart has no diverging chart type
   * to detect. The idiom is an ordinary stacked `anychart.bar()` whose two
   * series straddle zero, and nothing distinguishes that from a stacked bar
   * chart that merely contains negative values — so guessing would rename an
   * ordinary chart, and a diverging trace announces a **side** in place of the
   * sign, which is exactly the clue a reader would need to catch the mistake.
   *
   * The sides are emitted signed, in declared order, as the chart draws them:
   * MAIDR takes the magnitude for the pitch and the sign for the side.
   *
   * @defaultValue false
   */
  diverging?: boolean;

  /**
   * CSS selector overrides for SVG element highlighting.
   *
   * Each element in the array corresponds to a series by index. Use
   * `undefined` at a given position to skip that series (no highlighting).
   *
   * AnyChart's internal SVG structure does not expose stable class names,
   * so consumers should inspect the rendered DOM and provide explicit
   * selectors for reliable highlighting.
   *
   * @example
   * ```ts
   * // Apply per-series selectors (2 series, second has none):
   * selectors: ['.series-0 rect', undefined]
   *
   * // Apply the same selector to all series:
   * selectors: ['.chart rect']
   * ```
   */
  selectors?: Array<string | string[] | undefined>;
}

/**
 * Chart input accepted by {@link anyChartsToMaidr} / {@link bindAnyCharts}.
 *
 * - A 2D array maps 1:1 onto the MAIDR subplot grid (`charts[row][col]`),
 *   in visual reading order (top-left panel first). Ragged rows are allowed;
 *   empty rows are not.
 * - A flat array is arranged into a grid according to
 *   {@link AnyChartsBinderOptions.layout}.
 */
export type AnyChartGridInput = AnyChartInstance[] | AnyChartInstance[][];

/**
 * Grid arrangement for a flat array of charts passed to
 * {@link anyChartsToMaidr} / {@link bindAnyCharts}.
 *
 * Charts are chunked row-major: with `columns: 2` and five charts, the grid
 * becomes `[[a, b], [c, d], [e]]`. When only `rows` is given, `columns`
 * defaults to `ceil(total / rows)`.
 */
export interface AnyChartsLayout {
  rows?: number;
  columns?: number;
}

/**
 * Options the consumer can pass when binding a multi-panel group of AnyChart
 * charts to MAIDR.
 *
 * Unlike {@link AnyChartBinderOptions}, `title` and `axes` here are
 * figure-level overrides: `title` becomes the whole figure's title, and
 * `axes` (when set) replaces the per-panel axis titles extracted from each
 * chart. Each panel's display name always comes from its own chart title.
 */
export interface AnyChartsBinderOptions {
  /** Override the figure ID used in the MAIDR schema. */
  id?: string;

  /** Figure-level title. Panel names come from each chart's own title. */
  title?: string;

  /** Figure-level axis-label overrides applied to every panel's layers. */
  axes?: {
    x?: string;
    y?: string;
  };

  /**
   * How to arrange a FLAT chart array into a grid. Ignored when `charts`
   * is already a 2D array.
   *
   * - `{ rows?, columns? }` — chunk row-major (see {@link AnyChartsLayout}).
   * - `'auto'` — derive the grid from each chart container's on-page
   *   position: containers are clustered into rows by their bounding-rect
   *   top and sorted left-to-right within each row. Requires every chart
   *   to have a resolvable, attached container.
   * - Omitted — a flat array becomes a single row.
   */
  layout?: AnyChartsLayout | 'auto';
}
