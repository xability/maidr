/**
 * Data converters for transforming Recharts data format into MAIDR's schema.
 *
 * Recharts uses a flat array of objects where each object represents one
 * data point with named fields:
 *   [{ name: 'Q1', revenue: 100, cost: 50 }, ...]
 *
 * MAIDR uses typed data structures per chart type:
 *   BarPoint[]          = [{ x, y }, ...]
 *   LinePoint[][]       = [[{ x, y, fill? }, ...], ...]
 *   ScatterPoint[]      = [{ x, y }, ...]
 *   SegmentedPoint[][]  = [[{ x, y, fill }, ...], ...]  (stacked/dodged/normalized)
 *   HistogramPoint[]    = [{ x, y, xMin, xMax, yMin, yMax }, ...]
 *   PiePoint[]          = [{ x, y }, ...]                (flat, one per slice)
 *   ErrorBarPoint[]     = [{ x, y, yMin?, yMax? }, ...]  (bounds are ABSOLUTE)
 *   ForestPoint[]       = [{ x, y, yMin?, yMax?, weight?, pooled? }, ...]
 *   VolcanoPoint[]      = [{ x, y, label?, group? }, ...]
 *   SurvivalPoint[][]   = [[{ x, y, censored?, yMin?, yMax? }, ...], ...]
 *   FlowPoint[]         = [{ source, target, value }, ...]
 *   WaterfallPoint[]    = [{ x, start, end, delta, kind }, ...]  (ABSOLUTE totals)
 *   TreemapPoint[]      = [{ x, y?, path? }, ...]        (depth-first pre-order)
 *   GaugePoint          = { value, min, max, ... }       (a single OBJECT)
 *   GanttData           = { points: [[{ x, start, end }]], lanes?, unit? }
 *   DumbbellData        = { points: [{ x, start, end }], startLabel?, endLabel? }
 *   HexbinPoint[][]     = [[{ x, y, count }, ...], ...]  (a staggered LATTICE)
 *   ViolinKdePoint[][]  = [[{ x, y, density }, ...], ...] (one curve per group)
 *   BoxenPoint[]        = [{ z, median, levels, ... }, ...]
 */

import type {
  BarPoint,
  BoxenPoint,
  DumbbellData,
  DumbbellPoint,
  ErrorBarPoint,
  FlowPoint,
  ForestPoint,
  GanttData,
  GanttPoint,
  GaugePoint,
  HexbinPoint,
  HistogramPoint,
  LetterValueLevel,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  SurvivalPoint,
  TreemapPoint,
  ViolinKdePoint,
  VolcanoPoint,
  WaterfallKind,
  WaterfallPoint,
} from '@type/grammar';
import type { RechartsAdapterConfig, RechartsChartType, RechartsLayerConfig, RechartsSubplotConfig } from './types';
import { toCategoryShares } from '@adapters/shared/normalize';
import { cssEscape } from '@adapters/shared/selectorUtil';
import { resolveFieldRef } from '@adapters/shared/traceDeclaration';
import { Orientation, TraceType } from '@type/grammar';
import { getPanelClassSelector, getRechartsSelector, reversedBarSelectors } from './selectors';

/**
 * What a layer carries when its marks run opposite to its payload.
 *
 * Declared here rather than beside its helpers because two builders read it
 * before those are reached, and a `const` is not hoisted the way a function
 * declaration is.
 */
const REVERSED_POINTS = { domMapping: { pointOrder: 'reverse' as const } };

/**
 * Converts a Recharts adapter config into MAIDR's root data structure.
 *
 * @param config - Recharts adapter configuration
 * @returns MaidrData ready to pass to the `<Maidr>` component
 */
export function convertRechartsToMaidr(config: RechartsAdapterConfig): Maidr {
  if (config.subplots) {
    return buildSubplotMaidr(config);
  }

  const layers = buildLayers(config);

  const subplot: MaidrSubplot = {
    layers,
  };

  return {
    id: config.id,
    title: config.title,
    subtitle: config.subtitle,
    caption: config.caption,
    subplots: [[subplot]],
  };
}

/**
 * Normalizes the `subplots` config into a 2D panel grid in row-major
 * visual reading order.
 *
 * A flat array is chunked into rows of `columns` panels (a single row when
 * `columns` is omitted). A 2D array is validated and returned as-is —
 * ragged rows are allowed, empty rows and empty grids are not (the core
 * navigation model cannot represent them).
 */
export function normalizeRechartsSubplotGrid(
  subplots: RechartsSubplotConfig[] | RechartsSubplotConfig[][],
  columns?: number,
): RechartsSubplotConfig[][] {
  if (subplots.length === 0) {
    throw new Error('RechartsAdapter: subplots must contain at least one panel');
  }

  if (Array.isArray(subplots[0])) {
    const grid = subplots as RechartsSubplotConfig[][];
    for (const [rowIndex, row] of grid.entries()) {
      if (!Array.isArray(row) || row.length === 0) {
        throw new Error(`RechartsAdapter: subplots row ${rowIndex} must be a non-empty array of panels`);
      }
    }
    return grid;
  }

  const flat = subplots as RechartsSubplotConfig[];
  const cols = columns ?? flat.length;
  if (!Number.isInteger(cols) || cols < 1) {
    throw new Error('RechartsAdapter: columns must be a positive integer');
  }

  const grid: RechartsSubplotConfig[][] = [];
  for (let i = 0; i < flat.length; i += cols) {
    grid.push(flat.slice(i, i + cols));
  }
  return grid;
}

/**
 * Builds a multi-panel (subplot mode) MAIDR figure: one MaidrSubplot per
 * panel, arranged in the same grid shape as the config.
 */
function buildSubplotMaidr(config: RechartsAdapterConfig): Maidr {
  if (config.chartType || config.layers) {
    throw new Error('RechartsAdapter: subplots is mutually exclusive with top-level chartType/layers');
  }

  const grid = normalizeRechartsSubplotGrid(config.subplots ?? [], config.columns);
  // The panels' own children arrive in one flat row-major list, so a panel's
  // axis verdict is found by counting past the rows above it rather than by
  // its grid position (#1017).
  let flatIndex = 0;
  const subplots = grid.map((row, rowIndex) =>
    row.map((panel, colIndex) => buildPanelSubplot(config, panel, rowIndex, colIndex, flatIndex++)),
  );

  return {
    id: config.id,
    title: config.title,
    subtitle: config.subtitle,
    caption: config.caption,
    subplots,
  };
}

/**
 * Builds one MaidrSubplot for a panel at grid position (row, col).
 *
 * Panel fields are merged over the top-level defaults, then the regular
 * layer builders run with a panel scope so every generated selector matches
 * only this panel's marks. Layer ids are prefixed with the grid position to
 * stay unique across the whole figure, and the panel title (when provided)
 * lands on the FIRST layer — the core uses it as the panel's display name
 * in subplot summaries.
 */
function buildPanelSubplot(
  config: RechartsAdapterConfig,
  panel: RechartsSubplotConfig,
  row: number,
  col: number,
  flatIndex: number,
): MaidrSubplot {
  if (!panel.chartType && !panel.layers) {
    throw new Error(
      `RechartsAdapter: subplot panel [${row}][${col}] must define chartType + yKeys (simple mode) or layers (composed mode)`,
    );
  }

  const merged: RechartsAdapterConfig = {
    id: config.id,
    data: panel.data ?? config.data,
    chartType: panel.chartType,
    xKey: panel.xKey ?? config.xKey,
    yKeys: panel.yKeys ?? config.yKeys,
    layers: panel.layers,
    xLabel: panel.xLabel ?? config.xLabel,
    yLabel: panel.yLabel ?? config.yLabel,
    orientation: panel.orientation ?? config.orientation,
    // Each panel's own axis, not the grid's: a panel draws its own chart, so
    // one verdict for all of them would read the first panel's axis onto every
    // other (#1017).
    categoryAxisReversed: config.categoryAxisReversedPerPanel?.[flatIndex],
    fillKeys: panel.fillKeys ?? config.fillKeys,
    binConfig: panel.binConfig ?? config.binConfig,
    // The per-type configs name FIELDS and declare CUTOFFS, both of which the
    // panels of a facet grid share by construction — every panel plots the
    // same columns of a split data set — so they have no per-panel override.
    flowConfig: config.flowConfig,
    volcanoConfig: config.volcanoConfig,
    errorConfig: config.errorConfig,
    forestConfig: config.forestConfig,
    survivalConfig: config.survivalConfig,
    waterfallConfig: config.waterfallConfig,
    ganttConfig: config.ganttConfig,
    gaugeConfig: config.gaugeConfig,
    parallelConfig: config.parallelConfig,
    ridgelineConfig: config.ridgelineConfig,
    hexbinConfig: config.hexbinConfig,
    boxenConfig: config.boxenConfig,
    selectorOverride: panel.selectorOverride,
  };

  const panelScope = panel.panelSelector ?? getPanelClassSelector(row, col);
  const layers = buildLayers(merged, panelScope).map((layer, layerIndex) => ({
    ...layer,
    // Layer ids must be unique across the WHOLE figure, not per subplot.
    id: `${row}_${col}_${layer.id}`,
    // The first layer's title doubles as the panel display name.
    title: layerIndex === 0 && panel.title !== undefined ? panel.title : layer.title,
  }));

  return {
    layers,
    selector: `#maidr-article-${cssEscape(config.id)} ${panelScope} svg.recharts-surface`,
  };
}

/**
 * Builds MAIDR layers from the adapter config.
 * Handles both simple mode (chartType + yKeys) and composed mode (layers).
 *
 * @param config - Adapter (or merged per-panel) configuration
 * @param panelScope - Optional selector scoping generated selectors to one
 *                     panel's container (subplot mode only)
 */
