/**
 * Minimal type declarations for Google Charts API.
 *
 * These cover only the subset required by the MAIDR Google Charts adapter.
 * Google Charts is loaded via a CDN script tag and exposes its API on the
 * `google.visualization` namespace at runtime.
 *
 * @see https://developers.google.com/chart
 */

/**
 * Google Charts DataTable — the tabular data model backing every chart.
 */
export interface GoogleDataTable {
  getNumberOfRows: () => number;
  getNumberOfColumns: () => number;
  getValue: (rowIndex: number, columnIndex: number) => unknown;
  getFormattedValue: (rowIndex: number, columnIndex: number) => string;
  getColumnLabel: (columnIndex: number) => string;
  getColumnType: (columnIndex: number) => 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'timeofday';
  getColumnRole?: (columnIndex: number) => string;
}

/**
 * Google Charts selection item returned by `chart.getSelection()`.
 */
export interface GoogleSelectionItem {
  row: number | null;
  column: number | null;
}

/**
 * Bounding box returned by `getChartLayoutInterface().getBoundingBox()`.
 */
export interface GoogleBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Chart layout interface for accessing element positions.
 *
 * @see https://developers.google.com/chart/interactive/docs/gallery/columnchart#methods
 */
export interface GoogleChartLayoutInterface {
  /**
   * Returns the bounding box of a chart element.
   *
   * For bar/column charts, use IDs like:
   *   - `'bar#seriesIndex#dataIndex'` — e.g., `'bar#0#2'` for series 0, bar 2
   *   - `'chartarea'` — the entire chart area
   *   - `'hAxis'`, `'vAxis'` — axis elements
   *
   * @param id - The element ID string
   * @returns Bounding box with left, top, width, height, or null if not found
   */
  getBoundingBox: (id: string) => GoogleBoundingBox | null;

  /**
   * Returns the pixel x-coordinate of a data value relative to the chart container's left edge.
   *
   * @param dataValue - The data value on the horizontal axis
   * @param axisIndex - Optional axis index for charts with multiple axes (default: 0)
   * @returns The pixel x-coordinate
   */
  getXLocation: (dataValue: number, axisIndex?: number) => number;

  /**
   * Returns the pixel y-coordinate of a data value relative to the chart container's top edge.
   *
   * @param dataValue - The data value on the vertical axis
   * @param axisIndex - Optional axis index for charts with multiple axes (default: 0)
   * @returns The pixel y-coordinate
   */
  getYLocation: (dataValue: number, axisIndex?: number) => number;
}

/**
 * Common interface shared by all Google visualization chart types.
 */
export interface GoogleChart {
  getSelection: () => GoogleSelectionItem[];
  setSelection: (selection: GoogleSelectionItem[]) => void;
  /**
   * Returns the chart layout interface for accessing element positions.
   *
   * @see https://developers.google.com/chart/interactive/docs/gallery/columnchart#methods
   */
  getChartLayoutInterface: () => GoogleChartLayoutInterface;
}

/**
 * Opaque listener handle returned by the Google Charts event helpers.
 *
 * The real handle exposes only `getKey()`; listeners are detached by passing
 * the handle back to {@link GoogleEvents.removeListener} (there is no
 * `remove()` method on the handle itself).
 */
export interface GoogleListenerHandle {
  getKey: () => unknown;
}

/**
 * Google Charts event helper namespace (`google.visualization.events`).
 *
 * @see https://developers.google.com/chart/interactive/docs/reference#events
 */
export interface GoogleEvents {
  addListener: (
    chart: GoogleChart,
    eventName: string,
    handler: (...args: unknown[]) => void,
  ) => GoogleListenerHandle;
  addOneTimeListener: (
    chart: GoogleChart,
    eventName: string,
    handler: (...args: unknown[]) => void,
  ) => GoogleListenerHandle;
  removeListener: (handle: GoogleListenerHandle) => boolean;
  removeAllListeners: (chart: GoogleChart) => void;
}

/**
 * The subset of `google.visualization.Gauge`'s draw options that decide what
 * a dial *means* rather than what it looks like.
 *
 * The adapter is handed the chart, the DataTable and the container, never the
 * options, and a gauge keeps its whole scale in the options: without them a
 * dial's value has no range to sit in and no band to land in, which is the
 * entire reading. Pass the same object given to `chart.draw(…)`.
 *
 * @see https://developers.google.com/chart/interactive/docs/gallery/gauge#configuration-options
 */
