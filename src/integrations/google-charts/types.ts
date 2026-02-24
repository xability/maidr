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
 * Common interface shared by all Google visualization chart types.
 */
export interface GoogleChart {
  getSelection: () => GoogleSelectionItem[];
  setSelection: (selection: GoogleSelectionItem[]) => void;
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
    | 'ColumnChart'
    | 'LineChart'
    | 'ScatterChart'
    | 'Histogram'
    | 'CandlestickChart'
    | 'ComboChart';