function buildLayers(config: RechartsAdapterConfig, panelScope?: string): MaidrLayer[] {
  if (config.layers) {
    return buildComposedLayers(config, panelScope);
  }
  return buildSimpleLayers(config, panelScope);
}

/**
 * Builds layers for simple mode (single chart type, one or more yKeys).
 */
function buildSimpleLayers(config: RechartsAdapterConfig, panelScope?: string): MaidrLayer[] {
  const { data, chartType, xKey, yKeys, xLabel, yLabel, orientation, fillKeys, selectorOverride } = config;

  if (!chartType) {
    throw new Error(
      'RechartsAdapter: either provide chartType + yKeys (simple mode) or layers (composed mode)',
    );
  }
  if (!data) {
    throw new Error('RechartsAdapter: data is required (top-level or per subplot panel)');
  }

  // Four types whose payload is a grid grouped by something that is not a
  // series: the observations of a parallel plot, the groups of a ridgeline,
  // the rows of a hex lattice, the ladders of a boxen. None of them declares
  // `yKeys` — every field they read is named by their own config — so they are
  // dispatched before the check for it.
  switch (chartType) {
    case 'parallel':
      return [buildParallelLayer(data, chartType, xLabel, yLabel, config.parallelConfig, selectorOverride, config.id, panelScope)];
    case 'ridgeline':
      return [buildRidgelineLayer(data, chartType, xLabel, yLabel, config.ridgelineConfig, selectorOverride, config.id, panelScope)];
    case 'hexbin':
      return [buildHexbinLayer(data, chartType, xKey, yKeys?.[0], xLabel, yLabel, config.hexbinConfig, selectorOverride, config.id, panelScope)];
    case 'boxen':
      return [buildBoxenLayer(data, chartType, xKey, xLabel, yLabel, orientation, config.boxenConfig, selectorOverride, config.id, panelScope)];
    default:
      break;
  }

  if (!yKeys || yKeys.length === 0) {
    throw new Error(
      'RechartsAdapter: either provide chartType + yKeys (simple mode) or layers (composed mode)',
    );
  }

  const hasMultipleSeries = yKeys.length > 1;

  // Stacked/dodged/normalized bars with multiple series:
  // produce a single layer with SegmentedPoint[][] data.
  // With a single yKey, fall back to regular BAR.
  if (isSegmentedBarType(chartType) && hasMultipleSeries) {
    return [buildSegmentedBarLayer(data, xKey, yKeys, chartType, xLabel, yLabel, orientation, fillKeys, selectorOverride, config.id, panelScope)];
  }

  // Histogram: produce HistogramPoint[] data
  if (chartType === 'histogram') {
    return [buildHistogramLayer(data, xKey, yKeys[0], chartType, xLabel, yLabel, orientation, config.binConfig, selectorOverride, config.id, panelScope)];
  }

  // Survival: one layer of SurvivalPoint[][] whether the figure draws one arm
  // or several. The censoring marks and the confidence band ride on the
  // points, and the plain line builders have nowhere to put them.
  if (chartType === 'survival') {
    return [buildSurvivalLayer(data, xKey, yKeys, chartType, xLabel, yLabel, fillKeys, config.survivalConfig, selectorOverride, config.id, panelScope)];
  }

  // A gauge, a gantt and a dumbbell each carry ONE payload for the whole
  // layer — an object, or a grid grouped by something other than a series —
  // so none of them fits the yKeys.map() loop below, which builds one layer
  // per series out of one array each.
  if (chartType === 'gauge') {
    return [buildGaugeLayer(data, xKey, yKeys[0], chartType, xLabel, yLabel, config.gaugeConfig, selectorOverride, config.id, panelScope)];
  }
  if (chartType === 'gantt') {
    return [buildGanttLayer(data, xKey, yKeys, chartType, xLabel, yLabel, orientation, config.ganttConfig, selectorOverride, config.id, panelScope)];
  }
  if (chartType === 'dumbbell') {
    return [buildDumbbellLayer(data, xKey, yKeys, chartType, xLabel, yLabel, orientation, fillKeys, selectorOverride, config.id, panelScope)];
  }

  // Line with multiple series: single layer with 2D LinePoint[][] data
  if (isLineType(chartType) && hasMultipleSeries) {
    return [buildMultiSeriesLineLayer(
      data,
      xKey,
      yKeys,
      chartType,
      xLabel,
      yLabel,
      selectorOverride,
      reversesLinePoints(config, chartType, selectorOverride),
    )];
  }

  const maidrType = toLayerTraceType(chartType, hasMultipleSeries);

  // Simple single-series or multiple separate layers
  return yKeys.map((yKey, index) => {
    const seriesIndex = hasMultipleSeries ? index : undefined;
    const selector = selectorOverride ?? getRechartsSelector(chartType, seriesIndex, config.id, panelScope);
    const layerData = convertData(chartType, data, xKey, yKey, config);

    // See the composed-layer builder below: a horizontal bar layer is emitted
    // the way the core reads it, not the way the config was written (#958).
    const resolvedOrientation = layerOrientation(chartType, orientation);
    const horizontal = resolvedOrientation === Orientation.HORIZONTAL
      && swapsUnderHorizontal(chartType);
    const oriented = horizontal ? swapBarFamilyPoints(layerData) : layerData;

    // A reversed category axis draws the bars from the far end while Recharts
    // renders them in data order, so the payload and the selectors turn round
    // together -- reversing one alone announces a bar and outlines another
    // (#1017, and #988 / #1000 before it).
    const turned = reversedBarSelectorsFor(config, maidrType, selector, selectorOverride, oriented.length);
    // A line has no per-point selector to permute, so it says so instead and
    // the trace pairs the two halves back up.
    const turnedLine = reversesLinePoints(config, chartType, selectorOverride);

    return {
      id: String(index),
      type: maidrType,
      title: hasMultipleSeries ? (fillKeys?.[index] ?? yKey) : undefined,
      ...layerOptions(chartType, config),
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: turned ?? (isLineType(chartType) ? (selector ? [selector] : undefined) : selector),
      orientation: resolvedOrientation,
      axes: barAxes(xLabel, yLabel, horizontal),
      ...(turnedLine ? REVERSED_POINTS : {}),
      data: turned
        ? [...oriented].reverse()
        : (turnedLine ? reversedLineSeries(oriented as LinePoint[][]) : oriented),
    } as MaidrLayer;
  });
}

/**
 * Builds a single segmented bar layer (stacked/dodged/normalized) with SegmentedPoint[][] data.
 *
 * SegmentedPoint[][] layout (matches SegmentedTrace expectation):
 *   outer array = groups / series (one per yKey/fill)
 *   inner array = categories (x values)
 */
function buildSegmentedBarLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  orientation?: Orientation,
  fillKeys?: string[],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  // SegmentedTrace expects [group/segment][category]:
  //   outer array = series (one per yKey/fill)
  //   inner array = categories (one per data item / x-value)
  const resolved = orientation ?? Orientation.VERTICAL;
  const horizontal = resolved === Orientation.HORIZONTAL;
  const traceType = toTraceType(chartType);

  const raw = yKeys.map(yKey => data.map(item => toNumber(item[yKey])));
  const magnitudes = traceType === TraceType.NORMALIZED
    ? toCategoryShares(raw)
    : raw;

  const segmentedData: SegmentedPoint[][] = yKeys.map((yKey, i) => {
    return data.map((item, row) => {
      const category = item[xKey] as string | number;
      const magnitude = magnitudes[i][row];
      const z = fillKeys?.[i] ?? yKey;
      return horizontal
        ? { x: magnitude, y: category, z }
        : { x: category, y: magnitude, z };
    });
  });

  const selector = selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope);

  return {
    id: '0',
    type: traceType,
    selectors: selector,
    orientation: resolved,
    axes: {
      ...barAxes(xLabel, yLabel, horizontal),
      z: { label: 'Series' },
    },
    data: segmentedData,
  };
}

/**
 * Builds a histogram layer with HistogramPoint[] data.
 */
function buildHistogramLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  orientation?: Orientation,
  binConfig?: RechartsAdapterConfig['binConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  const histData: HistogramPoint[] = data.map((item) => {
    const x = item[xKey] as string | number;
    const y = toNumber(item[yKey]);
    const xMin = binConfig ? toNumber(item[binConfig.xMinKey]) : 0;
    const xMax = binConfig ? toNumber(item[binConfig.xMaxKey]) : 0;
    const yMin = binConfig?.yMinKey ? toNumber(item[binConfig.yMinKey]) : 0;
    const yMax = binConfig?.yMaxKey ? toNumber(item[binConfig.yMaxKey]) : y;

    return { x, y, xMin, xMax, yMin, yMax };
  });

  const selector = selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope);
  const resolved = orientation ?? Orientation.VERTICAL;
  const horizontal = resolved === Orientation.HORIZONTAL;

  return {
    id: '0',
    type: TraceType.HISTOGRAM,
    selectors: selector,
    orientation: resolved,
    // Bin edges travel in `xMin`/`xMax`, so they are exchanged along with the
    // pair — see `swapBarFamilyPoints` for why halving the swap is worse than
    // not swapping at all.
    axes: barAxes(xLabel, yLabel, horizontal),
    data: horizontal ? swapBarFamilyPoints(histData) : histData,
  };
}

/**
 * Builds a single line layer with multi-series 2D data.
 *
 * X-axis values are preserved as-is (string or number) to avoid
 * coercing category labels like 'Jan' to 0.
 */
function buildMultiSeriesLineLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  selectorOverride?: string,
  reversed = false,
): MaidrLayer {
  const written: LinePoint[][] = yKeys.map(yKey =>
    data.map(item => ({
      x: toLineX(item[xKey]),
      y: toNumber(item[yKey]),
      z: yKey,
    })),
  );
  // Every series of one chart shares its axis, so they turn round together.
  const lineData = reversed ? reversedLineSeries(written) : written;

  // Multi-series: CSS selectors are unreliable, so omit them unless the
  // consumer provides a selectorOverride with custom class names.
  const selectors = selectorOverride
    ? yKeys.map(() => selectorOverride)
    : undefined;

  return {
    id: '0',
    type: toTraceType(chartType),
    selectors,
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    // Inert while `selectors` is undefined -- there is nothing resolved to
    // pair -- and carried anyway, so the two halves stay one statement
    // should this builder ever name its marks.
    ...(reversed ? REVERSED_POINTS : {}),
    data: lineData,
  };
}

/**
 * Builds a single survival layer with one SurvivalPoint[] row per arm.
 *
 * `stepDirection` is emitted because Recharts draws these curves with
 * `<Line type="stepAfter">` — survival holds until an event drops it, which
 * is exactly the `hv` convention — and a reader told which way the curve
 * jumps knows whether the value they hear covers the interval before the time
 * or after it.
 */
function buildSurvivalLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  fillKeys?: string[],
  survivalConfig?: RechartsAdapterConfig['survivalConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  const hasMultipleArms = yKeys.length > 1;
  const survivalData: SurvivalPoint[][] = yKeys.map((yKey, arm) =>
    convertToSurvivalRow(
      data,
      xKey,
      yKey,
      survivalConfig,
      arm,
      // A single-arm curve has nothing to be distinguished from, so it goes
      // unnamed the way a single-series line does.
      hasMultipleArms ? (fillKeys?.[arm] ?? yKey) : undefined,
    ),
  );

  // Same honest degrade as the other multi-series line families: CSS cannot
  // tell one <Line> from another, so highlighting is off unless the consumer
  // named the arms with their own classes.
  const selector = selectorOverride
    ?? getRechartsSelector(chartType, hasMultipleArms ? 0 : undefined, chartId, panelScope);

  return {
    id: '0',
    type: TraceType.SURVIVAL,
    // A SurvivalTrace is a LineTrace: one selector per arm, never a bare string.
    selectors: selector ? yKeys.map(() => selector) : undefined,
    stepDirection: survivalConfig?.stepDirection ?? 'hv',
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: survivalData,
  };
}

/**
 * Builds a single gauge layer whose data is one {@link GaugePoint} object.
 *
 * The value is the only part of the reading the chart holds. The range is the
 * `<PolarAngleAxis domain>`, and the target and the bands are drawn as arcs
 * and markers that carry no value at all, so all of them arrive through
 * `gaugeConfig` — which is therefore required rather than optional.
 */
function buildGaugeLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  gaugeConfig?: RechartsAdapterConfig['gaugeConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  if (!gaugeConfig) {
    throw new Error('RechartsAdapter: gaugeConfig with min and max is required when chartType is "gauge"');
  }
  const row = data[0];
  if (!row) {
    throw new Error('RechartsAdapter: a gauge needs one data row holding its measure');
  }

  const { min, max, target, bands, label } = gaugeConfig;
  const point: GaugePoint = { value: toNumber(row[yKey]), min, max };
  // A gauge names its measure the way every other type names a category: out
  // of `xKey`, unless the config says otherwise.
  const name = label ?? toText(row[xKey]);
  if (name !== undefined) {
    point.label = name;
  }
  if (target !== undefined) {
    point.target = target;
  }
  if (bands !== undefined) {
    point.bands = bands;
  }

  return {
    id: '0',
    type: TraceType.GAUGE,
    selectors: selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope),
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: point,
  };
}

/**
 * Builds a single gantt layer whose data is one {@link GanttData} object.
 *
 * One data row is one interval, and the payload is nested BY LANE so that a
 * lane with nothing booked still exists — which is why the lane list comes
 * from the config rather than from the rows, since an empty lane appears in
 * no row.
 */
function buildGanttLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  orientation?: Orientation,
  ganttConfig?: RechartsAdapterConfig['ganttConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  if (yKeys.length < 2) {
    throw new Error('RechartsAdapter: chartType "gantt" needs two yKeys — the interval\'s start and its end');
  }

  const lanes = ganttConfig?.lanes ? [...ganttConfig.lanes] : [];
  const grouped: GanttPoint[][] = lanes.map(() => []);
  // The order the rows land in, so the selectors can be checked against the
  // order the marks are drawn in.
  const drawnOrder: number[] = [];

  for (const item of data) {
    const lane = (item[xKey] ?? '') as string | number;
    let laneIndex = lanes.indexOf(lane);
    if (laneIndex === -1) {
      // A lane a row names but the config omits. Appended rather than dropped:
      // losing an interval is worse than a lane list in an unexpected order.
      laneIndex = lanes.push(lane) - 1;
      grouped.push([]);
    }

    const point: GanttPoint = {
      x: lane,
      start: toNumber(item[yKeys[0]]),
      end: toNumber(item[yKeys[1]]),
    };
    const label = ganttConfig?.labelKey === undefined
      ? undefined
      : toText(item[ganttConfig.labelKey]);
    if (label !== undefined) {
      point.label = label;
    }
    grouped[laneIndex].push(point);
    drawnOrder.push(laneIndex);
  }

  const payload: GanttData = { points: grouped };
  if (lanes.length > 0) {
    payload.lanes = lanes;
  }
  if (ganttConfig?.unit !== undefined) {
    payload.unit = ganttConfig.unit;
  }

  // `GanttTrace` walks its selectors lane by lane, while Recharts draws one
  // rectangle per row in row order. The two agree only when the rows are
  // already grouped by lane, so a chart that interleaves them gets no
  // highlighting rather than a highlight on somebody else's task.
  const groupedInOrder = drawnOrder.every((lane, i) => i === 0 || lane >= drawnOrder[i - 1]);
  const selector = selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope);

  return {
    id: '0',
    type: TraceType.GANTT,
    selectors: groupedInOrder ? selector : undefined,
    orientation: layerOrientation(chartType, orientation),
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: payload,
  };
}

/**
 * Builds a single dumbbell layer whose data is one {@link DumbbellData}
 * object.
 *
 * The two `yKeys` are the two ends, in the order the chart compares them, and
 * `fillKeys` names them — those names are the content of the comparison, and
 * the chart writes them down only in its legend.
 */
function buildDumbbellLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  orientation?: Orientation,
  fillKeys?: string[],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  if (yKeys.length < 2) {
    throw new Error('RechartsAdapter: chartType "dumbbell" needs two yKeys — the starting end and the finishing one');
  }

  const points: DumbbellPoint[] = data.map(item => ({
    x: item[xKey] as string | number,
    start: toNumber(item[yKeys[0]]),
    end: toNumber(item[yKeys[1]]),
  }));

  const payload: DumbbellData = { points };
  if (fillKeys?.[0] !== undefined) {
    payload.startLabel = fillKeys[0];
  }
  if (fillKeys?.[1] !== undefined) {
    payload.endLabel = fillKeys[1];
  }

  return {
    id: '0',
    type: TraceType.DUMBBELL,
    selectors: selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope),
    orientation: layerOrientation(chartType, orientation),
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: payload,
  };
}

/**
 * Builds a single parallel coordinates layer, one row per observation.
 *
 * The payload is the transpose of what the chart is drawn from. A Recharts
 * `<Line>` binds to one `yAxisId`, so a polyline crossing axes of different
 * units has to be drawn from values min-max normalised onto a shared scale,
 * over rows keyed by axis — while a MAIDR layer is one row per observation and
 * one column per axis. `ParallelTrace` derives each column's own extent and pitches a
 * value against its OWN axis, so it must never see those normalised numbers —
 * every axis would run 0 to 1 and the crossings the chart exists to show would
 * be gone. Hence `dimensions`, which names the RAW fields on the observation.
 */
