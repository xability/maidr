import type {
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  CandlestickSelector,
  CandlestickTrend,
  HistogramPoint,
  LinePoint,
  MaidrLayer,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import type {
  VictoryComponentType,
  VictoryLayerData,
  VictoryLayerInfo,
  VictoryPanelLayout,
  VictorySubplotInfo,
} from './types';
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
 * component. Container components (VictoryStack, VictoryChart) are handled
 * separately.
 */
function isDataComponent(name: string): name is VictoryComponentType {
  return (
    name === 'VictoryBar'
    || name === 'VictoryLine'
    || name === 'VictoryScatter'
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
 * Extracts data from a VictoryBar element.
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
 * Extracts data from a VictoryLine element.
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
      z: String(x),
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
 * computes bins internally during render, we derive the bins ourselves to
 * produce MAIDR's `HistogramPoint[]`. The `bins` prop is honored in both
 * supported forms:
 *   - a **number** → that many equal-width bins over `[min, max]`;
 *   - an **array of edges** (e.g. `[0, 25, 50, 100]`) → the explicit, possibly
 *     unequal-width bins Victory actually renders.
 * When `bins` is absent, an equal-width count is derived via the sqrt heuristic.
 *
 * Non-numeric values (e.g. date strings) are filtered out so binning never
 * indexes `bins[NaN]`, which would throw inside the caller's `useLayoutEffect`
 * and crash the React tree.
 */
function extractHistogramData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  // Drop non-finite values (NaN/Infinity) so downstream bin indexing is safe.
  const values = rawData.map(d => Number(getX(d))).filter(v => Number.isFinite(v));
  if (values.length === 0)
    return null;

  const bins = Array.isArray(props.bins)
    ? binByEdges(values, props.bins)
    : binByCount(values, typeof props.bins === 'number' ? props.bins : undefined);

  if (bins === null || bins.length === 0)
    return null;

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

/** A single histogram bin with its counted total and `[xMin, xMax]` range. */
interface HistogramBin { count: number; xMin: number; xMax: number }

/**
 * Bins `values` into `binCount` equal-width bins over `[min, max]`. When
 * `binCount` is omitted, the sqrt heuristic is used. Values are pre-filtered to
 * finite numbers by the caller.
 */
function binByCount(values: number[], binCount?: number): HistogramBin[] {
  const count = binCount && binCount > 0
    ? Math.floor(binCount)
    : Math.ceil(Math.sqrt(values.length));

  // Use reduce instead of Math.min/max(...values) to avoid stack overflow
  // on large datasets (spread arguments hit the engine's call stack limit
  // at ~100k elements).
  const min = values.reduce((a, b) => (a < b ? a : b), values[0]);
  const max = values.reduce((a, b) => (a > b ? a : b), values[0]);
  const binWidth = (max - min) / count || 1;

  const bins: HistogramBin[] = Array.from({ length: count }, (_, i) => ({
    count: 0,
    xMin: min + i * binWidth,
    xMax: min + (i + 1) * binWidth,
  }));

  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= count)
      idx = count - 1;
    if (idx >= 0 && idx < bins.length)
      bins[idx].count++;
  }

  return bins;
}

/**
 * Bins `values` into the explicit `[edge_i, edge_{i+1})` intervals defined by
 * an array-form `bins` prop (the last interval is inclusive of its upper edge),
 * matching what Victory renders. Returns `null` when the edges are unusable.
 */
function binByEdges(values: number[], rawEdges: unknown[]): HistogramBin[] | null {
  if (!rawEdges.every(e => typeof e === 'number' && Number.isFinite(e)))
    return null;

  const edges = [...(rawEdges as number[])].sort((a, b) => a - b);
  if (edges.length < 2)
    return null;

  const bins: HistogramBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    bins.push({ count: 0, xMin: edges[i], xMax: edges[i + 1] });
  }

  for (const v of values) {
    for (let i = 0; i < bins.length; i++) {
      const isLast = i === bins.length - 1;
      const inRange = v >= bins[i].xMin && (isLast ? v <= bins[i].xMax : v < bins[i].xMax);
      if (inRange) {
        bins[i].count++;
        break;
      }
    }
  }

  return bins;
}

/**
 * Converts a single Victory data component into a {@link VictoryLayerInfo}.
 */
function extractLayerFromElement(
  element: ReactElement,
  layerId: string,
  axisLabels: { x?: string; y?: string },
): VictoryLayerInfo | null {
  const name = getVictoryDisplayName(element.type);
  if (!name || !isDataComponent(name))
    return null;

  const props = element.props as Record<string, unknown>;

  let extracted: { data: VictoryLayerData; count: number } | null = null;

  switch (name) {
    case 'VictoryBar':
      extracted = extractBarData(props);
      break;
    case 'VictoryLine':
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
    id: layerId,
    victoryType: name,
    data: extracted.data,
    xAxisLabel: axisLabels.x,
    yAxisLabel: axisLabels.y,
    dataCount: extracted.count,
  };
}

// ---------------------------------------------------------------------------
// Stacked bar extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a segmented (stacked) bar layer from a VictoryStack container.
 *
 * Each child VictoryBar becomes one series (row) in the resulting
 * `SegmentedPoint[][]` data.
 */
