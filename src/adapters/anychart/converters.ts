/**
 * AnyChart → MAIDR adapter converters.
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
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  CandlestickTrend,
  HeatmapData,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '@type/grammar';
import type {
  AnyChartBinderOptions,
  AnyChartGridInput,
  AnyChartInstance,
  AnyChartIterator,
  AnyChartsBinderOptions,
  AnyChartSeries,
  AnyChartTitle,
} from './types';
import { nextId } from '@adapters/shared/selectorUtil';
import { TraceType } from '@type/grammar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * AnyChart series types that are visually different from their MAIDR
 * representation (e.g. filled area rendered as a line trace). A runtime
 * warning is emitted for these so developers are aware of the semantic
 * difference their screen-reader users will experience.
 */
const AREA_TYPES = new Set(['area', 'step-area', 'spline-area']);

/**
 * The subset of {@link TraceType}s the AnyChart adapter can produce from a
 * chart series. AnyChart exposes no stacked/histogram/smooth series types,
 * so {@link mapSeriesType} only ever yields these six. Narrowing here lets
 * {@link buildLayer}'s switch be provably exhaustive at compile time.
 */
type AnyChartTraceType
  = | TraceType.BAR
    | TraceType.LINE
    | TraceType.SCATTER
    | TraceType.BOX
    | TraceType.HEATMAP
    | TraceType.CANDLESTICK;

/**
 * Map AnyChart series type strings to MAIDR TraceType values.
 *
 * AnyChart uses lowercase type names such as "bar", "line", "column", etc.
 * Multi-word types are normalised to kebab-case before lookup.
 * This mapping covers the chart types that MAIDR currently supports.
 *
 * @remarks
 * - `"bar"` (horizontal) and `"column"` (vertical) both map to
 *   {@link TraceType.BAR}. MAIDR does not currently distinguish
 *   bar orientation at the trace-type level.
 * - Area-family types (`area`, `step-area`, `spline-area`) map to
 *   {@link TraceType.LINE}. The fill is lost in the conversion; a
 *   runtime warning is emitted so developers are aware.
 */
export function mapSeriesType(anyChartType: string): AnyChartTraceType | null {
  const normalized = anyChartType.toLowerCase().replace(/[_\s]/g, '-');
  const mapping: Record<string, AnyChartTraceType> = {
    // Both horizontal bar and vertical column map to BAR.
    // MAIDR does not currently distinguish bar orientation at the trace level.
    'bar': TraceType.BAR,
    'column': TraceType.BAR,
    'line': TraceType.LINE,
    'spline': TraceType.LINE,
    'step-line': TraceType.LINE,
    // Area types are represented as LINE; the fill is lost.
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

  const traceType = mapping[normalized] ?? null;

  // Warn when an area series is silently downgraded to a line trace.
  if (traceType === TraceType.LINE && AREA_TYPES.has(normalized)) {
    console.warn(
      `[maidr/anychart] AnyChart "${anyChartType}" series mapped to LINE trace. `
      + 'The filled-area visual will be represented as a line for accessibility.',
    );
  }

  return traceType;
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

    // Stage-like object. Prefer `stage.container()` (the user's parent DIV)
    // over `stage.domElement()` (the stage's SVG element). The DIV is the
    // correct host to search for the rendered SVG inside.
    const stage = container as { container?: () => HTMLElement | null; domElement?: () => HTMLElement | null };
    if (typeof stage.container === 'function') {
      const inner = stage.container();
      if (inner instanceof HTMLElement)
        return inner;
    }
    if (typeof stage.domElement === 'function') {
      return stage.domElement();
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Resolve a data iterator for an AnyChart series.
 *
 * AnyChart 8.x exposes `getIterator()` on `series.data()` (the data view /
 * mapping). Some series classes also expose `getIterator()` directly. This
 * helper tries the direct method first and falls back to the data view so the
 * adapter works with both shapes.
 */
function resolveIterator(series: AnyChartSeries): AnyChartIterator | undefined {
  if (typeof series.getIterator === 'function') {
    try {
      return series.getIterator();
    } catch {
      // Fall through to data() path.
    }
  }
  if (typeof series.data === 'function') {
    try {
      const view = series.data();
      if (view && typeof view.getIterator === 'function')
        return view.getIterator();
    } catch {
      // No iterator available.
    }
  }
  return undefined;
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
  const iterator: AnyChartIterator | undefined = resolveIterator(series);
  if (!iterator)
    return rows;
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
      // Heatmap cell value
      'heat',
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
 * Attribute name stamped onto each bar's SVG element by
 * {@link stampBarAttributes}. The value encodes `<seriesIndex>-<pointIndex>`
 * so per-series selectors can be derived deterministically.
 */
const BAR_ATTR = 'data-maidr-anychart-bar';

/**
 * Attribute name stamped onto each line-point marker's SVG element by
 * {@link stampLineAttributes}. The value encodes `<seriesIndex>-<pointIndex>`
 * so per-series selectors can be derived deterministically.
 */
const LINE_ATTR = 'data-maidr-anychart-line-point';

/**
 * AnyChart series types that render as a connected line and therefore need
 * markers enabled for per-point highlighting. Area variants are included
 * because {@link mapSeriesType} downgrades them to {@link TraceType.LINE}.
 */
const LINE_LIKE_SERIES_TYPES = new Set([
  'line',
  'spline',
  'step-line',
  'area',
  'step-area',
  'spline-area',
]);

/**
 * Attribute name stamped onto every box-plot element (IQR rect, median line,
 * each whisker segment) by {@link stampBoxAttributes}. The value encodes
 * `<seriesIndex>-<boxIndex>` so per-box, per-series selectors can be
 * derived deterministically. Paired with {@link BOX_PART_ATTR} below.
 */
const BOX_ATTR = 'data-maidr-anychart-box';

/**
 * Attribute name stamped alongside {@link BOX_ATTR} to identify which
 * visual part of a box a given element represents. Values match the
 * {@link BoxSelector} field names that MAIDR's `BoxTrace` consumes:
 *   - `'iq'`  — filled IQR body (Q1-Q3 range); Q1 and Q3 are derived from
 *               its top/bottom edges via `Svg.createLineElement`.
 *   - `'q2'`  — median stroke (horizontal line inside the IQR).
 *   - `'min'` — lower whisker (vertical stroke below the IQR).
 *   - `'max'` — upper whisker (vertical stroke above the IQR).
 */
const BOX_PART_ATTR = 'data-maidr-anychart-box-part';

/**
 * Attribute name stamped onto each scatter / point / bubble marker's SVG
 * element by {@link stampScatterAttributes}. The value encodes
 * `<seriesIndex>-<pointIndex>` so per-series selectors can be derived
 * deterministically.
 */
const POINT_ATTR = 'data-maidr-anychart-point';

/**
 * Attribute name stamped onto each heatmap cell's SVG element by
 * {@link stampHeatmapAttributes}. Heatmaps are single-series, so the value
 * encodes `<rowIndex>-<colIndex>` (row-major) for direct lookup.
 */
const HEATMAP_ATTR = 'data-maidr-anychart-heatmap-cell';

/**
 * Attribute name stamped onto each candlestick path element by
 * {@link stampCandlestickAttributes}. Value encodes
 * `<seriesIndex>-<pointIndex>`. AnyChart renders each candle (wick + body)
 * as ONE <path>, so a single attribute on the path lets the model
 * highlight the whole candle across all OHLC segments.
 */
const CANDLESTICK_ATTR = 'data-maidr-anychart-candlestick-cell';

/**
 * Attribute name stamped onto each panel's own `<svg>` root by
 * {@link bindAnyCharts}. Its value is the panel token
 * (`<figureId>-<row>-<col>`), which uniquely identifies one chart's SVG
 * within the page. Every layer selector emitted for a multi-panel figure is
 * prefixed with `[data-maidr-anychart-panel="<token>"] ` so MAIDR's
 * document-global selector resolution can never leak into another panel
 * (or another figure).
 */
const PANEL_ATTR = 'data-maidr-anychart-panel';

/**
 * Identifies one panel (subplot cell) of a multi-panel AnyChart figure.
 * `undefined` everywhere a panel context is accepted means "single-panel
 * mode" — selectors and stamped attribute values then keep their original,
 * un-prefixed shape so existing single-chart behavior is unchanged.
 */
interface PanelContext {
  /** Page-unique token: `<sanitized figureId>-<row>-<col>`. */
  token: string;
  /** Subplot grid row (row-major, visual reading order). */
  row: number;
  /** Subplot grid column. */
  col: number;
}

/**
 * Descendant-combinator prefix scoping a selector to one panel's SVG.
 * Empty string in single-panel mode.
 */
function panelScope(panel: PanelContext | undefined): string {
  return panel ? `[${PANEL_ATTR}="${panel.token}"] ` : '';
}

/**
 * Prefix baked into every stamped attribute VALUE for a panel (e.g.
 * `data-maidr-anychart-bar="<token>:0-3"`). Scoping the values themselves —
 * not just the selectors — also fixes cross-figure collisions between two
 * independently bound charts whose bare `<series>-<point>` values would
 * otherwise be identical. Empty string in single-panel mode.
 */
function panelStampPrefix(panel: PanelContext | undefined): string {
  return panel ? `${panel.token}:` : '';
}

/**
 * Sanitize a figure id for embedding in attribute values / CSS attribute
 * selectors (quotes and other CSS-hostile characters become underscores).
 */
function sanitizePanelToken(value: string): string {
  return value.replace(/[^\w-]/g, '_');
}

/**
 * Resolve the CSS selector for a specific series index.
 *
 * AnyChart's internal SVG structure does not use stable, predictable class
 * names — layer groups carry only randomised `id` and `data-ac-wrapper-id`
 * attributes. When the caller does not supply selectors, we therefore rely
 * on per-element attributes that the adapter stamps during render:
 * - BAR: {@link stampBarAttributes} writes `data-maidr-anychart-bar`.
 * - LINE: {@link stampLineAttributes} writes
 *   `data-maidr-anychart-line-point` using a class-free geometric DOM walk
 *   (markers must be enabled, which {@link enableLineMarkersIfNeeded}
 *   ensures by mutating the series and forcing a redraw).
 * - BOX: handled inside {@link buildBoxLayer} — it constructs a
 *   `BoxSelector[]` referring to the per-part attributes
 *   ({@link BOX_ATTR} + {@link BOX_PART_ATTR}) stamped by
 *   {@link stampBoxAttributes}. `resolveSelector` returns `undefined` for
 *   BOX so that the layer-builder owns selector construction.
 * Callers can override either behaviour by passing an explicit `selectors`
 * entry.
 */
function resolveSelector(
  seriesIndex: number,
  traceType: TraceType,
  options?: AnyChartBinderOptions,
  panel?: PanelContext,
): string | string[] | undefined {
  const userSelectors = options?.selectors;
  if (userSelectors && userSelectors.length > 0) {
    // If the array has exactly one element and it is a string, apply it to
    // all series as a shared selector.
    if (userSelectors.length === 1 && typeof userSelectors[0] === 'string')
      return userSelectors[0];
    // Per-series: look up by index.
    return userSelectors[seriesIndex] ?? undefined;
  }

  // No explicit selector → use the per-series stamped attribute selector.
  // BAR uses `data-maidr-anychart-bar`; LINE uses
  // `data-maidr-anychart-line-point` (requires markers enabled on the series,
  // which {@link enableLineMarkersIfNeeded} handles).
  // In multi-panel mode both the selector (descendant of the panel's SVG)
  // and the attribute value (token prefix) are scoped to the panel.
  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  if (traceType === TraceType.BAR)
    return `${scope}[${BAR_ATTR}^="${stamp}${seriesIndex}-"]`;
  if (traceType === TraceType.LINE)
    return `${scope}[${LINE_ATTR}^="${stamp}${seriesIndex}-"]`;
  if (traceType === TraceType.SCATTER)
    return `${scope}[${POINT_ATTR}^="${stamp}${seriesIndex}-"]`;
  // Heatmaps are single-series (no series-index prefix); the chart-level
  // builder constructs the selector itself, so this branch only matters as
  // a defensive default when the heatmap path is bypassed.
  if (traceType === TraceType.HEATMAP)
    return `${scope}[${HEATMAP_ATTR}]`;

  return undefined;
}

/**
 * Collect bar-shape candidate elements from a single root, applying the
 * shared "looks like a bar" filter (non-defs, non-clip, non-zero bbox, and
 * bbox area below a fraction of the chart SVG to exclude plot-area
 * backgrounds and frame rectangles).
 */
function collectShapeCandidatesFromRoot(
  root: ParentNode,
  svgArea: number,
  maxAreaFraction: number,
): SVGElement[] {
  const out: SVGElement[] = [];
  const shapes = root.querySelectorAll<SVGElement>('rect, path');
  for (const el of Array.from(shapes)) {
    // Skip clip-path / definition shapes and any descendant of them.
    if (el.closest('defs, clipPath'))
      continue;
    let bbox: DOMRect | null = null;
    try {
      bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0)
      continue;
    // Reject the plot-area background and chart frame: any shape that
    // occupies more than `maxAreaFraction` of the chart SVG is almost
    // certainly not an individual data bar.
    if (svgArea > 0 && bbox.width * bbox.height > svgArea * maxAreaFraction)
      continue;
    out.push(el);
  }
  return out;
}

/**
 * Stamp a stable `data-maidr-anychart-bar` attribute on every bar element
 * rendered by an AnyChart cartesian bar/column series.
 *
 * AnyChart's GraphicsJS renderer does not expose stable CSS classes for
 * individual data points, and AnyChart's public Point API has no
 * `getDomElement()` method. The only reliable cross-version path is to
 * query the rendered SVG for the candidate shapes and stamp them
 * ourselves so MAIDR's highlight layer can find them with a deterministic
 * selector.
 *
 * Filtering layers (in order of preference):
 * 1. Prefer shapes inside series-class groups (`g[class*="series"]`) —
 *    these reliably exclude the plot-area background rectangle that lives
 *    in its own background group.
 * 2. Filter out clip-path / definition shapes.
 * 3. Filter out shapes with zero bounding boxes (invisible markers).
 * 4. Filter out shapes whose bounding box exceeds 40 % of the chart SVG
 *    area — this rejects the plot background and chart frame that
 *    otherwise look identical to bars at the DOM level.
 *
 * In document order the surviving candidates are assigned to each series'
 * points: the first N go to series 0, the next M to series 1, etc. The
 * stamp is idempotent: elements already carrying the attribute are left
 * untouched.
 */
function stampBarAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  // Establish the chart SVG area as a reference for the "too large to be a
  // bar" filter. `getBoundingClientRect()` is used because `getBBox()` on
  // the outer <svg> includes only painted descendants, which is
  // approximately what we want — but getBoundingClientRect is safer across
  // browsers when the SVG has no viewBox set.
  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;
  const MAX_AREA_FRACTION = 0.4;

  // Layer 1: prefer shapes that live inside a series-class group. AnyChart
  // renders the plot-area background outside any series group, so this
  // scoping alone excludes the most common false positive.
  let candidates: SVGElement[] = [];
  const seriesGroups = svg.querySelectorAll<SVGElement>('g[class*="series"]');
  if (seriesGroups.length > 0) {
    for (const g of Array.from(seriesGroups))
      candidates.push(...collectShapeCandidatesFromRoot(g, svgArea, MAX_AREA_FRACTION));
  }

  // Layer 2 (fallback): if no series groups matched or yielded nothing,
  // scan the whole SVG. The area filter still excludes the background.
  if (candidates.length === 0)
    candidates = collectShapeCandidatesFromRoot(svg, svgArea, MAX_AREA_FRACTION);

  // Walk series and stamp the next N candidates per series, in document
  // order. AnyChart renders bar/column series in data order, so document
  // order matches data index.
  let cursor = 0;
  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      // Ignore; defaults to empty string and the type check below skips it.
    }
    // Only stamp for bar/column series; leave other shapes for future work.
    if (seriesType !== 'bar' && seriesType !== 'column')
      continue;

    const rows = extractRawRows(series);
    const pointCount = rows.length;
    if (pointCount === 0)
      continue;

    // If our filter yielded the wrong count, emit one diagnostic warning
    // and degrade gracefully: only stamp the first min(pointCount,
    // remaining) so we never mis-label a non-bar shape.
    const remaining = candidates.length - cursor;
    if (remaining < pointCount) {
      console.warn(
        `[maidr/anychart] Expected ${pointCount} bar shapes for series ${s} `
        + `but only ${remaining} candidate(s) remain after filtering. `
        + 'Highlighting may be incomplete; pass an explicit `selectors` '
        + 'entry to override.',
      );
    }

    const stampCount = Math.min(pointCount, remaining);
    for (let p = 0; p < stampCount; p++) {
      const el = candidates[cursor++];
      if (!el.hasAttribute(BAR_ATTR))
        el.setAttribute(BAR_ATTR, `${stampPrefix}${s}-${p}`);
    }
  }
}

/**
 * Enable markers on every line-like series whose markers are currently
 * disabled.
 *
 * AnyChart line / area series render only the connecting path by default —
 * no per-point DOM elements exist. MAIDR's highlight layer requires one
 * element per point, so we transparently flip `series.markers().enabled(true)`
 * for these series. AnyChart re-renders the chart on the next tick.
 *
 * @returns `true` if any series had its markers enabled (i.e. the existing
 *   SVG is now stale and the caller must wait for AnyChart's next
 *   `stagerendered` event before stamping).
 */
function enableLineMarkersIfNeeded(chart: AnyChartInstance): boolean {
  // Heatmaps (and any other single-dataset chart types) do not implement
  // `getSeriesCount()` / `getSeriesAt()`. Calling those methods on a heatmap
  // throws `TypeError: getSeriesCount is not a function`. Detect via
  // `getType()` and exit early — heatmaps never need line markers anyway.
  let chartType: string | undefined;
  try {
    chartType = chart.getType?.();
  } catch {
    chartType = undefined;
  }
  // Production AnyChart builds return `'heat-map'` from getType(); dev builds
  // may return `'heatmap'` / `'heat'`. Match by substring (as
  // stampHeatmapAttributes does) so all three route correctly.
  if (chartType?.includes('heat'))
    return false;

  const seriesCount = chart.getSeriesCount();
  let mutated = false;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      // Skip series whose type cannot be determined.
      continue;
    }
    if (!LINE_LIKE_SERIES_TYPES.has(seriesType))
      continue;

    // Some AnyChart series types do not expose `markers()` even though they
    // render as a line (very old builds). Warn the user so they can enable
    // markers manually in their chart configuration.
    if (typeof series.markers !== 'function') {
      console.warn(
        `[maidr/anychart] Series ${s} ("${seriesType}") does not expose `
        + '`markers()`. Per-point highlighting requires marker rendering; '
        + 'please enable markers manually if highlighting is needed.',
      );
      continue;
    }

    try {
      const markers = series.markers();
      const isEnabled = markers.enabled();
      if (!isEnabled) {
        markers.enabled(true);
        mutated = true;
      }
    } catch (err) {
      console.warn(
        `[maidr/anychart] Could not enable markers on series ${s}:`,
        err,
      );
    }
  }

  return mutated;
}

