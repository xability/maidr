/**
 * Core adapter that converts a Highcharts chart instance into MAIDR-compatible
 * data. The returned {@link Maidr} object can be passed directly to the
 * `<Maidr data={...}>` React component or serialized as a `maidr-data`
 * HTML attribute.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { highchartsToMaidr } from 'maidr/highcharts';
 *
 * const chart = Highcharts.chart('container', { ... });
 * const maidrData = highchartsToMaidr(chart);
 * ```
 */

import type {
  AxisConfig,
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
} from '../../type/grammar';
import type { HighchartsAdapterOptions, HighchartsAxis, HighchartsChart, HighchartsPoint, HighchartsSeries } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import {
  barSelector,
  boxplotSelectors,
  candlestickSelectors,
  ensureContainerId,
  heatmapSelectors,
  histogramSelector,
  lineSelectors,
  scatterSelector,
  seriesGroupSelector,
} from './selectors';

let chartCounter = 0;

/**
 * Converts a rendered Highcharts chart into a MAIDR data structure.
 *
 * The chart must already be rendered (i.e. the SVG DOM exists) so that
 * CSS selectors can be generated for element highlighting.
 *
 * Supported Highcharts series types:
 * - `bar`, `column` → {@link TraceType.BAR}
 * - `line`, `spline`, `area`, `areaspline` → {@link TraceType.LINE}
 * - `scatter` → {@link TraceType.SCATTER}
 * - `boxplot` → {@link TraceType.BOX}
 * - `heatmap` → {@link TraceType.HEATMAP}
 * - `histogram` → {@link TraceType.HISTOGRAM}
 * - `candlestick`, `ohlc` → {@link TraceType.CANDLESTICK}
 * - Stacked `column`/`bar` → {@link TraceType.STACKED}
 * - Grouped (dodged) `column`/`bar` → {@link TraceType.DODGED}
 * - Percent-stacked `column`/`bar` → {@link TraceType.NORMALIZED}
 *
 * Multi-pane charts (multiple `yAxis`/`xAxis` entries laid out as separate
 * bands, e.g. the Highstock price + volume pattern) are detected from the
 * rendered axis geometry and emitted as a MAIDR subplot grid — one subplot
 * per pane, navigable with arrow keys. Ambiguous layouts (overlapping bands,
 * dual-axis overlays) fall back to today's single-subplot output.
 *
 * @param chart - A Highcharts chart instance (the return value of `Highcharts.chart()`).
 * @param options - Optional overrides for ID, title, or series filtering.
 * @returns A {@link Maidr} object ready for use with the MAIDR library.
 */
export function highchartsToMaidr(
  chart: HighchartsChart,
  options?: HighchartsAdapterOptions,
): Maidr {
  const id = options?.id ?? `highcharts-${chartCounter++}`;
  const title = options?.title ?? chart.title?.textStr ?? '';
  const subtitle = chart.subtitle?.textStr;
  const caption = chart.caption?.textStr;

  const containerId = ensureContainerId(chart);

  const seriesToConvert = collectUsableSeries(chart, options?.seriesIndices);

  return {
    id,
    title,
    subtitle,
    caption,
    subplots: buildSubplotGrid(seriesToConvert, chart, containerId),
  };
}

/**
 * Builds the subplot grid for one chart: a multi-pane chart becomes one
 * subplot per detected pane; everything else keeps the single-subplot path.
 *
 * @internal
 */
