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
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '../type/grammar';
import { TraceType } from '../type/grammar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map AnyChart series type strings to MAIDR TraceType values.
 *
 * AnyChart uses lowercase type names such as "bar", "line", "column", etc.
 * This mapping covers the chart types that MAIDR currently supports.
 */
function mapSeriesType(anyChartType: string): TraceType | null {
  const normalized = anyChartType.toLowerCase();
  const mapping: Record<string, TraceType> = {
    'bar': TraceType.BAR,
    'column': TraceType.BAR,
    'line': TraceType.LINE,
    'spline': TraceType.LINE,
    'step-line': TraceType.LINE,
    'area': TraceType.LINE,
    'step-area': TraceType.LINE,
    'spline_area': TraceType.LINE,
    'scatter': TraceType.SCATTER,
    'marker': TraceType.SCATTER,
    'bubble': TraceType.SCATTER,
    'box': TraceType.BOX,
    'heatmap': TraceType.HEATMAP,
    'heat': TraceType.HEATMAP,
    'candlestick': TraceType.CANDLESTICK,
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
function resolveContainerElement(
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
 * Extract data points from an AnyChart series using its iterator.
 *
 * Returns an array of `{ x, y }` objects.  The concrete field names
 * depend on the AnyChart series type – most Cartesian series expose `"x"`
 * and `"value"` (mapped to y).  We try several common field names.
 */
function extractSeriesData(
  series: AnyChartSeries,
): Array<{ x: unknown; y: unknown }> {
  const points: Array<{ x: unknown; y: unknown }> = [];
  const iterator: AnyChartIterator = series.getIterator();
  iterator.reset();
  while (iterator.advance()) {
    const x = iterator.get('x') ?? iterator.get('name') ?? iterator.getIndex();
    const y = iterator.get('value') ?? iterator.get('y') ?? 0;
    points.push({ x, y });
  }
  return points;
}

/**
 * Build a CSS selector string that targets AnyChart SVG elements for a
 * given series index.  AnyChart renders each series as a `<g>` group
 * containing path / rect elements.  The exact DOM structure varies by
 * chart type, so we rely on AnyChart's series-level CSS class names.
 */
function buildSeriesSelector(seriesIndex: number): string {
  // AnyChart adds data attributes and class names to series groups.
  // A reasonable default targets paths inside the series group.
  return `.anychart-series-${seriesIndex} path, .anychart-series-${seriesIndex} rect`;
}

// ---------------------------------------------------------------------------
// Layer builders per MAIDR trace type
// ---------------------------------------------------------------------------

function buildBarLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const raw = extractSeriesData(series);
  const data: BarPoint[] = raw.map(p => ({
    x: p.x != null ? String(p.x) : '',
    y: typeof p.y === 'number' ? p.y : Number(p.y) || 0,
  }));
  return {
    id: String(seriesIndex),
    type: TraceType.BAR,
    selectors: selectors ?? buildSeriesSelector(seriesIndex),
    data,
  };
}

function buildLineLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const raw = extractSeriesData(series);
  const data: LinePoint[][] = [
    raw.map(p => ({
      x: typeof p.x === 'number' ? p.x : String(p.x),
      y: typeof p.y === 'number' ? p.y : Number(p.y) || 0,
    })),
  ];
  return {
    id: String(seriesIndex),
    type: TraceType.LINE,
    selectors: selectors ?? buildSeriesSelector(seriesIndex),
    data,
  };
}

function buildScatterLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const raw = extractSeriesData(series);
  const data: ScatterPoint[] = raw.map(p => ({
    x: typeof p.x === 'number' ? p.x : Number(p.x) || 0,
    y: typeof p.y === 'number' ? p.y : Number(p.y) || 0,
  }));
  return {
    id: String(seriesIndex),
    type: TraceType.SCATTER,
    selectors: selectors ?? buildSeriesSelector(seriesIndex),
    data,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an AnyChart chart instance into a MAIDR data object.
 *
 * This function inspects the chart's series and metadata after it has been
 * drawn, then constructs a {@link Maidr} JSON structure that can be passed
 * to `initMaidr()` or the `<Maidr>` React component.
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

    let layer: MaidrLayer;
    switch (traceType) {
      case TraceType.LINE:
        layer = buildLineLayer(series, i, options?.selectors);
        break;
      case TraceType.SCATTER:
        layer = buildScatterLayer(series, i, options?.selectors);
        break;
      default:
        // BAR is the default for column / bar / histogram-like types.
        layer = buildBarLayer(series, i, options?.selectors);
        break;
    }

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
 * This is the primary high-level API.  It extracts data from a drawn
 * AnyChart chart, generates the MAIDR schema, injects it as a
 * `maidr-data` attribute on the chart's container element, and
 * dispatches a DOM event so the MAIDR runtime picks it up.
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
  const maidr = anyChartToMaidr(chart, options);
  if (!maidr) {
    console.warn('[maidr/anychart] Could not extract data from AnyChart chart.');
    return null;
  }

  const container = resolveContainerElement(chart);
  if (!container) {
    console.warn(
      '[maidr/anychart] Could not find the chart container element. '
      + 'Make sure the chart has been drawn before calling bindAnyChart().',
    );
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
