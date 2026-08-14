/**
 * Data extraction functions that convert amCharts 5 series data
 * into MAIDR-compatible data point arrays.
 */

import type {
  BarPoint,
  DumbbellPoint,
  GanttData,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  PiePoint,
  SegmentedPoint,
  TreemapPoint,
  WaterfallKind,
  WaterfallPoint,
} from '@type/grammar';
import type { AmAxis, AmDataItem, AmXYSeries } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a string label from an axis, falling back to `"x"` / `"y"`.
 */
export function readAxisLabel(axis: AmAxis | undefined, fallback: string): string {
  if (!axis)
    return fallback;

  const titleEntity = axis.get('title');
  if (titleEntity != null && typeof (titleEntity as Record<string, unknown>).get === 'function') {
    const text = (titleEntity as { get: (k: string) => unknown }).get('text');
    if (typeof text === 'string' && text.length > 0)
      return text;
  }

  const name = axis.get('name');
  if (typeof name === 'string' && name.length > 0)
    return name;
  return fallback;
}

/**
 * Determine whether a series is category-based (bar/column) vs. value-based.
 */
function hasCategoryX(series: AmXYSeries): boolean {
  return typeof series.get('categoryXField') === 'string';
}

function hasCategoryY(series: AmXYSeries): boolean {
  return typeof series.get('categoryYField') === 'string';
}

/**
 * Determine whether a line series is drawn with the region between it and the
 * baseline filled in — which is what makes it an area chart.
 *
 * amCharts has no area series: an area is a `LineSeries` whose `fills`
 * template has been made visible (`fills.template.setAll({ visible: true,
 * fillOpacity: 0.5 })` is the documented recipe), so those settings are the
 * only runtime signal there is. An explicit `visible: false` settles the
 * question on its own — a template can carry a fill opacity it never paints
 * with — and otherwise a declared opacity decides, since a fill at opacity
 * zero draws nothing whatever it claims to be.
 */
function hasVisibleFill(series: AmXYSeries): boolean {
  const template = series.fills?.template;
  if (!template || typeof template.get !== 'function')
    return false;

  const visible = template.get('visible');
  if (visible === false)
    return false;

  const opacity = template.get('fillOpacity');
  if (typeof opacity === 'number')
    return opacity > 0;
  return visible === true;
}

/**
 * Where a floating column keeps its two ends.
 *
 * A column bound to a date axis may carry its ends as `Date`s under the
 * `dateX` pair rather than as numbers under the `valueX` one, so both are
 * tried in turn — the first key that holds anything wins.
 */
const OPEN_Y_KEYS = ['openValueY'];
const VALUE_Y_KEYS = ['valueY'];
const OPEN_X_KEYS = ['openValueX', 'openDateX'];
const VALUE_X_KEYS = ['valueX', 'dateX'];

/** One floating column: the category it sits at, and the interval it spans. */
interface Span {
  /** The live data item, which the highlight path resolves back to. */
  item: AmDataItem;
  category: string | number;
  start: number;
  end: number;
}

/**
 * Read one end of a span, as a number, from the first key that holds a value.
 *
 * A date axis stores a `Date` where a value axis stores a number, and the two
 * are the same position on the same axis — so the date is read as its
 * timestamp rather than skipped.
 */
function readSpanEnd(item: AmDataItem, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = item.get(key);
    if (value == null)
      continue;
    return toNumber(value instanceof Date ? value.getTime() : value);
  }
  return null;
}

/**
 * Read every floating column of a series as a category and an interval.
 *
 * Shared by the three charts amCharts draws with `openValue*` columns — a
 * waterfall, a dumbbell and a gantt — which differ in what the interval means
 * and not in how it is stored. Items missing a category or either end are
 * skipped, exactly as {@link extractBarPoints} skips them, so an index into
 * the result keeps naming the column it addresses.
 */
function readSpans(
  series: AmXYSeries,
  categoryKey: string,
  openKeys: readonly string[],
  valueKeys: readonly string[],
): Span[] {
  const spans: Span[] = [];

  for (const item of series.dataItems) {
    const category = item.get(categoryKey);
    const start = readSpanEnd(item, openKeys);
    const end = readSpanEnd(item, valueKeys);

    if (category == null || start == null || end == null)
      continue;

    spans.push({ item, category: toStringOrNumber(category), start, end });
  }

  return spans;
}