/**
 * Collect line-marker candidate elements from the entire chart SVG using a
 * class-free geometric filter.
 *
 * AnyChart 8.x renders its SVG with NO stable CSS classes on layer groups —
 * only `id="ac_layer_..."` / `id="ac_path_..."` and `data-ac-wrapper-id`
 * attributes, which are randomly assigned per render. Consequently we cannot
 * scope a "marker layer" query by class; instead we identify markers by
 * their distinctive geometric signature:
 *
 * - small (bbox area < 5 % of chart SVG AND each dimension ≤ 30 px),
 * - visible (computed fill / stroke not both `none`, opacity > 0),
 * - roughly square (aspect ratio < 5 — excludes ticks and short line
 *   segments which are very thin),
 * - not part of `<defs>` / `<clipPath>` (decorative or template shapes),
 * - non-zero bbox (degenerate spacer paths such as `d="M 0,0"` are
 *   eliminated by the visibility check as well as by this guard).
 *
 * Returned candidates carry the bbox-center x so callers can sort them
 * left-to-right (which matches data-point order for line charts).
 */
function collectLineMarkerCandidates(
  svg: SVGElement,
  svgArea: number,
): Array<{ el: SVGElement; x: number }> {
  // Markers are point-sized; these thresholds are deliberately generous
  // upper bounds so that custom marker symbols (square, diamond, star) all
  // survive while line strokes, plot backgrounds, axis frames, and legend
  // chips are excluded.
  const MAX_AREA_FRACTION = 0.05;
  const MAX_MARKER_DIMENSION = 30;
  const MAX_ASPECT_RATIO = 5;

  const out: Array<{ el: SVGElement; x: number }> = [];
  const shapes = svg.querySelectorAll<SVGElement>(
    'circle, ellipse, path, rect, polygon',
  );

  for (const el of Array.from(shapes)) {
    if (el.closest('defs, clipPath'))
      continue;

    let bbox: DOMRect | null = null;
    try {
      bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0)
      continue;

    if (svgArea > 0 && bbox.width * bbox.height > svgArea * MAX_AREA_FRACTION)
      continue;
    if (bbox.width > MAX_MARKER_DIMENSION || bbox.height > MAX_MARKER_DIMENSION)
      continue;

    const widthOverHeight = bbox.width / bbox.height;
    const heightOverWidth = bbox.height / bbox.width;
    if (widthOverHeight > MAX_ASPECT_RATIO || heightOverWidth > MAX_ASPECT_RATIO)
      continue;

    // Read fill / stroke / opacity from SVG presentation ATTRIBUTES rather
    // than `getComputedStyle()`. Chromium does not reliably propagate SVG
    // presentation attributes (e.g. `fill="#64b5f6"`, `stroke="#64b5f6"`)
    // into computed style — the computed `fill` / `stroke` often come back
    // as empty strings, causing this visibility filter to reject every
    // marker AnyChart renders (which uses attribute-based colours, not
    // CSS). This is the same root cause that broke boxplot highlighting in
    // Phase 9. Direct attribute access matches what AnyChart actually
    // emits.
    const fillAttr = el.getAttribute('fill') || 'none';
    const strokeAttr = el.getAttribute('stroke') || 'none';
    const opacityAttr = Number.parseFloat(el.getAttribute('opacity') || '1');
    if ((fillAttr === 'none' && strokeAttr === 'none') || opacityAttr === 0)
      continue;

    out.push({ el, x: bbox.x + bbox.width / 2 });
  }

  return out;
}

/**
 * Stamp a stable `data-maidr-anychart-line-point="<series>-<index>"`
 * attribute on every marker element rendered by an AnyChart line / area
 * series so MAIDR's highlight overlay can locate each data point.
 *
 * Why a geometric DOM walk and not a class-based query?
 *   AnyChart 8.x exposes NO CSS classes on its layer groups (only
 *   randomised `id` and `data-ac-wrapper-id` attributes) and provides no
 *   public per-point marker DOM accessor on the JS API. Geometric
 *   filtering is therefore the only stable way to identify marker shapes,
 *   matching the strategy already proven by {@link stampBarAttributes}.
 *
 * Strategy:
 *   1. For each line-like series, determine the expected `pointCount`.
 *   2. Run {@link collectLineMarkerCandidates} once over the SVG and sort
 *      candidates left-to-right (matching data-point order).
 *   3. Single-series charts: assign the first `pointCount` candidates as
 *      `0-0 … 0-(N-1)`.
 *   4. Multi-series charts: offset-partition (`candidates[s*N … s*N+N]`)
 *      and emit a one-time warning recommending an explicit `selectors`
 *      entry, because precise per-series attribution requires matching
 *      point coordinates against axis scale transforms (out of scope here).
 *
 * The stamp is idempotent — re-running on a chart that has already been
 * stamped is a no-op.
 */
function stampLineAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;

  // Collect candidates once over the whole SVG; both single- and multi-
  // series paths operate on the same sorted list below.
  const candidates = collectLineMarkerCandidates(svg, svgArea);
  candidates.sort((a, b) => a.x - b.x);

  let multiSeriesWarned = false;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (!LINE_LIKE_SERIES_TYPES.has(seriesType))
      continue;

    const rows = extractRawRows(series);
    const pointCount = rows.length;
    if (pointCount === 0)
      continue;

    let stampStart = 0;
    let stampEnd = 0;
    if (seriesCount === 1) {
      stampStart = 0;
      stampEnd = Math.min(pointCount, candidates.length);
    } else {
      if (!multiSeriesWarned) {
        console.warn(
          '[maidr/anychart] Multi-series line highlighting uses an offset-'
          + 'based partition of marker candidates and may misattribute points '
          + 'across series with overlapping geometry. For precise highlighting, '
          + 'pass an explicit `selectors` entry to bindAnyChart().',
        );
        multiSeriesWarned = true;
      }
      const offset = s * pointCount;
      stampStart = offset;
      stampEnd = Math.min(offset + pointCount, candidates.length);
    }

    if (stampEnd - stampStart < pointCount) {
      console.warn(
        `[maidr/anychart] Expected ${pointCount} line-marker shapes for `
        + `series ${s} but found ${Math.max(0, stampEnd - stampStart)}. `
        + 'Highlighting may be incomplete; ensure markers are enabled on the '
        + 'series or pass an explicit `selectors` entry to override.',
      );
    }

    for (let i = stampStart; i < stampEnd; i++) {
      const el = candidates[i].el;
      if (!el.hasAttribute(LINE_ATTR))
        el.setAttribute(LINE_ATTR, `${stampPrefix}${s}-${i - stampStart}`);
    }
  }
}

/**
 * AnyChart series types that render as point clouds (scatter / bubble /
 * marker). These map to {@link TraceType.SCATTER} and require per-point
 * highlight attributes to be stamped.
 */
const SCATTER_LIKE_SERIES_TYPES = new Set([
  'marker',
  'scatter',
  'bubble',
]);

/**
 * Stamp `data-maidr-anychart-point="<series>-<index>"` on every scatter /
 * marker / bubble point so MAIDR's highlight service can locate each data
 * point via attribute selector.
 *
 * Strategy mirrors {@link stampLineAttributes}: AnyChart does not expose
 * per-point DOM accessors, so we use {@link collectLineMarkerCandidates} to
 * geometrically filter point-sized shapes, then sort and partition by
 * series. Scatter points are visually identical to line markers (small,
 * roughly square), so the same filter applies.
 *
 * Sort order is x-center primary, y-center secondary, matching
 * `ScatterTrace.groupSvgElements`'s X→Y grouping expectation. Multi-series
 * scatter charts use the same offset-partition as line-series and emit the
 * same one-time warning recommending an explicit `selectors` entry.
 *
 * Idempotent — re-running on a chart that has already been stamped is a
 * no-op.
 */
function stampScatterAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;

  // Reuse the line-marker geometric filter; scatter points have the same
  // shape profile (small + roughly square). We attach a y-center to each
  // candidate so the sort can disambiguate points sharing an x-center.
  const rawCandidates = collectLineMarkerCandidates(svg, svgArea);
  const candidates = rawCandidates.map((c) => {
    let bbox: DOMRect | null = null;
    try {
      bbox = (c.el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    const y = bbox ? bbox.y + bbox.height / 2 : 0;
    return { el: c.el, x: c.x, y };
  });
  candidates.sort((a, b) => (a.x - b.x) || (a.y - b.y));

  // Diagnostic: surface the candidate count up-front so users / developers
  // can tell at a glance whether the geometric filter actually found
  // scatter markers. Zero or far-too-few candidates almost always means the
  // visibility filter rejected the points (see the Phase 9 / Phase 11B
  // attribute vs. computed-style issue) — not a downstream stamping bug.
  let expectedTotalPoints = 0;
  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (!SCATTER_LIKE_SERIES_TYPES.has(seriesType))
      continue;
    expectedTotalPoints += extractRawRows(series).length;
  }
  if (expectedTotalPoints > 0) {
    console.warn(
      `[maidr/anychart] scatter: collected ${candidates.length} marker `
      + `candidates, expected ${expectedTotalPoints} points across `
      + `${seriesCount} series.`,
    );
  }

  let multiSeriesWarned = false;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (!SCATTER_LIKE_SERIES_TYPES.has(seriesType))
      continue;

    const rows = extractRawRows(series);
    const pointCount = rows.length;
    if (pointCount === 0)
      continue;

    let stampStart = 0;
    let stampEnd = 0;
    if (seriesCount === 1) {
      stampStart = 0;
      stampEnd = Math.min(pointCount, candidates.length);
    } else {
      if (!multiSeriesWarned) {
        console.warn(
          '[maidr/anychart] Multi-series scatter highlighting uses an '
          + 'offset-based partition of marker candidates and may misattribute '
          + 'points across series with overlapping geometry. For precise '
          + 'highlighting, pass an explicit `selectors` entry to bindAnyChart().',
        );
        multiSeriesWarned = true;
      }
      const offset = s * pointCount;
      stampStart = offset;
      stampEnd = Math.min(offset + pointCount, candidates.length);
    }

    if (stampEnd - stampStart < pointCount) {
      console.warn(
        `[maidr/anychart] Expected ${pointCount} scatter marker shapes for `
        + `series ${s} but found ${Math.max(0, stampEnd - stampStart)}. `
        + 'Highlighting may be incomplete; pass an explicit `selectors` entry '
        + 'to override.',
      );
    }

    for (let i = stampStart; i < stampEnd; i++) {
      const c = candidates[i];
      if (c.el.hasAttribute(POINT_ATTR))
        continue;
      c.el.setAttribute(POINT_ATTR, `${stampPrefix}${s}-${i - stampStart}`);
      // Stamp the bbox-center as `cx` / `cy` so MAIDR's
      // `ScatterTrace.groupSvgElements` can extract coordinates from these
      // <path> elements directly. AnyChart scatter markers render as
      // two-arc circle paths (e.g. `d="M cx cy A 5 5 0 0 1 ..."`) with NO
      // `cx` / `cy` / `x` / `y` / `transform` attributes — without those
      // attributes, every element returns NaN coordinates and grouping
      // silently collapses to empty highlight buckets. `cx` / `cy` on
      // <path> is inert for SVG rendering (the `d` attribute alone
      // controls the shape), so this is purely additive metadata.
      c.el.setAttribute('cx', String(c.x));
      c.el.setAttribute('cy', String(c.y));
    }
  }
}

// ---------------------------------------------------------------------------
// Box attribute stamping (class-free geometric classification)
// ---------------------------------------------------------------------------

/**
 * Geometric thresholds used by {@link stampBoxAttributes} and its helpers.
 * Calibrated against AnyChart 8.x's GraphicsJS renderer; tighter values
 * risk missing valid candidates, looser values risk picking up axis lines
 * or chart-frame decorations.
 */
const BOX_MAX_AREA_FRACTION = 0.4; // exclude plot background / frame
const BOX_MIN_AREA_FRACTION = 0.001; // exclude axis ticks / 1-px decorations
// Aspect ratio threshold (longer dimension / shorter). 1.5 is permissive
// enough to admit thick-stroked medians on small/narrow boxes while still
// rejecting nearly-square shapes.
const BOX_ASPECT_THRESHOLD = 1.5;
// ± px slack when aligning whiskers / median to IQR center. 15 px tolerates
// sub-pixel rounding and slight horizontal offsets in dodged layouts;
// still tight enough to exclude axis lines, which sit at the chart edges.
const BOX_CENTER_TOLERANCE_PX = 15;

/**
 * One IQR-body candidate after the geometric filter pass.
 */
interface IqCandidate {
  el: SVGElement;
  bbox: DOMRect;
  cx: number;
  cy: number;
}

/**
 * Collect every shape that looks like the filled IQR body of a box plot:
 * a visible filled `<rect>` or `<path>` whose bbox occupies a small-to-
 * moderate fraction of the chart SVG. Sized to exclude both the plot-area
 * background (too big) and axis/tick decorations (too small).
 */
function collectIqCandidates(
  svg: SVGElement,
  svgArea: number,
): IqCandidate[] {
  const out: IqCandidate[] = [];
  const shapes = svg.querySelectorAll<SVGElement>('rect, path');
  for (const el of Array.from(shapes)) {
    if (el.closest('defs, clipPath'))
      continue;
    let bbox: DOMRect | null = null;
    try {
      bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0)
      continue;
    if (svgArea > 0) {
      const fraction = (bbox.width * bbox.height) / svgArea;
      if (fraction > BOX_MAX_AREA_FRACTION || fraction < BOX_MIN_AREA_FRACTION)
        continue;
    }
    let style: CSSStyleDeclaration | null = null;
    try {
      style = window.getComputedStyle(el);
    } catch {
      style = null;
    }
    if (style) {
      const fill = style.fill || 'none';
      const fillOpacity = Number.parseFloat(style.fillOpacity || '1');
      if (fill === 'none' || fill === 'transparent' || fillOpacity < 0.01)
        continue;
    }
    out.push({
      el,
      bbox,
      cx: bbox.x + bbox.width / 2,
      cy: bbox.y + bbox.height / 2,
    });
  }
  return out;
}

/**
 * Inspect an SVG element and report whether it could be a stroke-only line
 * segment whose bbox passes the basic geometric checks (non-defs, non-zero,
 * not already stamped, stroke visible, fill effectively absent).
 *
 * "Fill effectively absent" mirrors {@link collectIqCandidates}'s visibility
 * test: a path is treated as stroke-only when `fill === 'none'`, `fill ===
 * 'transparent'`, or `fill-opacity < 0.01`. AnyChart frequently emits
 * `fill="black" fill-opacity="0"` on its stroke-only paths, so checking
 * the resolved color alone would incorrectly reject every median /
 * whisker stroke.
 */
function strokeBBoxOf(el: SVGElement): DOMRect | null {
  if (el.closest('defs, clipPath'))
    return null;
  if (el.hasAttribute(BOX_ATTR))
    return null;

  // Use SVG presentation attributes directly. getComputedStyle() does not
  // reliably reflect attribute-based stroke/fill across browsers (Chromium
  // often returns "" / "none" for stroke="#xxx" set as an attribute). This
  // was the silent killer in earlier phases: every stroke-only median and
  // whisker path was being rejected here before any geometric check ran.
  const strokeAttr = el.getAttribute('stroke');
  if (!strokeAttr || strokeAttr === 'none')
    return null;
  const fillAttr = el.getAttribute('fill') || 'none';
  const fillOpacity = Number.parseFloat(
    el.getAttribute('fill-opacity') || '1',
  );
  const fillVisible
    = fillAttr !== 'none' && fillAttr !== 'transparent' && fillOpacity >= 0.01;
  if (fillVisible)
    return null;

  let bbox: DOMRect | null = null;
  try {
    bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
  } catch {
    bbox = null;
  }
  if (!bbox)
    return null;

  // Inflate by stroke-width. Pure-horizontal paths (e.g. medians) have
  // geometric height=0 and pure-vertical paths (e.g. whisker stems) have
  // geometric width=0; without inflation, those would be rejected by the
  // "width<=0 || height<=0" guard even though they paint a visible stroke.
  const strokeWidth = Number.parseFloat(
    el.getAttribute('stroke-width') || '1',
  );
  const pad = Math.max(strokeWidth / 2, 0.5);
  const inflatedWidth = bbox.width + pad * 2;
  const inflatedHeight = bbox.height + pad * 2;
  if (inflatedWidth <= 0 || inflatedHeight <= 0)
    return null;

  return new DOMRect(
    bbox.x - pad,
    bbox.y - pad,
    inflatedWidth,
    inflatedHeight,
  );
}

/**
 * Find the median stroke for a given IQR box: a horizontal-ish stroke-only
 * shape whose center sits inside the IQR bbox and whose x-center aligns
 * with the IQR x-center (within tolerance).
 */
function findMedianElement(
  svg: SVGElement,
  iq: IqCandidate,
): SVGElement | null {
  const shapes = svg.querySelectorAll<SVGElement>('path, line');
  for (const el of Array.from(shapes)) {
    // Skip elements already claimed by a previous box. Without this guard
    // the scan can re-return a median that was already stamped (because
    // x-center/y-band overlap between boxes is possible).
    if (el.hasAttribute(BOX_ATTR))
      continue;
    // AnyChart groups each box-plot box's primitives under the same parent
    // `<g data-ac-wrapper-id="…">`. Reject candidates that don't share a
    // parent group with the IQR — this keeps axis baselines, gridlines, and
    // neighbouring boxes' medians out of consideration even when their
    // bbox center happens to align with this box's cx.
    if (el.parentElement && iq.el.parentElement
      && el.parentElement !== iq.el.parentElement) {
      continue;
    }
    const bbox = strokeBBoxOf(el);
    if (!bbox)
      continue;
    // Reject degenerate caps and tiny decorations: a typical median is
    // (IQR-width × stroke-width) ≈ 60-100 px². 20px² is well below that
    // but excludes zero-area path siblings.
    if (bbox.width * bbox.height < 20)
      continue;
    // Horizontal aspect.
    if (bbox.width < bbox.height * BOX_ASPECT_THRESHOLD)
      continue;
    const cx = bbox.x + bbox.width / 2;
    if (Math.abs(cx - iq.cx) > BOX_CENTER_TOLERANCE_PX)
      continue;
    const cy = bbox.y + bbox.height / 2;
    if (cy < iq.bbox.y || cy > iq.bbox.y + iq.bbox.height)
      continue;
    // Spatial overlap check: median's x-range must overlap the IQR's
    // x-range. Center+tolerance alone can admit a same-y-level horizontal
    // stroke that's horizontally offset (e.g. a neighbouring box's median
    // when the boxes are dodged tightly).
    const medianLeft = bbox.x;
    const medianRight = bbox.x + bbox.width;
    const iqLeft = iq.bbox.x;
    const iqRight = iq.bbox.x + iq.bbox.width;
    if (medianRight <= iqLeft || medianLeft >= iqRight)
      continue;
    return el;
  }
  return null;
}

