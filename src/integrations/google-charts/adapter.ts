/**
 * Google Charts → MAIDR adapter.
 *
 * Extracts data from a Google Charts DataTable and chart instance, producing
 * a MAIDR JSON schema that the core MAIDR library can consume.
 *
 * @module
 */

import type {
  BarPoint,
  CandlestickPoint,
  CandlestickTrend,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '../../type/grammar';
import type { GoogleChartType, GoogleDataTable } from './types';
import { Orientation, TraceType } from '../../type/grammar';

// ---------------------------------------------------------------------------
// Monotonic counter for generating collision-free IDs when multiple charts
// are created synchronously (Date.now() alone would collide).
// ---------------------------------------------------------------------------

let idCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createMaidrFromGoogleChart}.
 */
export interface GoogleChartAdapterOptions {
  /** Unique ID for the MAIDR instance. Defaults to the container element's `id`. */
  id?: string;
  /** Chart title. Extracted from chart options when omitted. */
  title?: string;
  /**
   * The Google Charts chart type string (e.g. `'BarChart'`, `'LineChart'`).
   * Must be provided because the chart instance does not expose its own type.
   *
   * For stacked, normalized, or grouped (dodged) variants of bar / column
   * charts, use the explicit adapter type strings such as
   * `'StackedColumnChart'`, `'NormalizedBarChart'`, or `'DodgedColumnChart'`.
   */
  chartType: GoogleChartType;
}

/**
 * Creates a MAIDR data object from a rendered Google Charts chart.
 *
 * Call this **after** the chart has finished rendering (inside the
 * `google.visualization.events.addListener(chart, 'ready', …)` callback)
 * so that the container DOM already contains the SVG elements.
 *
 * @param _chart    - The Google Charts chart instance. Reserved for future
 *                    bidirectional selection sync; not read today.
 * @param dataTable - The `google.visualization.DataTable` (or DataView) used
 *                    to draw the chart.
 * @param container - The DOM element the chart was drawn into.
 * @param options   - Adapter options (chart type is required).
 * @returns A {@link Maidr} object ready to be passed to `<Maidr data={…}>` or
 *          set as the `maidr` / `maidr-data` attribute.
 *
 * @example
 * ```js
 * google.charts.load('current', { packages: ['corechart'] });
 * google.charts.setOnLoadCallback(() => {
 *   const data = google.visualization.arrayToDataTable([
 *     ['City', 'Population'],
 *     ['New York', 8336817],
 *     ['Los Angeles', 3979576],
 *   ]);
 *   const container = document.getElementById('chart');
 *   const chart = new google.visualization.ColumnChart(container);
 *
 *   google.visualization.events.addListener(chart, 'ready', () => {
 *     const maidr = createMaidrFromGoogleChart(chart, data, container, {
 *       chartType: 'ColumnChart',
 *     });
 *     container.setAttribute('maidr', JSON.stringify(maidr));
 *   });
 *
 *   chart.draw(data);
 * });
 * ```
 */
