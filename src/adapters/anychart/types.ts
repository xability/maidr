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

/** An individual series within a chart. */
export interface AnyChartSeries {
  id: () => string | number;
  name: () => string;
  seriesType: () => string;
  getIterator: () => AnyChartIterator;
  getPoint: (index: number) => AnyChartPoint;
  getStat: (key: string) => unknown;
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