function extractSegmentedLayer(
  containerElement: ReactElement,
  containerType: 'VictoryStack',
  layerId: string,
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
      z: seriesName,
    }));

    series.push(points);
    legend.push(seriesName);
    totalElements += rawData.length;
  });

  if (series.length === 0)
    return null;

  const traceType: VictoryComponentType = containerType;

  return {
    id: layerId,
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
 * Collects the supported Victory data layers among `childNodes`.
 *
 * Handles individual data components (e.g. `<VictoryScatter>`) and
 * `<VictoryStack>` for stacked bar charts. Layer ids are produced by
 * `makeId`, called with the layer's local index among the collected layers.
 */
function collectDataLayers(
  childNodes: ReactNode,
  axisLabels: { x?: string; y?: string },
  makeId: (localIndex: number) => string,
): VictoryLayerInfo[] {
  const layers: VictoryLayerInfo[] = [];

  Children.forEach(childNodes, (child) => {
    if (!isValidElement(child))
      return;

    const name = getVictoryDisplayName(child.type);
    if (!name)
      return;

    // VictoryStack → stacked bar
    if (name === 'VictoryStack') {
      const segmented = extractSegmentedLayer(child, name, makeId(layers.length), axisLabels);
      if (segmented)
        layers.push(segmented);
      return;
    }

    // Individual data components
    const layer = extractLayerFromElement(child, makeId(layers.length), axisLabels);
    if (layer)
      layers.push(layer);
  });

  return layers;
}

/**
 * Walks the React element tree to extract Victory data layers into one flat
 * list (single-panel view).
 *
 * Handles:
 * - `<VictoryChart>` wrappers (processes children)
 * - Standalone data components (e.g. `<VictoryScatter>`)
 * - `<VictoryStack>` for stacked bar charts
 */
export function extractVictoryLayers(children: ReactNode): VictoryLayerInfo[] {
  const layers: VictoryLayerInfo[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;

    const name = getVictoryDisplayName(child.type);

    if (name === 'VictoryChart') {
      const chartProps = child.props as { children?: ReactNode };
      const axisLabels = extractAxisLabels(chartProps.children);
      layers.push(...collectDataLayers(chartProps.children, axisLabels, n => String(layers.length + n)));
    } else {
      layers.push(...collectDataLayers(child, {}, n => String(layers.length + n)));
    }
  });

  return layers;
}

/**
 * Groups Victory children into subplot panels.
 *
 * With two or more top-level `<VictoryChart>` children, each chart becomes
 * one panel carrying its own layers (ids `'{panelIdx}_{layerIdx}'`, unique
 * across the whole figure), its own axis labels, and its `title` prop as the
 * panel display name. Charts without supported data components produce an
 * entry with empty `layers` so panel indices stay aligned with the rendered
 * SVGs; callers must drop those entries before emitting the MAIDR grid.
 *
 * With fewer than two charts the extraction falls back to the original
 * single-panel behavior (all supported data components flattened into one
 * subplot with monotonic ids), so existing single-chart output is unchanged.
 *
 * In multi-panel mode, standalone data components outside any VictoryChart
 * are ignored (with a console warning) because they cannot be reliably bound
 * to a panel SVG.
 */
export function extractVictorySubplots(children: ReactNode): VictorySubplotInfo[] {
  const charts: ReactElement[] = [];
  let hasStandaloneData = false;

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;
    if (getVictoryDisplayName(child.type) === 'VictoryChart') {
      charts.push(child);
    } else if (collectDataLayers(child, {}, String).length > 0) {
      hasStandaloneData = true;
    }
  });

  if (charts.length < 2) {
    // Single-panel: preserve the original flat extraction exactly.
    return [{ layers: extractVictoryLayers(children) }];
  }

  if (hasStandaloneData) {
    console.warn(
      'MAIDR: standalone Victory data components outside a <VictoryChart> are '
      + 'ignored when multiple <VictoryChart> panels are present.',
    );
  }

  return charts.map((chart, panelIndex) => {
    const chartProps = chart.props as { children?: ReactNode; title?: string };
    const axisLabels = extractAxisLabels(chartProps.children);
    return {
      layers: collectDataLayers(chartProps.children, axisLabels, n => `${panelIndex}_${n}`),
      title: typeof chartProps.title === 'string' ? chartProps.title : undefined,
    };
  });
}

/**
 * Chunks subplot panels into a row-major 2D grid.
 *
 * Defaults to a single row in children order. An explicit `layout` chunks the
 * panels row-major: `columns` fixes the panels per row; otherwise `rows`
 * derives the column count. Never produces empty rows (the MAIDR core cannot
 * represent them); the last row may be shorter (ragged rows are supported).
 */
export function computeSubplotGrid<T>(panels: T[], layout?: VictoryPanelLayout): T[][] {
  if (panels.length === 0)
    return [];

  const requestedColumns = Math.floor(layout?.columns ?? 0);
  const requestedRows = Math.floor(layout?.rows ?? 0);

  let columns = requestedColumns > 0 ? requestedColumns : 0;
  if (columns === 0 && requestedRows > 0)
    columns = Math.ceil(panels.length / requestedRows);
  if (columns === 0)
    columns = panels.length;

  const grid: T[][] = [];
  for (let i = 0; i < panels.length; i += columns)
    grid.push(panels.slice(i, i + columns));
  return grid;
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
export function toMaidrLayer(
  layer: VictoryLayerInfo,
  selector?: string | BoxSelector[] | CandlestickSelector,
): MaidrLayer {
  const axes: MaidrLayer['axes'] = {
    x: layer.xAxisLabel ? { label: layer.xAxisLabel } : undefined,
    y: layer.yAxisLabel ? { label: layer.yAxisLabel } : undefined,
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
        selectors: selector ? [selector as string] : undefined,
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
        selectors: selector as BoxSelector[] | undefined,
        data: data.points,
      };

    case 'candlestick':
      return {
        id: layer.id,
        type: TraceType.CANDLESTICK,
        axes,
        selectors: selector as CandlestickSelector | undefined,
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

    case 'segmented':
      return {
        id: layer.id,
        type: TraceType.STACKED,
        axes,
        selectors: selector,
        data: data.points,
      };
  }
}
