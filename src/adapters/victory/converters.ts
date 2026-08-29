import type {
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  CandlestickSelector,
  CandlestickTrend,
  ErrorBarPoint,
  HistogramPoint,
  LinePoint,
  MaidrLayer,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  WaterfallKind,
  WaterfallPoint,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import type {
  VictoryComponentType,
  VictoryLayerData,
  VictoryLayerInfo,
  VictoryPanelLayout,
  VictorySubplotInfo,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
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
    name === 'VictoryArea'
    || name === 'VictoryBar'
    || name === 'VictoryLine'
    || name === 'VictoryScatter'
    || name === 'VictoryBoxPlot'
    || name === 'VictoryCandlestick'
    || name === 'VictoryErrorBar'
    || name === 'VictoryHistogram'
    || name === 'VictoryPie'
  );
}

/**
 * Whether a data component is drawn around a circle rather than along an axis.
 *
 * `polar` follows the same rule as `horizontal` below — the **outermost**
 * declaration wins, not the innermost. `VictoryChart` clones each child with
 * its own resolved value, so a child's `polar` is overwritten rather than
 * preferred. Measured by rendering each arrangement and reading whether the
 * bars came out as arcs or as straight lines:
 *
 * | arrangement                                        | Victory draws |
 * | -------------------------------------------------- | ------------- |
 * | `<VictoryChart polar><VictoryBar/>`                 | polar         |
 * | `<VictoryChart><VictoryBar polar/>`                 | cartesian     |
 * | `<VictoryChart polar><VictoryBar polar={false}/>`   | polar         |
 * | `<VictoryBar polar/>` (no chart)                    | polar         |
 *
 * This read "an explicit own prop always wins" until #954, and was wrong in
 * both directions: it built a coxcomb for a chart Victory drew as an ordinary
 * bar chart, and read a genuinely polar chart as cartesian. `inherited` is
 * `undefined` rather than `false` when no chart has spoken, so "not declared"
 * stays distinct from "declared false" — the chart's `polar={false}` is a
 * declaration and beats a child asking for polar.
 */
function isPolarComponent(
  props: Record<string, unknown>,
  inherited: boolean | undefined,
): boolean {
  return typeof inherited === 'boolean' ? inherited : props.polar === true;
}

/**
 * Whether a bar component is drawn on its side.
 *
 * `horizontal` is declared on the component, on a `<VictoryStack>`, or on the
 * enclosing `<VictoryChart>` — and unlike `polar` above, **the outermost
 * declaration wins**. Victory's wrappers clone their children with the
 * wrapper's own value, so an inner `horizontal={false}` inside a horizontal
 * chart does not opt back out, and a chart that says `horizontal={false}`
 * suppresses a bar that asks for it. `inherited` is therefore `undefined`
 * rather than `false` when nothing outside has spoken, so the two cases stay
 * distinguishable. Measured by rendering each arrangement, not read off the
 * prop merge.
 *
 * It was read nowhere until now, so a horizontal chart emitted no
 * `orientation` and the core defaulted it to vertical -- announcing a
 * population pyramid as a *vertical* diverging bar plot and sweeping its
 * stereo cue across age bands that run down the page (#952).
 */
function isHorizontalComponent(
  props: Record<string, unknown>,
  inherited: boolean | undefined,
): boolean {
  return typeof inherited === 'boolean' ? inherited : props.horizontal === true;
}

/**
 * Whether a layer kind is one the core reads through `orientation`.
 *
 * Only the bar family resolves the key — see {@link MaidrLayer.orientation}.
 * A `VictoryLine` or `VictoryScatter` inside a horizontal chart is drawn on
 * its side too, but its trace never asks, so declaring it would swap this
 * layer's axis labels for nothing.
 */
function isBarFamily(kind: VictoryLayerData['kind']): boolean {
  return kind === 'bar' || kind === 'dot' || kind === 'histogram';
}

/**
 * The kinds that have an orientation worth declaring at all.
 *
 * A superset of {@link isBarFamily}, and the distinction matters: everything
 * here is *announced* by its orientation and reads its axis labels through it,
 * while only the bar family also has its `x` and `y` exchanged. A box plot and
 * an error bar carry no pair to exchange -- `BoxTrace` and `ErrorBarTrace`
 * read the group off `axes.y` when the layer is horizontal, which is where
 * {@link toMaidrLayer}'s swap has put it once this key is set. The swap and
 * the reading are gated on the same key, so what a missing key cost was never
 * a crossed label: it was a sideways chart announcing itself as an upright one
 * and arrowing across its groups instead of along its measurement axis.
 *
 * Left out: a line, an area, a scatter and a candlestick, none of which the
 * grammar's `IS_ORIENTED` table gives an orientation to.
 *
 * @param kind - The layer's extracted kind
 * @returns True when `horizontal` should reach the emitted layer
 */
function isOrientedKind(kind: VictoryLayerData['kind']): boolean {
  return isBarFamily(kind) || kind === 'box' || kind === 'errorBar';
}

/**
 * One bar point in the arrangement a horizontal layer is read in.
 *
 * @param point - The point as Victory holds it, `x = category`
 * @returns The same point with its magnitude in `x` and its category in `y`
 */
function swapBarPoint<T extends BarPoint>(point: T): T {
  return { ...point, x: point.y, y: point.x };
}

/**
 * One series of a stack or a diverging pair, swapped point by point.
 *
 * @param series - One row of the layer's `SegmentedPoint[][]`
 * @returns The same row in the horizontal arrangement
 */
function swapSeries(series: SegmentedPoint[]): SegmentedPoint[] {
  return series.map(swapBarPoint);
}

