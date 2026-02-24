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
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '../../type/grammar';
import type { GoogleChart, GoogleChartType, GoogleDataTable } from './types';
import { Orientation, TraceType } from '../../type/grammar';

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
 * @param chart     - The Google Charts chart instance.
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
  chart: GoogleChart,
  dataTable: GoogleDataTable,
  container: HTMLElement,
  options: GoogleChartAdapterOptions,
): Maidr {
  const id = options.id ?? container.id ?? `maidr-gc-${Date.now()}`;
  const title = options.title ?? '';

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
      return buildBarLayer(dt, container, Orientation.VERTICAL);
    case 'BarChart':
      return buildBarLayer(dt, container, Orientation.HORIZONTAL);
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
      // Combo charts default to bar representation for the primary series.
      return buildBarLayer(dt, container, Orientation.VERTICAL);
    default:
      throw new Error(
        `Unsupported Google Charts type: ${chartType as string}. `
        + 'Supported types: AreaChart, BarChart, ColumnChart, LineChart, '
        + 'ScatterChart, Histogram, CandlestickChart, ComboChart.',
      );
  }
}

// ---------------------------------------------------------------------------
// Bar / Column
// ---------------------------------------------------------------------------

function buildBarLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
): MaidrLayer {
  const data: BarPoint[] = [];
  const rows = dt.getNumberOfRows();

  for (let r = 0; r < rows; r++) {
    const label = String(dt.getFormattedValue(r, 0) || dt.getValue(r, 0));
    const value = Number(dt.getValue(r, 1)) || 0;
    data.push({ x: label, y: value });
  }

  const selector = buildSelector(container, 'rect');

  return {
    id: '0',
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
      const x = dt.getValue(r, 0);
      const y = Number(dt.getValue(r, c)) || 0;
      const fill = dt.getColumnLabel(c) || `Series ${c}`;
      series.push({
        x: x instanceof Date ? x.getTime() : (x as number | string),
        y,
        fill,
      });
    }
    data.push(series);
  }

  const selector = buildSelector(container, 'path[fill="none"]')
    || buildSelector(container, 'path');

  return {
    id: '0',
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
    const x = Number(dt.getValue(r, 0)) || 0;
    const y = Number(dt.getValue(r, 1)) || 0;
    data.push({ x, y });
  }

  const selector = buildSelector(container, 'circle');

  return {
    id: '0',
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

function buildHistogramLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: HistogramPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const label = String(dt.getFormattedValue(r, 0) || dt.getValue(r, 0));
    const value = Number(dt.getValue(r, 1)) || 0;
    data.push({
      x: label,
      y: value,
      xMin: r,
      xMax: r + 1,
      yMin: 0,
      yMax: value,
    });
  }

  const selector = buildSelector(container, 'rect');

  return {
    id: '0',
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
    const label = String(dt.getFormattedValue(r, 0) || dt.getValue(r, 0));
    const low = Number(dt.getValue(r, 1)) || 0;
    const open = Number(dt.getValue(r, 2)) || 0;
    const close = Number(dt.getValue(r, 3)) || 0;
    const high = Number(dt.getValue(r, 4)) || 0;

    const trend: CandlestickTrend
      = close > open ? 'Bull' : close < open ? 'Bear' : 'Neutral';
    const volatility = high - low;

    data.push({
      value: label,
      open,
      high,
      low,
      close,
      volume: 0, // Google Charts doesn't include volume
      trend,
      volatility,
    });
  }

  const selector = buildSelector(container, 'rect');

  return {
    id: '0',
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a scoped CSS selector for chart data elements inside the container.
 *
 * Google Charts renders SVG inside the container `<div>`. We scope
 * selectors to that container so multiple charts on the same page don't
 * interfere with each other.
 *
 * @returns A CSS selector string, or `undefined` if no matching elements
 *          are found.
 */
function buildSelector(
  container: HTMLElement,
  elementSelector: string,
): string | undefined {
  // Ensure the container has an id for scoping.
  if (!container.id) {
    container.id = `maidr-gc-container-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  // Google Charts nests the data elements inside `<g>` groups.
  // We look for the chart-area `<g>` that contains the actual data elements.
  // The chart-area clip-path group typically contains the data rects/paths/circles.
  const candidates = svg.querySelectorAll(elementSelector);
  if (candidates.length === 0)
    return undefined;

  return `#${container.id} svg ${elementSelector}`;
}

/**
 * Returns `true` when column `c` is a "role" column (tooltip, annotation, etc.)
 * rather than a data column.
 */
function isRoleColumn(dt: GoogleDataTable, c: number): boolean {
  if (typeof dt.getColumnRole === 'function') {
    const role = dt.getColumnRole(c);
    return role !== '' && role !== 'data';
  }
  return false;
}
