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
 * Google Charts event helper namespace.
 */
export interface GoogleEvents {
  addListener: (
    chart: GoogleChart,
    eventName: string,
    handler: (...args: unknown[]) => void,
  ) => { remove: () => void };
  removeAllListeners: (chart: GoogleChart) => void;
}

/**
 * Supported Google Charts chart type strings that the adapter can convert.
 */
export type GoogleChartType
  = | 'AreaChart'
    | 'BarChart'
    | 'CandlestickChart'
    | 'ColumnChart'
    | 'LineChart'
    | 'ScatterChart'
    | 'ComboChart'
    | 'StackedColumnChart'
    | 'StackedBarChart'
    | 'NormalizedColumnChart'
    | 'NormalizedBarChart'
    | 'DodgedColumnChart'
    | 'DodgedBarChart'
    | 'Heatmap';