/**
 * One histogram bin the same way round, edges included.
 *
 * The bin's edges travel as `xMin`/`xMax`, so a swap that moved only `x` and
 * `y` would leave every bin describing a span of the other axis — a bar whose
 * announced value and announced width came from different quantities.
 *
 * @param point - The bin as Victory holds it
 * @returns The same bin with both its value and its edges swapped
 */
function swapHistogramPoint(point: HistogramPoint): HistogramPoint {
  return {
    ...swapBarPoint(point),
    xMin: point.yMin,
    xMax: point.yMax,
    yMin: point.xMin,
    yMax: point.xMax,
  };
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

/** What a chart's `<VictoryAxis>` children say about its axes. */
interface VictoryAxisInfo {
  /** The labels, for the layers to carry. */
  labels: { x?: string; y?: string };
  /**
   * Whether the independent axis -- the one the categories run along -- is
   * drawn from the far end, which `<VictoryAxis invertAxis />` does.
   */
  invertedIndependent: boolean;
}

/**
 * Reads what the `<VictoryAxis>` children of a `<VictoryChart>` declare.
 *
 * Both answers come off the same element, so they come out of the same walk.
 * `label` is read only when there is one; `invertAxis` is read whether or not
 * there is, since an axis is commonly inverted without being labelled.
 *
 * @param children - The chart's children
 * @returns The labels, and whether the independent axis is inverted
 */
function extractAxisInfo(children: ReactNode): VictoryAxisInfo {
  const labels: { x?: string; y?: string } = {};
  let invertedIndependent = false;

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;
    const name = getVictoryDisplayName(child.type);
    if (name !== 'VictoryAxis')
      return;

    const props = child.props as Record<string, unknown>;
    const dependent = Boolean(props.dependentAxis);
    if (!dependent && props.invertAxis === true) {
      invertedIndependent = true;
    }

    const label = props.label as string | undefined;
    if (!label)
      return;

    if (dependent) {
      labels.y = label;
    } else {
      labels.x = label;
    }
  });

  return { labels, invertedIndependent };
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
 * Where each stepping `interpolation` puts the riser, in
 * {@link StepDirection} terms. Victory hands these straight to the matching
 * d3 curve, so `stepAfter` runs flat and rises at the next x (`hv`),
 * `stepBefore` rises first at the current x (`vh`), and `step` rises at the
 * midpoint (`mid`). Every other interpolation — `linear`, `natural`,
 * `monotoneX`, absent — interpolates and is not a step.
 */
const STEP_DIRECTION_BY_INTERPOLATION: Partial<Record<string, StepDirection>> = {
  step: 'mid',
  stepBefore: 'vh',
  stepAfter: 'hv',
};

/**
 * The step convention a line's `interpolation` prop draws, or `undefined`
 * when it draws an ordinary interpolated line.
 */
function stepDirectionOf(interpolation: unknown): StepDirection | undefined {
  // Victory also accepts a function here, for a custom d3 curve factory.
  // Nothing about such a curve is inspectable, so it stays a line.
  return typeof interpolation === 'string'
    ? STEP_DIRECTION_BY_INTERPOLATION[interpolation]
    : undefined;
}

/**
 * Reads a component's `data` prop as one series of {@link LinePoint}s, or
 * `null` when there is no usable data.
 *
 * Shared by every line-shaped layer — line, step, area, stacked area band,
 * polar area — because Victory draws them all from the same `data` prop under
 * the same `x`/`y` accessor convention. What differs between them is the mark,
 * which the layer's `kind` records, not the values.
 */
function readLinePoints(props: Record<string, unknown>): LinePoint[] | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  return rawData.map(d => ({
    x: getX(d) as number | string,
    y: Number(getY(d)),
  }));
}

/**
 * Extracts data from a VictoryLine element.
 */
function extractLineData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const points = readLinePoints(props);
  if (!points)
    return null;

  const stepDirection = stepDirectionOf(props.interpolation);

  return {
    data: {
      kind: 'line',
      points: [points],
      ...(stepDirection ? { stepDirection } : {}),
    },
    count: points.length,
  };
}

/**
 * Extracts data from a VictoryArea element.
 *
 * An area is a line with the region down to the baseline filled in, and
 * Victory draws it from the same props, so the values are read exactly as a
 * line's are. A `polar` area is a radar outline instead, which MAIDR reads
 * differently — that case is handled by the caller.
 */
function extractAreaData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const points = readLinePoints(props);
  if (!points)
    return null;

  return { data: { kind: 'area', points: [points] }, count: points.length };
}

/**
 * Extracts data from a `polar` VictoryBar element — a coxcomb, whose wedges
 * radiate from the centre with the value as the radius.
 *
 * The payload is a single-series line grid because that is what MAIDR's radar
 * family navigates: one column per spoke, with the spoke angles derived by the
 * trace itself.
 */
function extractPolarAreaData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const points = readLinePoints(props);
  if (!points)
    return null;

  return { data: { kind: 'polarArea', points: [points] }, count: points.length };
}

/**
 * Whether every datum's x names a category rather than measuring a position.
 *
 * This is Victory's own test: `Data.createStringMap` puts a datum on the
 * category scale when `typeof value === 'string'`, whatever the string spells,
 * so `'2024'` is a category to Victory exactly as `'Denmark'` is.
 *
 * @param rawData - The component's `data`, already validated
 * @param getX    - The component's resolved x accessor
 * @returns True when the chart is drawn against categories
 */
function hasCategoricalX(
  rawData: Record<string, unknown>[],
  getX: (d: Record<string, unknown>) => unknown,
): boolean {
  return rawData.every(d => typeof getX(d) === 'string');
}

/**
 * Extracts data from a VictoryScatter element.
 *
 * A scatter drawn over categories is a Cleveland dot plot: one magnitude per
 * named category, which is what a bar chart is, drawn as a point. Reading it
 * as a bivariate scatter would coerce every category name to a number and
 * announce a chart of `NaN` positions, so the two are separated here — by the
 * data, since the component is the same either way.
 */
