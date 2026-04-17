/**
 * Data converters for transforming Google Charts data into MAIDR's schema.
 *
 * Google Charts uses a DataTable structure where:
 *   - Column 0 is typically the domain/label column
 *   - Columns 1..N are data series
 *   - Role columns (tooltip, annotation, style) are interspersed
 *
 * MAIDR uses typed data structures per chart type:
 *   BarPoint[]          = [{ x, y }, ...]
 *   LinePoint[][]       = [[{ x, y, fill? }, ...], ...]
 *   ScatterPoint[]      = [{ x, y }, ...]
 *   SegmentedPoint[][]  = [[{ x, y, fill }, ...], ...]  (stacked/dodged/normalized)
 *   CandlestickPoint[]  = [{ value, open, high, low, close, ... }, ...]
 */

import type {
  BarPoint,
  CandlestickPoint,
  CandlestickSelector,
  CandlestickTrend,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { GoogleBoundingBox, GoogleChart, GoogleChartType, GoogleDataTable } from './types';
import { Orientation, TraceType } from '@type/grammar';
import { buildDataSelector, ensureContainerId, nextId } from './selectors';

/**
 * Tolerance (in pixels) for matching SVG rect positions to bounding boxes.
 * Google Charts positions may have floating-point imprecision.
 */
const POSITION_TOLERANCE = 2;

/**
 * Candlestick element width thresholds (in pixels).
 *
 * Google Charts renders candlesticks as SVG rect elements with varying widths:
 * - Grid lines: width ≤ 1px (horizontal or vertical axis lines)
 * - Wicks: width ≤ 3px (thin rects representing high-low range)
 * - Bodies: width > 10px (wider rects representing open-close range)
 *
 * These thresholds are based on default Google Charts rendering. They may need
 * adjustment for custom chart sizes or high-DPI displays.
 */
const CANDLESTICK_GRID_MAX_WIDTH = 1;
const CANDLESTICK_WICK_MAX_WIDTH = 3;
const CANDLESTICK_BODY_MIN_WIDTH = 10;

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
 * @param chart     - The Google Charts chart instance. Used to access
 *                    `getChartLayoutInterface()` for locating SVG elements.
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
  const id = options.id ?? container.id ?? nextId('maidr-gc');
  const title = options.title ?? '';

  // Assign a stable container id up-front (used for scoped CSS selectors).
  ensureContainerId(container);

  const layer = buildLayer(chart, dataTable, container, options.chartType);

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
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  chartType: GoogleChartType,
): MaidrLayer {
  switch (chartType) {
    case 'ColumnChart':
      return buildBarOrSegmentedLayer(chart, dt, container, Orientation.VERTICAL);
    case 'BarChart':
      return buildBarOrSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL);
    case 'LineChart':
      return buildLineLayer(chart, dt, container);
    case 'ScatterChart':
      return buildScatterLayer(chart, dt, container);
    case 'StackedColumnChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.VERTICAL, TraceType.STACKED);
    case 'StackedBarChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL, TraceType.STACKED);
    case 'DodgedColumnChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.VERTICAL, TraceType.DODGED);
    case 'DodgedBarChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL, TraceType.DODGED);
    case 'CandlestickChart':
      return buildCandlestickLayer(chart, dt, container);
    default:
      throw new Error(
        `Unsupported Google Charts type: ${chartType as string}. `
        + 'Supported types: BarChart, CandlestickChart, ColumnChart, DodgedBarChart, '
        + 'DodgedColumnChart, LineChart, ScatterChart, StackedBarChart, StackedColumnChart.',
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
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
): MaidrLayer {
  const dataColCount = countDataColumns(dt);
  if (dataColCount > 1) {
    return buildSegmentedLayer(chart, dt, container, orientation, TraceType.DODGED);
  }
  return buildBarLayer(chart, dt, container, orientation);
}

function buildBarLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
): MaidrLayer {
  const data: BarPoint[] = [];
  const rows = dt.getNumberOfRows();

  // Find first non-role data column (defensive: don't assume column 1 is data)
  let dataCol = 1;
  for (let c = 1; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c)) {
      dataCol = c;
      break;
    }
  }

  for (let r = 0; r < rows; r++) {
    const label = formatCellValue(dt, r, 0);
    const value = numericValue(dt, r, dataCol);
    data.push({ x: label, y: value });
  }

  // Use chart API to find and mark the correct SVG rect elements
  const selector = markBarElements(chart, container, rows, 1);

  return {
    id: nextId('layer'),
    type: TraceType.BAR,
    orientation,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: dt.getColumnLabel(dataCol) || undefined,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Segmented bars (stacked, dodged / grouped, normalized)
// ---------------------------------------------------------------------------

function buildSegmentedLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
  traceType: TraceType.STACKED | TraceType.DODGED,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  // Build standard data array: data[series][category]
  // - row index = series (the "Level" in text output)
  // - col index = category (x-axis value)
  //
  // Navigation:
  // - Up/Down arrows: move between series (changes row)
  // - Left/Right arrows: move between categories (changes col)
  const data: SegmentedPoint[][] = [];
  let seriesCount = 0;

  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;

    const series: SegmentedPoint[] = [];
    const fillLabel = dt.getColumnLabel(c) || `Series ${seriesCount + 1}`;

    for (let r = 0; r < rows; r++) {
      const label = formatCellValue(dt, r, 0);
      const value = numericValue(dt, r, c);
      series.push({ x: label, y: value, z: fillLabel });
    }
    data.push(series);
    seriesCount++;
  }

  // Use chart API to find and mark SVG rect elements.
  // Google Charts renders DOM in row-major order (all categories for series 0,
  // then all categories for series 1, etc.), so we set domMapping.order='row'
  // to tell MAIDR to iterate in row-major order when mapping SVG elements.
  const selector = markSegmentedBarElements(chart, container, rows, seriesCount);

  return {
    id: nextId('layer'),
    type: traceType,
    orientation,
    ...(selector ? { selectors: selector } : {}),
    // 'row' tells MAIDR that DOM elements are in row-major order (series-first)
    domMapping: { order: 'row' },
    axes: {
      x: dt.getColumnLabel(0) || undefined,
      y: 'Level',
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Line / Area
// ---------------------------------------------------------------------------

function buildLineLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  // Each data column (1 .. cols-1) is a separate series.
  const data: LinePoint[][] = [];
  let seriesCount = 0;

  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;
    const series: LinePoint[] = [];
    for (let r = 0; r < rows; r++) {
      const x = formatCellValue(dt, r, 0);
      const y = numericValue(dt, r, c);
      const z = dt.getColumnLabel(c) || `Series ${c}`;
      series.push({ x, y, z });
    }
    data.push(series);
    seriesCount++;
  }

  // Use chart API to create synthetic point elements for each series
  const selectors = markLinePointElements(chart, container, rows, seriesCount);

  return {
    id: nextId('layer'),
    type: TraceType.LINE,
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
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
  chart: GoogleChart,
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

  // Use chart API to find and mark the correct SVG circle elements
  const selector = markScatterElements(chart, container, data);

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
// Candlestick
// ---------------------------------------------------------------------------

/**
 * Builds a candlestick layer from a Google Charts CandlestickChart.
 *
 * Google Charts candlestick DataTable format:
 *   - Column 0: Date/datetime (x-axis)
 *   - Column 1: Low value
 *   - Column 2: Open value
 *   - Column 3: Close value
 *   - Column 4: High value
 *
 * MAIDR CandlestickPoint format:
 *   { value, open, high, low, close, volume, trend, volatility }
 */
function buildCandlestickLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: CandlestickPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const value = formatCellValue(dt, r, 0);
    // Google Charts order: Low, Open, Close, High (columns 1-4)
    const low = numericValue(dt, r, 1);
    const open = numericValue(dt, r, 2);
    const close = numericValue(dt, r, 3);
    const high = numericValue(dt, r, 4);

    // Compute trend based on open/close relationship
    let trend: CandlestickTrend = 'Neutral';
    if (close > open) {
      trend = 'Bull';
    } else if (close < open) {
      trend = 'Bear';
    }

    data.push({
      value,
      open,
      high,
      low,
      close,
      volume: undefined, // Google Charts doesn't provide volume data
      trend,
      volatility: high - low,
    });
  }

  // Mark candlestick SVG elements and get selectors
  const selectors = markCandlestickElements(chart, container, rows);

  return {
    id: nextId('layer'),
    type: TraceType.CANDLESTICK,
    ...(selectors ? { selectors } : {}),
    axes: {
      x: dt.getColumnLabel(0) || 'Date',
      y: 'Price',
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
// Helpers — SVG element marking via chart layout API
// ---------------------------------------------------------------------------

/**
 * Uses the Google Charts layout API to find and mark the SVG rect elements
 * that correspond to each bar. Returns a CSS selector for the marked elements.
 *
 * Google Charts renders many overlapping rect elements for visual effects.
 * The layout API provides the exact bounding box for each bar, allowing us
 * to identify the correct elements by matching coordinates.
 *
 * @param chart - The Google Chart instance
 * @param container - The DOM container element
 * @param rowCount - Number of data rows (bars per series)
 * @param seriesCount - Number of data series
 * @returns CSS selector for the marked elements, or undefined if no elements found
 */
function markBarElements(
  chart: GoogleChart,
  container: HTMLElement,
  rowCount: number,
  seriesCount: number,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const layout = chart.getChartLayoutInterface();
  if (!layout)
    return buildDataSelector(container, 'rect');

  // Get all rects in the SVG
  const allRects = svg.querySelectorAll('rect');

  // Clear any existing marks from previous initializations
  allRects.forEach(rect => rect.removeAttribute('data-maidr-bar'));

  let markedCount = 0;

  // For each series and data point, find the corresponding rect
  for (let series = 0; series < seriesCount; series++) {
    for (let dataIndex = 0; dataIndex < rowCount; dataIndex++) {
      const bbox = layout.getBoundingBox(`bar#${series}#${dataIndex}`);
      if (!bbox)
        continue;

      const rect = findRectByBoundingBox(allRects, bbox);
      if (rect) {
        // Mark with series and index for ordered selection
        rect.setAttribute('data-maidr-bar', `${series}-${dataIndex}`);
        markedCount++;
      }
    }
  }

  if (markedCount === 0)
    return buildDataSelector(container, 'rect');

  return `#${container.id} svg rect[data-maidr-bar]`;
}

/**
 * Uses the Google Charts layout API to find and mark the SVG rect elements
 * for segmented bar charts (stacked, dodged, normalized).
 *
 * Unlike simple bar charts, segmented charts have a 2D structure where
 * SegmentedTrace expects elements ordered **category-first**:
 *   Category A: Series 0, Series 1
 *   Category B: Series 0, Series 1
 *   etc.
 *
 * This function marks elements in the correct order for mapToSvgElements().
 *
 * @param chart - The Google Chart instance
 * @param container - The DOM container element
 * @param categoryCount - Number of categories
 * @param seriesCount - Number of data series
 * @returns CSS selector for the marked elements, or undefined if no elements found
 */
function markSegmentedBarElements(
  chart: GoogleChart,
  container: HTMLElement,
  categoryCount: number,
  seriesCount: number,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const layout = chart.getChartLayoutInterface();
  if (!layout)
    return buildDataSelector(container, 'rect');

  // Get all rects in the SVG
  const allRects = svg.querySelectorAll('rect');

  // Clear any existing marks from previous initializations
  allRects.forEach(rect => rect.removeAttribute('data-maidr-bar'));

  let markedCount = 0;

  // Mark elements in ROW-MAJOR order (series-first, then categories within each series)
  // This matches Google Charts' DOM rendering order, where all bars for series 0
  // appear first, followed by all bars for series 1, etc.
  //
  // With domMapping.order='row', MAIDR iterates:
  //   for (r = 0 to numSeries)
  //     for (c = 0 to numCategories)
  //       svgElements[r].push(domElements[domIndex++])
  //
  // Google Charts' getBoundingBox uses: bar#seriesIndex#categoryIndex
  for (let series = 0; series < seriesCount; series++) {
    for (let category = 0; category < categoryCount; category++) {
      const bbox = layout.getBoundingBox(`bar#${series}#${category}`);
      if (!bbox) {
        continue;
      }

      const rect = findRectByBoundingBox(allRects, bbox);
      if (rect) {
        rect.setAttribute('data-maidr-bar', `${markedCount}`);
        markedCount++;
      }
    }
  }

  const selector = `#${container.id} svg rect[data-maidr-bar]`;

  if (markedCount === 0)
    return buildDataSelector(container, 'rect');

  return selector;
}

/**
 * Finds an SVG rect element that matches the given bounding box coordinates.
 *
 * Due to floating-point precision issues in Google Charts rendering,
 * we use a small tolerance when comparing positions.
 *
 * @param rects - NodeList of SVG rect elements to search
 * @param bbox - The target bounding box from the chart layout API
 * @returns The matching rect element, or null if not found
 */
function findRectByBoundingBox(
  rects: NodeListOf<SVGRectElement>,
  bbox: GoogleBoundingBox,
): SVGRectElement | null {
  for (const rect of rects) {
    const x = Number.parseFloat(rect.getAttribute('x') || '0');
    const y = Number.parseFloat(rect.getAttribute('y') || '0');
    const width = Number.parseFloat(rect.getAttribute('width') || '0');
    const height = Number.parseFloat(rect.getAttribute('height') || '0');

    // Match by position and size with tolerance
    const xMatch = Math.abs(x - bbox.left) <= POSITION_TOLERANCE;
    const yMatch = Math.abs(y - bbox.top) <= POSITION_TOLERANCE;
    const widthMatch = Math.abs(width - bbox.width) <= POSITION_TOLERANCE;
    const heightMatch = Math.abs(height - bbox.height) <= POSITION_TOLERANCE;

    if (xMatch && yMatch && widthMatch && heightMatch) {
      return rect;
    }
  }
  return null;
}

/**
 * Uses the Google Charts layout API to find and mark the SVG circle elements
 * that correspond to each scatter point. Returns a CSS selector for the marked elements.
 *
 * Google Charts renders multiple overlapping circles per data point for visual effects.
 * This function tries two approaches:
 * 1. Use getBoundingBox('point#0#i') to get exact positions (preferred)
 * 2. Fall back to getXLocation/getYLocation with skip-already-marked logic
 *
 * @param chart - The Google Chart instance
 * @param container - The DOM container element
 * @param data - Array of scatter points with x, y coordinates
 * @returns CSS selector for the marked elements, or undefined if no elements found
 */
function markScatterElements(
  chart: GoogleChart,
  container: HTMLElement,
  data: ScatterPoint[],
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const layout = chart.getChartLayoutInterface();
  if (!layout)
    return buildDataSelector(container, 'circle');

  // Get all circles in the SVG
  const allCircles = svg.querySelectorAll('circle');
  if (allCircles.length === 0)
    return undefined;

  // Clear any existing marks from previous initializations
  allCircles.forEach(circle => circle.removeAttribute('data-maidr-point'));

  let markedCount = 0;

  // Approach 1: Try getBoundingBox('point#series#row') - similar to bar charts
  for (let i = 0; i < data.length; i++) {
    const bbox = layout.getBoundingBox(`point#0#${i}`);
    if (bbox) {
      const circle = findCircleByBoundingBox(allCircles, bbox);
      if (circle && !circle.hasAttribute('data-maidr-point')) {
        circle.setAttribute('data-maidr-point', `${i}`);
        markedCount++;
      }
    }
  }

  // Approach 2: Fallback to position-based matching if getBoundingBox didn't work
  if (markedCount === 0 && layout.getXLocation && layout.getYLocation) {
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      const expectedX = layout.getXLocation(point.x);
      const expectedY = layout.getYLocation(point.y);

      // Skip circles that are already marked (handles multiple circles per point)
      const circle = findUnmarkedCircleByPosition(allCircles, expectedX, expectedY);
      if (circle) {
        circle.setAttribute('data-maidr-point', `${i}`);
        markedCount++;
      }
    }
  }

  if (markedCount === 0) {
    return buildDataSelector(container, 'circle');
  }

  return `#${container.id} svg circle[data-maidr-point]`;
}

/**
 * Finds an SVG circle element that matches the given bounding box.
 *
 * The bounding box center should match the circle's cx/cy position.
 *
 * @param circles - NodeList of SVG circle elements to search
 * @param bbox - The target bounding box from the chart layout API
 * @returns The matching circle element, or null if not found
 */
function findCircleByBoundingBox(
  circles: NodeListOf<SVGCircleElement>,
  bbox: GoogleBoundingBox,
): SVGCircleElement | null {
  // Calculate center of bounding box
  const centerX = bbox.left + bbox.width / 2;
  const centerY = bbox.top + bbox.height / 2;

  for (const circle of circles) {
    const cx = Number.parseFloat(circle.getAttribute('cx') || '0');
    const cy = Number.parseFloat(circle.getAttribute('cy') || '0');

    // Match by center position with tolerance
    const xMatch = Math.abs(cx - centerX) <= POSITION_TOLERANCE;
    const yMatch = Math.abs(cy - centerY) <= POSITION_TOLERANCE;

    if (xMatch && yMatch) {
      return circle;
    }
  }
  return null;
}

/**
 * Finds an unmarked SVG circle element at the specified pixel position.
 *
 * Skips circles that already have the data-maidr-point attribute to handle
 * Google Charts rendering multiple overlapping circles per data point.
 *
 * @param circles - NodeList of SVG circle elements to search
 * @param expectedX - Expected x-coordinate (center)
 * @param expectedY - Expected y-coordinate (center)
 * @returns The matching unmarked circle element, or null if not found
 */
function findUnmarkedCircleByPosition(
  circles: NodeListOf<SVGCircleElement>,
  expectedX: number,
  expectedY: number,
): SVGCircleElement | null {
  for (const circle of circles) {
    // Skip already-marked circles
    if (circle.hasAttribute('data-maidr-point')) {
      continue;
    }

    const cx = Number.parseFloat(circle.getAttribute('cx') || '0');
    const cy = Number.parseFloat(circle.getAttribute('cy') || '0');

    // Match by center position with tolerance
    const xMatch = Math.abs(cx - expectedX) <= POSITION_TOLERANCE;
    const yMatch = Math.abs(cy - expectedY) <= POSITION_TOLERANCE;

    if (xMatch && yMatch) {
      return circle;
    }
  }
  return null;
}

/**
 * Marks line chart path elements with series identifiers and returns per-series selectors.
 *
 * Google Charts line charts render `<path>` elements inside a `g[clip-path]` group.
 * This function marks each line path with a `data-maidr-line-series` attribute
 * so MAIDR's `mapViaPathParsing` can parse the path `d` attribute and create
 * synthetic highlight circles at each data point.
 *
 * @param _chart - The Google Chart instance (unused, kept for API consistency)
 * @param container - The DOM container element
 * @param _rowCount - Number of data points per series (unused)
 * @param seriesCount - Number of data series
 * @returns Array of CSS selectors (one per series), or undefined if no paths found
 */
function markLinePointElements(
  _chart: GoogleChart,
  container: HTMLElement,
  _rowCount: number,
  seriesCount: number,
): string[] | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  const existingMarked = svg.querySelectorAll('path[data-maidr-line-series]');
  existingMarked.forEach(path => path.removeAttribute('data-maidr-line-series'));

  // Find line paths: paths with fill="none" inside clip-path group (actual data lines)
  // These exclude axis lines, gridlines, etc.
  const linePaths = svg.querySelectorAll('g[clip-path] path[fill="none"]');

  if (linePaths.length === 0) {
    return undefined;
  }

  // Mark each path with its series index
  // Google Charts renders paths in series order
  const selectors: string[] = [];
  const pathsToMark = Math.min(linePaths.length, seriesCount);

  for (let series = 0; series < pathsToMark; series++) {
    const path = linePaths[series];
    path.setAttribute('data-maidr-line-series', `${series}`);
    selectors.push(`#${container.id} svg path[data-maidr-line-series="${series}"]`);
  }

  return selectors.length > 0 ? selectors : undefined;
}

/**
 * Marks candlestick SVG elements (bodies and wicks) and returns a CandlestickSelector.
 *
 * Google Charts renders candlesticks as pairs of rect elements:
 *   - Wick: narrow rect (width=2) representing high-low range
 *   - Body: wider rect (width~43) representing open-close range
 *
 * Elements are filtered from grid lines by checking width:
 *   - Grid lines: width=1 (vertical) or height=1 (horizontal)
 *   - Wicks: width=2
 *   - Bodies: width > 10 (typically 43)
 *
 * @param _chart - The Google Chart instance (unused, kept for API consistency)
 * @param container - The DOM container element
 * @param rowCount - Number of candlesticks
 * @returns CandlestickSelector object or undefined if no elements found
 */
function markCandlestickElements(
  _chart: GoogleChart,
  container: HTMLElement,
  rowCount: number,
): CandlestickSelector | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  const existingMarked = svg.querySelectorAll('rect[data-maidr-candle-body], rect[data-maidr-candle-wick]');
  existingMarked.forEach((rect) => {
    rect.removeAttribute('data-maidr-candle-body');
    rect.removeAttribute('data-maidr-candle-wick');
  });

  // Get all rects inside clip-path (data elements, not axis/legend)
  const allRects = svg.querySelectorAll('g[clip-path] rect');
  if (allRects.length === 0) {
    return undefined;
  }

  // Separate bodies from wicks based on width thresholds
  const bodies: SVGRectElement[] = [];
  const wicks: SVGRectElement[] = [];

  for (const rect of allRects) {
    const width = Number.parseFloat(rect.getAttribute('width') || '0');
    const height = Number.parseFloat(rect.getAttribute('height') || '0');

    // Skip grid lines (very thin horizontal or vertical lines)
    if (width <= CANDLESTICK_GRID_MAX_WIDTH || height <= CANDLESTICK_GRID_MAX_WIDTH) {
      continue;
    }

    // Classify by width: wicks are narrow, bodies are wider
    if (width <= CANDLESTICK_WICK_MAX_WIDTH) {
      wicks.push(rect as SVGRectElement);
    } else if (width > CANDLESTICK_BODY_MIN_WIDTH) {
      bodies.push(rect as SVGRectElement);
    }
    // Note: Elements with widths between WICK_MAX and BODY_MIN are skipped
    // (typically chart decorations, not data elements)
  }

  // We expect equal numbers of bodies and wicks
  if (bodies.length === 0) {
    return undefined;
  }

  // Sort by x-position to ensure correct order
  bodies.sort((a, b) => {
    const ax = Number.parseFloat(a.getAttribute('x') || '0');
    const bx = Number.parseFloat(b.getAttribute('x') || '0');
    return ax - bx;
  });

  wicks.sort((a, b) => {
    const ax = Number.parseFloat(a.getAttribute('x') || '0');
    const bx = Number.parseFloat(b.getAttribute('x') || '0');
    return ax - bx;
  });

  // Warn if element counts don't match expected row count (aids debugging)
  if (bodies.length !== rowCount) {
    console.warn(
      `[MAIDR] Candlestick body count mismatch: expected ${rowCount}, found ${bodies.length}. `
      + 'This may indicate pixel threshold issues with custom chart sizes or high-DPI displays.',
    );
  }
  if (wicks.length !== rowCount) {
    console.warn(
      `[MAIDR] Candlestick wick count mismatch: expected ${rowCount}, found ${wicks.length}.`,
    );
  }

  // Mark bodies with index
  const bodiesToMark = Math.min(bodies.length, rowCount);
  for (let i = 0; i < bodiesToMark; i++) {
    bodies[i].setAttribute('data-maidr-candle-body', `${i}`);
  }

  // Mark wicks with index
  const wicksToMark = Math.min(wicks.length, rowCount);
  for (let i = 0; i < wicksToMark; i++) {
    wicks[i].setAttribute('data-maidr-candle-wick', `${i}`);
  }

  // Build selector object
  const selector: CandlestickSelector = {
    body: `#${container.id} svg rect[data-maidr-candle-body]`,
  };

  if (wicksToMark > 0) {
    selector.wick = `#${container.id} svg rect[data-maidr-candle-wick]`;
  }

  return selector;
}