function buildParallelLayer(
  data: Record<string, unknown>[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  parallelConfig?: RechartsAdapterConfig['parallelConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  const dimensions = parallelConfig?.dimensions;
  if (!dimensions || dimensions.length === 0) {
    throw new Error(
      'RechartsAdapter: parallelConfig with dimensions is required when chartType is "parallel" — the axes, in the order they are drawn, naming the RAW fields rather than the normalised ones the chart plots',
    );
  }

  const axes = dimensions.map(dimension => (
    typeof dimension === 'string'
      ? { label: dimension, key: dimension }
      : { label: dimension.label ?? dimension.key, key: dimension.key }
  ));

  const observations: LinePoint[][] = data.map((item) => {
    const name = toText(resolveFieldRef(item, parallelConfig?.labelKey, 'label'));
    return axes.map(({ label, key }) => {
      const point: LinePoint = { x: label, y: toNumber(item[key]) };
      if (name !== undefined) {
        point.z = name;
      }
      return point;
    });
  });

  const selector = selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope);

  // One selector per observation, all of them the same: Recharts draws one
  // `<Line>` path per observation, and `ParallelTrace` inherits `LineTrace`'s
  // resolution — which pairs the list with the rows one for one, then parses
  // each path's vertices into a mark per value.
  //
  // Withheld when the chart holds exactly as many observations as it has axes.
  // `LineTrace` tries whole ELEMENTS before parsing, accepting a match whose
  // count equals the row's own length, and with one path per observation those
  // two counts coincide only then — every value of every observation would
  // light some other observation's whole polyline.
  const alignable = data.length > 0 && data.length !== axes.length;

  return {
    id: '0',
    type: TraceType.PARALLEL,
    selectors: selector !== undefined && alignable ? data.map(() => selector) : undefined,
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: observations,
  };
}

/** What a ridgeline's densities are called, since no axis of the chart draws them. */
const RIDGELINE_DENSITY_AXIS = 'Density';

/**
 * Builds a single ridgeline layer, one curve per group.
 *
 * Recharts has no ridgeline primitive: the chart is overlapping `<Area>`s with
 * a per-group vertical offset baked into the plotted values. That offset is
 * presentation — it exists so the curves do not overlap illegibly — so the
 * payload carries each curve on its own terms and `densityKey` names the
 * density BEFORE it was added. Read off the drawn y instead, every group's
 * loudness would be a function of where it was stacked and the lowest ridge
 * would be the loudest thing on the chart.
 *
 * The groups come out in first-appearance order, which is the order the
 * `<Area>`s have to be declared in for the highlight to land on the right one.
 */
function buildRidgelineLayer(
  data: Record<string, unknown>[],
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
  ridgelineConfig?: RechartsAdapterConfig['ridgelineConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  const groupKey = ridgelineConfig?.groupKey;
  if (groupKey === undefined) {
    throw new Error('RechartsAdapter: ridgelineConfig with a groupKey is required when chartType is "ridgeline"');
  }

  const { valueKey, densityKey } = ridgelineConfig ?? {};
  const curves = new Map<string, ViolinKdePoint[]>();

  for (const item of data) {
    const group = toText(item[groupKey]);
    const value = toOptionalNumber(resolveFieldRef(item, valueKey, 'value'));
    const density = toOptionalNumber(resolveFieldRef(item, densityKey, 'density'));
    // A sample needs both a place on the value axis and a height there. One
    // without either is not a sample of anything, and filling in a zero would
    // put a trough in the curve where the data said nothing.
    if (group === undefined || value === undefined || density === undefined) {
      continue;
    }

    const point: ViolinKdePoint = { x: group, y: value, density };
    const curve = curves.get(group);
    if (curve === undefined) {
      curves.set(group, [point]);
    } else {
      curve.push(point);
    }
  }

  if (curves.size === 0) {
    throw new Error(
      `RechartsAdapter: no ridgeline row carried both a value and a density (looked for "${valueKey ?? 'value'}" and "${densityKey ?? 'density'}"). `
      + 'The density is the kernel-density value BEFORE the group\'s ridge offset was added, and the drawn y is not a substitute for it',
    );
  }

  return {
    id: '0',
    type: TraceType.RIDGELINE,
    // One element per group, which is what the chart draws: `RidgelineTrace`
    // resolves the selector to a flat list, requires exactly one entry per
    // ridge, and then lights that ridge's whole curve from any of its samples.
    selectors: selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope),
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
      z: { label: RIDGELINE_DENSITY_AXIS },
    },
    data: [...curves.values()],
  };
}

/** What a hexbin's counts are called, since the fill is what carries them. */
const HEXBIN_COUNT_AXIS = 'Count';

/**
 * How many significant digits a bin's y centre is compared on when grouping
 * the bins into lattice rows.
 *
 * Every bin of a hex row is placed by the same arithmetic on the same row
 * number, so their centres normally come out identical — but a lattice
 * computed through a scale can differ in the last digit or two of a `double`.
 * Twelve digits is far beyond any real lattice's spacing and well inside that
 * noise. Lifted from the d3 binder so the two adapters group alike.
 */
const HEXBIN_ROW_PRECISION = 12;

/** One bin, with the row key and the input position it was read at. */
interface HexbinBin {
  key: string;
  order: number;
  index: number;
  point: HexbinPoint;
}

/**
 * Builds a single hexbin layer whose data is a staggered LATTICE.
 *
 * Recharts places the marks and nothing else — the binning happens before the
 * chart is drawn — so `data` is one row per OCCUPIED bin and the lattice those
 * bins form is assembled here: rows grouped by their y centre, ordered from
 * the lowest upward, each row ordered left to right. `HexbinTrace` steps its
 * row index up for an upward move and treats a column index as a position
 * within its row, so neither order is optional.
 *
 * The centres stay in DATA units. Passing screen coordinates through would
 * announce every bin's position in pixels.
 */
function buildHexbinLayer(
  data: Record<string, unknown>[],
  chartType: RechartsChartType,
  xKey: string,
  yKey?: string,
  xLabel?: string,
  yLabel?: string,
  hexbinConfig?: RechartsAdapterConfig['hexbinConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  const { xKey: binXKey, yKey: binYKey, countKey, rowKey } = hexbinConfig ?? {};

  const bins: HexbinBin[] = [];
  data.forEach((item, index) => {
    // The hexbin's own chain, so a bin spelling its centre `x0`/`cx` — as a
    // d3-hexbin bin does — is read rather than dropped for want of a centre.
    // The type is passed on all three reads, `count` included: it has no
    // hexbin-specific chain today, so this resolves exactly as before, and
    // adding one later reaches every field rather than two of the three.
    const x = toOptionalNumber(resolveFieldRef(item, binXKey ?? xKey, 'x', TraceType.HEXBIN));
    const y = toOptionalNumber(resolveFieldRef(item, binYKey ?? yKey, 'y', TraceType.HEXBIN));
    const count = toOptionalNumber(resolveFieldRef(item, countKey, 'count', TraceType.HEXBIN));
    // A bin is its centre and its count. Missing any of the three, there is
    // nothing to announce and nowhere to announce it from.
    if (x === undefined || y === undefined || count === undefined) {
      return;
    }

    const declared = rowKey === undefined ? undefined : item[rowKey];
    const order = declared === undefined ? y : toOptionalNumber(declared);

    bins.push({
      key: declared === undefined ? y.toPrecision(HEXBIN_ROW_PRECISION) : String(declared),
      // A row named by something that is not a number keeps its first-seen
      // position rather than sorting to the front as a NaN would.
      order: order ?? Number.POSITIVE_INFINITY,
      index,
      point: { x, y, count },
    });
  });

  if (bins.length === 0) {
    throw new Error(
      `RechartsAdapter: no hexbin row carried a centre and a count (looked for "${binXKey ?? xKey}", "${binYKey ?? yKey ?? 'y'}" and "${countKey ?? 'count'}"). `
      + 'The centres are the bins\' positions in DATA units, which is what the reader is given instead of a column index',
    );
  }

  const rows = groupIntoHexbinRows(bins);
  const drawnOrder = rows.flat().map(bin => bin.index);

  // `HexbinTrace` slices its selector's matches row by row down the lattice,
  // while a `<Scatter>` draws one symbol per row of `data` in the order the
  // rows arrive. The two agree only when the rows already arrive in lattice
  // order, so a chart whose bins are listed some other way gets no
  // highlighting rather than a highlight on a bin half a field away — which on
  // a stagger is not even a neighbour in the direction a reader would guess.
  const inLatticeOrder = drawnOrder.every((index, i) => i === 0 || index > drawnOrder[i - 1]);
  const selector = selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope);

  return {
    id: '0',
    type: TraceType.HEXBIN,
    selectors: inLatticeOrder ? selector : undefined,
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
      z: { label: HEXBIN_COUNT_AXIS },
    },
    data: rows.map(row => row.map(bin => bin.point)),
  };
}

/**
 * Assembles the lattice: bins grouped into rows, rows ordered from the lowest
 * upward, each row ordered left to right.
 *
 * @param bins - Every bin, with the row key and ordinal it was read with
 * @returns The lattice, rows outermost
 */
function groupIntoHexbinRows(bins: HexbinBin[]): HexbinBin[][] {
  const rows = new Map<string, HexbinBin[]>();
  const order = new Map<string, number>();

  for (const bin of bins) {
    const row = rows.get(bin.key);
    if (row === undefined) {
      rows.set(bin.key, [bin]);
      order.set(bin.key, bin.order);
    } else {
      row.push(bin);
    }
  }

  return Array.from(rows.entries())
    .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map(([, row]) => [...row].sort((a, b) => Number(a.point.x) - Number(b.point.x)));
}

/**
 * Builds a single boxen layer, one letter-value ladder per distribution.
 *
 * Recharts has no box primitive at all, so the rungs are faked as stacked
 * `<Bar>`s over a transparent base — and neither the ladder nor the median is
 * anything that construction holds: both are computed from the raw sample
 * before it is drawn. So both are read from the rows, and a rung whose three
 * numbers are not all finite is dropped rather than announced as a quantile
 * the data never computed.
 *
 * No selector is generated. A rung is a rectangle rather than a distribution,
 * `BoxenTrace` wants exactly one element per distribution, and no class name
 * identifies the outermost rung — so a chart that wants highlighting puts a
 * `className` on that one `<Bar>` and passes it as `selectorOverride`.
 */
function buildBoxenLayer(
  data: Record<string, unknown>[],
  chartType: RechartsChartType,
  xKey: string,
  xLabel?: string,
  yLabel?: string,
  orientation?: Orientation,
  boxenConfig?: RechartsAdapterConfig['boxenConfig'],
  selectorOverride?: string,
  chartId?: string,
  panelScope?: string,
): MaidrLayer {
  const { xKey: categoryKey, medianKey, levelsKey, lowerOutliersKey, upperOutliersKey } = boxenConfig ?? {};

  const points: BoxenPoint[] = [];
  for (const item of data) {
    const median = toOptionalNumber(resolveFieldRef(item, medianKey, 'median'));
    // The median is the middle of the ladder and a navigable position in its
    // own right. A distribution without one has no centre to walk out from.
    if (median === undefined) {
      continue;
    }

    const point: BoxenPoint = {
      z: toText(item[categoryKey ?? xKey]) ?? '',
      median,
      levels: toLetterValueLevels(resolveFieldRef(item, levelsKey, 'levels')),
    };
    const lower = toNumberList(lowerOutliersKey === undefined ? undefined : item[lowerOutliersKey]);
    if (lower !== undefined) {
      point.lowerOutliers = lower;
    }
    const upper = toNumberList(upperOutliersKey === undefined ? undefined : item[upperOutliersKey]);
    if (upper !== undefined) {
      point.upperOutliers = upper;
    }
    points.push(point);
  }

  if (points.length === 0) {
    throw new Error(
      `RechartsAdapter: no boxen row carried a median (looked for "${medianKey ?? 'median'}"). `
      + 'A letter-value plot is computed from the raw sample before it is drawn, and the ladder and the median both arrive through the data rather than from the chart',
    );
  }

  return {
    id: '0',
    type: TraceType.BOXEN,
    selectors: selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope),
    orientation: orientation ?? Orientation.VERTICAL,
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: points,
  };
}