function extractScatterData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');

  if (hasCategoricalX(rawData, getX)) {
    const points: BarPoint[] = rawData.map(d => ({
      x: getX(d) as string,
      y: getY(d) as number | string,
    }));

    return { data: { kind: 'dot', points }, count: rawData.length };
  }

  const points: ScatterPoint[] = rawData.map(d => ({
    x: Number(getX(d)),
    y: Number(getY(d)),
  }));

  return { data: { kind: 'scatter', points }, count: rawData.length };
}

/**
 * Extracts data from a VictoryPie element.
 *
 * VictoryPie shares Victory's `x`/`y` accessor convention: `x` names the slice
 * and `y` is its magnitude. A doughnut is the same component with an
 * `innerRadius`, which changes the drawing and not the data, so it needs no
 * separate handling.
 *
 * Unlike `BarPoint.y`, `PiePoint.y` is strictly numeric — it is also the
 * numerator of the slice's percentage — so the accessor result is coerced here
 * rather than passed through.
 */
function extractPieData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  const points: PiePoint[] = rawData.map(d => ({
    x: getX(d) as string | number,
    y: Number(getY(d)),
  }));

  return { data: { kind: 'pie', points }, count: rawData.length };
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

// ---------------------------------------------------------------------------
// Error bars
// ---------------------------------------------------------------------------

/**
 * Reads one side of a Victory error value as a distance from the estimate.
 *
 * Victory treats `0` as "draw no whisker on this side" rather than as a
 * zero-length one (victory-errorbar/src/helper-methods), and so does this:
 * a bound that coincides with the estimate is not a bound the chart drew.
 * A missing or non-finite value is no error either.
 *
 * @param value - One side of a datum's error, as Victory received it
 * @returns The distance from the estimate, or undefined for no whisker
 */
function errorDelta(value: unknown): number | undefined {
  const delta = Number(value);
  return Number.isFinite(delta) && delta !== 0 ? Math.abs(delta) : undefined;
}

/**
 * Splits a Victory error value into its upper and lower distances.
 *
 * Victory accepts either a scalar — one symmetric error drawn on both sides —
 * or a `[plus, minus]` pair for an asymmetric interval.
 *
 * @param error - A datum's `errorY`, as Victory received it
 * @returns The distances above and below the estimate
 */
function readErrorDeltas(error: unknown): { plus?: number; minus?: number } {
  if (Array.isArray(error)) {
    return { plus: errorDelta(error[0]), minus: errorDelta(error[1]) };
  }
  const symmetric = errorDelta(error);
  return { plus: symmetric, minus: symmetric };
}

/**
 * Extracts data from a VictoryErrorBar element.
 *
 * Victory's error is a **delta** from the estimate while MAIDR's
 * {@link ErrorBarPoint} fixes **absolute** bounds, so the conversion is the
 * point of this extractor. Each side is emitted independently: a one-sided
 * interval is a real chart, and `ErrorBarTrace` drops the row for a bound no
 * point carries rather than announcing silence.
 *
 * Only `errorY` is read. A `errorX`-only chart draws its interval along the
 * category axis, which is a different layer orientation rather than a
 * different delta, and reading it as a vertical interval would put every
 * bound on the wrong axis — so such a layer is left unconverted.
 */
function extractErrorBarData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  const getErrorY = resolveAccessor(props.errorY, 'errorY');

  const points: ErrorBarPoint[] = rawData.map((d) => {
    const y = Number(getY(d));
    const { plus, minus } = readErrorDeltas(getErrorY(d));
    return {
      x: getX(d) as number | string,
      y,
      ...(minus === undefined ? {} : { yMin: y - minus }),
      ...(plus === undefined ? {} : { yMax: y + plus }),
    };
  });

  // A layer that draws no interval anywhere is not an interval chart. Calling
  // it one promises the reader bounds that no navigation can reach.
  const hasInterval = points.some(p => p.yMin !== undefined || p.yMax !== undefined);
  if (!hasInterval)
    return null;

  return { data: { kind: 'errorBar', points }, count: points.length };
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

/**
 * The value a waterfall step is measured against — a bar sitting here restates
 * the running total rather than contributing to it.
 */
const WATERFALL_BASELINE = 0;

/**
 * How far a step may miss the previous step's end and still count as chained.
 *
 * The chain test is what separates a waterfall from a range bar, so it has to
 * stay tight — but a running total built by arithmetic (percentages, divided
 * quantities) lands a fraction of a ULP off the value it was accumulated from,
 * and an exact comparison would demote such a chart to a plain bar chart with
 * nothing reported. This tolerance is far below any spacing a reader could
 * perceive and far above float drift.
 */
const WATERFALL_CHAIN_EPSILON = 1e-9;

/** Whether two waterfall bounds meet, allowing for float drift. */
function meets(a: number, b: number): boolean {
  return Math.abs(a - b) <= WATERFALL_CHAIN_EPSILON;
}

/**
 * Extracts data from a VictoryBar whose bars float on a per-datum `y0`.
 *
 * `y0` is an ordinary Victory accessor prop, so a floating bar is native
 * rather than a hack — but a floating bar alone is not yet a waterfall: a
 * range bar and a gantt row are drawn the same way, and the adapter cannot
 * tell those apart from the values. What it can check is whether the bars
 * **chain**, each one starting where the last one ended, which is the
 * defining property of a waterfall and something a range chart does not have.
 * Bars resting on the baseline are exempt from the chain, since those restate
 * the running total (the opening and closing bars, and any subtotal drawn
 * along the way) instead of continuing it.
 *
 * Returns `null` when the bars are flat or unchained, so the caller falls back
 * to reading them as an ordinary bar chart.
 */
