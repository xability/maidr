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
  DumbbellData,
  DumbbellPoint,
  ErrorBarPoint,
  FlowPoint,
  GanttData,
  GanttPoint,
  GaugeBand,
  GaugePoint,
  HeatmapData,
  HexbinPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  NetworkPoint,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  ThresholdOptions,
  TreemapPoint,
  VolcanoPoint,
  WaterfallKind,
  WaterfallPoint,
  WordCloudPoint,
} from '../../type/grammar';
import type { HighchartsAdapterOptions, HighchartsAxis, HighchartsChart, HighchartsPoint, HighchartsSeries } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import {
  barSelector,
  boxplotSelectors,
  bulletSelector,
  candlestickSelectors,
  dumbbellSelector,
  ensureContainerId,
  errorBarSelector,
  flowSelector,
  funnelSelector,
  ganttSelectors,
  gaugeSelector,
  heatmapSelectors,
  hexbinSelectors,
  histogramSelector,
  lineSelectors,
  lollipopSelector,
  networkSelector,
  pieSelector,
  polarAreaSelectors,
  scatterSelector,
  seriesGroupSelector,
  solidGaugeSelector,
  treemapSelectors,
  volcanoSelector,
  waterfallSelector,
  wordCloudSelector,
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
 * - `line`, `spline` → {@link TraceType.LINE}, or {@link TraceType.STEP} when
 *   the series sets `step`
 * - `area`, `areaspline` → {@link TraceType.AREA}
 * - `scatter` → {@link TraceType.SCATTER}, or {@link TraceType.DOT} on a
 *   category axis (a Cleveland dot plot)
 * - `lollipop` → {@link TraceType.LOLLIPOP}
 * - `funnel`, `pyramid` → {@link TraceType.FUNNEL}
 * - `wordcloud` → {@link TraceType.WORD_CLOUD}
 * - `sankey`, `arcdiagram` → {@link TraceType.SANKEY}
 * - `dependencywheel` → {@link TraceType.CHORD}
 * - `networkgraph` → {@link TraceType.NETWORK}
 * - `treemap` → {@link TraceType.TREEMAP}
 * - `sunburst` → {@link TraceType.SUNBURST}
 * - `gauge`, `solidgauge`, `bullet` → {@link TraceType.GAUGE}
 * - `waterfall` → {@link TraceType.WATERFALL}
 * - `errorbar` → {@link TraceType.ERROR_BAR}, taking its estimates from the
 *   series it is linked to
 * - `dumbbell` → {@link TraceType.DUMBBELL}
 * - `gantt`, `xrange` → {@link TraceType.GANTT}
 * - `boxplot` → {@link TraceType.BOX}
 * - `heatmap` → {@link TraceType.HEATMAP}
 * - `tilemap` → {@link TraceType.HEXBIN}, or {@link TraceType.HEATMAP} when
 *   its `tileShape` is `square` (an aligned grid rather than a stagger)
 * - `histogram` → {@link TraceType.HISTOGRAM}
 * - `candlestick`, `ohlc` → {@link TraceType.CANDLESTICK}
 * - `pie` (including doughnuts, which are a pie with an `innerSize`) →
 *   {@link TraceType.PIE}
 * - Stacked `column`/`bar` → {@link TraceType.STACKED}
 * - Grouped (dodged) `column`/`bar` → {@link TraceType.DODGED}
 * - Percent-stacked `column`/`bar` → {@link TraceType.NORMALIZED}
 * - Stacked `area`/`areaspline` → {@link TraceType.STACKED_AREA}
 * - Percent-stacked `area`/`areaspline` → {@link TraceType.NORMALIZED_AREA}
 * - Two stacked `column`/`bar` series growing opposite ways →
 *   {@link TraceType.DIVERGING}
 *
 * Two chart-wide drawing modes override the series types above, because they
 * change what a series means without changing what it is called:
 * - `chart.polar` → {@link TraceType.RADAR} for `line`/`spline`/`area`
 *   series, {@link TraceType.POLAR_AREA} for `column`/`bar` ones
 * - `chart.parallelCoordinates` → {@link TraceType.PARALLEL}
 *
 * Two more are read from the data or declared by the caller, because
 * Highcharts draws them with a series type it shares with something else:
 * - `line`/`spline` series carrying a rank permutation on a reversed axis →
 *   {@link TraceType.BUMP}, forced or suppressed with `options.bump`
 * - `scatter` series named by `options.significancePlot` →
 *   {@link TraceType.VOLCANO} or {@link TraceType.MANHATTAN}, merged into one
 *   layer
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
    subplots: buildSubplotGrid(seriesToConvert, chart, containerId, options),
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
  options?: HighchartsAdapterOptions,
): MaidrSubplot[][] {
  const paneGrid = detectPaneGrid(seriesList);

  if (paneGrid) {
    // Never emit `{ layers: [] }` cells or empty rows — the MAIDR model
    // crashes on both — so compact ragged rows instead.
    const rows = paneGrid
      .map(row => row
        .map((group) => {
          const subplot = buildSubplot(group, chart, containerId, options);
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

  return [[buildSubplot(seriesList, chart, containerId, options)]];
}

/**
 * Converts a list of Highcharts series into one MAIDR subplot.
 *
 * Bar/column series are grouped into a single stacked/dodged/normalized
 * layer, area series into a single (optionally stacked) area layer, line-like
 * series merge into one multi-line layer, and every other supported series
 * becomes its own layer.
 *
 * @internal
 */
export function buildSubplot(
  seriesToConvert: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  options?: HighchartsAdapterOptions,
): MaidrSubplot {
  // A radial chart is drawn from the same series types as a cartesian one:
  // a radar's spokes are `line` series, a wind rose's wedges are `column`
  // ones, and a parallel coordinates plot's observations are `line` series
  // too. Only the chart-wide flag says which chart was drawn, so it is read
  // here — a series that reached the buckets below would be merged into an
  // ordinary line or bar layer announcing the wrong chart.
  const radialType = radialLineType(chart);
  const isPolar = chart.options.chart?.polar === true;

  // An error bar carries only the interval; its estimate lives in the series
  // it is linked to. That series is therefore read THROUGH the error bar
  // layer rather than as a bar of its own, so it is dropped here.
  const absorbed = seriesReadAsErrorBars(seriesToConvert, chart);
  const convertible = seriesToConvert.filter(series => !absorbed.has(series));

  // A volcano or Manhattan plot is drawn as plain `scatter` series, so only
  // the caller can say that is what it is. They are pulled out ahead of the
  // buckets because they become ONE layer: a Manhattan is one series per
  // chromosome and one cloud, and its threshold spans all of them.
  const significanceSeries = significancePlotSeries(convertible, chart, options);

  // Categorize series by how they need to be converted. Areas are their own
  // bucket rather than part of the line one: a filled band is a different
  // chart to announce, and a stacked band draws a second magnitude that a
  // line layer has nowhere to carry. Under a radial mode that distinction
  // disappears — an area series is one more outline around the spokes, with
  // no baseline to fill down to — so the two buckets become one.
  const lineTypes = new Set(radialType
    ? ['line', 'spline', 'area', 'areaspline']
    : ['line', 'spline']);
  const areaTypes = new Set(radialType ? [] : ['area', 'areaspline']);
  const barTypes = new Set(['bar', 'column']);

  const lineSeries = convertible.filter(s => lineTypes.has(resolveSeriesType(s, chart)));
  const areaSeries = convertible.filter(s => areaTypes.has(resolveSeriesType(s, chart)));
  const barSeries = convertible.filter(s => barTypes.has(resolveSeriesType(s, chart)));
  const otherSeries = convertible.filter((s) => {
    const type = resolveSeriesType(s, chart);
    return !significanceSeries.includes(s)
      && !lineTypes.has(type) && !areaTypes.has(type) && !barTypes.has(type);
  });

  const layers: MaidrLayer[] = [];

  // Convert bar/column series — may be stacked, dodged, normalized or, on a
  // polar chart, the wedges of a wind rose.
  if (barSeries.length > 0) {
    if (isPolar) {
      const layer = convertRadialSeries(barSeries, chart, containerId, TraceType.POLAR_AREA);
      if (layer) {
        layers.push(layer);
      }
    } else {
      layers.push(...convertBarGroup(barSeries, chart, containerId));
    }
  }

  // Convert area series as one layer. Stacking is why they cannot be split:
  // a band's running total only exists when every band is in the same layer.
  if (areaSeries.length > 0) {
    const layer = convertAreaSeries(areaSeries, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  // Convert non-line/non-area/non-bar series individually.
  for (const series of otherSeries) {
    const layer = convertSeries(series, chart, containerId, options);
    if (layer) {
      layers.push(layer);
    }
  }

  // Convert the scatter series the caller declared as one threshold-read
  // cloud.
  if (significanceSeries.length > 0 && options?.significancePlot) {
    const layer = convertSignificanceSeries(
      significanceSeries,
      chart,
      containerId,
      options.significancePlot,
    );
    if (layer) {
      layers.push(layer);
    }
  }

  // Under a radial mode the whole line bucket is one layer — one outline per
  // series around the shared spokes — and `step` has no meaning there, since
  // there is no interpolation to make piecewise constant.
  if (radialType) {
    const layer = radialType === TraceType.PARALLEL
      ? convertParallelSeries(lineSeries, chart, containerId)
      : convertRadialSeries(lineSeries, chart, containerId, TraceType.RADAR);
    if (layer) {
      layers.push(layer);
    }
    return finishSubplot(layers, seriesToConvert, containerId);
  }

  // A bump chart is drawn from ordinary line series too — what makes it one
  // is that the numbers are ranks, which is a fact about the data rather than
  // about the series type. It has to be decided before the step split, since
  // a rank table is one layer whatever the lines are drawn like.
  if (lineSeries.length > 0 && readsAsBump(lineSeries, options)) {
    const layer = convertBumpSeries(lineSeries, containerId);
    if (layer) {
      layers.push(layer);
      return finishSubplot(layers, seriesToConvert, containerId);
    }
  }

  // Convert line series together as a single multi-line layer (MAIDR expects
  // LinePoint[][]). A series drawn with `step` is piecewise constant rather
  // than interpolated, so it becomes a step layer instead — one per convention,
  // since a layer carries a single `stepDirection` for all of its series.
  const stepSeries = new Map<StepDirection, HighchartsSeries[]>();
  const plainLineSeries: HighchartsSeries[] = [];
  for (const series of lineSeries) {
    const direction = stepDirectionOf(series);
    if (direction === undefined) {
      plainLineSeries.push(series);
      continue;
    }
    const bucket = stepSeries.get(direction);
    if (bucket) {
      bucket.push(series);
    } else {
      stepSeries.set(direction, [series]);
    }
  }

  if (plainLineSeries.length > 0) {
    const layer = convertLineSeries(plainLineSeries, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  for (const [direction, series] of stepSeries) {
    const layer = convertLineSeries(series, chart, containerId, direction);
    if (layer) {
      layers.push(layer);
    }
  }

  return finishSubplot(layers, seriesToConvert, containerId);
}

/**
 * Wraps a converted subplot's layers with the panel geometry and the legend
 * MAIDR reads them through.
 *
 * @param layers - The layers converted for this panel
 * @param seriesToConvert - The panel's series, for the geometry selector
 * @param containerId - The chart's render-target id
 * @returns The finished subplot
 */
function finishSubplot(
  layers: MaidrLayer[],
  seriesToConvert: HighchartsSeries[],
  containerId: string,
): MaidrSubplot {
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

/**
 * How a chart's line-family series should be read, when a chart-wide drawing
 * mode overrides the series type.
 *
 * Highcharts expresses both of these modes as a flag on the chart rather than
 * as a series type: a radar and a parallel coordinates plot are alike made of
 * plain `line` series, and only the flag distinguishes them from an ordinary
 * line chart. Parallel coordinates wins when a chart declares both — a star
 * plot is parallel coordinates bent around a circle, and every column is still
 * a different quantity, which is the fact that decides how it has to be
 * pitched.
 *
 * @param chart - The chart to inspect
 * @returns The trace type its line series carry, or undefined for a plain
 * cartesian chart
 */
function radialLineType(
  chart: HighchartsChart,
): TraceType.RADAR | TraceType.PARALLEL | undefined {
  if (chart.options.chart?.parallelCoordinates === true) {
    return TraceType.PARALLEL;
  }
  if (chart.options.chart?.polar === true) {
    return TraceType.RADAR;
  }
  return undefined;
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
 * The `plotOptions` keys a stacking mode can be declared under, per series
 * type. Highcharts merges `plotOptions[type]` into `series.options` before it
 * renders, so these only matter for the partially built chart objects the
 * adapter is sometimes handed — but a stacked chart read as unstacked
 * announces one magnitude where two are drawn, so they are checked anyway.
 */
const STACKABLE_PLOT_OPTIONS = ['column', 'bar', 'area', 'areaspline'] as const;

/**
 * Determines the stacking mode for a series by checking series-level then chart-level options.
 */
function getStackingMode(series: HighchartsSeries, chart: HighchartsChart): string | undefined {
  // Series-level stacking takes precedence.
  if (series.options.stacking) {
    return series.options.stacking;
  }

  // Chart-level plotOptions, keyed by the series' own type then by `series`.
  const plotOptions = chart.options.plotOptions;
  const seriesType = resolveSeriesType(series, chart);
  const typeKey = STACKABLE_PLOT_OPTIONS.find(key => key === seriesType);
  return (typeKey && plotOptions?.[typeKey]?.stacking) || plotOptions?.series?.stacking;
}

/**
 * The stacking mode a group of series is drawn with.
 *
 * A layer carries one stacking mode for all of its series, so a group whose
 * series disagree has to settle on one: the first series' mode is used and the
 * disagreement is reported rather than resolved silently.
 */
function resolveGroupStacking(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
): string | undefined {
  const stackingModes = seriesList.map(s => getStackingMode(s, chart));
  const uniqueModes = [...new Set(stackingModes)];
  if (uniqueModes.length > 1) {
    console.warn(
      `[MAIDR Highcharts] Inconsistent stacking modes across series: ${
        JSON.stringify(uniqueModes)}. Using mode from first series.`,
    );
  }
  return stackingModes[0];
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
  const stacking = resolveGroupStacking(barSeries, chart);

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
    // Two stacked series that never share a side of the baseline are drawn
    // back to back rather than on top of one another — a population pyramid,
    // or a Likert scale split around a neutral midpoint.
    return [isDivergingPair(barSeries)
      ? convertDivergingBar(barSeries, containerId, orientation)
      : convertStackedBar(barSeries, containerId, orientation, TraceType.STACKED)];
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

/**
 * Which side of the baseline a series is drawn on, or `mixed` when it crosses.
 *
 * Zeros and gaps count for neither side: a category a series does not reach is
 * not evidence about which way it grows, and a pyramid whose top age band is
 * empty on one side is still a pyramid.
 *
 * @param series - The series to inspect
 * @returns The side it stays on, or `mixed`
 */
function baselineSideOf(series: HighchartsSeries): 'positive' | 'negative' | 'mixed' {
  let positive = false;
  let negative = false;
  for (const point of series.data) {
    if (typeof point.y !== 'number' || point.y === 0) {
      continue;
    }
    if (point.y > 0) {
      positive = true;
    } else {
      negative = true;
    }
  }
  if (positive && !negative) {
    return 'positive';
  }
  if (negative && !positive) {
    return 'negative';
  }
  return 'mixed';
}

/**
 * Whether a stacked bar group is really two sides of a shared baseline.
 *
 * Highcharts has no diverging series type — a population pyramid is two
 * stacked `bar` series with one side's values negated — so the chart has to be
 * recognised from the data. Two series, one entirely at or below zero and the
 * other entirely at or above it, is the shape, and it is a narrow one: a
 * genuine stack puts its segments on the same side of the baseline so they
 * accumulate, which is exactly what this rules out.
 *
 * The reading it selects is also the safer one where the two overlap. A
 * segmented layer pitches a signed value directly, so a two-million cohort
 * drawn to the left would sound smaller than a ten-thousand cohort drawn to
 * the right; a diverging layer pitches the magnitude and names the side.
 *
 * @param barSeries - The stacked group
 * @returns True when the group is two-sided
 */
function isDivergingPair(barSeries: HighchartsSeries[]): boolean {
  if (barSeries.length !== 2) {
    return false;
  }
  const [first, second] = barSeries.map(baselineSideOf);
  return (first === 'positive' && second === 'negative')
    || (first === 'negative' && second === 'positive');
}

/**
 * Converts two back-to-back bar/column series into a MAIDR diverging layer.
 *
 * The payload is the segmented bar's — `DivergingTrace` extends
 * `SegmentedTrace`, and the category navigation is the same — with the one
 * difference that decides whether it reads correctly: the values keep their
 * SIGN. The sign is what tells the trace which side a bar points to, and it is
 * also what it deliberately does not announce, pitching the magnitude instead.
 */
function convertDivergingBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  const data = buildSegmentedRows(seriesList, orientation, TraceType.DIVERGING);

  const first = seriesList[0];
  const selectors = seriesList
    .map(s => barSelector(containerId, s.index))
    .join(', ');

  return {
    id: String(first.index),
    type: TraceType.DIVERGING,
    title: first.name || undefined,
    orientation,
    selectors,
    // Highcharts lays one series group out after another, so the elements the
    // selector list resolves to run series by series. `SegmentedTrace` assumes
    // the opposite for `<rect>` marks (the shape Highcharts draws whenever a
    // bar has square corners), and would pair the first side's announcements
    // with alternating bars from both sides.
    domMapping: { order: 'row' },
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
  options?: HighchartsAdapterOptions,
): MaidrLayer | null {
  const seriesType = resolveSeriesType(series, chart);

  switch (seriesType) {
    case 'scatter':
      // A scatter pinned to category ticks is a dot plot, and reads as one.
      return isCategoryScatter(series)
        ? convertDotSeries(series, containerId)
        : convertScatterSeries(series, containerId);
    case 'lollipop':
      return convertLollipopSeries(series, containerId);
    case 'funnel':
    case 'pyramid':
      return convertFunnelSeries(series, containerId);
    case 'wordcloud':
      return convertWordCloudSeries(series, containerId);
    // An arc diagram is a sankey laid along one axis rather than across
    // stages, and a dependency wheel is the same weighted graph bent into a
    // circle — one converter for all three, differing only in what the chart
    // announces itself as.
    case 'sankey':
    case 'arcdiagram':
      return convertFlowSeries(series, containerId, TraceType.SANKEY);
    case 'dependencywheel':
      return convertFlowSeries(series, containerId, TraceType.CHORD);
    case 'networkgraph':
      return convertNetworkSeries(series, containerId);
    // A sunburst is a treemap's tree drawn as rings, declared with the same
    // `id`/`parent`/`value` points, so it shares the converter.
    case 'treemap':
      return convertTreeSeries(series, containerId, TraceType.TREEMAP);
    case 'sunburst':
      return convertTreeSeries(series, containerId, TraceType.SUNBURST);
    case 'gauge':
    case 'solidgauge':
    case 'bullet':
      return convertGaugeSeries(series, containerId, seriesType);
    case 'waterfall':
      return convertWaterfallSeries(series, containerId);
    case 'errorbar':
      return convertErrorBarSeries(series, chart, containerId);
    case 'dumbbell':
      return convertDumbbellSeries(series, containerId, options);
    // A gantt series is an xrange with dates and lanes — `GanttSeries` extends
    // `XRangeSeries` and aliases `start`/`end` onto the `x`/`x2` an xrange
    // already carries — so both read as the same schedule of intervals.
    case 'gantt':
    case 'xrange':
      return convertGanttSeries(series, containerId);
    case 'boxplot':
      return convertBoxSeries(series, chart, containerId);
    case 'heatmap':
      return convertHeatmapSeries(series, containerId);
    // A tilemap is a heatmap with a configurable tile shape, and the shape
    // decides which it reads as: `square` tiles are the aligned grid a heatmap
    // already is, while every other shape staggers alternate columns by half a
    // row so the tiles tessellate — a lattice, which is what a hexbin is.
    case 'tilemap':
      return series.options.tileShape === 'square'
        ? convertHeatmapSeries(series, containerId)
        : convertHexbinSeries(series, containerId);
    case 'histogram':
      return convertHistogramSeries(series, containerId);
    case 'candlestick':
    case 'ohlc':
      return convertCandlestickSeries(series, chart, containerId);
    case 'pie':
      return convertPieSeries(series, containerId);
    default:
      console.warn(`[MAIDR Highcharts] Unsupported series type: "${seriesType}"; skipping.`);
      return null;
  }
}

/**
 * Where each Highcharts `step` value puts the riser, in {@link StepDirection}
 * terms. Highcharts names the side the horizontal segment sits on: `left`
 * holds the current value until the next x and jumps there (`hv`), `right`
 * jumps at the current x and holds the new value across (`vh`), and `center`
 * jumps midway between the two (`mid`).
 */
const STEP_DIRECTION_BY_OPTION: Partial<Record<string, StepDirection>> = {
  left: 'hv',
  center: 'mid',
  right: 'vh',
};

/**
 * The step convention a line series draws, or `undefined` when it draws an
 * ordinary interpolated line.
 */
function stepDirectionOf(series: HighchartsSeries): StepDirection | undefined {
  const step = series.options.step;
  if (step === undefined || step === false) {
    return undefined;
  }
  // Highcharts' legacy boolean is its 'left' default.
  return step === true ? 'hv' : STEP_DIRECTION_BY_OPTION[step];
}

/**
 * Converts line-family series into one merged layer.
 *
 * Step series reuse this because their points are identical — Highcharts
 * varies only how it draws between them.
 */
function convertLineSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  stepDirection?: StepDirection,
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
    type: stepDirection ? TraceType.STEP : TraceType.LINE,
    title: layerTitle,
    selectors,
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    ...(stepDirection ? { stepDirection } : {}),
    data,
  };
}

/**
 * Whether an axis runs the other way.
 *
 * Highcharts resolves `options.reversed` onto the axis itself (and sets it by
 * itself on an inverted chart's x axis), so the resolved flag is read first
 * and the declared option serves the partially built chart objects the
 * adapter is sometimes handed.
 *
 * @param axis - The axis to inspect
 * @returns True when the axis is reversed
 */
function isReversedAxis(axis: HighchartsAxis | undefined): boolean {
  return axis?.reversed === true || axis?.options?.reversed === true;
}

/**
 * Whether a chart's line series carry **ranks** rather than values — a bump
 * chart.
 *
 * Highcharts has no bump series. A bump chart is its own line-chart demo
 * pattern: one line per competitor over a `yAxis.reversed` axis, so that rank
 * 1 is drawn at the top. That leaves the adapter deciding from the data, and
 * deciding wrongly is not a degraded reading — {@link TraceType.BUMP} inverts
 * the pitch, so an ordinary line chart read as one sonifies every value
 * upside down.
 *
 * So the test is deliberately narrow, and both halves have to hold: the value
 * axis is reversed, **and** at every period the values across the series are
 * exactly 1..k with no duplicates. A chart of measurements that happens to sit
 * on a reversed axis — a depth profile, a golf scorecard — fails the second
 * half unless its numbers really are a standings table.
 *
 * `options.bump` overrides both, in either direction: a rank chart the
 * heuristic declines (ties, or ranks that skip) can declare itself, and a
 * genuine permutation that is not a standings table can opt out.
 *
 * @param seriesList - The chart's line-family series
 * @param options - The adapter options, which may decide this outright
 * @returns True when the layer should be read as ranks
 */
function readsAsBump(
  seriesList: HighchartsSeries[],
  options?: HighchartsAdapterOptions,
): boolean {
  if (options?.bump !== undefined) {
    return options.bump;
  }

  // One line is a sequence of positions, not a table of them: with nothing to
  // be ranked against, every value is trivially rank 1.
  if (seriesList.length < 2) {
    return false;
  }
  if (!seriesList.every(series => isReversedAxis(series.yAxis))) {
    return false;
  }
  return ranksPermuteEveryPeriod(seriesList);
}

/**
 * Whether the series' values are a rank permutation at every period.
 *
 * Ranks are keyed by the period's label rather than by column index, so a
 * competitor that joined late is compared against the others in the periods it
 * actually ran — the ragged table {@link BumpTrace} already reads correctly.
 * A period with fewer competitors is still a permutation, of 1..k for the k
 * that were there.
 *
 * @param seriesList - The series to inspect
 * @returns True when every period holds 1..k exactly once each
 */
function ranksPermuteEveryPeriod(seriesList: HighchartsSeries[]): boolean {
  const ranksByPeriod = new Map<string, number[]>();
  for (const series of seriesList) {
    for (const point of series.data) {
      if (typeof point.y !== 'number') {
        continue;
      }
      const period = String(pointLabel(point));
      const ranks = ranksByPeriod.get(period);
      if (ranks) {
        ranks.push(point.y);
      } else {
        ranksByPeriod.set(period, [point.y]);
      }
    }
  }

  // A single period cannot be a bump chart: with nothing to move between,
  // there is no overtake to read, and any column of distinct ranks would
  // qualify.
  if (ranksByPeriod.size < 2) {
    return false;
  }

  for (const ranks of ranksByPeriod.values()) {
    const sorted = [...ranks].sort((a, b) => a - b);
    if (sorted.some((rank, position) => rank !== position + 1)) {
      return false;
    }
  }
  return true;
}

/**
 * Converts line-family series carrying ranks into one bump layer.
 *
 * The payload is a multi-line layer's, because that is what the chart is:
 * `BumpTrace` extends `LineTrace` and navigates it identically. What the rank
 * adds — the inverted pitch and the places gained or lost between periods —
 * the trace derives from the ranks themselves, so the adapter has nothing
 * extra to supply.
 *
 * `step` is not carried through: a rank table is one layer whatever its lines
 * are drawn like, and splitting it by drawing convention would compare
 * competitors against different tables.
 */
function convertBumpSeries(
  seriesList: HighchartsSeries[],
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
  const indices = seriesList.map(s => s.index);

  return {
    id: indices.map(String).join('-'),
    type: TraceType.BUMP,
    title: seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined,
    // One path per competitor, as any line layer has.
    selectors: lineSelectors(containerId, indices),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * Converts area-family series into one layer.
 *
 * An unstacked area is a line whose region down to the baseline is filled, so
 * the payload is the line's own — one row per series, read independently of
 * one another. Stacking is what makes this a converter of its own: stacked
 * bands draw TWO magnitudes per sample (a band's own height and the running
 * total at that x), and `AreaTrace` recovers the second only when the layer
 * declares it is stacked, and only when every band shares the layer.
 *
 * Rows are emitted as each series authored them rather than padded to a common
 * length. `AreaTrace` keys its column totals by the x value, so a band that
 * starts late contributes nothing to the columns it does not cover — whereas
 * padding it with zeros would announce a sample the chart never drew.
 *
 * `step` is deliberately not carried through. A layer holds one trace type,
 * and the fill is the more consequential half of a stepped area: reading a
 * stacked one as a step layer would drop the totals entirely.
 */
function convertAreaSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  // A lone band has nothing to stack on, so it reads as a plain area whatever
  // the chart's stacking option says — the same call `convertBarGroup` makes
  // for a single bar series.
  const stacking = seriesList.length === 1
    ? undefined
    : resolveGroupStacking(seriesList, chart);
  const isNormalized = stacking === 'percent';
  const traceType = isNormalized
    ? TraceType.NORMALIZED_AREA
    : (stacking === 'normal' ? TraceType.STACKED_AREA : TraceType.AREA);

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        // A band's OWN value, never the accumulated edge — `AreaTrace` sums
        // the rows itself. On a percent stack Highcharts has already reduced
        // each point to its share, which is the magnitude the chart draws.
        y: (isNormalized ? p.percentage ?? p.y : p.y) as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];

  // Use a combined title for multi-band layers so all series are represented.
  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: traceType,
    title: layerTitle,
    // An area series still renders the `path.highcharts-graph` its top edge
    // traces, alongside the `path.highcharts-area` fill; `AreaTrace` inherits
    // `LineTrace`'s path parsing, so the graph is what it needs.
    selectors: lineSelectors(containerId, seriesList.map(s => s.index)),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * Converts a polar chart's series into one radar or polar area layer.
 *
 * The payload is a multi-line layer's — a row per series, a column per spoke —
 * because that is what the chart is: `RadarTrace` extends `LineTrace` and
 * navigates it identically. What the circle adds is where each spoke sits, and
 * the trace derives that from the column count rather than from the data, so
 * the adapter has nothing extra to supply.
 *
 * The two trace types differ only in the mark. A radar joins the values into a
 * closed outline (`line`, `spline`, or an `area` whose fill is one more way of
 * drawing the same outline); a polar area draws each as a wedge whose radius
 * is the value. That difference is entirely in the selectors — an outline is
 * one path per series, a wind rose one arc per spoke — and in what the chart
 * announces itself as.
 */
function convertRadialSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  traceType: TraceType.RADAR | TraceType.POLAR_AREA,
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
  const indices = seriesList.map(s => s.index);

  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: indices.map(String).join('-'),
    type: traceType,
    title: layerTitle,
    selectors: traceType === TraceType.POLAR_AREA
      ? polarAreaSelectors(containerId, indices)
      : lineSelectors(containerId, indices),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * What a parallel coordinates plot's two dimensions are called.
 *
 * Neither is an axis of the chart. The columns ARE the axes — one per variable
 * — so `axes.x` names what a column is rather than naming one of them, and
 * there is no single value axis to read `axes.y` from: every column is
 * measured in its own units, which is the whole point of the chart.
 */
const PARALLEL_AXIS_AXIS = 'Axis';
const PARALLEL_VALUE_AXIS = 'Value';

/**
 * What a parallel coordinates column is called.
 *
 * Highcharts draws these names as the x axis' category labels — its own
 * documentation says so: "visually the parallel coordinates titles are done
 * through `xAxis.categories`" — so the label is already on the point, and the
 * per-axis `title.text` defaults to the empty string. An author who titled the
 * axes instead is honoured through the fallback, and a chart that named them
 * nowhere falls back to the column's position.
 *
 * @param point - The value being named
 * @param chart - The chart, for its per-variable y axes
 * @returns The column's name
 */
function parallelColumnLabel(
  point: HighchartsPoint,
  chart: HighchartsChart,
): string | number {
  if (point.category !== undefined) {
    return point.category;
  }
  const axisTitle = chart.yAxis?.[Math.round(point.x)]?.options?.title?.text;
  return axisTitle || pointLabel(point);
}

/**
 * Converts a parallel coordinates chart's series into one layer.
 *
 * In this mode Highcharts binds every series to the same axis pair and plots
 * each point against `chart.yAxis[i]` instead — one axis per variable, one
 * series per observation. So the payload is the multi-line one again, a row
 * per observation and a column per variable, and `ParallelTrace` (a
 * `LineTrace` too) navigates it the same way.
 *
 * Nothing is normalised here. The trace computes each column's extent itself
 * and pitches a value against its OWN axis, which is what makes the chart
 * audible: scaled against one range for the layer, a reader would hear which
 * variable uses bigger numbers rather than where an observation sits.
 */
function convertParallelSeries(
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
        x: parallelColumnLabel(p, chart),
        y: p.y as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];
  const indices = seriesList.map(s => s.index);

  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: indices.map(String).join('-'),
    type: TraceType.PARALLEL,
    title: layerTitle,
    selectors: lineSelectors(containerId, indices),
    axes: {
      x: { label: PARALLEL_AXIS_AXIS },
      y: { label: PARALLEL_VALUE_AXIS },
    },
    data,
  };
}

/**
 * Whether a scatter series is plotted against category ticks — a Cleveland dot
 * plot rather than a scatter of two continuous variables.
 *
 * The distinction decides which trace type reads it honestly. A
 * {@link ScatterPoint} carries a strictly numeric `x`, so a category-axis
 * scatter converted as SCATTER announces the tick INDEX and drops the label
 * the chart prints beneath it; {@link TraceType.DOT} carries
 * {@link BarPoint}s, whose `x` is that label.
 */
function isCategoryScatter(series: HighchartsSeries): boolean {
  return (series.xAxis?.categories?.length ?? 0) > 0;
}

/**
 * Converts a category-axis `scatter` series into a dot-plot layer.
 *
 * A dot plot is a bar chart drawn with a point where the bar would end, so the
 * payload is the {@link BarPoint}s {@link convertSingleBar} builds — the
 * category and its value — and MAIDR reads it with the same trace.
 */
function convertDotSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.DOT,
    title: series.name || undefined,
    // The marks are ordinary scatter markers, hidden tracker twins included.
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a `lollipop` series into a lollipop layer.
 *
 * A lollipop is a bar thinned to a stem with a marker at its value, so the
 * payload is again {@link convertSingleBar}'s: the stem is what the mark looks
 * like, not a second magnitude.
 */
function convertLollipopSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.LOLLIPOP,
    title: series.name || undefined,
    selectors: lollipopSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * What a funnel's two dimensions are called. Like a pie, a funnel series is
 * bound to no axis, so {@link getAxisLabel}'s `'X'` / `'Y'` fallback would
 * name them after coordinates the chart does not have.
 */
const FUNNEL_STAGE_AXIS = 'Stage';
const FUNNEL_COUNT_AXIS = 'Count';

/**
 * Converts a `funnel` or `pyramid` series into a funnel layer.
 *
 * A pyramid is the same series drawn without a neck and flipped, so it carries
 * the same stages in the same declared order and reads the same way.
 *
 * The adapter supplies stage/count pairs and nothing else: the retention
 * between adjacent stages — the number a funnel is actually read for — is
 * arithmetic `FunnelTrace` does itself, so declared order is the whole of what
 * it needs from here. Highcharts draws the segments in `series.data` order,
 * so stage *k* is segment *k*; a valueless point is dropped rather than kept
 * as a gap, because no segment is drawn for it and keeping it would slide
 * every later stage's highlight onto its neighbour.
 */
function convertFunnelSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y != null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.FUNNEL,
    title: series.name || undefined,
    selectors: funnelSelector(containerId, series.index),
    axes: {
      x: { label: FUNNEL_STAGE_AXIS },
      y: { label: FUNNEL_COUNT_AXIS },
    },
    data,
  };
}

/**
 * What a word cloud's two dimensions are called — it is bound to no axis
 * either, and `weight` is the option Highcharts names the magnitude with.
 */
const WORD_CLOUD_TERM_AXIS = 'Term';
const WORD_CLOUD_WEIGHT_AXIS = 'Weight';

/**
 * Converts a `wordcloud` series into a word cloud layer.
 *
 * Terms are emitted heaviest first, and that ordering is load-bearing rather
 * than cosmetic. `WordcloudSeries#drawPoints` sorts a copy of its points by
 * descending weight before drawing, so the glyphs land in the DOM in weight
 * order — while `WordCloudTrace` pairs the glyph at document position *i* with
 * the term authored at index *i*. Emitting the terms as the chart declared
 * them would therefore announce one word and highlight another, with the
 * audio, text and braille all still correct. Sorting here with the comparator
 * Highcharts uses (both sorts are stable, so ties agree too) makes the two
 * orders the same one.
 *
 * The weight lives in `point.weight` because the series declares
 * `pointArrayMap: ['weight']`; `y` is the fallback for a hand-built point.
 */
function convertWordCloudSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: WordCloudPoint[] = series.data
    .filter(p => (p.weight ?? p.y) !== null)
    .map(p => ({
      x: String(pointLabel(p)),
      y: (p.weight ?? p.y) as number,
    }))
    .sort((a, b) => Number(b.y) - Number(a.y));

  return {
    id: String(series.index),
    type: TraceType.WORD_CLOUD,
    title: series.name || undefined,
    selectors: wordCloudSelector(containerId, series.index),
    axes: {
      x: { label: WORD_CLOUD_TERM_AXIS },
      y: { label: WORD_CLOUD_WEIGHT_AXIS },
    },
    data,
  };
}

/**
 * What a flow diagram's two dimensions are called. A sankey, a dependency
 * wheel and an arc diagram are all bound to no axis, and `weight` is the
 * option Highcharts declares a link's magnitude with.
 */
const FLOW_NODE_AXIS = 'Node';
const FLOW_WEIGHT_AXIS = 'Weight';

/**
 * Converts a `sankey`, `dependencywheel` or `arcdiagram` series into a flow
 * layer.
 *
 * All three are the same weighted graph — `DependencyWheelSeries` and
 * `ArcDiagramSeries` both extend `SankeySeries` — declared as one point per
 * link carrying `from`, `to` and `weight`. Only the emitted trace type
 * differs, so the chart announces itself as the form the author drew; MAIDR
 * reads all of them with `FlowTrace`.
 *
 * The nodes are deliberately not read off `series.nodes`. MAIDR derives them
 * from the links by design, and a second list would be a second source of
 * truth for something the links already say.
 *
 * A link Highcharts draws no ribbon for is dropped rather than carried as a
 * gap, the same call the pie and funnel converters make: `SankeySeries#translate`
 * skips a link whose weight is zero or falsy (#12453), so keeping it would
 * slide every later ribbon's highlight onto its neighbour.
 */
function convertFlowSeries(
  series: HighchartsSeries,
  containerId: string,
  traceType: TraceType.SANKEY | TraceType.CHORD,
): MaidrLayer {
  const data: FlowPoint[] = series.data
    .filter(p => p.from != null && p.to != null && Boolean(p.weight))
    .map(p => ({
      source: p.from as string | number,
      target: p.to as string | number,
      value: p.weight as number,
    }));

  return {
    id: String(series.index),
    type: traceType,
    title: series.name || undefined,
    selectors: flowSelector(containerId, series.index),
    axes: {
      x: { label: FLOW_NODE_AXIS },
      y: { label: FLOW_WEIGHT_AXIS },
    },
    data,
  };
}

/**
 * What a network's two dimensions are called. A force-directed graph is bound
 * to no axis either, and what a reader is after at a node is its degree.
 */
const NETWORK_NODE_AXIS = 'Node';
const NETWORK_LINK_AXIS = 'Links';

/**
 * Converts a `networkgraph` series into a network layer.
 *
 * A network graph declares its links exactly as a sankey does minus the
 * weight — `pointArrayMap: ['from', 'to']` — and that pair is the whole
 * payload. Where the force solver dropped each node is deliberately not
 * carried: the position is a fact about the solver's seed rather than about
 * the data, and MAIDR's `NetworkPoint` has nowhere to put it for that reason.
 *
 * A link naming a node that was never declared is still a link: Highcharts
 * creates the missing node from the reference, so only a link missing an end
 * entirely is dropped.
 */
function convertNetworkSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: NetworkPoint[] = series.data
    .filter(p => p.from != null && p.to != null)
    .map(p => ({
      source: p.from as string | number,
      target: p.to as string | number,
    }));

  return {
    id: String(series.index),
    type: TraceType.NETWORK,
    title: series.name || undefined,
    selectors: networkSelector(containerId, series.index),
    axes: {
      x: { label: NETWORK_NODE_AXIS },
      y: { label: NETWORK_LINK_AXIS },
    },
    data,
  };
}

/**
 * What a hierarchy's two dimensions are called — a treemap and a sunburst are
 * bound to no axis, so `getAxisLabel`'s `'X'` / `'Y'` fallback would name them
 * after coordinates neither chart has.
 */
const TREE_NODE_AXIS = 'Node';
const TREE_VALUE_AXIS = 'Value';

/**
 * What a treemap or sunburst node is called.
 *
 * Highcharts separates identity (`id`, referenced by a child's `parent`) from
 * display (`name`), and MAIDR's tree is addressed by the displayed name, so
 * that is what is emitted — falling back to the id, then to the point's
 * position, for a leaf declared with neither.
 */
function treeNodeLabel(point: HighchartsPoint): string | number {
  return point.name ?? point.id ?? point.index;
}

/**
 * Converts a `treemap` or `sunburst` series into a hierarchy layer.
 *
 * Highcharts declares the tree with `id` / `parent` pointers on each node,
 * while MAIDR declares it as a path — a node's ancestors, root first, itself
 * excluded — so the converter walks each node's `parent` chain upward and
 * materialises it. The walk stops at a parent id that was never declared,
 * which Highcharts tolerates by attaching the node to the root, and refuses to
 * revisit a node it has already passed so a cyclic `parent` cannot loop.
 *
 * Interior nodes are emitted with whatever value they declared, or with none
 * at all: `TreemapTrace` derives an undeclared interior total from the
 * children the paths give it, and keeps a declared one that disagrees, since a
 * parent may carry mass no child accounts for.
 */
function convertTreeSeries(
  series: HighchartsSeries,
  containerId: string,
  traceType: TraceType.TREEMAP | TraceType.SUNBURST,
): MaidrLayer {
  const byId = new Map<string, HighchartsPoint>();
  for (const point of series.data) {
    if (point.id !== undefined) {
      byId.set(point.id, point);
    }
  }

  const data: TreemapPoint[] = series.data.map(point => ({
    x: treeNodeLabel(point),
    ...(typeof point.value === 'number' ? { y: point.value } : {}),
    path: ancestorsOf(point, byId, series.name),
  }));

  // Stamp each rendered node so the per-node selectors can address it. The
  // rectangles are filed into one group per depth, ordered by z-index rather
  // than by declaration, so document order cannot be indexed into.
  stampTreeIndices(series);

  return {
    id: String(series.index),
    type: traceType,
    title: series.name || undefined,
    selectors: treemapSelectors(containerId, series.index, data.length),
    axes: {
      x: { label: TREE_NODE_AXIS },
      y: { label: TREE_VALUE_AXIS },
    },
    data,
  };
}

/**
 * The names of a node's ancestors, root first and the node itself excluded.
 *
 * @param point - The node to trace back from
 * @param byId - Every declared node, keyed by its Highcharts id
 * @param seriesName - The owning series, for the cycle warning
 * @returns The path MAIDR addresses the node by, empty at the top level
 */
function ancestorsOf(
  point: HighchartsPoint,
  byId: Map<string, HighchartsPoint>,
  seriesName: string,
): (string | number)[] {
  const path: (string | number)[] = [];
  // Seeded with the node itself so a point declaring itself as its own parent
  // stops here rather than naming itself as its own ancestor.
  const seen = new Set<string>(point.id === undefined ? [] : [point.id]);

  let at = point;
  while (at.parent) {
    if (seen.has(at.parent)) {
      console.warn(
        `[MAIDR Highcharts] Series "${seriesName}": node "${treeNodeLabel(point)}" `
        + `has a cyclic parent chain; its path stops at "${at.parent}".`,
      );
      break;
    }
    seen.add(at.parent);
    const parent = byId.get(at.parent);
    if (!parent) {
      // Highcharts attaches a node whose parent was never declared to the
      // root, so the path ends here rather than naming a node that does not
      // exist.
      break;
    }
    path.unshift(treeNodeLabel(parent));
    at = parent;
  }

  return path;
}

/**
 * Stamps each rendered treemap or sunburst node with `data-maidr-node-index`,
 * the node's position in `series.data`.
 *
 * `TreemapSeries#drawPoints` files every rectangle into a `level-group-N`
 * container whose `zIndex` is the negated depth, so the DOM is grouped by
 * depth with the deepest level first — document order carries no information
 * about declaration order, which is what the selectors have to be indexed by.
 *
 * Nodes without a rendered `graphic` (hidden below the current root, or drawn
 * away by a drilldown) are skipped; `TreemapTrace` then finds fewer elements
 * than nodes and withdraws the layer's highlighting rather than pairing
 * announcements with the wrong rectangles.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 */
function stampTreeIndices(series: HighchartsSeries): void {
  stampPointIndices([series.data], 'data-maidr-node-index');
}

/**
 * Stamps a running index onto each point's rendered element, counted across
 * the groups in order.
 *
 * Several trace types need this — a treemap, a gantt, a hexbin — for the same
 * reason: MAIDR indexes their selector lists by the order it reads the data
 * in, and Highcharts draws in an order of its own. What differs between them
 * is only the order the groups arrive in and the attribute name, so the walk
 * itself lives here.
 *
 * A point Highcharts did not draw carries no `graphic` and is skipped rather
 * than shifting the indices, so the missing element makes its own selector
 * match nothing instead of pairing every later point with a neighbour's mark.
 *
 * @param groups - The points, in the order MAIDR reads them
 * @param attribute - The data attribute the selectors address
 */
function stampPointIndices(groups: HighchartsPoint[][], attribute: string): void {
  let index = 0;
  for (const group of groups) {
    for (const point of group) {
      point.graphic?.element.setAttribute(attribute, String(index));
      index++;
    }
  }
}

/**
 * What a gauge's category dimension is called. The measure has a value axis
 * and reads its title from there, but the name of the thing being measured is
 * the series' own and belongs to no axis.
 */
const GAUGE_MEASURE_AXIS = 'Measure';

/**
 * Converts a `gauge`, `solidgauge` or `bullet` series into a gauge layer.
 *
 * The payload is a single object rather than an array, because the chart draws
 * exactly one measure. The reading alone is not the announcement: the dial's
 * ends come from the value axis' extremes, a bullet's target marker from the
 * point, and the qualitative bands from the axis' plot bands — none of which
 * a reader can recover from the number.
 *
 * A series carrying several dials is read as its first: MAIDR's gauge is one
 * measure against one range, and there is no shape here for a second.
 */
function convertGaugeSeries(
  series: HighchartsSeries,
  containerId: string,
  seriesType: string,
): MaidrLayer | null {
  const readings = series.data.filter(p => typeof p.y === 'number');
  const point = readings[0];
  if (!point) {
    console.warn(
      `[MAIDR Highcharts] Gauge series "${series.name}" has no numeric value; skipping.`,
    );
    return null;
  }
  if (readings.length > 1) {
    console.warn(
      `[MAIDR Highcharts] Gauge series "${series.name}" declares ${readings.length} `
      + `dials; reading the first. A gauge layer carries one measure.`,
    );
  }

  const { min, max } = series.yAxis?.getExtremes() ?? { min: 0, max: 0 };
  const bands = gaugeBands(series.yAxis);

  const data: GaugePoint = {
    value: point.y as number,
    min,
    max,
    ...(series.name ? { label: series.name } : {}),
    ...(typeof point.target === 'number' ? { target: point.target } : {}),
    ...(bands.length > 0 ? { bands } : {}),
  };

  return {
    id: String(series.index),
    type: TraceType.GAUGE,
    title: series.name || undefined,
    selectors: gaugeSelectorFor(seriesType, containerId, series.index),
    axes: {
      x: { label: GAUGE_MEASURE_AXIS },
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * The selector for a gauge's own mark, which differs by how the chart draws
 * the reading: a needle, a filled arc, or a bar beside a target.
 */
function gaugeSelectorFor(
  seriesType: string,
  containerId: string,
  seriesIndex: number,
): string {
  if (seriesType === 'solidgauge') {
    return solidGaugeSelector(containerId, seriesIndex);
  }
  if (seriesType === 'bullet') {
    return bulletSelector(containerId, seriesIndex);
  }
  return gaugeSelector(containerId, seriesIndex);
}

/**
 * Reads a value axis' plot bands as MAIDR's qualitative gauge bands.
 *
 * MAIDR carries only each band's upper edge, so the bands are sorted
 * ascending: a band starts where the previous one ended, and an unsorted list
 * would describe a partition the chart does not draw. A band Highcharts leaves
 * open-ended has no edge to carry and is dropped.
 *
 * Highcharts bands are usually drawn in colour and named nowhere, so a band
 * with neither a label nor a styled-mode class name is numbered by its
 * position. That says where in the partition the reading landed, which is what
 * the band is read for, without inventing a meaning the chart never gave it.
 */
function gaugeBands(axis: HighchartsAxis | undefined): GaugeBand[] {
  const plotBands = axis?.options?.plotBands ?? [];
  return plotBands
    .filter(band => typeof band.to === 'number')
    .sort((a, b) => (a.to as number) - (b.to as number))
    .map((band, index) => ({
      to: band.to as number,
      label: band.label?.text ?? band.className ?? `Band ${index + 1}`,
    }));
}

/**
 * Converts a `waterfall` series into a waterfall layer.
 *
 * Highcharts declares only what each step contributes; MAIDR's step carries
 * the absolute positions the bar floats between as well, so the converter
 * accumulates the running total as it walks the series — the same job
 * `WaterfallSeries#processData` does to place the bars.
 *
 * The two kinds of restating bar are placed the way Highcharts draws them
 * rather than uniformly. A `isSum` step is drawn from the baseline up to the
 * running total, so that is its span; an `isIntermediateSum` step is drawn
 * from the previous subtotal's edge to the current running total, which is why
 * the converter tracks that edge separately. Both are `total` steps: they
 * restate a number rather than contribute one, and `WaterfallTrace` leaves
 * them out of "largest contribution" for that reason.
 *
 * A step Highcharts draws no bar for — neither a number nor a sum — is dropped
 * rather than carried as a gap, since keeping it would slide every later
 * step's highlight onto its neighbour.
 */
function convertWaterfallSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: WaterfallPoint[] = [];

  // Where the chart has got to, and where the last subtotal bar's far edge
  // sits — the two baselines a waterfall's bars are drawn from.
  let running = 0;
  let subtotalEdge = 0;

  for (const p of series.data) {
    const isTotal = p.isSum === true || p.isIntermediateSum === true;
    if (!isTotal && typeof p.y !== 'number') {
      continue;
    }

    let start: number;
    let kind: WaterfallKind;
    if (p.isSum === true) {
      start = 0;
      kind = 'total';
    } else if (p.isIntermediateSum === true) {
      start = subtotalEdge;
      subtotalEdge = running;
      kind = 'total';
    } else {
      start = running;
      running += p.y as number;
      kind = (p.y as number) >= 0 ? 'increase' : 'decrease';
    }

    data.push({
      x: pointLabel(p),
      start,
      end: running,
      delta: running - start,
      kind,
    });
  }

  return {
    id: String(series.index),
    type: TraceType.WATERFALL,
    title: series.name || undefined,
    selectors: waterfallSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * The series an error bar takes its estimates from, when it names one.
 *
 * Highcharts resolves `linkedTo` into `series.linkedParent` before it renders,
 * so that is read first; the option itself is the fallback for the partially
 * built chart objects the adapter is sometimes handed, and supports both forms
 * Highcharts accepts — `':previous'` and another series' `id`.
 *
 * @param series - The error bar series
 * @param chart - The chart holding the candidates
 * @returns The parent series, or undefined for an unlinked error bar
 */
function linkedParentOf(
  series: HighchartsSeries,
  chart: HighchartsChart,
): HighchartsSeries | undefined {
  if (series.linkedParent) {
    return series.linkedParent;
  }
  const linkedTo = series.options.linkedTo;
  if (typeof linkedTo !== 'string') {
    return undefined;
  }
  return linkedTo === ':previous'
    ? chart.series[series.index - 1]
    : chart.series.find(candidate => candidate.options.id === linkedTo);
}

/**
 * The series whose values an error bar layer already announces.
 *
 * A linked error bar and its parent draw one thing between them: the parent
 * places the estimate and the error bar draws the interval around it, and
 * MAIDR's `ErrorBarPoint` carries both. Emitting the parent as a bar layer as
 * well would announce the same estimates twice, in a layer that has lost the
 * interval — so it is dropped, but ONLY when the error bar covers every sample
 * it drew. A parent with samples the error bar skips keeps its own layer, so
 * that no sample goes unannounced.
 *
 * @param seriesList - The panel's series
 * @param chart - The chart, for resolving `linkedTo`
 * @returns The parents to leave out of the other buckets
 */
function seriesReadAsErrorBars(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
): Set<HighchartsSeries> {
  const parents = new Set<HighchartsSeries>();
  for (const series of seriesList) {
    if (resolveSeriesType(series, chart) !== 'errorbar') {
      continue;
    }
    const parent = linkedParentOf(series, chart);
    if (!parent) {
      continue;
    }
    const measured = new Set(series.data.filter(isDrawnErrorBar).map(p => p.x));
    const covered = parent.data.every(p => typeof p.y !== 'number' || measured.has(p.x));
    if (covered) {
      parents.add(parent);
    }
  }
  return parents;
}

/**
 * Whether Highcharts draws a whip for an error bar point.
 *
 * `ErrorBarSeries` declares `pointValKey: 'high'`, so the upper bound is what
 * places the point: without it there is no `plotY`, `BoxPlotSeries#drawPoints`
 * skips the point entirely, and no element is rendered.
 *
 * @param point - The error bar point
 * @returns True when the chart drew it
 */
function isDrawnErrorBar(point: HighchartsPoint): boolean {
  return typeof point.high === 'number';
}

/**
 * Converts an `errorbar` series into an error bar layer.
 *
 * The two halves of the reading come from two different series. Highcharts
 * puts the interval on the error bar (`low` and `high`, absolute positions on
 * the value axis, which is the form MAIDR wants) and leaves the ESTIMATE in
 * the series the error bar is linked to — normally the column or scatter it is
 * drawn over. So the converter resolves that parent and zips the two together
 * by `x`, which is what makes one layer carrying all three magnitudes.
 *
 * An unlinked error bar still reads: the midpoint of the interval is where the
 * chart puts the estimate visually, so that is what is announced, and a reader
 * hears the same three numbers the chart drew. What is lost is only an
 * estimate placed off-centre, which an unlinked series never showed.
 *
 * A point Highcharts drew no whip for is dropped rather than carried as a gap,
 * for the reason the pie and funnel converters drop one: keeping it would
 * slide every later whip's highlight onto its neighbour.
 */
function convertErrorBarSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const parent = linkedParentOf(series, chart);
  const estimates = new Map<number, number>();
  for (const point of parent?.data ?? []) {
    if (typeof point.y === 'number') {
      estimates.set(point.x, point.y);
    }
  }

  const data: ErrorBarPoint[] = series.data
    .filter(isDrawnErrorBar)
    .map((p) => {
      const high = p.high as number;
      const low = typeof p.low === 'number' ? p.low : undefined;
      return {
        x: pointLabel(p),
        y: estimates.get(p.x) ?? (low === undefined ? high : (low + high) / 2),
        ...(low === undefined ? {} : { yMin: low }),
        yMax: high,
      };
    });

  return {
    id: String(series.index),
    type: TraceType.ERROR_BAR,
    title: series.name || parent?.name || undefined,
    ...(chart.options.chart?.inverted === true
      ? { orientation: Orientation.HORIZONTAL }
      : {}),
    selectors: errorBarSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a `dumbbell` series into a dumbbell layer.
 *
 * The payload is a single object rather than an array, because the names of
 * the two ends belong to the chart and not to any one row. Highcharts names
 * them nowhere — a dumbbell point declares a `low` and a `high` and nothing
 * that says what either one is — so they come from the adapter's own options,
 * and MAIDR falls back to "start" and "end" when they are not supplied.
 *
 * `low` is the start: it is the first value in a dumbbell's `[x, low, high]`
 * tuple, and the reference end a chart of change is read from. Which of the
 * two is larger is not fixed and is not assumed anywhere — a dumbbell showing
 * a decline draws its end below its start.
 *
 * The change between the two ends is deliberately not computed here.
 * `DumbbellTrace` derives it from the pair, so an authored one would be a
 * second source of truth for a number the segment already draws.
 *
 * A row missing either end is dropped, since neither `start` nor `end` has
 * anywhere to be absent. Highcharts still draws that row's connector — it
 * creates one per declared point, with or without a path — so MAIDR then finds
 * more connectors than rows and withdraws the layer's highlighting rather than
 * pairing announcements with the wrong segments.
 */
function convertDumbbellSeries(
  series: HighchartsSeries,
  containerId: string,
  options?: HighchartsAdapterOptions,
): MaidrLayer {
  const points: DumbbellPoint[] = series.data
    .filter(p => typeof p.low === 'number' && typeof p.high === 'number')
    .map(p => ({
      x: pointLabel(p),
      start: p.low as number,
      end: p.high as number,
    }));

  const { start, end } = options?.dumbbellLabels ?? {};
  const data: DumbbellData = {
    points,
    ...(start ? { startLabel: start } : {}),
    ...(end ? { endLabel: end } : {}),
  };

  return {
    id: String(series.index),
    type: TraceType.DUMBBELL,
    title: series.name || undefined,
    selectors: dumbbellSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * What MAIDR calls a unit of a datetime axis.
 *
 * A Highcharts datetime axis counts milliseconds, and an interval's length is
 * a difference along it, so that is the unit — announced rather than converted
 * because `start` and `end` have to stay in the axis' own numbers for the
 * panning to place them where the chart draws them.
 */
const GANTT_DATETIME_UNIT = 'ms';

/**
 * Converts a `gantt` or `xrange` series into a gantt layer.
 *
 * The payload is nested by lane, and that nesting is the reason the shape is
 * an object rather than a flat list: a lane with nothing booked is a real
 * statement about a schedule, and only a nested list can make it. Highcharts
 * draws the intervals in `series.data` order, which interleaves lanes freely,
 * so the converter regroups them — and stamps the DOM in the regrouped order,
 * since MAIDR slices its selector list lane by lane.
 *
 * The lanes come from the y axis' categories, which both series types supply:
 * an xrange declares them outright, and a Gantt chart's tree grid axis builds
 * them from the tasks. Failing that they are numbered, so a chart drawn
 * against a bare numeric axis still navigates.
 *
 * A milestone has no end — Highcharts draws it as a diamond rather than a bar
 * — so it becomes a zero-length interval at its own instant, which is what the
 * chart shows.
 */
function convertGanttSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const categories = series.yAxis?.categories ?? [];

  // Group the intervals by lane, keeping the order each lane declared them in.
  const laneSources: HighchartsPoint[][] = [];
  const laneOf = (point: HighchartsPoint): number =>
    (typeof point.y === 'number' ? Math.round(point.y) : -1);
  const laneCount = Math.max(
    categories.length,
    ...series.data.map(point => laneOf(point) + 1),
    0,
  );
  for (let lane = 0; lane < laneCount; lane++) {
    laneSources.push(series.data.filter(point => laneOf(point) === lane));
  }

  const lanes: (string | number)[] = Array.from(
    { length: laneCount },
    (_, lane) => categories[lane] ?? lane,
  );

  const data: GanttData = {
    points: laneSources.map((lane, index) => lane.map(point => ({
      x: lanes[index],
      start: point.x,
      end: point.x2 ?? point.x,
      ...(point.name ? { label: point.name } : {}),
    } satisfies GanttPoint))),
    lanes,
    ...(isDatetimeAxis(series.xAxis) ? { unit: GANTT_DATETIME_UNIT } : {}),
  };

  stampGanttIndices(laneSources);

  return {
    id: String(series.index),
    type: TraceType.GANTT,
    title: series.name || undefined,
    // A gantt runs its bars along x with its lanes down y, which is the
    // opposite of MAIDR's default, so the axis labels have to be swapped back.
    orientation: Orientation.HORIZONTAL,
    selectors: ganttSelectors(containerId, series.index, laneSources.flat().length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Whether an axis counts time rather than plain numbers.
 *
 * Highcharts Gantt forces `type: 'datetime'` onto its x axes; an xrange may or
 * may not, so both the runtime flag and the declared option are read.
 *
 * @param axis - The axis to inspect
 * @returns True when its values are timestamps
 */
function isDatetimeAxis(axis: HighchartsAxis | undefined): boolean {
  return axis?.isDatetimeAxis === true || axis?.options?.type === 'datetime';
}

/**
 * Stamps each rendered gantt or xrange interval with `data-maidr-task-index`,
 * its position in the lane-major order MAIDR reads the lanes in.
 *
 * Highcharts draws the intervals in `series.data` order, so a chart whose
 * tasks were declared by date rather than by lane puts them in the DOM
 * interleaved — and `GanttTrace` slices its elements lane by lane. Document
 * order therefore cannot be indexed into, exactly as it cannot for a treemap.
 *
 * Stamping the point's own `graphic` also spans the two shapes the series draw
 * with: an ordinary task is a `<g>` wrapping a `<rect>` that repeats its
 * class, a milestone is a bare `<path>`, and the `graphic` is the outermost
 * element in both cases.
 *
 * An interval Highcharts did not draw has no element to stamp, so its selector
 * matches nothing and the layer's highlighting is withdrawn rather than
 * shifted onto its neighbours.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 *
 * @param laneSources - The Highcharts points, grouped by lane
 */
function stampGanttIndices(laneSources: HighchartsPoint[][]): void {
  stampPointIndices(laneSources, 'data-maidr-task-index');
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

/**
 * The scatter series a caller declared as one volcano or Manhattan plot.
 *
 * Named by Highcharts series index, since that is what the rest of the
 * adapter's options are keyed by, and defaulting to every scatter series in
 * the panel — a Manhattan is drawn as one series per chromosome and read as
 * one cloud.
 *
 * @param seriesList - The panel's convertible series
 * @param chart - The chart, for resolving each series' type
 * @param options - The adapter options carrying the declaration
 * @returns The series to merge into a threshold layer, empty when none
 */
function significancePlotSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  options?: HighchartsAdapterOptions,
): HighchartsSeries[] {
  const declared = options?.significancePlot;
  if (!declared) {
    return [];
  }

  const scatters = seriesList.filter(s => resolveSeriesType(s, chart) === 'scatter');
  if (scatters.length === 0) {
    return [];
  }
  if (!declared.seriesIndices) {
    return scatters;
  }

  const chosen = scatters.filter(s => declared.seriesIndices?.includes(s.index));
  if (chosen.length === 0) {
    console.warn(
      `[MAIDR Highcharts] significancePlot names series ${
        JSON.stringify(declared.seriesIndices)}, none of which is a scatter `
        + `series here; reading this panel's scatters as scatters.`,
    );
  }
  return chosen;
}

/**
 * The thresholds a volcano or Manhattan layer declares.
 *
 * What the caller states wins. Failing that the cutoffs are read from the
 * plot lines the chart already draws across itself, which is the only place
 * either chart says where its threshold is: the significance line runs across
 * the y axis, and a volcano's effect-size pair across the x axis, symmetric
 * about zero — so the magnitude of the first non-zero one is the cutoff.
 *
 * The x-axis reading is a **volcano's only**. A volcano's x is fold change and
 * a line across it is a cutoff, but a Manhattan's x is genomic position, where
 * the plot lines a chart draws are chromosome dividers. Inferring an effect
 * from one would compare every point's position against a divider's coordinate
 * and reject nearly all of them, emptying the significance summary and the
 * rotor filter — the silent failure this whole design exists to avoid. A
 * Manhattan can still carry an `effect`, but only by stating it.
 *
 * A layer that ends up declaring nothing gets no `thresholdOptions` at all,
 * and MAIDR then reads the cloud without making any claim about significance.
 * The direction is passed through only when it was stated: MAIDR reads
 * `above` by default, which suits a -log10(p) axis, and guessing it for a raw
 * p axis would select exactly the points that failed to reach significance.
 *
 * @param series - The series whose axes carry the plot lines
 * @param declared - What the caller stated
 * @returns The threshold options, or undefined when nothing is known
 */
function significanceThresholds(
  series: HighchartsSeries,
  declared: NonNullable<HighchartsAdapterOptions['significancePlot']>,
): ThresholdOptions | undefined {
  const significance = declared.significance
    ?? plotLineValues(series.yAxis).find(value => Number.isFinite(value));
  const effect = declared.effect
    ?? (declared.type === 'volcano'
      ? plotLineValues(series.xAxis).map(Math.abs).find(value => value > 0)
      : undefined);

  const thresholds: ThresholdOptions = {
    ...(typeof significance === 'number' ? { significance } : {}),
    ...(declared.significanceDirection
      ? { significanceDirection: declared.significanceDirection }
      : {}),
    ...(typeof effect === 'number' ? { effect } : {}),
  };
  return Object.keys(thresholds).length > 0 ? thresholds : undefined;
}

/**
 * The numeric values of an axis' plot lines, in declaration order.
 *
 * @param axis - The axis to read
 * @returns Every plot line value that is a finite number
 */
function plotLineValues(axis: HighchartsAxis | undefined): number[] {
  return (axis?.options?.plotLines ?? [])
    .map(line => line.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

/**
 * Converts the declared `scatter` series into one volcano or Manhattan layer.
 *
 * Both charts are scatters read through a threshold, so the payload is the
 * scatter's coordinates plus the two things a scatter has nowhere to carry:
 * what each point **is**, and which region it belongs to. Identity is the
 * payload on these charts — a reader told "x is 2.3, y is 14.1" has been given
 * the two numbers the axes already describe and withheld the gene — so the
 * point's name travels as the label, and the series name as the group, which
 * on a Manhattan is the chromosome.
 *
 * The series are merged rather than layered because the threshold spans all of
 * them: a Manhattan is one cloud drawn as twenty-two series, and a volcano
 * split into up- and down-regulated series is one cloud too. A merged layer
 * takes no title from a single series, since none of them names the whole.
 *
 * A point with no y is dropped: Highcharts draws no marker for it, so keeping
 * it would slide every later point's highlight onto its neighbour.
 */
function convertSignificanceSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  declared: NonNullable<HighchartsAdapterOptions['significancePlot']>,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: VolcanoPoint[] = seriesList.flatMap((series) => {
    // The series is the region: on a Manhattan it is the chromosome, on a
    // volcano the regulation class the points were split into.
    const group = series.name || undefined;
    return series.data
      .filter(p => typeof p.y === 'number')
      .map(p => ({
        x: p.x,
        y: p.y as number,
        ...(p.name ? { label: p.name } : {}),
        ...(group ? { group } : {}),
      }));
  });

  const first = seriesList[0];
  const thresholds = significanceThresholds(first, declared);

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: declared.type === 'manhattan' ? TraceType.MANHATTAN : TraceType.VOLCANO,
    title: seriesList.length === 1 ? first.name || undefined : undefined,
    selectors: volcanoSelector(containerId, seriesList.map(s => s.index)),
    ...(thresholds ? { thresholdOptions: thresholds } : {}),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * What a pie's two dimensions are called. A pie series is bound to no axis, so
 * {@link getAxisLabel}'s `'X'` / `'Y'` fallback would name them after
 * coordinates a pie does not have; these name what each one actually holds.
 */
const PIE_LABEL_AXIS = 'Label';
const PIE_VALUE_AXIS = 'Value';

/**
 * Converts a `pie` series — a doughnut is the same series type with an
 * `innerSize`, and reads identically — into a pie layer.
 *
 * Highcharts draws the wedges in `series.data` order, so slice k is wedge k
 * with no reordering to undo. A point with no value is dropped rather than
 * carried through as a gap, because Highcharts draws no wedge for it: keeping
 * it would slide every later slice's highlight onto its neighbour.
 */
function convertPieSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: PiePoint[] = series.data
    .filter(p => p.y != null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.PIE,
    title: series.name || undefined,
    selectors: pieSelector(containerId, series.index),
    axes: {
      x: { label: PIE_LABEL_AXIS },
      y: { label: PIE_VALUE_AXIS },
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

/**
 * What a hexbin's third dimension is called. A tile's magnitude is bound to
 * the colour axis rather than to x or y, so {@link getAxisLabel} has nothing
 * to read it from, and MAIDR's own fallback names it "Level".
 */
const HEXBIN_COUNT_AXIS = 'Count';

/**
 * Converts a `tilemap` series into a hexbin layer.
 *
 * A tilemap is a heatmap whose tiles tessellate, and every shape but `square`
 * staggers: `TilemapShapes.hexagon.translate` shifts every odd **column** by
 * half a row so the hexagons interlock. That stagger is what separates this
 * from a heatmap — a lattice row is not a straight line of cells — and it is
 * what {@link TraceType.HEXBIN} is navigated by.
 *
 * Two things this reading is honest about.
 *
 * **Highcharts never binned anything.** The tiles are supplied pre-binned, so
 * a bin's "count" is whatever magnitude the author gave the tile. A tile with
 * no value counts as zero, which is what an empty bin is; Highcharts still
 * draws it, so dropping it would slide every later bin's highlight onto its
 * neighbour.
 *
 * **The centres are the authored ones.** The half-row shift is applied in
 * pixel space during `translate` and never reaches the point, so the tile at
 * `(3, 2)` still belongs to row 2 in every other reading of the chart — the
 * tooltip's included. Announcing a shifted 1.5 would put the bin at a
 * coordinate nothing else on the page agrees with.
 *
 * The bins are grouped into rows by their y and ordered along x within each,
 * because that is the lattice MAIDR walks; rows run in drawn order, so
 * "up" is up on a reversed axis too. `x` stays numeric even where the axis
 * carries categories: `HexbinTrace` resolves a vertical move by x distance,
 * and a category label would make every one of them land on the first bin of
 * the row.
 */
function convertHexbinSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const yCategories = series.yAxis?.categories ?? [];

  // Group the tiles into lattice rows, then order each row along x. Highcharts
  // draws them in `series.data` order, which a tilemap is routinely authored
  // in some other order entirely — a honeycomb map is declared country by
  // country.
  const byRow = new Map<number, HighchartsPoint[]>();
  for (const point of series.data) {
    if (typeof point.y !== 'number') {
      continue;
    }
    const row = Math.round(point.y);
    const tiles = byRow.get(row);
    if (tiles) {
      tiles.push(point);
    } else {
      byRow.set(row, [point]);
    }
  }

  // Row 0 is the bottom of the lattice, which is where MAIDR's "up" moves away
  // from — so a reversed y axis, the way a honeycomb map is usually drawn,
  // orders the rows the other way.
  const ascending = !isReversedAxis(series.yAxis);
  const rows = [...byRow.keys()]
    .sort((a, b) => (ascending ? a - b : b - a))
    .map(row => (byRow.get(row) ?? []).slice().sort((a, b) => a.x - b.x));

  const data: HexbinPoint[][] = rows.map(tiles => tiles.map(point => ({
    x: point.x,
    y: yCategories[Math.round(point.y as number)] ?? (point.y as number),
    count: tileValue(point),
  })));

  stampHexbinIndices(rows);

  return {
    id: String(series.index),
    type: TraceType.HEXBIN,
    title: series.name || undefined,
    selectors: hexbinSelectors(containerId, series.index, rows.flat().length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
      z: { label: HEXBIN_COUNT_AXIS },
    },
    data,
  };
}

/**
 * The magnitude a tilemap tile carries.
 *
 * A tilemap declares `value` in its `pointArrayMap` rather than using `y`, so
 * Highcharts resolves it onto the point; the options are read as a fallback
 * for the partially built chart objects the adapter is sometimes handed.
 *
 * @param point - The tile to read
 * @returns Its value, or zero when it declares none
 */
function tileValue(point: HighchartsPoint): number {
  if (typeof point.value === 'number') {
    return point.value;
  }
  const options = point.options ?? {};
  if (typeof options.value === 'number') {
    return options.value;
  }
  return typeof options.colorValue === 'number' ? options.colorValue : 0;
}

/**
 * Stamps each rendered tile with `data-maidr-bin-index`, its position in the
 * lattice order MAIDR slices its selectors by.
 *
 * `TilemapSeries#drawPoints` runs the column point-drawing pass over
 * `series.points`, so the DOM follows declaration order — which for a tilemap
 * is whatever order the author listed the tiles in, and not the row-by-row
 * order `HexbinTrace` reads. A tile Highcharts did not draw has no element to
 * stamp, so its selector matches nothing and the layer's highlighting is
 * withdrawn rather than shifted onto its neighbours.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 *
 * @param rows - The Highcharts points, grouped into lattice rows
 */
function stampHexbinIndices(rows: HighchartsPoint[][]): void {
  stampPointIndices(rows, 'data-maidr-bin-index');
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