/**
 * Split a `<path>` whose `d` contains two `M` commands into two new
 * sibling paths, one per `M…L…` subpath. Used when AnyChart emits both
 * whiskers as a single path element. Copies stroke styling and the
 * `data-ac-wrapper-id` attribute so the clones look identical, then hides
 * the original. The new paths are returned in document order (first M,
 * then second M).
 *
 * Returns `[path]` unchanged if the path contains fewer than two `M`
 * commands or the split cannot be performed safely.
 */
function splitTwoSegmentPath(path: SVGElement): SVGElement[] {
  const d = path.getAttribute('d') ?? '';
  // AnyChart typically emits uppercase commands, but use the case-
  // insensitive flag so a lowercase `m` does not break detection.
  const moveMatches = d.match(/m/gi) ?? [];
  if (moveMatches.length < 2)
    return [path];

  // Split before each M, drop the leading empty element if present.
  const segments = d.split(/(?=m)/gi).map(s => s.trim()).filter(Boolean);
  if (segments.length < 2)
    return [path];

  const NS = 'http://www.w3.org/2000/svg';
  const parent = path.parentNode;
  if (!parent)
    return [path];

  const clones: SVGElement[] = [];
  for (const seg of segments) {
    const clone = document.createElementNS(NS, 'path') as SVGElement;
    clone.setAttribute('d', seg);
    const stroke = path.getAttribute('stroke');
    if (stroke !== null)
      clone.setAttribute('stroke', stroke);
    const strokeWidth = path.getAttribute('stroke-width');
    if (strokeWidth !== null)
      clone.setAttribute('stroke-width', strokeWidth);
    const strokeLinecap = path.getAttribute('stroke-linecap');
    if (strokeLinecap !== null)
      clone.setAttribute('stroke-linecap', strokeLinecap);
    clone.setAttribute('fill', 'none');
    const wrapperId = path.getAttribute('data-ac-wrapper-id');
    if (wrapperId !== null)
      clone.setAttribute('data-ac-wrapper-id', wrapperId);
    // Mark provenance so the split is identifiable in DevTools.
    clone.setAttribute('data-maidr-anychart-split-from', path.id || '');
    parent.insertBefore(clone, path);
    clones.push(clone);
  }

  // Hide the original (rather than removing it) to avoid any AnyChart
  // bookkeeping that might rely on the node still being present.
  path.setAttribute('visibility', 'hidden');
  return clones;
}

/**
 * Resolve the whisker DOM for a given IQR box and return the two split
 * segments labeled by orientation relative to the box center.
 *
 * AnyChart frequently renders both whiskers as one `<path>` whose `d`
 * attribute contains two `M…L…` subpaths (lower + upper). We detect and
 * split such paths via {@link splitTwoSegmentPath}; if the path already
 * contains a single subpath we use it directly.
 *
 * Returns `[]` if no candidate stroke aligns with the IQR x-center.
 */
function findWhiskerElements(
  svg: SVGElement,
  iq: IqCandidate,
): Array<{ el: SVGElement; isUpper: boolean }> {
  const out: Array<{ el: SVGElement; isUpper: boolean }> = [];
  const shapes = svg.querySelectorAll<SVGElement>('path, line');

  for (const el of Array.from(shapes)) {
    // Skip elements already stamped by a previous box (IQR bodies, prior
    // whisker/median scans, or split clones). Without this guard, a box's
    // whisker scan can match siblings owned by an earlier box and prevent
    // legitimate per-box matches.
    if (el.hasAttribute(BOX_ATTR))
      continue;

    const bbox = strokeBBoxOf(el);
    if (!bbox)
      continue;
    // X-center must align with IQR center; this is the strongest filter
    // because whiskers are vertical and pass through the box center.
    const cx = bbox.x + bbox.width / 2;
    if (Math.abs(cx - iq.cx) > BOX_CENTER_TOLERANCE_PX)
      continue;
    // AnyChart groups each box-plot box's primitives under the same parent
    // `<g data-ac-wrapper-id="…">`. Reject candidates that don't share a
    // parent group with the IQR — this keeps axis baselines and grid lines
    // from leaking through when their bbox center happens to align with a
    // box's cx (most likely the centermost box).
    if (el.parentElement && iq.el.parentElement
      && el.parentElement !== iq.el.parentElement) {
      continue;
    }
    // Reject degenerate caps: AnyChart emits zero-length path siblings like
    // `d="M x y L x y M x y L x y"` for whisker caps. Their bbox height is
    // effectively zero (only stroke-width). Real whisker stems are tens of
    // pixels tall, so a 2px minimum is generous.
    if (bbox.height < 2)
      continue;
    // Either a single vertical stroke or a two-segment path covering both.
    // For a path, attempt to split before applying the aspect filter so a
    // single-element pair becomes two individually classifiable segments.
    if (el.tagName.toLowerCase() === 'path') {
      const splits = splitTwoSegmentPath(el);
      if (splits.length >= 2) {
        for (const seg of splits) {
          let segBox: DOMRect | null = null;
          try {
            segBox = (seg as unknown as SVGGraphicsElement).getBBox?.() ?? null;
          } catch {
            segBox = null;
          }
          if (!segBox || segBox.width < 0 || segBox.height <= 0)
            continue;
          // Per-segment cap filter (defensive: combined-bbox check above
          // should already cover this, but split-clone bboxes can differ).
          if (segBox.height < 2)
            continue;
          // Each segment should be vertical-ish on its own.
          if (segBox.height < Math.max(segBox.width, 1) * BOX_ASPECT_THRESHOLD)
            continue;
          const segCy = segBox.y + segBox.height / 2;
          out.push({ el: seg, isUpper: segCy < iq.cy });
        }
        // Once we've successfully consumed a multi-segment path for THIS
        // box (verified by the x-center filter above), stop scanning so we
        // don't pick up another box's whisker that happens to align.
        if (out.length >= 2)
          return out;
        continue;
      }
    }

    // Single-segment path or <line>: require vertical aspect.
    if (bbox.height < Math.max(bbox.width, 1) * BOX_ASPECT_THRESHOLD)
      continue;
    const cy = bbox.y + bbox.height / 2;
    out.push({ el, isUpper: cy < iq.cy });
    if (out.length >= 2)
      return out;
  }

  return out;
}

/**
 * Stamp `data-maidr-anychart-box="<series>-<box>"` and
 * `data-maidr-anychart-box-part="iq|q2|min|max"` attributes onto every
 * IQR / median / whisker element of every box-plot series in the chart.
 *
 * Why a geometric DOM walk and not a class-based query?
 *   AnyChart 8.x uses NO CSS classes — only randomised `id` and
 *   `data-ac-wrapper-id` attributes. There is also no public per-point
 *   DOM accessor on the JS API. Geometric filtering is therefore the
 *   only stable way to identify the IQR body, median stroke, and whisker
 *   segments, matching the strategy already proven by
 *   {@link stampBarAttributes} and {@link stampLineAttributes}.
 *
 * Strategy:
 *   1. For each `box` series, collect all visible filled rect/path shapes
 *      whose bbox sits between {@link BOX_MIN_AREA_FRACTION} and
 *      {@link BOX_MAX_AREA_FRACTION} of the SVG area. Sort left-to-right
 *      to match the iterator's data order.
 *   2. For each box `b` (`0…points.length-1`):
 *      a. Stamp the IQR element with `BOX_ATTR="s-b"` + `BOX_PART_ATTR="iq"`.
 *         Q1 and Q3 are NOT stamped — MAIDR derives them from the IQ
 *         element's top/bottom edges via `Svg.createLineElement`.
 *      b. Find the median stroke (horizontal stroke-only shape whose
 *         center sits inside the IQ bbox) and stamp `"q2"`.
 *      c. Find the whisker pair. If AnyChart renders them as one path
 *         containing two `M…L…` subpaths, split in place into two
 *         sibling paths via {@link splitTwoSegmentPath}. Classify each
 *         as `"max"` (above IQR center) or `"min"` (below).
 *
 * All stamps are idempotent: re-running on an already-stamped chart is a
 * no-op. Outlier sections are NOT handled because AnyChart's iterator API
 * does not expose outlier arrays.
 */
function stampBoxAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;

  // Collect IQR candidates once; partition per-series below.
  const allIqCandidates = collectIqCandidates(svg, svgArea);
  allIqCandidates.sort((a, b) => a.cx - b.cx);

  let multiSeriesWarned = false;
  let consumedIqIndex = 0;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (seriesType !== 'box')
      continue;

    const rows = extractRawRows(series);
    const boxCount = rows.length;
    if (boxCount === 0)
      continue;

    if (seriesCount > 1 && !multiSeriesWarned) {
      console.warn(
        '[maidr/anychart] Multi-series box highlighting uses an offset-'
        + 'based partition of IQR candidates and may misattribute boxes '
        + 'across series with overlapping geometry. For precise highlighting, '
        + 'pass an explicit `selectors` entry to bindAnyChart().',
      );
      multiSeriesWarned = true;
    }

    const start = consumedIqIndex;
    const end = Math.min(start + boxCount, allIqCandidates.length);
    consumedIqIndex = end;

    if (end - start < boxCount) {
      console.warn(
        `[maidr/anychart] Expected ${boxCount} IQR shapes for box series `
        + `${s} but found ${Math.max(0, end - start)}. Highlighting may be `
        + 'incomplete; pass an explicit `selectors` entry to override.',
      );
    }

    for (let b = 0; b < end - start; b++) {
      const iq = allIqCandidates[start + b];
      if (!iq.el.hasAttribute(BOX_ATTR)) {
        iq.el.setAttribute(BOX_ATTR, `${stampPrefix}${s}-${b}`);
        iq.el.setAttribute(BOX_PART_ATTR, 'iq');
      }

      const median = findMedianElement(svg, iq);
      if (median && !median.hasAttribute(BOX_ATTR)) {
        median.setAttribute(BOX_ATTR, `${stampPrefix}${s}-${b}`);
        median.setAttribute(BOX_PART_ATTR, 'q2');
      } else if (!median) {
        // DIAGNOSTIC (temporary, removed once box highlighting is verified):
        // surface the IQR bbox so we can see whether the median scan missed
        // a real element or AnyChart genuinely didn't emit one for this box
        // (can happen when median color matches IQR fill).
        console.warn(
          `[maidr/anychart] Box ${s}-${b}: no median found. IQR bbox:`,
          iq.bbox,
        );
      }

      const whiskers = findWhiskerElements(svg, iq);
      if (whiskers.length !== 2) {
        // DIAGNOSTIC (temporary): expected exactly two whisker segments
        // (min stem + max stem). Other counts indicate a scan miss.
        console.warn(
          `[maidr/anychart] Box ${s}-${b}: expected 2 whiskers, found `
          + `${whiskers.length}. IQR cx=${iq.cx.toFixed(1)}, `
          + `cy=${iq.cy.toFixed(1)}`,
        );
      }
      for (const { el, isUpper } of whiskers) {
        if (el.hasAttribute(BOX_ATTR))
          continue;
        el.setAttribute(BOX_ATTR, `${stampPrefix}${s}-${b}`);
        el.setAttribute(BOX_PART_ATTR, isUpper ? 'max' : 'min');
      }
    }

    // DIAGNOSTIC: one-line summary per series so we can verify which
    // per-part stamps succeeded without browser DevTools. Remove once
    // box highlighting is confirmed working end-to-end.
    const stampedIq = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="iq"]`,
    ).length;
    const stampedQ2 = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="q2"]`,
    ).length;
    const stampedMin = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="min"]`,
    ).length;
    const stampedMax = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="max"]`,
    ).length;
    // Using console.warn (not console.log) so the diagnostic surfaces under
    // the repo's no-console ESLint rule. This whole block is temporary.
    console.warn(
      `[maidr/anychart] stampBoxAttributes series ${s}: ${boxCount} boxes, `
      + `stamped ${stampedIq} iq / ${stampedQ2} q2 / `
      + `${stampedMin} min / ${stampedMax} max`,
    );

    // Per-box detail: report any box missing one or more parts so we can
    // pinpoint failures from a single console line. Temporary diagnostic.
    for (let b = 0; b < boxCount; b++) {
      const base = `[${BOX_ATTR}="${stampPrefix}${s}-${b}"]`;
      const missing: string[] = [];
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="iq"]`))
        missing.push('iq');
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="q2"]`))
        missing.push('q2');
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="min"]`))
        missing.push('min');
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="max"]`))
        missing.push('max');
      if (missing.length > 0) {
        console.warn(
          `[maidr/anychart]   Box ${s}-${b} missing: ${missing.join(', ')}`,
        );
      }
    }
  }
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
// Heatmap attribute stamping
// ---------------------------------------------------------------------------