/**
 * Strip binary floating-point noise from a magnitude obtained by subtraction.
 *
 * `MAIDR`'s own gantt trace does the same to the lengths it derives, for the
 * same reason: `2.3 - 1.1` announces as `1.2000000000000002` otherwise, and a
 * waterfall's contribution is the number the chart exists to report.
 */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

// ---------------------------------------------------------------------------
// Column / Bar extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link BarPoint} data from a column or bar series.
 */
export function extractBarPoints(series: AmXYSeries): BarPoint[] {
  const points: BarPoint[] = [];

  const isHorizontal = hasCategoryY(series);
  const categoryField = isHorizontal ? 'categoryY' : 'categoryX';
  const valueField = isHorizontal ? 'valueX' : 'valueY';

  for (const item of series.dataItems) {
    const category = item.get(categoryField);
    const value = item.get(valueField);

    if (category == null || value == null)
      continue;

    const numValue = toNumber(value);
    if (numValue == null)
      continue;

    points.push({
      x: isHorizontal ? numValue : toStringOrNumber(category),
      y: isHorizontal ? toStringOrNumber(category) : numValue,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Segmented bar extraction (stacked / dodged / normalized)
// ---------------------------------------------------------------------------

/**
 * Extract {@link SegmentedPoint} data from a single column series that is
 * part of a multi-series (segmented) bar chart.
 *
 * The series name is used as the `fill` group identifier — this follows the
 * ggplot2 convention where `fill` maps a variable to grouped visual encoding.
 */
export function extractSegmentedPoints(series: AmXYSeries): SegmentedPoint[] {
  const points: SegmentedPoint[] = [];
  const fill = (series.get('name') as string | undefined) ?? '';

  const isHorizontal = hasCategoryY(series);
  const categoryField = isHorizontal ? 'categoryY' : 'categoryX';
  const valueField = isHorizontal ? 'valueX' : 'valueY';

  for (const item of series.dataItems) {
    const category = item.get(categoryField);
    const value = item.get(valueField);

    if (category == null || value == null)
      continue;

    const numValue = toNumber(value);
    if (numValue == null)
      continue;

    points.push({
      x: isHorizontal ? numValue : toStringOrNumber(category),
      y: isHorizontal ? toStringOrNumber(category) : numValue,
      z: fill,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Histogram extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link HistogramPoint} data from a column series that represents
 * a histogram (value-based X axis with openValueX for bin edges).
 */
export function extractHistogramPoints(series: AmXYSeries): HistogramPoint[] {
  const points: HistogramPoint[] = [];

  for (const item of series.dataItems) {
    const valueX = item.get('valueX');
    const openValueX = item.get('openValueX');
    const valueY = item.get('valueY');

    if (valueX == null || valueY == null)
      continue;

    const xEnd = toNumber(valueX);
    const y = toNumber(valueY);
    if (xEnd == null || y == null)
      continue;

    const xStart = openValueX != null ? (toNumber(openValueX) ?? xEnd) : xEnd;

    const xMin = Math.min(xStart, xEnd);
    const xMax = Math.max(xStart, xEnd);

    points.push({
      x: (xMin + xMax) / 2,
      y,
      xMin,
      xMax,
      yMin: 0,
      yMax: y,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Waterfall extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link WaterfallPoint} data from a column series drawn as a bridge.
 *
 * The bar floats between the running total before the step and the total after
 * it, which is the pair amCharts keeps in `openValueY` / `valueY`. Both are
 * carried, plus the contribution between them: a bar chart would conflate the
 * two, and "how big was this step" and "where did it leave us" are different
 * questions.
 */
export function extractWaterfallPoints(series: AmXYSeries): WaterfallPoint[] {
  return readSpans(series, 'categoryX', OPEN_Y_KEYS, VALUE_Y_KEYS).map((span) => {
    const delta = withoutFloatNoise(span.end - span.start);
    return {
      x: span.category,
      start: span.start,
      end: span.end,
      delta,
      kind: waterfallKind(span.start, delta),
    };
  });
}

/**
 * Whether a step moves the running total or restates it.
 *
 * A bar that sits on the baseline restates it — the opening bar, the closing
 * bar, and any subtotal drawn along the way — which is the same signature
 * {@link isWaterfallChain} reads when it decides a series is a bridge at all.
 */
function waterfallKind(start: number, delta: number): WaterfallKind {
  if (start === 0)
    return 'total';
  return delta < 0 ? 'decrease' : 'increase';
}

// ---------------------------------------------------------------------------
// Dumbbell extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link DumbbellPoint} data from a column series drawn as a barbell.
 *
 * The same `openValueY` / `valueY` pair a waterfall uses, read as the two
 * values compared at one category rather than as a running total: which of the
 * two is larger is not fixed, and a chart usually holds both directions at
 * once.
 *
 * The two ends are deliberately not named here. amCharts names the series, not
 * the ends, so anything read off the chart would be a guess; the adapter takes
 * them from an option instead, and the trace announces "start" and "end" when
 * it has nothing better.
 */
export function extractDumbbellPoints(series: AmXYSeries): DumbbellPoint[] {
  return readSpans(series, 'categoryX', OPEN_Y_KEYS, VALUE_Y_KEYS).map(span => ({
    x: span.category,
    start: span.start,
    end: span.end,
  }));
}

/**
 * The live data items behind a vertical series of floating columns, in the
 * order {@link extractWaterfallPoints} and {@link extractDumbbellPoints} emit
 * them.
 *
 * Both skip columns missing a category or either end, so the highlight path
 * has to skip the same ones — otherwise a single incomplete record shifts
 * every later highlight onto its neighbour.
 */
export function extractSpanItems(series: AmXYSeries): AmDataItem[] {
  return readSpans(series, 'categoryX', OPEN_Y_KEYS, VALUE_Y_KEYS).map(span => span.item);
}

// ---------------------------------------------------------------------------
// Gantt extraction
// ---------------------------------------------------------------------------

/**
 * How long one unit of a `DateAxis` base interval lasts, in milliseconds.
 *
 * A month and a year have no fixed length; the approximations here are the
 * ones amCharts uses for its own duration arithmetic. They only ever scale a
 * length that is then announced with the unit's name, so a schedule measured
 * in months reads as months rather than as nine-figure millisecond counts.
 */
const TIME_UNIT_MS: Record<string, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

/** How a date axis' positions are turned into readable lengths. */
interface TimeScale {
  /** Milliseconds per unit. */
  divisor: number;
  /** What one unit is called, as {@link GanttData.unit} carries it. */
  unit: string;
}

/**
 * The scale a gantt's axis positions are reported in.
 *
 * A `DateAxis` stores positions as epoch milliseconds, and the length of an
 * interval is the fact a schedule exists to carry — announced in milliseconds
 * it carries nothing. So the axis' own base interval names the unit, and the
 * positions are rescaled to it. Its `count` is ignored on purpose: the unit
 * that travels with the numbers is the time unit's name, and dividing by a
 * multiple of it would make the two disagree.
 *
 * Returns `null` for a value axis, whose numbers are already in whatever unit
 * the chart's author chose and must be passed through untouched.
 */
function readTimeScale(axis: AmAxis | undefined): TimeScale | null {
  const interval = axis?.get('baseInterval');
  if (interval == null || typeof interval !== 'object')
    return null;

  const timeUnit = (interval as { timeUnit?: unknown }).timeUnit;
  if (typeof timeUnit !== 'string')
    return null;

  const divisor = TIME_UNIT_MS[timeUnit];
  return divisor ? { divisor, unit: `${timeUnit}s` } : null;
}

/**
 * The lanes a gantt's category axis declares, in axis order.
 *
 * Read from the axis rather than from the series so a lane with nothing booked
 * still exists: an empty lane is a real statement about a schedule, and a lane
 * list derived from the intervals alone cannot make one.
 */
function readLaneNames(axis: AmAxis | undefined): (string | number)[] {
  const lanes: (string | number)[] = [];
  for (const item of axis?.dataItems ?? []) {
    const category = item.get('category');
    if (category != null)
      lanes.push(toStringOrNumber(category));
  }
  return lanes;
}

/**
 * Extract {@link GanttData} from a column series drawn as a schedule.
 *
 * amCharts draws a gantt as floating columns on a category axis of lanes and a
 * date axis of time, which is the pair this reads: one lane per category axis
 * item, one interval per column, and the unit from the date axis' own base
 * interval.
 *
 * Positions are reported relative to the earliest interval on a date axis, so
 * a schedule reads as "day 0 to day 30" rather than as two epoch timestamps
 * thirteen digits long. The absolute dates are dropped by that: what a reader
 * wants from a schedule is relational — what overlaps what, what hands over to
 * what — and every one of those questions survives the shift, while none of
 * them survives a length announced in milliseconds.
 *
 * @returns The chart's lanes and intervals, or `null` when no column carries a
 *   readable interval.
 */
export function extractGanttData(series: AmXYSeries): GanttData | null {
  const grouped = groupGanttSpans(series);
  if (!grouped)
    return null;

  const { lanes, spans, scale } = grouped;
  const origin = scale
    ? Math.min(...spans.flat().map(span => span.start))
    : 0;
  const rescale = (value: number): number =>
    scale ? withoutFloatNoise((value - origin) / scale.divisor) : value;

  return {
    points: spans.map(lane => lane.map(span => ({
      x: span.category,
      start: rescale(span.start),
      end: rescale(span.end),
    }))),
    lanes,
    ...(scale ? { unit: scale.unit } : {}),
  };
}

/**
 * The live data items behind a gantt's intervals, lane by lane.
 *
 * Grouped by the same pass {@link extractGanttData} emits from, so a MAIDR
 * `[lane, interval]` position addresses the same column in both — which is
 * what lets the highlight land on the bar the reader is being told about.
 */
export function extractGanttItems(series: AmXYSeries): AmDataItem[][] {
  const grouped = groupGanttSpans(series);
  return grouped ? grouped.spans.map(lane => lane.map(span => span.item)) : [];
}

/** A gantt's intervals, gathered into the lanes the chart draws them in. */
interface GanttLanes {
  lanes: (string | number)[];
  spans: Span[][];
  scale: TimeScale | null;
}

/**
 * Group a gantt series' columns into lanes.
 *
 * The category axis supplies the lanes and their order, so a lane with nothing
 * booked survives; a category the axis does not declare is appended rather
 * than dropped, which would lose its intervals entirely.
 */
function groupGanttSpans(series: AmXYSeries): GanttLanes | null {
  const columns = readSpans(series, 'categoryY', OPEN_X_KEYS, VALUE_X_KEYS);
  if (columns.length === 0)
    return null;

  const lanes = readLaneNames(series.get('yAxis') as AmAxis | undefined);
  const rowOf = new Map<string, number>(lanes.map((lane, row) => [String(lane), row]));
  const spans: Span[][] = lanes.map(() => []);

  for (const column of columns) {
    const key = String(column.category);
    let row = rowOf.get(key);
    if (row === undefined) {
      row = spans.length;
      rowOf.set(key, row);
      lanes.push(column.category);
      spans.push([]);
    }
    spans[row].push(column);
  }

  return { lanes, spans, scale: readTimeScale(series.get('xAxis') as AmAxis | undefined) };
}

// ---------------------------------------------------------------------------
// Heatmap extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link HeatmapData} from a column series that uses two category
 * axes (categoryX and categoryY) to form a 2D grid.
 *
 * The heat value is read from `value`, `valueY`, or `valueX` data fields.
 */
export function extractHeatmapData(series: AmXYSeries): HeatmapData | null {
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xIndex = new Map<string, number>();
  const yIndex = new Map<string, number>();
  const valueMap = new Map<string, number>();

  for (const item of series.dataItems) {
    const catX = item.get('categoryX');
    const catY = item.get('categoryY');
    const value = readHeatmapValue(item);

    if (catX == null || catY == null || value == null)
      continue;

    const x = String(catX);
    const y = String(catY);

    if (!xIndex.has(x)) {
      xIndex.set(x, xLabels.length);
      xLabels.push(x);
    }
    if (!yIndex.has(y)) {
      yIndex.set(y, yLabels.length);
      yLabels.push(y);
    }

    valueMap.set(`${xIndex.get(x)},${yIndex.get(y)}`, value);
  }

  if (xLabels.length === 0 || yLabels.length === 0)
    return null;

  // Build 2D points grid: points[yIdx][xIdx]
  const points: number[][] = yLabels.map((_, yi) =>
    xLabels.map((_, xi) => valueMap.get(`${xi},${yi}`) ?? 0),
  );

  return { x: xLabels, y: yLabels, points };
}

/**
 * Read the numeric heat value from a data item, trying multiple common fields.
 */
function readHeatmapValue(item: AmDataItem): number | null {
  for (const key of ['value', 'valueY', 'valueX']) {
    const val = item.get(key);
    if (val != null) {
      const n = Number(val);
      if (Number.isFinite(n))
        return n;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Line extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link LinePoint} data from a single line series.
 * Returns a flat array of points for one series. The adapter aggregates
 * multiple series into the 2D array (`LinePoint[][]`) that MAIDR expects.
 */
export function extractLinePoints(series: AmXYSeries): LinePoint[] {
  const seriesName = series.get('name') as string | undefined;
  const points: LinePoint[] = [];

  for (const item of series.dataItems) {
    const x = readXValue(item, series);
    const y = item.get('valueY');

    if (x == null || y == null)
      continue;

    const yNum = toNumber(y);
    if (yNum == null)
      continue;

    const point: LinePoint = { x: toStringOrNumber(x), y: yNum };
    if (seriesName)
      point.z = seriesName;
    points.push(point);
  }

  return points;
}

// ---------------------------------------------------------------------------
// Pie extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link PiePoint} data from an am5percent pie series.
 *
 * Also serves an am5percent funnel series, whose stages carry the same
 * `category`/`value` pair in the same data order — a funnel's `BarPoint[]` and
 * a pie's `PiePoint[]` are the same `{ x, y }` shape.
 *
 * A pie series is bound to no axis: each data item carries the slice's
 * `category` and its `value`, and the wedges are drawn in data-item order.
 * Items with no category or no finite value are skipped — a slice with
 * nothing to sonify would still take a navigation step and shift every later
 * slice away from the wedge it names.
 *
 * The share each slice represents is deliberately not computed here. MAIDR's
 * pie trace derives it from the values, so a percentage cannot drift out of
 * step with the numbers it was supposedly derived from.
 */
export function extractPiePoints(series: AmXYSeries): PiePoint[] {
  const points: PiePoint[] = [];

  for (const item of series.dataItems) {
    const category = item.get('category');
    const value = item.get('value');

    if (category == null || value == null)
      continue;

    const numValue = toNumber(value);
    if (numValue == null)
      continue;

    points.push({ x: toStringOrNumber(category), y: numValue });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Hierarchy extraction
// ---------------------------------------------------------------------------

/**
 * One node of an am5hierarchy series, as the walk reaches it.
 *
 * Carries the live data item alongside the values, because the highlight path
 * needs the node the reader is on and the walk is the only place the two are
 * known together — an am5hierarchy series keeps only its root in `dataItems`,
 * and every other node is reachable only by descending from it.
 */
export interface AmHierarchyNode {
  dataItem: AmDataItem;
  /** What the node is called. */
  name: string | number;
  /** Its ancestors' names, outermost first, excluding the node and the root. */
  path: (string | number)[];
  /** Levels below the tree root — the row a MAIDR treemap addresses it by. */
  depth: number;
  /** Its own declared magnitude, or `null` for a node that has none. */
  value: number | null;
}

/**
 * Walk an am5hierarchy series and return every node below its root, in
 * depth-first order.
 *
 * The root itself is skipped. amCharts hierarchy data is one root object whose
 * `children` are the branches — commonly a synthetic "Root" the chart is even
 * configured to hide (`topDepth: 1`) — so keeping it would add a level that
 * always holds one node worth 100% of the chart, and put every reader one
 * extra step away from the data.
 *
 * Depth-first is what makes the order usable: MAIDR's treemap addresses a node
 * by `[depth][index within depth]` and takes the index from the order the
 * nodes were declared in, so a walk that visits each subtree completely gives
 * every level its left-to-right order.
 */
export function extractHierarchyNodes(series: AmXYSeries): AmHierarchyNode[] {
  const nodes: AmHierarchyNode[] = [];

  const visit = (item: AmDataItem, path: (string | number)[]): void => {
    const category = item.get('category');
    const name = category != null ? toStringOrNumber(category) : '';
    nodes.push({
      dataItem: item,
      name,
      path,
      depth: path.length,
      // The node's own value, never the aggregate amCharts keeps in `sum`: a
      // branch's total is derived from its children by the trace, and reading
      // the aggregate back would declare a total that cannot then disagree
      // with the children even when the chart says it does.
      value: toNumber(item.get('value')),
    });

    const childPath = [...path, name];
    for (const child of childItems(item)) {
      visit(child, childPath);
    }
  };

  const roots = series.dataItems;
  if (roots.length === 1) {
    // The ordinary case: amCharts takes one root object and treats every other
    // data item as unreachable, so the root is the container and its children
    // are the top level.
    for (const child of childItems(roots[0])) {
      visit(child, []);
    }
  } else {
    // Several top-level records, which amCharts does not itself lay out. There
    // is no container root here, so the records ARE the top level; dropping
    // all but the first would silently lose most of the tree.
    for (const item of roots) {
      visit(item, []);
    }
  }

  return nodes;
}

/** A hierarchy data item's child items, or `[]` for a leaf. */
function childItems(item: AmDataItem): AmDataItem[] {
  const children = item.get('children');
  return Array.isArray(children) ? (children as AmDataItem[]) : [];
}

/**
 * Convert an am5hierarchy series into {@link TreemapPoint} data.
 *
 * Every node is emitted, not only the leaves: the trace derives a branch's
 * total from its children, but a branch that declares a value of its own may
 * carry mass no child accounts for, and only a declared value can say so. A
 * node with no value of its own is emitted without one and totalled from
 * below, which is the ordinary case for a branch.
 */
export function extractHierarchyPoints(series: AmXYSeries): TreemapPoint[] {
  return extractHierarchyNodes(series).map(node => ({
    x: node.name,
    ...(node.value != null ? { y: node.value } : {}),
    path: node.path,
  }));
}

// ---------------------------------------------------------------------------
// Series type detection
// ---------------------------------------------------------------------------

/** Recognized amCharts 5 series class names. */
const COLUMN_CLASSES = new Set([
  'ColumnSeries',
  'CurvedColumnSeries',
]);

const LINE_CLASSES = new Set([
  'LineSeries',
  'SmoothedXLineSeries',
  'SmoothedYLineSeries',
  'SmoothedXYLineSeries',
]);

/**
 * Series amCharts draws as a staircase. The values are piecewise constant —
 * held across an interval and then jumped — so describing one as a line would
 * tell a reader the value moved gradually between samples when it did not.
 */
const STEP_CLASSES = new Set([
  'StepLineSeries',
]);

/**
 * Series drawn as wedges of a circle by an am5percent `PieChart`. They must be
 * recognised explicitly: {@link classifySeriesKind} answers `'bar'` for
 * anything it does not know, so an unlisted pie series would be silently
 * converted into a bar chart of its slices rather than failing loudly.
 */
const PIE_CLASSES = new Set([
  'PieSeries',
]);

/**
 * Series an am5percent `SlicedChart` draws as ordered stages — a funnel, its
 * triangular pyramid variant, and the pictorial stack. All three carry one
 * `category`/`value` pair per stage in data order, which is exactly the
 * retention reading MAIDR's funnel trace is built on, so all three map to it.
 */
const FUNNEL_CLASSES = new Set([
  'FunnelSeries',
  'PyramidSeries',
  'PictorialStackedSeries',
]);

/**
 * Series an am5radar `RadarChart` draws around a circle, joined into a closed
 * outline. Recognising them explicitly is what keeps a radar from being read
 * as something else: a `RadarChart` extends `XYChart`, so the adapter has
 * always found it, and {@link classifySeriesKind} answers `'bar'` for anything
 * it does not know — a radar was therefore announced as a row of bars.
 */
const RADAR_LINE_CLASSES = new Set([
  'RadarLineSeries',
  'SmoothedRadarLineSeries',
]);

/**
 * The same spokes drawn as wedges rather than as an outline — a coxcomb or
 * rose chart. Read exactly as a radar is; only the mark differs.
 */
const RADAR_COLUMN_CLASSES = new Set([
  'RadarColumnSeries',
]);

/**
 * Series of the am5hierarchy module, and the tree layout each one draws.
 *
 * These are not chart series: an am5hierarchy series is pushed straight into a
 * plain container, with no chart object around it, which is why the adapter's
 * discovery has to recognise the series itself. `Sunburst` is deliberately
 * absent — it extends `Partition` but carries its own class name, so leaving
 * it out keeps it out rather than reading it as an icicle.
 */
const HIERARCHY_KINDS: Record<string, SeriesKind> = {
  Treemap: 'treemap',
  Partition: 'icicle',
};

/** The class names {@link HIERARCHY_KINDS} covers, for discovery to probe. */
export const HIERARCHY_CLASSES = new Set(Object.keys(HIERARCHY_KINDS));

/** Whether a series binds any of the named open-value settings to a field. */
function hasOpenField(series: AmXYSeries, ...settings: string[]): boolean {
  return settings.some(setting => typeof series.get(setting) === 'string');
}

/**
 * Whether a series of floating columns is a bridge rather than a barbell.
 *
 * A waterfall chains: each step opens where the one before it closed, because
 * the bars trace a single running total. A dumbbell's pairs are independent —
 * two values compared at one category — so the chain breaks at the second row
 * of any real one, which makes it decisive rather than merely suggestive.
 *
 * A step that opens on the baseline is not a link in the chain: those are the
 * opening, closing and subtotal bars, which restate the running total instead
 * of continuing it, and every real waterfall ends with one.
 */
function isWaterfallChain(series: AmXYSeries): boolean {
  let previousEnd: number | null = null;

  for (const span of readSpans(series, 'categoryX', OPEN_Y_KEYS, VALUE_Y_KEYS)) {
    if (span.start === 0) {
      previousEnd = span.end;
      continue;
    }
    if (previousEnd !== null && !nearlyEqual(span.start, previousEnd))
      return false;
    previousEnd = span.end;
  }

  return true;
}

/**
 * Whether two axis positions are the same value.
 *
 * Compared with a relative tolerance because a running total is commonly
 * carried through a producer's own arithmetic before it is authored, and a
 * chain broken by the last bit of a float would read the chart as the wrong
 * type entirely.
 */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export type SeriesKind
  = | 'bar'
    | 'line'
    | 'area'
    | 'step'
    | 'histogram'
    | 'heatmap'
    | 'pie'
    | 'funnel'
    | 'radar'
    | 'polar'
    | 'waterfall'
    | 'dumbbell'
    | 'gantt'
    | 'treemap'
    | 'icicle'
    | 'unknown';

/**
 * Determine the MAIDR trace kind for a given amCharts series.
 */
export function classifySeriesKind(series: AmXYSeries): SeriesKind {
  const className = series.className ?? '';

  // Radar first: its series carry their own class names, and a radar chart is
  // otherwise indistinguishable from any other XY chart at this level.
  if (RADAR_LINE_CLASSES.has(className)) {
    return 'radar';
  }

  if (RADAR_COLUMN_CLASSES.has(className)) {
    return 'polar';
  }

  const hierarchy = HIERARCHY_KINDS[className];
  if (hierarchy) {
    return hierarchy;
  }

  if (COLUMN_CLASSES.has(className)) {
    // Heatmap: both category X and category Y fields.
    if (hasCategoryX(series) && hasCategoryY(series))
      return 'heatmap';

    // A schedule: lanes on the category axis, and columns that float between
    // two positions on the time axis rather than rising from a baseline.
    if (hasCategoryY(series) && hasOpenField(series, 'openValueXField', 'openDateXField'))
      return 'gantt';

    // A bridge and a barbell share this signature exactly — floating columns
    // at one category each — so the chain is what separates them.
    if (hasCategoryX(series) && hasOpenField(series, 'openValueYField'))
      return isWaterfallChain(series) ? 'waterfall' : 'dumbbell';

    // Histogram: value-based X axis with openValueX bin edges.
    if (!hasCategoryX(series) && !hasCategoryY(series)
      && typeof series.get('openValueXField') === 'string') {
      return 'histogram';
    }

    return 'bar';
  }

  if (LINE_CLASSES.has(className)) {
    // amCharts draws an area with the line series, so the fill is the only
    // thing that separates the two.
    if (hasVisibleFill(series))
      return 'area';

    // A "line" series with value-only axes (no category) is still a line in MAIDR.
    return 'line';
  }

  if (STEP_CLASSES.has(className)) {
    return 'step';
  }

  if (PIE_CLASSES.has(className)) {
    return 'pie';
  }

  if (FUNNEL_CLASSES.has(className)) {
    return 'funnel';
  }

  // Default to bar for category-based series.
  return 'bar';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function readXValue(item: AmDataItem, series: AmXYSeries): unknown {
  // Try category first, then numeric value.
  const cat = item.get('categoryX');
  if (cat != null)
    return cat;
  const val = item.get('valueX');
  if (val != null)
    return val;

  // Date axis: amCharts stores Date objects.
  const dateX = item.get('dateX');
  if (dateX instanceof Date)
    return dateX.toISOString();

  // Try reading from the category field name.
  const fieldName = series.get('categoryXField') as string | undefined;
  if (fieldName)
    return item.get(fieldName);

  return undefined;
}

/**
 * Convert an unknown value to a finite number, or `null` if the
 * conversion is not possible. Callers should skip data items that
 * return `null` to avoid silent data corruption.
 */
function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNumber(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value))
    return value;
  return String(value ?? '');
}
