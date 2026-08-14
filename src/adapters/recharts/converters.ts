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
 */

import type {
  BarPoint,
  ErrorBarPoint,
  FlowPoint,
  ForestPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  SurvivalPoint,
  VolcanoPoint,
} from '@type/grammar';
import type { RechartsAdapterConfig, RechartsChartType, RechartsLayerConfig, RechartsSubplotConfig } from './types';
import { cssEscape } from '@adapters/shared/selectorUtil';
import { Orientation, TraceType } from '@type/grammar';
import { getPanelClassSelector, getRechartsSelector } from './selectors';

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
  const subplots = grid.map((row, rowIndex) =>
    row.map((panel, colIndex) => buildPanelSubplot(config, panel, rowIndex, colIndex)),
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

  if (!chartType || !yKeys || yKeys.length === 0) {
    throw new Error(
      'RechartsAdapter: either provide chartType + yKeys (simple mode) or layers (composed mode)',
    );
  }
  if (!data) {
    throw new Error('RechartsAdapter: data is required (top-level or per subplot panel)');
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

  // Line with multiple series: single layer with 2D LinePoint[][] data
  if (isLineType(chartType) && hasMultipleSeries) {
    return [buildMultiSeriesLineLayer(data, xKey, yKeys, chartType, xLabel, yLabel, selectorOverride)];
  }

  const maidrType = toLayerTraceType(chartType, hasMultipleSeries);

  // Simple single-series or multiple separate layers
  return yKeys.map((yKey, index) => {
    const seriesIndex = hasMultipleSeries ? index : undefined;
    const selector = selectorOverride ?? getRechartsSelector(chartType, seriesIndex, config.id, panelScope);
    const layerData = convertData(chartType, data, xKey, yKey, config);

    return {
      id: String(index),
      type: maidrType,
      title: hasMultipleSeries ? (fillKeys?.[index] ?? yKey) : undefined,
      ...layerOptions(chartType, config),
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: isLineType(chartType) ? (selector ? [selector] : undefined) : selector,
      orientation: layerOrientation(chartType, orientation),
      axes: {
        x: { label: xLabel },
        y: { label: yLabel },
      },
      data: layerData,
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
  const segmentedData: SegmentedPoint[][] = yKeys.map((yKey, i) => {
    return data.map(item => ({
      x: item[xKey] as string | number,
      y: toNumber(item[yKey]),
      z: fillKeys?.[i] ?? yKey,
    }));
  });

  const selector = selectorOverride ?? getRechartsSelector(chartType, undefined, chartId, panelScope);

  return {
    id: '0',
    type: toTraceType(chartType),
    selectors: selector,
    orientation: orientation ?? Orientation.VERTICAL,
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
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

  return {
    id: '0',
    type: TraceType.HISTOGRAM,
    selectors: selector,
    orientation: orientation ?? Orientation.VERTICAL,
    axes: {
      x: { label: xLabel },
      y: { label: yLabel },
    },
    data: histData,
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
): MaidrLayer {
  const lineData: LinePoint[][] = yKeys.map(yKey =>
    data.map(item => ({
      x: toLineX(item[xKey]),
      y: toNumber(item[yKey]),
      z: yKey,
    })),
  );

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
 * Builds layers for composed mode (mixed chart types via layers config).
 */
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

    return {
      id: String(index),
      type: maidrType,
      title: name,
      ...layerOptions(chartType, config),
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: isLineType(chartType) ? (selector ? [selector] : undefined) : selector,
      orientation: layerOrientation(chartType, orientation),
      axes: {
        x: { label: xLabel },
        y: { label: yLabel },
      },
      data: layerData,
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
): BarPoint[] | ErrorBarPoint[] | FlowPoint[] | ForestPoint[] | LinePoint[][] | PiePoint[] | ScatterPoint[] | SurvivalPoint[][] | VolcanoPoint[] {
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
    // the model announces them, not what the adapter has to emit.
    case 'line':
    case 'area':
    case 'stacked_area':
    case 'normalized_area':
    case 'radar':
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
    case 'alluvial':
      return convertToFlowPoints(data, xKey, yKey, config.flowConfig);
    case 'pie':
      return convertToPiePoints(data, xKey, yKey);
    // Stacked/dodged/normalized/histogram handled by dedicated builders
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
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
    throw new Error('RechartsAdapter: flowConfig with a targetKey is required when chartType is "alluvial"');
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
    || chartType === 'dot'
    || chartType === 'lollipop'
    || chartType === 'histogram';
}

/**
 * Returns the orientation to emit for a layer of the given chart type.
 *
 * Bar-like layers default to vertical. A pie and a radar are never oriented —
 * their marks sit around a circle rather than along an axis — so a config-level
 * `orientation` (meaningful for the other layers of a composed chart) must not
 * leak onto one. Neither is a flow diagram, whose marks run between nodes.
 *
 * A funnel is left out for a different reason: `FunnelTrace` is a `BarTrace`,
 * and a horizontal bar carries its category in `y` rather than `x`. The
 * adapter always emits the stage label as `x`, so a leaked `HORIZONTAL` would
 * have every stage announced by its count.
 */
function layerOrientation(
  chartType: RechartsChartType,
  orientation?: Orientation,
): Orientation | undefined {
  if (chartType === 'pie' || chartType === 'radar' || chartType === 'funnel' || chartType === 'alluvial') {
    return undefined;
  }
  return orientation ?? (isBarType(chartType) ? Orientation.VERTICAL : undefined);
}

/**
 * Returns true if the chart type maps to a segmented bar MAIDR type.
 */
function isSegmentedBarType(chartType: RechartsChartType): boolean {
  return chartType === 'stacked_bar'
    || chartType === 'dodged_bar'
    || chartType === 'normalized_bar';
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
 * The whole area family, radar, bump and survival belong here: every one of
 * them is a `LineTrace` subclass in the model, so each expects `LinePoint[][]`
 * data and `selectors` as a `string[]` rather than a bare string.
 */
function isLineType(chartType: RechartsChartType): boolean {
  return chartType === 'line'
    || chartType === 'area'
    || isStackedAreaType(chartType)
    || chartType === 'radar'
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