/**
 * Reads a distribution's ladder, keeping the rungs that are fully numeric.
 *
 * `p` is the TAIL probability, exactly as {@link LetterValueLevel} defines it:
 * 0.25 is the rung spanning the middle half. The order is left alone, since
 * `BoxenTrace` walks the ladder outward from the median whichever way round it
 * arrives.
 *
 * @param value - Whatever the levels key resolved to
 * @returns The rungs the payload carries
 */
function toLetterValueLevels(value: unknown): LetterValueLevel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const levels: LetterValueLevel[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    // A rung is a row of its own, so it is read through the same resolver the
    // top-level fields are: `lo` also answers to `lower`, `low`, `min` or
    // `y0`, exactly as it does in the d3 boxen binder. Reading only the
    // literal three dropped every ladder written any other way, which left a
    // boxen with a median and nothing to walk out to.
    const p = toOptionalNumber(resolveFieldRef(entry, undefined, 'p', TraceType.BOXEN));
    const lo = toOptionalNumber(resolveFieldRef(entry, undefined, 'lo', TraceType.BOXEN));
    const hi = toOptionalNumber(resolveFieldRef(entry, undefined, 'hi', TraceType.BOXEN));
    // A rung is a labelled pair of positions on the distribution. One missing
    // any of its three numbers would be announced as a percentile the sample
    // was never asked for.
    if (p === undefined || lo === undefined || hi === undefined) {
      continue;
    }
    levels.push({ p, lo, hi });
  }
  return levels;
}

/**
 * Reads a list of numbers — a boxen's outliers — or nothing.
 *
 * @param value - Whatever the outlier key resolved to
 * @returns The finite numbers in it, or undefined when there are none
 */
function toNumberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const numbers = value
    .map(toOptionalNumber)
    .filter((entry): entry is number => entry !== undefined);
  return numbers.length > 0 ? numbers : undefined;
}

/**
 * Builds layers for composed mode (mixed chart types via layers config).
 */
/**
 * The selectors a bar layer takes when its category axis is drawn from the far
 * end, or `null` when the layer should be left exactly as it is.
 *
 * Shared by the simple and composed builders rather than written twice: they
 * emit the same `bar` reading from the same selector, and a rule that lived in
 * one of them would be a rule the other quietly did not have (#1017).
 *
 * Declines, leaving the layer as it was, when:
 * - the axis is not reversed, or the reading is not one mark per category;
 * - the caller supplied the selector, since rebuilding it positionally would
 *   discard what they said and reversing the payload under it would point
 *   their selector at the wrong bars;
 * - the selector is not one {@link reversedBarSelectors} can count, which is
 *   how a multi-series composed layer (whose selector is `undefined`) falls
 *   through.
 *
 * Answers the selectors rather than the payload too, so each caller reverses
 * its own array and keeps its own point type -- the layer builders hand this a
 * union of every payload shape, and narrowing that here would say the rule
 * applies only to the first member of it.
 *
 * @param config - The chart or panel config being read
 * @param maidrType - What the layer is announced as
 * @param selector - The selector resolved for it, if any
 * @param selectorOverride - The caller's own selector, if they gave one
 * @param pointCount - How many marks the layer drew
 * @returns One selector per mark in drawn order, or `null` to change nothing
 */
function reversedBarSelectorsFor(
  config: RechartsAdapterConfig,
  maidrType: TraceType,
  selector: string | undefined,
  selectorOverride: string | undefined,
  pointCount: number,
): string[] | null {
  if (config.categoryAxisReversed !== true
    || maidrType !== TraceType.BAR
    || selectorOverride !== undefined
    || typeof selector !== 'string'
    || pointCount === 0) {
    return null;
  }
  return reversedBarSelectors(selector, pointCount);
}

/**
 * Whether a line-family layer's points run opposite to the order it drew them.
 *
 * A reversed category axis draws the series from its far end while Recharts
 * goes on rendering its dots in data order, so the written order announces
 * the chart as its own mirror image -- every value right, the shape
 * backwards, and with it the stereo pan, the braille line and the direction
 * autoplay sweeps (#1017 measured it; #1031 is the line half).
 *
 * A line has no per-point selector to permute the way a bar does: one class
 * names every dot of the series. `domMapping.pointOrder` is how the layer
 * says its marks run the other way, and `LineTrace` reverses the elements it
 * resolved to pair the two halves back up (#1007).
 *
 * `radar` and `polar_area` are line-shaped payloads drawn around a circle,
 * with no Cartesian category axis to reverse, so they are left out. A
 * caller's own `selectorOverride` is left out too: its resolution order is
 * not this adapter's to promise, and declaring `reverse` over it could
 * invert a pairing that was right.
 *
 * @param config - The chart or panel config being read
 * @param chartType - What the caller declared
 * @param selectorOverride - The caller's own selector, if they gave one
 * @returns True when both halves should be turned round
 */
function reversesLinePoints(
  config: RechartsAdapterConfig,
  chartType: RechartsChartType,
  selectorOverride: string | undefined,
): boolean {
  if (config.categoryAxisReversed !== true || selectorOverride !== undefined) {
    return false;
  }
  return chartType === 'line'
    || chartType === 'area'
    || isStackedAreaType(chartType)
    || chartType === 'bump';
}

/**
 * Turn each series of a line-family payload round, leaving the series order.
 *
 * @param data - The layer's `LinePoint[][]`
 * @returns The same series, each read from its far end
 */
function reversedLineSeries(data: LinePoint[][]): LinePoint[][] {
  return data.map(series => [...series].reverse());
}

function buildComposedLayers(config: RechartsAdapterConfig, panelScope?: string): MaidrLayer[] {
  const { data, xKey, xLabel, yLabel, orientation, layers, selectorOverride } = config;

  if (!layers || layers.length === 0) {
    throw new Error('RechartsAdapter: layers array must not be empty in composed mode');
  }
  if (!data) {
    throw new Error('RechartsAdapter: data is required (top-level or per subplot panel)');
  }

  // Count how many layers use each chart type to decide multi-series indexing.
  // Only pass seriesIndex when a chart type appears more than once — a single
  // occurrence is unambiguous and CSS selectors work fine.
  const typeTotals = new Map<RechartsChartType, number>();
  for (const l of layers) {
    typeTotals.set(l.chartType, (typeTotals.get(l.chartType) ?? 0) + 1);
  }
  const typeCounters = new Map<RechartsChartType, number>();

  return layers.map((layerConfig: RechartsLayerConfig, index: number) => {
    const { yKey, chartType, name } = layerConfig;
    const currentIndex = typeCounters.get(chartType) ?? 0;
    typeCounters.set(chartType, currentIndex + 1);

    // Only use seriesIndex when there are multiple layers of the same chart type
    const seriesIndex = (typeTotals.get(chartType) ?? 0) > 1 ? currentIndex : undefined;

    const maidrType = toTraceType(chartType);
    const selector = selectorOverride ?? getRechartsSelector(chartType, seriesIndex, config.id, panelScope);
    const layerData = convertData(chartType, data, xKey, yKey, config);

    // A horizontal bar layer is emitted the way the core reads it — magnitude
    // in `x`, category in `y` — rather than the way the config was written.
    // Declaring the key over the config's arrangement leaves `BarTrace` a
    // category name to pitch and silences the layer (#958).
    const resolvedOrientation = layerOrientation(chartType, orientation);
    const horizontal = resolvedOrientation === Orientation.HORIZONTAL
      && swapsUnderHorizontal(chartType);
    const oriented = horizontal ? swapBarFamilyPoints(layerData) : layerData;

    // A composed chart's `bar` layer is the same reading as a simple one's and
    // turns round on the same terms. A layer sharing its chart type with
    // another has no selector of its own, and falls through untouched.
    const turned = reversedBarSelectorsFor(config, maidrType, selector, selectorOverride, oriented.length);
    const turnedLine = reversesLinePoints(config, chartType, selectorOverride);

    return {
      id: String(index),
      type: maidrType,
      title: name,
      ...layerOptions(chartType, config),
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: turned ?? (isLineType(chartType) ? (selector ? [selector] : undefined) : selector),
      orientation: resolvedOrientation,
      axes: barAxes(xLabel, yLabel, horizontal),
      ...(turnedLine ? REVERSED_POINTS : {}),
      data: turned
        ? [...oriented].reverse()
        : (turnedLine ? reversedLineSeries(oriented as LinePoint[][]) : oriented),
    } as MaidrLayer;
  });
}

/**
 * Converts Recharts data for a single series into the appropriate MAIDR format.
 *
 * `config` is read only by the types whose payload carries more than a
 * coordinate pair — the flow's node names, the volcano's labels, the
 * interval's bounds — each of which names its fields in its own sub-config.
 */