export function createMaidrFromGoogleChart(
  _chart: unknown,
  dataTable: GoogleDataTable,
  container: HTMLElement,
  options: GoogleChartAdapterOptions,
): Maidr {
  const id = options.id ?? container.id ?? nextId('maidr-gc');
  const title = options.title ?? '';

  // Assign a stable container id up-front (used for scoped CSS selectors).
  ensureContainerId(container);

  const layer = buildLayer(dataTable, container, options.chartType);

  const subplot: MaidrSubplot = { layers: [layer] };

  return {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

// ---------------------------------------------------------------------------
// Layer builders — one per supported chart type
// ---------------------------------------------------------------------------

function buildLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  chartType: GoogleChartType,
): MaidrLayer {
  switch (chartType) {
    case 'ColumnChart':
      return buildBarOrSegmentedLayer(dt, container, Orientation.VERTICAL);
    case 'BarChart':
      return buildBarOrSegmentedLayer(dt, container, Orientation.HORIZONTAL);
    case 'LineChart':
    case 'AreaChart':
      return buildLineLayer(dt, container);
    case 'ScatterChart':
      return buildScatterLayer(dt, container);
    case 'Histogram':
      return buildHistogramLayer(dt, container);
    case 'CandlestickChart':
      return buildCandlestickLayer(dt, container);
    case 'ComboChart':
      console.warn(
        '[maidr/google-charts] ComboChart is mapped as a bar chart. '
        + 'Non-bar series (lines, areas, etc.) are not represented. '
        + 'For full fidelity, convert each series type individually.',
      );
      return buildBarOrSegmentedLayer(dt, container, Orientation.VERTICAL);
    case 'StackedColumnChart':
      return buildSegmentedLayer(dt, container, Orientation.VERTICAL, TraceType.STACKED);
    case 'StackedBarChart':
      return buildSegmentedLayer(dt, container, Orientation.HORIZONTAL, TraceType.STACKED);
    case 'NormalizedColumnChart':
      return buildSegmentedLayer(dt, container, Orientation.VERTICAL, TraceType.NORMALIZED);
    case 'NormalizedBarChart':
      return buildSegmentedLayer(dt, container, Orientation.HORIZONTAL, TraceType.NORMALIZED);
    case 'DodgedColumnChart':
      return buildSegmentedLayer(dt, container, Orientation.VERTICAL, TraceType.DODGED);
    case 'DodgedBarChart':
      return buildSegmentedLayer(dt, container, Orientation.HORIZONTAL, TraceType.DODGED);
    case 'Heatmap':
      return buildHeatmapLayer(dt, container);
    default:
      throw new Error(
        `Unsupported Google Charts type: ${chartType as string}. `
        + 'Supported types: AreaChart, BarChart, CandlestickChart, ColumnChart, '
        + 'ComboChart, DodgedBarChart, DodgedColumnChart, Heatmap, Histogram, '
        + 'LineChart, NormalizedBarChart, NormalizedColumnChart, ScatterChart, '
        + 'StackedBarChart, StackedColumnChart.',
      );
  }
}

// ---------------------------------------------------------------------------
// Bar / Column — auto-detects single vs multi-series
// ---------------------------------------------------------------------------

/**
 * Inspects the DataTable and delegates to {@link buildBarLayer} for a single
 * data column, or to {@link buildSegmentedLayer} when multiple data columns
 * are present (grouped / dodged layout).
 */
function buildBarOrSegmentedLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
): MaidrLayer {
  const dataColCount = countDataColumns(dt);
  if (dataColCount > 1) {
    return buildSegmentedLayer(dt, container, orientation, TraceType.DODGED);
  }
  return buildBarLayer(dt, container, orientation);
}

function buildBarLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
): MaidrLayer {
  const data: BarPoint[] = [];
  const rows = dt.getNumberOfRows();

  for (let r = 0; r < rows; r++) {
    const label = formatCellValue(dt, r, 0);
    const value = numericValue(dt, r, 1);
    data.push({ x: label, y: value });
  }

  const selector = buildDataSelector(container, 'rect');

  return {
    id: nextId('layer'),
    type: TraceType.BAR,
    orientation,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: dt.getColumnLabel(1) || undefined,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Segmented bars (stacked, dodged / grouped, normalized)
// ---------------------------------------------------------------------------

function buildSegmentedLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
  traceType: TraceType.STACKED | TraceType.DODGED | TraceType.NORMALIZED,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  // Each data column (1 .. cols-1) represents a group/fill level.
  // The result is an array-of-arrays: one inner array per group/fill.
  const data: SegmentedPoint[][] = [];

  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;
    const series: SegmentedPoint[] = [];
    const fillLabel = dt.getColumnLabel(c) || `Series ${c}`;

    for (let r = 0; r < rows; r++) {
      const label = formatCellValue(dt, r, 0);
      const value = numericValue(dt, r, c);
      series.push({ x: label, y: value, fill: fillLabel });
    }
    data.push(series);
  }

  const selector = buildDataSelector(container, 'rect');

  return {
    id: nextId('layer'),
    type: traceType,
    orientation,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: dt.getColumnLabel(1) || undefined,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Line / Area
// ---------------------------------------------------------------------------

function buildLineLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  // Each data column (1 .. cols-1) is a separate series.
  const data: LinePoint[][] = [];

  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;
    const series: LinePoint[] = [];
    for (let r = 0; r < rows; r++) {
      const x = formatCellValue(dt, r, 0);
      const y = numericValue(dt, r, c);
      const fill = dt.getColumnLabel(c) || `Series ${c}`;
      series.push({ x, y, fill });
    }
    data.push(series);
  }

  const selector = buildDataSelector(container, 'path[fill="none"]')
    || buildDataSelector(container, 'path');

  return {
    id: nextId('layer'),
    type: TraceType.LINE,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: dt.getColumnLabel(1) || undefined,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

function buildScatterLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: ScatterPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const x = numericValue(dt, r, 0);
    const y = numericValue(dt, r, 1);
    data.push({ x, y });
  }

  const selector = buildDataSelector(container, 'circle');

  return {
    id: nextId('layer'),
    type: TraceType.SCATTER,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: dt.getColumnLabel(1) || undefined,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

/**
 * Builds a histogram layer from a DataTable.
 *
 * Google Charts `Histogram` auto-computes bins from raw data, so the
 * DataTable contains individual observations rather than pre-binned counts.
 * Because the computed bin boundaries are not exposed via the DataTable API,
 * this adapter treats each row as a labelled data point and uses the row
 * value as the bar height. Consumers who need precise bin boundaries should
 * supply pre-binned data (label + count) in the DataTable.
 */
function buildHistogramLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: HistogramPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const label = formatCellValue(dt, r, 0);
    const value = numericValue(dt, r, 1);

    // Use the value itself for bin extents rather than meaningless row indices.
    data.push({
      x: label,
      y: value,
      xMin: value,
      xMax: value,
      yMin: 0,
      yMax: value,
    });
  }

  const selector = buildDataSelector(container, 'rect');

  return {
    id: nextId('layer'),
    type: TraceType.HISTOGRAM,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: dt.getColumnLabel(1) || undefined,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Candlestick
// ---------------------------------------------------------------------------

function buildCandlestickLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: CandlestickPoint[] = [];

  // Google Candlestick expects columns: label, low, open, close, high
  for (let r = 0; r < rows; r++) {
    const label = formatCellValue(dt, r, 0);
    const low = numericValue(dt, r, 1);
    const open = numericValue(dt, r, 2);
    const close = numericValue(dt, r, 3);
    const high = numericValue(dt, r, 4);

    const trend: CandlestickTrend
      = close > open ? 'Bull' : close < open ? 'Bear' : 'Neutral';
    const volatility = high - low;

    data.push({
      value: label,
      open,
      high,
      low,
      close,
      volume: 0,
      trend,
      volatility,
    });
  }

  const selector = buildDataSelector(container, 'rect');

  return {
    id: nextId('layer'),
    type: TraceType.CANDLESTICK,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: 'Price',
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

/**
 * Builds a heatmap layer from a DataTable.
 *
 * The expected DataTable layout is:
 * - Column 0: row labels (string)
 * - Columns 1…N: numeric values, where each column label becomes an x-axis label.
 *
 * Example DataTable for a 3×4 heatmap:
 * ```
 *  ['',     'Mon', 'Tue', 'Wed', 'Thu']
 *  ['AM',    2,     5,     3,     7  ]
 *  ['PM',    8,     1,     4,     6  ]
 *  ['Night', 3,     9,     2,     5  ]
 * ```
 */
function buildHeatmapLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  const xLabels: string[] = [];
  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;
    xLabels.push(dt.getColumnLabel(c) || `Col ${c}`);
  }

  const yLabels: string[] = [];
  const points: number[][] = [];

  for (let r = 0; r < rows; r++) {
    yLabels.push(formatCellValue(dt, r, 0));
    const row: number[] = [];
    for (let c = 1; c < cols; c++) {
      if (isRoleColumn(dt, c))
        continue;
      row.push(numericValue(dt, r, c));
    }
    points.push(row);
  }

  const data: HeatmapData = { x: xLabels, y: yLabels, points };

  const selector = buildDataSelector(container, 'rect');

  return {
    id: nextId('layer'),
    type: TraceType.HEATMAP,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: 'Value',
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Helpers — cell value extraction
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable string for a cell value.
 *
 * Prefers the formatted value (which respects locale and date formatting)
 * and only falls back to the raw value when the formatted string is empty.
 */
function formatCellValue(dt: GoogleDataTable, row: number, col: number): string {
  const formatted = dt.getFormattedValue(row, col);
  if (formatted)
    return formatted;

  const raw = dt.getValue(row, col);
  if (raw instanceof Date)
    return raw.toLocaleDateString();
  return String(raw ?? '');
}

/**
 * Extracts a numeric value from a cell, returning `NaN` for genuinely
 * missing data instead of silently coercing it to `0`.
 */
function numericValue(dt: GoogleDataTable, row: number, col: number): number {
  const raw = dt.getValue(row, col);
  if (raw === null || raw === undefined)
    return Number.NaN;
  return Number(raw);
}

// ---------------------------------------------------------------------------
// Helpers — DataTable inspection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when column `c` is a "role" column (tooltip, annotation,
 * style, etc.) rather than a data column.
 */
function isRoleColumn(dt: GoogleDataTable, c: number): boolean {
  if (dt.getColumnRole) {
    const role = dt.getColumnRole(c);
    return role !== '' && role !== 'data';
  }
  return false;
}

/**
 * Counts non-role data columns (excluding the domain/label column 0).
 */
function countDataColumns(dt: GoogleDataTable): number {
  let count = 0;
  for (let c = 1; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c))
      count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Helpers — DOM / CSS selectors
// ---------------------------------------------------------------------------

/**
 * Assigns a stable, unique `id` to the container element if it doesn't
 * already have one. This is called once, up-front, so that the per-layer
 * `buildDataSelector` calls don't mutate the DOM as a side-effect.
 */
function ensureContainerId(container: HTMLElement): void {
  if (!container.id) {
    container.id = nextId('maidr-gc-container');
  }
}

/**
 * Builds a scoped CSS selector targeting chart data elements inside the
 * container.
 *
 * Google Charts renders its SVG inside the container `<div>`. The chart-area
 * data elements live inside a `<g>` with a `clip-path` attribute, which
 * distinguishes them from axes, gridlines, legends, and background rects.
 * We prefer the narrower `g[clip-path] > <element>` selector; if no
 * clip-path group exists we fall back to the broader `svg <element>`.
 *
 * @returns A CSS selector string, or `undefined` when no matching elements
 *          are found.
 */
function buildDataSelector(
  container: HTMLElement,
  elementSelector: string,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  // Prefer elements inside the chart-area clip-path group (excludes axes,
  // gridlines, legends, background rects).
  const clippedSelector = `g[clip-path] > ${elementSelector}`;
  const clippedCandidates = svg.querySelectorAll(clippedSelector);
  if (clippedCandidates.length > 0)
    return `#${container.id} svg ${clippedSelector}`;

  // Fallback: any matching element in the SVG.
  const candidates = svg.querySelectorAll(elementSelector);
  if (candidates.length > 0)
    return `#${container.id} svg ${elementSelector}`;

  return undefined;
}
