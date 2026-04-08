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
import type { RechartsAdapterConfig, RechartsChartType, RechartsLayerConfig } from './types';
import { Orientation, TraceType } from '@type/grammar';
import { getRechartsSelector } from './selectors';

/**
 * Converts a Recharts adapter config into MAIDR's root data structure.
 *
 * @param config - Recharts adapter configuration
 * @returns MaidrData ready to pass to the `<Maidr>` component
 */
export function convertRechartsToMaidr(config: RechartsAdapterConfig): Maidr {
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
 * Builds MAIDR layers from the adapter config.
 * Handles both simple mode (chartType + yKeys) and composed mode (layers).
 */
function buildLayers(config: RechartsAdapterConfig): MaidrLayer[] {
  if (config.layers) {
    return buildComposedLayers(config);
  }
  return buildSimpleLayers(config);
}

/**
 * Builds layers for simple mode (single chart type, one or more yKeys).
 */
function buildSimpleLayers(config: RechartsAdapterConfig): MaidrLayer[] {
  const { data, chartType, xKey, yKeys, xLabel, yLabel, orientation, fillKeys, selectorOverride } = config;

  if (!chartType || !yKeys || yKeys.length === 0) {
    throw new Error(
      'RechartsAdapter: either provide chartType + yKeys (simple mode) or layers (composed mode)',
    );
  }

  const hasMultipleSeries = yKeys.length > 1;

  // Stacked/dodged/normalized bars with multiple series:
  // produce a single layer with SegmentedPoint[][] data.
  // With a single yKey, fall back to regular BAR.
  if (isSegmentedBarType(chartType) && hasMultipleSeries) {
    return [buildSegmentedBarLayer(data, xKey, yKeys, chartType, xLabel, yLabel, orientation, fillKeys, selectorOverride)];
  }

  // Histogram: produce HistogramPoint[] data
  if (chartType === 'histogram') {
    return [buildHistogramLayer(data, xKey, yKeys[0], chartType, xLabel, yLabel, orientation, config.binConfig, selectorOverride)];
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
    const selector = selectorOverride ?? getRechartsSelector(chartType, seriesIndex);
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: hasMultipleSeries ? (fillKeys?.[index] ?? yKey) : undefined,
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: isLineType(chartType) ? (selector ? [selector] : undefined) : selector,
      orientation: orientation ?? (isBarType(chartType) ? Orientation.VERTICAL : undefined),
      axes: {
        x: xLabel,
        y: yLabel,
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
): MaidrLayer {
  // SegmentedTrace expects [group/segment][category]:
  //   outer array = series (one per yKey/fill)
  //   inner array = categories (one per data item / x-value)
  const segmentedData: SegmentedPoint[][] = yKeys.map((yKey, i) => {
    return data.map(item => ({
      x: item[xKey] as string | number,
      y: toNumber(item[yKey]),
      fill: fillKeys?.[i] ?? yKey,
    }));
  });

  const selector = selectorOverride ?? getRechartsSelector(chartType);

  return {
    id: '0',
    type: toTraceType(chartType),
    selectors: selector,
    orientation: orientation ?? Orientation.VERTICAL,
    axes: {
      x: xLabel,
      y: yLabel,
      fill: 'Series',
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

  const selector = selectorOverride ?? getRechartsSelector(chartType);

  return {
    id: '0',
    type: TraceType.HISTOGRAM,
    selectors: selector,
    orientation: orientation ?? Orientation.VERTICAL,
    axes: {
      x: xLabel,
      y: yLabel,
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
      fill: yKey,
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
      x: xLabel,
      y: yLabel,
    },
    data: lineData,
  };
}

/**
 * Builds layers for composed mode (mixed chart types via layers config).
 */
function buildComposedLayers(config: RechartsAdapterConfig): MaidrLayer[] {
  const { data, xKey, xLabel, yLabel, orientation, layers, selectorOverride } = config;

  if (!layers || layers.length === 0) {
    throw new Error('RechartsAdapter: layers array must not be empty in composed mode');
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
    const selector = selectorOverride ?? getRechartsSelector(chartType, seriesIndex);
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: name,
      // LineTrace expects selectors as string[] (one per series), not a single string
      selectors: isLineType(chartType) ? (selector ? [selector] : undefined) : selector,
      orientation: orientation ?? (isBarType(chartType) ? Orientation.VERTICAL : undefined),
      axes: {
        x: xLabel,
        y: yLabel,
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