function convertData(
  chartType: RechartsChartType,
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  config: RechartsAdapterConfig,
): BarPoint[] | ErrorBarPoint[] | FlowPoint[] | ForestPoint[] | LinePoint[][] | PiePoint[] | ScatterPoint[] | SurvivalPoint[][] | TreemapPoint[] | VolcanoPoint[] | WaterfallPoint[] {
  switch (chartType) {
    // A dot plot and a lollipop carry a bar's data — one category, one
    // magnitude — and differ only in the mark drawn for it. So does a funnel:
    // the retention and the share it is read for are ratios MAIDR derives
    // from the counts, never numbers the adapter hands it.
    case 'bar':
    case 'dot':
    case 'lollipop':
    case 'funnel':
      return convertToBarPoints(data, xKey, yKey);
    // The area, radar and bump families are all read as a line is: one value
    // per sample. What the stacking, the circle and the rank change is how
    // the model announces them, not what the adapter has to emit. A polar area
    // is a radar whose spokes are drawn as wedges, so it lands here too.
    case 'line':
    case 'area':
    case 'stacked_area':
    case 'normalized_area':
    case 'radar':
    case 'polar_area':
    case 'bump':
      return convertToLinePoints(data, xKey, yKey);
    // A composed chart carries one curve per layer, so it reads the first
    // entry of each per-arm key array.
    case 'survival':
      return [convertToSurvivalRow(data, xKey, yKey, config.survivalConfig, 0)];
    case 'scatter':
      return convertToScatterPoints(data, xKey, yKey);
    // Both are scatters read through a threshold, and differ only in what the
    // x axis means — effect size against genomic position.
    case 'volcano':
    case 'manhattan':
      return convertToVolcanoPoints(data, xKey, yKey, config.volcanoConfig);
    case 'error_bar':
      return convertToErrorBarPoints(data, xKey, yKey, config.errorConfig);
    case 'forest':
      return convertToForestPoints(data, xKey, yKey, config.errorConfig, config.forestConfig);
    // Both are the same weighted graph: a `<Sankey>` of links between nodes.
    // Whether the node set repeats at each stage is what tells the two apart,
    // and that is a fact about the data rather than about the payload.
    case 'alluvial':
    case 'sankey':
      return convertToFlowPoints(data, xKey, yKey, config.flowConfig);
    case 'waterfall':
      return convertToWaterfallPoints(data, xKey, yKey, config.waterfallConfig);
    // A treemap, a sunburst and an icicle are the same hierarchy, and differ
    // only in whether it is drawn as nested area, as rings or as bands.
    case 'treemap':
    case 'sunburst':
    case 'icicle':
      return convertToTreemapPoints(data, xKey, yKey);
    case 'pie':
      return convertToPiePoints(data, xKey, yKey);
    // Whole-chart types: their payload describes the figure rather than a
    // series, so there is nothing for them to be a layer OF. Only composed
    // mode reaches this — simple mode routes each to its own builder.
    //
    // The four grid types are here for the same reason: a parallel plot's rows
    // are its observations, a ridgeline's its groups, a hexbin's its lattice
    // rows and a boxen's its ladders — none of them a series of the chart
    // around it.
    case 'gauge':
    case 'gantt':
    case 'dumbbell':
    case 'parallel':
    case 'ridgeline':
    case 'hexbin':
    case 'boxen':
      throw new Error(`RechartsAdapter: chartType "${chartType}" describes a whole chart and cannot be a layer of a composed one`);
    // Stacked/dodged/normalized/diverging/histogram handled by dedicated builders
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
    case 'diverging_bar':
    case 'histogram':
      return convertToBarPoints(data, xKey, yKey);
  }
}

/**
 * Converts data to BarPoint[] format.
 */
function convertToBarPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): BarPoint[] {
  return data.map(item => ({
    x: item[xKey] as string | number,
    y: toNumber(item[yKey]),
  }));
}

/**
 * Converts data to LinePoint[][] format (single series as 2D array).
 *
 * X-axis values are preserved as their original type (string or number).
 * This avoids coercing category labels (e.g. 'Jan', 'Feb') to 0.
 */
function convertToLinePoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): LinePoint[][] {
  return [
    data.map(item => ({
      x: toLineX(item[xKey]),
      y: toNumber(item[yKey]),
    })),
  ];
}

/**
 * Converts data to PiePoint[] format — a flat array, one entry per slice.
 *
 * `xKey` is the Recharts `<Pie nameKey>` (the slice label) and `yKey` its
 * `dataKey` (the magnitude). `PiePoint.y` is strictly numeric, unlike
 * `BarPoint.y`, because it is also the numerator of the slice's percentage.
 */
function convertToPiePoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): PiePoint[] {
  return data.map(item => ({
    x: item[xKey] as string | number,
    y: toNumber(item[yKey]),
  }));
}

/**
 * Converts data to ScatterPoint[] format.
 */
function convertToScatterPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): ScatterPoint[] {
  return data.map(item => ({
    x: toNumber(item[xKey]),
    y: toNumber(item[yKey]),
  }));
}

/**
 * Converts data to VolcanoPoint[] format — a scatter plus what the point is.
 *
 * On a Manhattan plot `xKey` should name the position that gets ANNOUNCED,
 * which is rarely the one that gets plotted: the drawn x is usually a
 * cumulative genomic offset running across every chromosome, and "position
 * 1,431,900,204" answers nothing. Point it at the per-chromosome position and
 * declare the chromosome as `groupKey`.
 */
function convertToVolcanoPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  volcanoConfig?: RechartsAdapterConfig['volcanoConfig'],
): VolcanoPoint[] {
  const { labelKey, groupKey } = volcanoConfig ?? {};

  return data.map((item) => {
    const point: VolcanoPoint = {
      x: toNumber(item[xKey]),
      y: toNumber(item[yKey]),
    };
    const label = labelKey === undefined ? undefined : toText(item[labelKey]);
    if (label !== undefined) {
      point.label = label;
    }
    const group = groupKey === undefined ? undefined : toText(item[groupKey]);
    if (group !== undefined) {
      point.group = group;
    }
    return point;
  });
}

/**
 * Converts data to ErrorBarPoint[] format.
 */
function convertToErrorBarPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  errorConfig?: RechartsAdapterConfig['errorConfig'],
): ErrorBarPoint[] {
  return data.map(item => toErrorBarPoint(item, xKey, yKey, errorConfig));
}

/**
 * Converts data to ForestPoint[] format — an interval per study, plus the two
 * things that make the figure a forest plot rather than a row of intervals.
 *
 * Row order is the drawn order, so the pooled summary is wherever the chart
 * puts it: flagged by `pooledKey`, or named by `pooledIndex` for data that
 * carries no flag column.
 */
function convertToForestPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  errorConfig?: RechartsAdapterConfig['errorConfig'],
  forestConfig?: RechartsAdapterConfig['forestConfig'],
): ForestPoint[] {
  const { weightKey, pooledKey, pooledIndex } = forestConfig ?? {};

  return data.map((item, index) => {
    const point: ForestPoint = toErrorBarPoint(item, xKey, yKey, errorConfig);
    const weight = weightKey === undefined ? undefined : toOptionalNumber(item[weightKey]);
    if (weight !== undefined) {
      point.weight = weight;
    }
    if ((pooledKey !== undefined && Boolean(item[pooledKey])) || index === pooledIndex) {
      point.pooled = true;
    }
    return point;
  });
}

/**
 * Converts one row into an estimate with its interval.
 *
 * The bounds are ABSOLUTE positions on the value axis, while Recharts'
 * `<ErrorBar dataKey>` points at an OFFSET from the estimate, so an offset is
 * resolved against `y` here — `y - lower`, `y + upper`, the same arithmetic
 * `ErrorBar.js` does to place the whiskers. Absolute keys win when both are
 * declared: they need no arithmetic and cannot be misread as offsets.
 *
 * The bounds are independently optional. A one-sided interval is a real
 * chart, and dropping the point for want of its other half would lose the
 * estimate too, so a missing bound is left off rather than defaulted to `y`.
 */
function toErrorBarPoint(
  item: Record<string, unknown>,
  xKey: string,
  yKey: string,
  errorConfig?: RechartsAdapterConfig['errorConfig'],
): ErrorBarPoint {
  const y = toNumber(item[yKey]);
  const point: ErrorBarPoint = { x: item[xKey] as string | number, y };

  const { errorKey, yMinKey, yMaxKey } = errorConfig ?? {};
  const error = errorKey === undefined ? undefined : item[errorKey];
  // A [lower, upper] pair is an asymmetric interval; a bare number is a
  // symmetric one applied to both sides. Recharts reads the field the same way.
  const [lower, upper] = Array.isArray(error)
    ? [toOptionalNumber(error[0]), toOptionalNumber(error[1])]
    : [toOptionalNumber(error), toOptionalNumber(error)];

  const yMin = yMinKey === undefined
    ? (lower === undefined ? undefined : y - lower)
    : toOptionalNumber(item[yMinKey]);
  const yMax = yMaxKey === undefined
    ? (upper === undefined ? undefined : y + upper)
    : toOptionalNumber(item[yMaxKey]);

  if (yMin !== undefined) {
    point.yMin = yMin;
  }
  if (yMax !== undefined) {
    point.yMax = yMax;
  }
  return point;
}

/**
 * Converts data to one arm of a survival curve.
 *
 * @param data - The Recharts data array
 * @param xKey - Key holding the time
 * @param yKey - Key holding this arm's survival probability
 * @param survivalConfig - Per-arm censoring and confidence band keys
 * @param arm - Which arm this is; indexes the per-arm key arrays
 * @param seriesName - Arm display name, when the figure draws more than one
 * @returns One arm's points, in the order the curve is walked
 */
