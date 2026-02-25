/**
 * AnyChart → MAIDR adapter.
 *
 * Extracts data from an AnyChart chart instance and produces a {@link Maidr}
 * JSON object that the core MAIDR library can consume. This allows AnyChart
 * visualizations to be made accessible via audio sonification, text
 * descriptions, braille output, and keyboard navigation.
 *
 * @example
 * ```ts
 * import { bindAnyChart } from 'maidr/anychart';
 *
 * const chart = anychart.bar([4, 2, 7, 1]);
 * chart.container('container').draw();
 *
 * bindAnyChart(chart);
 * ```
 *
 * @packageDocumentation
 */

import type {
  AnyChartBinderOptions,
  AnyChartInstance,
  AnyChartIterator,
  AnyChartSeries,
  AnyChartTitle,
} from '../type/anychart';
import type {
  BarPoint,
  BoxPoint,
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
  SmoothPoint,
} from '../type/grammar';
import { TraceType } from '../type/grammar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map AnyChart series type strings to MAIDR TraceType values.
 *
 * AnyChart uses lowercase type names such as "bar", "line", "column", etc.
 * Multi-word types are normalised to kebab-case before lookup.
 * This mapping covers the chart types that MAIDR currently supports.
 */
export function mapSeriesType(anyChartType: string): TraceType | null {
  const normalized = anyChartType.toLowerCase().replace(/[_\s]/g, '-');
  const mapping: Record<string, TraceType> = {
    'bar': TraceType.BAR,
    'column': TraceType.BAR,
    'line': TraceType.LINE,
    'spline': TraceType.LINE,
    'step-line': TraceType.LINE,
    'area': TraceType.LINE,
    'step-area': TraceType.LINE,
    'spline-area': TraceType.LINE,
    'scatter': TraceType.SCATTER,
    'marker': TraceType.SCATTER,
    'bubble': TraceType.SCATTER,
    'box': TraceType.BOX,
    'heatmap': TraceType.HEATMAP,
    'heat': TraceType.HEATMAP,
    'candlestick': TraceType.CANDLESTICK,
    'ohlc': TraceType.CANDLESTICK,
  };
  return mapping[normalized] ?? null;
}

/** Safely extract the title text from an AnyChart chart. */
function extractTitle(chart: AnyChartInstance): string | undefined {
  try {
    const title = chart.title();
    if (typeof title === 'string')
      return title;
    return (title as AnyChartTitle).text?.() ?? undefined;
  } catch {
    return undefined;
  }
}

