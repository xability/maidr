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

  /** Chart type string (e.g. "bar", "line", "pie"). */
  getType?: () => string;

  /**
   * Chart-level data accessor. Present on single-dataset chart types such
   * as Heatmap, which do not expose a series-based API and instead store
   * their cells in a top-level data view. Absent on multi-series Cartesian
   * charts (bar, line, scatter, box, candlestick).
   */
  data?: () => AnyChartDataView;

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