function convertToSurvivalRow(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  survivalConfig?: RechartsAdapterConfig['survivalConfig'],
  arm: number = 0,
  seriesName?: string,
): SurvivalPoint[] {
  const censoredKey = survivalConfig?.censoredKeys?.[arm];
  const yMinKey = survivalConfig?.yMinKeys?.[arm];
  const yMaxKey = survivalConfig?.yMaxKeys?.[arm];

  return data.map((item) => {
    const point: SurvivalPoint = {
      x: toLineX(item[xKey]),
      y: toNumber(item[yKey]),
    };
    if (seriesName !== undefined) {
      point.z = seriesName;
    }
    // Only a censored time is marked. An uncensored one says nothing, and a
    // `censored: false` on every ordinary point is a claim the data never made.
    if (censoredKey !== undefined && Boolean(item[censoredKey])) {
      point.censored = true;
    }
    const yMin = yMinKey === undefined ? undefined : toOptionalNumber(item[yMinKey]);
    if (yMin !== undefined) {
      point.yMin = yMin;
    }
    const yMax = yMaxKey === undefined ? undefined : toOptionalNumber(item[yMaxKey]);
    if (yMax !== undefined) {
      point.yMax = yMax;
    }
    return point;
  });
}

/**
 * Converts data to WaterfallPoint[] format — one step per row, carrying both
 * the contribution it made and the running total it produced.
 *
 * `yKey` names the CONTRIBUTION, which is the number a waterfall's data
 * actually holds; the totals a reader needs are accumulated here, because
 * `WaterfallPoint.start`/`end` are absolute positions on the value axis and
 * a bar that floats has neither of them written down.
 *
 * A step that RESTATES the total rather than changing it — an opening
 * balance, a subtotal, a closing balance — sits on the baseline, so it runs
 * from zero to the total it declares, and the running total continues from
 * there. Such a row need carry no value of its own: a "Closing" row with no
 * number restates what the steps came to, which is the whole point of drawing
 * it.
 */
function convertToWaterfallPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  waterfallConfig?: RechartsAdapterConfig['waterfallConfig'],
): WaterfallPoint[] {
  const { totalKey, totalIndices, kindKey } = waterfallConfig ?? {};

  let running = 0;
  return data.map((item, index) => {
    const declared = toOptionalNumber(item[yKey]);
    const kindText = kindKey === undefined ? undefined : toText(item[kindKey]);
    const restates = kindText === 'total'
      || (kindKey === undefined
        && ((totalKey !== undefined && Boolean(item[totalKey]))
          || totalIndices?.includes(index) === true));

    const start = restates ? 0 : running;
    const end = restates ? (declared ?? running) : running + (declared ?? 0);
    running = end;

    const delta = end - start;
    let kind: WaterfallKind = delta < 0 ? 'decrease' : 'increase';
    if (restates) {
      kind = 'total';
    } else if (kindText === 'increase' || kindText === 'decrease') {
      kind = kindText;
    }

    return { x: item[xKey] as string | number, start, end, delta, kind };
  });
}

/**
 * Converts nested Recharts hierarchy data to TreemapPoint[] format.
 *
 * `data` here is not the adapter's usual flat rows: `<Treemap>` and
 * `<SunburstChart>` both take a tree of `{ [nameKey], children }` objects, so
 * the tree is flattened depth-first in PRE-ORDER — the order both components
 * draw their nodes in, and therefore the order the highlight selectors resolve
 * in.
 *
 * A node with children gets no `y`. Recharts computes an interior node's value
 * as the sum of its children and ignores any value declared on it
 * (`computeNode` in `Treemap.js`), so passing a declared one through would
 * announce a magnitude the chart did not draw — and MAIDR keeps a declared
 * value in preference to the sum precisely because it trusts the producer.
 *
 * @param data - The top-level nodes, as the chart itself is given them
 * @param xKey - Key holding a node's name (the `<Treemap nameKey>`)
 * @param yKey - Key holding a leaf's magnitude (the `<Treemap dataKey>`)
 * @returns Every node, depth-first pre-order, each with its ancestors named
 */
function convertToTreemapPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): TreemapPoint[] {
  const points: TreemapPoint[] = [];

  /**
   * Emits one level of the tree, then each node's own children.
   *
   * @param nodes - The siblings at this level
   * @param path - Their ancestors, root first
   */
  function walk(nodes: Record<string, unknown>[], path: (string | number)[]): void {
    for (const node of nodes) {
      const name = (node[xKey] ?? '') as string | number;
      const children = Array.isArray(node.children)
        ? node.children as Record<string, unknown>[]
        : [];

      const point: TreemapPoint = { x: name };
      if (path.length > 0) {
        point.path = [...path];
      }
      const value = children.length > 0 ? undefined : toOptionalNumber(node[yKey]);
      if (value !== undefined) {
        point.y = value;
      }
      points.push(point);

      walk(children, [...path, name]);
    }
  }

  walk(data, []);
  return points;
}

/**
 * Converts data to FlowPoint[] format — one weighted flow per link.
 *
 * The `data` array is the `links` half of what Recharts' `<Sankey>` is given,
 * so `xKey` names the source field and `yKey` the magnitude. Recharts
 * addresses nodes by their index in the `nodes` array, and an index is not
 * something to announce — "flow from 3 to 7" names neither end — so the
 * indices are resolved back to node names whenever `flowConfig.nodes` is
 * declared. Links that already carry names pass through untouched.
 */
function convertToFlowPoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  flowConfig?: RechartsAdapterConfig['flowConfig'],
): FlowPoint[] {
  if (!flowConfig) {
    throw new Error('RechartsAdapter: flowConfig with a targetKey is required when chartType is "alluvial" or "sankey"');
  }

  const { targetKey, nodes, nodeNameKey } = flowConfig;
  return data.map(item => ({
    source: resolveFlowNode(item[xKey], nodes, nodeNameKey),
    target: resolveFlowNode(item[targetKey], nodes, nodeNameKey),
    value: toNumber(item[yKey]),
  }));
}

/**
 * Resolves one end of a flow to the node it names.
 *
 * A numeric end is a position in the `nodes` array, exactly as Recharts reads
 * it. Anything else — a name the links carry themselves — is already the
 * answer, and an index with no node list behind it stays a number rather than
 * becoming a made-up label.
 */