/**
 * Locate the SVG `<g>` layer containing heatmap cells using AnyChart's
 * stable auto-id conventions.
 *
 * AnyChart's GraphicsJS renderer assigns deterministic IDs to every
 * element: shape elements get `id="ac_rect_<chartId>_<n>"` (regardless of
 * whether they render as `<rect>` or `<path>`), and each visual layer is
 * wrapped in `<g id="ac_layer_<chartId>_<n>">`. Heatmap cells all share a
 * single cell layer, while plot backgrounds, axes, legends, and the
 * AnyChart watermark live in separate layers.
 *
 * We scan every `ac_layer_*` group and pick the one with the most direct
 * descendants matching `ac_rect_*`. This sidesteps bbox-based heuristics
 * (which broke when cell sizes varied sub-pixel) and eliminates leakage
 * from non-cell elements like the plot-area background.
 *
 * Returns the parent SVG itself if no AnyChart layer structure is found,
 * so the caller falls back to whole-SVG querying.
 */
function findHeatmapCellLayer(svg: SVGElement): Element {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    // AnyChart applies `clip-path` to series-data layers; chart-level
    // furniture (axes, grid, background) is unclipped. Restricting to
    // clipped layers is harmless for heatmaps (the `ac_rect_*` prefix is
    // already specific) and keeps the layer-selection rule consistent with
    // candlestick / future trace types.
    if (!layer.hasAttribute('clip-path'))
      continue;
    const cells = layer.querySelectorAll(
      'path[id^="ac_rect_"], rect[id^="ac_rect_"]',
    );
    if (cells.length > bestCount) {
      bestCount = cells.length;
      bestLayer = layer;
    }
  }
  return bestLayer ?? svg;
}

/**
 * Stamp `data-maidr-anychart-heatmap-cell="<row>-<col>"` on every heatmap
 * cell's SVG element.
 *
 * Cells are identified via AnyChart's stable auto-id conventions:
 * `ac_layer_*` groups scoped to the layer with the most `ac_rect_*` shapes
 * (see {@link findHeatmapCellLayer}). DOM order within the layer is
 * row-major (top→bottom, then left→right), matching the
 * `HeatmapData { x, y, points }` layout produced by
 * {@link buildHeatmapLayerFromChart}.
 *
 * Only runs for charts whose `getType()` returns a string containing
 * `'heat'`; on other chart types this is a no-op.
 */
function stampHeatmapAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  let chartType: string | undefined;
  try {
    chartType = chart.getType?.();
  } catch {
    chartType = undefined;
  }
  // AnyChart's heatmap `getType()` returns `"heat-map"` in production builds
  // (with a hyphen), while older / minified builds have been observed
  // returning `"heatmap"` or `"heat"`. Use a substring match so the adapter
  // tolerates all current and future variants without an explicit allowlist.
  // No other AnyChart chart type name contains "heat", so false positives
  // are not a concern.
  if (!chartType || !chartType.includes('heat')) {
    return;
  }

  const dataView = chart.data?.();
  if (!dataView)
    return;
  let iterator: AnyChartIterator | null = null;
  try {
    iterator = dataView.getIterator();
  } catch {
    iterator = null;
  }
  if (!iterator)
    return;

  // Count cells + collect distinct x/y labels in insertion order so we know
  // the expected grid dimensions and can map flat DOM order to (row,col).
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();
  let cellCount = 0;
  iterator.reset();
  while (iterator.advance()) {
    cellCount++;
    const x = asString(iterator.get('x'));
    const y = asString(iterator.get('y') ?? iterator.get('name'));
    if (!xSet.has(x)) {
      xLabels.push(x);
      xSet.add(x);
    }
    if (!ySet.has(y)) {
      yLabels.push(y);
      ySet.add(y);
    }
  }
  if (cellCount === 0)
    return;

  const cols = xLabels.length;
  const rows = yLabels.length;

  // Locate the heatmap cell layer via AnyChart's stable id conventions,
  // then collect shape elements directly from that layer. This is the
  // AnyChart-native equivalent of asking "give me only the cells",
  // sidestepping bbox heuristics (which broke when cell sizes varied
  // sub-pixel) and eliminating cross-layer leakage from plot backgrounds,
  // axes, legend swatches, and the AnyChart watermark.
  const cellLayer = findHeatmapCellLayer(svg);
  const shapes = cellLayer.querySelectorAll<SVGElement>(
    'path[id^="ac_rect_"], rect[id^="ac_rect_"]',
  );

  const cellCandidates: SVGElement[] = [];
  for (const el of Array.from(shapes)) {
    // Idempotency — skip cells stamped on a prior bind.
    if (el.hasAttribute(HEATMAP_ATTR))
      continue;
    // Exclude AnyChart's hover/selection indicator overlay. When a cell is
    // hovered, AnyChart renders an extra <path> with `fill="#333"` and
    // `fill-opacity="0.85"` on top of the data cell. Data cells never set
    // `fill-opacity`, so a value below 1 unambiguously identifies the
    // overlay.
    const fillOpacityAttr = el.getAttribute('fill-opacity');
    if (fillOpacityAttr !== null && Number.parseFloat(fillOpacityAttr) < 1)
      continue;
    // Defensive: skip explicitly transparent fills.
    const fillAttr = el.getAttribute('fill');
    if (fillAttr === 'none' || fillAttr === 'transparent')
      continue;
    cellCandidates.push(el);
  }

  // Layer + id-prefix scoping should yield exactly rows*cols cells. Any
  // mismatch indicates either an unexpected AnyChart DOM layout (perhaps a
  // future version that changes the auto-id convention) or a chart that
  // hasn't fully rendered yet. We continue best-effort by stamping as many
  // cells as we have candidates for.
  const stampCount = Math.min(cellCandidates.length, rows * cols);
  for (let i = 0; i < stampCount; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const el = cellCandidates[i];
    if (!el.hasAttribute(HEATMAP_ATTR))
      el.setAttribute(HEATMAP_ATTR, `${stampPrefix}${r}-${c}`);
  }
}

// ---------------------------------------------------------------------------
// Candlestick attribute stamping
// ---------------------------------------------------------------------------

/**
 * Locate the SVG `<g>` layer containing candlestick paths using AnyChart's
 * stable auto-id conventions.
 *
 * AnyChart renders each candlestick (wick + body combined) as a single
 * `<path id="ac_path_<chartId>_<n>">` inside a layer wrapped in
 * `<g id="ac_layer_<chartId>_<n>">`. Other chart types (line, area) also
 * use `ac_path_*`, but they live in different layers, so picking the
 * layer with the most `ac_path_*` descendants reliably isolates the
 * candlestick layer for single-series candlestick charts and the
 * candlestick portion of mixed charts.
 *
 * Returns the parent SVG itself if no AnyChart layer structure is found,
 * so the caller falls back to whole-SVG querying.
 */
function findCandlestickPathLayer(svg: SVGElement): Element {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    // AnyChart applies `clip-path` to series-data layers so rendering is
    // bounded to the plot area. Chart-level layers (axes, grid, background)
    // are unclipped because they draw outside the plot area too (axis
    // labels, ticks, title space). Using clip-path presence avoids picking
    // the axes/background layer, whose `ac_path_*` children (background
    // rect + tick + gridline paths) can outnumber the actual candles.
    if (!layer.hasAttribute('clip-path'))
      continue;
    const paths = layer.querySelectorAll('path[id^="ac_path_"]');
    if (paths.length > bestCount) {
      bestCount = paths.length;
      bestLayer = layer;
    }
  }
  return bestLayer ?? svg;
}

/**
 * Stamp `data-maidr-anychart-candlestick-cell="<seriesIndex>-<pointIndex>"`
 * on every AnyChart candlestick `<path>` element.
 *
 * Only runs if at least one series has `seriesType() === 'candlestick'`.
 * Candle paths are identified via AnyChart's stable `id^="ac_path_"`
 * convention within the layer returned by
 * {@link findCandlestickPathLayer}. DOM order within the layer matches
 * the data iterator order (chronological left-to-right), so we stamp
 * sequentially.
 *
 * For multi-series candlestick charts, paths are partitioned by series
 * offset (series 0 takes the first N₀ paths, series 1 the next N₁, etc.).
 * If a multi-series chart highlights incorrectly, the consumer can
 * override per-series selectors via the `selectors` option.
 *
 * On non-candlestick charts this is a no-op.
 */
function stampCandlestickAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount?.() ?? 0;
  if (seriesCount === 0)
    return;

  const candlestickSeriesIndices: number[] = [];
  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    try {
      if (series.seriesType() === 'candlestick')
        candlestickSeriesIndices.push(s);
    } catch {
      // ignore series that don't expose seriesType()
    }
  }
  if (candlestickSeriesIndices.length === 0)
    return;

  const candleLayer = findCandlestickPathLayer(svg);
  const paths = candleLayer.querySelectorAll<SVGElement>(
    'path[id^="ac_path_"]',
  );

  const pathCandidates: SVGElement[] = [];
  for (const path of Array.from(paths)) {
    // Idempotency — skip paths stamped on a prior bind.
    if (path.hasAttribute(CANDLESTICK_ATTR))
      continue;
    // Defensive — skip paths with no visible stroke or fill.
    const fill = path.getAttribute('fill');
    const stroke = path.getAttribute('stroke');
    const fillBlank = fill === null || fill === 'none' || fill === 'transparent';
    const strokeBlank = stroke === null || stroke === 'none' || stroke === 'transparent';
    if (fillBlank && strokeBlank)
      continue;
    // Skip hover/selection overlays (AnyChart renders semi-transparent
    // indicator paths inside the series layer; same pattern as heatmap).
    const fillOpacityAttr = path.getAttribute('fill-opacity');
    if (fillOpacityAttr !== null && Number.parseFloat(fillOpacityAttr) < 1)
      continue;
    // Skip degenerate sentinel paths (e.g., clip-path boundary "M 0,0").
    // Real candle paths always combine wick + body, so the `d` attribute
    // contains multiple drawing commands. Single-command paths are not
    // candles.
    const d = path.getAttribute('d');
    if (!d)
      continue;
    const commandCount = (d.match(/[MLHVCSQTAZ]/gi) ?? []).length;
    if (commandCount <= 1)
      continue;
    pathCandidates.push(path);
  }

  // Partition the path candidates by series offset. Assumes AnyChart
  // renders candlestick series in series-index order within the layer
  // (verified for single-series charts; multi-series may require
  // disambiguation if reported).
  let cursor = 0;
  for (const s of candlestickSeriesIndices) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    const rows = extractRawRows(series);
    for (let i = 0; i < rows.length && cursor < pathCandidates.length; i++, cursor++) {
      pathCandidates[cursor].setAttribute(CANDLESTICK_ATTR, `${stampPrefix}${s}-${i}`);
    }
  }
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

/**
 * Build a BOX layer from an AnyChart box series.
 *
 * @remarks
 * AnyChart exposes quartile data (lowest, q1, median, q3, highest) through
 * its iterator, but does not provide direct access to outlier arrays via the
 * standard data iterator API.  As a result, `lowerOutliers` and
 * `upperOutliers` are always empty.  If your chart contains outliers and you
 * need them in the accessible representation, supply them manually by
 * post-processing the {@link Maidr} object returned from
 * {@link anyChartToMaidr}.
 */
function buildBoxLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: BoxPoint[] = rows.map(r => ({
    z: asString(r.x ?? r.name ?? r._index),
    // Outlier arrays are not available through AnyChart's iterator API.
    lowerOutliers: [],
    min: asNumber(r.lowest),
    q1: asNumber(r.q1),
    q2: asNumber(r.median),
    q3: asNumber(r.q3),
    max: asNumber(r.highest),
    upperOutliers: [],
  }));

  // When the caller did not supply selectors, build a `BoxSelector[]` whose
  // entries reference the per-box, per-part attributes that
  // {@link stampBoxAttributes} writes on the rendered SVG. MAIDR's
  // `BoxTrace.mapToSvgElements` bails to `null` (no highlight) unless
  // `selectors.length === points.length`, so we always emit exactly one
  // entry per box. `q1` and `q3` are intentionally omitted — MAIDR derives
  // them from the `iq` element's top/bottom edges via
  // `Svg.createLineElement(iq, 'top'|'bottom')`. Outlier arrays are empty
  // because AnyChart's iterator API does not expose outliers.
  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  const stampedBoxSelectors: BoxSelector[] = data.map((_, b) => {
    const base = `${scope}[${BOX_ATTR}="${stamp}${seriesIndex}-${b}"]`;
    return {
      lowerOutliers: [],
      min: `${base}[${BOX_PART_ATTR}="min"]`,
      iq: `${base}[${BOX_PART_ATTR}="iq"]`,
      q2: `${base}[${BOX_PART_ATTR}="q2"]`,
      max: `${base}[${BOX_PART_ATTR}="max"]`,
      upperOutliers: [],
    };
  });

  return {
    id: String(seriesIndex),
    type: TraceType.BOX,
    selectors: selectors ?? stampedBoxSelectors,
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
      points[yi][xi] = asNumber(r.heat ?? r.value ?? r.fill);
  }

  const data: HeatmapData = { x: xLabels, y: yLabels, points };
  return {
    id: String(seriesIndex),
    type: TraceType.HEATMAP,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * Build a heatmap layer from a chart instance directly (no series).
 *
 * AnyChart's heatMap() chart type is a single-dataset chart that does NOT
 * expose `getSeriesCount()` / `getSeriesAt()`. Its data is accessed via the
 * top-level `chart.data().getIterator()` walk where each row carries
 * `{ x, y, heat }`.
 *
 * This function builds the same `HeatmapData { x, y, points }` shape that
 * {@link buildHeatmapLayer} produces, but sources its rows from the chart's
 * own iterator rather than from a series.
 *
 * The returned layer's `selectors` field defaults to the stamped attribute
 * selector ({@link HEATMAP_ATTR}); pass an explicit override via the
 * `selectors` arg to opt out.
 */
function buildHeatmapLayerFromChart(
  chart: AnyChartInstance,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer | null {
  const dataView = chart.data?.();
  if (!dataView)
    return null;
  let iterator: AnyChartIterator | null = null;
  try {
    iterator = dataView.getIterator();
  } catch {
    iterator = null;
  }
  if (!iterator)
    return null;

  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();
  const rows: Array<{ x: string; y: string; v: number }> = [];

  iterator.reset();
  while (iterator.advance()) {
    const xRaw = iterator.get('x');
    const yRaw = iterator.get('y') ?? iterator.get('name');
    const heatRaw = iterator.get('heat') ?? iterator.get('value') ?? iterator.get('fill');
    const x = asString(xRaw);
    const y = asString(yRaw);
    const v = asNumber(heatRaw);
    if (!xSet.has(x)) {
      xLabels.push(x);
      xSet.add(x);
    }
    if (!ySet.has(y)) {
      yLabels.push(y);
      ySet.add(y);
    }
    rows.push({ x, y, v });
  }

  if (xLabels.length === 0 || yLabels.length === 0)
    return null;

  const points: number[][] = Array.from(
    { length: yLabels.length },
    () => Array.from<number>({ length: xLabels.length }).fill(0),
  );
  for (const r of rows) {
    const xi = xLabels.indexOf(r.x);
    const yi = yLabels.indexOf(r.y);
    if (xi >= 0 && yi >= 0)
      points[yi][xi] = r.v;
  }

  const data: HeatmapData = { x: xLabels, y: yLabels, points };
  const defaultSelector = `${panelScope(panel)}[${HEATMAP_ATTR}]`;
  return {
    id: '0',
    type: TraceType.HEATMAP,
    selectors: selectors ?? defaultSelector,
    data,
    // `stampHeatmapAttributes` walks the chart's cells in row-major order
    // (`r * cols + c`). `Heatmap.mapToSvgElements` defaults to a
    // column-major mapping for <rect> cells unless told otherwise — that
    // mismatch would either transpose the highlight grid or fail the
    // `domElements.length === rows * cols` invariant. Mirror the D3
    // heatmap binder's `domMapping: { order: 'row' }` hint so the model
    // groups the stamped cells the way they were laid out.
    //
    // NOTE: AnyChart's production GraphicsJS renderer emits heatmap cells
    // as <path> elements, not <rect>. The path branch of
    // `Heatmap.mapToSvgElements` unconditionally uses row-major with
    // row-reversal and ignores `domMapping.order` entirely — so this hint
    // is a no-op for current AnyChart heatmaps. It is retained as
    // defensive coverage for any alternative AnyChart build (or future
    // renderer change) that emits <rect> cells instead.
    domMapping: { order: 'row' },
  };
}

function buildCandlestickLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
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
  // Default selector targets the attribute stamped by
  // {@link stampCandlestickAttributes}, scoped to this series index. The
  // candlestick model duplicates the matched element across all OHLC
  // segments, so a single attribute per candle is sufficient.
  const defaultSelector
    = `${panelScope(panel)}[${CANDLESTICK_ATTR}^="${panelStampPrefix(panel)}${seriesIndex}-"]`;
  return {
    id: String(seriesIndex),
    type: TraceType.CANDLESTICK,
    selectors: selectors ?? defaultSelector,
    data,
  };
}

// ---------------------------------------------------------------------------
// Layer builder dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch to the per-type layer builder. The `traceType` union is limited
 * to what {@link mapSeriesType} can return, so the switch is exhaustive and
 * needs no `default` — adding a new AnyChart trace type is a compile error
 * until a matching case is added here.
 */
function buildLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  traceType: AnyChartTraceType,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  switch (traceType) {
    case TraceType.BAR:
      return buildBarLayer(series, seriesIndex, selectors);
    case TraceType.LINE:
      return buildLineLayer(series, seriesIndex, selectors);
    case TraceType.SCATTER:
      return buildScatterLayer(series, seriesIndex, selectors);
    case TraceType.BOX:
      return buildBoxLayer(series, seriesIndex, selectors, panel);
    case TraceType.HEATMAP:
      return buildHeatmapLayer(series, seriesIndex, selectors);
    case TraceType.CANDLESTICK:
      return buildCandlestickLayer(series, seriesIndex, selectors, panel);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build one {@link MaidrSubplot} from a single AnyChart chart instance.
 *
 * This is the per-chart body shared by {@link anyChartToMaidr} (single
 * panel, `panel === undefined`) and {@link anyChartsToMaidr} (one call per
 * grid cell). Axis titles are extracted per chart, with `options.axes`
 * acting as an override. In panel mode:
 *
 * - every default selector is scoped to the panel's SVG via
 *   {@link PANEL_ATTR} and the token-prefixed stamp values,
 * - layer ids are prefixed `<row>_<col>_` so they stay unique across the
 *   whole figure,
 * - the chart's own title is placed on the FIRST layer, which is what the
 *   core uses as the panel's display name in subplot summaries,
 * - `subplot.selector` points at the panel's SVG root so the core can
 *   resolve the panel container.
 *
 * @returns The subplot, or `null` when the chart has no convertible series.
 */
function buildSubplot(
  chart: AnyChartInstance,
  panel: PanelContext | undefined,
  options?: AnyChartBinderOptions,
): MaidrSubplot | null {
  const xAxisLabel = options?.axes?.x ?? extractAxisTitle(chart, 'x');
  const yAxisLabel = options?.axes?.y ?? extractAxisTitle(chart, 'y');

  const attachAxes = (layer: MaidrLayer): void => {
    if (xAxisLabel || yAxisLabel) {
      layer.axes = {
        ...(xAxisLabel ? { x: { label: xAxisLabel } } : {}),
        ...(yAxisLabel ? { y: { label: yAxisLabel } } : {}),
      };
    }
  };

  const finalize = (layers: MaidrLayer[]): MaidrSubplot => {
    if (panel) {
      for (const layer of layers) {
        // Layer ids must be unique across the WHOLE figure, not just within
        // one panel; prefix with the grid position (vegalite convention).
        layer.id = `${panel.row}_${panel.col}_${layer.id}`;
      }
      // The first layer's title is the panel's display name in the core's
      // subplot summaries (there is no subplot-level title field).
      const panelTitle = extractTitle(chart);
      if (layers.length > 0 && panelTitle && !layers[0].title)
        layers[0].title = panelTitle;
      return {
        layers,
        selector: `svg[${PANEL_ATTR}="${panel.token}"]`,
      };
    }
    return { layers };
  };

  // Heatmap is a single-dataset chart and does NOT expose
  // getSeriesCount()/getSeriesAt(). Detect it first and route to the
  // chart-level builder before touching the series API (which would throw
  // `e.getSeriesCount is not a function`).
  let chartType: string | undefined;
  try {
    chartType = chart.getType?.();
  } catch {
    chartType = undefined;
  }
  // Production AnyChart builds return `'heat-map'` from getType(); dev builds
  // may return `'heatmap'` / `'heat'`. Match by substring (as
  // stampHeatmapAttributes does) so all three route to the heatmap builder
  // rather than falling through to the series API (which heatmaps do not
  // implement).
  if (chartType?.includes('heat')) {
    const userHeatmapSelector = (options?.selectors?.[0] ?? undefined) as
      | string
      | string[]
      | undefined;
    const layer = buildHeatmapLayerFromChart(chart, userHeatmapSelector, panel);
    if (!layer)
      return null;
    attachAxes(layer);
    return finalize([layer]);
  }

  // Defensive fallback: if getType is unavailable but getSeriesCount throws
  // (heatmap-like single-dataset chart), route to the heatmap path anyway.
  let seriesCount = 0;
  try {
    seriesCount = chart.getSeriesCount();
  } catch {
    const userHeatmapSelector = (options?.selectors?.[0] ?? undefined) as
      | string
      | string[]
      | undefined;
    const layer = buildHeatmapLayerFromChart(chart, userHeatmapSelector, panel);
    if (!layer)
      return null;
    // Attach axis labels just like the primary heatmap path above, so
    // production heatmaps that reach this fallback (getType() unavailable)
    // still expose their axis titles.
    attachAxes(layer);
    return finalize([layer]);
  }
  if (seriesCount === 0)
    return null;

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

    const selectors = resolveSelector(i, traceType, options, panel);
    const layer = buildLayer(series, i, traceType, selectors, panel);

    // Attach axis labels.
    attachAxes(layer);

    layers.push(layer);
  }

  if (layers.length === 0)
    return null;

  return finalize(layers);
}

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
  // Resolve chart metadata.
  const container = resolveContainerElement(chart);
  const id = options?.id ?? container?.id ?? 'anychart-maidr';
  const title = options?.title ?? extractTitle(chart);

  const subplot = buildSubplot(chart, undefined, options);
  if (!subplot)
    return null;

  return {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

/** Elements that have already been bound via {@link bindAnyChart}. */
const boundElements = new WeakSet<Element>();

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
 * Calling this function multiple times on the same chart is safe: if the
 * container has already been bound, the existing {@link Maidr} data is
 * returned without re-dispatching the initialisation event.
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

  // Enable markers on line-like series so per-point highlight attributes
  // have DOM elements to attach to. If any series was mutated, force a
  // synchronous re-draw so the new marker DOM exists by the time
  // `whenChartRendered` finds the SVG below. This is safer than waiting for
  // a second `stagerendered` event, which AnyChart may or may not fire
  // depending on the render mode in use.
  // Belt-and-suspenders: even though `enableLineMarkersIfNeeded` now exits
  // early for heatmaps, an unexpected chart type that lacks `getSeriesCount`
  // should never crash the entire bind flow. Treat any failure as
  // "no markers mutated" and continue.
  let markersMutated = false;
  try {
    markersMutated = enableLineMarkersIfNeeded(chart);
  } catch (err) {
    console.warn(
      '[maidr/anychart] enableLineMarkersIfNeeded failed; continuing without marker mutation:',
      err,
    );
  }
  if (markersMutated) {
    try {
      (chart as unknown as { draw?: () => void }).draw?.();
    } catch (err) {
      console.warn(
        '[maidr/anychart] Failed to force re-draw after enabling markers:',
        err,
      );
    }
  }

  // MAIDR's `maidr:bindchart` listener in `src/index.tsx` filters its target
  // with `instanceof HTMLElement`, which excludes `SVGElement`. Wrap the SVG
  // in a host `<div>` so the listener accepts it. The host carries explicit
  // pixel dimensions captured from the original container so the SVG keeps
  // its size once MAIDR re-parents it into the focusable
  // `<div tabIndex=0 role="img" style="width: fit-content">` wrapper.
  //
  // The bindchart dispatch below is unconditional: line-marker stamping is
  // best-effort, but the chart must always become focusable so audio /
  // text / braille modalities work even when highlight cannot.
  whenChartRendered(chart, container, (svg) => {
    try {
      stampBarAttributes(chart, svg);
    } catch (err) {
      console.warn('[maidr/anychart] Failed to stamp bar attributes:', err);
    }
    try {
      stampLineAttributes(chart, svg);
    } catch (err) {
      console.warn('[maidr/anychart] Failed to stamp line attributes:', err);
    }
    try {
      stampScatterAttributes(chart, svg);
    } catch (err) {
      console.warn('[maidr/anychart] Failed to stamp scatter attributes:', err);
    }
    try {
      stampBoxAttributes(chart, svg);
    } catch (err) {
      console.warn('[maidr/anychart] Failed to stamp box attributes:', err);
    }
    try {
      stampHeatmapAttributes(chart, svg);
    } catch (err) {
      console.warn('[maidr/anychart] Failed to stamp heatmap attributes:', err);
    }
    try {
      stampCandlestickAttributes(chart, svg);
    } catch (err) {
      console.warn('[maidr/anychart] Failed to stamp candlestick attributes:', err);
    }

    const host = ensureHostWrapper(svg, container);
    if (boundElements.has(host))
      return;
    boundElements.add(host);
    host.setAttribute('maidr-data', JSON.stringify(maidr));

    host.dispatchEvent(
      new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }),
    );
  });

  return maidr;
}