export interface GoogleGaugeOptions {
  /** Lower end of every dial. Google's own default is 0. */
  min?: number;
  /** Upper end of every dial. Google's own default is 100. */
  max?: number;
  /** Lower edge of the green band. */
  greenFrom?: number;
  /** Upper edge of the green band. */
  greenTo?: number;
  /** Lower edge of the yellow band. */
  yellowFrom?: number;
  /** Upper edge of the yellow band. */
  yellowTo?: number;
  /** Lower edge of the red band. */
  redFrom?: number;
  /** Upper edge of the red band. */
  redTo?: number;
}

/**
 * Supported Google Charts chart type strings that the adapter can convert.
 */
export type GoogleChartType
  = | 'AreaChart'
    | 'BarChart'
    | 'CandlestickChart'
    | 'ColumnChart'
    /**
     * A `BarChart` whose two series are drawn back to back, one of them
     * negated — a population pyramid, or a Likert scale split around a
     * neutral midpoint.
     *
     * Not a Google class: the sign in the DataTable is the only thing that
     * distinguishes it from a stacked bar, and a stacked bar may legitimately
     * carry negative values too.
     */
    | 'DivergingBarChart'
    /** A `ColumnChart` drawn back to back. See `DivergingBarChart`. */
    | 'DivergingColumnChart'
    | 'DodgedBarChart'
    | 'DodgedColumnChart'
    /**
     * A `LineChart` drawn with `lineWidth: 0` and a `pointSize` — Google's
     * recipe for a Cleveland dot plot.
     *
     * Not a Google class: `lineWidth` lives in the draw options, so a dot plot
     * and a line chart are the same class over the same table.
     */
    | 'DotChart'
    /**
     * An ordered `BarChart` of stage counts.
     *
     * Not a Google class at all: a funnel is a recipe. The adapter reads the
     * stages and lets `FunnelTrace` derive the retention between them.
     */
    | 'FunnelChart'
    /** `google.charts.Gantt`, from the `gantt` package. */
    | 'Gantt'
    /**
     * `google.visualization.Gauge`, from the `gauge` package.
     *
     * Pass the draw options as {@link GoogleChartAdapterOptions.gaugeOptions};
     * a dial's range and bands live there and nowhere else.
     */
    | 'Gauge'
    /**
     * `google.visualization.GeoChart`, from the `geochart` package, in either
     * of its modes — shaded regions or placed markers.
     */
    | 'GeoChart'
    | 'LineChart'
    /**
     * A `ComboChart` drawing a thin bar series and a large-point line series
     * over the same values.
     *
     * Not a Google class: the recipe duplicates the value column so the stems
     * and the dots can be styled apart, which the generic path would read as
     * two series.
     */
    | 'LollipopChart'
    /**
     * An `AreaChart` drawn with `isStacked: 'percent'`.
     *
     * Not a Google class: the adapter never sees the draw options, so a
     * percent-stacked area has to be named by the caller.
     */
    | 'NormalizedAreaChart'
    /** Also covers doughnuts, which Google draws as a `PieChart` with a `pieHole`. */
    | 'PieChart'
    /** `google.visualization.Sankey`, from the `sankey` package. */
    | 'Sankey'
    | 'ScatterChart'
    /** An `AreaChart` drawn with `isStacked: true`. See `NormalizedAreaChart`. */
    | 'StackedAreaChart'
    | 'StackedBarChart'
    | 'StackedColumnChart'
    /** `google.visualization.Timeline`, from the `timeline` package. */
    | 'Timeline'
    /** `google.visualization.TreeMap`, from the `treemap` package. */
    | 'TreeMap'
    /**
     * A `CandlestickChart` used as floating bars — low set to open and high to
     * close, so the wick collapses onto the body and each step is drawn
     * between its running total before and after.
     *
     * Not a Google class: there is no waterfall in the gallery. Name the
     * opening, closing and subtotal rows with
     * {@link GoogleChartAdapterOptions.waterfallTotals}.
     */
    | 'WaterfallChart';
