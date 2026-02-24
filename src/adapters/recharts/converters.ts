/**
 * Data converters for transforming Recharts data format into MAIDR's schema.
 *
 * Recharts uses a flat array of objects where each object represents one
 * data point with named fields:
 *   [{ name: 'Q1', revenue: 100, cost: 50 }, ...]
 *
 * MAIDR uses typed data structures per chart type:
 *   BarPoint[]     = [{ x, y }, ...]
 *   LinePoint[][]  = [[{ x, y, fill? }, ...], ...]
 *   ScatterPoint[] = [{ x, y }, ...]
 */

import type {
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
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
  const { data, chartType, xKey, yKeys, xLabel, yLabel, orientation } = config;

  if (!chartType || !yKeys || yKeys.length === 0) {
    throw new Error(
      'RechartsAdapter: either provide chartType + yKeys (simple mode) or layers (composed mode)',
    );
  }

  const maidrType = toTraceType(chartType);
  const hasMultipleSeries = yKeys.length > 1;

  // Line/area charts with multiple series use a single layer with 2D data
  if ((chartType === 'line' || chartType === 'area') && hasMultipleSeries) {
    return [buildMultiSeriesLineLayer(data, xKey, yKeys, maidrType, xLabel, yLabel)];
  }

  // Bar charts with multiple series: each yKey is a separate layer
  // Scatter/pie: each yKey is a separate layer
  return yKeys.map((yKey, index) => {
    const seriesIndex = hasMultipleSeries ? index : undefined;
    const selector = getRechartsSelector(chartType, seriesIndex);
    const layerData = convertData(chartType, data, xKey, yKey);

    return {
      id: String(index),
      type: maidrType,
      title: hasMultipleSeries ? yKey : undefined,
      selectors: selector,
      orientation: orientation ?? (chartType === 'bar' ? Orientation.VERTICAL : undefined),
      axes: {
        x: xLabel,
        y: yLabel,
      },
      data: layerData,
    } as MaidrLayer;
  });
}

/**
 * Builds a single line/area layer with multi-series 2D data.
 */
function buildMultiSeriesLineLayer(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[],
  traceType: TraceType,
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
    getRechartsSelector('line', index),
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
  const { data, xKey, xLabel, yLabel, orientation } = config;
  const layerConfigs = config.layers!;

  // Track how many of each chart type we've seen for series indexing
  const typeCounters = new Map<RechartsChartType, number>();

  return layerConfigs.map((layerConfig: RechartsLayerConfig, index: number) => {
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
      orientation: orientation ?? (chartType === 'bar' ? Orientation.VERTICAL : undefined),
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
      return convertToBarPoints(data, xKey, yKey);
    case 'line':
    case 'area':
      return convertToLinePoints(data, xKey, yKey);
    case 'scatter':
      return convertToScatterPoints(data, xKey, yKey);
  }
}

/**
 * Converts data to BarPoint[] format.
 * Used for bar charts and pie charts (sectors mapped as categories).
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
 * Maps Recharts chart types to MAIDR TraceType enum values.
 */
function toTraceType(chartType: RechartsChartType): TraceType {
  switch (chartType) {
    case 'bar':
      return TraceType.BAR;
    case 'line':
    case 'area':
      return TraceType.LINE;
    case 'scatter':
      return TraceType.SCATTER;
    case 'pie':
      return TraceType.BAR;
  }
}

/**
 * Safely converts a value to a number.
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