export function buildSubplotGrid(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrSubplot[][] {
  const paneGrid = detectPaneGrid(seriesList);

  if (paneGrid) {
    // Never emit `{ layers: [] }` cells or empty rows — the MAIDR model
    // crashes on both — so compact ragged rows instead.
    const rows = paneGrid
      .map(row => row
        .map((group) => {
          const subplot = buildSubplot(group, chart, containerId);
          applyPaneTitleFallback(subplot, group);
          return subplot;
        })
        .filter(subplot => subplot.layers.length > 0))
      .filter(row => row.length > 0);

    const total = rows.reduce((count, row) => count + row.length, 0);
    if (total > 1) {
      return rows;
    }
    // Fewer than two usable panes survived conversion — fall through to the
    // single-subplot path so the output matches a plain chart exactly.
  }

  return [[buildSubplot(seriesList, chart, containerId)]];
}

/**
 * Converts a list of Highcharts series into one MAIDR subplot.
 *
 * Bar/column series are grouped into a single stacked/dodged/normalized
 * layer, line-like series merge into one multi-line layer, and every other
 * supported series becomes its own layer.
 *
 * @internal
 */
export function buildSubplot(
  seriesToConvert: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrSubplot {
  // Categorize series by how they need to be converted.
  const lineTypes = new Set(['line', 'spline', 'area', 'areaspline']);
  const barTypes = new Set(['bar', 'column']);

  const lineSeries = seriesToConvert.filter(s => lineTypes.has(resolveSeriesType(s, chart)));
  const barSeries = seriesToConvert.filter(s => barTypes.has(resolveSeriesType(s, chart)));
  const otherSeries = seriesToConvert.filter(
    s => !lineTypes.has(resolveSeriesType(s, chart)) && !barTypes.has(resolveSeriesType(s, chart)),
  );

  const layers: MaidrLayer[] = [];

  // Convert bar/column series — may be stacked, dodged, or normalized.
  if (barSeries.length > 0) {
    layers.push(...convertBarGroup(barSeries, chart, containerId));
  }

  // Convert non-line/non-bar series individually.
  for (const series of otherSeries) {
    const layer = convertSeries(series, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  // Convert line series together as a single multi-line layer (MAIDR expects LinePoint[][]).
  if (lineSeries.length > 0) {
    const layer = convertLineSeries(lineSeries, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  const subplot: MaidrSubplot = { layers };

  // Point the subplot at its own panel geometry (the first series' rendered
  // group). Highcharts SVG has no `g[id^="axes_"]` groups, so MAIDR's layout
  // pass relies on this element to compute the panels' visual order and the
  // vertical arrow-key direction for multi-row grids. The first layer's
  // selectors cannot serve as a fallback for every trace type (box,
  // candlestick, and heatmap layers carry structured selector objects).
  if (layers.length > 0 && seriesToConvert.length > 0) {
    subplot.selector = seriesGroupSelector(containerId, seriesToConvert[0].index);
  }

  // Add legend labels when multiple layers are present, aligned to layers.
  if (layers.length > 1) {
    subplot.legend = layers.map(l => l.title ?? `Series ${l.id}`);
  }

  return subplot;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the chart's convertible series: visible (optionally restricted to
 * `indices`) and not internal. Highstock injects internal helper series (the
 * navigator preview, marked via `isInternal` / the `highcharts-navigator-series`
 * class) that mirror real data and must never become their own layers.
 *
 * @internal
 */
export function collectUsableSeries(
  chart: HighchartsChart,
  indices?: number[],
): HighchartsSeries[] {
  return filterSeries(chart, indices).filter(series => !isInternalSeries(series));
}

function isInternalSeries(series: HighchartsSeries): boolean {
  // Highcharts reliably marks the real Highstock navigator series with both
  // `isInternal` and the `highcharts-navigator-series` class. Do NOT match on
  // the series name — a legitimate user series named "Navigator" must convert.
  const { isInternal, className } = series.options;
  return isInternal === true
    || (typeof className === 'string' && className.includes('highcharts-navigator-series'));
}

function filterSeries(
  chart: HighchartsChart,
  indices?: number[],
): HighchartsSeries[] {
  if (!indices) {
    return chart.series.filter(s => s.visible);
  }

  const result: HighchartsSeries[] = [];
  for (const i of indices) {
    const series = chart.series[i];
    if (!series) {
      console.warn(`[MAIDR Highcharts] Series index ${i} does not exist; skipping.`);
      continue;
    }
    if (!series.visible) {
      console.warn(`[MAIDR Highcharts] Series index ${i} ("${series.name}") is hidden; skipping.`);
      continue;
    }
    result.push(series);
  }
  return result;
}

function resolveSeriesType(series: HighchartsSeries, chart: HighchartsChart): string {
  return series.type || series.options.type || chart.options.chart?.type || 'line';
}

function getAxisLabel(series: HighchartsSeries, axis: 'x' | 'y'): AxisConfig {
  const axisObj = axis === 'x' ? series.xAxis : series.yAxis;
  const label = axisObj?.options?.title?.text ?? (axis === 'x' ? 'X' : 'Y');
  return { label };
}

function pointLabel(point: HighchartsPoint): string | number {
  return point.category ?? point.name ?? point.x;
}

/**
 * Determines the stacking mode for a series by checking series-level then chart-level options.
 */
function getStackingMode(series: HighchartsSeries, chart: HighchartsChart): string | undefined {
  // Series-level stacking takes precedence.
  if (series.options.stacking) {
    return series.options.stacking;
  }

  // Chart-level plotOptions.
  const seriesType = resolveSeriesType(series, chart);
  const plotOptions = chart.options.plotOptions;
  if (seriesType === 'column' && plotOptions?.column?.stacking) {
    return plotOptions.column.stacking;
  }
  if (seriesType === 'bar' && plotOptions?.bar?.stacking) {
    return plotOptions.bar.stacking;
  }
  return plotOptions?.series?.stacking;
}

// ---------------------------------------------------------------------------
// Pane detection (multi-axis charts → subplot grid)
// ---------------------------------------------------------------------------

/**
 * Pixel tolerance when clustering axis positions into pane bands. Axes whose
 * `top` (or `left`) differ by no more than this are treated as the same band.
 */
const PANE_BAND_TOLERANCE_PX = 4;

/**
 * Detects a pane grid within a single chart from the rendered axis geometry.
 *
 * Highcharts expresses panes as multiple `yAxis` entries stacked via
 * `top`/`height` (rows) and/or multiple `xAxis` entries split via
 * `left`/`width` (columns); each series is pinned to one axis pair. There is
 * no per-pane DOM group, so pane membership is derived purely from the
 * series → axis assignment.
 *
 * Returns series grouped as `grid[row][col]` in visual reading order
 * (top-left first), with empty cells/rows already compacted away, or `null`
 * when the chart is single-pane or the layout is ambiguous (missing axis
 * geometry, overlapping bands, or coinciding dual-axis overlays) — callers
 * must then fall back to the single-subplot path.
 */
function detectPaneGrid(seriesList: HighchartsSeries[]): HighchartsSeries[][][] | null {
  if (seriesList.length < 2) {
    return null;
  }
  if (seriesList.some(series => !series.xAxis || !series.yAxis)) {
    return null;
  }

  const yAxes = [...new Set(seriesList.map(series => series.yAxis))];
  const xAxes = [...new Set(seriesList.map(series => series.xAxis))];
  if (yAxes.length <= 1 && xAxes.length <= 1) {
    return null;
  }

  const rowByAxis = yAxes.length > 1
    ? assignAxisBands(yAxes, axis => axis.top, axis => axis.height)
    : new Map<HighchartsAxis, number>(yAxes.map(axis => [axis, 0]));
  const colByAxis = xAxes.length > 1
    ? assignAxisBands(xAxes, axis => axis.left, axis => axis.width)
    : new Map<HighchartsAxis, number>(xAxes.map(axis => [axis, 0]));
  if (!rowByAxis || !colByAxis) {
    return null;
  }

  const rowCount = Math.max(...rowByAxis.values()) + 1;
  const colCount = Math.max(...colByAxis.values()) + 1;

  // Group series by (row, col) cell, preserving series order within a cell.
  const cells: (HighchartsSeries[] | undefined)[][] = Array.from(
    { length: rowCount },
    () => Array.from({ length: colCount }, () => undefined),
  );
  let cellCount = 0;
  for (const series of seriesList) {
    const row = rowByAxis.get(series.yAxis) ?? 0;
    const col = colByAxis.get(series.xAxis) ?? 0;
    if (!cells[row][col]) {
      cells[row][col] = [];
      cellCount++;
    }
    cells[row][col]?.push(series);
  }

  // A single occupied cell means every series shares one geometry band
  // (e.g. a dual-axis overlay) — that is not a multi-pane chart.
  if (cellCount <= 1) {
    return null;
  }

  // Compact ragged rows: drop unoccupied cells and rows entirely.
  const grid: HighchartsSeries[][][] = [];
  for (const row of cells) {
    const compacted = row.filter((cell): cell is HighchartsSeries[] => cell !== undefined);
    if (compacted.length > 0) {
      grid.push(compacted);
    }
  }
  return grid;
}

/**
 * Clusters axes into position bands along one dimension and assigns each
 * axis its band index (0 = topmost/leftmost).
 *
 * Returns `null` when any axis lacks rendered geometry or when two distinct
 * bands overlap beyond the tolerance — pane membership would be ambiguous
 * and the caller must fall back to single-subplot output.
 */
function assignAxisBands(
  axes: HighchartsAxis[],
  getStart: (axis: HighchartsAxis) => number | undefined,
  getLength: (axis: HighchartsAxis) => number | undefined,
): Map<HighchartsAxis, number> | null {
  const measured: { axis: HighchartsAxis; start: number; end: number }[] = [];
  for (const axis of axes) {
    const start = getStart(axis);
    const length = getLength(axis);
    if (typeof start !== 'number' || !Number.isFinite(start)
      || typeof length !== 'number' || !Number.isFinite(length)) {
      return null;
    }
    measured.push({ axis, start, end: start + length });
  }
  measured.sort((a, b) => a.start - b.start);

  const bands: { start: number; end: number }[] = [];
  const bandByAxis = new Map<HighchartsAxis, number>();
  for (const { axis, start, end } of measured) {
    const current = bands[bands.length - 1];
    if (current && start - current.start <= PANE_BAND_TOLERANCE_PX) {
      current.end = Math.max(current.end, end);
    } else {
      bands.push({ start, end });
    }
    bandByAxis.set(axis, bands.length - 1);
  }

  // Distinct bands that overlap (beyond tolerance) make membership ambiguous.
  for (let i = 1; i < bands.length; i++) {
    if (bands[i - 1].end > bands[i].start + PANE_BAND_TOLERANCE_PX) {
      return null;
    }
  }

  return bandByAxis;
}

/**
 * MAIDR has no subplot-title field: the FIRST layer's `title` is the panel's
 * display name in subplot summaries. Panes have no native titles either, so
 * when the first layer ended up untitled (unnamed series), fall back to the
 * pane's own y-axis title.
 */
function applyPaneTitleFallback(subplot: MaidrSubplot, group: HighchartsSeries[]): void {
  const firstLayer = subplot.layers[0];
  if (!firstLayer || firstLayer.title !== undefined) {
    return;
  }
  const axisTitle = group[0]?.yAxis?.options?.title?.text;
  if (axisTitle) {
    firstLayer.title = axisTitle;
  }
}

// ---------------------------------------------------------------------------
// Bar / Column group handler (stacked, dodged, normalized)
// ---------------------------------------------------------------------------

function convertBarGroup(
  barSeries: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer[] {
  if (barSeries.length === 0)
    return [];

  const first = barSeries[0];

  // Check stacking mode across all series and warn on inconsistencies.
  const stackingModes = barSeries.map(s => getStackingMode(s, chart));
  const uniqueModes = [...new Set(stackingModes)];
  if (uniqueModes.length > 1) {
    console.warn(
      `[MAIDR Highcharts] Inconsistent stacking modes across bar series: ${
        JSON.stringify(uniqueModes)}. Using mode from first series.`,
    );
  }
  const stacking = stackingModes[0];

  const isInverted = chart.options.chart?.inverted === true;
  const seriesType = resolveSeriesType(first, chart);
  const defaultOrientation = seriesType === 'bar' ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  const orientation = isInverted
    ? (defaultOrientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL)
    : defaultOrientation;

  // Single series: always a plain bar chart.
  if (barSeries.length === 1) {
    return [convertSingleBar(first, containerId, orientation)];
  }

  // Multiple series with stacking.
  if (stacking === 'normal') {
    return [convertStackedBar(barSeries, containerId, orientation, TraceType.STACKED)];
  }
  if (stacking === 'percent') {
    return [convertStackedBar(barSeries, containerId, orientation, TraceType.NORMALIZED)];
  }

  // Multiple series without stacking → dodged (grouped).
  return [convertDodgedBar(barSeries, containerId, orientation)];
}

function convertSingleBar(
  series: HighchartsSeries,
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  // Highcharts always stores the bar value in `p.y` (even for horizontal 'bar'
  // charts, where `p.x` is the category). AbstractBarPlot reads the value from
  // `point.x` when HORIZONTAL, so emit the value in `x` and category in `y`,
  // and swap the axis labels so `axes.x` names the value axis.
  const isHorizontal = orientation === Orientation.HORIZONTAL;
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => (isHorizontal
      ? { x: p.y as number, y: pointLabel(p) }
      : { x: pointLabel(p), y: p.y as number }));

  return {
    id: String(series.index),
    type: TraceType.BAR,
    title: series.name || undefined,
    orientation,
    selectors: barSelector(containerId, series.index),
    axes: barAxes(series, isHorizontal),
    data,
  };
}

/**
 * Resolves the `{ x, y }` axis labels for a bar layer. For horizontal bars the
 * Highcharts value axis is `yAxis` and the category axis is `xAxis`, so they are
 * swapped to keep `axes.x` on the value axis (matching AbstractBarPlot).
 */
function barAxes(
  series: HighchartsSeries,
  isHorizontal: boolean,
): { x: AxisConfig; y: AxisConfig } {
  return isHorizontal
    ? { x: getAxisLabel(series, 'y'), y: getAxisLabel(series, 'x') }
    : { x: getAxisLabel(series, 'x'), y: getAxisLabel(series, 'y') };
}

/**
 * Builds aligned `SegmentedPoint[][]` rows for stacked/dodged/normalized bar
 * groups. Each row (one per series/group) is padded to a fixed length keyed by
 * category index so all rows share equal length — `SegmentedTrace` sums across
 * rows and would produce `NaN` on ragged input. `null`/missing cells become `0`
 * (never dropped), which keeps DOM alignment via the model's `skipZeros` path
 * since Highcharts renders no `.highcharts-point` graphic for null points.
 */
function buildSegmentedRows(
  seriesList: HighchartsSeries[],
  orientation: Orientation,
  traceType: TraceType,
): SegmentedPoint[][] {
  const isHorizontal = orientation === Orientation.HORIZONTAL;
  const isNormalized = traceType === TraceType.NORMALIZED;

  // Build the shared category-label list (index → label), preferring the axis
  // categories, then per-point category/name, then the x value itself.
  const axisCategories = seriesList[0]?.xAxis?.categories;

  // Category axes index points 0..n-1, so x doubles as the row index. Numeric
  // axes carry raw x values (e.g. years); map those to dense indices instead —
  // indexing rows by Math.round(1990) would fabricate ~2000 zero cells.
  const xToIndex = new Map<number, number>();
  if (!axisCategories) {
    const uniqueXs = [...new Set(
      seriesList.flatMap(series => series.data.map(p => Math.round(p.x))),
    )].sort((a, b) => a - b);
    uniqueXs.forEach((x, i) => xToIndex.set(x, i));
  }
  const indexForX = (x: number): number =>
    axisCategories ? Math.round(x) : (xToIndex.get(Math.round(x)) ?? -1);

  const categoryLabels: (string | number)[] = [];
  for (const series of seriesList) {
    for (const p of series.data) {
      const index = indexForX(p.x);
      if (index < 0)
        continue;
      if (categoryLabels[index] === undefined) {
        categoryLabels[index] = axisCategories?.[index] ?? p.category ?? p.name ?? Math.round(p.x);
      }
    }
  }
  const categoryCount = Math.max(axisCategories?.length ?? 0, categoryLabels.length);
  for (let j = 0; j < categoryCount; j++) {
    if (categoryLabels[j] === undefined) {
      categoryLabels[j] = axisCategories?.[j] ?? j;
    }
  }

  return seriesList.map((series) => {
    // Initialize a full-length row of zero-valued cells keyed by category index.
    const row: SegmentedPoint[] = Array.from({ length: categoryCount }, (_, j) =>
      (isHorizontal
        ? { x: 0, y: categoryLabels[j], z: series.name }
        : { x: categoryLabels[j], y: 0, z: series.name }));

    // Overlay each rendered point at its category index.
    for (const p of series.data) {
      const index = indexForX(p.x);
      if (index < 0 || index >= categoryCount)
        continue;
      const value = isNormalized ? (p.percentage ?? p.y ?? 0) : (p.y ?? 0);
      row[index] = isHorizontal
        ? { x: value, y: categoryLabels[index], z: series.name }
        : { x: categoryLabels[index], y: value, z: series.name };
    }

    return row;
  });
}

/**
 * Converts multiple bar/column series with `stacking: 'normal'` or `'percent'`
 * into a MAIDR segmented (stacked/normalized) layer.
 *
 * MAIDR expects `SegmentedPoint[][]` where each inner array is one group
 * (one fill/category level) and points within share x-axis categories.
 */
function convertStackedBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
  traceType: TraceType.STACKED | TraceType.NORMALIZED,
): MaidrLayer {
  // Each series is one "group" (fill level). Points within share x-categories.
  const data = buildSegmentedRows(seriesList, orientation, traceType);

  const first = seriesList[0];
  // Combine selectors for all series — MAIDR's SegmentedTrace expects a single selector string.
  const selectors = seriesList
    .map(s => barSelector(containerId, s.index))
    .join(', ');

  return {
    id: String(first.index),
    type: traceType,
    title: first.name || undefined,
    orientation,
    selectors,
    axes: barAxes(first, orientation === Orientation.HORIZONTAL),
    data,
  };
}

/**
 * Converts multiple bar/column series without stacking into a MAIDR dodged layer.
 *
 * Dodged bars share x-categories but are placed side by side. MAIDR expects
 * `SegmentedPoint[][]` (same as stacked, but with `TraceType.DODGED`).
 */
function convertDodgedBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  const data = buildSegmentedRows(seriesList, orientation, TraceType.DODGED);

  const first = seriesList[0];
  const selectors = seriesList
    .map(s => barSelector(containerId, s.index))
    .join(', ');

  return {
    id: String(first.index),
    type: TraceType.DODGED,
    title: first.name || undefined,
    orientation,
    selectors,
    axes: barAxes(first, orientation === Orientation.HORIZONTAL),
    data,
  };
}

// ---------------------------------------------------------------------------
// Individual series converters
// ---------------------------------------------------------------------------

function convertSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  const seriesType = resolveSeriesType(series, chart);

  switch (seriesType) {
    case 'scatter':
      return convertScatterSeries(series, containerId);
    case 'boxplot':
      return convertBoxSeries(series, chart, containerId);
    case 'heatmap':
      return convertHeatmapSeries(series, containerId);
    case 'histogram':
      return convertHistogramSeries(series, containerId);
    case 'candlestick':
    case 'ohlc':
      return convertCandlestickSeries(series, chart, containerId);
    default:
      console.warn(`[MAIDR Highcharts] Unsupported series type: "${seriesType}"; skipping.`);
      return null;
  }
}

function convertLineSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: p.y as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];
  const selectors = lineSelectors(containerId, seriesList.map(s => s.index));

  // Use a combined title for multi-line layers so all series are represented.
  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: TraceType.LINE,
    title: layerTitle,
    selectors,
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

function convertScatterSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: ScatterPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: p.x,
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.SCATTER,
    title: series.name || undefined,
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

function convertBoxSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const data: BoxPoint[] = series.data.map((p, i) => {
    const missing: string[] = [];
    if (p.low == null)
      missing.push('low');
    if (p.q1 == null)
      missing.push('q1');
    if (p.median == null)
      missing.push('median');
    if (p.q3 == null)
      missing.push('q3');
    if (p.high == null)
      missing.push('high');

    if (missing.length > 0) {
      console.warn(
        `[MAIDR Highcharts] Boxplot series "${series.name}" point ${i}: missing ${missing.join(', ')}; defaulting to 0.`,
      );
    }

    return {
      z: p.category ?? p.name ?? String(p.x),
      lowerOutliers: [],
      min: p.low ?? 0,
      q1: p.q1 ?? 0,
      q2: p.median ?? 0,
      q3: p.q3 ?? 0,
      max: p.high ?? 0,
      upperOutliers: [],
    };
  });

  // Stamp each rendered `g.highcharts-point` group with a stable index so
  // per-box selectors (returned by `boxplotSelectors`) can disambiguate them.
  // BoxTrace expects `selectors.length === data.length`; a mismatch here makes
  // it bail out with `highlightValues = null` and silently disable highlight.
  stampBoxIndices(chart, containerId, series.index, data.length);

  return {
    id: String(series.index),
    type: TraceType.BOX,
    title: series.name || undefined,
    selectors: boxplotSelectors(containerId, series.index, data.length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Adds `data-maidr-box-index="N"` to each rendered box group in a Highcharts
 * boxplot series. Idempotent: re-running overwrites existing attributes,
 * which is important because Highcharts may re-render on updates.
 *
 * If the rendered group count doesn't match `expectedCount`, a warning is
 * emitted and stamping continues for whichever groups exist; downstream
 * `BoxTrace.mapToSvgElements` will then return null and disable highlight.
 */
function stampBoxIndices(
  chart: HighchartsChart,
  containerId: string,
  seriesIndex: number,
  expectedCount: number,
): void {
  const container = chart.renderTo ?? document.getElementById(containerId);
  if (!container) {
    console.warn(`[MAIDR Highcharts] Boxplot stamping: container "${containerId}" not found.`);
    return;
  }

  const selector = `.highcharts-series-group .highcharts-series-${seriesIndex} g.highcharts-point`;
  const groups = container.querySelectorAll<SVGGElement>(selector);

  if (groups.length !== expectedCount) {
    console.warn(
      `[MAIDR Highcharts] Boxplot series ${seriesIndex}: expected ${expectedCount} `
      + `box groups but found ${groups.length} in DOM. Highlight may not work.`,
    );
  }

  groups.forEach((group, i) => {
    group.removeAttribute('data-maidr-box-index');
    group.setAttribute('data-maidr-box-index', String(i));
    splitWhiskerPath(group, i);
  });
}

/**
 * Splits a Highcharts whisker `<path>` element into two separate `<path>`
 * elements (one per cap) so MAIDR can highlight `min` and `max` independently.
 *
 * Highcharts renders both whisker caps inside a single `<path>` with two
 * subpaths in the `d` attribute, e.g.:
 *   - Vertical:   `M x1 y_high L x2 y_high M x1 y_low L x2 y_low`
 *   - Horizontal: `M x_high y1 L x_high y2 M x_low y1 L x_low y2`
 *
 * After splitting:
 *   - Two new `<path>` siblings are inserted after the original, each carrying
 *     `data-maidr-box-part="upper-whisker"` or `"lower-whisker"`.
 *   - The original loses its `highcharts-boxplot-whisker` class (so future
 *     class-based queries skip it) and is marked `data-maidr-split-original`.
 *
 * Orientation is inferred from the relative midpoint offsets between the two
 * subpaths, matching the D3 box binder's classification logic.
 *
 * Idempotent: re-running on an already-split group is a no-op.
 */
function splitWhiskerPath(group: SVGGElement, boxIndex: number): void {
  const original = group.querySelector<SVGPathElement>('path.highcharts-boxplot-whisker');
  if (!original) {
    // Some box configs (e.g. no whisker rendering) legitimately omit it.
    return;
  }
  if (original.hasAttribute('data-maidr-split-original')) {
    // Already split (re-stamp on same DOM).
    return;
  }

  const d = original.getAttribute('d');
  if (!d) {
    console.warn(`[MAIDR Highcharts] Whisker path in box ${boxIndex} has no 'd' attribute; skipping split.`);
    return;
  }

  const parts = computeWhiskerParts(d);
  if (!parts) {
    console.warn(
      `[MAIDR Highcharts] Whisker path in box ${boxIndex} could not be split `
      + `(expected 2 subpaths with valid midpoints); skipping split.`,
    );
    return;
  }

  const upperPath = original.cloneNode(true) as SVGPathElement;
  upperPath.setAttribute('d', parts.upper);
  upperPath.setAttribute('data-maidr-box-part', 'upper-whisker');
  // Strip the identifying class from the clone so re-running `splitWhiskerPath`
  // never matches it (keeping stamping idempotent); the attribute selector still
  // targets it via `data-maidr-box-part`.
  upperPath.classList.remove('highcharts-boxplot-whisker');

  const lowerPath = original.cloneNode(true) as SVGPathElement;
  lowerPath.setAttribute('d', parts.lower);
  lowerPath.setAttribute('data-maidr-box-part', 'lower-whisker');
  lowerPath.classList.remove('highcharts-boxplot-whisker');

  // Insert after original so the visual stacking order is preserved. Note:
  // afterend insertions go in reverse, so insert lower first then upper to
  // end up with [original, upper, lower] which keeps the natural order.
  original.insertAdjacentElement('afterend', lowerPath);
  original.insertAdjacentElement('afterend', upperPath);

  // Strip the original's identifying class so attribute-only selectors (and
  // any future `.highcharts-boxplot-whisker` queries) skip it. We keep it in
  // the DOM rather than hiding so Highcharts' own internal references stay
  // valid; the new paths render the same caps on top.
  original.classList.remove('highcharts-boxplot-whisker');
  original.setAttribute('data-maidr-split-original', 'true');

  // Highcharts redraws (resize/reflow/update) rewrite the ORIGINAL path's `d`
  // in place but never touch our clones, leaving them stale. Mirror the
  // original's `d` back onto the clones whenever it changes.
  observeSplitRedraw(original, () => {
    const currentD = original.getAttribute('d');
    if (!currentD)
      return;
    const next = computeWhiskerParts(currentD);
    if (!next)
      return;
    upperPath.setAttribute('d', next.upper);
    lowerPath.setAttribute('d', next.lower);
  });
}

/**
 * Classifies a Highcharts whisker path's two cap subpaths into `upper` and
 * `lower` cap `d` strings. Returns `null` when the path does not contain
 * exactly two subpaths with computable midpoints.
 */
function computeWhiskerParts(d: string): { upper: string; lower: string } | null {
  // Highcharts uses uppercase commands; each cap starts with a fresh M.
  const subpaths = d.match(/M[^M]*/g);
  if (!subpaths || subpaths.length !== 2) {
    return null;
  }

  const m0 = subpathMidpoint(subpaths[0]);
  const m1 = subpathMidpoint(subpaths[1]);
  if (!m0 || !m1) {
    return null;
  }

  // Pick the dominant axis to classify: whichever differs more between
  // the two cap midpoints is the orientation axis.
  const dx = Math.abs(m0.x - m1.x);
  const dy = Math.abs(m0.y - m1.y);

  let upperIdx: number;
  if (dy >= dx) {
    // Vertical boxplot: SVG y grows downward → smaller y is visually upper.
    upperIdx = m0.y < m1.y ? 0 : 1;
  } else {
    // Horizontal boxplot: larger x is the "max" (high-value) side.
    upperIdx = m0.x > m1.x ? 0 : 1;
  }
  const lowerIdx = 1 - upperIdx;

  return { upper: subpaths[upperIdx].trim(), lower: subpaths[lowerIdx].trim() };
}

/**
 * Watches a split-original `<path>` for `d` attribute changes and invokes
 * `resync` so its cloned sub-part siblings can be kept in sync on Highcharts
 * redraws. The observer is captured only by the observed node (and its
 * callback closure), so it is garbage-collected together with the chart DOM;
 * it does not need explicit teardown.
 */
function observeSplitRedraw(original: SVGPathElement, resync: () => void): void {
  const observer = new MutationObserver(resync);
  observer.observe(original, { attributes: true, attributeFilter: ['d'] });
}

/**
 * Returns the (x, y) midpoint of an SVG path subpath by averaging all
 * coordinate pairs found in the substring. Robust to optional whitespace,
 * negative values, and decimals.
 */
function subpathMidpoint(subpath: string): { x: number; y: number } | null {
  const nums = subpath.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 2) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sumX += nums[i];
    sumY += nums[i + 1];
    count++;
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : null;
}

function convertHeatmapSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  // Read categories from the series' OWN axes (not chart.xAxis[0]/yAxis[0])
  // so heatmaps bound to secondary/pane axes get the right labels.
  const xCategories = series.xAxis?.categories ?? [];
  const yCategories = series.yAxis?.categories ?? [];

  // Determine grid dimensions. If numeric axes are used, infer from data.
  let rows = yCategories.length;
  let cols = xCategories.length;

  if (rows === 0 || cols === 0) {
    // Numeric axes — determine grid size from actual data indices.
    let maxX = 0;
    let maxY = 0;
    for (const p of series.data) {
      if (p.y !== null) {
        maxX = Math.max(maxX, Math.round(p.x));
        maxY = Math.max(maxY, Math.round(p.y));
      }
    }
    if (cols === 0)
      cols = maxX + 1;
    if (rows === 0)
      rows = maxY + 1;
  }

  // Build 2D points grid: points[y][x], initialized to 0.
  const points: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0));

  for (const p of series.data) {
    if (p.y === null)
      continue;

    const xIdx = Math.round(p.x);
    const yIdx = Math.round(p.y);
    if (yIdx < 0 || yIdx >= rows || xIdx < 0 || xIdx >= cols)
      continue;

    // Heatmap cell value lives in `point.options.value` (colorAxis metric).
    // Falls back to the point's `value` property if available.
    const opts = p.options ?? {};
    const cellValue = typeof opts.value === 'number'
      ? opts.value
      : (typeof opts.colorValue === 'number' ? opts.colorValue : null);

    // Only use p.y as fallback when it genuinely represents the cell value
    // (single-row heatmaps where y IS the value); otherwise default to 0.
    points[yIdx][xIdx] = cellValue ?? 0;
  }

  const data: HeatmapData = {
    x: xCategories.length > 0
      ? xCategories
      : Array.from({ length: cols }, (_, i) => String(i)),
    y: yCategories.length > 0
      ? yCategories
      : Array.from({ length: rows }, (_, i) => String(i)),
    points,
  };

  // Stamp `data-maidr-row` / `data-maidr-col` onto each rendered cell using
  // the user-supplied (x, y) grid indices. This makes the selector→cell
  // mapping independent of Highcharts' DOM insertion order (which may be
  // row- or column-major depending on how `series.data` was provided).
  stampHeatmapIndices(series);

  return {
    id: String(series.index),
    type: TraceType.HEATMAP,
    title: series.name || undefined,
    selectors: heatmapSelectors(containerId, series.index, rows, cols),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Stamps each rendered heatmap cell with `data-maidr-row` / `data-maidr-col`
 * attributes derived from its (x, y) grid indices.
 *
 * Highcharts emits heatmap cells in `series.data` order, which depends on
 * how the user supplied the data (row-major, column-major, or arbitrary).
 * Rather than rely on positional DOM ordering, we use each point's `.graphic`
 * reference (set by Highcharts during render) to attach unambiguous
 * coordinate attributes that selectors can target directly.
 *
 * Cells without a rendered `graphic` (e.g. null data points) are skipped.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 */
function stampHeatmapIndices(series: HighchartsSeries): void {
  for (const point of series.data) {
    const element = point.graphic?.element;
    if (!element) {
      continue;
    }
    const xIdx = Math.round(point.x);
    const yIdx = typeof point.y === 'number' ? Math.round(point.y) : null;
    if (yIdx === null) {
      continue;
    }
    element.setAttribute('data-maidr-col', String(xIdx));
    element.setAttribute('data-maidr-row', String(yIdx));
  }
}

function convertHistogramSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: HistogramPoint[] = series.data
    .filter(p => p.y !== null)
    .map((p) => {
      const opts = p.options ?? {};
      // Highcharts histogram points have `x` (bin start) and `x2` (bin end).
      const binStart = typeof opts.x === 'number' ? opts.x : p.x;
      const binEnd = typeof opts.x2 === 'number' ? opts.x2 : binStart;
      return {
        x: pointLabel(p),
        y: p.y as number,
        xMin: binStart as number,
        xMax: binEnd as number,
        yMin: 0,
        yMax: p.y as number,
      };
    });

  return {
    id: String(series.index),
    type: TraceType.HISTOGRAM,
    title: series.name || undefined,
    selectors: histogramSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a Highcharts candlestick or OHLC series into MAIDR CandlestickPoint data.
 */
function convertCandlestickSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const data: CandlestickPoint[] = series.data
    .filter(p => p.open != null && p.close != null)
    .map((p) => {
      const open = p.open!;
      const close = p.close!;
      const high = p.high ?? Math.max(open, close);
      const low = p.low ?? Math.min(open, close);

      let trend: CandlestickTrend = 'Neutral';
      if (close > open)
        trend = 'Bull';
      else if (close < open)
        trend = 'Bear';

      return {
        value: p.category ?? p.name ?? String(p.x),
        open,
        high,
        low,
        close,
        volume: typeof p.options?.volume === 'number' ? p.options.volume : 0,
        trend,
        volatility: high - low,
      };
    });

  // Stamp each rendered `<path class="highcharts-point">` with a stable index
  // and split its three internal subpaths into separate body/upper-wick/
  // lower-wick `<path>` siblings so per-section selectors can target them.
  stampCandlestickIndices(chart, containerId, series.index, data.length);

  return {
    id: String(series.index),
    type: TraceType.CANDLESTICK,
    title: series.name || undefined,
    selectors: candlestickSelectors(containerId, series.index, data.length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Adds `data-maidr-candle-index="N"` to each rendered candlestick path and
 * splits its compound `d` attribute into three separate `<path>` siblings
 * (body, upper-wick, lower-wick) so MAIDR can highlight each section
 * independently.
 *
 * Idempotent: re-running overwrites existing index attributes; the split
 * step bails out if it detects the original was already processed.
 */
function stampCandlestickIndices(
  chart: HighchartsChart,
  containerId: string,
  seriesIndex: number,
  expectedCount: number,
): void {
  const container = chart.renderTo ?? document.getElementById(containerId);
  if (!container) {
    console.warn(`[MAIDR Highcharts] Candlestick stamping: container "${containerId}" not found.`);
    return;
  }

  // Highcharts emits each candle as a `<path class="highcharts-point">`
  // directly under the series group (no wrapping `<g>` like boxplot).
  const selector = `.highcharts-series-group .highcharts-series-${seriesIndex} path.highcharts-point`;
  const paths = container.querySelectorAll<SVGPathElement>(selector);

  if (paths.length !== expectedCount) {
    console.warn(
      `[MAIDR Highcharts] Candlestick series ${seriesIndex}: expected ${expectedCount} `
      + `candle paths but found ${paths.length} in DOM. Highlight may not work.`,
    );
  }

  paths.forEach((path, i) => {
    path.removeAttribute('data-maidr-candle-index');
    path.setAttribute('data-maidr-candle-index', String(i));
    splitCandlestickPath(path, i);
  });
}

/**
 * Splits a Highcharts candlestick `<path>` element into three separate `<path>`
 * siblings (one per visual section) so MAIDR can highlight `body`, `wickHigh`,
 * and `wickLow` independently.
 *
 * Highcharts renders a single candle as one `<path>` with three subpaths in
 * the `d` attribute:
 *   - Body: a rectangle traced with four `L` commands and closed by `Z`.
 *   - Upper wick: short vertical line above the body (one M + one L, no Z).
 *   - Lower wick: short vertical line below the body (one M + one L, no Z).
 *
 * The body is identified by the presence of `Z` (closepath). The remaining
 * two subpaths are classified by midpoint Y (smaller Y = upper, since SVG
 * Y grows downward).
 *
 * After splitting:
 *   - Three new `<path>` siblings are inserted after the original, each
 *     carrying `data-maidr-candle-part="body" | "upper-wick" | "lower-wick"`
 *     (plus the inherited `data-maidr-candle-index`).
 *   - The original loses its `highcharts-point` class and is marked
 *     `data-maidr-split-original` so future class-only queries skip it.
 *
 * Idempotent: re-running on an already-split path is a no-op.
 */
function splitCandlestickPath(original: SVGPathElement, candleIndex: number): void {
  if (original.hasAttribute('data-maidr-split-original')) {
    return;
  }

  const d = original.getAttribute('d');
  if (!d) {
    console.warn(`[MAIDR Highcharts] Candlestick path ${candleIndex} has no 'd' attribute; skipping split.`);
    return;
  }

  const parts = computeCandlestickParts(d);
  if (!parts) {
    console.warn(
      `[MAIDR Highcharts] Candlestick path ${candleIndex} could not be split `
      + `(expected 3 subpaths with a body and computable wick midpoints); skipping split.`,
    );
    return;
  }

  const cloneSubpath = (dValue: string, part: 'body' | 'upper-wick' | 'lower-wick'): SVGPathElement => {
    const clone = original.cloneNode(true) as SVGPathElement;
    clone.setAttribute('d', dValue);
    clone.setAttribute('data-maidr-candle-part', part);
    // Strip the identifying class from the clone so re-running
    // `stampCandlestickIndices` never matches or renumbers it; the attribute
    // selector still targets it via `data-maidr-candle-part`.
    clone.classList.remove('highcharts-point');
    return clone;
  };

  const bodyPath = cloneSubpath(parts.body, 'body');
  const upperPath = cloneSubpath(parts.upper, 'upper-wick');
  const lowerPath = cloneSubpath(parts.lower, 'lower-wick');

  // afterend inserts in reverse, so insert lower → upper → body to end with
  // [original, body, upper, lower] (visual stacking preserved).
  original.insertAdjacentElement('afterend', lowerPath);
  original.insertAdjacentElement('afterend', upperPath);
  original.insertAdjacentElement('afterend', bodyPath);

  // Strip the identifying class so subsequent `.highcharts-point` queries
  // skip the now-superseded original. Keep it in the DOM (and visible) so
  // Highcharts' internal references stay valid; the new paths render the
  // same shapes on top.
  original.classList.remove('highcharts-point');
  original.setAttribute('data-maidr-split-original', 'true');

  // Keep the cloned sections in sync when Highcharts rewrites the original's
  // `d` on redraw (resize/reflow/update), otherwise the clones go stale.
  observeSplitRedraw(original, () => {
    const currentD = original.getAttribute('d');
    if (!currentD)
      return;
    const next = computeCandlestickParts(currentD);
    if (!next)
      return;
    bodyPath.setAttribute('d', next.body);
    upperPath.setAttribute('d', next.upper);
    lowerPath.setAttribute('d', next.lower);
  });
}

/**
 * Classifies a Highcharts candlestick path's three subpaths into `body`,
 * `upper` wick, and `lower` wick `d` strings. The body is the only subpath with
 * a closepath (`Z`) command; the remaining two are ordered by midpoint Y
 * (smaller Y = upper, since SVG Y grows downward). Returns `null` when the path
 * does not contain exactly three subpaths with a body and computable midpoints.
 */
function computeCandlestickParts(
  d: string,
): { body: string; upper: string; lower: string } | null {
  // Highcharts uses uppercase commands; each subpath starts with a fresh M.
  const subpaths = d.match(/M[^M]*/g);
  if (!subpaths || subpaths.length !== 3) {
    return null;
  }

  // The body is the only subpath with a closepath command.
  const bodyIdx = subpaths.findIndex(sp => /z/i.test(sp));
  if (bodyIdx === -1) {
    return null;
  }

  const wickIndices = [0, 1, 2].filter(i => i !== bodyIdx);
  const m0 = subpathMidpoint(subpaths[wickIndices[0]]);
  const m1 = subpathMidpoint(subpaths[wickIndices[1]]);
  if (!m0 || !m1) {
    return null;
  }

  // SVG y grows downward → smaller y is visually upper.
  const upperWickIdx = m0.y < m1.y ? wickIndices[0] : wickIndices[1];
  const lowerWickIdx = upperWickIdx === wickIndices[0] ? wickIndices[1] : wickIndices[0];

  return {
    body: subpaths[bodyIdx].trim(),
    upper: subpaths[upperWickIdx].trim(),
    lower: subpaths[lowerWickIdx].trim(),
  };
}