function resolveFlowNode(
  value: unknown,
  nodes?: Record<string, unknown>[],
  nodeNameKey: string = 'name',
): string | number {
  if (typeof value === 'number' && nodes) {
    const name = toText(nodes[value]?.[nodeNameKey]);
    if (name !== undefined) {
      return name;
    }
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return String(value);
}

/**
 * Returns true if the chart type produces bar-like visuals that benefit from orientation.
 */
function isBarType(chartType: RechartsChartType): boolean {
  return chartType === 'bar'
    || chartType === 'stacked_bar'
    || chartType === 'dodged_bar'
    || chartType === 'normalized_bar'
    || chartType === 'diverging_bar'
    || chartType === 'dot'
    || chartType === 'lollipop'
    || chartType === 'histogram'
    || chartType === 'gantt'
    || chartType === 'dumbbell';
}

/**
 * A bar-family payload written the way a horizontal layer is read.
 *
 * Only the flat bar payloads reach here — the caller has already established
 * the type is one {@link swapsUnderHorizontal} names, and the segmented
 * builder swaps its own `SegmentedPoint[][]` as it assembles them.
 *
 * A histogram's bin span travels as `xMin`/`xMax`, so those move too:
 * exchanging `x` and `y` alone would leave each bin announcing a value from
 * one axis and a width from the other, which reads as a plausible bar and is
 * not one.
 *
 * @param points - The points as the config's keys produced them
 * @returns The same points with magnitude and category exchanged
 */
function swapBarFamilyPoints<T>(points: T): T {
  if (!Array.isArray(points)) {
    return points;
  }
  return points.map((point: BarPoint | HistogramPoint) => {
    const swapped: BarPoint = { ...point, x: point.y, y: point.x };
    if ('xMin' in point) {
      const bin = point;
      return {
        ...swapped,
        xMin: bin.yMin,
        xMax: bin.yMax,
        yMin: bin.xMin,
        yMax: bin.xMax,
      };
    }
    return swapped;
  }) as T;
}

/**
 * The `axes` block for a layer whose points may have been swapped.
 *
 * @param xLabel     - The label the config gave the category axis
 * @param yLabel     - The label the config gave the value axis
 * @param horizontal - Whether the layer declares `horz`
 * @returns The two axis labels, paired with the fields they now describe
 */
function barAxes(
  xLabel: string | undefined,
  yLabel: string | undefined,
  horizontal: boolean,
): MaidrLayer['axes'] {
  // `BarTrace.text` announces each value under the label of the axis it sits
  // on, so the labels travel with the payload rather than staying put: an age
  // band left under `xLabel: 'People'` is announced as a count of people.
  return horizontal
    ? { x: { label: yLabel }, y: { label: xLabel } }
    : { x: { label: xLabel }, y: { label: yLabel } };
}

/**
 * Whether a `horz` layer of this type is read with its magnitude in `x`.
 *
 * The bar family swaps its pair under `horz` — see
 * {@link MaidrLayer.orientation}. A gantt and a dumbbell are in `isBarType`
 * above because they are drawn as bars, but each carries its own span fields
 * (`start`/`end`) and reads `orientation` as which way navigation and panning
 * run; neither has a magnitude in `x` to move.
 *
 * A funnel is listed even though {@link layerOrientation} never emits the key
 * for one today — it refuses precisely because the payload did not swap, and
 * says so. Whether a funnel should now declare itself horizontal is a separate
 * call about how it is announced; listing it here means that call cannot
 * silently reintroduce this bug.
 *
 * Getting this wrong is not a mislabelling the reader can work around. The
 * magnitude field ends up holding a category name, `toBarValue` answers
 * `NaN`, and `NaN` is how a deliberate gap travels — so every bar of the
 * layer goes silent while the chart still loads, navigates and highlights
 * (#958).
 *
 * @param chartType - The declared Recharts chart type
 * @returns Whether the layer's points must be swapped when horizontal
 */
function swapsUnderHorizontal(chartType: RechartsChartType): boolean {
  return chartType === 'bar'
    || chartType === 'stacked_bar'
    || chartType === 'dodged_bar'
    || chartType === 'normalized_bar'
    || chartType === 'diverging_bar'
    || chartType === 'dot'
    || chartType === 'lollipop'
    || chartType === 'histogram'
    || chartType === 'funnel';
}

/**
 * Returns the orientation to emit for a layer of the given chart type.
 *
 * Bar-like layers default to vertical. A pie, a radar and a polar area are
 * never oriented — their marks sit around a circle rather than along an axis —
 * so a config-level `orientation` (meaningful for the other layers of a
 * composed chart) must not leak onto one. Neither is a flow diagram, whose
 * marks run between nodes, a hierarchy, a gauge, or a waterfall, whose steps
 * march one way only. An icicle is a hierarchy however it happens to be drawn:
 * the bars are the layout it was given, not an axis a reader walks.
 *
 * A funnel is left out for a different reason: `FunnelTrace` is a `BarTrace`,
 * and a horizontal bar carries its category in `y` rather than `x`. The
 * adapter always emits the stage label as `x`, so a leaked `HORIZONTAL` would
 * have every stage announced by its count.
 *
 * A gantt is the one type that defaults the other way. Its bars run left to
 * right, which puts the axis on x and the lanes on y — the `<BarChart
 * layout="vertical">` recipe, and what `GanttTrace` calls horizontal.
 */
function layerOrientation(
  chartType: RechartsChartType,
  orientation?: Orientation,
): Orientation | undefined {
  switch (chartType) {
    case 'pie':
    case 'radar':
    case 'polar_area':
    case 'funnel':
    case 'alluvial':
    case 'sankey':
    case 'gauge':
    case 'waterfall':
    case 'treemap':
    case 'sunburst':
    case 'icicle':
      return undefined;
    case 'gantt':
      return orientation ?? Orientation.HORIZONTAL;
    default:
      return orientation ?? (isBarType(chartType) ? Orientation.VERTICAL : undefined);
  }
}

/**
 * Returns true if the chart type maps to a segmented bar MAIDR type.
 *
 * A diverging bar belongs here even though its two sides sit either side of a
 * baseline rather than on top of one another: `DivergingTrace` is a
 * `SegmentedTrace`, so it reads the same `SegmentedPoint[][]` payload, one row
 * per side in the order the sides are DECLARED.
 */
function isSegmentedBarType(chartType: RechartsChartType): boolean {
  return chartType === 'stacked_bar'
    || chartType === 'dodged_bar'
    || chartType === 'normalized_bar'
    || chartType === 'diverging_bar';
}

/**
 * Returns true if the chart type maps to a stacked area MAIDR type.
 */
function isStackedAreaType(chartType: RechartsChartType): boolean {
  return chartType === 'stacked_area'
    || chartType === 'normalized_area';
}

/**
 * Returns true if the chart type maps to a line-like MAIDR type.
 *
 * The whole area family, radar, polar area, bump and survival belong here:
 * every one of them is a `LineTrace` subclass in the model, so each expects
 * `LinePoint[][]` data and `selectors` as a `string[]` rather than a bare
 * string.
 */
function isLineType(chartType: RechartsChartType): boolean {
  return chartType === 'line'
    || chartType === 'area'
    || isStackedAreaType(chartType)
    || chartType === 'radar'
    || chartType === 'polar_area'
    || chartType === 'bump'
    || chartType === 'survival';
}

/**
 * Returns the display options a layer of `chartType` carries beyond its data.
 *
 * Every one of these is author knowledge rather than Recharts state: a
 * `<Scatter>` does not know which of its points are significant, and a
 * `<ReferenceLine x={1}>` does not say that 1 is what "no effect" means. So
 * each arrives through the adapter config, and is emitted only when declared —
 * MAIDR substitutes no default for any of them, and a guessed cutoff sorts
 * every point on the figure onto the wrong side silently.
 */
function layerOptions(
  chartType: RechartsChartType,
  config: RechartsAdapterConfig,
): Partial<MaidrLayer> {
  switch (chartType) {
    case 'volcano':
    case 'manhattan': {
      const { significance, significanceDirection, effect } = config.volcanoConfig ?? {};
      if (significance === undefined && significanceDirection === undefined && effect === undefined) {
        return {};
      }
      return { thresholdOptions: { significance, significanceDirection, effect } };
    }
    case 'forest': {
      const nullValue = config.forestConfig?.nullValue;
      return nullValue === undefined ? {} : { forestOptions: { nullValue } };
    }
    case 'survival':
      // Only reachable from composed mode; buildSurvivalLayer sets its own.
      return { stepDirection: config.survivalConfig?.stepDirection ?? 'hv' };
    default:
      return {};
  }
}

/**
 * Returns the MAIDR trace type for a simple-mode layer of `chartType`.
 *
 * A stacked type declared over a single yKey is not stacked at all — there is
 * no second series to stack it against — so it falls back to its unstacked
 * base: BAR for the bar family, AREA for the area family. Left as declared,
 * a stacked bar would be handed a one-row `SegmentedPoint[][]`, and a stacked
 * area would announce a running total equal to its own value and a 100% share
 * at every single point.
 *
 * The same holds for a diverging bar, which has no side to diverge from when
 * only one is declared — and whose balance row would then report every
 * category's own value as the gap between the two sides.
 */
function toLayerTraceType(chartType: RechartsChartType, hasMultipleSeries: boolean): TraceType {
  if (!hasMultipleSeries) {
    if (isSegmentedBarType(chartType)) {
      return TraceType.BAR;
    }
    if (isStackedAreaType(chartType)) {
      return TraceType.AREA;
    }
  }
  return toTraceType(chartType);
}

/**
 * Maps Recharts chart types to MAIDR TraceType enum values.
 */
function toTraceType(chartType: RechartsChartType): TraceType {
  switch (chartType) {
    case 'bar':
      return TraceType.BAR;
    case 'stacked_bar':
      return TraceType.STACKED;
    case 'dodged_bar':
      return TraceType.DODGED;
    case 'normalized_bar':
      return TraceType.NORMALIZED;
    case 'diverging_bar':
      return TraceType.DIVERGING;
    case 'waterfall':
      return TraceType.WATERFALL;
    case 'dumbbell':
      return TraceType.DUMBBELL;
    case 'gantt':
      return TraceType.GANTT;
    case 'gauge':
      return TraceType.GAUGE;
    case 'treemap':
      return TraceType.TREEMAP;
    case 'sunburst':
      return TraceType.SUNBURST;
    case 'icicle':
      return TraceType.ICICLE;
    case 'dot':
      return TraceType.DOT;
    case 'lollipop':
      return TraceType.LOLLIPOP;
    case 'funnel':
      return TraceType.FUNNEL;
    case 'histogram':
      return TraceType.HISTOGRAM;
    case 'line':
      return TraceType.LINE;
    case 'area':
      return TraceType.AREA;
    case 'stacked_area':
      return TraceType.STACKED_AREA;
    case 'normalized_area':
      return TraceType.NORMALIZED_AREA;
    case 'radar':
      return TraceType.RADAR;
    case 'polar_area':
      return TraceType.POLAR_AREA;
    case 'bump':
      return TraceType.BUMP;
    case 'survival':
      return TraceType.SURVIVAL;
    case 'scatter':
      return TraceType.SCATTER;
    case 'volcano':
      return TraceType.VOLCANO;
    case 'manhattan':
      return TraceType.MANHATTAN;
    case 'error_bar':
      return TraceType.ERROR_BAR;
    case 'forest':
      return TraceType.FOREST;
    case 'pie':
      return TraceType.PIE;
    case 'alluvial':
      return TraceType.ALLUVIAL;
    case 'sankey':
      return TraceType.SANKEY;
    // `TraceType.PARALLEL` is the string `'parallel_coordinates'`, the way
    // `'scatter'` here is `TraceType.SCATTER === 'point'`: the adapter keeps
    // its own house spelling and maps.
    case 'parallel':
      return TraceType.PARALLEL;
    case 'ridgeline':
      return TraceType.RIDGELINE;
    case 'hexbin':
      return TraceType.HEXBIN;
    case 'boxen':
      return TraceType.BOXEN;
  }
}

/**
 * Converts an x-axis value for LinePoint.
 *
 * LinePoint.x accepts `number | string`, so we preserve the original type.
 * Numbers pass through; strings are kept as-is (avoiding coercion of
 * category labels like 'Jan' to 0).
 */
function toLineX(value: unknown): number | string {
  if (typeof value === 'number')
    return value;
  if (typeof value === 'string')
    return value;
  return 0;
}

/**
 * Converts a value to a number, or to nothing.
 *
 * Unlike {@link toNumber} an absent value stays absent rather than becoming
 * 0, because every caller here feeds an OPTIONAL field: a missing bound, a
 * missing weight. Substituting 0 would draw an interval the chart never had
 * and give a study a weight of none.
 */
function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Converts a value to display text, or to nothing.
 *
 * Only strings and numbers become text: a label is something the author wrote
 * down, and `[object Object]` announced as a gene name is worse than silence.
 */
function toText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value === '' ? undefined : value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

/**
 * Safely converts a value to a number.
 * Returns 0 for null, undefined, or non-numeric values.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number')
    return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isNaN(num) ? 0 : num;
  }
  return 0;
}
