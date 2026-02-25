import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  CandlestickTrend,
  HistogramPoint,
  LinePoint,
  MaidrLayer,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import type { VictoryComponentType, VictoryLayerData, VictoryLayerInfo } from './types';
import { TraceType } from '@type/grammar';
import { Children, isValidElement } from 'react';

// ---------------------------------------------------------------------------
// Component name detection
// ---------------------------------------------------------------------------

/**
 * Resolves the Victory component display name from a React element type.
 *
 * Victory components set `displayName` on their exported functions/classes.
 * This also handles HOC-wrapped components by checking common wrapper
 * conventions such as `WrappedComponent`, `render`, and `type`.
 */
function getVictoryDisplayName(type: unknown): string | null {
  if (!type)
    return null;

  if (typeof type === 'function' || typeof type === 'object') {
    const obj = type as Record<string, unknown>;

    // Direct displayName or function name
    const name = (obj.displayName as string | undefined)
      ?? (obj.name as string | undefined)
      ?? '';
    if (name.startsWith('Victory'))
      return name;

    // HOC-wrapped components (e.g. React.memo, React.forwardRef)
    if (obj.WrappedComponent)
      return getVictoryDisplayName(obj.WrappedComponent);
    if (obj.render)
      return getVictoryDisplayName(obj.render);
    if (obj.type)
      return getVictoryDisplayName(obj.type);
  }

  return null;
}

/**
 * Checks whether a display name corresponds to a supported Victory data
 * component. Container components (VictoryGroup, VictoryStack, VictoryChart)
 * are handled separately.
 */
function isDataComponent(name: string): name is VictoryComponentType {
  return (
    name === 'VictoryBar'
    || name === 'VictoryLine'
    || name === 'VictoryScatter'
    || name === 'VictoryArea'
    || name === 'VictoryPie'
    || name === 'VictoryBoxPlot'
    || name === 'VictoryCandlestick'
    || name === 'VictoryHistogram'
  );
}

// ---------------------------------------------------------------------------
// Data accessors
// ---------------------------------------------------------------------------

/**
 * Resolves the data accessor for a Victory component prop.
 *
 * Victory allows `x` and `y` to be a string key, a function, or omitted
 * (defaults to "x" / "y").
 */
function resolveAccessor(accessor: unknown, fallback: string): (d: Record<string, unknown>) => unknown {
  if (typeof accessor === 'function')
    return accessor as (d: Record<string, unknown>) => unknown;
  if (typeof accessor === 'string')
    return (d: Record<string, unknown>) => d[accessor];
  return (d: Record<string, unknown>) => d[fallback];
}

// ---------------------------------------------------------------------------
// Axis label extraction
// ---------------------------------------------------------------------------

/**
 * Extracts axis labels from VictoryAxis children inside a VictoryChart.
 */
function extractAxisLabels(children: ReactNode): { x?: string; y?: string } {
  const result: { x?: string; y?: string } = {};

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;
    const name = getVictoryDisplayName(child.type);
    if (name !== 'VictoryAxis')
      return;

    const props = child.props as Record<string, unknown>;
    const label = props.label as string | undefined;
    if (!label)
      return;

    if (props.dependentAxis) {
      result.y = label;
    } else {
      result.x = label;
    }
  });

  return result;
}

// ---------------------------------------------------------------------------
// Per-component data extraction
// ---------------------------------------------------------------------------

/**
 * Validates that `rawData` is a non-empty array of objects.
 */
function validateRawData(rawData: unknown): rawData is Record<string, unknown>[] {
  return Array.isArray(rawData) && rawData.length > 0
    && typeof rawData[0] === 'object' && rawData[0] !== null;
}

/**
 * Extracts data from a VictoryBar or VictoryPie element.
 */
function extractBarData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  const points: BarPoint[] = rawData.map(d => ({
    x: getX(d) as string | number,
    y: getY(d) as number | string,
  }));

  return { data: { kind: 'bar', points }, count: rawData.length };
}

/**
 * Extracts data from a VictoryLine or VictoryArea element.
 */
function extractLineData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  const points: LinePoint[] = rawData.map(d => ({
    x: getX(d) as number | string,
    y: Number(getY(d)),
  }));

  return { data: { kind: 'line', points: [points] }, count: rawData.length };
}

/**
 * Extracts data from a VictoryScatter element.
 */
function extractScatterData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  const points: ScatterPoint[] = rawData.map(d => ({
    x: Number(getX(d)),
    y: Number(getY(d)),
  }));

  return { data: { kind: 'scatter', points }, count: rawData.length };
}

/**
 * Extracts data from a VictoryBoxPlot element.
 *
 * Victory box plots accept pre-computed statistics:
 *   `{ x, min, q1, median, q3, max }`
 * or an array of y values from which Victory derives statistics.
 * We only support the pre-computed form for reliable data extraction.
 */