// ---------------------------------------------------------------------------
// Multi-panel public API
// ---------------------------------------------------------------------------

/**
 * Distance (in CSS pixels) two containers' tops may differ while still being
 * clustered into the same visual row by `layout: 'auto'`.
 */
const AUTO_ROW_TOLERANCE_PX = 10;

/** One chart entry with its on-page position, used by the auto layout. */
interface AutoLayoutEntry {
  chart: AnyChartInstance;
  top: number;
  left: number;
}

/**
 * Derive a 2D grid from each chart container's on-page position: cluster
 * containers into rows by bounding-rect top (within
 * {@link AUTO_ROW_TOLERANCE_PX}), then sort each row left-to-right. The
 * result is in visual reading order (top-left panel first), which is the
 * order the MAIDR core expects.
 */
function autoLayoutGrid(charts: AnyChartInstance[]): AnyChartInstance[][] | null {
  const entries: AutoLayoutEntry[] = [];
  for (const chart of charts) {
    const container = resolveContainerElement(chart);
    if (!container) {
      console.warn(
        '[maidr/anychart] layout: "auto" requires every chart to have a '
        + 'resolvable, attached container. Draw all charts before binding, '
        + 'or pass an explicit 2D grid / { rows, columns } layout.',
      );
      return null;
    }
    const rect = container.getBoundingClientRect();
    entries.push({ chart, top: rect.top, left: rect.left });
  }

  entries.sort((a, b) => (a.top - b.top) || (a.left - b.left));

  const rows: Array<{ top: number; entries: AutoLayoutEntry[] }> = [];
  for (const entry of entries) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(entry.top - current.top) <= AUTO_ROW_TOLERANCE_PX)
      current.entries.push(entry);
    else
      rows.push({ top: entry.top, entries: [entry] });
  }

  return rows.map(row =>
    row.entries.sort((a, b) => a.left - b.left).map(e => e.chart),
  );
}

/**
 * Normalize the {@link AnyChartGridInput} into a validated 2D grid.
 *
 * - An explicit 2D array is used as-is (row-major, visual reading order);
 *   empty rows and missing entries are rejected because they crash the MAIDR
 *   core's Figure model.
 * - A flat array is chunked row-major according to `layout`, arranged by
 *   container position (`'auto'`), or kept as a single row when no layout is
 *   given.
 *
 * @returns The grid, or `null` (with a console warning) on invalid input.
 */
function normalizeChartGrid(
  charts: AnyChartGridInput,
  layout: AnyChartsBinderOptions['layout'],
): AnyChartInstance[][] | null {
  if (!Array.isArray(charts) || charts.length === 0) {
    console.warn(
      '[maidr/anychart] Expected a non-empty array of AnyChart instances.',
    );
    return null;
  }

  const mixed = charts as Array<AnyChartInstance | AnyChartInstance[]>;
  const rowCount = mixed.filter(entry => Array.isArray(entry)).length;

  // Explicit 2D grid → subplots 1:1.
  if (rowCount > 0) {
    if (rowCount !== mixed.length) {
      console.warn(
        '[maidr/anychart] Chart grid mixes rows (arrays) and bare chart '
        + 'instances. Pass either a flat array or a full 2D array.',
      );
      return null;
    }
    const grid = charts as AnyChartInstance[][];
    for (const row of grid) {
      if (row.length === 0) {
        console.warn(
          '[maidr/anychart] Chart grid contains an empty row. Empty rows '
          + 'are not allowed (the MAIDR figure model cannot represent them).',
        );
        return null;
      }
      if (row.some(chart => !chart)) {
        console.warn('[maidr/anychart] Chart grid contains a missing chart entry.');
        return null;
      }
    }
    return grid;
  }

  const flat = charts as AnyChartInstance[];
  if (flat.some(chart => !chart)) {
    console.warn('[maidr/anychart] Chart array contains a missing chart entry.');
    return null;
  }

  if (layout === 'auto')
    return autoLayoutGrid(flat);

  const total = flat.length;
  const columns
    = layout?.columns
      ?? (layout?.rows ? Math.ceil(total / layout.rows) : total);
  if (!Number.isInteger(columns) || columns < 1) {
    console.warn(
      '[maidr/anychart] Invalid layout: `columns` (or `ceil(total / rows)`) '
      + 'must be a positive integer.',
    );
    return null;
  }

  const grid: AnyChartInstance[][] = [];
  for (let i = 0; i < total; i += columns)
    grid.push(flat.slice(i, i + columns));
  return grid;
}

/** One panel's chart + token, produced by {@link buildMaidrFromGrid}. */
interface PanelBinding {
  chart: AnyChartInstance;
  token: string;
}

/**
 * Build a multi-panel {@link Maidr} figure from a validated chart grid.
 *
 * Panels whose chart yields no convertible series are dropped (with a
 * warning) rather than emitted as empty subplots, because a subplot with
 * `layers: []` crashes the MAIDR core. Rows that end up empty are dropped
 * entirely. Panel tokens are always derived from the ORIGINAL grid position
 * so selector emission and DOM stamping stay in agreement even when panels
 * are dropped.
 */
function buildMaidrFromGrid(
  grid: AnyChartInstance[][],
  options?: AnyChartsBinderOptions,
): { maidr: Maidr | null; panels: PanelBinding[] } {
  const id = options?.id ?? nextId('anychart-maidr');
  const tokenBase = sanitizePanelToken(id);
  const subplotOptions: AnyChartBinderOptions | undefined
    = options?.axes ? { axes: options.axes } : undefined;

  const panels: PanelBinding[] = [];
  const subplots: MaidrSubplot[][] = [];

  grid.forEach((row, r) => {
    const subplotRow: MaidrSubplot[] = [];
    row.forEach((chart, c) => {
      const token = `${tokenBase}-${r}-${c}`;
      const subplot = buildSubplot(chart, { token, row: r, col: c }, subplotOptions);
      if (!subplot) {
        console.warn(
          `[maidr/anychart] Panel (${r}, ${c}) has no convertible series; `
          + 'dropping it from the figure.',
        );
        return;
      }
      panels.push({ chart, token });
      subplotRow.push(subplot);
    });
    if (subplotRow.length > 0)
      subplots.push(subplotRow);
  });

  if (subplots.length === 0) {
    console.warn('[maidr/anychart] No chart in the grid produced convertible data.');
    return { maidr: null, panels: [] };
  }

  const maidr: Maidr = {
    id,
    ...(options?.title ? { title: options.title } : {}),
    subplots,
  };
  return { maidr, panels };
}

/**
 * Convert a group of AnyChart chart instances into ONE multi-panel MAIDR
 * figure (a 2D subplot grid navigable with arrow keys + Enter).
 *
 * AnyChart has no native facet/small-multiples concept — the idiom is one
 * chart instance per container — so the grouping here is explicit:
 *
 * - `charts` as a 2D array maps 1:1 onto the subplot grid, row-major in
 *   visual reading order (top-left panel first).
 * - `charts` as a flat array is arranged according to `options.layout`
 *   (`{ rows?, columns? }` chunked row-major, `'auto'` derived from the
 *   containers' on-page positions, or a single row when omitted).
 *
 * Each panel's display name is its own chart title; `options.title` names
 * the whole figure and `options.axes` overrides every panel's axis labels.
 *
 * Prefer {@link bindAnyCharts}, which also stamps the per-panel highlight
 * attributes this function's selectors refer to. Use this directly only for
 * inspection or custom mounting flows. Pass a stable `options.id` if you
 * need deterministic output across calls (the default id is generated).
 *
 * @param charts - Drawn AnyChart instances, each in its own container.
 * @param options - Figure-level overrides and flat-array layout.
 * @returns The MAIDR data object, or `null` if nothing was convertible.
 */
export function anyChartsToMaidr(
  charts: AnyChartGridInput,
  options?: AnyChartsBinderOptions,
): Maidr | null {
  const grid = normalizeChartGrid(charts, options?.layout);
  if (!grid)
    return null;
  return buildMaidrFromGrid(grid, options).maidr;
}

/**
 * Stamp one panel's SVG with the panel token and all per-point highlight
 * attributes (token-prefixed so they are unique page-wide). Each stamp
 * family is best-effort: a failure in one must not block the others or the
 * bind itself.
 */
function stampPanelAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  token: string,
): void {
  if (!svg.hasAttribute(PANEL_ATTR))
    svg.setAttribute(PANEL_ATTR, token);

  const prefix = `${token}:`;
  try {
    stampBarAttributes(chart, svg, prefix);
  } catch (err) {
    console.warn('[maidr/anychart] Failed to stamp bar attributes:', err);
  }
  try {
    stampLineAttributes(chart, svg, prefix);
  } catch (err) {
    console.warn('[maidr/anychart] Failed to stamp line attributes:', err);
  }
  try {
    stampScatterAttributes(chart, svg, prefix);
  } catch (err) {
    console.warn('[maidr/anychart] Failed to stamp scatter attributes:', err);
  }
  try {
    stampBoxAttributes(chart, svg, prefix);
  } catch (err) {
    console.warn('[maidr/anychart] Failed to stamp box attributes:', err);
  }
  try {
    stampHeatmapAttributes(chart, svg, prefix);
  } catch (err) {
    console.warn('[maidr/anychart] Failed to stamp heatmap attributes:', err);
  }
  try {
    stampCandlestickAttributes(chart, svg, prefix);
  } catch (err) {
    console.warn('[maidr/anychart] Failed to stamp candlestick attributes:', err);
  }
}

