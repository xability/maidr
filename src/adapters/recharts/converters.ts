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
  const { data, chartType, xKey, yKeys, xLabel, yLabel, orientation, fillKeys } = config;

  if (!chartType || !yKeys || yKeys.length === 0) {
    throw new Error(
      'RechartsAdapter: either provide chartType + yKeys (simple mode) or layers (composed mode)',
    );
  }

  const maidrType = toTraceType(chartType);
  const hasMultipleSeries = yKeys.length > 1;

  // Stacked/dodged/normalized bars: produce a single layer with SegmentedPoint[][] data
  if (isSegmentedBarType(chartType) && hasMultipleSeries) {
    return [buildSegmentedBarLayer(config, maidrType)];
  }

  // Histogram: produce HistogramPoint[] data
  if (chartType === 'histogram') {
    return [buildHistogramLayer(config)];
  }

  // Line/area/radar with multiple series: single layer with 2D LinePoint[][] data
  if (isLineType(chartType) && hasMultipleSeries) {
    return [buildMultiSeriesLineLayer(data, xKey, yKeys, maidrType, chartType, xLabel, yLabel)];
  }

  // Simple single-series or multiple separate layers
  return yKeys.map((yKey, index) => {
    const seriesIndex = hasMultipleSeries ? index : undefined;
    const selector = getRechartsSelector(chartType, seriesIndex);
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: hasMultipleSeries ? (fillKeys?.[index] ?? yKey) : undefined,
      selectors: selector,
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
 * SegmentedPoint[][] layout:
 *   outer array = categories (x values)
 *   inner array = segments within each category (one per yKey/fill)
 */
function buildSegmentedBarLayer(
  config: RechartsAdapterConfig,
  traceType: TraceType,
): MaidrLayer {
  const { data, xKey, yKeys, xLabel, yLabel, orientation, fillKeys, chartType } = config;

  const segmentedData: SegmentedPoint[][] = data.map((item) => {
    return yKeys!.map((yKey, i) => ({
      x: item[xKey] as string | number,
      y: toNumber(item[yKey]),
      fill: fillKeys?.[i] ?? yKey,
    }));
  });

  const selector = getRechartsSelector(chartType!, undefined);

  return {
    id: '0',
    type: traceType,
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
function buildHistogramLayer(config: RechartsAdapterConfig): MaidrLayer {
  const { data, xKey, yKeys, xLabel, yLabel, orientation, binConfig, chartType } = config;
  const yKey = yKeys![0];

  const histData: HistogramPoint[] = data.map((item) => {
    const x = item[xKey] as string | number;
    const y = toNumber(item[yKey]);
    const xMin = binConfig ? toNumber(item[binConfig.xMinKey]) : 0;
    const xMax = binConfig ? toNumber(item[binConfig.xMaxKey]) : 0;
    const yMin = binConfig?.yMinKey ? toNumber(item[binConfig.yMinKey]) : 0;
    const yMax = binConfig?.yMaxKey ? toNumber(item[binConfig.yMaxKey]) : y;

    return { x, y, xMin, xMax, yMin, yMax };
  });

  const selector = getRechartsSelector(chartType!);

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
 * Builds a single line/area/radar layer with multi-series 2D data.
 */
function buildMultiSeriesLineLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  traceType: TraceType,
  chartType: RechartsChartType,
  xLabel?: string,
  yLabel?: string,
): MaidrLayer {
  const lineData: LinePoint[][] = yKeys.map(yKey =>
    data.map(item => ({
      x: toNumber(item[xKey]),
      y: toNumber(item[yKey]),
      fill: yKey,
    })),
  );

  const selectors = yKeys.map((_yKey, index) =>
    getRechartsSelector(chartType, index),
  );

  return {
    id: '0',
    type: traceType,
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
  const { data, xKey, xLabel, yLabel, orientation, layers } = config;

  if (!layers || layers.length === 0) {
    throw new Error('RechartsAdapter: layers array must not be empty in composed mode');
  }

  // Track how many of each chart type we've seen for series indexing
  const typeCounters = new Map<RechartsChartType, number>();

  return layers.map((layerConfig: RechartsLayerConfig, index: number) => {
    const { yKey, chartType, name } = layerConfig;
    const seriesIndex = typeCounters.get(chartType) ?? 0;
    typeCounters.set(chartType, seriesIndex + 1);

    const maidrType = toTraceType(chartType);
    const selector = getRechartsSelector(chartType, seriesIndex);
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: name,
      selectors: selector,
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
    case 'pie':
    case 'funnel':
      return convertToBarPoints(data, xKey, yKey);
    case 'line':
    case 'area':
    case 'radar':
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
 * Used for bar charts, pie charts (sectors as categories), and funnel charts.
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
 * Used for line, area, and radar charts.
 */
function convertToLinePoints(
  data: Record<string, unknown>[],
  xKey: string,
  yKey: string,
): LinePoint[][] {
  return [
    data.map(item => ({
      x: toNumber(item[xKey]),
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
    || chartType === 'histogram'
    || chartType === 'funnel'
    || chartType === 'pie';
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
  return chartType === 'line' || chartType === 'area' || chartType === 'radar';
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
    case 'area':
    case 'radar':
      return TraceType.LINE;
    case 'scatter':
      return TraceType.SCATTER;
    case 'pie':
    case 'funnel':
      return TraceType.BAR;
  }
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