function extractBoxData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const points: BoxPoint[] = rawData.map((d) => {
    const x = d.x as string | number;
    return {
      fill: String(x),
      lowerOutliers: (d.lowerOutliers ?? []) as number[],
      min: Number(d.min ?? 0),
      q1: Number(d.q1 ?? 0),
      q2: Number(d.median ?? d.q2 ?? 0),
      q3: Number(d.q3 ?? 0),
      max: Number(d.max ?? 0),
      upperOutliers: (d.upperOutliers ?? []) as number[],
    };
  });

  return { data: { kind: 'box', points }, count: rawData.length };
}

/**
 * Extracts data from a VictoryCandlestick element.
 *
 * Victory candlestick data: `{ x, open, close, high, low }`
 */
function extractCandlestickData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const points: CandlestickPoint[] = rawData.map((d) => {
    const open = Number(d.open);
    const close = Number(d.close);
    const high = Number(d.high);
    const low = Number(d.low);

    let trend: CandlestickTrend = 'Neutral';
    if (close > open)
      trend = 'Bull';
    else if (close < open)
      trend = 'Bear';

    return {
      value: String(d.x),
      open,
      high,
      low,
      close,
      volume: Number(d.volume ?? 0),
      trend,
      volatility: high - low,
    };
  });

  return { data: { kind: 'candlestick', points }, count: rawData.length };
}

/**
 * Extracts data from a VictoryHistogram element.
 *
 * VictoryHistogram accepts raw values and a `bins` prop. Since Victory
 * computes bins internally during render, we derive equal-width bins
 * ourselves from the raw data to produce MAIDR's `HistogramPoint[]`.
 */
function extractHistogramData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const values = rawData.map(d => Number(getX(d)));

  const binCount = typeof props.bins === 'number'
    ? (props.bins as number)
    : Math.ceil(Math.sqrt(values.length));

  // Use reduce instead of Math.min/max(...values) to avoid stack overflow
  // on large datasets (spread arguments hit the engine's call stack limit
  // at ~100k elements).
  const min = values.reduce((a, b) => (a < b ? a : b), values[0]);
  const max = values.reduce((a, b) => (a > b ? a : b), values[0]);
  const binWidth = (max - min) / binCount || 1;

  // Build histogram bins
  const bins = Array.from<unknown, { count: number; xMin: number; xMax: number }>(
    { length: binCount },
    (_, i) => ({
      count: 0,
      xMin: min + i * binWidth,
      xMax: min + (i + 1) * binWidth,
    }),
  );

  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount)
      idx = binCount - 1;
    bins[idx].count++;
  }

  const points: HistogramPoint[] = bins.map(b => ({
    x: `${b.xMin.toFixed(1)}-${b.xMax.toFixed(1)}`,
    y: b.count,
    xMin: b.xMin,
    xMax: b.xMax,
    yMin: 0,
    yMax: b.count,
  }));

  return { data: { kind: 'histogram', points }, count: points.length };
}

/**
 * Converts a single Victory data component into a {@link VictoryLayerInfo}.
 */
function extractLayerFromElement(
  element: ReactElement,
  layerId: number,
  axisLabels: { x?: string; y?: string },
): VictoryLayerInfo | null {
  const name = getVictoryDisplayName(element.type);
  if (!name || !isDataComponent(name))
    return null;

  const props = element.props as Record<string, unknown>;

  let extracted: { data: VictoryLayerData; count: number } | null = null;

  switch (name) {
    case 'VictoryBar':
    case 'VictoryPie':
      extracted = extractBarData(props);
      break;
    case 'VictoryLine':
    case 'VictoryArea':
      extracted = extractLineData(props);
      break;
    case 'VictoryScatter':
      extracted = extractScatterData(props);
      break;
    case 'VictoryBoxPlot':
      extracted = extractBoxData(props);
      break;
    case 'VictoryCandlestick':
      extracted = extractCandlestickData(props);
      break;
    case 'VictoryHistogram':
      extracted = extractHistogramData(props);
      break;
  }

  if (!extracted)
    return null;

  return {
    id: String(layerId),
    victoryType: name,
    data: extracted.data,
    xAxisLabel: axisLabels.x,
    yAxisLabel: axisLabels.y,
    dataCount: extracted.count,
  };
}

// ---------------------------------------------------------------------------
// Grouped / stacked bar extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a segmented (grouped or stacked) bar layer from a VictoryGroup
 * or VictoryStack container.
 *
 * Each child VictoryBar becomes one series (row) in the resulting
 * `SegmentedPoint[][]` data.
 */
