/**
 * Data extraction functions that convert amCharts 5 series data
 * into MAIDR-compatible data point arrays.
 */

import type {
  BarPoint,
  CandlestickPoint,
  ChoroplethPoint,
  DumbbellPoint,
  FlowPoint,
  GanttData,
  GaugeBand,
  GaugePoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  NetworkPoint,
  PiePoint,
  SegmentedPoint,
  TreemapPoint,
  WaterfallKind,
  WaterfallPoint,
} from '@type/grammar';
import type { AmAxis, AmChart, AmDataItem, AmSprite, AmXYSeries } from './types';
import { resolveFieldRef } from '@adapters/shared/traceDeclaration';
import { TraceType } from '@type/grammar';

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
 * Hand over a series' data items in the order amCharts drew them.
 *
 * amCharts hands `dataItems` over in the axis' declared order whichever way
 * the axis is drawn -- measured, `A, B, C, D` arrive in that order whether or
 * not the renderer is `inversed`, and only the pixels move. So a series laid
 * along an inversed axis is drawn from the far end, and reading its items as
 * they arrive walks the chart backwards: `Right` moves leftwards across a
 * vertical chart and downwards through a horizontal one (#1037).
 *
 * Only the axis the marks run **along** is asked. A line whose *value* axis is
 * inversed is how a bump chart puts first place at the top ({@link hasRankAxis})
 * and it moves nothing about the order the categories are laid out in.
 *
 * The heatmap deliberately does not come through here, and the difference is
 * worth stating because it looks like a contradiction: it wants its rows
 * top-first, so it is the **un**-inversed y that {@link extractHeatmapData} has
 * to turn over. A bar or a line wants the order its axis runs in from its own
 * origin, which is the un-inversed order on both axes. The conventions differ,
 * not the axes.
 *
 * Both halves of the pairing read this: the extractors below for the payload,
 * and `filterColumnItems` / `filterLineItems` in `navmap.ts` for the highlight
 * the overlay draws. Reversing one without the other would trade a correct
 * highlight for a wrong one (#1024).
 *
 * @param series - The series whose items are being read
 * @returns The items in drawn order -- the same array when nothing moved
 */
export function orderedDataItems(series: AmXYSeries): AmDataItem[] {
  const along = hasCategoryY(series) ? 'yAxis' : 'xAxis';
  return isInversedAxis(series, along)
    ? [...series.dataItems].reverse()
    : series.dataItems;
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

/** One mark of a category-bound series: what it names, and what it measures. */
interface CategoryValue {
  category: string | number;
  value: number;
}

/**
 * Read every mark of a category-bound series as a category and a value.
 *
 * The pair of fields depends on which way the bars run — amCharts puts the
 * categories on `categoryY` and the values on `valueX` for a horizontal chart
 * — and nothing else about the reading does, which is why the bar, the
 * segmented bar and the diverging-pair test all take it from here. Marks
 * missing either half are skipped, so an index into the result keeps naming
 * the mark it addresses.
 */
function readCategoryValues(series: AmXYSeries): CategoryValue[] {
  const isHorizontal = hasCategoryY(series);
  const categoryField = isHorizontal ? 'categoryY' : 'categoryX';
  const valueField = isHorizontal ? 'valueX' : 'valueY';

  const marks: CategoryValue[] = [];
  for (const item of orderedDataItems(series)) {
    const category = item.get(categoryField);
    const value = item.get(valueField);

    if (category == null || value == null)
      continue;

    const numValue = toNumber(value);
    if (numValue == null)
      continue;

    marks.push({ category: toStringOrNumber(category), value: numValue });
  }
  return marks;
}

/**
 * Extract {@link BarPoint} data from a column or bar series.
 *
 * Also serves the two marks MAIDR reads as a bar chart with a different
 * glyph — a dot plot's point and a lollipop's stem — which carry the same
 * category and value and differ only in what the chart is called.
 */
export function extractBarPoints(series: AmXYSeries): BarPoint[] {
  const isHorizontal = hasCategoryY(series);

  return readCategoryValues(series).map(mark => ({
    x: isHorizontal ? mark.value : mark.category,
    y: isHorizontal ? mark.category : mark.value,
  }));
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
  const fill = (series.get('name') as string | undefined) ?? '';
  const isHorizontal = hasCategoryY(series);

  return readCategoryValues(series).map(mark => ({
    x: isHorizontal ? mark.value : mark.category,
    y: isHorizontal ? mark.category : mark.value,
    z: fill,
  }));
}

/**
 * Whether two column series are drawn back to back across a shared axis — a
 * population pyramid, or a Likert scale split around a neutral midpoint.
 *
 * amCharts has no diverging series: the chart is two ordinary column series
 * on one category axis with one side's values negated, which is otherwise the
 * signature of a dodged bar chart. What separates them is the sign — one
 * series entirely on each side of the baseline, over the same categories in
 * the same order — and that is a statement about the data rather than about
 * how it was drawn, so it is decisive where a styling probe would not be.
 *
 * Both sides must actually reach their side of the baseline: a pair of series
 * that are merely non-negative is every dodged bar chart ever drawn.
 */
export function isDivergingPair(seriesList: AmXYSeries[]): boolean {
  if (seriesList.length !== 2)
    return false;

  const [left, right] = seriesList.map(readCategoryValues);
  if (left.length === 0 || left.length !== right.length)
    return false;
  if (left.some((mark, index) => String(mark.category) !== String(right[index].category)))
    return false;

  const leftValues = left.map(mark => mark.value);
  const rightValues = right.map(mark => mark.value);
  return (growsNegative(leftValues) && growsPositive(rightValues))
    || (growsPositive(leftValues) && growsNegative(rightValues));
}

/** Whether every value sits at or below the baseline, and one below it. */
function growsNegative(values: number[]): boolean {
  return values.every(value => value <= 0) && values.some(value => value < 0);
}

/** Whether every value sits at or above the baseline, and one above it. */
function growsPositive(values: number[]): boolean {
  return values.every(value => value >= 0) && values.some(value => value > 0);
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
/**
 * The two series amCharts draws a financial bar with.
 *
 * Listed for the reason {@link STANDALONE_KINDS} gives: `classifySeriesKind`
 * answers `'bar'` for anything it does not know, so an unlisted one is
 * described rather than declined. These escaped that only by accident -- a
 * financial series is usually drawn against a date axis, where the bar path
 * finds no categories and the chart fails loudly instead of quietly -- and a
 * candlestick on a `CategoryAxis` would have been announced as a bar chart of
 * its closing prices (#1053).
 *
 * An OHLC is read as the same trace as a candlestick deliberately: it is the
 * same five numbers drawn with a different mark, and MAIDR announces the
 * numbers. The Chart.js adapter makes the same call in one shared branch.
 */
const FINANCIAL_CLASSES = new Set([
  'CandlestickSeries',
  'OHLCSeries',
]);

/**
 * A candle's position, as a reader should hear it.
 *
 * A date axis hands its position over as epoch milliseconds, which is a number
 * nobody can place -- the same problem `formatCandlestickValue` solves for
 * Chart.js, and solved the same way and at the same threshold so the two
 * adapters do not disagree about what a date looks like.
 *
 * @param value - The position `readXValue` recovered
 * @returns The label to announce
 */
function formatCandlePosition(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1e11)
    return new Date(value).toISOString().slice(0, 10);
  return String(value);
}

/**
 * Extract {@link CandlestickPoint} data from a candlestick or OHLC series.
 *
 * amCharts keeps the four prices on the item under the names its series
 * settings bind: `openValueY`, `highValueY`, `lowValueY`, and the plain
 * `valueY` for the close. Measured on a three-day chart, one item reads
 * `{ valueX: 1704067200000, valueY: 12, openValueY: 10, highValueY: 14,
 * lowValueY: 9 }` -- everything the point needs and nothing left over.
 *
 * `volume` is absent rather than zero: amCharts keeps it on a separate series
 * when a chart draws one at all, so claiming zero would be reporting a
 * measurement that was never taken. `CandlestickPoint.volume` is optional for
 * exactly this.
 *
 * A candle missing any of the four is skipped, so an index into the result
 * keeps naming the candle it addresses -- the same rule
 * {@link readCategoryValues} follows.
 *
 * @param series - The financial series
 * @returns One point per complete candle
 */
export function extractCandlestickPoints(series: AmXYSeries): CandlestickPoint[] {
  const points: CandlestickPoint[] = [];

  for (const item of series.dataItems) {
    const open = toNumber(item.get('openValueY'));
    const high = toNumber(item.get('highValueY'));
    const low = toNumber(item.get('lowValueY'));
    const close = toNumber(item.get('valueY'));
    if (open == null || high == null || low == null || close == null)
      continue;

    points.push({
      value: formatCandlePosition(readXValue(item, series)),
      open,
      high,
      low,
      close,
      trend: close > open ? 'Bull' : close < open ? 'Bear' : 'Neutral',
      volatility: high - low,
    });
  }

  return points;
}

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

  // {@link HeatmapData} runs top-first and left-first, so each axis is asked
  // the same question: does amCharts already draw its first category at that
  // end? The data items arrive in the axis' own order either way -- measured,
  // a 3x2 grid hands them over as `c0, c1, c2` whether or not the x renderer
  // is inversed -- so the drawing is the only thing that moves, and the answer
  // has to come from the renderer rather than from the items.
  //
  // The two answers are opposite for the *same* chart, because amCharts counts
  // a y axis from the bottom and an x axis from the left. So an unreversed y
  // has to be turned over (#981) while an unreversed x is already the way
  // round the payload wants, and it is the *inversed* x that moves (#1012).
  const topFirst = isInversedAxis(series, 'yAxis');
  const leftFirst = !isInversedAxis(series, 'xAxis');

  const byRow = topFirst ? points : [...points].reverse();

  return {
    x: leftFirst ? xLabels : [...xLabels].reverse(),
    y: topFirst ? yLabels : [...yLabels].reverse(),
    points: leftFirst ? byRow : byRow.map(row => [...row].reverse()),
  };
}

/**
 * Whether one of a series' axes is stood on its head.
 *
 * `inversed` is the setting amCharts uses for that -- the same one
 * {@link hasRankAxis} reads to spot a bump chart, asked here of the one series
 * that owns the grid.
 *
 * What it *means* is the caller's business, and differs by axis: an inversed y
 * draws its first category at the top, an inversed x draws its first at the
 * right. Answering only the flag here keeps that asymmetry in one place rather
 * than buried in two similarly-named helpers.
 *
 * @param series - The heatmap series
 * @param axis - Which of the series' axes to ask
 * @returns Whether that axis' renderer is inversed
 */
function isInversedAxis(series: AmXYSeries, axis: 'xAxis' | 'yAxis'): boolean {
  const renderer = settingOf(series.get(axis), 'renderer');
  return settingOf(renderer, 'inversed') === true;
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

  for (const item of orderedDataItems(series)) {
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
// Rank detection
// ---------------------------------------------------------------------------

/**
 * Read a setting off anything that answers `get`, without asserting a type.
 *
 * The axis a series is bound to, and the renderer that axis draws itself with,
 * are both reached this way: they are am5 entities the adapter never models,
 * and every read of one is a single setting deep.
 */
function settingOf(entity: unknown, key: string): unknown {
  if (entity == null || typeof entity !== 'object')
    return undefined;
  const get = (entity as { get?: unknown }).get;
  if (typeof get !== 'function')
    return undefined;
  return (get as (k: string) => unknown).call(entity, key);
}

/**
 * Whether every line of a layer is plotted against an upside-down value axis.
 *
 * A rank axis runs the other way: first place is the smallest number and sits
 * at the top, which amCharts draws by inverting the axis' renderer. That is the
 * one thing a bump chart declares about itself, and it is asked of every series
 * rather than of any — a chart mixing an inversed line with an ordinary one is
 * not a table of ranks, and reading it as one would invert the pitch of both.
 *
 * It is not sufficient on its own. An inversed axis is also how a plain chart
 * of descending magnitudes is drawn, so {@link holdsRanks} has to agree before
 * the layer is announced as a bump chart.
 */
export function hasRankAxis(seriesList: AmXYSeries[]): boolean {
  return seriesList.length > 0 && seriesList.every((series) => {
    const renderer = settingOf(series.get('yAxis'), 'renderer');
    return settingOf(renderer, 'inversed') === true;
  });
}

/**
 * Whether a group of line series carries ranks rather than magnitudes.
 *
 * A rank is a permutation, and that is what makes this decidable from the data
 * alone: every value is a whole place between first and last, no two
 * competitors hold the same place in the same period, and somebody comes first.
 * Counts and magnitudes fail all three the moment there is more than one of
 * them — two series that ever share a value are not a ranking, and a value
 * above the number of competitors is not a place any of them can hold.
 *
 * Deliberately strict about what it will not read: a chart showing places 3
 * through 9 of a twenty-strong field is a genuine bump chart this answers `false`
 * for, and it stays a line chart rather than being sonified against a rank
 * range that does not include the leader it never draws.
 */
export function holdsRanks(seriesList: AmXYSeries[]): boolean {
  const competitors = seriesList.length;
  if (competitors === 0)
    return false;

  const takenAt = new Map<string, Set<number>>();
  let best = Number.POSITIVE_INFINITY;
  let ranks = 0;

  for (const series of seriesList) {
    for (const point of extractLinePoints(series)) {
      // A rank is a whole number in `1..competitors`, so a gap disqualifies
      // the series exactly as a fractional or out-of-range value does --
      // `Number.isInteger(null)` was already false, this only lets the
      // compiler see it.
      const rank = point.y;
      if (rank === null || !Number.isInteger(rank) || rank < 1 || rank > competitors)
        return false;

      const period = String(point.x);
      const taken = takenAt.get(period);
      if (taken == null)
        takenAt.set(period, new Set([rank]));
      else if (taken.has(rank))
        return false;
      else
        taken.add(rank);

      best = Math.min(best, rank);
      ranks++;
    }
  }

  return ranks > 0 && best === 1;
}

// ---------------------------------------------------------------------------
// Pie extraction
// ---------------------------------------------------------------------------

/**
 * Extract {@link PiePoint} data from an am5percent pie series.
 *
 * Also serves an am5percent funnel series and an am5wc word cloud, whose
 * stages and terms carry the same `category`/`value` pair in the same data
 * order — a funnel's `BarPoint[]`, a word cloud's `WordCloudPoint[]` and a
 * pie's `PiePoint[]` are the same `{ x, y }` shape.
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
// Flow (am5flow) and network (am5hierarchy.ForceDirected)
// ---------------------------------------------------------------------------

/**
 * What am5flow binds a link's two ends to when the author names no field.
 *
 * amCharts' own examples author a link as `{ from, to, value }` and set
 * `sourceIdField` / `targetIdField` / `valueField` to match, so these are the
 * defaults for the last resort in {@link readFlowEnd} — reading the author's
 * own row when neither the resolved id nor the node data item answered.
 */
const FLOW_SOURCE_FIELD_DEFAULT = 'from';
const FLOW_TARGET_FIELD_DEFAULT = 'to';
const FLOW_VALUE_FIELD_DEFAULT = 'value';

/**
 * A value usable as a node's name: a non-empty string, or a finite number.
 *
 * Stricter than {@link toStringOrNumber}, which renders `null` as `''` — an
 * empty name is not a node, and a link with one is a link to nowhere.
 */
function asNodeName(value: unknown): string | number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  if (typeof value === 'string')
    return value.length > 0 ? value : null;
  return null;
}

/** A finite number, from a number or from the numeric string a CSV row carries. */
function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** The author's own record behind a data item, when it kept one. */
function rowOf(item: AmDataItem): Record<string, unknown> | null {
  const row = item.dataContext;
  return row != null && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

/**
 * What one end of a flow link is called.
 *
 * Three reads, in falling order of how directly amCharts states the answer,
 * because which of them a given build answers with is exactly the shape that
 * cannot be checked without the library:
 *
 * 1. `sourceId` / `targetId` — the id amCharts resolved the end to, which is
 *    the name if it answers at all.
 * 2. `source` / `target` — the *node* data item the link was joined to, asked
 *    for its own `name` and then its `id`.
 * 3. The author's row, keyed by the field the series was told to read ends
 *    from. This is the one that survives a build answering with neither.
 *
 * `null` when no read answers, which drops the link: a ribbon with one end is
 * not a flow, and naming the missing end anything at all would invent a node.
 */
function readFlowEnd(
  item: AmDataItem,
  series: AmXYSeries,
  end: 'source' | 'target',
): string | number | null {
  const resolved = asNodeName(item.get(`${end}Id`));
  if (resolved != null)
    return resolved;

  const node = item.get(end);
  if (node != null && typeof node === 'object') {
    const get = (node as { get?: (key: string) => unknown }).get;
    if (typeof get === 'function') {
      const named = asNodeName(get.call(node, 'name')) ?? asNodeName(get.call(node, 'id'));
      if (named != null)
        return named;
    }
  }

  const field = series.get(`${end}IdField`);
  const key = typeof field === 'string' && field.length > 0
    ? field
    : (end === 'source' ? FLOW_SOURCE_FIELD_DEFAULT : FLOW_TARGET_FIELD_DEFAULT);
  return asNodeName(rowOf(item)?.[key]);
}

/**
 * How much flows along one link.
 *
 * Read from the data item's own `value` first and from the author's row after,
 * both strictly: `toNumber` would answer `0` for a link carrying no value at
 * all, because `Number(null)` is `0`, and a zero is a weight the chart never
 * stated rather than an absent one.
 */
function readFlowValue(item: AmDataItem, series: AmXYSeries): number | null {
  const declared = asFiniteNumber(item.get('value'));
  if (declared != null)
    return declared;

  const field = series.get('valueField');
  const key = typeof field === 'string' && field.length > 0 ? field : FLOW_VALUE_FIELD_DEFAULT;
  return asFiniteNumber(rowOf(item)?.[key]);
}

/**
 * Convert an am5flow series — a `Sankey`, a `Chord` or an `ArcDiagram` — into
 * {@link FlowPoint} data.
 *
 * One point per **link**, which is the whole payload: MAIDR derives the nodes
 * from the links by design, so `series.nodes` is deliberately not read. A
 * second list would be a second source of truth for something the links
 * already say, and the two could then disagree.
 *
 * A link missing an end, or carrying no weight, is dropped rather than kept as
 * a gap — the same call the pie, funnel and waterfall conversions make. A link
 * amCharts draws no ribbon for but MAIDR still counts would slide every later
 * position onto its neighbour.
 */
export function extractFlowPoints(series: AmXYSeries): FlowPoint[] {
  return extractFlowLinks(series).map(link => link.point);
}

/**
 * One readable link of an am5flow series: the reading MAIDR was given, and the
 * data item amCharts drew the ribbon from.
 */
export interface AmFlowLink {
  /** The link's data item, which carries the drawn ribbon. */
  item: AmDataItem;
  /** The point emitted for it, at the same position in `layer.data`. */
  point: FlowPoint;
}

/**
 * The links of an am5flow series, each paired with the data item it was read
 * from.
 *
 * {@link extractFlowPoints} is this list with the data items dropped, so the
 * n-th point of a flow layer was read from the n-th entry here **by
 * construction** rather than by two walks agreeing. That is what lets the
 * highlight invert an index: `FlowTrace` publishes the ribbon it outlined as a
 * position in `layer.data`, and the adapter reads that position back off this
 * list to reach the sprite amCharts drew.
 *
 * A parallel walk would have done the same job until one of the two learned
 * about a link the other kept — the drop rules above are exactly where that
 * would happen — and the highlight would then sit one ribbon off with nothing
 * about the announcement looking wrong.
 *
 * @param series - The flow series to read.
 * @returns One entry per readable link, in chart order.
 */
export function extractFlowLinks(series: AmXYSeries): AmFlowLink[] {
  const links: AmFlowLink[] = [];

  for (const item of series.dataItems) {
    const source = readFlowEnd(item, series, 'source');
    const target = readFlowEnd(item, series, 'target');
    if (source == null || target == null)
      continue;

    const value = readFlowValue(item, series);
    if (value == null || value === 0)
      continue;

    links.push({ item, point: { source, target, value } });
  }

  return links;
}

/**
 * The ribbon amCharts drew for one flow link.
 *
 * An am5flow data item keeps its band on `link` — a `SankeyLink`, a
 * `ChordLink` or the straight `ArcDiagram` line — which is the mark the
 * overlay measures. Unverifiable without the library, like every other sprite
 * read here, so an absent one answers `undefined` and the caller clears the
 * overlay rather than outlining something else.
 *
 * @param item - The link's data item.
 * @returns Its drawn ribbon, or `undefined` when the build keeps none.
 */
export function flowRibbonOf(item: AmDataItem): AmSprite | undefined {
  return item.get('link') as AmSprite | undefined;
}

/**
 * The field an `am5hierarchy.ForceDirected` names each row's cross-links in.
 *
 * Unlike the flow fields there is no default worth guessing: amCharts draws no
 * cross-link at all unless the author sets `linkWithField`, so an unset one
 * means the graph really is the tree.
 */
const LINK_WITH_FIELD_SETTING = 'linkWithField';

/**
 * Convert an `am5hierarchy.ForceDirected` series into {@link NetworkPoint}
 * links.
 *
 * The awkward one. A force-directed graph is a **hierarchy** series in
 * amCharts, not a link list: its data is a tree of `children`, and the links a
 * reader sees are the parent-child edges of that tree plus whatever cross-links
 * each row named. So the same walk the treemap uses supplies the tree — each
 * node's parent is the last name on its path — and the cross-links are read
 * off the authors' own rows afterwards.
 *
 * Nothing about the layout is read. Where the solver dropped a node is a fact
 * about its seed rather than about the data, which is why `NetworkPoint` has
 * nowhere to put one.
 *
 * A cross-link naming something the walk never saw is skipped rather than
 * turned into a node: amCharts draws no link for it either, and inventing the
 * node would announce a participant the chart does not have. Each pair is
 * emitted once — a link is undirected, and two rows naming each other draw one
 * line.
 */
export function extractNetworkPoints(series: AmXYSeries): NetworkPoint[] {
  const nodes = extractHierarchyNodes(series);

  // Every name a cross-link may legitimately reach: the node's own category,
  // and the id the author keyed it by when that is a different column.
  const idField = series.get('idField');
  const byRef = new Map<string | number, string | number>();
  for (const node of nodes) {
    if (!byRef.has(node.name))
      byRef.set(node.name, node.name);
    if (typeof idField === 'string' && idField.length > 0) {
      const id = asNodeName(rowOf(node.dataItem)?.[idField]);
      if (id != null && !byRef.has(id))
        byRef.set(id, node.name);
    }
  }

  const links: NetworkPoint[] = [];
  const seen = new Set<string>();
  const add = (source: string | number, target: string | number): void => {
    const key = networkLinkKey(source, target);
    if (seen.has(key))
      return;
    seen.add(key);
    links.push({ source, target });
  };

  for (const node of nodes) {
    const parent = node.path[node.path.length - 1];
    if (parent !== undefined)
      add(parent, node.name);
  }

  const linkWithField = series.get(LINK_WITH_FIELD_SETTING);
  if (typeof linkWithField === 'string' && linkWithField.length > 0) {
    for (const node of nodes) {
      const refs = rowOf(node.dataItem)?.[linkWithField];
      if (!Array.isArray(refs))
        continue;
      for (const ref of refs) {
        const name = asNodeName(ref);
        const target = name != null ? byRef.get(name) : undefined;
        if (target !== undefined)
          add(node.name, target);
      }
    }
  }

  return links;
}

/**
 * How one undirected link is named, from the two nodes it joins.
 *
 * **One expression, two readers.** {@link extractNetworkPoints} keys its
 * de-duplication with this — two rows naming each other draw one line, so the
 * pair has to name the same link whichever end it is read from — and
 * {@link findNetworkLink} matches a drawn line against the emitted payload with
 * it. A second spelling of "the same pair" is how the highlight would come to
 * miss exactly the links a `linkWith` authored backwards.
 *
 * @param source - One end of the link.
 * @param target - The other end.
 * @returns A key equal for both orderings of the pair.
 */
export function networkLinkKey(
  source: string | number,
  target: string | number,
): string {
  return [String(source), String(target)].sort().join(' ');
}

/**
 * The line an `am5hierarchy.ForceDirected` drew between two nodes.
 *
 * A network is the one reading whose payload is not a walk over data items: its
 * links are the tree's parent-child edges plus the cross-links the rows named,
 * and amCharts draws them from a list of its own. So a published index is
 * inverted against the emitted point — `layer.data[i]` names two nodes — and
 * the line is then found by asking each drawn link which two nodes it joins,
 * with {@link networkLinkKey} settling the direction the payload does not
 * carry.
 *
 * `series.links` and a link's `source` / `target` node data items are
 * unverifiable without the library, like every other sprite read here. A build
 * that answers with neither leaves every link unfound, the resolver answers
 * nothing, and the overlay clears — which is what a network did in full before
 * this existed, rather than a line drawn somewhere plausible.
 *
 * @param series - The force-directed series that drew the graph.
 * @param link - The emitted point naming the two ends.
 * @returns The drawn line, or `undefined` when none of them joins that pair.
 */
export function findNetworkLink(
  series: AmXYSeries,
  link: NetworkPoint,
): AmSprite | undefined {
  const wanted = networkLinkKey(link.source, link.target);
  for (const drawn of series.links?.values ?? []) {
    const source = readLinkEndName(drawn, 'source');
    const target = readLinkEndName(drawn, 'target');
    if (source != null && target != null && networkLinkKey(source, target) === wanted) {
      return drawn;
    }
  }
  return undefined;
}

/**
 * The name of one end of a drawn hierarchy link.
 *
 * The end is a *node data item*, so it is asked for its category — the same
 * read {@link extractHierarchyNodes} names a node by, which is what makes the
 * two sides comparable at all.
 */
function readLinkEndName(link: AmSprite, end: 'source' | 'target'): string | number | null {
  const node = link.get?.(end);
  if (node == null || typeof node !== 'object') {
    return null;
  }
  const get = (node as { get?: (key: string) => unknown }).get;
  return typeof get === 'function' ? asNodeName(get.call(node, 'category')) : null;
}

// ---------------------------------------------------------------------------
// Gauge (am5radar ClockHand)
// ---------------------------------------------------------------------------

/**
 * The chart class an am5radar gauge is drawn in. It extends `XYChart`, so the
 * adapter's discovery has always found it; what it has never had is a series
 * to convert.
 */
const RADAR_CHART_CLASS = 'RadarChart';

/**
 * The class name amCharts gives a gauge's needle. Nothing else in the library
 * draws one, which is what makes this the whole of the signature: a gauge is
 * recognised by the mark it has, not by the series it lacks.
 */
const CLOCK_HAND_CLASS = 'ClockHand';

/**
 * The needle of an am5radar gauge, with the axis it is pinned to.
 *
 * A gauge is the one layer in this adapter whose source is the *chart* rather
 * than a series: amCharts draws the hand as an `AxisBullet` on an axis data
 * item, so a ClockHand gauge routinely carries no series at all. Both the
 * extraction and the highlight need the same three things, so they are found
 * once and shared.
 */
export interface AmGaugeHand {
  /** The axis the hand is pinned to, which carries the dial's range. */
  axis: AmAxis;
  /** The axis data item the hand's value is read from. */
  dataItem: AmDataItem;
  /** The `ClockHand` sprite itself, which is what the overlay outlines. */
  sprite: AmSprite;
}

/** A duck-typed `values` list, or `[]` for anything that is not one. */
function listValues<T>(candidate: unknown): T[] {
  if (candidate == null || typeof candidate !== 'object')
    return [];
  const values = (candidate as { values?: unknown }).values;
  return Array.isArray(values) ? (values as T[]) : [];
}

/** Read a setting only when it really is a finite number. */
function finiteSetting(entity: { get: (key: string) => unknown }, key: string): number | null {
  const value = entity.get(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Every data item an axis carries a bullet on.
 *
 * A gauge's hand hangs on a data item created with `axis.createAxisRange()`,
 * which amCharts keeps in `axisRanges` — but the raw `dataItems` list is read
 * too, because the range and the tick lists are the same kind of object and
 * which one a given build files a made data item under is not something this
 * adapter can verify without the library.
 */
function axisMarkerItems(axis: AmAxis): AmDataItem[] {
  const ranges = listValues<AmDataItem>((axis as unknown as { axisRanges?: unknown }).axisRanges);
  const items = Array.isArray(axis.dataItems) ? axis.dataItems : [];
  return [...ranges, ...items];
}

/**
 * The sprites a data item's bullets draw.
 *
 * Read through both the settings accessor and the plain property, and through
 * both the singular `bullet` an axis data item carries and the `bullets` list
 * a series data item does, because which of them answers is exactly the shape
 * that cannot be checked here.
 */
function bulletSprites(item: AmDataItem): AmSprite[] {
  const sprites: AmSprite[] = [];
  const push = (value: unknown): void => {
    if (value != null && typeof value === 'object')
      sprites.push(value as AmSprite);
  };
  const readBullet = (bullet: unknown): void => {
    if (bullet == null || typeof bullet !== 'object')
      return;
    const b = bullet as { get?: (key: string) => unknown; sprite?: unknown };
    if (typeof b.get === 'function')
      push(b.get('sprite'));
    push(b.sprite);
  };

  readBullet(item.get('bullet'));
  for (const bullet of item.bullets ?? []) {
    readBullet(bullet);
  }
  return sprites;
}

/** Whether a sprite is the needle amCharts draws a gauge's reading with. */
function isClockHand(sprite: AmSprite): boolean {
  return (sprite as { className?: string }).className === CLOCK_HAND_CLASS;
}

/**
 * Find the needle of an am5radar gauge, or `null` for any other chart.
 *
 * The signature is deliberately narrow, because a `RadarChart` is also what a
 * radar and a polar area are drawn in: the class name has to match *and* an
 * axis has to carry a `ClockHand`. The caller adds the third condition — this
 * is asked only of a chart whose series produced no layer at all — so an
 * ordinary radar chart never reaches it even if someone pins a hand to one.
 *
 * A chart with several hands is read as its first, with a warning: MAIDR's
 * gauge is one measure against one range, and there is no shape here for a
 * second.
 */
export function findGaugeHand(chart: AmChart): AmGaugeHand | null {
  if (chart.className !== RADAR_CHART_CLASS)
    return null;

  const axes = [...(chart.xAxes?.values ?? []), ...(chart.yAxes?.values ?? [])];
  const hands: AmGaugeHand[] = [];
  for (const axis of axes) {
    for (const dataItem of axisMarkerItems(axis)) {
      for (const sprite of bulletSprites(dataItem)) {
        if (isClockHand(sprite)) {
          hands.push({ axis, dataItem, sprite });
        }
      }
    }
  }

  const hand = hands[0];
  if (!hand)
    return null;
  if (hands.length > 1) {
    console.warn(
      `[MAIDR amCharts] Gauge carries ${hands.length} hands; reading the first. `
      + `A gauge layer carries one measure.`,
    );
  }
  return hand;
}

/**
 * The qualitative bands an axis partitions its dial into.
 *
 * Only a range with a finite `endValue` is a band: MAIDR carries the upper
 * edge alone, because bands partition the range and a band starts where the
 * previous one ended. That also excludes the hand's own range, which carries a
 * value and no end — the reading is not one of the bands it lands in.
 *
 * Sorted ascending, since an unsorted list would describe a partition the
 * chart does not draw, and a band amCharts leaves unnamed is numbered by its
 * position: that says where in the partition the reading landed, which is what
 * a band is read for, without inventing a meaning the chart never gave it.
 */
export function extractGaugeBands(axis: AmAxis): GaugeBand[] {
  const ranges = axisMarkerItems(axis);
  const found: { to: number; label?: string }[] = [];

  for (const range of ranges) {
    const to = finiteSetting(range, 'endValue');
    if (to == null)
      continue;
    const label = readRangeLabel(range);
    found.push({ to, ...(label != null ? { label } : {}) });
  }

  return found
    .sort((a, b) => a.to - b.to)
    .map((band, index) => ({ to: band.to, label: band.label ?? `Band ${index + 1}` }));
}

/** What an axis range calls itself, when it says. */
function readRangeLabel(range: AmDataItem): string | undefined {
  const label = range.get('label');
  if (typeof label === 'string' && label.length > 0)
    return label;
  if (label != null && typeof label === 'object') {
    const text = (label as { get?: (key: string) => unknown }).get?.('text');
    if (typeof text === 'string' && text.length > 0)
      return text;
  }
  const category = range.get('category');
  return typeof category === 'string' && category.length > 0 ? category : undefined;
}

/**
 * Convert an am5radar gauge into the single {@link GaugePoint} it draws.
 *
 * A single object rather than an array, because the chart draws exactly one
 * measure — an array of one would describe a shape the chart does not have.
 *
 * `null` when the dial has no finite ends. `GaugeTrace` pitches its tone
 * against the range rather than against the value, so a reading with no range
 * behind it is not a reading at all; emitting no layer is the honest answer,
 * and the caller then leaves the panel out rather than announcing a dial of
 * `NaN`s.
 *
 * The range is read from the axis' own `min`/`max` settings, falling back to
 * the private values amCharts computes when the author did not fix them. It is
 * NOT read from the axis' `start`/`end`, which on an am5 axis are the relative
 * zoom positions (0 to 1) and would silently answer with a 0-to-1 dial for
 * every gauge whose extremes are computed.
 */
export function extractGaugePoint(hand: AmGaugeHand, label?: string): GaugePoint | null {
  const min = axisExtreme(hand.axis, 'min');
  const max = axisExtreme(hand.axis, 'max');
  if (min == null || max == null)
    return null;

  const value = finiteSetting(hand.dataItem, 'value');
  if (value == null)
    return null;

  const bands = extractGaugeBands(hand.axis);
  const name = label ?? readAxisTitle(hand.axis);

  return {
    value,
    min,
    max,
    ...(name != null ? { label: name } : {}),
    ...(bands.length > 0 ? { bands } : {}),
  };
}

/** An axis extreme: the author's setting, else the one amCharts computed. */
function axisExtreme(axis: AmAxis, key: 'min' | 'max'): number | null {
  const declared = finiteSetting(axis, key);
  if (declared != null)
    return declared;
  const computed = (axis as unknown as { getPrivate?: (k: string) => unknown }).getPrivate?.(key);
  return typeof computed === 'number' && Number.isFinite(computed) ? computed : null;
}

/** An axis' own title, when it has one — never a fallback. */
function readAxisTitle(axis: AmAxis): string | undefined {
  const label = readAxisLabel(axis, '');
  return label.length > 0 ? label : undefined;
}

// ---------------------------------------------------------------------------
// Choropleth (am5map MapPolygonSeries)
// ---------------------------------------------------------------------------

/**
 * The am5map series class that draws regions. A choropleth is one of these
 * shaded by a value; the base geography underneath is another one that carries
 * none, which is why the class alone is not the signature.
 */
const MAP_POLYGON_CLASS = 'MapPolygonSeries';

/**
 * Every am5map series class, so the ones that are not regions are *skipped*
 * rather than defaulted.
 *
 * {@link classifySeriesKind} answers `'bar'` for anything it does not know, so
 * an unlisted map series would be announced as a bar chart of its shapes. A
 * graticule read as a row of bars is the failure this list prevents; naming
 * them all is what makes "not a choropleth" mean "not a layer".
 */
const MAP_SERIES_CLASSES = new Set([
  MAP_POLYGON_CLASS,
  'MapLineSeries',
  'MapPointSeries',
  'ClusteredPointSeries',
  'GraticuleSeries',
]);

/** Whether a series is the class an am5map choropleth is drawn with. */
export function isMapPolygonSeries(series: AmXYSeries): boolean {
  return series.className === MAP_POLYGON_CLASS;
}

/**
 * Whether a polygon series is shaded by a value — a choropleth — rather than
 * being the base geography under one.
 *
 * A map routinely carries two `MapPolygonSeries`: the countries, drawn once in
 * a flat colour, and the ones a value was joined onto. Only the second is a
 * chart; announcing the first would offer the reader a list of every country
 * on earth with nothing to say about any of them.
 *
 * `valueField` is what binds the shading, and `heatRules` is how the shading is
 * declared, so either one says the author meant this series to carry a reading.
 */
function isShadedPolygonSeries(series: AmXYSeries): boolean {
  if (!isMapPolygonSeries(series))
    return false;
  const field = series.get('valueField');
  if (typeof field === 'string' && field.length > 0)
    return true;
  const rules = series.get('heatRules');
  return Array.isArray(rules) && rules.length > 0;
}

/**
 * The declared field names a choropleth's four facts may be renamed to.
 *
 * Spelled here as plain strings rather than as a `ChoroplethDeclaration`, so
 * that this module stays the reader of what amCharts drew and `declaration.ts`
 * stays the reader of what the author said. Both paths land in the same
 * function because a map's regions are read the same way either way — the
 * declaration only says which column each fact is in.
 */
export interface ChoroplethFields {
  region?: string;
  value?: string;
  lon?: string;
  lat?: string;
}

/**
 * What a region is called.
 *
 * An explicit `region` ref wins outright and with no fallback, exactly as
 * {@link resolveFieldRef} treats every named ref: a name the author wrote that
 * misses is their mistake to see, not one to paper over with a column they did
 * not name.
 *
 * Undeclared, amCharts' own reading comes first — `dataItem.get('name')` is
 * the name it resolved the polygon to — and the row's chain second. That chain
 * reaches `properties.NAME` on a GeoJSON feature, which is where a map's names
 * actually live, and ends at the `id` an am5map row is ordinarily keyed by.
 */
function readRegionName(
  item: AmDataItem,
  fields: ChoroplethFields | undefined,
): string | number | null {
  const row = rowOf(item);
  if (fields?.region != null) {
    return asNodeName(resolveFieldRef(row, fields.region, 'region', TraceType.CHOROPLETH));
  }
  const drawn = asNodeName(item.get('name'));
  if (drawn != null)
    return drawn;
  return asNodeName(resolveFieldRef(row, undefined, 'region', TraceType.CHOROPLETH));
}

/**
 * The number a region is shaded by.
 *
 * Read strictly, never through `toNumber`: `Number(null)` is `0`, and a region
 * amCharts drew in the no-data colour would then be announced as a region
 * whose value is zero — a reading a listener cannot tell from a true one.
 *
 * The series' own `valueField` is consulted before the shared chain, because
 * it is the column the author actually bound the shading to.
 */
function readRegionValue(
  item: AmDataItem,
  series: AmXYSeries,
  fields: ChoroplethFields | undefined,
): number | null {
  const row = rowOf(item);
  if (fields?.value != null) {
    return asFiniteNumber(resolveFieldRef(row, fields.value, 'value', TraceType.CHOROPLETH));
  }

  const drawn = asFiniteNumber(item.get('value'));
  if (drawn != null)
    return drawn;

  const field = series.get('valueField');
  if (typeof field === 'string' && field.length > 0) {
    const bound = asFiniteNumber(row?.[field]);
    if (bound != null)
      return bound;
  }
  return asFiniteNumber(resolveFieldRef(row, undefined, 'value', TraceType.CHOROPLETH));
}

/**
 * A coordinate in degrees, or `null` for anything that is not one.
 *
 * The whole point of the guard. `ChoroplethTrace` walks north, south, east and
 * west out of this pair, so a projected or normalised coordinate accepted here
 * is a wrong compass direction — worse than the declared-order region list the
 * grammar explicitly sanctions when the pair is missing.
 */
function asDegrees(value: unknown, limit: number): number | null {
  const number = asFiniteNumber(value);
  return number != null && Math.abs(number) <= limit ? number : null;
}

/**
 * The geographic centroid of the polygon a region was drawn as.
 *
 * **Unverified against the library.** `MapPolygon.geoCentroid()` is documented
 * to answer an `IGeoPoint` — `{ longitude, latitude }` in degrees — but
 * amCharts is commercial and not installed here, so every read is guarded and
 * a build answering with anything else falls through to `null`. The pair is
 * then omitted, and the map degrades to a region list in declared order rather
 * than to a compass pointing the wrong way.
 */
function readGeoCentroid(item: AmDataItem): { lon: number; lat: number } | null {
  const polygon = item.get('mapPolygon');
  if (polygon == null || typeof polygon !== 'object')
    return null;
  const centroid = (polygon as { geoCentroid?: () => unknown }).geoCentroid;
  if (typeof centroid !== 'function')
    return null;

  let point: unknown;
  try {
    point = centroid.call(polygon);
  } catch {
    return null;
  }
  if (point == null || typeof point !== 'object')
    return null;

  const geo = point as { longitude?: unknown; latitude?: unknown };
  const lon = asDegrees(geo.longitude, 180);
  const lat = asDegrees(geo.latitude, 90);
  return lon != null && lat != null ? { lon, lat } : null;
}

/**
 * The data items a choropleth layer was built from, in the order it emitted
 * them.
 *
 * Kept as its own function so the highlight path indexes exactly the list the
 * payload was built from. A region the layer dropped must not stay in this
 * list: it would slide every later position onto its neighbour, which is the
 * same call the pie, funnel and flow conversions already make.
 */
export function filterChoroplethItems(
  series: AmXYSeries,
  fields?: ChoroplethFields,
): AmDataItem[] {
  return series.dataItems.filter(item =>
    readRegionName(item, fields) != null && readRegionValue(item, series, fields) != null);
}

/**
 * Convert an am5map `MapPolygonSeries` into {@link ChoroplethPoint} data.
 *
 * A region amCharts drew but joined no value onto is left out. It is the
 * ordinary case on a real map — the shapes with no data, drawn in a flat
 * colour — and a layer's value is a number, so there is nothing to announce
 * for one.
 *
 * **The centroids are what make this a map rather than a bar chart whose
 * categories happen to be places.** They are read in degrees or not at all:
 * from the author's own row first, where a table of `{ region, value, lon, lat }`
 * states them outright, and from the drawn polygon's `geoCentroid()` second.
 * A pair that resolves to neither is omitted — `ChoroplethTrace` then keeps
 * the regions in declared order in one band, which is a poorer reading but the
 * one the data supports.
 *
 * `neighbors` is not emitted at all. Adjacency is not recoverable from
 * rendered geometry, and not from centroids either, so the trace keeps its
 * spatial walk and is told nothing about borders rather than something
 * guessed — the same call the Highcharts adapter makes.
 */
export function extractChoroplethPoints(
  series: AmXYSeries,
  fields?: ChoroplethFields,
): ChoroplethPoint[] {
  const points: ChoroplethPoint[] = [];

  for (const item of series.dataItems) {
    const x = readRegionName(item, fields);
    if (x == null)
      continue;
    const y = readRegionValue(item, series, fields);
    if (y == null)
      continue;

    const row = rowOf(item);
    const centroid = readGeoCentroid(item);
    const lon = asDegrees(resolveFieldRef(row, fields?.lon, 'lon', TraceType.CHOROPLETH), 180)
      ?? centroid?.lon ?? null;
    const lat = asDegrees(resolveFieldRef(row, fields?.lat, 'lat', TraceType.CHOROPLETH), 90)
      ?? centroid?.lat ?? null;

    points.push({
      x,
      y,
      // Both or neither: a longitude alone places nothing, and a region
      // carrying half a coordinate would drop the whole map back to declared
      // order anyway — `ChoroplethTrace` bands only when every region is
      // placed. Emitting one half would look like a placement and be none.
      ...(lon != null && lat != null ? { lon, lat } : {}),
    });
  }

  return points;
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
 * Series that are not inside a chart at all, and what each one draws.
 *
 * An am5hierarchy layout, an am5flow diagram and an am5wc word cloud are
 * `am5.Series` pushed straight into a plain container, with no chart object
 * around them, which is why the adapter's discovery has to recognise the
 * series itself.
 *
 * `Sunburst` is named here in its own right rather than inherited. It extends
 * `Partition` but carries its own class name, so listing it is what makes it a
 * sunburst instead of nothing at all — and naming it separately is also what
 * keeps it from being announced as an icicle, which is the same tree drawn
 * with an entirely different mark. The same reasoning names all three chord
 * variants: each extends the last, and each carries its own class name.
 *
 * `ArcDiagram` is a sankey rather than a network. It extends `FlowSeries` and
 * carries a weight per link, and MAIDR's `NetworkPoint` has nowhere to put
 * one — so reading it as a network would silently drop the magnitudes. The
 * same call the Highcharts adapter makes for `arcdiagram`.
 *
 * Listing a class here is also what keeps it from being read as something
 * else: {@link classifySeriesKind} answers `'bar'` for anything it does not
 * know, so an unlisted flow series would be announced as a bar chart of its
 * links rather than skipped.
 *
 * One record rather than one set per module: discovery asks a single question
 * ("is this series a panel of its own?"), and a per-module set would have to
 * be unioned back together at every call site to answer it.
 */
const STANDALONE_KINDS: Record<string, SeriesKind> = {
  Treemap: 'treemap',
  Partition: 'icicle',
  Sunburst: 'sunburst',
  WordCloud: 'wordcloud',
  Sankey: 'sankey',
  ArcDiagram: 'sankey',
  Chord: 'chord',
  ChordDirected: 'chord',
  ChordNonRibbon: 'chord',
  ForceDirected: 'network',
};

/** The class names {@link STANDALONE_KINDS} covers, for discovery to probe. */
export const STANDALONE_SERIES_CLASSES = new Set(Object.keys(STANDALONE_KINDS));

/**
 * How thin a column has to be before it is read as a lollipop's stem.
 *
 * A lollipop is an ordinary column series with its columns narrowed to a
 * hairline and a bullet put on the end — amCharts has no lollipop series — so
 * the width is the only signal there is. A few pixels is far below any width a
 * bar chart is drawn at, and the bullet requirement is what keeps a merely
 * narrow bar chart out.
 */
const LOLLIPOP_MAX_STEM_PX = 6;

/** Whether a series has any bullets configured. */
function hasBullets(series: AmXYSeries): boolean {
  return (series.bullets?.values.length ?? 0) > 0;
}

/**
 * Read a graphics template's setting as a plain number.
 *
 * A `Percent` answers `null` rather than its own value: amCharts accepts one
 * for every dimension, and a percentage is not a pixel count — a column 50% of
 * its cell is not a hairline however small the number reads.
 */
function numberSetting(template: AmSprite | undefined, key: string): number | null {
  const value = template?.get?.(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Whether a line series is drawn as points alone — a Cleveland dot plot.
 *
 * amCharts has no dot or scatter series: the recipe is a `LineSeries` with its
 * stroke switched off and bullets pushed onto it, so the plot is entirely the
 * bullets. Both halves are required, because either alone is something else: a
 * strokeless series with no bullets draws nothing, and a series with bullets
 * and a stroke is a line chart with markers on it.
 *
 * A category axis is required as well. The same drawing on two value axes is a
 * scatter plot, which MAIDR reads with a trace of its own and this adapter
 * does not emit — so that case is left reading as a line rather than
 * announced as a dot plot it is not.
 */
function isDotPlot(series: AmXYSeries): boolean {
  if (!hasCategoryX(series) && !hasCategoryY(series))
    return false;
  if (!hasBullets(series))
    return false;

  const template = series.strokes?.template;
  const opacity = numberSetting(template, 'strokeOpacity');
  if (opacity !== null)
    return opacity <= 0;
  const width = numberSetting(template, 'strokeWidth');
  return width !== null && width <= 0;
}

/**
 * Whether a column series is drawn as a stem with a dot on the end.
 *
 * Measured across the bars rather than along them: a vertical lollipop's stem
 * is thin in `width` and a horizontal one's in `height`, and reading the wrong
 * one of the two would answer with the bar's length.
 */
function isLollipop(series: AmXYSeries): boolean {
  if (!hasCategoryX(series) && !hasCategoryY(series))
    return false;
  if (!hasBullets(series))
    return false;

  const thickness = numberSetting(
    series.columns?.template,
    hasCategoryY(series) ? 'height' : 'width',
  );
  return thickness !== null && thickness <= LOLLIPOP_MAX_STEM_PX;
}

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
    | 'dot'
    | 'lollipop'
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
    | 'candlestick'
    | 'dumbbell'
    | 'gantt'
    | 'treemap'
    | 'icicle'
    | 'sunburst'
    | 'wordcloud'
    | 'sankey'
    | 'chord'
    | 'network'
    | 'choropleth'
    | 'unknown';

/**
 * Whether a series draws its marks as columns.
 *
 * The one question a declared layer still has to ask about how it was drawn:
 * an estimate laid out as a column and one laid out as a bullet on a line keep
 * their geometry in different places, so the highlight has to know which. It is
 * asked of the class name rather than of the declaration, because the mark is
 * amCharts' business and the meaning is the author's.
 */
export function isColumnSeries(series: AmXYSeries): boolean {
  return COLUMN_CLASSES.has(series.className ?? '');
}

/**
 * Whether a series is one of am5flow's weighted graphs.
 *
 * Asked only by the alluvial declaration, which is the one reading amCharts
 * has no class for at all: an alluvial IS a sankey — the same weighted flow
 * drawn without a left-to-right budget — so the only thing separating them is
 * the author saying which they drew. This is the "wrong construct" half of
 * that check: a block declaring an alluvial on a pie series is a mistake worth
 * reporting, not a layer to emit with nothing in it.
 */
export function isFlowSeries(series: AmXYSeries): boolean {
  const kind = STANDALONE_KINDS[series.className ?? ''];
  return kind === 'sankey' || kind === 'chord';
}

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

  const standalone = STANDALONE_KINDS[className];
  if (standalone) {
    return standalone;
  }

  // Every am5map series, answered together. A polygon series shaded by a value
  // is a choropleth; the base geography under it, the graticule, the lines and
  // the pins are drawings rather than readings, and are skipped outright —
  // which they would not be if they fell through to the `'bar'` default below.
  if (MAP_SERIES_CLASSES.has(className)) {
    return isShadedPolygonSeries(series) ? 'choropleth' : 'unknown';
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

    // A bar narrowed to a hairline and finished with a bullet. Read after the
    // field-based kinds above, which describe what the columns MEAN; this one
    // only describes what they look like.
    if (isLollipop(series))
      return 'lollipop';

    return 'bar';
  }

  if (LINE_CLASSES.has(className)) {
    // amCharts draws an area with the line series, so the fill is the only
    // thing that separates the two. Asked before the stroke, since an area
    // whose outline is switched off is still an area.
    if (hasVisibleFill(series))
      return 'area';

    // The same series with no stroke and bullets on it is a dot plot: what is
    // drawn is the points alone.
    if (isDotPlot(series))
      return 'dot';

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

  if (FINANCIAL_CLASSES.has(className)) {
    return 'candlestick';
  }

  // Default to bar for category-based series.
  return 'bar';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Read the position a mark sits at along the main axis.
 *
 * The four places amCharts may keep it, in the order a chart is most likely to
 * mean: the category it was bound to, the value on a value axis, the `Date` a
 * date axis stores, and finally the raw column the series named as its category
 * field for a chart whose data items have not been processed yet.
 *
 * Exported for the declared-trace reader, which reads the same position off
 * series the heuristics deliberately do not classify.
 */
export function readXValue(item: AmDataItem, series: AmXYSeries): unknown {
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
 *
 * Coerces the way `Number()` does, so `null` reads as 0 and `''` as 0: every
 * caller here has already established that the value is present. A value that
 * may legitimately be absent — anything read off an author's own row — goes
 * through the declared reader's stricter conversion instead.
 */
export function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Render an axis position as the `string | number` the grammar's points carry.
 */
export function toStringOrNumber(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value))
    return value;
  return String(value ?? '');
}