function extractWaterfallData(
  props: Record<string, unknown>,
): { data: VictoryLayerData; count: number } | null {
  const rawData = props.data;
  if (!validateRawData(rawData))
    return null;

  const getX = resolveAccessor(props.x, 'x');
  const getY = resolveAccessor(props.y, 'y');
  const getY0 = resolveAccessor(props.y0, 'y0');

  const steps = rawData.map(d => ({
    x: getX(d) as number | string,
    start: Number(getY0(d) ?? WATERFALL_BASELINE),
    end: Number(getY(d)),
  }));

  if (steps.some(s => !Number.isFinite(s.start) || !Number.isFinite(s.end)))
    return null;

  const floats = steps.some(s => !meets(s.start, WATERFALL_BASELINE));
  const chains = steps.every((s, i) =>
    i === 0 || meets(s.start, WATERFALL_BASELINE) || meets(s.start, steps[i - 1].end));
  if (!floats || !chains)
    return null;

  const points: WaterfallPoint[] = steps.map(({ x, start, end }) => {
    const delta = end - start;
    let kind: WaterfallKind = delta < 0 ? 'decrease' : 'increase';
    if (meets(start, WATERFALL_BASELINE))
      kind = 'total';
    return { x, start, end, delta, kind };
  });

  return { data: { kind: 'waterfall', points }, count: points.length };
}

/**
 * Converts a single Victory data component into a {@link VictoryLayerInfo}.
 */