/**
 * Bind a group of AnyChart charts to MAIDR as ONE multi-panel figure.
 *
 * This is the multi-panel counterpart of {@link bindAnyChart}. It accepts
 * the same chart-grid input as {@link anyChartsToMaidr}, then:
 *
 * 1. builds the combined {@link Maidr} object (one subplot per chart),
 * 2. stamps `data-maidr-anychart-panel="<token>"` on each chart's own
 *    `<svg>` and token-prefixed highlight attributes on its marks, so every
 *    selector resolves ONLY inside its own panel,
 * 3. wraps the panels' common ancestor in a transparent host `<div>`, sets
 *    the combined `maidr-data` attribute on it, and dispatches a single
 *    `maidr:bindchart` event once every panel's SVG has rendered.
 *
 * Requirements: every chart must be drawn into its OWN container element
 * (the standard AnyChart idiom), and all panel containers should live under
 * a common wrapper element — the host wraps that wrapper (or groups
 * same-parent siblings) so MAIDR mounts once for the whole figure.
 * Shared-Stage dashboards (multiple charts on one Stage/container) are not
 * supported.
 *
 * Calling this again for the same group is safe: the existing binding is
 * reused and the current {@link Maidr} object is returned.
 *
 * @param charts - Drawn AnyChart instances, each in its own container.
 * @param options - Figure-level overrides and flat-array layout.
 * @returns The generated {@link Maidr} object, or `null` on failure.
 *
 * @example
 * ```ts
 * const q1 = anychart.column([['A', 4], ['B', 2]]);
 * q1.title('Q1'); q1.container('panel-1').draw();
 * const q2 = anychart.column([['A', 6], ['B', 3]]);
 * q2.title('Q2'); q2.container('panel-2').draw();
 *
 * bindAnyCharts([[q1, q2]], { id: 'sales', title: 'Sales by Quarter' });
 * ```
 */
export function bindAnyCharts(
  charts: AnyChartGridInput,
  options?: AnyChartsBinderOptions,
): Maidr | null {
  const grid = normalizeChartGrid(charts, options?.layout);
  if (!grid)
    return null;

  // Every panel needs its own resolvable container before anything else.
  const flatCharts = grid.flat();
  const containers: HTMLElement[] = [];
  for (const chart of flatCharts) {
    const container = resolveContainerElement(chart);
    if (!container) {
      console.warn(
        '[maidr/anychart] Could not find a container element for one of the '
        + 'charts. Make sure every chart has been drawn before calling '
        + 'bindAnyCharts().',
      );
      return null;
    }
    containers.push(container);
  }
  if (new Set(containers).size !== containers.length) {
    console.warn(
      '[maidr/anychart] bindAnyCharts requires each chart to live in its own '
      + 'container element. Shared-Stage dashboards (multiple charts drawn '
      + 'on one Stage) are not supported.',
    );
    return null;
  }

  const { maidr, panels } = buildMaidrFromGrid(grid, options);
  if (!maidr) {
    console.warn('[maidr/anychart] Could not extract data from the AnyChart charts.');
    return null;
  }

  // Enable line markers per chart (same best-effort flow as bindAnyChart).
  for (const chart of flatCharts) {
    let markersMutated = false;
    try {
      markersMutated = enableLineMarkersIfNeeded(chart);
    } catch (err) {
      console.warn(
        '[maidr/anychart] enableLineMarkersIfNeeded failed; continuing without marker mutation:',
        err,
      );
    }
    if (markersMutated) {
      try {
        (chart as unknown as { draw?: () => void }).draw?.();
      } catch (err) {
        console.warn(
          '[maidr/anychart] Failed to force re-draw after enabling markers:',
          err,
        );
      }
    }
  }

  const host = ensureGroupHostWrapper(containers);
  if (!host)
    return null;
  if (boundElements.has(host))
    return maidr;

  const containerByChart = new Map<AnyChartInstance, HTMLElement>(
    flatCharts.map((chart, i) => [chart, containers[i]]),
  );

  // Stamp each panel as its SVG becomes available; bind the whole figure
  // once the LAST panel is stamped so `maidr-data` never references
  // attributes that do not exist yet.
  let pending = panels.length;
  const finalize = (): void => {
    pending -= 1;
    if (pending > 0)
      return;
    if (boundElements.has(host))
      return;
    boundElements.add(host);
    host.setAttribute('maidr-data', JSON.stringify(maidr));
    host.dispatchEvent(
      new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }),
    );
  };

  for (const { chart, token } of panels) {
    const container = containerByChart.get(chart);
    if (!container) {
      // Defensive: cannot happen (panels ⊆ flatCharts), but never stall the bind.
      finalize();
      continue;
    }
    whenChartRendered(chart, container, (svg) => {
      stampPanelAttributes(chart, svg, token);
      finalize();
    });
  }

  return maidr;
}

/**
 * Find the deepest element containing every given element.
 */
function lowestCommonAncestor(elements: HTMLElement[]): HTMLElement | null {
  for (
    let candidate: HTMLElement | null = elements[0];
    candidate;
    candidate = candidate.parentElement
  ) {
    const current = candidate;
    if (elements.every(el => current.contains(el)))
      return current;
  }
  return null;
}

/** Compare two nodes by document order (for stable panel ordering). */
function documentOrder(a: Node, b: Node): number {
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING)
    return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING)
    return 1;
  return 0;
}

/**
 * Ensure ALL panel containers of a multi-panel figure live inside one
 * transparent host `<div>` and return that host.
 *
 * Mirrors {@link ensureHostWrapper} but over a group: the combined
 * `maidr-data` attribute must sit on a single wrapper element containing
 * every panel container, because MAIDR mounts one React root per bound
 * element.
 *
 * Strategy:
 * - If an existing host already contains every panel, reuse it.
 * - If all containers share one parent, insert a `display: contents` host
 *   before the first container (in document order) and move the containers
 *   into it — `display: contents` keeps them participating in the parent's
 *   flex/grid layout exactly as before.
 * - Otherwise wrap the containers' lowest common ancestor, unless that
 *   ancestor is `<body>` / `<html>` (which cannot be reparented) — in that
 *   case the bind fails with guidance to add a wrapper element.
 *
 * The host carries the union bounding box of all panels via the
 * `data-maidr-host-width` / `-height` attributes consumed by
 * `SizedDomNodeAdapter`, keeping MAIDR's focusable wrapper non-zero-sized.
 */
function ensureGroupHostWrapper(containers: HTMLElement[]): HTMLElement | null {
  const existing = containers[0].parentElement?.closest<HTMLElement>(
    '[data-maidr-anychart-host]',
  );
  if (existing && containers.every(c => existing.contains(c)))
    return existing;

  // Union bounding box of all panels for the sized-host data attributes.
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const container of containers) {
    const rect = container.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  const width = right - left > 0 ? right - left : 600;
  const height = bottom - top > 0 ? bottom - top : 400;

  const host = document.createElement('div');
  host.setAttribute('data-maidr-anychart-host', '');
  host.style.display = 'contents';
  host.dataset.maidrHostWidth = String(width);
  host.dataset.maidrHostHeight = String(height);

  const firstParent = containers[0].parentElement;
  const sameParent
    = firstParent !== null
      && containers.every(c => c.parentElement === firstParent);
  if (sameParent) {
    const ordered = [...containers].sort(documentOrder);
    firstParent.insertBefore(host, ordered[0]);
    for (const container of ordered)
      host.appendChild(container);
    return host;
  }

  const lca = lowestCommonAncestor(containers);
  if (
    !lca
    || lca === document.body
    || lca === document.documentElement
    || !lca.parentNode
  ) {
    console.warn(
      '[maidr/anychart] bindAnyCharts could not find a wrappable common '
      + 'ancestor for the panel containers. Place all panel containers '
      + 'inside one wrapper element and try again.',
    );
    return null;
  }
  lca.parentNode.insertBefore(host, lca);
  host.appendChild(lca);
  return host;
}

/**
 * Ensure the user's chart container is wrapped in a transparent host `<div>`
 * and return that host.
 *
 * The host wraps the user's `container` (not just the SVG inside it) so that
 * MAIDR's `<article>` ends up as a sibling of the chart's bounded box at the
 * page level — not nested inside it. This is critical: many AnyChart usages
 * set the container to a fixed `height: 400px`, and if the MAIDR React tree
 * lives inside that 400px box, the text bar below the chart renders past the
 * container's bottom edge and is visually obscured. Wrapping from the
 * outside places the text bar in normal page flow below the chart, mirroring
 * the Chart.js adapter's sibling-insertion pattern.
 *
 * The host itself uses `display: contents` so it has no layout effect on
 * the original page. Sizing for MAIDR's focusable wrapper is delegated to
 * `SizedDomNodeAdapter` via the `data-maidr-host-width` /
 * `data-maidr-host-height` data attributes stamped here from the original
 * container's measured dimensions. That adapter renders an explicitly sized
 * `<div>` as a direct React child of the focusable wrapper, keeping
 * `width: fit-content` non-zero — and therefore focusable — even though the
 * AnyChart SVG has no intrinsic HTML `width` / `height` attributes.
 */
function ensureHostWrapper(
  svg: SVGElement,
  container: HTMLElement,
): HTMLElement {
  // If we've already wrapped this chart, return the existing host.
  const existing = container.parentElement?.closest<HTMLElement>(
    '[data-maidr-anychart-host]',
  );
  if (existing)
    return existing;

  // Capture the container's pixel dimensions before it is reparented, then
  // hand them to MAIDR via data attributes that `SizedDomNodeAdapter` in
  // `src/index.tsx` reads when it adopts this host into the React tree.
  const rect = container.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : (container.clientWidth || 600);
  const height = rect.height > 0 ? rect.height : (container.clientHeight || 400);

  const host = document.createElement('div');
  host.setAttribute('data-maidr-anychart-host', '');
  host.style.display = 'contents';
  host.dataset.maidrHostWidth = String(width);
  host.dataset.maidrHostHeight = String(height);

  // Wrap the entire user-supplied container with the host. After this:
  //   <body>
  //     <div data-maidr-anychart-host style="display:contents">
  //       <div id="container"> <svg/> </div>
  //     </div>
  //   </body>
  // `initMaidr` will then replace this host with the React root, so MAIDR's
  // <article> sits at the page level, NOT inside the 400px-tall #container.
  const parent = container.parentNode;
  if (parent) {
    parent.insertBefore(host, container);
    host.appendChild(container);
  } else {
    // Fallback (defensive): fall back to wrapping just the SVG if the
    // container is somehow detached. The text bar may overflow in this
    // edge case, but focus and navigation will still work.
    svg.parentNode!.insertBefore(host, svg);
    host.appendChild(svg);
  }

  // Mark the SVG so we can find it from the host (no-op for runtime
  // behavior, useful for diagnostics and tests).
  if (!svg.hasAttribute('data-maidr-anychart-svg')) {
    svg.setAttribute('data-maidr-anychart-svg', '');
  }

  return host;
}

/**
 * Invoke `callback` with the rendered chart SVG once it is in the DOM.
 *
 * Resolution order:
 * 1. If the SVG is already a descendant of `container`, fire synchronously.
 * 2. Otherwise, if AnyChart's Stage exposes `listenOnce('stagerendered', …)`,
 *    register the listener and use `stage.domElement()` when it fires.
 *    `stagerendered` is the official AnyChart event guaranteed to fire after
 *    the SVG is attached to the DOM, in both sync and async render modes.
 * 3. As a last-resort safety net (very old stage shapes), use a scoped
 *    `MutationObserver` on the container with a 5 s timeout.
 */
function whenChartRendered(
  chart: AnyChartInstance,
  container: HTMLElement,
  callback: (svg: SVGElement) => void,
): void {
  const existing = container.querySelector('svg');
  if (existing) {
    callback(existing);
    return;
  }

  // Try AnyChart's official Stage event.
  try {
    const stage = chart.container() as unknown as {
      listenOnce?: (event: string, handler: () => void) => void;
      domElement?: () => HTMLElement | null;
    };
    if (typeof stage?.listenOnce === 'function') {
      stage.listenOnce('stagerendered', () => {
        const svg
          = (typeof stage.domElement === 'function' ? stage.domElement() : null)
            ?? container.querySelector('svg');
        if (svg instanceof SVGElement) {
          callback(svg);
        } else {
          console.warn(
            '[maidr/anychart] `stagerendered` fired but no SVG was found.',
          );
        }
      });
      return;
    }
  } catch {
    // Fall through to MutationObserver.
  }

  // Fallback: observe DOM mutations on the container.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    const svg = container.querySelector('svg');
    if (svg) {
      observer.disconnect();
      if (timeoutId !== undefined)
        clearTimeout(timeoutId);
      callback(svg);
    }
  });
  observer.observe(container, { childList: true, subtree: true });

  timeoutId = setTimeout(() => {
    observer.disconnect();
    console.warn(
      '[maidr/anychart] Timed out waiting for the chart SVG to render. '
      + 'Make sure `chart.draw()` is called before `bindAnyChart()`.',
    );
  }, 5000);
}