function extractSegmentedLayer(
  containerElement: ReactElement,
  containerType: 'VictoryGroup' | 'VictoryStack',
  layerId: number,
  axisLabels: { x?: string; y?: string },
): VictoryLayerInfo | null {
  const containerProps = containerElement.props as { children?: ReactNode };
  const series: SegmentedPoint[][] = [];
  const legend: string[] = [];
  let totalElements = 0;

  Children.forEach(containerProps.children, (child) => {
    if (!isValidElement(child))
      return;
    const name = getVictoryDisplayName(child.type);
    if (name !== 'VictoryBar')
      return;

    const props = child.props as Record<string, unknown>;
    const rawData = props.data;
    if (!validateRawData(rawData))
      return;

    const getX = resolveAccessor(props.x, 'x');
    const getY = resolveAccessor(props.y, 'y');
    const seriesName = (props.name as string) ?? `Series ${series.length + 1}`;

    const points: SegmentedPoint[] = rawData.map(d => ({
      x: getX(d) as string | number,
      y: getY(d) as number | string,
      fill: seriesName,
    }));

    series.push(points);
    legend.push(seriesName);
    totalElements += rawData.length;
  });

  if (series.length === 0)
    return null;

  const traceType: VictoryComponentType = containerType;

  return {
    id: String(layerId),
    victoryType: traceType,
    data: { kind: 'segmented', points: series },
    xAxisLabel: axisLabels.x,
    yAxisLabel: axisLabels.y,
    dataCount: totalElements,
    legend,
  };
}

// ---------------------------------------------------------------------------
// Tree walking
// ---------------------------------------------------------------------------

/**
 * Walks the React element tree to extract Victory data layers.
 *
 * Handles:
 * - `<VictoryChart>` wrappers (processes children)
 * - Standalone data components (e.g. `<VictoryPie>`)
 * - `<VictoryGroup>` and `<VictoryStack>` for segmented bar charts
 */
export function extractVictoryLayers(children: ReactNode): VictoryLayerInfo[] {
  const layers: VictoryLayerInfo[] = [];
  let layerId = 0;

  function processChildren(childNodes: ReactNode, axisLabels: { x?: string; y?: string }): void {
    Children.forEach(childNodes, (child) => {
      if (!isValidElement(child))
        return;

      const name = getVictoryDisplayName(child.type);
      if (!name)
        return;

      // VictoryGroup / VictoryStack → segmented bar
      if (name === 'VictoryGroup' || name === 'VictoryStack') {
        const segmented = extractSegmentedLayer(child, name, layerId, axisLabels);
        if (segmented) {
          layers.push(segmented);
          layerId++;
        }
        return;
      }

      // Individual data components
      const layer = extractLayerFromElement(child, layerId, axisLabels);
      if (layer) {
        layers.push(layer);
        layerId++;
      }
    });
  }

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;

    const name = getVictoryDisplayName(child.type);

    if (name === 'VictoryChart') {
      const chartProps = child.props as { children?: ReactNode };
      const axisLabels = extractAxisLabels(chartProps.children);
      processChildren(chartProps.children, axisLabels);
    } else {
      processChildren(child, {});
    }
  });

  return layers;
}

// ---------------------------------------------------------------------------
// MAIDR schema conversion
// ---------------------------------------------------------------------------

/**
 * Converts a {@link VictoryLayerInfo} into the MAIDR {@link MaidrLayer}
 * schema.
 *
 * @param layer    - Intermediate Victory layer info
 * @param selector - CSS selector for the SVG elements (may be undefined if
 *                   tagging was not possible)
 */
export function toMaidrLayer(layer: VictoryLayerInfo, selector?: string): MaidrLayer {
  const axes: MaidrLayer['axes'] = {
    x: layer.xAxisLabel,
    y: layer.yAxisLabel,
  };

  const { data } = layer;

  switch (data.kind) {
    case 'bar':
      return {
        id: layer.id,
        type: TraceType.BAR,
        axes,
        selectors: selector,
        data: data.points,
      };

    case 'line':
      return {
        id: layer.id,
        type: TraceType.LINE,
        axes,
        selectors: selector ? [selector] : undefined,
        data: data.points,
      };

    case 'scatter':
      return {
        id: layer.id,
        type: TraceType.SCATTER,
        axes,
        selectors: selector,
        data: data.points,
      };

    case 'box':
      return {
        id: layer.id,
        type: TraceType.BOX,
        axes,
        data: data.points,
      };

    case 'candlestick':
      return {
        id: layer.id,
        type: TraceType.CANDLESTICK,
        axes,
        data: data.points,
      };

    case 'histogram':
      return {
        id: layer.id,
        type: TraceType.HISTOGRAM,
        axes,
        selectors: selector,
        data: data.points,
      };

    case 'segmented': {
      const traceType = layer.victoryType === 'VictoryStack'
        ? TraceType.STACKED
        : TraceType.DODGED;

      return {
        id: layer.id,
        type: traceType,
        axes,
        selectors: selector,
        data: data.points,
      };
    }
  }
}
