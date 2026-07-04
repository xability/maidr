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
 */

import type {
  BarPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
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

  // Line with multiple series: single layer with 2D LinePoint[][] data
  if (isLineType(chartType) && hasMultipleSeries) {
    return [buildMultiSeriesLineLayer(data, xKey, yKeys, chartType, xLabel, yLabel, selectorOverride)];
  }

  // Determine the MAIDR trace type. For segmented bar types with a single yKey,
  // fall back to BAR since a single series is not segmented.
  const maidrType = (isSegmentedBarType(chartType) && !hasMultipleSeries)
    ? TraceType.BAR
    : toTraceType(chartType);

  // Simple single-series or multiple separate layers
  return yKeys.map((yKey, index) => {
    const seriesIndex = hasMultipleSeries ? index : undefined;
    const selector = selectorOverride ?? getRechartsSelector(chartType, seriesIndex, config.id, panelScope);
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: hasMultipleSeries ? (fillKeys?.[index] ?? yKey) : undefined,
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: isLineType(chartType) ? (selector ? [selector] : undefined) : selector,
      orientation: orientation ?? (isBarType(chartType) ? Orientation.VERTICAL : undefined),
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
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: name,
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: isLineType(chartType) ? (selector ? [selector] : undefined) : selector,
      orientation: orientation ?? (isBarType(chartType) ? Orientation.VERTICAL : undefined),
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
 */
function convertData(
  chartType: RechartsChartType,
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): BarPoint[] | LinePoint[][] | ScatterPoint[] {
  switch (chartType) {
    case 'bar':
      return convertToBarPoints(data, xKey, yKey);
    case 'line':
      return convertToLinePoints(data, xKey, yKey);
    case 'scatter':
      return convertToScatterPoints(data, xKey, yKey);
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
 * Returns true if the chart type produces bar-like visuals that benefit from orientation.
 */
function isBarType(chartType: RechartsChartType): boolean {
  return chartType === 'bar'
    || chartType === 'stacked_bar'
    || chartType === 'dodged_bar'
    || chartType === 'normalized_bar'
    || chartType === 'histogram';
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
 * Returns true if the chart type maps to a line-like MAIDR type.
 */
function isLineType(chartType: RechartsChartType): boolean {
  return chartType === 'line';
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
    case 'histogram':
      return TraceType.HISTOGRAM;
    case 'line':
      return TraceType.LINE;
    case 'scatter':
      return TraceType.SCATTER;
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