/** Safely extract the axis title text from an AnyChart Cartesian chart. */
function extractAxisTitle(
  chart: AnyChartInstance,
  axis: 'x' | 'y',
): string | undefined {
  try {
    const axisAccessor = axis === 'x' ? chart.xAxis : chart.yAxis;
    if (!axisAccessor)
      return undefined;
    const axisObj = axisAccessor.call(chart, 0);
    return axisObj?.title().text() ?? undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the DOM element that holds the AnyChart SVG rendering. */
export function resolveContainerElement(
  chart: AnyChartInstance,
): HTMLElement | null {
  try {
    const container = chart.container();
    if (!container)
      return null;

    // container() may return a string (element id), an HTMLElement, or a
    // Stage wrapper with its own `.container()` / `.domElement()`.
    if (typeof container === 'string') {
      return document.getElementById(container);
    }
    if (container instanceof HTMLElement) {
      return container;
    }

    // Stage-like object
    const stage = container as { container?: () => HTMLElement | null; domElement?: () => HTMLElement | null };
    if (typeof stage.domElement === 'function') {
      return stage.domElement();
    }
    if (typeof stage.container === 'function') {
      const inner = stage.container();
      if (inner instanceof HTMLElement)
        return inner;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Extract raw data rows from an AnyChart series using its iterator.
 *
 * Returns an array of field maps. The concrete field names depend on the
 * AnyChart series type – most Cartesian series expose `"x"` and `"value"`.
 * Box series expose `"lowest"`, `"q1"`, `"median"`, `"q3"`, `"highest"`.
 * Candlestick/OHLC series expose `"open"`, `"high"`, `"low"`, `"close"`.
 */
export function extractRawRows(
  series: AnyChartSeries,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const iterator: AnyChartIterator = series.getIterator();
  iterator.reset();
  while (iterator.advance()) {
    const row: Record<string, unknown> = { _index: iterator.getIndex() };
    for (const field of [
      'x',
      'name',
      'value',
      'y',
      // Box fields
      'lowest',
      'q1',
      'median',
      'q3',
      'highest',
      // Candlestick/OHLC fields
      'open',
      'high',
      'low',
      'close',
      'volume',
      // Grouping
      'fill',
      'group',
    ]) {
      const v = iterator.get(field);
      if (v !== undefined && v !== null)
        row[field] = v;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Resolve the CSS selector for a specific series index.
 *
 * AnyChart's internal SVG structure does not use stable, predictable class
 * names. Consumers should supply explicit selectors via `options.selectors`
 * for reliable highlighting. When no selectors are provided, no selector is
 * emitted (highlighting will be unavailable).
 */
function resolveSelector(
  seriesIndex: number,
  options?: AnyChartBinderOptions,
): string | string[] | undefined {
  if (!options?.selectors)
    return undefined;

  // Single value applied to all series.
  if (typeof options.selectors === 'string')
    return options.selectors;

  // Array – could be a flat string[] for all series, or indexed per-series.
  const arr = options.selectors;

  // If any element is undefined or is itself an array, treat as per-series.
  const isPerSeries = arr.some(v => v === undefined || Array.isArray(v));
  if (!isPerSeries)
    return arr as string[];

  // Per-series indexed array.
  return arr[seriesIndex] ?? undefined;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number')
    return v;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function asString(v: unknown, fallback = ''): string {
  return v != null ? String(v) : fallback;
}

// ---------------------------------------------------------------------------
// Layer builders – one per MAIDR trace type
// ---------------------------------------------------------------------------

function buildBarLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: BarPoint[] = rows.map(r => ({
    x: asString(r.x ?? r.name ?? r._index),
    y: asNumber(r.value ?? r.y),
  }));
  return {
    id: String(seriesIndex),
    type: TraceType.BAR,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildLineLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const points: LinePoint[] = rows.map(r => ({
    x: r.x !== undefined ? (typeof r.x === 'number' ? r.x : String(r.x)) : asNumber(r._index),
    y: asNumber(r.value ?? r.y),
  }));
  const data: LinePoint[][] = [points];
  return {
    id: String(seriesIndex),
    type: TraceType.LINE,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildScatterLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: ScatterPoint[] = rows.map(r => ({
    x: asNumber(r.x),
    y: asNumber(r.value ?? r.y),
  }));
  return {
    id: String(seriesIndex),
    type: TraceType.SCATTER,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildBoxLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: BoxPoint[] = rows.map(r => ({
    fill: asString(r.x ?? r.name ?? r._index),
    lowerOutliers: [],
    min: asNumber(r.lowest),
    q1: asNumber(r.q1),
    q2: asNumber(r.median),
    q3: asNumber(r.q3),
    max: asNumber(r.highest),
    upperOutliers: [],
  }));
  return {
    id: String(seriesIndex),
    type: TraceType.BOX,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildHeatmapLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);

  // Collect unique x and y labels in insertion order.
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();

  for (const r of rows) {
    const xVal = asString(r.x);
    const yVal = asString(r.y ?? r.name);
    if (!xSet.has(xVal)) {
      xLabels.push(xVal);
      xSet.add(xVal);
    }
    if (!ySet.has(yVal)) {
      yLabels.push(yVal);
      ySet.add(yVal);
    }
  }

  // Build the 2D points matrix (y rows × x columns).
  const points: number[][] = Array.from(
    { length: yLabels.length },
    () => Array.from<number>({ length: xLabels.length }).fill(0),
  );
  for (const r of rows) {
    const xi = xLabels.indexOf(asString(r.x));
    const yi = yLabels.indexOf(asString(r.y ?? r.name));
    if (xi >= 0 && yi >= 0)
      points[yi][xi] = asNumber(r.value ?? r.fill);
  }

  const data: HeatmapData = { x: xLabels, y: yLabels, points };
  return {
    id: String(seriesIndex),
    type: TraceType.HEATMAP,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildCandlestickLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: CandlestickPoint[] = rows.map((r) => {
    const open = asNumber(r.open);
    const close = asNumber(r.close);
    const high = asNumber(r.high);
    const low = asNumber(r.low);

    let trend: CandlestickTrend = 'Neutral';
    if (close > open)
      trend = 'Bull';
    else if (close < open)
      trend = 'Bear';

    const midpoint = (high + low) / 2;
    return {
      value: asString(r.x ?? r.name ?? r._index),
      open,
      high,
      low,
      close,
      volume: asNumber(r.volume),
      trend,
      volatility: midpoint > 0 ? (high - low) / midpoint : 0,
    };
  });
  return {
    id: String(seriesIndex),
    type: TraceType.CANDLESTICK,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildHistogramLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: HistogramPoint[] = rows.map((r) => {
    const y = asNumber(r.value ?? r.y);
    const x = asNumber(r.x);
    return {
      x,
      y,
      xMin: x - 0.5,
      xMax: x + 0.5,
      yMin: 0,
      yMax: y,
    };
  });
  return {
    id: String(seriesIndex),
    type: TraceType.HISTOGRAM,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildSegmentedLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  traceType: TraceType.STACKED | TraceType.DODGED | TraceType.NORMALIZED,
): MaidrLayer {
  const rows = extractRawRows(series);
  // Group by fill/group value to form the 2D array.
  const groups = new Map<string, SegmentedPoint[]>();
  for (const r of rows) {
    const fill = asString(r.fill ?? r.group ?? seriesIndex);
    if (!groups.has(fill))
      groups.set(fill, []);
    groups.get(fill)!.push({
      x: asString(r.x ?? r.name ?? r._index),
      y: asNumber(r.value ?? r.y),
      fill,
    });
  }
  const data: SegmentedPoint[][] = [...groups.values()];
  return {
    id: String(seriesIndex),
    type: traceType,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildSmoothLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  // Smooth traces include SVG coordinates. Since we extract from AnyChart's
  // data model rather than SVG DOM, svg_x/svg_y are set to 0 as placeholders.
  const points: SmoothPoint[] = rows.map(r => ({
    x: asNumber(r.x),
    y: asNumber(r.value ?? r.y),
    svg_x: 0,
    svg_y: 0,
  }));
  const data: SmoothPoint[][] = [points];
  return {
    id: String(seriesIndex),
    type: TraceType.SMOOTH,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

// ---------------------------------------------------------------------------
// Layer builder dispatch
// ---------------------------------------------------------------------------

function buildLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  traceType: TraceType,
  selectors: string | string[] | undefined,
): MaidrLayer {
  switch (traceType) {
    case TraceType.BAR:
      return buildBarLayer(series, seriesIndex, selectors);
    case TraceType.LINE:
      return buildLineLayer(series, seriesIndex, selectors);
    case TraceType.SCATTER:
      return buildScatterLayer(series, seriesIndex, selectors);
    case TraceType.BOX:
      return buildBoxLayer(series, seriesIndex, selectors);
    case TraceType.HEATMAP:
      return buildHeatmapLayer(series, seriesIndex, selectors);
    case TraceType.CANDLESTICK:
      return buildCandlestickLayer(series, seriesIndex, selectors);
    case TraceType.HISTOGRAM:
      return buildHistogramLayer(series, seriesIndex, selectors);
    case TraceType.STACKED:
    case TraceType.DODGED:
    case TraceType.NORMALIZED:
      return buildSegmentedLayer(series, seriesIndex, selectors, traceType);
    case TraceType.SMOOTH:
      return buildSmoothLayer(series, seriesIndex, selectors);
    default:
      return buildBarLayer(series, seriesIndex, selectors);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an AnyChart chart instance into a MAIDR data object.
 *
 * This function inspects the chart's series and metadata after it has been
 * drawn, then constructs a {@link Maidr} JSON structure that can be passed
 * to the `<Maidr>` React component or used with `bindAnyChart()`.
 *
 * @param chart - A drawn AnyChart chart instance.
 * @param options - Optional overrides for id, title, axes, and selectors.
 * @returns The MAIDR data object, or `null` if no convertible series found.
 */
export function anyChartToMaidr(
  chart: AnyChartInstance,
  options?: AnyChartBinderOptions,
): Maidr | null {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return null;

  // Resolve chart metadata.
  const container = resolveContainerElement(chart);
  const id = options?.id ?? container?.id ?? 'anychart-maidr';
  const title = options?.title ?? extractTitle(chart);
  const xAxisLabel = options?.axes?.x ?? extractAxisTitle(chart, 'x');
  const yAxisLabel = options?.axes?.y ?? extractAxisTitle(chart, 'y');

  const layers: MaidrLayer[] = [];

  for (let i = 0; i < seriesCount; i++) {
    const series = chart.getSeriesAt(i);
    if (!series)
      continue;

    const anyChartType = series.seriesType();
    const traceType = mapSeriesType(anyChartType);
    if (!traceType) {
      console.warn(
        `[maidr/anychart] Unsupported AnyChart series type "${anyChartType}". Skipping series ${i}.`,
      );
      continue;
    }

    const selectors = resolveSelector(i, options);
    const layer = buildLayer(series, i, traceType, selectors);

    // Attach axis labels.
    if (xAxisLabel || yAxisLabel) {
      layer.axes = {
        ...(xAxisLabel ? { x: xAxisLabel } : {}),
        ...(yAxisLabel ? { y: yAxisLabel } : {}),
      };
    }

    layers.push(layer);
  }

  if (layers.length === 0)
    return null;

  const subplot: MaidrSubplot = { layers };
  const maidr: Maidr = {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };

  return maidr;
}

/**
 * Bind an AnyChart chart to MAIDR for accessible interaction.
 *
 * This is the primary high-level API. It extracts data from a drawn
 * AnyChart chart, generates the MAIDR schema, injects it as a
 * `maidr-data` attribute on the chart's container element, and
 * dispatches a `maidr:bindchart` event so the MAIDR runtime picks it up.
 *
 * The MAIDR runtime (`maidr.js`) must be loaded on the page. It
 * listens for `maidr:bindchart` events and initialises accessibility
 * features for the target element.
 *
 * @param chart - A drawn AnyChart chart instance.
 * @param options - Optional overrides.
 * @returns The generated {@link Maidr} object, or `null` on failure.
 *
 * @example
 * ```ts
 * const chart = anychart.bar([4, 2, 7, 1]);
 * chart.container('container').draw();
 * bindAnyChart(chart);
 * ```
 */
export function bindAnyChart(
  chart: AnyChartInstance,
  options?: AnyChartBinderOptions,
): Maidr | null {
  const container = resolveContainerElement(chart);
  if (!container) {
    console.warn(
      '[maidr/anychart] Could not find the chart container element. '
      + 'Make sure the chart has been drawn before calling bindAnyChart().',
    );
    return null;
  }

  const maidr = anyChartToMaidr(chart, {
    ...options,
    id: options?.id ?? container.id ?? 'anychart-maidr',
  });

  if (!maidr) {
    console.warn('[maidr/anychart] Could not extract data from AnyChart chart.');
    return null;
  }

  // Inject MAIDR data onto the container element.
  container.setAttribute('maidr-data', JSON.stringify(maidr));

  // Dispatch a custom event so the MAIDR runtime initialises on this element.
  container.dispatchEvent(
    new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }),
  );

  return maidr;
}