function extractLayerFromElement(
  element: ReactElement,
  layerId: string,
  axisLabels: { x?: string; y?: string },
  inheritedPolar: boolean | undefined,
  inheritedHorizontal: boolean | undefined,
): VictoryLayerInfo | null {
  const name = getVictoryDisplayName(element.type);
  if (!name || !isDataComponent(name))
    return null;

  const props = element.props as Record<string, unknown>;
  const polar = isPolarComponent(props, inheritedPolar);
  const horizontal = isHorizontalComponent(props, inheritedHorizontal);

  let extracted: { data: VictoryLayerData; count: number } | null = null;

  switch (name) {
    case 'VictoryArea':
      extracted = extractAreaData(props);
      break;
    case 'VictoryBar':
      // Two components' worth of chart types come out of `VictoryBar`: drawn
      // polar it is a coxcomb, and floating on a chaining `y0` it is a
      // waterfall. Both fall back to a plain bar when the data does not
      // support the reading.
      extracted = polar
        ? extractPolarAreaData(props)
        : extractWaterfallData(props) ?? extractBarData(props);
      break;
    case 'VictoryErrorBar':
      extracted = extractErrorBarData(props);
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
    case 'VictoryPie':
      extracted = extractPieData(props);
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
    ...(horizontal && isOrientedKind(extracted.data.kind)
      ? { orientation: Orientation.HORIZONTAL }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Stacked bar extraction
// ---------------------------------------------------------------------------

/** One data child of a `VictoryStack`, with the name its band is announced under. */
interface StackChild {
  /** The Victory component drawing this band. */
  name: 'VictoryArea' | 'VictoryBar';
  /** The child's props, already known to carry usable `data`. */
  props: Record<string, unknown>;
  /** The band's series name, from the child's `name` prop or its position. */
  seriesName: string;
  /** Number of data elements this band contributes. */
  count: number;
}

/**
 * Collects the stackable data children of a `VictoryStack`, in children order.
 *
 * Only the two components Victory actually stacks into a readable layer are
 * kept — everything else in the container (labels, a shared tooltip) draws no
 * band and would only shift the series numbering.
 */
function collectStackChildren(children: ReactNode): StackChild[] {
  const collected: StackChild[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;
    const name = getVictoryDisplayName(child.type);
    if (name !== 'VictoryBar' && name !== 'VictoryArea')
      return;

    const props = child.props as Record<string, unknown>;
    if (!validateRawData(props.data))
      return;

    collected.push({
      name,
      props,
      seriesName: (props.name as string) ?? `Series ${collected.length + 1}`,
      count: props.data.length,
    });
  });

  return collected;
}

/**
 * Whether a stack's bands are shares of one whole.
 *
 * Victory has no `normalize` prop — unlike Vega-Lite's `stack: 'normalize'`
 * there is nothing declarative to read — so the only evidence is arithmetic:
 * every column adds up to the same whole. Both conventions authors use are
 * accepted, percentages out of 100 and fractions of 1.
 *
 * Deliberately narrow. Two or more bands and two or more columns are required,
 * because a single column summing to 100 says nothing, and the tolerance is
 * half a percent so that a stack which merely passes through 100 somewhere is
 * not swept up. A genuine unnormalized stack whose every column lands on the
 * whole would still be misread; that is the residual cost of a library that
 * does not state it.
 *
 * @param series - The extracted bands
 * @returns True when every column sums to a common whole
 */
function isNormalizedStack(series: LinePoint[][]): boolean {
  if (series.length < 2)
    return false;

  const totals = new Map<string, number>();
  for (const band of series) {
    for (const point of band) {
      // A band with a gap is not a normalized stack: its column cannot sum to
      // the whole. `Number.isFinite(null)` was already false here.
      const value = point.y;
      if (value === null || !Number.isFinite(value))
        return false;
      totals.set(String(point.x), (totals.get(String(point.x)) ?? 0) + value);
    }
  }
  if (totals.size < 2)
    return false;

  const columns = Array.from(totals.values());
  return [1, 100].some(whole =>
    columns.every(total => Math.abs(total - whole) <= whole * 0.005));
}

/**
 * Extracts a stacked-area layer from a VictoryStack of VictoryArea children.
 *
 * Each band keeps its **own** value rather than the running edge Victory
 * paints it at: `VictoryStack` accumulates through `_y0` at render time only,
 * and MAIDR's area trace deliberately computes the total itself from the
 * series it is handed, so accumulating here would double it.
 */
function extractStackedAreaLayer(
  children: StackChild[],
  layerId: string,
  axisLabels: { x?: string; y?: string },
): VictoryLayerInfo | null {
  const series: LinePoint[][] = [];
  const legend: string[] = [];
  let totalElements = 0;

  for (const { props, seriesName, count } of children) {
    const points = readLinePoints(props);
    if (!points)
      continue;

    series.push(points.map(point => ({ ...point, z: seriesName })));
    legend.push(seriesName);
    totalElements += count;
  }

  if (series.length === 0)
    return null;

  return {
    id: layerId,
    victoryType: 'VictoryStack',
    data: { kind: 'stackedArea', points: series, normalized: isNormalizedStack(series) },
    xAxisLabel: axisLabels.x,
    yAxisLabel: axisLabels.y,
    dataCount: totalElements,
    legend,
  };
}

/**
 * Which way one side of a candidate diverging chart grows.
 *
 * `SegmentedPoint.y` is typed `number | string` and the extractor below passes
 * the accessor result through as Victory handed it over, so the value is
 * coerced here before its sign is read. A side that reaches neither way (every
 * bar zero) or both ways is not a side of a diverging chart.
 *
 * @param points - One series of the stack
 * @returns The direction it grows, or null when it does not grow one way
 */
function growthDirection(points: SegmentedPoint[]): 'up' | 'down' | null {
  const values = points.map(point => Number(point.y));
  if (values.some(value => !Number.isFinite(value)))
    return null;
  if (values.every(value => value <= 0) && values.some(value => value < 0))
    return 'down';
  if (values.every(value => value >= 0) && values.some(value => value > 0))
    return 'up';
  return null;
}

/**
 * Whether a stack's series are the two sides of a diverging chart.
 *
 * A population pyramid is drawn in Victory as a stack of two bar series with
 * one of them signed negative — the same construct as an ordinary stacked bar,
 * so the values are the only thing that tells them apart. The signal is the
 * sign: exactly two series, one drawn entirely at or below the baseline and
 * the other entirely at or above it, each reaching past it at least once. A
 * stack whose bands all grow the same way is a stack.
 *
 * @param series - The extracted series, in children order
 * @returns True when the two sides diverge across a shared baseline
 */
function isDivergingPair(series: SegmentedPoint[][]): boolean {
  if (series.length !== 2)
    return false;

  const [first, second] = series.map(growthDirection);
  return first !== null && second !== null && first !== second;
}

/**
 * Extracts a layer from a `VictoryStack` or a bar `VictoryGroup`.
 *
 * The stack's children decide what it is: `VictoryBar` children make a
 * segmented (stacked) bar, where each child becomes one series (row) of
 * `SegmentedPoint[][]`, and `VictoryArea` children make a stacked area, whose
 * bands are read as a line grid instead. A stack mixing the two is read as a
 * bar stack, which is what its bars draw. Two bar series signed against each
 * other are not stacked on one another at all — they are the two sides of a
 * diverging chart, and are emitted as one.
 *
 * A `VictoryGroup` of bars is the same grid read as `dodged` rather than
 * `segmented`: the bars sit side by side rather than on one another, so
 * nothing accumulates. Only `isBarGroup` groups arrive here — see the caller —
 * so the area and diverging readings, which are things a *stack* does, cannot
 * be reached by a group.
 */
function extractSegmentedLayer(
  containerElement: ReactElement,
  containerType: 'VictoryStack' | 'VictoryGroup',
  layerId: string,
  axisLabels: { x?: string; y?: string },
  chartHorizontal: boolean | undefined,
): VictoryLayerInfo | null {
  const containerProps = containerElement.props as {
    children?: ReactNode;
    horizontal?: boolean;
  };
  // A stack carries `horizontal` of its own, and passes it to its bars — so
  // this is resolved once here rather than per child, which is also the only
  // granularity a single merged layer has.
  const horizontal = isHorizontalComponent(containerProps, chartHorizontal);
  const children = collectStackChildren(containerProps.children);
  if (children.length === 0)
    return null;

  if (children.every(child => child.name === 'VictoryArea')) {
    return extractStackedAreaLayer(children, layerId, axisLabels);
  }

  const series: SegmentedPoint[][] = [];
  const legend: string[] = [];
  let totalElements = 0;

  for (const { name, props, seriesName, count } of children) {
    if (name !== 'VictoryBar')
      continue;

    const rawData = props.data;
    if (!validateRawData(rawData))
      continue;

    const getX = resolveAccessor(props.x, 'x');
    const getY = resolveAccessor(props.y, 'y');

    series.push(rawData.map(d => ({
      x: getX(d) as string | number,
      y: getY(d) as number | string,
      z: seriesName,
    })));
    legend.push(seriesName);
    totalElements += count;
  }

  if (series.length === 0)
    return null;

  const traceType: VictoryComponentType = containerType;
  const grouped = containerType === 'VictoryGroup';
  // A diverging chart is two sides of a *stack* signed against each other. A
  // group's bars sit side by side, so two of them growing opposite ways is a
  // grouped chart of signed values and nothing more.
  const diverging = !grouped && isDivergingPair(series);

  // The sides are emitted in the order Victory paints them, which is the
  // reverse of the order they are declared in (`VictoryStack` reverses its
  // children so the topmost band paints last). A stacked bar's highlight is
  // resolved from one flat selector, which the DOM answers in document order,
  // so declaration order would put every highlight on the opposite side —
  // silent and visual-only, since the announcement never goes through the
  // element mapping.
  //
  // Only safe here because a diverging chart's sides sit either side of a
  // baseline rather than on top of one another: there is no stacking order to
  // preserve, and `DivergingTrace` resolves which side is which by reading the
  // values rather than by index. A true stack's row order **is** meaningful,
  // which is why it is left alone.
  if (diverging) {
    series.reverse();
    legend.reverse();
  }

  return {
    id: layerId,
    victoryType: traceType,
    data: diverging
      ? { kind: 'diverging', points: series }
      : { kind: grouped ? 'dodged' : 'segmented', points: series },
    xAxisLabel: axisLabels.x,
    yAxisLabel: axisLabels.y,
    ...(horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    dataCount: totalElements,
    legend,
  };
}

// ---------------------------------------------------------------------------
// Tree walking
// ---------------------------------------------------------------------------

/**
 * Whether a `VictoryGroup` is the grouped bar chart that reads as one dodged
 * layer.
 *
 * Every data child has to be a bar. A group is also Victory's way of offsetting
 * and colouring children it does not otherwise change the meaning of, and one
 * mixing a bar with a line is a combo chart: merging that would announce the
 * bars and lose the line entirely, since `extractSegmentedLayer` reads only the
 * bar children. Anything else is descended into instead.
 *
 * @param children - The group's children
 * @returns True when the group holds bars and nothing else that draws
 */
function isBarGroup(children: ReactNode): boolean {
  let bars = 0;
  let others = 0;

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;
    const name = getVictoryDisplayName(child.type);
    // A label or a shared tooltip draws no series of its own, so it neither
    // makes a group dodged nor stops it from being.
    if (!name || (!isDataComponent(name) && name !== 'VictoryStack' && name !== 'VictoryGroup'))
      return;
    if (name === 'VictoryBar')
      bars += 1;
    else
      others += 1;
  });

  return bars > 0 && others === 0;
}

/**
 * Collects the supported Victory data layers among `childNodes`.
 *
 * Handles individual data components (e.g. `<VictoryScatter>`), `<VictoryStack>`
 * for stacked bar charts, and `<VictoryGroup>` — a dodged bar chart when it
 * groups bars, and otherwise a container whose children are collected as the
 * layers they would be on their own. Layer ids are produced by `makeId`, called
 * with the layer's local index among the collected layers.
 *
 * `chartPolar` carries the enclosing `<VictoryChart polar>` down to the data
 * components, which is where Victory itself applies it: a child inherits the
 * chart's `polar` unless it declares its own.
 */
/**
 * The readings an inverted independent axis can be applied to here.
 *
 * All four draw one mark per datum, announce `layer.data` in the order it
 * arrives, and are tagged by {@link tagDiscreteElements} -- which is what
 * makes reordering expressible, since the payload and the selectors can be
 * turned round together.
 *
 * The line family is turned round too, by {@link REVERSIBLE_LINE_KINDS}, but
 * differently: it is drawn as one `<path>` with nothing to permute, so the
 * layer declares `domMapping.pointOrder` and `LineTrace` reverses the
 * vertices it parsed. That was #1007's question when this list was written
 * and is answered (#1026).
 *
 * Deliberately not in either list:
 * - `polarArea` is drawn around a circle. There is no far end of a Cartesian
 *   axis for an inverted one to draw from.
 * - `scatter` is read by `ScatterTrace`, which sorts by ascending x whatever
 *   order the layer arrived in. (A `VictoryScatter` over *categories* is
 *   `dot` rather than `scatter`, and is in the list.)
 * - `segmented` and `diverging` draw one mark per datum but are tagged with a
 *   single selector the model flattens under a row/column-major convention
 *   that is itself unsettled (#1003). Turning them round on top of that would
 *   compound two uncertainties.
 * - `box`, `candlestick` and `errorBar` have taggers of their own, and `pie`
 *   has no axis to invert.
 */
/** What a line-family layer carries when its points were turned round. */
const REVERSED_LINE_POINTS = { domMapping: { pointOrder: 'reverse' as const } };

const REVERSIBLE_KINDS = new Set(['bar', 'dot', 'histogram', 'waterfall']);

/**
 * The kinds whose points turn round by declaring it rather than by naming
 * each mark. See {@link REVERSIBLE_KINDS} for why the two lists differ.
 */
const REVERSIBLE_LINE_KINDS = new Set(['line', 'area', 'stackedArea']);

/**
 * Turns the layers of a chart round when its independent axis is inverted.
 *
 * `<VictoryAxis invertAxis />` draws the categories from the far end while
 * Victory keeps rendering the marks in data order, so a layer emitted as
 * written is announced as the mirror image of the chart (#1018). Reversing the
 * points here puts the reading in drawn order; `categoriesReversed` tells the
 * tagger to name the marks one by one so the highlight follows.
 *
 * @param layers - The layers as extracted, in data order
 * @param inverted - Whether the independent axis is inverted
 * @returns The same layers, turned round where that is expressible
 */
function readInDrawnOrder(
  layers: VictoryLayerInfo[],
  inverted: boolean,
): VictoryLayerInfo[] {
  if (!inverted) {
    return layers;
  }

  return layers.map((layer) => {
    if (REVERSIBLE_LINE_KINDS.has(layer.data.kind)) {
      // A line's payload is a row per series, so each row turns round and the
      // series keep their order.
      return {
        ...layer,
        data: {
          ...layer.data,
          points: (layer.data.points as LinePoint[][])
            .map(series => [...series].reverse()),
        } as VictoryLayerData,
        pointsReversed: true,
      };
    }
    if (!REVERSIBLE_KINDS.has(layer.data.kind)) {
      return layer;
    }
    return {
      ...layer,
      data: {
        ...layer.data,
        points: [...layer.data.points].reverse(),
      } as VictoryLayerData,
      categoriesReversed: true,
    };
  });
}

function collectDataLayers(
  childNodes: ReactNode,
  axisLabels: { x?: string; y?: string },
  makeId: (localIndex: number) => string,
  chartPolar?: boolean,
  chartHorizontal?: boolean,
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
      const segmented = extractSegmentedLayer(
        child,
        name,
        makeId(layers.length),
        axisLabels,
        chartHorizontal,
      );
      if (segmented)
        layers.push(segmented);
      return;
    }

    // VictoryGroup of bars → dodged bar
    if (name === 'VictoryGroup') {
      const groupProps = child.props as Record<string, unknown>;
      const groupChildren = groupProps.children as ReactNode;
      // A group clones its children with its own resolved `polar`, exactly as
      // `VictoryChart` does, so the outermost declaration wins here too and the
      // resolved value — not the chart's — is what the children inherit.
      // Measured by rendering each arrangement and reading whether the bars
      // came out as wedges or as rectangles:
      //
      // | arrangement                                          | Victory draws |
      // | ---------------------------------------------------- | ------------- |
      // | `<VictoryGroup polar><VictoryBar/>`                   | polar         |
      // | `<VictoryGroup><VictoryBar polar/>`                   | cartesian     |
      // | `<VictoryGroup polar={false}><VictoryBar polar/>`     | cartesian     |
      // | `<VictoryChart><VictoryGroup><VictoryBar polar/>`     | cartesian     |
      // | `<VictoryChart polar><VictoryGroup><VictoryBar/>`     | polar         |
      const groupPolar = isPolarComponent(groupProps, chartPolar);
      // A polar group draws a coxcomb, whose wedges are read one ring at a
      // time — and whose selectors have to leave the polar axis alone, which
      // only the polar-area tagging does. So it descends rather than merging,
      // and each bar is the ring it draws.
      const dodged = !groupPolar && isBarGroup(groupChildren)
        ? extractSegmentedLayer(
            child,
            name,
            makeId(layers.length),
            axisLabels,
            chartHorizontal,
          )
        : null;
      if (dodged) {
        layers.push(dodged);
        return;
      }
      // Anything else a group wraps, it is only offsetting and colouring
      // without changing what its children mean, so they are read as the layers
      // they would be on their own — a group of lines is the multi-series line
      // it draws. Descending is what keeps them from being lost: the walk used
      // to stop at the group and never reach them at all (#1057).
      layers.push(...collectDataLayers(
        groupChildren,
        axisLabels,
        index => makeId(layers.length + index),
        groupPolar,
        chartHorizontal,
      ));
      return;
    }

    // Individual data components
    const layer = extractLayerFromElement(
      child,
      makeId(layers.length),
      axisLabels,
      chartPolar,
      chartHorizontal,
    );
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
 * - `<VictoryGroup>` for dodged bar charts, and as a container otherwise
 */
export function extractVictoryLayers(children: ReactNode): VictoryLayerInfo[] {
  const layers: VictoryLayerInfo[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;

    const name = getVictoryDisplayName(child.type);

    if (name === 'VictoryChart') {
      const chartProps = child.props as { children?: ReactNode; polar?: boolean; horizontal?: boolean };
      const { labels, invertedIndependent } = extractAxisInfo(chartProps.children);
      layers.push(...readInDrawnOrder(
        collectDataLayers(
          chartProps.children,
          labels,
          n => String(layers.length + n),
          chartProps.polar,
          chartProps.horizontal,
        ),
        invertedIndependent,
      ));
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
 * across the whole figure), its own axis labels, its `title` prop as the
 * panel display name, and the `svgIndex` ordinal of its rendered svg among
 * all top-level Victory components. Charts without supported data components
 * produce an entry with empty `layers` so panel indices stay aligned with the
 * rendered SVGs; callers must drop those entries before emitting the MAIDR
 * grid.
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
  const charts: { element: ReactElement; svgIndex: number }[] = [];
  let hasStandaloneData = false;
  let svgOrdinal = 0;

  Children.forEach(children, (child) => {
    if (!isValidElement(child))
      return;
    const name = getVictoryDisplayName(child.type);
    if (!name)
      return;
    // Every top-level Victory component — chart, standalone data component,
    // legend, or unsupported component — renders its own standalone
    // VictoryContainer `<svg role="img">`, so each one occupies one svg slot
    // in the container. Tracking the ordinal keeps panels bound to their own
    // svg even when a non-chart Victory sibling precedes them in the DOM.
    const svgIndex = svgOrdinal++;
    if (name === 'VictoryChart') {
      charts.push({ element: child, svgIndex });
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

  return charts.map(({ element, svgIndex }, panelIndex) => {
    const chartProps = element.props as { children?: ReactNode; title?: string; polar?: boolean; horizontal?: boolean };
    const { labels, invertedIndependent } = extractAxisInfo(chartProps.children);
    return {
      layers: readInDrawnOrder(
        collectDataLayers(
          chartProps.children,
          labels,
          n => `${panelIndex}_${n}`,
          chartProps.polar,
          chartProps.horizontal,
        ),
        invertedIndependent,
      ),
      title: typeof chartProps.title === 'string' ? chartProps.title : undefined,
      svgIndex,
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
 * Normalises a tagged selector into the per-series array the line family
 * expects — one entry per row of the layer's `LinePoint[][]`.
 *
 * A single-series layer is tagged with one selector string and a multi-band
 * one with an array already; both have to arrive as an array, because
 * `LineTrace` compares the selector count against its series count and would
 * otherwise measure the length of a string.
 *
 * @param selector - The selector produced by the DOM tagging pass
 * @returns One selector per series, or undefined when nothing was tagged
 */
function toSeriesSelectors(
  selector?: string | string[] | BoxSelector[] | CandlestickSelector,
): string[] | undefined {
  if (typeof selector === 'string')
    return [selector];
  if (Array.isArray(selector) && selector.every(one => typeof one === 'string'))
    return selector;
  return undefined;
}

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
  selector?: string | string[] | BoxSelector[] | CandlestickSelector,
): MaidrLayer {
  // A horizontal bar layer is emitted in the arrangement the core reads it in:
  // `x` holds the magnitude and `y` the category, the reverse of Victory's own
  // data, which stays `x = category` however the chart is drawn. Declaring the
  // key over Victory's arrangement instead would be worse than the bug it
  // fixes -- `BarTrace` would read a category name as the magnitude and every
  // bar would go silent (#950 warns about exactly that payload).
  const horizontal = layer.orientation === Orientation.HORIZONTAL;
  const [xLabel, yLabel] = horizontal
    ? [layer.yAxisLabel, layer.xAxisLabel]
    : [layer.xAxisLabel, layer.yAxisLabel];
  const axes: MaidrLayer['axes'] = {
    x: xLabel ? { label: xLabel } : undefined,
    y: yLabel ? { label: yLabel } : undefined,
  };

  const { data } = layer;

  switch (data.kind) {
    case 'bar':
      return {
        id: layer.id,
        type: TraceType.BAR,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        selectors: selector,
        data: horizontal ? data.points.map(swapBarPoint) : data.points,
      };

    case 'line':
      return {
        id: layer.id,
        type: data.stepDirection ? TraceType.STEP : TraceType.LINE,
        axes,
        selectors: selector ? [selector as string] : undefined,
        ...(data.stepDirection ? { stepDirection: data.stepDirection } : {}),
        ...(layer.pointsReversed ? REVERSED_LINE_POINTS : {}),
        data: data.points,
      };

    case 'area':
      return {
        id: layer.id,
        type: TraceType.AREA,
        axes,
        selectors: toSeriesSelectors(selector),
        ...(layer.pointsReversed ? REVERSED_LINE_POINTS : {}),
        data: data.points,
      };

    case 'stackedArea':
      return {
        id: layer.id,
        type: data.normalized ? TraceType.NORMALIZED_AREA : TraceType.STACKED_AREA,
        axes,
        selectors: toSeriesSelectors(selector),
        ...(layer.pointsReversed ? REVERSED_LINE_POINTS : {}),
        data: data.points,
      };

    case 'polarArea':
      return {
        id: layer.id,
        type: TraceType.POLAR_AREA,
        axes,
        selectors: toSeriesSelectors(selector),
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

    case 'dot':
      return {
        id: layer.id,
        type: TraceType.DOT,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        selectors: selector,
        data: horizontal ? data.points.map(swapBarPoint) : data.points,
      };

    // An interval keeps its `x` and its bounds under `horz` -- the grammar's
    // table says so -- and reads the sample off `axes.y`, which the swap above
    // puts the category label on once this key is set. As with the box, the
    // labels were not wrong before: the swap is gated on the same key, so both
    // halves moved together either way. What the key buys is the announcement
    // and the walk matching the chart as drawn.
    case 'errorBar':
      return {
        id: layer.id,
        type: TraceType.ERROR_BAR,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        selectors: selector,
        data: data.points,
      };

    case 'waterfall':
      return {
        id: layer.id,
        type: TraceType.WATERFALL,
        axes,
        selectors: selector,
        data: data.points,
      };

    // A `<VictoryBoxPlot horizontal>` draws its groups down the page, and the
    // key says so. Nothing is exchanged in the payload -- a `BoxPoint` has no
    // `x` or `y` -- and the labels do not move on their own either: the swap
    // above is gated on this same key, so without it the pair stayed put and
    // `BoxTrace`'s upright branch read the group off `axes.x`, which still
    // held it. The labels were therefore right before this and are right
    // after; what the key buys is the two things that were wrong -- the chart
    // announced itself as a vertical box plot, and left and right walked
    // across groups that are stacked down the page rather than along the
    // measurement axis they are drawn on. Measured in Chromium on the
    // `Box Plot (horizontal)` example, before and after:
    //
    //   before   "vertical box"     right: A -> B (across the groups)
    //   after    "horizontal box"   right: C's minimum, quartiles ... ; up: C -> B
    case 'box':
      return {
        id: layer.id,
        type: TraceType.BOX,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
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
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        selectors: selector,
        data: horizontal ? data.points.map(swapHistogramPoint) : data.points,
      };

    case 'pie':
      return {
        id: layer.id,
        type: TraceType.PIE,
        // A VictoryPie stands alone — there is no VictoryAxis to read a label
        // off, and the core's "X"/"Y" fallback would announce "X is Apples, Y
        // is 30", naming neither position. Name what the two actually mean on
        // a pie instead; a label from an enclosing VictoryChart still wins.
        axes: {
          x: { label: layer.xAxisLabel ?? 'Category' },
          y: { label: layer.yAxisLabel ?? 'Value' },
        },
        selectors: selector,
        data: data.points,
      };

    // Side by side rather than on one another: nothing accumulates, so the
    // values are announced as they are. Otherwise the same grid a stack walks.
    case 'dodged':
      return {
        id: layer.id,
        type: TraceType.DODGED,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        selectors: selector,
        data: horizontal ? data.points.map(swapSeries) : data.points,
      };

    case 'segmented':
      return {
        id: layer.id,
        type: TraceType.STACKED,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        selectors: selector,
        data: horizontal ? data.points.map(swapSeries) : data.points,
      };

    case 'diverging':
      return {
        id: layer.id,
        type: TraceType.DIVERGING,
        ...(layer.orientation ? { orientation: layer.orientation } : {}),
        axes,
        // The values stay signed as the chart draws them. `DivergingTrace`
        // reads the sign as the side a bar points to and pitches the
        // magnitude, so stripping it here would leave the left-hand series
        // indistinguishable from the right.
        selectors: selector,
        data: horizontal ? data.points.map(swapSeries) : data.points,
      };
  }
}
