/**
 * AnyChart → MAIDR adapter converters.
 *
 * Extracts data from an AnyChart chart instance and produces a {@link Maidr}
 * JSON object that the core MAIDR library can consume. This allows AnyChart
 * visualizations to be made accessible via audio sonification, text
 * descriptions, braille output, and keyboard navigation.
 *
 * @example
 * ```ts
 * import { bindAnyChart } from 'maidr/anychart';
 *
 * const chart = anychart.bar([4, 2, 7, 1]);
 * chart.container('container').draw();
 *
 * bindAnyChart(chart);
 * ```
 *
 * @packageDocumentation
 */

import type {
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  CandlestickTrend,
  ChoroplethPoint,
  DumbbellData,
  DumbbellPoint,
  FlowPoint,
  GanttData,
  GanttPoint,
  HeatmapData,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  MosaicPoint,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  WaterfallKind,
  WaterfallPoint,
  WordCloudPoint,
} from '@type/grammar';
import type {
  AnyChartBinderOptions,
  AnyChartDataView,
  AnyChartGridInput,
  AnyChartInstance,
  AnyChartIterator,
  AnyChartsBinderOptions,
  AnyChartSeries,
  AnyChartTitle,
  AnyChartTree,
  AnyChartTreeItem,
} from './types';
import { nextId } from '@adapters/shared/selectorUtil';
import { Orientation, TraceType } from '@type/grammar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * AnyChart series types that are visually different from their MAIDR
 * representation. A runtime warning is emitted for these so developers are
 * aware of the semantic difference their screen-reader users will experience.
 *
 * `step-area` is the only one left: MAIDR has an {@link TraceType.AREA} trace
 * but no stepped variant of it, so a staircase with a fill has to give up one
 * of the two. It keeps the staircase, because that is what its values do.
 */
const FILL_LOSING_TYPES = new Set(['step-area']);

/**
 * The subset of {@link TraceType}s the AnyChart adapter can produce from a
 * chart SERIES. AnyChart exposes no histogram/smooth series types, and the
 * stacked area variants are a property of the chart's y scale rather than of
 * a series (see {@link resolveAreaVariant}), so {@link mapSeriesType} only
 * ever yields these. Narrowing here lets {@link buildLayer}'s switch be
 * provably exhaustive at compile time.
 */
type AnyChartTraceType
  = | TraceType.BAR
    | TraceType.DOT
    | TraceType.LOLLIPOP
    | TraceType.LINE
    | TraceType.AREA
    | TraceType.SCATTER
    | TraceType.STEP
    | TraceType.BOX
    | TraceType.DUMBBELL
    | TraceType.HEATMAP
    | TraceType.CANDLESTICK
    | TraceType.CHOROPLETH
    | TraceType.PIE;

/**
 * Map AnyChart series type strings to MAIDR TraceType values.
 *
 * AnyChart uses lowercase type names such as "bar", "line", "column", etc.
 * Multi-word types are normalised to kebab-case before lookup.
 * This mapping covers the chart types that MAIDR currently supports.
 *
 * @remarks
 * - `"bar"` (horizontal) and `"column"` (vertical) both map to
 *   {@link TraceType.BAR}. MAIDR does not currently distinguish
 *   bar orientation at the trace-type level.
 * - `area` and `spline-area` map to {@link TraceType.AREA}, which is read as
 *   the filled band it is drawn as. Whether that band is stacked is a
 *   chart-level question the series cannot answer — {@link resolveAreaVariant}
 *   asks the y scale and promotes the layer.
 * - `step-area` is the one area type that still loses its fill: MAIDR has no
 *   stepped area trace, and a staircase is better described as a staircase
 *   than as a smoothly interpolated band. A runtime warning is emitted so
 *   developers are aware.
 * - The step-drawn types (`step-line`, `step-area`) map to
 *   {@link TraceType.STEP} so they are announced and navigated as the
 *   piecewise-constant series they are, rather than as interpolated lines.
 * - `stick` is AnyChart's lollipop: a stroke from the baseline to the value,
 *   usually with a marker on its end. It carries the same `x` / `value` pair a
 *   bar does and is read as {@link TraceType.LOLLIPOP} — one category, one
 *   magnitude, announced as the chart the author drew.
 * - `range-column` and `range-bar` carry `low` / `high` rather than `value`,
 *   which is the pair {@link TraceType.DUMBBELL} is for. AnyChart draws them
 *   as floating bars rather than as two dots joined by a segment, so the mark
 *   differs; what a reader navigates does not.
 * - `marker` maps to {@link TraceType.SCATTER} here, but a marker series on an
 *   ordinal x scale is a Cleveland dot plot rather than a point cloud. That is
 *   a question about the chart's scale rather than about the series, so
 *   {@link resolveMarkerVariant} asks it and promotes the layer.
 * - `choropleth` is the map module's shaded-region series. It names itself, so
 *   nothing chart-level is required to recognise one — deliberately, because
 *   {@link readChartType} answers `''` on a build with no `getType()` and on a
 *   chart that has not been drawn, and gating on it would drop working maps.
 * - `"pie"` covers doughnuts too: AnyChart draws one with `chart.innerRadius()`
 *   on an ordinary pie, so both report the same type and read identically.
 *   A pie chart has no series API of its own, so this branch only fires for
 *   builds that expose one — {@link buildSubplot} routes the chart-level pie
 *   before ever asking for a series.
 */
export function mapSeriesType(anyChartType: string): AnyChartTraceType | null {
  const normalized = anyChartType.toLowerCase().replace(/[_\s]/g, '-');
  const mapping: Record<string, AnyChartTraceType> = {
    // Both horizontal bar and vertical column map to BAR.
    // MAIDR does not currently distinguish bar orientation at the trace level.
    'bar': TraceType.BAR,
    'column': TraceType.BAR,
    'line': TraceType.LINE,
    'spline': TraceType.LINE,
    // Step-drawn series are piecewise constant, not interpolated.
    'step-line': TraceType.STEP,
    'area': TraceType.AREA,
    'spline-area': TraceType.AREA,
    // The one area type with no MAIDR equivalent: it keeps its staircase and
    // loses its fill.
    'step-area': TraceType.STEP,
    'scatter': TraceType.SCATTER,
    'marker': TraceType.SCATTER,
    'bubble': TraceType.SCATTER,
    // A stroke from the baseline to the value, with a marker on its end.
    'stick': TraceType.LOLLIPOP,
    // The two range series that carry a `low` / `high` pair per category.
    'range-column': TraceType.DUMBBELL,
    'range-bar': TraceType.DUMBBELL,
    'box': TraceType.BOX,
    'heatmap': TraceType.HEATMAP,
    'heat': TraceType.HEATMAP,
    'candlestick': TraceType.CANDLESTICK,
    'ohlc': TraceType.CANDLESTICK,
    // A map's regions, shaded by value. The one map series that carries a
    // magnitude — `marker`, `bubble` and `connector` draw over a map rather
    // than colouring it — and its own name is the whole detection.
    'choropleth': TraceType.CHOROPLETH,
    'pie': TraceType.PIE,
  };

  const traceType = mapping[normalized] ?? null;

  // Warn when a series loses its fill. Checked on the source type, not the
  // mapped one, so `step-area` (a STEP trace) is what this reports on.
  if (traceType !== null && FILL_LOSING_TYPES.has(normalized)) {
    console.warn(
      `[maidr/anychart] AnyChart "${anyChartType}" series mapped to ${traceType} trace. `
      + 'The filled-area visual will be represented as an unfilled series for accessibility.',
    );
  }

  return traceType;
}

/** Safely extract the title text from an AnyChart chart. */
function extractTitle(chart: AnyChartInstance): string | undefined {
  try {
    const title = chart.title();
    if (typeof title === 'string')
      return title;
    return (title as AnyChartTitle).text?.() ?? undefined;
  } catch {
    return undefined;
  }
}

/** Safely extract the axis title text from an AnyChart Cartesian chart. */
function extractAxisTitle(
  chart: AnyChartInstance,
  axis: 'x' | 'y',
): string | undefined {
  try {
    const axisAccessor = axis === 'x' ? chart.xAxis : chart.yAxis;
    if (!axisAccessor)
      return undefined;
    const axisObj = axisAccessor.call(chart, 0);
    return axisObj?.title().text() ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The chart's own type name, lower-cased, or `''` when it names none.
 *
 * `getType()` is absent on some builds and throws on a chart that has not been
 * drawn, and every caller wants the same answer in both cases: a string that
 * matches nothing.
 */
function readChartType(chart: AnyChartInstance): string {
  try {
    return chart.getType?.().toLowerCase() ?? '';
  } catch {
    return '';
  }
}

/**
 * The chart-level data view, on a chart that has one.
 *
 * `chart.data()` answers with a data view on every single-dataset chart type
 * and with an {@link AnyChartTree} on a gantt, and the two share no method:
 * asking a tree for an iterator throws. Which one arrived is therefore
 * decided by the object rather than by the chart type, so a gantt reaching a
 * reader written for a data view is a no-op instead of an exception.
 *
 * @param chart - The chart to ask
 * @returns Its data view, or `undefined` when it has none
 */
function resolveChartDataView(
  chart: AnyChartInstance,
): AnyChartDataView | undefined {
  let data: AnyChartDataView | AnyChartTree | undefined;
  try {
    data = chart.data?.();
  } catch {
    return undefined;
  }
  if (data && 'getIterator' in data && typeof data.getIterator === 'function')
    return data;
  return undefined;
}

/** Resolve the DOM element that holds the AnyChart SVG rendering. */
export function resolveContainerElement(
  chart: AnyChartInstance,
): HTMLElement | null {
  try {
    const container = chart.container();
    if (!container)
      return null;

    // container() may return a string (element id), an HTMLElement, or a
    // Stage wrapper with its own `.container()` / `.domElement()`.
    if (typeof container === 'string') {
      return document.getElementById(container);
    }
    if (container instanceof HTMLElement) {
      return container;
    }

    // Stage-like object. Prefer `stage.container()` (the user's parent DIV)
    // over `stage.domElement()` (the stage's SVG element). The DIV is the
    // correct host to search for the rendered SVG inside.
    const stage = container as { container?: () => HTMLElement | null; domElement?: () => HTMLElement | null };
    if (typeof stage.container === 'function') {
      const inner = stage.container();
      if (inner instanceof HTMLElement)
        return inner;
    }
    if (typeof stage.domElement === 'function') {
      return stage.domElement();
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Resolve a data iterator for an AnyChart series.
 *
 * AnyChart 8.x exposes `getIterator()` on `series.data()` (the data view /
 * mapping). Some series classes also expose `getIterator()` directly. This
 * helper tries the direct method first and falls back to the data view so the
 * adapter works with both shapes.
 */
function resolveIterator(series: AnyChartSeries): AnyChartIterator | undefined {
  if (typeof series.getIterator === 'function') {
    try {
      return series.getIterator();
    } catch {
      // Fall through to data() path.
    }
  }
  if (typeof series.data === 'function') {
    try {
      const view = series.data();
      if (view && typeof view.getIterator === 'function')
        return view.getIterator();
    } catch {
      // No iterator available.
    }
  }
  return undefined;
}

/**
 * Extract raw data rows from an AnyChart series using its iterator.
 *
 * Returns an array of field maps. The concrete field names depend on the
 * AnyChart series type – most Cartesian series expose `"x"` and `"value"`.
 * Box series expose `"lowest"`, `"q1"`, `"median"`, `"q3"`, `"highest"`.
 * Candlestick/OHLC series expose `"open"`, `"high"`, `"low"`, `"close"`.
 */
export function extractRawRows(
  series: AnyChartSeries,
): Array<Record<string, unknown>> {
  const iterator: AnyChartIterator | undefined = resolveIterator(series);
  return iterator ? readRows(iterator) : [];
}

/**
 * The name a series is labelled by, when it has one.
 *
 * Only the stacked-area path needs it: its bands live in one layer and a
 * reader moving between them has nothing else to tell them apart. An unnamed
 * series returns `undefined` rather than an invented label, which leaves
 * `LineTrace`'s own `l1` / `l2` fallback in charge — the one place that
 * decision is already made.
 *
 * @param series - The series to name
 * @returns Its name, or `undefined` when it has none
 */
function readSeriesName(series: AnyChartSeries): string | undefined {
  try {
    const name = series.name();
    return name ? String(name) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which area variant this chart's area series belong to.
 *
 * Stacking lives on the y SCALE, not on a series: AnyChart reports an area
 * series as `'area'` whether the chart sums the bands or draws them over one
 * another, so {@link mapSeriesType} cannot tell the difference and every area
 * series on one chart shares whatever answer this gives.
 *
 * @param chart - The chart to inspect
 * @returns The trace type its area series should be read as
 */
function resolveAreaVariant(
  chart: AnyChartInstance,
): TraceType.AREA | TraceType.STACKED_AREA | TraceType.NORMALIZED_AREA {
  let stackMode: string | undefined;
  try {
    const mode = chart.yScale?.()?.stackMode?.();
    stackMode = mode === undefined || mode === null ? undefined : String(mode);
  } catch {
    // A chart type with no stackable y scale is simply not stacked.
    stackMode = undefined;
  }

  if (stackMode === 'percent')
    return TraceType.NORMALIZED_AREA;
  if (stackMode === 'value')
    return TraceType.STACKED_AREA;
  return TraceType.AREA;
}

/**
 * Whether the chart's categories are named rather than measured.
 *
 * AnyChart gives a Cartesian chart an ordinal x scale and a scatter chart a
 * linear one, which is the whole difference between a dot plot and a point
 * cloud — the series is a `marker` either way. Anything other than `'ordinal'`
 * (and a chart with no x scale at all) answers no, so a chart that cannot be
 * asked keeps the reading it has today.
 *
 * @param chart - The chart to inspect
 * @returns True when its x scale is ordinal
 */
function hasOrdinalXScale(chart: AnyChartInstance): boolean {
  try {
    return chart.xScale?.()?.getType?.() === 'ordinal';
  } catch {
    return false;
  }
}

/**
 * Whether the chart draws a series' categories in the opposite order to the
 * one its rows are listed in.
 *
 * `chart.xScale().inverted(...)` reverses which end the categories start at,
 * while AnyChart goes on rendering the marks in data order -- so when the two
 * disagree, a layer emitted as written is announced as the mirror image of the
 * chart (#1021).
 *
 * `inverted()` alone does not answer it, because AnyChart's defaults differ by
 * chart type and **both agree with data order**. Measured on 8.13.0, reading
 * a freshly constructed chart before touching anything:
 *
 *   anychart.bar    (horizontal)  inverted() === true
 *   anychart.column (vertical)    inverted() === false
 *
 * A horizontal bar runs its categories down the page, and inverting is what
 * puts the first one at the top; a vertical column runs them across, and not
 * inverting is what puts the first one at the left. So the reading is
 * backwards exactly when `inverted()` disagrees with the series' own
 * direction, which is `'bar'` for horizontal and `'column'` for vertical --
 * and an ordinary chart of either kind is left alone.
 *
 * The **x** scale specifically: inverting the value scale was measured to move
 * no category, only which end the bars hang from, so asking "is either scale
 * inverted" would reorder a chart that did not move.
 *
 * Defensive in the same shape as {@link hasOrdinalXScale} -- a chart or series
 * that cannot be asked keeps the reading it has today.
 *
 * @param chart - The chart the series belongs to
 * @param series - The bar or column series being read
 * @returns True when the drawn order is the reverse of the listed order
 */
function drawsCategoriesReversed(
  chart: AnyChartInstance,
  series: AnyChartSeries,
): boolean {
  try {
    const inverted = chart.xScale?.()?.inverted?.() === true;
    const horizontal = series.seriesType() === 'bar';
    return inverted !== horizontal;
  } catch {
    return false;
  }
}

/**
 * Which point-drawn variant this chart's `marker` series belong to.
 *
 * A marker series against named categories is a Cleveland dot plot: one
 * magnitude per category, read exactly as a bar chart is. Against a measured x
 * axis the same series is a scatter, and its `x` is half the datum.
 *
 * The distinction matters beyond the announcement. {@link buildScatterLayer}
 * forces both coordinates numeric, so a dot plot read as a scatter has every
 * one of its category labels coerced to `0` — a chart whose x axis is a single
 * repeated value.
 *
 * `bubble` is deliberately left alone: its rows carry a size as well, and
 * reading one as a dot plot would drop it.
 *
 * @param chart - The chart the series belongs to
 * @param seriesType - The series' own AnyChart type
 * @returns The trace type to read it as, or `null` when it is not a marker
 * series
 */
function resolveMarkerVariant(
  chart: AnyChartInstance,
  seriesType: string,
): TraceType.SCATTER | TraceType.DOT | null {
  if (seriesType !== 'marker')
    return null;
  return hasOrdinalXScale(chart) ? TraceType.DOT : TraceType.SCATTER;
}

/**
 * Walk an AnyChart iterator and collect every field the adapter reads.
 *
 * Shared by {@link extractRawRows} (series-backed charts) and the chart-level
 * pie path, whose data lives on `chart.data()` rather than on a series — the
 * rows carry the same `x` / `value` fields either way.
 */
function readRows(iterator: AnyChartIterator): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  iterator.reset();
  while (iterator.advance()) {
    const row: Record<string, unknown> = { _index: iterator.getIndex() };
    for (const field of [
      'x',
      'name',
      'value',
      'y',
      // Box fields
      'lowest',
      'q1',
      'median',
      'q3',
      'highest',
      // Candlestick/OHLC fields. `high` / `low` also carry the pair a
      // range-column / range-bar series draws its floating bar between.
      'open',
      'high',
      'low',
      'close',
      'volume',
      // Heatmap cell value
      'heat',
      // The geo feature a map row is matched to. Carries the id the geodata
      // declared (`'US.CA'`), never the region's name.
      'id',
      // Sankey flow: both ends and how much runs between them
      'from',
      'to',
      'weight',
      // Waterfall: the step that restates the running total rather than
      // changing it
      'isTotal',
      // Grouping
      'fill',
      'group',
    ]) {
      const v = iterator.get(field);
      if (v !== undefined && v !== null)
        row[field] = v;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Attribute name stamped onto each bar's SVG element by
 * {@link stampBarAttributes}. The value encodes `<seriesIndex>-<pointIndex>`
 * so per-series selectors can be derived deterministically.
 */
const BAR_ATTR = 'data-maidr-anychart-bar';

/**
 * Attribute name stamped onto each line-point marker's SVG element by
 * {@link stampLineAttributes}. The value encodes `<seriesIndex>-<pointIndex>`
 * so per-series selectors can be derived deterministically.
 */
const LINE_ATTR = 'data-maidr-anychart-line-point';

/**
 * AnyChart series types that render as a connected line and therefore need
 * markers enabled for per-point highlighting. Area variants are included
 * because an area is a stroked polyline with a fill beneath it — the fill is
 * not navigable, so its points still need markers — and the step variants
 * because a staircase is one too. {@link resolveSelector} gives AREA and STEP
 * the same attribute selector as LINE for exactly that reason.
 *
 * `stick` is here for the same reason and gains the most from it: AnyChart
 * groups it with the line series in its own theme, and a stick is a tall thin
 * stroke that {@link collectLineMarkerCandidates}' aspect-ratio filter rejects
 * outright — so the marker on its end is the only element a lollipop has to
 * highlight. Enabling markers is also what makes it look like the lollipop it
 * is read as.
 */
const LINE_LIKE_SERIES_TYPES = new Set([
  'line',
  'spline',
  'step-line',
  'area',
  'step-area',
  'spline-area',
  'stick',
]);

/**
 * The AnyChart series drawn as one floating bar per category, from a `low` to
 * a `high` — the pair {@link TraceType.DUMBBELL} reads.
 *
 * `hilo` is deliberately absent even though it carries the same two fields.
 * AnyChart draws it as a bare stroke (`fill="none"`), so the filled-mark
 * lookup every stamper here is built on cannot find it, and the only shapes
 * left to tell it apart from the grid lines and axis strokes are stroked paths
 * too. It would announce correctly and never highlight.
 */
const RANGE_SERIES_TYPES = new Set(['range-column', 'range-bar']);

/**
 * The bar series a diverging chart is drawn from.
 *
 * Both orientations, because which one AnyChart calls a `bar` is a fact about
 * the axis rather than about the chart: a tornado chart is drawn with
 * `anychart.bar()` and a population pyramid sometimes with `anychart.column()`.
 */
const DIVERGING_SERIES_TYPES = new Set(['bar', 'column']);

/** The one series type a waterfall chart draws its bridge from. */
const WATERFALL_SERIES_TYPES = new Set(['waterfall']);

/** The one series type a marimekko draws its tiles from. */
const MOSAIC_SERIES_TYPES = new Set(['mekko']);

/**
 * The map series that shades its regions by value. Its siblings — `marker`,
 * `bubble`, `connector` — draw *over* a map rather than colouring it, and are
 * distinct type strings, so nothing plainer wears this name.
 */
const CHOROPLETH_SERIES_TYPES = new Set(['choropleth']);

/**
 * The chart types AnyChart's two gantt constructors report. A project chart
 * gives every task its own `actualStart` / `actualEnd`; a resource chart gives
 * each row a `periods` array and can therefore hold several intervals in one
 * lane. Both are read as one schedule.
 */
const GANTT_CHART_TYPES = new Set(['gantt-project', 'gantt-resource']);

/**
 * The series types a radar or polar chart draws that this adapter can read.
 *
 * Everything here carries one `value` per category, which is what
 * {@link buildLineLayer} reads. A polar `rangeColumn` is deliberately absent:
 * its rows carry `low` / `high` and no `value`, so reading it as a radar would
 * announce a magnitude of zero for every spoke.
 */
const RADIAL_SERIES_TYPES = new Set([
  'line',
  'spline',
  'area',
  'spline-area',
  'marker',
  'column',
  'polygon',
  'polyline',
]);

/**
 * The radial series types drawn as a wedge out from the centre rather than as
 * an outline around it — the mark that makes a polar chart a polar AREA chart.
 */
const WEDGE_SERIES_TYPES = new Set(['column', 'area', 'polygon']);

/**
 * Attribute name stamped onto every box-plot element (IQR rect, median line,
 * each whisker segment) by {@link stampBoxAttributes}. The value encodes
 * `<seriesIndex>-<boxIndex>` so per-box, per-series selectors can be
 * derived deterministically. Paired with {@link BOX_PART_ATTR} below.
 */
const BOX_ATTR = 'data-maidr-anychart-box';

/**
 * Attribute name stamped alongside {@link BOX_ATTR} to identify which
 * visual part of a box a given element represents. Values match the
 * {@link BoxSelector} field names that MAIDR's `BoxTrace` consumes:
 *   - `'iq'`  — filled IQR body (Q1-Q3 range); Q1 and Q3 are derived from
 *               its top/bottom edges via `Svg.createLineElement`.
 *   - `'q2'`  — median stroke (horizontal line inside the IQR).
 *   - `'min'` — lower whisker (vertical stroke below the IQR).
 *   - `'max'` — upper whisker (vertical stroke above the IQR).
 */
const BOX_PART_ATTR = 'data-maidr-anychart-box-part';

/**
 * Attribute name stamped onto each scatter / point / bubble marker's SVG
 * element by {@link stampScatterAttributes}. The value encodes
 * `<seriesIndex>-<pointIndex>` so per-series selectors can be derived
 * deterministically.
 */
const POINT_ATTR = 'data-maidr-anychart-point';

/**
 * Attribute name stamped onto each heatmap cell's SVG element by
 * {@link stampHeatmapAttributes}. Heatmaps are single-series, so the value
 * encodes `<rowIndex>-<colIndex>` (row-major) for direct lookup.
 */
const HEATMAP_ATTR = 'data-maidr-anychart-heatmap-cell';

/**
 * Attribute name stamped onto each candlestick path element by
 * {@link stampCandlestickAttributes}. Value encodes
 * `<seriesIndex>-<pointIndex>`. AnyChart renders each candle (wick + body)
 * as ONE <path>, so a single attribute on the path lets the model
 * highlight the whole candle across all OHLC segments.
 */
const CANDLESTICK_ATTR = 'data-maidr-anychart-candlestick-cell';

/**
 * Attribute name stamped onto each pie wedge's SVG element by
 * {@link stampPieAttributes}. A pie chart holds a single dataset, but the
 * value still encodes `<seriesIndex>-<sliceIndex>` so it shares the selector
 * shape of every other trace family (the chart-level path stamps series `0`).
 */
const PIE_ATTR = 'data-maidr-anychart-pie-slice';

/**
 * Attribute name stamped onto each funnel (or pyramid) segment's SVG element
 * by {@link stampFunnelAttributes}. Like a pie, a funnel holds a single
 * dataset, so the value encodes `<seriesIndex>-<stageIndex>` with the series
 * always `0` — keeping the selector shape uniform across trace families.
 */
const FUNNEL_ATTR = 'data-maidr-anychart-funnel-stage';

/**
 * Attribute name stamped onto each tag-cloud term's `<text>` element by
 * {@link stampWordCloudAttributes}. The value encodes `<seriesIndex>-<termIndex>`
 * with the series always `0`, and the term index is the term's position in the
 * chart's DATA — not in the SVG, which a cloud packs in an unrelated order.
 */
const WORD_CLOUD_ATTR = 'data-maidr-anychart-word';

/**
 * Attribute name stamped onto each sankey ribbon's `<path>` element by
 * {@link stampSankeyAttributes}. A sankey holds a single dataset, so the value
 * encodes `<seriesIndex>-<flowIndex>` with the series always `0` — keeping the
 * selector shape uniform across trace families. The flow index is the flow's
 * position in the chart's DATA.
 */
const SANKEY_ATTR = 'data-maidr-anychart-flow';

/**
 * Attribute name stamped onto each waterfall bar's SVG element by
 * {@link stampWaterfallAttributes}. A waterfall reads as one sequence of steps
 * however many series drew it (see {@link buildWaterfallLayer}), so the value
 * encodes `<seriesIndex>-<stepIndex>` with the series always `0`.
 */
const WATERFALL_ATTR = 'data-maidr-anychart-waterfall-step';

/**
 * Attribute name stamped onto each marimekko tile's SVG element by
 * {@link stampMosaicAttributes}. The value encodes
 * `<seriesIndex>-<categoryIndex>`.
 */
const MOSAIC_ATTR = 'data-maidr-anychart-tile';

/**
 * Attribute name stamped onto each radar / polar mark's SVG element by
 * {@link stampRadarAttributes}. The value encodes `<seriesIndex>-<spokeIndex>`,
 * where the spoke index is the point's position in the series' DATA.
 */
const RADAR_ATTR = 'data-maidr-anychart-spoke';

/**
 * Attribute name stamped onto each floating bar of a range series by
 * {@link stampDumbbellAttributes}. The value encodes
 * `<seriesIndex>-<pairIndex>`. One element carries a whole pair: AnyChart
 * draws the two ends as one bar, which is also how `DumbbellTrace` resolves
 * them — both ends of a row highlight the same element.
 */
const DUMBBELL_ATTR = 'data-maidr-anychart-pair';

/**
 * Attribute name stamped onto each shaded region of a map by
 * {@link stampChoroplethAttributes}. The value encodes
 * `<seriesIndex>-<regionIndex>`, where the region index is the row's position
 * in the SERIES' data — a map draws every feature of its geodata, in the
 * geodata's order, so document order is not data order here.
 */
const CHOROPLETH_ATTR = 'data-maidr-anychart-region';

/**
 * Attribute name stamped onto each task bar of a gantt chart by
 * {@link stampGanttAttributes}. The value encodes `<laneIndex>-<intervalIndex>`
 * — a gantt has no series API, so the first half names the lane instead.
 */
const GANTT_ATTR = 'data-maidr-anychart-task-bar';

/**
 * Attribute name stamped onto each panel's own `<svg>` root by
 * {@link bindAnyCharts}. Its value is the panel token
 * (`<figureId>-<row>-<col>`), which uniquely identifies one chart's SVG
 * within the page. Every layer selector emitted for a multi-panel figure is
 * prefixed with `[data-maidr-anychart-panel="<token>"] ` so MAIDR's
 * document-global selector resolution can never leak into another panel
 * (or another figure).
 */
const PANEL_ATTR = 'data-maidr-anychart-panel';

/**
 * Identifies one panel (subplot cell) of a multi-panel AnyChart figure.
 * `undefined` everywhere a panel context is accepted means "single-panel
 * mode" — selectors and stamped attribute values then keep their original,
 * un-prefixed shape so existing single-chart behavior is unchanged.
 */
interface PanelContext {
  /** Page-unique token: `<sanitized figureId>-<row>-<col>`. */
  token: string;
  /** Subplot grid row (row-major, visual reading order). */
  row: number;
  /** Subplot grid column. */
  col: number;
}

/**
 * Descendant-combinator prefix scoping a selector to one panel's SVG.
 * Empty string in single-panel mode.
 */
function panelScope(panel: PanelContext | undefined): string {
  return panel ? `[${PANEL_ATTR}="${panel.token}"] ` : '';
}

/**
 * Prefix baked into every stamped attribute VALUE for a panel (e.g.
 * `data-maidr-anychart-bar="<token>:0-3"`). Scoping the values themselves —
 * not just the selectors — also fixes cross-figure collisions between two
 * independently bound charts whose bare `<series>-<point>` values would
 * otherwise be identical. Empty string in single-panel mode.
 */
function panelStampPrefix(panel: PanelContext | undefined): string {
  return panel ? `${panel.token}:` : '';
}

/**
 * Sanitize a figure id for embedding in attribute values / CSS attribute
 * selectors (quotes and other CSS-hostile characters become underscores).
 */
function sanitizePanelToken(value: string): string {
  return value.replace(/[^\w-]/g, '_');
}

/**
 * Resolve the CSS selector for a specific series index.
 *
 * AnyChart's internal SVG structure does not use stable, predictable class
 * names — layer groups carry only randomised `id` and `data-ac-wrapper-id`
 * attributes. When the caller does not supply selectors, we therefore rely
 * on per-element attributes that the adapter stamps during render:
 * - BAR: {@link stampBarAttributes} writes `data-maidr-anychart-bar`.
 * - LINE and STEP: {@link stampLineAttributes} writes
 *   `data-maidr-anychart-line-point` using a class-free geometric DOM walk
 *   (markers must be enabled, which {@link enableLineMarkersIfNeeded}
 *   ensures by mutating the series and forcing a redraw). Step series are
 *   stamped by the same pass — they are in {@link LINE_LIKE_SERIES_TYPES} —
 *   so they share the LINE selector rather than having one of their own.
 * - BOX: handled inside {@link buildBoxLayer} — it constructs a
 *   `BoxSelector[]` referring to the per-part attributes
 *   ({@link BOX_ATTR} + {@link BOX_PART_ATTR}) stamped by
 *   {@link stampBoxAttributes}. `resolveSelector` returns `undefined` for
 *   BOX so that the layer-builder owns selector construction.
 * Callers can override either behaviour by passing an explicit `selectors`
 * entry.
 */
/**
 * One selector per bar, naming the marks in the order the payload lists them.
 *
 * The default bar selector is a prefix match over the stamped attribute, which
 * resolves in document order -- and AnyChart renders its marks in data order
 * whichever way the scale runs. A layer read from the far end therefore cannot
 * use it: point 0 would outline the bar at the opposite end. The per-point
 * stamp {@link stampBarAttributes} already writes is enough to name them one
 * by one, so nothing extra has to be stamped (#1021).
 *
 * @param seriesIndex - Index of the series within its chart
 * @param pointCount  - How many bars the series drew
 * @param panel       - The panel context, in multi-panel mode
 * @returns One selector per point, in the payload's order
 */
function barSelectorsInDrawnOrder(
  seriesIndex: number,
  pointCount: number,
  panel?: PanelContext,
): string[] {
  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  return Array.from(
    { length: pointCount },
    (_, i) => `${scope}[${BAR_ATTR}="${stamp}${seriesIndex}-${pointCount - 1 - i}"]`,
  );
}

function resolveSelector(
  seriesIndex: number,
  traceType: AnyChartTraceType,
  options?: AnyChartBinderOptions,
  panel?: PanelContext,
): string | string[] | undefined {
  const userSelectors = options?.selectors;
  if (userSelectors && userSelectors.length > 0) {
    // If the array has exactly one element and it is a string, apply it to
    // all series as a shared selector.
    if (userSelectors.length === 1 && typeof userSelectors[0] === 'string')
      return userSelectors[0];
    // Per-series: look up by index.
    return userSelectors[seriesIndex] ?? undefined;
  }

  // No explicit selector → use the per-series stamped attribute selector.
  // BAR uses `data-maidr-anychart-bar`; LINE uses
  // `data-maidr-anychart-line-point` (requires markers enabled on the series,
  // which {@link enableLineMarkersIfNeeded} handles).
  // In multi-panel mode both the selector (descendant of the panel's SVG)
  // and the attribute value (token prefix) are scoped to the panel.
  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  // Exhaustive over AnyChartTraceType, mirroring buildLayer, so adding a
  // member to that union is a compile error here rather than a silent
  // `undefined` — which is a missing selector, which is a chart that
  // announces correctly but never highlights.
  switch (traceType) {
    case TraceType.BAR:
      return `${scope}[${BAR_ATTR}^="${stamp}${seriesIndex}-"]`;
    // AREA shares the line's markers, and so its selector: an area series is
    // a stroked polyline with a fill under it, and the fill is not navigable.
    // A lollipop's stick is rejected by the marker filter for being long and
    // thin, so the marker on its end is what it highlights — the line's
    // element again.
    case TraceType.LINE:
    case TraceType.STEP:
    case TraceType.AREA:
    case TraceType.LOLLIPOP:
      return `${scope}[${LINE_ATTR}^="${stamp}${seriesIndex}-"]`;
    // A dot plot IS a marker series, drawn by the same code and stamped by the
    // same pass — only the scale under it differs.
    case TraceType.SCATTER:
    case TraceType.DOT:
      return `${scope}[${POINT_ATTR}^="${stamp}${seriesIndex}-"]`;
    case TraceType.DUMBBELL:
      return `${scope}[${DUMBBELL_ATTR}^="${stamp}${seriesIndex}-"]`;
    case TraceType.PIE:
      return `${scope}[${PIE_ATTR}^="${stamp}${seriesIndex}-"]`;
    // Heatmaps are single-series (no series-index prefix); the chart-level
    // builder constructs the selector itself, so this branch only matters as
    // a defensive default when the heatmap path is bypassed.
    case TraceType.HEATMAP:
      return `${scope}[${HEATMAP_ATTR}]`;
    // All three own their selector construction in their layer builder — see
    // the BOX note above; candlestick likewise emits a CandlestickSelector,
    // and a choropleth needs one exact-match entry per region in DATA order,
    // which a prefix selector (resolved in document order) cannot express.
    case TraceType.BOX:
    case TraceType.CANDLESTICK:
    case TraceType.CHOROPLETH:
      return undefined;
  }
}

/**
 * Collect bar-shape candidate elements from a single root, applying the
 * shared "looks like a bar" filter (non-defs, non-clip, non-zero bbox, and
 * bbox area below a fraction of the chart SVG to exclude plot-area
 * backgrounds and frame rectangles).
 */
function collectShapeCandidatesFromRoot(
  root: ParentNode,
  svgArea: number,
  maxAreaFraction: number,
): SVGElement[] {
  const out: SVGElement[] = [];
  const shapes = root.querySelectorAll<SVGElement>('rect, path');
  for (const el of Array.from(shapes)) {
    // Skip clip-path / definition shapes and any descendant of them.
    if (el.closest('defs, clipPath'))
      continue;
    let bbox: DOMRect | null = null;
    try {
      bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0)
      continue;
    // Reject the plot-area background and chart frame: any shape that
    // occupies more than `maxAreaFraction` of the chart SVG is almost
    // certainly not an individual data bar.
    if (svgArea > 0 && bbox.width * bbox.height > svgArea * maxAreaFraction)
      continue;
    out.push(el);
  }
  return out;
}

/**
 * Stamp a stable `data-maidr-anychart-bar` attribute on every bar element
 * rendered by an AnyChart cartesian bar/column series.
 *
 * AnyChart's GraphicsJS renderer does not expose stable CSS classes for
 * individual data points, and AnyChart's public Point API has no
 * `getDomElement()` method. The only reliable cross-version path is to
 * query the rendered SVG for the candidate shapes and stamp them
 * ourselves so MAIDR's highlight layer can find them with a deterministic
 * selector.
 *
 * Filtering layers (in order of preference):
 * 1. Prefer shapes inside series-class groups (`g[class*="series"]`) —
 *    these reliably exclude the plot-area background rectangle that lives
 *    in its own background group.
 * 2. Filter out clip-path / definition shapes.
 * 3. Filter out shapes with zero bounding boxes (invisible markers).
 * 4. Filter out shapes whose bounding box exceeds 40 % of the chart SVG
 *    area — this rejects the plot background and chart frame that
 *    otherwise look identical to bars at the DOM level.
 *
 * In document order the surviving candidates are assigned to each series'
 * points: the first N go to series 0, the next M to series 1, etc. The
 * stamp is idempotent: elements already carrying the attribute are left
 * untouched.
 */
function stampBarAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  // Establish the chart SVG area as a reference for the "too large to be a
  // bar" filter. `getBoundingClientRect()` is used because `getBBox()` on
  // the outer <svg> includes only painted descendants, which is
  // approximately what we want — but getBoundingClientRect is safer across
  // browsers when the SVG has no viewBox set.
  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;
  const MAX_AREA_FRACTION = 0.4;

  // Layer 1: prefer shapes that live inside a series-class group. AnyChart
  // renders the plot-area background outside any series group, so this
  // scoping alone excludes the most common false positive.
  let candidates: SVGElement[] = [];
  const seriesGroups = svg.querySelectorAll<SVGElement>('g[class*="series"]');
  if (seriesGroups.length > 0) {
    for (const g of Array.from(seriesGroups))
      candidates.push(...collectShapeCandidatesFromRoot(g, svgArea, MAX_AREA_FRACTION));
  }

  // Layer 2 (fallback): if no series groups matched or yielded nothing,
  // scan the whole SVG. The area filter still excludes the background.
  if (candidates.length === 0)
    candidates = collectShapeCandidatesFromRoot(svg, svgArea, MAX_AREA_FRACTION);

  // Walk series and stamp the next N candidates per series, in document
  // order. AnyChart renders bar/column series in data order, so document
  // order matches data index.
  let cursor = 0;
  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      // Ignore; defaults to empty string and the type check below skips it.
    }
    // Only stamp for bar/column series; leave other shapes for future work.
    if (seriesType !== 'bar' && seriesType !== 'column')
      continue;

    const rows = extractRawRows(series);
    const pointCount = rows.length;
    if (pointCount === 0)
      continue;

    // If our filter yielded the wrong count, emit one diagnostic warning
    // and degrade gracefully: only stamp the first min(pointCount,
    // remaining) so we never mis-label a non-bar shape.
    const remaining = candidates.length - cursor;
    if (remaining < pointCount) {
      console.warn(
        `[maidr/anychart] Expected ${pointCount} bar shapes for series ${s} `
        + `but only ${remaining} candidate(s) remain after filtering. `
        + 'Highlighting may be incomplete; pass an explicit `selectors` '
        + 'entry to override.',
      );
    }

    const stampCount = Math.min(pointCount, remaining);
    for (let p = 0; p < stampCount; p++) {
      const el = candidates[cursor++];
      if (!el.hasAttribute(BAR_ATTR))
        el.setAttribute(BAR_ATTR, `${stampPrefix}${s}-${p}`);
    }
  }
}

/**
 * Enable markers on every line-like series whose markers are currently
 * disabled.
 *
 * AnyChart line / area series render only the connecting path by default —
 * no per-point DOM elements exist. MAIDR's highlight layer requires one
 * element per point, so we transparently flip `series.markers().enabled(true)`
 * for these series. AnyChart re-renders the chart on the next tick.
 *
 * @returns `true` if any series had its markers enabled (i.e. the existing
 *   SVG is now stale and the caller must wait for AnyChart's next
 *   `stagerendered` event before stamping).
 */
function enableLineMarkersIfNeeded(chart: AnyChartInstance): boolean {
  // Heatmaps (and any other single-dataset chart types) do not implement
  // `getSeriesCount()` / `getSeriesAt()`. Calling those methods on a heatmap
  // throws `TypeError: getSeriesCount is not a function`. Detect via
  // `getType()` and exit early — heatmaps never need line markers anyway.
  let chartType: string | undefined;
  try {
    chartType = chart.getType?.();
  } catch {
    chartType = undefined;
  }
  // Production AnyChart builds return `'heat-map'` from getType(); dev builds
  // may return `'heatmap'` / `'heat'`. Match by substring (as
  // stampHeatmapAttributes does) so all three route correctly.
  if (chartType?.includes('heat'))
    return false;
  // A pie is the other single-dataset chart type, and its wedges are already
  // one element per slice — there is nothing to enable and no series API to
  // ask. A funnel / pyramid and a tag cloud are in the same position.
  if (chartType?.includes('pie'))
    return false;
  // A sankey is one too: its ribbons are already one element per flow, and
  // asking it for a series count throws. A gantt is the same shape again —
  // its data is a task tree rather than a series list.
  //
  // A map is deliberately *not* in this list: it does expose the series API,
  // so it falls through to the loop below, which no-ops because
  // `'choropleth'` is not in `LINE_LIKE_SERIES_TYPES`. No early return is
  // needed for it.
  if (
    isFunnelChart(chart)
    || isWordCloudChart(chart)
    || isSankeyChart(chart)
    || isGanttChart(chart)
  ) {
    return false;
  }

  const seriesCount = chart.getSeriesCount();
  let mutated = false;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      // Skip series whose type cannot be determined.
      continue;
    }
    if (!LINE_LIKE_SERIES_TYPES.has(seriesType))
      continue;

    // Some AnyChart series types do not expose `markers()` even though they
    // render as a line (very old builds). Warn the user so they can enable
    // markers manually in their chart configuration.
    if (typeof series.markers !== 'function') {
      console.warn(
        `[maidr/anychart] Series ${s} ("${seriesType}") does not expose `
        + '`markers()`. Per-point highlighting requires marker rendering; '
        + 'please enable markers manually if highlighting is needed.',
      );
      continue;
    }

    try {
      const markers = series.markers();
      const isEnabled = markers.enabled();
      if (!isEnabled) {
        markers.enabled(true);
        mutated = true;
      }
    } catch (err) {
      console.warn(
        `[maidr/anychart] Could not enable markers on series ${s}:`,
        err,
      );
    }
  }

  return mutated;
}

/**
 * Collect line-marker candidate elements from the entire chart SVG using a
 * class-free geometric filter.
 *
 * AnyChart 8.x renders its SVG with NO stable CSS classes on layer groups —
 * only `id="ac_layer_..."` / `id="ac_path_..."` and `data-ac-wrapper-id`
 * attributes, which are randomly assigned per render. Consequently we cannot
 * scope a "marker layer" query by class; instead we identify markers by
 * their distinctive geometric signature:
 *
 * - small (bbox area < 5 % of chart SVG AND each dimension ≤ 30 px),
 * - visible (computed fill / stroke not both `none`, opacity > 0),
 * - roughly square (aspect ratio < 5 — excludes ticks and short line
 *   segments which are very thin),
 * - not part of `<defs>` / `<clipPath>` (decorative or template shapes),
 * - non-zero bbox (degenerate spacer paths such as `d="M 0,0"` are
 *   eliminated by the visibility check as well as by this guard).
 *
 * Returned candidates carry the bbox-center x so callers can sort them
 * left-to-right (which matches data-point order for line charts).
 */
function collectLineMarkerCandidates(
  svg: SVGElement,
  svgArea: number,
): Array<{ el: SVGElement; x: number }> {
  // Markers are point-sized; these thresholds are deliberately generous
  // upper bounds so that custom marker symbols (square, diamond, star) all
  // survive while line strokes, plot backgrounds, axis frames, and legend
  // chips are excluded.
  const MAX_AREA_FRACTION = 0.05;
  const MAX_MARKER_DIMENSION = 30;
  const MAX_ASPECT_RATIO = 5;

  const out: Array<{ el: SVGElement; x: number }> = [];
  const shapes = svg.querySelectorAll<SVGElement>(
    'circle, ellipse, path, rect, polygon',
  );

  for (const el of Array.from(shapes)) {
    if (el.closest('defs, clipPath'))
      continue;

    let bbox: DOMRect | null = null;
    try {
      bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0)
      continue;

    if (svgArea > 0 && bbox.width * bbox.height > svgArea * MAX_AREA_FRACTION)
      continue;
    if (bbox.width > MAX_MARKER_DIMENSION || bbox.height > MAX_MARKER_DIMENSION)
      continue;

    const widthOverHeight = bbox.width / bbox.height;
    const heightOverWidth = bbox.height / bbox.width;
    if (widthOverHeight > MAX_ASPECT_RATIO || heightOverWidth > MAX_ASPECT_RATIO)
      continue;

    // Read fill / stroke / opacity from SVG presentation ATTRIBUTES rather
    // than `getComputedStyle()`. Chromium does not reliably propagate SVG
    // presentation attributes (e.g. `fill="#64b5f6"`, `stroke="#64b5f6"`)
    // into computed style — the computed `fill` / `stroke` often come back
    // as empty strings, causing this visibility filter to reject every
    // marker AnyChart renders (which uses attribute-based colours, not
    // CSS). This is the same root cause that broke boxplot highlighting in
    // Phase 9. Direct attribute access matches what AnyChart actually
    // emits.
    const fillAttr = el.getAttribute('fill') || 'none';
    const strokeAttr = el.getAttribute('stroke') || 'none';
    const opacityAttr = Number.parseFloat(el.getAttribute('opacity') || '1');
    if ((fillAttr === 'none' && strokeAttr === 'none') || opacityAttr === 0)
      continue;

    out.push({ el, x: bbox.x + bbox.width / 2 });
  }

  return out;
}

/**
 * Stamp a stable `data-maidr-anychart-line-point="<series>-<index>"`
 * attribute on every marker element rendered by an AnyChart line / area
 * series so MAIDR's highlight overlay can locate each data point.
 *
 * Why a geometric DOM walk and not a class-based query?
 *   AnyChart 8.x exposes NO CSS classes on its layer groups (only
 *   randomised `id` and `data-ac-wrapper-id` attributes) and provides no
 *   public per-point marker DOM accessor on the JS API. Geometric
 *   filtering is therefore the only stable way to identify marker shapes,
 *   matching the strategy already proven by {@link stampBarAttributes}.
 *
 * Strategy:
 *   1. For each line-like series, determine the expected `pointCount`.
 *   2. Run {@link collectLineMarkerCandidates} once over the SVG and sort
 *      candidates left-to-right (matching data-point order).
 *   3. Single-series charts: assign the first `pointCount` candidates as
 *      `0-0 … 0-(N-1)`.
 *   4. Multi-series charts: offset-partition (`candidates[s*N … s*N+N]`)
 *      and emit a one-time warning recommending an explicit `selectors`
 *      entry, because precise per-series attribution requires matching
 *      point coordinates against axis scale transforms (out of scope here).
 *
 * The stamp is idempotent — re-running on a chart that has already been
 * stamped is a no-op.
 */
function stampLineAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;

  // Collect candidates once over the whole SVG; both single- and multi-
  // series paths operate on the same sorted list below.
  const candidates = collectLineMarkerCandidates(svg, svgArea);
  candidates.sort((a, b) => a.x - b.x);

  let multiSeriesWarned = false;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (!LINE_LIKE_SERIES_TYPES.has(seriesType))
      continue;

    const rows = extractRawRows(series);
    const pointCount = rows.length;
    if (pointCount === 0)
      continue;

    let stampStart = 0;
    let stampEnd = 0;
    if (seriesCount === 1) {
      stampStart = 0;
      stampEnd = Math.min(pointCount, candidates.length);
    } else {
      if (!multiSeriesWarned) {
        console.warn(
          '[maidr/anychart] Multi-series line highlighting uses an offset-'
          + 'based partition of marker candidates and may misattribute points '
          + 'across series with overlapping geometry. For precise highlighting, '
          + 'pass an explicit `selectors` entry to bindAnyChart().',
        );
        multiSeriesWarned = true;
      }
      const offset = s * pointCount;
      stampStart = offset;
      stampEnd = Math.min(offset + pointCount, candidates.length);
    }

    if (stampEnd - stampStart < pointCount) {
      console.warn(
        `[maidr/anychart] Expected ${pointCount} line-marker shapes for `
        + `series ${s} but found ${Math.max(0, stampEnd - stampStart)}. `
        + 'Highlighting may be incomplete; ensure markers are enabled on the '
        + 'series or pass an explicit `selectors` entry to override.',
      );
    }

    for (let i = stampStart; i < stampEnd; i++) {
      const el = candidates[i].el;
      if (!el.hasAttribute(LINE_ATTR))
        el.setAttribute(LINE_ATTR, `${stampPrefix}${s}-${i - stampStart}`);
    }
  }
}

/**
 * AnyChart series types that render as point clouds (scatter / bubble /
 * marker). These map to {@link TraceType.SCATTER} and require per-point
 * highlight attributes to be stamped.
 */
const SCATTER_LIKE_SERIES_TYPES = new Set([
  'marker',
  'scatter',
  'bubble',
]);

/**
 * Stamp `data-maidr-anychart-point="<series>-<index>"` on every scatter /
 * marker / bubble point so MAIDR's highlight service can locate each data
 * point via attribute selector.
 *
 * Strategy mirrors {@link stampLineAttributes}: AnyChart does not expose
 * per-point DOM accessors, so we use {@link collectLineMarkerCandidates} to
 * geometrically filter point-sized shapes, then sort and partition by
 * series. Scatter points are visually identical to line markers (small,
 * roughly square), so the same filter applies.
 *
 * Sort order is x-center primary, y-center secondary, matching
 * `ScatterTrace.groupSvgElements`'s X→Y grouping expectation. Multi-series
 * scatter charts use the same offset-partition as line-series and emit the
 * same one-time warning recommending an explicit `selectors` entry.
 *
 * Idempotent — re-running on a chart that has already been stamped is a
 * no-op.
 */
function stampScatterAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;

  // Reuse the line-marker geometric filter; scatter points have the same
  // shape profile (small + roughly square). We attach a y-center to each
  // candidate so the sort can disambiguate points sharing an x-center.
  const rawCandidates = collectLineMarkerCandidates(svg, svgArea);
  const candidates = rawCandidates.map((c) => {
    let bbox: DOMRect | null = null;
    try {
      bbox = (c.el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    const y = bbox ? bbox.y + bbox.height / 2 : 0;
    return { el: c.el, x: c.x, y };
  });
  candidates.sort((a, b) => (a.x - b.x) || (a.y - b.y));

  // Diagnostic: surface the candidate count up-front so users / developers
  // can tell at a glance whether the geometric filter actually found
  // scatter markers. Zero or far-too-few candidates almost always means the
  // visibility filter rejected the points (see the Phase 9 / Phase 11B
  // attribute vs. computed-style issue) — not a downstream stamping bug.
  let expectedTotalPoints = 0;
  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (!SCATTER_LIKE_SERIES_TYPES.has(seriesType))
      continue;
    expectedTotalPoints += extractRawRows(series).length;
  }
  if (expectedTotalPoints > 0) {
    console.warn(
      `[maidr/anychart] scatter: collected ${candidates.length} marker `
      + `candidates, expected ${expectedTotalPoints} points across `
      + `${seriesCount} series.`,
    );
  }

  let multiSeriesWarned = false;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (!SCATTER_LIKE_SERIES_TYPES.has(seriesType))
      continue;

    const rows = extractRawRows(series);
    const pointCount = rows.length;
    if (pointCount === 0)
      continue;

    let stampStart = 0;
    let stampEnd = 0;
    if (seriesCount === 1) {
      stampStart = 0;
      stampEnd = Math.min(pointCount, candidates.length);
    } else {
      if (!multiSeriesWarned) {
        console.warn(
          '[maidr/anychart] Multi-series scatter highlighting uses an '
          + 'offset-based partition of marker candidates and may misattribute '
          + 'points across series with overlapping geometry. For precise '
          + 'highlighting, pass an explicit `selectors` entry to bindAnyChart().',
        );
        multiSeriesWarned = true;
      }
      const offset = s * pointCount;
      stampStart = offset;
      stampEnd = Math.min(offset + pointCount, candidates.length);
    }

    if (stampEnd - stampStart < pointCount) {
      console.warn(
        `[maidr/anychart] Expected ${pointCount} scatter marker shapes for `
        + `series ${s} but found ${Math.max(0, stampEnd - stampStart)}. `
        + 'Highlighting may be incomplete; pass an explicit `selectors` entry '
        + 'to override.',
      );
    }

    for (let i = stampStart; i < stampEnd; i++) {
      const c = candidates[i];
      if (c.el.hasAttribute(POINT_ATTR))
        continue;
      c.el.setAttribute(POINT_ATTR, `${stampPrefix}${s}-${i - stampStart}`);
      // Stamp the bbox-center as `cx` / `cy` so MAIDR's
      // `ScatterTrace.groupSvgElements` can extract coordinates from these
      // <path> elements directly. AnyChart scatter markers render as
      // two-arc circle paths (e.g. `d="M cx cy A 5 5 0 0 1 ..."`) with NO
      // `cx` / `cy` / `x` / `y` / `transform` attributes — without those
      // attributes, every element returns NaN coordinates and grouping
      // silently collapses to empty highlight buckets. `cx` / `cy` on
      // <path> is inert for SVG rendering (the `d` attribute alone
      // controls the shape), so this is purely additive metadata.
      c.el.setAttribute('cx', String(c.x));
      c.el.setAttribute('cy', String(c.y));
    }
  }
}

// ---------------------------------------------------------------------------
// Box attribute stamping (class-free geometric classification)
// ---------------------------------------------------------------------------

/**
 * Geometric thresholds used by {@link stampBoxAttributes} and its helpers.
 * Calibrated against AnyChart 8.x's GraphicsJS renderer; tighter values
 * risk missing valid candidates, looser values risk picking up axis lines
 * or chart-frame decorations.
 */
const BOX_MAX_AREA_FRACTION = 0.4; // exclude plot background / frame
const BOX_MIN_AREA_FRACTION = 0.001; // exclude axis ticks / 1-px decorations
// Aspect ratio threshold (longer dimension / shorter). 1.5 is permissive
// enough to admit thick-stroked medians on small/narrow boxes while still
// rejecting nearly-square shapes.
const BOX_ASPECT_THRESHOLD = 1.5;
// ± px slack when aligning whiskers / median to IQR center. 15 px tolerates
// sub-pixel rounding and slight horizontal offsets in dodged layouts;
// still tight enough to exclude axis lines, which sit at the chart edges.
const BOX_CENTER_TOLERANCE_PX = 15;

/**
 * One IQR-body candidate after the geometric filter pass.
 */
interface IqCandidate {
  el: SVGElement;
  bbox: DOMRect;
  cx: number;
  cy: number;
}

/**
 * Collect every shape that looks like the filled IQR body of a box plot:
 * a visible filled `<rect>` or `<path>` whose bbox occupies a small-to-
 * moderate fraction of the chart SVG. Sized to exclude both the plot-area
 * background (too big) and axis/tick decorations (too small).
 */
function collectIqCandidates(
  svg: SVGElement,
  svgArea: number,
): IqCandidate[] {
  const out: IqCandidate[] = [];
  const shapes = svg.querySelectorAll<SVGElement>('rect, path');
  for (const el of Array.from(shapes)) {
    if (el.closest('defs, clipPath'))
      continue;
    let bbox: DOMRect | null = null;
    try {
      bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0)
      continue;
    if (svgArea > 0) {
      const fraction = (bbox.width * bbox.height) / svgArea;
      if (fraction > BOX_MAX_AREA_FRACTION || fraction < BOX_MIN_AREA_FRACTION)
        continue;
    }
    let style: CSSStyleDeclaration | null = null;
    try {
      style = window.getComputedStyle(el);
    } catch {
      style = null;
    }
    if (style) {
      const fill = style.fill || 'none';
      const fillOpacity = Number.parseFloat(style.fillOpacity || '1');
      if (fill === 'none' || fill === 'transparent' || fillOpacity < 0.01)
        continue;
    }
    out.push({
      el,
      bbox,
      cx: bbox.x + bbox.width / 2,
      cy: bbox.y + bbox.height / 2,
    });
  }
  return out;
}

/**
 * Inspect an SVG element and report whether it could be a stroke-only line
 * segment whose bbox passes the basic geometric checks (non-defs, non-zero,
 * not already stamped, stroke visible, fill effectively absent).
 *
 * "Fill effectively absent" mirrors {@link collectIqCandidates}'s visibility
 * test: a path is treated as stroke-only when `fill === 'none'`, `fill ===
 * 'transparent'`, or `fill-opacity < 0.01`. AnyChart frequently emits
 * `fill="black" fill-opacity="0"` on its stroke-only paths, so checking
 * the resolved color alone would incorrectly reject every median /
 * whisker stroke.
 */
function strokeBBoxOf(el: SVGElement): DOMRect | null {
  if (el.closest('defs, clipPath'))
    return null;
  if (el.hasAttribute(BOX_ATTR))
    return null;

  // Use SVG presentation attributes directly. getComputedStyle() does not
  // reliably reflect attribute-based stroke/fill across browsers (Chromium
  // often returns "" / "none" for stroke="#xxx" set as an attribute). This
  // was the silent killer in earlier phases: every stroke-only median and
  // whisker path was being rejected here before any geometric check ran.
  const strokeAttr = el.getAttribute('stroke');
  if (!strokeAttr || strokeAttr === 'none')
    return null;
  const fillAttr = el.getAttribute('fill') || 'none';
  const fillOpacity = Number.parseFloat(
    el.getAttribute('fill-opacity') || '1',
  );
  const fillVisible
    = fillAttr !== 'none' && fillAttr !== 'transparent' && fillOpacity >= 0.01;
  if (fillVisible)
    return null;

  let bbox: DOMRect | null = null;
  try {
    bbox = (el as unknown as SVGGraphicsElement).getBBox?.() ?? null;
  } catch {
    bbox = null;
  }
  if (!bbox)
    return null;

  // Inflate by stroke-width. Pure-horizontal paths (e.g. medians) have
  // geometric height=0 and pure-vertical paths (e.g. whisker stems) have
  // geometric width=0; without inflation, those would be rejected by the
  // "width<=0 || height<=0" guard even though they paint a visible stroke.
  const strokeWidth = Number.parseFloat(
    el.getAttribute('stroke-width') || '1',
  );
  const pad = Math.max(strokeWidth / 2, 0.5);
  const inflatedWidth = bbox.width + pad * 2;
  const inflatedHeight = bbox.height + pad * 2;
  if (inflatedWidth <= 0 || inflatedHeight <= 0)
    return null;

  return new DOMRect(
    bbox.x - pad,
    bbox.y - pad,
    inflatedWidth,
    inflatedHeight,
  );
}

/**
 * Find the median stroke for a given IQR box: a horizontal-ish stroke-only
 * shape whose center sits inside the IQR bbox and whose x-center aligns
 * with the IQR x-center (within tolerance).
 */
function findMedianElement(
  svg: SVGElement,
  iq: IqCandidate,
): SVGElement | null {
  const shapes = svg.querySelectorAll<SVGElement>('path, line');
  for (const el of Array.from(shapes)) {
    // Skip elements already claimed by a previous box. Without this guard
    // the scan can re-return a median that was already stamped (because
    // x-center/y-band overlap between boxes is possible).
    if (el.hasAttribute(BOX_ATTR))
      continue;
    // AnyChart groups each box-plot box's primitives under the same parent
    // `<g data-ac-wrapper-id="…">`. Reject candidates that don't share a
    // parent group with the IQR — this keeps axis baselines, gridlines, and
    // neighbouring boxes' medians out of consideration even when their
    // bbox center happens to align with this box's cx.
    if (el.parentElement && iq.el.parentElement
      && el.parentElement !== iq.el.parentElement) {
      continue;
    }
    const bbox = strokeBBoxOf(el);
    if (!bbox)
      continue;
    // Reject degenerate caps and tiny decorations: a typical median is
    // (IQR-width × stroke-width) ≈ 60-100 px². 20px² is well below that
    // but excludes zero-area path siblings.
    if (bbox.width * bbox.height < 20)
      continue;
    // Horizontal aspect.
    if (bbox.width < bbox.height * BOX_ASPECT_THRESHOLD)
      continue;
    const cx = bbox.x + bbox.width / 2;
    if (Math.abs(cx - iq.cx) > BOX_CENTER_TOLERANCE_PX)
      continue;
    const cy = bbox.y + bbox.height / 2;
    if (cy < iq.bbox.y || cy > iq.bbox.y + iq.bbox.height)
      continue;
    // Spatial overlap check: median's x-range must overlap the IQR's
    // x-range. Center+tolerance alone can admit a same-y-level horizontal
    // stroke that's horizontally offset (e.g. a neighbouring box's median
    // when the boxes are dodged tightly).
    const medianLeft = bbox.x;
    const medianRight = bbox.x + bbox.width;
    const iqLeft = iq.bbox.x;
    const iqRight = iq.bbox.x + iq.bbox.width;
    if (medianRight <= iqLeft || medianLeft >= iqRight)
      continue;
    return el;
  }
  return null;
}

/**
 * Split a `<path>` whose `d` contains two `M` commands into two new
 * sibling paths, one per `M…L…` subpath. Used when AnyChart emits both
 * whiskers as a single path element. Copies stroke styling and the
 * `data-ac-wrapper-id` attribute so the clones look identical, then hides
 * the original. The new paths are returned in document order (first M,
 * then second M).
 *
 * Returns `[path]` unchanged if the path contains fewer than two `M`
 * commands or the split cannot be performed safely.
 */
function splitTwoSegmentPath(path: SVGElement): SVGElement[] {
  const d = path.getAttribute('d') ?? '';
  // AnyChart typically emits uppercase commands, but use the case-
  // insensitive flag so a lowercase `m` does not break detection.
  const moveMatches = d.match(/m/gi) ?? [];
  if (moveMatches.length < 2)
    return [path];

  // Split before each M, drop the leading empty element if present.
  const segments = d.split(/(?=m)/gi).map(s => s.trim()).filter(Boolean);
  if (segments.length < 2)
    return [path];

  const NS = 'http://www.w3.org/2000/svg';
  const parent = path.parentNode;
  if (!parent)
    return [path];

  const clones: SVGElement[] = [];
  for (const seg of segments) {
    const clone = document.createElementNS(NS, 'path') as SVGElement;
    clone.setAttribute('d', seg);
    const stroke = path.getAttribute('stroke');
    if (stroke !== null)
      clone.setAttribute('stroke', stroke);
    const strokeWidth = path.getAttribute('stroke-width');
    if (strokeWidth !== null)
      clone.setAttribute('stroke-width', strokeWidth);
    const strokeLinecap = path.getAttribute('stroke-linecap');
    if (strokeLinecap !== null)
      clone.setAttribute('stroke-linecap', strokeLinecap);
    clone.setAttribute('fill', 'none');
    const wrapperId = path.getAttribute('data-ac-wrapper-id');
    if (wrapperId !== null)
      clone.setAttribute('data-ac-wrapper-id', wrapperId);
    // Mark provenance so the split is identifiable in DevTools.
    clone.setAttribute('data-maidr-anychart-split-from', path.id || '');
    parent.insertBefore(clone, path);
    clones.push(clone);
  }

  // Hide the original (rather than removing it) to avoid any AnyChart
  // bookkeeping that might rely on the node still being present.
  path.setAttribute('visibility', 'hidden');
  return clones;
}

/**
 * Resolve the whisker DOM for a given IQR box and return the two split
 * segments labeled by orientation relative to the box center.
 *
 * AnyChart frequently renders both whiskers as one `<path>` whose `d`
 * attribute contains two `M…L…` subpaths (lower + upper). We detect and
 * split such paths via {@link splitTwoSegmentPath}; if the path already
 * contains a single subpath we use it directly.
 *
 * Returns `[]` if no candidate stroke aligns with the IQR x-center.
 */
function findWhiskerElements(
  svg: SVGElement,
  iq: IqCandidate,
): Array<{ el: SVGElement; isUpper: boolean }> {
  const out: Array<{ el: SVGElement; isUpper: boolean }> = [];
  const shapes = svg.querySelectorAll<SVGElement>('path, line');

  for (const el of Array.from(shapes)) {
    // Skip elements already stamped by a previous box (IQR bodies, prior
    // whisker/median scans, or split clones). Without this guard, a box's
    // whisker scan can match siblings owned by an earlier box and prevent
    // legitimate per-box matches.
    if (el.hasAttribute(BOX_ATTR))
      continue;

    const bbox = strokeBBoxOf(el);
    if (!bbox)
      continue;
    // X-center must align with IQR center; this is the strongest filter
    // because whiskers are vertical and pass through the box center.
    const cx = bbox.x + bbox.width / 2;
    if (Math.abs(cx - iq.cx) > BOX_CENTER_TOLERANCE_PX)
      continue;
    // AnyChart groups each box-plot box's primitives under the same parent
    // `<g data-ac-wrapper-id="…">`. Reject candidates that don't share a
    // parent group with the IQR — this keeps axis baselines and grid lines
    // from leaking through when their bbox center happens to align with a
    // box's cx (most likely the centermost box).
    if (el.parentElement && iq.el.parentElement
      && el.parentElement !== iq.el.parentElement) {
      continue;
    }
    // Reject degenerate caps: AnyChart emits zero-length path siblings like
    // `d="M x y L x y M x y L x y"` for whisker caps. Their bbox height is
    // effectively zero (only stroke-width). Real whisker stems are tens of
    // pixels tall, so a 2px minimum is generous.
    if (bbox.height < 2)
      continue;
    // Either a single vertical stroke or a two-segment path covering both.
    // For a path, attempt to split before applying the aspect filter so a
    // single-element pair becomes two individually classifiable segments.
    if (el.tagName.toLowerCase() === 'path') {
      const splits = splitTwoSegmentPath(el);
      if (splits.length >= 2) {
        for (const seg of splits) {
          let segBox: DOMRect | null = null;
          try {
            segBox = (seg as unknown as SVGGraphicsElement).getBBox?.() ?? null;
          } catch {
            segBox = null;
          }
          if (!segBox || segBox.width < 0 || segBox.height <= 0)
            continue;
          // Per-segment cap filter (defensive: combined-bbox check above
          // should already cover this, but split-clone bboxes can differ).
          if (segBox.height < 2)
            continue;
          // Each segment should be vertical-ish on its own.
          if (segBox.height < Math.max(segBox.width, 1) * BOX_ASPECT_THRESHOLD)
            continue;
          const segCy = segBox.y + segBox.height / 2;
          out.push({ el: seg, isUpper: segCy < iq.cy });
        }
        // Once we've successfully consumed a multi-segment path for THIS
        // box (verified by the x-center filter above), stop scanning so we
        // don't pick up another box's whisker that happens to align.
        if (out.length >= 2)
          return out;
        continue;
      }
    }

    // Single-segment path or <line>: require vertical aspect.
    if (bbox.height < Math.max(bbox.width, 1) * BOX_ASPECT_THRESHOLD)
      continue;
    const cy = bbox.y + bbox.height / 2;
    out.push({ el, isUpper: cy < iq.cy });
    if (out.length >= 2)
      return out;
  }

  return out;
}

/**
 * Stamp `data-maidr-anychart-box="<series>-<box>"` and
 * `data-maidr-anychart-box-part="iq|q2|min|max"` attributes onto every
 * IQR / median / whisker element of every box-plot series in the chart.
 *
 * Why a geometric DOM walk and not a class-based query?
 *   AnyChart 8.x uses NO CSS classes — only randomised `id` and
 *   `data-ac-wrapper-id` attributes. There is also no public per-point
 *   DOM accessor on the JS API. Geometric filtering is therefore the
 *   only stable way to identify the IQR body, median stroke, and whisker
 *   segments, matching the strategy already proven by
 *   {@link stampBarAttributes} and {@link stampLineAttributes}.
 *
 * Strategy:
 *   1. For each `box` series, collect all visible filled rect/path shapes
 *      whose bbox sits between {@link BOX_MIN_AREA_FRACTION} and
 *      {@link BOX_MAX_AREA_FRACTION} of the SVG area. Sort left-to-right
 *      to match the iterator's data order.
 *   2. For each box `b` (`0…points.length-1`):
 *      a. Stamp the IQR element with `BOX_ATTR="s-b"` + `BOX_PART_ATTR="iq"`.
 *         Q1 and Q3 are NOT stamped — MAIDR derives them from the IQ
 *         element's top/bottom edges via `Svg.createLineElement`.
 *      b. Find the median stroke (horizontal stroke-only shape whose
 *         center sits inside the IQ bbox) and stamp `"q2"`.
 *      c. Find the whisker pair. If AnyChart renders them as one path
 *         containing two `M…L…` subpaths, split in place into two
 *         sibling paths via {@link splitTwoSegmentPath}. Classify each
 *         as `"max"` (above IQR center) or `"min"` (below).
 *
 * All stamps are idempotent: re-running on an already-stamped chart is a
 * no-op. Outlier sections are NOT handled because AnyChart's iterator API
 * does not expose outlier arrays.
 */
function stampBoxAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;

  const svgRect = svg.getBoundingClientRect();
  const svgArea = svgRect.width * svgRect.height;

  // Collect IQR candidates once; partition per-series below.
  const allIqCandidates = collectIqCandidates(svg, svgArea);
  allIqCandidates.sort((a, b) => a.cx - b.cx);

  let multiSeriesWarned = false;
  let consumedIqIndex = 0;

  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    let seriesType = '';
    try {
      seriesType = series.seriesType();
    } catch {
      continue;
    }
    if (seriesType !== 'box')
      continue;

    const rows = extractRawRows(series);
    const boxCount = rows.length;
    if (boxCount === 0)
      continue;

    if (seriesCount > 1 && !multiSeriesWarned) {
      console.warn(
        '[maidr/anychart] Multi-series box highlighting uses an offset-'
        + 'based partition of IQR candidates and may misattribute boxes '
        + 'across series with overlapping geometry. For precise highlighting, '
        + 'pass an explicit `selectors` entry to bindAnyChart().',
      );
      multiSeriesWarned = true;
    }

    const start = consumedIqIndex;
    const end = Math.min(start + boxCount, allIqCandidates.length);
    consumedIqIndex = end;

    if (end - start < boxCount) {
      console.warn(
        `[maidr/anychart] Expected ${boxCount} IQR shapes for box series `
        + `${s} but found ${Math.max(0, end - start)}. Highlighting may be `
        + 'incomplete; pass an explicit `selectors` entry to override.',
      );
    }

    for (let b = 0; b < end - start; b++) {
      const iq = allIqCandidates[start + b];
      if (!iq.el.hasAttribute(BOX_ATTR)) {
        iq.el.setAttribute(BOX_ATTR, `${stampPrefix}${s}-${b}`);
        iq.el.setAttribute(BOX_PART_ATTR, 'iq');
      }

      const median = findMedianElement(svg, iq);
      if (median && !median.hasAttribute(BOX_ATTR)) {
        median.setAttribute(BOX_ATTR, `${stampPrefix}${s}-${b}`);
        median.setAttribute(BOX_PART_ATTR, 'q2');
      } else if (!median) {
        // DIAGNOSTIC (temporary, removed once box highlighting is verified):
        // surface the IQR bbox so we can see whether the median scan missed
        // a real element or AnyChart genuinely didn't emit one for this box
        // (can happen when median color matches IQR fill).
        console.warn(
          `[maidr/anychart] Box ${s}-${b}: no median found. IQR bbox:`,
          iq.bbox,
        );
      }

      const whiskers = findWhiskerElements(svg, iq);
      if (whiskers.length !== 2) {
        // DIAGNOSTIC (temporary): expected exactly two whisker segments
        // (min stem + max stem). Other counts indicate a scan miss.
        console.warn(
          `[maidr/anychart] Box ${s}-${b}: expected 2 whiskers, found `
          + `${whiskers.length}. IQR cx=${iq.cx.toFixed(1)}, `
          + `cy=${iq.cy.toFixed(1)}`,
        );
      }
      for (const { el, isUpper } of whiskers) {
        if (el.hasAttribute(BOX_ATTR))
          continue;
        el.setAttribute(BOX_ATTR, `${stampPrefix}${s}-${b}`);
        el.setAttribute(BOX_PART_ATTR, isUpper ? 'max' : 'min');
      }
    }

    // DIAGNOSTIC: one-line summary per series so we can verify which
    // per-part stamps succeeded without browser DevTools. Remove once
    // box highlighting is confirmed working end-to-end.
    const stampedIq = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="iq"]`,
    ).length;
    const stampedQ2 = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="q2"]`,
    ).length;
    const stampedMin = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="min"]`,
    ).length;
    const stampedMax = svg.querySelectorAll(
      `[${BOX_ATTR}^="${stampPrefix}${s}-"][${BOX_PART_ATTR}="max"]`,
    ).length;
    // Using console.warn (not console.log) so the diagnostic surfaces under
    // the repo's no-console ESLint rule. This whole block is temporary.
    console.warn(
      `[maidr/anychart] stampBoxAttributes series ${s}: ${boxCount} boxes, `
      + `stamped ${stampedIq} iq / ${stampedQ2} q2 / `
      + `${stampedMin} min / ${stampedMax} max`,
    );

    // Per-box detail: report any box missing one or more parts so we can
    // pinpoint failures from a single console line. Temporary diagnostic.
    for (let b = 0; b < boxCount; b++) {
      const base = `[${BOX_ATTR}="${stampPrefix}${s}-${b}"]`;
      const missing: string[] = [];
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="iq"]`))
        missing.push('iq');
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="q2"]`))
        missing.push('q2');
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="min"]`))
        missing.push('min');
      if (!svg.querySelector(`${base}[${BOX_PART_ATTR}="max"]`))
        missing.push('max');
      if (missing.length > 0) {
        console.warn(
          `[maidr/anychart]   Box ${s}-${b} missing: ${missing.join(', ')}`,
        );
      }
    }
  }
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number')
    return v;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function asString(v: unknown, fallback = ''): string {
  return v != null ? String(v) : fallback;
}

// ---------------------------------------------------------------------------
// Heatmap attribute stamping
// ---------------------------------------------------------------------------

/**
 * Locate the SVG `<g>` layer containing heatmap cells using AnyChart's
 * stable auto-id conventions.
 *
 * AnyChart's GraphicsJS renderer assigns deterministic IDs to every
 * element: shape elements get `id="ac_rect_<chartId>_<n>"` (regardless of
 * whether they render as `<rect>` or `<path>`), and each visual layer is
 * wrapped in `<g id="ac_layer_<chartId>_<n>">`. Heatmap cells all share a
 * single cell layer, while plot backgrounds, axes, legends, and the
 * AnyChart watermark live in separate layers.
 *
 * We scan every `ac_layer_*` group and pick the one with the most direct
 * descendants matching `ac_rect_*`. This sidesteps bbox-based heuristics
 * (which broke when cell sizes varied sub-pixel) and eliminates leakage
 * from non-cell elements like the plot-area background.
 *
 * Returns the parent SVG itself if no AnyChart layer structure is found,
 * so the caller falls back to whole-SVG querying.
 */
function findHeatmapCellLayer(svg: SVGElement): Element {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    // AnyChart applies `clip-path` to series-data layers; chart-level
    // furniture (axes, grid, background) is unclipped. Restricting to
    // clipped layers is harmless for heatmaps (the `ac_rect_*` prefix is
    // already specific) and keeps the layer-selection rule consistent with
    // candlestick / future trace types.
    if (!layer.hasAttribute('clip-path'))
      continue;
    const cells = layer.querySelectorAll(
      'path[id^="ac_rect_"], rect[id^="ac_rect_"]',
    );
    if (cells.length > bestCount) {
      bestCount = cells.length;
      bestLayer = layer;
    }
  }
  return bestLayer ?? svg;
}

/**
 * Stamp `data-maidr-anychart-heatmap-cell="<row>-<col>"` on every heatmap
 * cell's SVG element.
 *
 * Cells are identified via AnyChart's stable auto-id conventions:
 * `ac_layer_*` groups scoped to the layer with the most `ac_rect_*` shapes
 * (see {@link findHeatmapCellLayer}). DOM order within the layer is
 * row-major (top→bottom, then left→right), matching the
 * `HeatmapData { x, y, points }` layout produced by
 * {@link buildHeatmapLayerFromChart}.
 *
 * Only runs for charts whose `getType()` returns a string containing
 * `'heat'`; on other chart types this is a no-op.
 */
function stampHeatmapAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  let chartType: string | undefined;
  try {
    chartType = chart.getType?.();
  } catch {
    chartType = undefined;
  }
  // AnyChart's heatmap `getType()` returns `"heat-map"` in production builds
  // (with a hyphen), while older / minified builds have been observed
  // returning `"heatmap"` or `"heat"`. Use a substring match so the adapter
  // tolerates all current and future variants without an explicit allowlist.
  // No other AnyChart chart type name contains "heat", so false positives
  // are not a concern.
  if (!chartType || !chartType.includes('heat')) {
    return;
  }

  const dataView = resolveChartDataView(chart);
  if (!dataView)
    return;
  let iterator: AnyChartIterator | null = null;
  try {
    iterator = dataView.getIterator();
  } catch {
    iterator = null;
  }
  if (!iterator)
    return;

  // Count cells + collect distinct x/y labels in insertion order so we know
  // the expected grid dimensions and can map flat DOM order to (row,col).
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();
  let cellCount = 0;
  iterator.reset();
  while (iterator.advance()) {
    cellCount++;
    const x = asString(iterator.get('x'));
    const y = asString(iterator.get('y') ?? iterator.get('name'));
    if (!xSet.has(x)) {
      xLabels.push(x);
      xSet.add(x);
    }
    if (!ySet.has(y)) {
      yLabels.push(y);
      ySet.add(y);
    }
  }
  if (cellCount === 0)
    return;

  const cols = xLabels.length;
  const rows = yLabels.length;

  // Locate the heatmap cell layer via AnyChart's stable id conventions,
  // then collect shape elements directly from that layer. This is the
  // AnyChart-native equivalent of asking "give me only the cells",
  // sidestepping bbox heuristics (which broke when cell sizes varied
  // sub-pixel) and eliminating cross-layer leakage from plot backgrounds,
  // axes, legend swatches, and the AnyChart watermark.
  const cellLayer = findHeatmapCellLayer(svg);
  const shapes = cellLayer.querySelectorAll<SVGElement>(
    'path[id^="ac_rect_"], rect[id^="ac_rect_"]',
  );

  const cellCandidates: SVGElement[] = [];
  for (const el of Array.from(shapes)) {
    // Idempotency — skip cells stamped on a prior bind.
    if (el.hasAttribute(HEATMAP_ATTR))
      continue;
    // Exclude AnyChart's hover/selection indicator overlay. When a cell is
    // hovered, AnyChart renders an extra <path> with `fill="#333"` and
    // `fill-opacity="0.85"` on top of the data cell. Data cells never set
    // `fill-opacity`, so a value below 1 unambiguously identifies the
    // overlay.
    const fillOpacityAttr = el.getAttribute('fill-opacity');
    if (fillOpacityAttr !== null && Number.parseFloat(fillOpacityAttr) < 1)
      continue;
    // Defensive: skip explicitly transparent fills.
    const fillAttr = el.getAttribute('fill');
    if (fillAttr === 'none' || fillAttr === 'transparent')
      continue;
    cellCandidates.push(el);
  }

  // Layer + id-prefix scoping should yield exactly rows*cols cells. Any
  // mismatch indicates either an unexpected AnyChart DOM layout (perhaps a
  // future version that changes the auto-id convention) or a chart that
  // hasn't fully rendered yet. We continue best-effort by stamping as many
  // cells as we have candidates for.
  const stampCount = Math.min(cellCandidates.length, rows * cols);
  for (let i = 0; i < stampCount; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const el = cellCandidates[i];
    if (!el.hasAttribute(HEATMAP_ATTR))
      el.setAttribute(HEATMAP_ATTR, `${stampPrefix}${r}-${c}`);
  }
}

// ---------------------------------------------------------------------------
// Candlestick attribute stamping
// ---------------------------------------------------------------------------

/**
 * Locate the SVG `<g>` layer containing candlestick paths using AnyChart's
 * stable auto-id conventions.
 *
 * AnyChart renders each candlestick (wick + body combined) as a single
 * `<path id="ac_path_<chartId>_<n>">` inside a layer wrapped in
 * `<g id="ac_layer_<chartId>_<n>">`. Other chart types (line, area) also
 * use `ac_path_*`, but they live in different layers, so picking the
 * layer with the most `ac_path_*` descendants reliably isolates the
 * candlestick layer for single-series candlestick charts and the
 * candlestick portion of mixed charts.
 *
 * Returns the parent SVG itself when the SVG has no AnyChart layer structure
 * at all, so the caller falls back to whole-SVG querying. When layers *are*
 * present but none of them is clipped, this returns `null` instead: the candles
 * are then not where this function knows how to look, and widening the search
 * to the whole SVG would stamp whatever `ac_path_*` elements it met first — a
 * legend marker, a decorative frame — as the leading candles. Reporting nothing
 * found costs the highlight; guessing would label decoration as data.
 */
function findCandlestickPathLayer(svg: SVGElement): Element | null {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    // AnyChart applies `clip-path` to series-data layers so rendering is
    // bounded to the plot area. Chart-level layers (axes, grid, background)
    // are unclipped because they draw outside the plot area too (axis
    // labels, ticks, title space). Using clip-path presence avoids picking
    // the axes/background layer, whose `ac_path_*` children (background
    // rect + tick + gridline paths) can outnumber the actual candles.
    if (!layer.hasAttribute('clip-path'))
      continue;
    const paths = layer.querySelectorAll('path[id^="ac_path_"]');
    if (paths.length > bestCount) {
      bestCount = paths.length;
      bestLayer = layer;
    }
  }
  if (bestLayer)
    return bestLayer;
  return layers.length > 0 ? null : svg;
}

/**
 * Stamp `data-maidr-anychart-candlestick-cell="<seriesIndex>-<pointIndex>"`
 * on every AnyChart candlestick `<path>` element.
 *
 * Only runs if at least one series has `seriesType() === 'candlestick'`.
 * Candle paths are identified via AnyChart's stable `id^="ac_path_"`
 * convention within the layer returned by
 * {@link findCandlestickPathLayer}. DOM order within the layer matches
 * the data iterator order (chronological left-to-right), so we stamp
 * sequentially.
 *
 * For multi-series candlestick charts, paths are partitioned by series
 * offset (series 0 takes the first N₀ paths, series 1 the next N₁, etc.).
 * If a multi-series chart highlights incorrectly, the consumer can
 * override per-series selectors via the `selectors` option.
 *
 * On non-candlestick charts this is a no-op.
 */
function stampCandlestickAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const seriesCount = chart.getSeriesCount?.() ?? 0;
  if (seriesCount === 0)
    return;

  const candlestickSeriesIndices: number[] = [];
  for (let s = 0; s < seriesCount; s++) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    try {
      if (series.seriesType() === 'candlestick')
        candlestickSeriesIndices.push(s);
    } catch {
      // ignore series that don't expose seriesType()
    }
  }
  if (candlestickSeriesIndices.length === 0)
    return;

  const candleLayer = findCandlestickPathLayer(svg);
  if (!candleLayer) {
    console.warn(
      '[maidr/anychart] Found no candlestick paths to highlight: this chart\'s '
      + 'SVG has AnyChart layers but none of them is clipped to the plot area. '
      + 'Highlighting is disabled for this chart; pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }
  const paths = candleLayer.querySelectorAll<SVGElement>(
    'path[id^="ac_path_"]',
  );

  const pathCandidates: SVGElement[] = [];
  for (const path of Array.from(paths)) {
    // Idempotency — skip paths stamped on a prior bind.
    if (path.hasAttribute(CANDLESTICK_ATTR))
      continue;
    // Defensive — skip paths with no visible stroke or fill.
    const fill = path.getAttribute('fill');
    const stroke = path.getAttribute('stroke');
    const fillBlank = fill === null || fill === 'none' || fill === 'transparent';
    const strokeBlank = stroke === null || stroke === 'none' || stroke === 'transparent';
    if (fillBlank && strokeBlank)
      continue;
    // Skip hover/selection overlays (AnyChart renders semi-transparent
    // indicator paths inside the series layer; same pattern as heatmap).
    const fillOpacityAttr = path.getAttribute('fill-opacity');
    if (fillOpacityAttr !== null && Number.parseFloat(fillOpacityAttr) < 1)
      continue;
    // Skip degenerate sentinel paths (e.g., clip-path boundary "M 0,0").
    // Real candle paths always combine wick + body, so the `d` attribute
    // contains multiple drawing commands. Single-command paths are not
    // candles.
    const d = path.getAttribute('d');
    if (!d)
      continue;
    const commandCount = (d.match(/[MLHVCSQTAZ]/gi) ?? []).length;
    if (commandCount <= 1)
      continue;
    pathCandidates.push(path);
  }

  // Partition the path candidates by series offset. Assumes AnyChart
  // renders candlestick series in series-index order within the layer
  // (verified for single-series charts; multi-series may require
  // disambiguation if reported).
  let cursor = 0;
  for (const s of candlestickSeriesIndices) {
    const series = chart.getSeriesAt(s);
    if (!series)
      continue;
    const rows = extractRawRows(series);
    for (let i = 0; i < rows.length && cursor < pathCandidates.length; i++, cursor++) {
      pathCandidates[cursor].setAttribute(CANDLESTICK_ATTR, `${stampPrefix}${s}-${i}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pie attribute stamping
// ---------------------------------------------------------------------------

/**
 * Whether a chart is a pie.
 *
 * `getType()` reports `'pie'` for both a pie and a doughnut (AnyChart draws
 * the latter by giving an ordinary pie an inner radius), and no other chart
 * type name contains the substring — so the same tolerant match the heatmap
 * path uses is safe here too.
 */
function isPieChart(chart: AnyChartInstance): boolean {
  try {
    return chart.getType?.().includes('pie') ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether a chart is a funnel or a pyramid.
 *
 * AnyChart draws both from one class — `anychart.funnel()` and
 * `anychart.pyramid()` differ only in which way the stages taper — and
 * `getType()` reports the constructor's own name back. Both are read as a
 * funnel: the stages are ordered and each one is a share of the one before it,
 * whichever end the wide one is at.
 */
function isFunnelChart(chart: AnyChartInstance): boolean {
  try {
    const type = chart.getType?.() ?? '';
    return type.includes('funnel') || type.includes('pyramid');
  } catch {
    return false;
  }
}

/**
 * Whether a chart is a tag cloud.
 *
 * `anychart.tagCloud()` reports `'tag-cloud'`, and no other AnyChart chart
 * type name contains the substring, so the same tolerant match the heatmap and
 * pie paths use is safe here too.
 */
function isWordCloudChart(chart: AnyChartInstance): boolean {
  try {
    return chart.getType?.().includes('tag-cloud') ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether a chart is a sankey diagram.
 *
 * `anychart.sankey()` reports `'sankey'`, and no other AnyChart chart type name
 * contains the substring, so the same tolerant match the heatmap, pie and tag
 * cloud paths use is safe here too.
 */
function isSankeyChart(chart: AnyChartInstance): boolean {
  try {
    return chart.getType?.().includes('sankey') ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether a chart draws a map.
 *
 * Asked only by the paths that need a CHART-level answer — which stampers to
 * run, and whether the line stamper should keep away. The reading itself is
 * decided by the SERIES, whose `'choropleth'` type names itself: a chart whose
 * `getType()` is unavailable (an undrawn chart, a build without it) still has
 * its series, and a map recognised only by its chart type would be dropped
 * exactly when {@link readChartType} answers `''`.
 *
 * `'heat-map'` contains `'map'`, so the chart-type half is an exact match
 * rather than the tolerant one the pie and heatmap paths use.
 */
function isMapChart(chart: AnyChartInstance): boolean {
  if (readChartType(chart) === 'map')
    return true;
  return collectSeriesOfType(chart, CHOROPLETH_SERIES_TYPES).length > 0;
}

/**
 * Whether a chart is a gantt.
 *
 * `anychart.ganttProject()` and `anychart.ganttResource()` are two distinct
 * constructors reporting their own names back, and neither shares anything
 * with the rest of the adapter: a gantt has no series API at all, and its
 * `data()` hands back a task tree rather than a data view. The type name is
 * therefore corroborated structurally by {@link readTaskTree} before anything
 * is read — a chart naming itself a gantt with no tree behind it is bound as
 * nothing rather than as an empty schedule.
 *
 * `anychart.timeline()` is deliberately NOT matched. It is a third
 * constructor with a series API and its own `range` / `moment` series, whose
 * moments are instants rather than intervals; reading one here would announce
 * a schedule whose every zero-length row the chart drew as a point.
 */
function isGanttChart(chart: AnyChartInstance): boolean {
  return GANTT_CHART_TYPES.has(readChartType(chart));
}

/**
 * Whether a chart is a marimekko.
 *
 * `anychart.mekko()`, `anychart.mosaic()` and `anychart.barmekko()` report
 * their own constructor's name back, and all three draw the same thing: a
 * stacked column per category whose WIDTH is that category's share of the whole
 * table. Only the paddings and the default scale differ.
 */
function isMosaicChart(chart: AnyChartInstance): boolean {
  const type = readChartType(chart);
  return type.includes('mekko') || type.includes('mosaic');
}

/**
 * Whether a chart arranges its categories around a circle.
 *
 * This is the one question the series API cannot answer. A radar's and a
 * polar's series report `seriesType()` as plain `'line'`, `'area'`, `'marker'`
 * or `'column'` — exactly what a Cartesian chart's do — so {@link mapSeriesType}
 * reads a radar as a line chart and says so out loud. Only `getType()` knows
 * the spokes are there.
 */
function isRadialChart(chart: AnyChartInstance): boolean {
  const type = readChartType(chart);
  return type === 'radar' || type === 'polar';
}

/**
 * How one series of a radial chart is read.
 *
 * A radar joins its values into a closed outline and a polar area draws each
 * as a wedge, which is the whole difference between the two trace types —
 * `RadarTrace` serves both and reads the identical points. The mark is what
 * decides: a polar chart's `column` (and `area`) series are drawn as wedges
 * out from the centre, while its lines and markers trace the same outline a
 * radar does. A radar chart has no wedges at all.
 *
 * @param chart - The chart the series belongs to
 * @param seriesType - The series' own AnyChart type
 * @returns The trace type to read it as, or `null` when the series is one this
 * adapter cannot read (a polar `rangeColumn`, say, whose rows carry no `value`)
 */
function resolveRadialType(
  chart: AnyChartInstance,
  seriesType: string,
): TraceType.RADAR | TraceType.POLAR_AREA | null {
  if (!RADIAL_SERIES_TYPES.has(seriesType))
    return null;
  if (readChartType(chart) === 'polar' && WEDGE_SERIES_TYPES.has(seriesType))
    return TraceType.POLAR_AREA;
  return TraceType.RADAR;
}

/**
 * Read a single-dataset chart's rows from its chart-level data view.
 *
 * A pie, a funnel and a tag cloud are all single-dataset charts: like the
 * heatmap they expose no `getSeriesCount()` / `getSeriesAt()`, and their rows
 * live on `chart.data()`. Which field carries the label differs — a pie and a
 * tag cloud map `x`, a funnel maps `name` — and {@link readRows} collects
 * both, so one reader serves all three.
 */
function readChartRows(chart: AnyChartInstance): Array<Record<string, unknown>> {
  const dataView = resolveChartDataView(chart);
  if (!dataView)
    return [];
  try {
    return readRows(dataView.getIterator());
  } catch {
    return [];
  }
}

/**
 * Whether a data row is one AnyChart actually draws a mark for.
 *
 * A row with no numeric value has no angle, no height and no font size, so no
 * wedge, segment or word is rendered for it. Every single-dataset builder
 * drops such a row and its stamper counts rows through the same predicate —
 * counting the raw rows there instead would make the expected mark count
 * disagree with the emitted point count the moment a chart carries a null,
 * turning a correct chart into a warning and an unexpectedly drawn empty mark
 * into a silent off-by-one.
 */
function isDrawnDatum(row: Record<string, unknown>): boolean {
  return Number.isFinite(Number(row.value ?? row.y));
}

/**
 * Whether a path's `d` attribute contains an elliptical-arc command.
 *
 * A wedge is the only thing an AnyChart pie draws with an arc: the label
 * connector lines, the legend swatches and the chart frame are all straight
 * `M`/`L` paths. (A single 100 % slice is drawn as a full circle, which
 * `acgraph` also emits as two arcs, so it is matched as well.) Numbers in a
 * path can carry an `e` exponent but never an `a`, so a bare letter test is
 * unambiguous.
 */
function hasArcCommand(path: SVGElement): boolean {
  const d = path.getAttribute('d');
  return d !== null && /a/i.test(d);
}

/**
 * Locate the SVG `<g>` layer holding the arc-drawn marks — a pie's wedges, or
 * the circular markers and sectors of a radar / polar chart.
 *
 * Same idea as {@link findCandlestickPathLayer} — pick the `ac_layer_*` group
 * with the most matching shapes — but without its `clip-path` requirement:
 * AnyChart clips series data to the plot area of a Cartesian chart, and a pie
 * has no plot area to clip to, so requiring the attribute would reject the
 * wedge layer outright. Combining the layer scoping with the arc test below
 * keeps circular legend markers (which live in their own, smaller layer) out.
 *
 * Returns the parent SVG itself when the SVG has no AnyChart layer structure
 * at all, so the caller falls back to whole-SVG querying. When layers *are*
 * present but none of them holds an arc-drawn path, this returns `null`
 * instead: the wedges are then not where this function knows how to look, and
 * widening the search to the whole SVG would stamp whatever arc-shaped path it
 * met first — a legend marker, a rounded frame — onto slice index 0. Reporting
 * nothing found costs the highlight; guessing would point it at the wrong
 * shape.
 */
function findArcMarkLayer(svg: SVGElement): Element | null {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    const wedges = Array.from(
      layer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
    ).filter(hasArcCommand);
    if (wedges.length > bestCount) {
      bestCount = wedges.length;
      bestLayer = layer;
    }
  }
  if (bestLayer)
    return bestLayer;
  return layers.length > 0 ? null : svg;
}

/**
 * Stamp `data-maidr-anychart-pie-slice="0-<sliceIndex>"` on every wedge of an
 * AnyChart pie (or doughnut) chart.
 *
 * A pie is a single-dataset chart — it has no series API — so the series part
 * of the stamp is always `0`, keeping the selector shape uniform across trace
 * families. DOM order within the wedge layer is the order AnyChart consumed
 * the data in, which is the order {@link buildPieLayer} emits its slices in,
 * so wedge k is slice k.
 *
 * That mapping only holds while the wedge candidates and the emitted slices
 * are the same set, so any disagreement between the two counts is reported:
 * it means one of the DOM assumptions above no longer describes what AnyChart
 * drew, and every stamp from that point on may name the wrong slice.
 *
 * On any other chart type this is a no-op.
 */
/**
 * Stamps the highlight attributes this chart's own kind needs.
 *
 * Every stamper used to be tried on every chart, each in its own `try`. That
 * is harmless for an XY chart — a bar stamper finds no line series and
 * returns — but a pie carries no series API at all: `getSeriesCount` is not a
 * function on one, so the bar and line stampers each threw and warned before
 * the pie stamper did the real work. Two console warnings on every correctly
 * rendered pie, which is noise in exactly the place someone debugging a
 * genuine stamping failure would look.
 *
 * Asking what the chart is costs one call and makes the warnings mean
 * something again: past this point, a warning is a stamper failing at a job
 * that was actually its own.
 *
 * @param chart - The AnyChart instance being bound
 * @param svg - The rendered SVG to stamp
 * @param stampPrefix - Panel token prefix, empty for a single chart
 */
/**
 * The stampers that belong to one chart, named for the warning they may emit.
 *
 * Every single-dataset chart type gets exactly one — it draws one family of
 * marks and has no series API for the XY stampers to ask about. Everything
 * else is a Cartesian chart, which may carry several series families at once
 * and therefore runs the whole XY set.
 *
 * @param chart - The AnyChart instance being bound
 * @returns The stampers to run, each with the name used when it fails
 */
function resolveStampers(
  chart: AnyChartInstance,
): [string, typeof stampPieAttributes][] {
  if (isPieChart(chart))
    return [['pie', stampPieAttributes]];
  if (isFunnelChart(chart))
    return [['funnel', stampFunnelAttributes]];
  if (isWordCloudChart(chart))
    return [['word cloud', stampWordCloudAttributes]];
  if (isSankeyChart(chart))
    return [['sankey', stampSankeyAttributes]];
  // A map does have a series API, and its regions are a mark family no XY
  // stamper writes — so a map running the XY set would be stamped by nothing
  // at all. Running the region stamper ALONE is the second half of that: a
  // map carrying a `marker` or `bubble` overlay would otherwise have the
  // scatter stamper loose on it, and its geometric filter cannot tell an
  // overlaid point from the small islands and legend swatches a map is full
  // of. The overlay loses its highlight, which is what the pie and radar
  // branches above already choose over a placed guess.
  if (isMapChart(chart))
    return [['choropleth', stampChoroplethAttributes]];
  // A gantt has no series API at all, and its bars are the one mark family
  // here that no cartesian stamper draws.
  if (isGanttChart(chart))
    return [['gantt', stampGanttAttributes]];
  // A radial chart does have a series API, but none of the XY stampers may run
  // on one: its series report themselves as lines and markers, and the line
  // stamper pairs those with marks by their left-to-right order — which on a
  // circle is not data order. See {@link stampRadarAttributes}.
  if (isRadialChart(chart))
    return [['radar', stampRadarAttributes]];
  return [
    ['bar', stampBarAttributes],
    ['line', stampLineAttributes],
    ['scatter', stampScatterAttributes],
    ['box', stampBoxAttributes],
    ['heatmap', stampHeatmapAttributes],
    ['candlestick', stampCandlestickAttributes],
    ['waterfall', stampWaterfallAttributes],
    ['marimekko', stampMosaicAttributes],
    ['dumbbell', stampDumbbellAttributes],
  ];
}

function stampChartAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  for (const [kind, stamp] of resolveStampers(chart)) {
    try {
      stamp(chart, svg, stampPrefix);
    } catch (err) {
      console.warn(`[maidr/anychart] Failed to stamp ${kind} attributes:`, err);
    }
  }
}

function stampPieAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isPieChart(chart))
    return;

  const sliceCount = readChartRows(chart).filter(isDrawnDatum).length;
  if (sliceCount === 0)
    return;

  const wedgeLayer = findArcMarkLayer(svg);
  if (!wedgeLayer) {
    console.warn(
      '[maidr/anychart] Found no pie wedges to highlight: this chart\'s SVG '
      + 'has AnyChart layers but none of them holds an arc-drawn path. '
      + 'Highlighting is disabled for this chart; pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }

  const candidates: SVGElement[] = [];
  for (const path of Array.from(
    wedgeLayer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
  )) {
    // Idempotency — skip wedges stamped on a prior bind.
    if (path.hasAttribute(PIE_ATTR))
      continue;
    if (path.closest('defs, clipPath'))
      continue;
    if (!hasArcCommand(path))
      continue;
    // Skip AnyChart's hover / selection indicator, which it draws as an extra
    // semi-transparent wedge on top of the data wedge. Data wedges never set
    // `fill-opacity`, so any value below 1 is the overlay.
    const fillOpacityAttr = path.getAttribute('fill-opacity');
    if (fillOpacityAttr !== null && Number.parseFloat(fillOpacityAttr) < 1)
      continue;
    // Skip the wedge outlines. AnyChart draws every slice twice — once filled
    // in the slice's colour, once with `fill="none"` for the stroke — so a
    // four-slice pie offers eight arc paths. Both halves sit in the same
    // layer and both carry an arc command, and only the fill is the datum.
    //
    // Taking the first N in DOM order happens to pick the fills, because
    // AnyChart emits them first. That is an ordering accident, not a
    // guarantee: were it ever to emit outlines first, every highlight would
    // land on an invisible path while the announcement carried on naming the
    // right slice — the silent mislabel this whole lookup exists to avoid.
    if (path.getAttribute('fill') === 'none')
      continue;
    candidates.push(path);
  }

  if (candidates.length !== sliceCount) {
    console.warn(
      `[maidr/anychart] Expected ${sliceCount} pie wedges but found `
      + `${candidates.length} after filtering. Highlighting may be incomplete `
      + 'or land on the wrong slice; pass an explicit `selectors` entry to '
      + 'override.',
    );
  }

  const stampCount = Math.min(sliceCount, candidates.length);
  for (let i = 0; i < stampCount; i++) {
    candidates[i].setAttribute(PIE_ATTR, `${stampPrefix}0-${i}`);
  }
}

// ---------------------------------------------------------------------------
// Funnel attribute stamping
// ---------------------------------------------------------------------------

/**
 * Whether a path is a filled data mark rather than one of the shapes AnyChart
 * draws over or around one.
 *
 * Two decoys share a data mark's layer and its `ac_path_` id: the stroke-only
 * twin AnyChart draws for every mark (`fill="none"`), and the hover / selection
 * indicator it lays on top of the mark under the pointer, which is the same
 * shape at a reduced `fill-opacity`. A data mark sets neither.
 */
function isFilledDataPath(path: SVGElement): boolean {
  if (path.closest('defs, clipPath'))
    return false;
  const fill = path.getAttribute('fill');
  if (fill === null || fill === 'none' || fill === 'transparent')
    return false;
  const fillOpacity = path.getAttribute('fill-opacity');
  return fillOpacity === null || Number.parseFloat(fillOpacity) >= 1;
}

/**
 * Locate the SVG `<g>` layer holding the straight-sided filled marks — a
 * funnel's (or pyramid's) segments, or a waterfall's bars.
 *
 * Same shape as {@link findArcMarkLayer}: pick the `ac_layer_*` group holding
 * the most data-looking paths, with no `clip-path` requirement because a
 * funnel has no plot area to clip to. What it cannot borrow is the arc test —
 * a funnel segment is a straight-sided trapezoid, indistinguishable at the
 * `d`-attribute level from the square icon in a legend item, and a funnel's
 * legend is on by default.
 *
 * Density is what separates them instead. AnyChart gives each legend ITEM its
 * own layer holding that item's one icon, so a legend contributes as many
 * one-path layers as there are stages and never a layer of N — the same
 * property the pie lookup notes when it says legend markers "live in their
 * own, smaller layer".
 *
 * Returns the parent SVG itself when the SVG has no AnyChart layer structure
 * at all, so the caller falls back to whole-SVG querying. When layers *are*
 * present but none of them holds a filled path, this returns `null` instead:
 * the segments are then not where this function knows how to look, and
 * widening the search would stamp whatever filled path it met first — a legend
 * icon, a background panel — onto stage index 0.
 */
function findFilledMarkLayer(svg: SVGElement): Element | null {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    const segments = Array.from(
      layer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
    ).filter(isFilledDataPath);
    if (segments.length > bestCount) {
      bestCount = segments.length;
      bestLayer = layer;
    }
  }
  if (bestLayer)
    return bestLayer;
  return layers.length > 0 ? null : svg;
}

/**
 * Stamp `data-maidr-anychart-funnel-stage="0-<stageIndex>"` on every segment of
 * an AnyChart funnel or pyramid chart.
 *
 * A funnel is a single-dataset chart — it has no series API — so the series
 * part of the stamp is always `0`, keeping the selector shape uniform across
 * trace families. DOM order within the segment layer is the order AnyChart
 * consumed the data in, which is the order {@link buildFunnelLayer} emits its
 * stages in, so segment k is stage k.
 *
 * That mapping only holds while the segment candidates and the emitted stages
 * are the same set, so any disagreement between the two counts is reported: it
 * means one of the DOM assumptions above no longer describes what AnyChart
 * drew, and every stamp from that point on may name the wrong stage.
 *
 * On any other chart type this is a no-op.
 */
function stampFunnelAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isFunnelChart(chart))
    return;

  const stageCount = readChartRows(chart).filter(isDrawnDatum).length;
  if (stageCount === 0)
    return;

  const segmentLayer = findFilledMarkLayer(svg);
  if (!segmentLayer) {
    console.warn(
      '[maidr/anychart] Found no funnel segments to highlight: this chart\'s '
      + 'SVG has AnyChart layers but none of them holds a filled path. '
      + 'Highlighting is disabled for this chart; pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }

  const candidates = Array.from(
    segmentLayer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
  ).filter(path =>
    // Idempotency — skip segments stamped on a prior bind.
    !path.hasAttribute(FUNNEL_ATTR) && isFilledDataPath(path));

  if (candidates.length !== stageCount) {
    console.warn(
      `[maidr/anychart] Expected ${stageCount} funnel segments but found `
      + `${candidates.length} after filtering. Highlighting may be incomplete `
      + 'or land on the wrong stage; pass an explicit `selectors` entry to '
      + 'override.',
    );
  }

  const stampCount = Math.min(stageCount, candidates.length);
  for (let i = 0; i < stampCount; i++) {
    candidates[i].setAttribute(FUNNEL_ATTR, `${stampPrefix}0-${i}`);
  }
}

// ---------------------------------------------------------------------------
// Word cloud attribute stamping
// ---------------------------------------------------------------------------

/**
 * Stamp `data-maidr-anychart-word="0-<termIndex>"` on every term of an
 * AnyChart tag cloud, where the index is the term's position in the chart's
 * DATA.
 *
 * Every other stamper in this file pairs a datum with a shape by counting DOM
 * order, because AnyChart draws its marks in the order it consumed the rows. A
 * cloud is the one family where that is false by construction: the layout
 * spirals words outwards from the heaviest, so the packing order the SVG is
 * written in has no relation to the data order — and a cloud whose terms were
 * paired by position would announce one word while highlighting another.
 *
 * A word carries its own identity instead. Each term is rendered as a single
 * `<text>` element holding exactly that term, so the pairing is a text match
 * and needs no ordering assumption at all. A term that does not match exactly
 * one element is a term this function cannot place, and since
 * `WordCloudTrace` drops the highlight for a partial resolution anyway,
 * nothing is stamped in that case — a half-stamped cloud would cost the same
 * highlight while looking, in the DOM, like it had worked.
 *
 * On any other chart type this is a no-op.
 */
function stampWordCloudAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isWordCloudChart(chart))
    return;

  const terms = readChartRows(chart)
    .filter(isDrawnDatum)
    .map(row => asString(row.x ?? row.name ?? row._index));
  if (terms.length === 0)
    return;

  // Index the rendered glyphs by their text so each term is looked up rather
  // than counted off. `<text>` elements outside the cloud — a colour range's
  // tick labels, the chart title — simply never match a term.
  const byText = new Map<string, SVGElement[]>();
  for (const text of Array.from(svg.querySelectorAll<SVGElement>('text'))) {
    if (text.hasAttribute(WORD_CLOUD_ATTR))
      continue;
    const label = (text.textContent ?? '').trim();
    const drawn = byText.get(label);
    if (drawn)
      drawn.push(text);
    else
      byText.set(label, [text]);
  }

  const glyphs: SVGElement[] = [];
  for (const term of terms) {
    const matches = byText.get(term) ?? [];
    if (matches.length !== 1) {
      console.warn(
        `[maidr/anychart] Expected exactly one rendered word for the term `
        + `"${term}" but found ${matches.length}. Highlighting is disabled for `
        + 'this chart; pass an explicit `selectors` entry to override.',
      );
      return;
    }
    glyphs.push(matches[0]);
  }

  glyphs.forEach((glyph, i) => {
    glyph.setAttribute(WORD_CLOUD_ATTR, `${stampPrefix}0-${i}`);
  });
}

// ---------------------------------------------------------------------------
// Sankey attribute stamping
// ---------------------------------------------------------------------------

/**
 * Whether a data row is one AnyChart draws a ribbon for.
 *
 * The chart applies exactly this filter before it builds its graph: a flow
 * needs both of its ends named and a positive weight, and anything else is
 * dropped without a mark. Applying the same test here is what keeps the emitted
 * flows and the drawn ribbons the same set — the stamper pairs them by
 * position, so a row that one side keeps and the other drops would slide every
 * later ribbon's highlight onto its neighbour.
 *
 * A row with a null `to` is AnyChart's "dropoff": the chart draws it as a
 * ribbon leaving the node and going nowhere. It is not a flow — it names no
 * target — so it is dropped, and the count check in
 * {@link stampSankeyAttributes} turns the resulting disagreement into a warning
 * rather than a mispaired highlight.
 */
function isDrawnFlow(row: Record<string, unknown>): boolean {
  const from = asString(row.from);
  const to = asString(row.to);
  const weight = Number(row.weight);
  return from.length > 0 && to.length > 0 && Number.isFinite(weight) && weight > 0;
}

/**
 * Whether a path is drawn with a curve command.
 *
 * A sankey ribbon is the only thing the chart draws with one: the nodes are
 * axis-aligned rectangles and every label connector is a straight `M`/`L` path.
 * This is the funnel's density lookup needing a shape test the way the pie's
 * needed {@link hasArcCommand}, and for the same reason — a ribbon's own layer
 * also holds the node rectangles, which are neither data the reader navigates
 * nor distinguishable by id.
 *
 * Numbers inside a path can carry an `e` exponent but never a curve letter, so
 * a bare letter test is unambiguous.
 */
function isCurvedPath(path: SVGElement): boolean {
  if (path.closest('defs, clipPath'))
    return false;
  const d = path.getAttribute('d');
  return d !== null && /[csqt]/i.test(d);
}

/**
 * Locate the SVG `<g>` layer holding a sankey's ribbons.
 *
 * Same density lookup as {@link findFilledMarkLayer}, with the curve test in
 * place of the funnel's fill test: a ribbon is drawn at `fill-opacity` 0.3 by
 * AnyChart's own theme, so the "filled data path" filter every other mark
 * family uses would reject every ribbon on the chart.
 *
 * Returns the parent SVG itself when the SVG has no AnyChart layer structure at
 * all, so the caller falls back to whole-SVG querying, and `null` when layers
 * are present but none of them holds a curved path — the ribbons are then not
 * where this function knows how to look, and widening the search would stamp
 * whatever curve it met first onto flow index 0.
 */
function findSankeyRibbonLayer(svg: SVGElement): Element | null {
  const layers = svg.querySelectorAll<SVGGElement>('g[id^="ac_layer_"]');
  let bestLayer: Element | null = null;
  let bestCount = 0;
  for (const layer of Array.from(layers)) {
    const ribbons = Array.from(
      layer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
    ).filter(isCurvedPath);
    if (ribbons.length > bestCount) {
      bestCount = ribbons.length;
      bestLayer = layer;
    }
  }
  if (bestLayer)
    return bestLayer;
  return layers.length > 0 ? null : svg;
}

/**
 * Stamp `data-maidr-anychart-flow="0-<flowIndex>"` on every ribbon of an
 * AnyChart sankey diagram.
 *
 * A sankey is a single-dataset chart — it has no series API — so the series
 * part of the stamp is always `0`. DOM order within the ribbon layer is the
 * order AnyChart consumed the rows in (it keys its flows by row index and walks
 * them in ascending order), which is the order {@link buildSankeyLayer} emits
 * them in, so ribbon k is flow k.
 *
 * Nothing is stamped unless the two counts agree exactly. `FlowTrace` resolves
 * one element per DECLARED flow and drops the highlight for the whole chart
 * unless every one of them resolves, so a partial stamp buys no highlight and
 * costs a DOM that looks as though it had worked. A disagreement means a shape
 * this function does not know about shares the layer — a dropoff ribbon, most
 * likely — and every stamp past it would name the wrong flow.
 *
 * On any other chart type this is a no-op.
 */
function stampSankeyAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isSankeyChart(chart))
    return;

  const flowCount = readChartRows(chart).filter(isDrawnFlow).length;
  if (flowCount === 0)
    return;

  const ribbonLayer = findSankeyRibbonLayer(svg);
  if (!ribbonLayer) {
    console.warn(
      '[maidr/anychart] Found no sankey ribbons to highlight: this chart\'s '
      + 'SVG has AnyChart layers but none of them holds a curved path. '
      + 'Highlighting is disabled for this chart; pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }

  const candidates = Array.from(
    ribbonLayer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
  ).filter(path =>
    // Idempotency — skip ribbons stamped on a prior bind.
    !path.hasAttribute(SANKEY_ATTR) && isCurvedPath(path));

  if (candidates.length !== flowCount) {
    console.warn(
      `[maidr/anychart] Expected ${flowCount} sankey ribbons but found `
      + `${candidates.length} after filtering. Highlighting is disabled for `
      + 'this chart; pass an explicit `selectors` entry to override.',
    );
    return;
  }

  candidates.forEach((ribbon, i) => {
    ribbon.setAttribute(SANKEY_ATTR, `${stampPrefix}0-${i}`);
  });
}

// ---------------------------------------------------------------------------
// Waterfall attribute stamping
// ---------------------------------------------------------------------------

/**
 * Stamp `data-maidr-anychart-waterfall-step="0-<stepIndex>"` on every bar of an
 * AnyChart waterfall chart.
 *
 * A waterfall reads as ONE sequence of steps however many series drew it — see
 * {@link buildWaterfallLayer} — so the series part of the stamp is always `0`
 * and the step index is the category's position along the x axis. DOM order
 * within the bar layer is the order AnyChart consumed the rows in, so bar k is
 * step k.
 *
 * Nothing is stamped unless the two counts agree exactly. `WaterfallTrace`
 * requires one element per step and drops the highlight otherwise, so a partial
 * stamp buys nothing; and a multi-series waterfall draws one bar per series per
 * category, which is exactly the disagreement this reports — the steps are
 * still announced correctly, they simply have no single bar to point at.
 *
 * On a chart with no waterfall series this is a no-op.
 */
function stampWaterfallAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const entries = collectWaterfallSeries(chart);
  if (entries.length === 0)
    return;

  const stepCount = aggregateWaterfallRows(entries).length;
  if (stepCount === 0)
    return;

  // The funnel's lookup, unchanged: a waterfall bar is a straight-sided filled
  // path too, and what separates it from the chart furniture is that the
  // furniture is not filled — grid lines and the connector strokes a waterfall
  // draws between its steps all carry `fill="none"`.
  const barLayer = findFilledMarkLayer(svg);
  if (!barLayer) {
    console.warn(
      '[maidr/anychart] Found no waterfall bars to highlight: this chart\'s '
      + 'SVG has AnyChart layers but none of them holds a filled path. '
      + 'Highlighting is disabled for this chart; pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }

  const candidates = Array.from(
    barLayer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
  ).filter(path =>
    // Idempotency — skip bars stamped on a prior bind.
    !path.hasAttribute(WATERFALL_ATTR) && isFilledDataPath(path));

  if (candidates.length !== stepCount) {
    console.warn(
      `[maidr/anychart] Expected ${stepCount} waterfall bars but found `
      + `${candidates.length} after filtering. Highlighting is disabled for `
      + 'this chart; pass an explicit `selectors` entry to override.',
    );
    return;
  }

  candidates.forEach((bar, i) => {
    bar.setAttribute(WATERFALL_ATTR, `${stampPrefix}0-${i}`);
  });
}

// ---------------------------------------------------------------------------
// Mosaic attribute stamping
// ---------------------------------------------------------------------------

/**
 * Every filled data path in the SVG, in document order.
 *
 * The single-layer lookups cannot serve a marimekko: its tiles are spread over
 * one layer per series, and the reading needs all of them at once. What makes
 * the wider search safe here is the exact-count check in
 * {@link stampMosaicAttributes} — a marimekko draws no legend by default, its
 * grid lines and axis strokes are unfilled, and its plot background is a
 * `<rect>` rather than an `ac_path_`, so any extra filled path this collects is
 * a shape the count will notice.
 */
function collectFilledDataPaths(svg: SVGElement): SVGElement[] {
  // Scoped to the layers when there are any, and to the whole SVG when the
  // rendering has no AnyChart layer structure at all — the same fallback every
  // single-layer lookup here ends with.
  const scoped = svg.querySelectorAll<SVGElement>(
    'g[id^="ac_layer_"] path[id^="ac_path_"]',
  );
  const paths = scoped.length > 0
    ? scoped
    : svg.querySelectorAll<SVGElement>('path[id^="ac_path_"]');
  return Array.from(paths).filter(isFilledDataPath);
}

/**
 * Stamp `data-maidr-anychart-tile="<seriesIndex>-<categoryIndex>"` on every
 * tile of an AnyChart marimekko.
 *
 * `SegmentedTrace` — which `MosaicTrace` extends — resolves ONE selector and
 * pairs the matched elements with the table by document order, so the values
 * stamped here are for reading in a debugger; what has to be right is which
 * elements carry the attribute and in what order they sit. Series-major is the
 * order AnyChart renders in, each series drawing its categories left to right
 * into a layer of its own, and it is the same assumption
 * {@link stampBarAttributes} makes for a multi-series bar chart.
 *
 * A cell with no positive value is skipped, because AnyChart draws no tile for
 * one — it is the same accommodation `SegmentedTrace` makes when it finds fewer
 * elements than cells, and pairing them the same way here keeps the two in
 * step.
 *
 * On any other chart type this is a no-op.
 */
function stampMosaicAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isMosaicChart(chart))
    return;

  const entries = collectMosaicSeries(chart);
  if (entries.length === 0)
    return;

  const table = readMosaicTable(entries);
  const drawn: Array<{ series: number; category: number }> = [];
  table.values.forEach((row, s) => {
    row.forEach((value, c) => {
      if (Number.isFinite(value) && value > 0)
        drawn.push({ series: s, category: c });
    });
  });
  if (drawn.length === 0)
    return;

  const candidates = collectFilledDataPaths(svg).filter(
    // Idempotency — skip tiles stamped on a prior bind.
    path => !path.hasAttribute(MOSAIC_ATTR),
  );

  if (candidates.length !== drawn.length) {
    console.warn(
      `[maidr/anychart] Expected ${drawn.length} marimekko tiles but found `
      + `${candidates.length} after filtering. Highlighting is disabled for `
      + 'this chart; pass an explicit `selectors` entry to override.',
    );
    return;
  }

  candidates.forEach((tile, i) => {
    const { series, category } = drawn[i];
    tile.setAttribute(MOSAIC_ATTR, `${stampPrefix}${series}-${category}`);
  });
}

// ---------------------------------------------------------------------------
// Radar / polar attribute stamping
// ---------------------------------------------------------------------------

/**
 * Stamp `data-maidr-anychart-spoke="0-<spokeIndex>"` on every mark of a radar
 * or polar chart.
 *
 * The line stamper cannot do this job, and that is the whole reason this one
 * exists: it sorts its candidates left to right, because on a Cartesian chart
 * that is data order. On a circle it is not — spoke 0 sits at 12 o'clock, in
 * the MIDDLE of the x range — so the line stamper would pair every spoke with
 * somebody else's mark while the announcement carried on naming the right one.
 *
 * The marks are found by shape instead of by position. AnyChart draws the first
 * series' markers as circles (its marker palette starts there) and a polar
 * column as a sector, and both are the only arc-drawn paths on the chart: the
 * radar's web is a polygon, its spokes are straight, and its grid rings carry
 * `fill="none"`. Within the layer that holds them, DOM order is data order, so
 * mark k is spoke k.
 *
 * Only a single-series chart is stamped. A second series draws its markers as
 * diamonds (the palette's next entry) in a layer of its own, so there is no
 * shape test that finds both and no ordering that spans them — and a highlight
 * that silently covered one series while the reader navigated the other is the
 * failure this whole lookup exists to avoid.
 *
 * On any other chart type this is a no-op.
 */
function stampRadarAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isRadialChart(chart))
    return;

  const seriesCount = chart.getSeriesCount();
  if (seriesCount === 0)
    return;
  if (seriesCount > 1) {
    console.warn(
      '[maidr/anychart] Highlighting is disabled for this radar / polar chart: '
      + `it draws ${seriesCount} series, whose marks AnyChart renders with a `
      + 'different symbol each and in layers of their own. Pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }

  const series = chart.getSeriesAt(0);
  if (!series)
    return;
  const spokeCount = extractRawRows(series).length;
  if (spokeCount === 0)
    return;

  // The pie's lookup, unchanged: the layer holding the most arc-drawn paths.
  // A radar's arcs are its markers and a polar area's are its wedges, and
  // either way the legend's one-icon layers cannot outnumber them.
  const markLayer = findArcMarkLayer(svg);
  if (!markLayer) {
    console.warn(
      '[maidr/anychart] Found no radar marks to highlight: this chart\'s SVG '
      + 'has AnyChart layers but none of them holds an arc-drawn path. '
      + 'Highlighting is disabled for this chart; enable markers on the series '
      + 'or pass an explicit `selectors` entry to override.',
    );
    return;
  }

  const candidates = Array.from(
    markLayer.querySelectorAll<SVGElement>('path[id^="ac_path_"]'),
  ).filter(path =>
    // Idempotency — skip marks stamped on a prior bind.
    !path.hasAttribute(RADAR_ATTR) && hasArcCommand(path) && isFilledDataPath(path));

  if (candidates.length !== spokeCount) {
    console.warn(
      `[maidr/anychart] Expected ${spokeCount} radar marks but found `
      + `${candidates.length} after filtering. Highlighting is disabled for `
      + 'this chart; pass an explicit `selectors` entry to override.',
    );
    return;
  }

  candidates.forEach((mark, i) => {
    mark.setAttribute(RADAR_ATTR, `${stampPrefix}0-${i}`);
  });
}

// ---------------------------------------------------------------------------
// Dumbbell attribute stamping
// ---------------------------------------------------------------------------

/**
 * The chart's series of one AnyChart type, with their chart-wide indices.
 *
 * The same walk {@link collectWaterfallSeries} and {@link collectMosaicSeries}
 * make, over a set of type names rather than one — a diverging chart is drawn
 * from `bar` OR `column` series, and a chart may carry several range series.
 *
 * @param chart - The chart to inspect
 * @param types - The AnyChart series types to keep
 * @returns The matching series, in chart order
 */
function collectSeriesOfType(
  chart: AnyChartInstance,
  types: ReadonlySet<string>,
): Array<{ series: AnyChartSeries; index: number }> {
  const entries: Array<{ series: AnyChartSeries; index: number }> = [];
  let seriesCount = 0;
  try {
    seriesCount = chart.getSeriesCount();
  } catch {
    return entries;
  }

  for (let i = 0; i < seriesCount; i++) {
    const series = chart.getSeriesAt(i);
    if (!series)
      continue;
    try {
      if (types.has(series.seriesType()))
        entries.push({ series, index: i });
    } catch {
      // A series that cannot name its type is not one this reads.
    }
  }
  return entries;
}

/**
 * Whether a data row is one AnyChart draws a floating bar for.
 *
 * A row missing either end has no bar to draw, so it is dropped — and the
 * stamper counts rows through this same predicate for the reason
 * {@link isDrawnDatum} explains: counting raw rows instead would turn a chart
 * carrying one null into a warning and lose the highlight for all of it.
 */
function isDrawnPair(row: Record<string, unknown>): boolean {
  return Number.isFinite(Number(row.low)) && Number.isFinite(Number(row.high));
}

/**
 * Stamp `data-maidr-anychart-pair="<seriesIndex>-<pairIndex>"` on every
 * floating bar of an AnyChart range-column / range-bar series.
 *
 * AnyChart draws each pair as ONE filled path spanning its two ends, which is
 * also how `DumbbellTrace` resolves them: it asks for one element per row and
 * highlights the same one from both ends, because that is what the chart drew.
 *
 * The marimekko's lookup rather than the funnel's: a chart may carry several
 * range series, each rendering into a layer of its own, so the reading needs
 * every filled path at once and pairs them with the rows series-major — the
 * order AnyChart renders in, and the same assumption {@link stampBarAttributes}
 * makes for a multi-series bar chart.
 *
 * Nothing is stamped unless the counts agree exactly. `DumbbellTrace` drops the
 * highlight for the whole layer on any shortfall, so a partial stamp buys
 * nothing and leaves a DOM that looks like it worked — and the disagreement is
 * exactly what a chart mixing a range series with other filled marks produces,
 * where the extra paths this collects belong to another series entirely.
 *
 * On a chart with no range series this is a no-op.
 */
function stampDumbbellAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const entries = collectSeriesOfType(chart, RANGE_SERIES_TYPES);
  if (entries.length === 0)
    return;

  const drawn: Array<{ series: number; pair: number }> = [];
  entries.forEach(({ series, index }) => {
    extractRawRows(series)
      .filter(isDrawnPair)
      .forEach((_, pair) => drawn.push({ series: index, pair }));
  });
  if (drawn.length === 0)
    return;

  const candidates = collectFilledDataPaths(svg).filter(
    // Idempotency — skip bars stamped on a prior bind.
    path => !path.hasAttribute(DUMBBELL_ATTR),
  );

  if (candidates.length !== drawn.length) {
    console.warn(
      `[maidr/anychart] Expected ${drawn.length} range bars but found `
      + `${candidates.length} after filtering. Highlighting is disabled for `
      + 'this chart; pass an explicit `selectors` entry to override.',
    );
    return;
  }

  candidates.forEach((bar, i) => {
    const { series, pair } = drawn[i];
    bar.setAttribute(DUMBBELL_ATTR, `${stampPrefix}${series}-${pair}`);
  });
}

// ---------------------------------------------------------------------------
// Choropleth region naming and attribute stamping
// ---------------------------------------------------------------------------

/** Whether a value is a plain object whose properties can be read by name. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The geo features of whatever geodata a map was bound to.
 *
 * AnyChart accepts both of the formats its own map files ship in, and they
 * nest their features differently: GeoJSON puts them in a flat `features`
 * array, TopoJSON in one `geometries` array per entry of `objects`. Both carry
 * the same per-feature `properties`, which is the only thing read here.
 *
 * @param geoData - Whatever `chart.geoData()` answered with
 * @returns Its features, or nothing when the shape is neither
 */
function collectGeoFeatures(geoData: unknown): Array<Record<string, unknown>> {
  if (!isRecord(geoData))
    return [];

  if (Array.isArray(geoData.features))
    return geoData.features.filter(isRecord);

  const features: Array<Record<string, unknown>> = [];
  if (isRecord(geoData.objects)) {
    for (const object of Object.values(geoData.objects)) {
      if (isRecord(object) && Array.isArray(object.geometries))
        features.push(...object.geometries.filter(isRecord));
    }
  }
  return features;
}

/**
 * What each region of a map's geodata is called, keyed by the id its rows are
 * matched on.
 *
 * A choropleth's rows carry an id and a value and nothing else — `'US.CA'`,
 * `42` — because the name belongs to the geodata rather than to the data. A
 * map read without this announces every region by a code, which is a reading
 * a listener cannot follow.
 *
 * @param chart - The map to read
 * @returns Region names by feature id, empty when the geodata says none
 */
function readRegionNames(chart: AnyChartInstance): Map<string, string> {
  const names = new Map<string, string>();

  let geoData: unknown;
  try {
    geoData = chart.geoData?.();
  } catch {
    return names;
  }

  // Which property the rows' `id` is matched against. AnyChart defaults to
  // `'id'` and a chart that renames it renames it for the lookup here too.
  let idField = 'id';
  try {
    idField = chart.geoIdField?.() || 'id';
  } catch {
    idField = 'id';
  }

  for (const feature of collectGeoFeatures(geoData)) {
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const id = properties[idField] ?? feature.id ?? properties.id;
    const name = properties.name;
    if (id !== undefined && typeof name === 'string' && name.length > 0)
      names.set(String(id), name);
  }
  return names;
}

/**
 * The name the bound geo feature gives one region, when the build exposes it.
 *
 * The direct route, and the one that needs no id matching: a map series' point
 * hands back the properties of the feature it was drawn onto. Older builds do
 * not offer it, and the caller then falls back to the geodata lookup.
 *
 * @param series - The choropleth series
 * @param index - The row's own index within the series
 * @returns The feature's name, or `undefined`
 */
function readFeatureName(
  series: AnyChartSeries,
  index: number,
): string | undefined {
  try {
    const properties = series.getPoint(index)?.getFeatureProp?.();
    const name = isRecord(properties) ? properties.name : undefined;
    return typeof name === 'string' && name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What one region of a choropleth is announced as.
 *
 * In falling order of how much the chart itself says: the bound feature's own
 * name, the same name looked up in the geodata by id, whatever the row called
 * itself, and finally the bare id. The last is a poor name but a true one —
 * every alternative would be a region the map does not contain.
 *
 * @param series - The choropleth series the row belongs to
 * @param row - The row
 * @param names - Region names by feature id, from {@link readRegionNames}
 * @returns The region's name
 */
function regionNameOf(
  series: AnyChartSeries,
  row: Record<string, unknown>,
  names: Map<string, string>,
): string {
  const fromFeature = readFeatureName(series, asNumber(row._index, -1));
  if (fromFeature)
    return fromFeature;

  const id = row.id === undefined ? undefined : String(row.id);
  const fromGeoData = id === undefined ? undefined : names.get(id);
  if (fromGeoData)
    return fromGeoData;

  const own = asString(row.name ?? row.x);
  if (own.length > 0)
    return own;

  return id ?? asString(row._index);
}

/** A rectangle in the coordinates the stage draws its shapes in. */
interface RegionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How far apart two measurements of one drawn shape may be and still be the
 * same shape: a region's own box against the bounds AnyChart reports for its
 * feature, or one gantt bar's left edge against another's.
 *
 * A region's two readings are the same rectangle read twice — the chart
 * computed the bounds and then drew the path from them — so the tolerance
 * covers rounding rather than disagreement, and staying tight is what keeps
 * two adjacent regions from both answering to one set of bounds.
 */
const DRAWN_BOX_TOLERANCE_PX = 1.5;

/**
 * The bounds AnyChart reports for the feature one row was matched to.
 *
 * @param series - The choropleth series
 * @param index - The row's own index within the series
 * @returns The feature's drawn box, or `undefined` when the build has none
 */
function readFeatureBox(
  series: AnyChartSeries,
  index: number,
): RegionBox | undefined {
  let bounds: unknown;
  try {
    bounds = series.getPoint(index)?.getFeatureBounds?.();
  } catch {
    return undefined;
  }
  if (!isRecord(bounds))
    return undefined;

  const box = {
    left: Number(bounds.left),
    top: Number(bounds.top),
    width: Number(bounds.width),
    height: Number(bounds.height),
  };
  const finite = Object.values(box).every(Number.isFinite);
  return finite && box.width > 0 && box.height > 0 ? box : undefined;
}

/** The box a rendered shape occupies, when it can be measured. */
function readDrawnBox(element: SVGElement): RegionBox | undefined {
  let bbox: DOMRect | null = null;
  try {
    bbox = (element as unknown as SVGGraphicsElement).getBBox?.() ?? null;
  } catch {
    bbox = null;
  }
  if (!bbox || bbox.width <= 0 || bbox.height <= 0)
    return undefined;
  return { left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height };
}

/** Whether two boxes are the same rectangle read twice. */
function boxesMatch(a: RegionBox, b: RegionBox): boolean {
  return Math.abs(a.left - b.left) <= DRAWN_BOX_TOLERANCE_PX
    && Math.abs(a.top - b.top) <= DRAWN_BOX_TOLERANCE_PX
    && Math.abs(a.width - b.width) <= DRAWN_BOX_TOLERANCE_PX
    && Math.abs(a.height - b.height) <= DRAWN_BOX_TOLERANCE_PX;
}

/**
 * Stamp `data-maidr-anychart-region="<seriesIndex>-<regionIndex>"` on the path
 * a map drew for each region the data names.
 *
 * Every other stamper in this file pairs a datum with a shape by counting DOM
 * order, and a map is the family where that cannot work: AnyChart paints every
 * feature of the bound geodata — all fifty states for a table naming three —
 * in the geodata's order rather than the data's, and the paths carry no id. A
 * count would put California's highlight on Alabama's shape.
 *
 * Each region is therefore *located* instead. AnyChart reports the drawn
 * bounds of the feature a row was matched to, and the path it drew from them
 * has exactly that box, so a region is the shape whose own box is the one the
 * chart said it would be. A region matching no shape, or more than one, is a
 * region this cannot place: nothing is stamped for the whole chart then, for
 * the reason {@link stampWordCloudAttributes} gives — a half-stamped map costs
 * the same highlight while looking, in the DOM, like it worked.
 *
 * On a chart with no choropleth series this is a no-op.
 */
function stampChoroplethAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  const entries = collectSeriesOfType(chart, CHOROPLETH_SERIES_TYPES);
  if (entries.length === 0)
    return;

  const regions: Array<{ series: number; region: number; box: RegionBox }> = [];
  for (const { series, index } of entries) {
    const rows = extractRawRows(series).filter(isDrawnDatum);
    for (const [region, row] of rows.entries()) {
      const box = readFeatureBox(series, asNumber(row._index, -1));
      if (!box) {
        console.warn(
          '[maidr/anychart] Highlighting is disabled for this map: AnyChart '
          + `reports no drawn bounds for the region at index ${region} of `
          + `series ${index}, and the regions of a map cannot be paired with `
          + 'its paths by position. Pass an explicit `selectors` entry to '
          + 'override.',
        );
        return;
      }
      regions.push({ series: index, region, box });
    }
  }
  if (regions.length === 0)
    return;

  const candidates = collectFilledDataPaths(svg).filter(
    // Idempotency — skip regions stamped on a prior bind.
    path => !path.hasAttribute(CHOROPLETH_ATTR),
  );

  const matched: SVGElement[] = [];
  const taken = new Set<SVGElement>();
  for (const { box } of regions) {
    const hits = candidates.filter((path) => {
      const drawn = readDrawnBox(path);
      return drawn !== undefined && boxesMatch(drawn, box);
    });
    if (hits.length !== 1 || taken.has(hits[0])) {
      console.warn(
        `[maidr/anychart] Expected exactly one drawn shape at the bounds `
        + `AnyChart reports for a region but found ${hits.length}. `
        + 'Highlighting is disabled for this map; pass an explicit '
        + '`selectors` entry to override.',
      );
      return;
    }
    taken.add(hits[0]);
    matched.push(hits[0]);
  }

  matched.forEach((path, i) => {
    const { series, region } = regions[i];
    path.setAttribute(CHOROPLETH_ATTR, `${stampPrefix}${series}-${region}`);
  });
}

// ---------------------------------------------------------------------------
// Gantt task tree, axis scale and attribute stamping
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * The widest span a schedule may cover and still be read in hours. Two days —
 * past that an hour is too fine to compare tasks by, and below it a day is too
 * coarse to distinguish them at all.
 */
const GANTT_HOURLY_MAX_SPAN = 2 * MS_PER_DAY;

/** One interval of a schedule, before the axis unit has been decided. */
interface GanttSpan {
  /** When it begins, in milliseconds since the epoch. */
  start: number;
  /** When it ends. Equal to {@link GanttSpan.start} for a milestone. */
  end: number;
  /** What the interval is called, when the lane does not already name it. */
  label?: string;
}

/** One row of a schedule: a task or a resource, and the work booked on it. */
interface GanttLane {
  name: string;
  spans: GanttSpan[];
}

/** How a schedule's milliseconds are turned into the axis a reader hears. */
interface GanttScale {
  /** Milliseconds per axis unit. */
  perUnit: number;
  /** What one unit is called. */
  unit: string;
}

/**
 * The task tree behind a gantt chart.
 *
 * The structural half of the detection: `chart.data()` answers with an
 * `anychart.data.Tree` on a gantt and with a flat data view on every other
 * chart-level type, and the two share no method. A chart naming itself a gantt
 * with no tree behind it has not been given its data, and binding it would
 * announce a schedule with no work in it.
 *
 * @param chart - The chart to ask
 * @returns Its task tree, or `null` when it has none
 */
function readTaskTree(chart: AnyChartInstance): AnyChartTree | null {
  let data: AnyChartDataView | AnyChartTree | undefined;
  try {
    data = chart.data?.();
  } catch {
    return null;
  }
  if (
    data
    && 'numChildren' in data
    && typeof data.numChildren === 'function'
    && typeof data.getChildAt === 'function'
  ) {
    return data;
  }
  return null;
}

/**
 * One date off a task, as milliseconds since the epoch.
 *
 * A gantt's axis is a date-time scale whatever the author wrote against it:
 * AnyChart accepts a `Date`, an ISO string and a bare timestamp for the same
 * field and draws all three at the same instant, so all three are read as one
 * here.
 *
 * @param value - Whatever the tree item held
 * @returns The instant, or `NaN` when the value names none
 */
function toTimestamp(value: unknown): number {
  if (value instanceof Date)
    return value.getTime();
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'string') {
    const asNumeric = Number(value);
    return Number.isFinite(asNumeric) ? asNumeric : Date.parse(value);
  }
  return Number.NaN;
}

/**
 * One of a task's own dates, falling back to the one the chart worked out.
 *
 * A parent task states no dates: AnyChart derives them from its children and
 * keeps the answer in the item's meta as `autoStart` / `autoEnd`. Reading only
 * the authored field would leave every summary row of a project chart empty.
 *
 * @param item - The tree item to read
 * @param field - The authored field name
 * @param derived - The meta key AnyChart computes it into
 * @returns The instant, or `NaN` when neither is set
 */
function readTaskDate(
  item: AnyChartTreeItem,
  field: string,
  derived: string,
): number {
  let own: unknown;
  try {
    own = item.get(field);
  } catch {
    own = undefined;
  }
  const authored = toTimestamp(own);
  if (Number.isFinite(authored))
    return authored;

  try {
    return toTimestamp(item.meta?.(derived));
  } catch {
    return Number.NaN;
  }
}

/**
 * The intervals booked on one row of a schedule.
 *
 * A resource chart puts several on a row — that is what its `periods` array
 * is for, and it is the case {@link GanttData}'s nested shape exists to carry.
 * A project chart puts at most one there. A task with a start and no end is a
 * milestone: AnyChart draws it as a diamond at an instant, so it is emitted as
 * the zero-length interval it is rather than dropped.
 *
 * @param item - The tree item to read
 * @returns Its intervals, in the order the row holds them
 */
function readTaskSpans(item: AnyChartTreeItem): GanttSpan[] {
  let periods: unknown;
  try {
    periods = item.get('periods');
  } catch {
    periods = undefined;
  }

  if (Array.isArray(periods)) {
    const spans: GanttSpan[] = [];
    for (const period of periods) {
      if (!isRecord(period))
        continue;
      const start = toTimestamp(period.start);
      if (!Number.isFinite(start))
        continue;
      const end = toTimestamp(period.end);
      const label = asString(period.name ?? period.id);
      spans.push({
        start,
        end: Number.isFinite(end) ? end : start,
        ...(label ? { label } : {}),
      });
    }
    return spans;
  }

  const start = readTaskDate(item, 'actualStart', 'autoStart');
  if (!Number.isFinite(start))
    return [];
  const end = readTaskDate(item, 'actualEnd', 'autoEnd');
  return [{ start, end: Number.isFinite(end) ? end : start }];
}

/**
 * Flatten a gantt's task tree into one lane per row, in draw order.
 *
 * Depth-first, parents before their children, which is the order the chart
 * stacks its rows in. A parent is a lane of its own rather than a heading: it
 * carries the span AnyChart derived for it, and a reader arrowing down the
 * lanes meets it exactly where the chart draws it.
 *
 * @param tree - The chart's task tree
 * @returns Its lanes, in row order
 */
function collectGanttLanes(tree: AnyChartTree): GanttLane[] {
  const lanes: GanttLane[] = [];

  const visit = (item: AnyChartTreeItem): void => {
    const name = asString(item.get('name') ?? item.get('id'))
      || `Lane ${lanes.length + 1}`;
    lanes.push({ name, spans: readTaskSpans(item) });

    let children = 0;
    try {
      children = item.numChildren?.() ?? 0;
    } catch {
      children = 0;
    }
    for (let i = 0; i < children; i++) {
      const child = item.getChildAt?.(i);
      if (child)
        visit(child);
    }
  };

  let rows = 0;
  try {
    rows = tree.numChildren();
  } catch {
    return lanes;
  }
  for (let i = 0; i < rows; i++) {
    const child = tree.getChildAt(i);
    if (child)
      visit(child);
  }
  return lanes;
}

/**
 * What one unit of a schedule's axis is, and how many milliseconds it holds.
 *
 * The length of an interval is the fact a gantt exists to carry, and MAIDR
 * announces it as a bare number with {@link GanttData.unit} after it. Left in
 * milliseconds every task in a project would be announced as an unreadable
 * nine-digit figure, so the axis is restated in the unit its own span calls
 * for. The unit is READ rather than guessed: AnyChart's gantt timeline is a
 * date-time scale, so what the tree holds is instants, and saying so is not
 * an inference about the data.
 *
 * @param lanes - The schedule's lanes
 * @returns The unit its axis reads in
 */
function resolveGanttScale(lanes: GanttLane[]): GanttScale {
  const instants = lanes.flatMap(lane =>
    lane.spans.flatMap(span => [span.start, span.end]));
  const span = instants.length > 0
    ? Math.max(...instants) - Math.min(...instants)
    : 0;
  return span <= GANTT_HOURLY_MAX_SPAN
    ? { perUnit: MS_PER_HOUR, unit: 'hours' }
    : { perUnit: MS_PER_DAY, unit: 'days' };
}

/**
 * Stamp `data-maidr-anychart-task-bar="<laneIndex>-<intervalIndex>"` on every
 * bar of a gantt chart.
 *
 * A gantt renders as a split widget — a data grid on the left, a timeline on
 * the right — sharing one SVG, and its bars have no counterpart among the
 * cartesian mark families: no series drew them, so no series-scoped lookup
 * finds them. What is left is the count, and a gantt offers more filled shapes
 * than any other chart here: the row stripes behind both halves, the header,
 * the progress fill inside a bar that has one.
 *
 * So the schedule's own interval count is what picks them out. When the whole
 * SVG holds exactly that many filled paths they are the bars; otherwise the
 * search narrows to the LAYER holding exactly that many, since AnyChart draws
 * each family into a layer of its own. Two layers answering to the same count
 * — the stripes behind a one-interval-per-row project chart are exactly that —
 * are separated by the one property a schedule has and a background does not:
 * its bars begin and end in different places. Anything still ambiguous is left
 * unstamped and said out loud, because a bar highlighted for the wrong task is
 * worse than none at all.
 *
 * On any other chart type this is a no-op.
 */
function stampGanttAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  stampPrefix = '',
): void {
  if (!isGanttChart(chart))
    return;

  const tree = readTaskTree(chart);
  if (!tree)
    return;

  const drawn: Array<{ lane: number; interval: number }> = [];
  collectGanttLanes(tree).forEach((lane, index) => {
    lane.spans.forEach((_, interval) => drawn.push({ lane: index, interval }));
  });
  if (drawn.length === 0)
    return;

  const candidates = collectFilledDataPaths(svg).filter(
    // Idempotency — skip bars stamped on a prior bind.
    path => !path.hasAttribute(GANTT_ATTR),
  );

  const bars = resolveGanttBars(candidates, drawn.length);
  if (!bars) {
    console.warn(
      `[maidr/anychart] Could not tell this gantt's ${drawn.length} task bars `
      + `apart from the ${candidates.length} filled shapes its SVG holds. `
      + 'Highlighting is disabled for this chart; pass an explicit '
      + '`selectors` entry to override.',
    );
    return;
  }

  bars.forEach((bar, i) => {
    const { lane, interval } = drawn[i];
    bar.setAttribute(GANTT_ATTR, `${stampPrefix}${lane}-${interval}`);
  });
}

/**
 * Pick the schedule's task bars out of a gantt's filled shapes.
 *
 * @param candidates - Every filled path the SVG holds
 * @param expected - How many intervals the schedule emitted
 * @returns The bars, in document order, or `null` when they cannot be told
 * apart from the rest of the chart
 */
function resolveGanttBars(
  candidates: SVGElement[],
  expected: number,
): SVGElement[] | null {
  if (candidates.length === expected)
    return candidates;

  const byLayer = new Map<Element, SVGElement[]>();
  for (const candidate of candidates) {
    const layer = candidate.closest('g[id^="ac_layer_"]');
    if (!layer)
      continue;
    const group = byLayer.get(layer);
    if (group)
      group.push(candidate);
    else
      byLayer.set(layer, [candidate]);
  }

  const matching = Array.from(byLayer.values()).filter(
    group => group.length === expected,
  );
  if (matching.length === 1)
    return matching[0];
  if (matching.length === 0)
    return null;

  // Several layers hold the right number of shapes. A schedule's bars start
  // and end in different places; a column of row backgrounds is one rectangle
  // repeated down the chart, and that is the difference.
  const varied = matching.filter(hasVaryingSpans);
  return varied.length === 1 ? varied[0] : null;
}

/**
 * Whether a group of shapes sits at more than one position and width.
 *
 * A shape that cannot be measured answers no rather than yes: this separates
 * a schedule from a backdrop, and a group it cannot see is a group it cannot
 * vouch for.
 *
 * @param group - The shapes to measure
 * @returns True when they do not all share one left edge and one width
 */
function hasVaryingSpans(group: SVGElement[]): boolean {
  const boxes: RegionBox[] = [];
  for (const shape of group) {
    const box = readDrawnBox(shape);
    if (!box)
      return false;
    boxes.push(box);
  }
  const [first] = boxes;
  if (!first)
    return false;
  return boxes.some(
    box => Math.abs(box.left - first.left) > DRAWN_BOX_TOLERANCE_PX
      || Math.abs(box.width - first.width) > DRAWN_BOX_TOLERANCE_PX,
  );
}

// ---------------------------------------------------------------------------
// Layer builders – one per MAIDR trace type
// ---------------------------------------------------------------------------

function buildBarLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  invertedCategories = false,
  panel?: PanelContext,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: BarPoint[] = rows.map(r => ({
    x: asString(r.x ?? r.name ?? r._index),
    y: asNumber(r.value ?? r.y),
  }));

  // An inverted scale draws the categories from the far end while the marks
  // stay in data order, so both the reading and the selectors turn round
  // together -- reversing one alone announces a bar and outlines another
  // (#1021, and #988 / #1000 before it).
  if (invertedCategories && data.length > 0) {
    data.reverse();
    return {
      id: String(seriesIndex),
      type: TraceType.BAR,
      selectors: barSelectorsInDrawnOrder(seriesIndex, data.length, panel),
      data,
    };
  }

  return {
    id: String(seriesIndex),
    type: TraceType.BAR,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * Build a DOT or LOLLIPOP layer from an AnyChart `marker` / `stick` series.
 *
 * The points are a bar's, unchanged: `BarTrace` serves all three, because a
 * reader navigates one category and one magnitude whichever mark the chart
 * draws — a bar, a point, or a point on a stem. What the type buys is an
 * announcement that names the chart the author drew.
 *
 * @param series - The AnyChart series to convert
 * @param seriesIndex - Index of the series within its chart, used as the layer id
 * @param variant - {@link TraceType.DOT} or {@link TraceType.LOLLIPOP}
 * @param selectors - CSS selectors for highlighting, when resolvable
 * @returns The MAIDR dot / lollipop layer
 */
function buildDotLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  variant: TraceType.DOT | TraceType.LOLLIPOP,
  selectors: string | string[] | undefined,
): MaidrLayer {
  return { ...buildBarLayer(series, seriesIndex, selectors), type: variant };
}

/**
 * Build a DUMBBELL layer from an AnyChart `range-column` / `range-bar` series.
 *
 * The two ends are named `Low` and `High` — AnyChart's own names for the two
 * fields the row carries. `DumbbellTrace` announces the end the cursor is on,
 * and its own fallback is "start" / "end", which on a range series says less
 * than the chart already knows. Nothing better is available: AnyChart draws
 * one bar from the smaller value to the larger and never records what the pair
 * is a comparison OF, so a chart of life expectancy in 1990 against 2020
 * cannot name its years here. `options.axes` cannot supply them either; a
 * caller who has the names post-processes the emitted layer.
 *
 * A row missing either end is dropped: AnyChart draws no bar for one, and
 * keeping it would slide every later row's highlight onto its neighbour.
 *
 * @param series - The AnyChart series to convert
 * @param seriesIndex - Index of the series within its chart, used as the layer id
 * @param selectors - CSS selectors for highlighting, when resolvable
 * @returns The MAIDR dumbbell layer
 */
function buildDumbbellLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const points: DumbbellPoint[] = extractRawRows(series)
    .filter(isDrawnPair)
    .map(r => ({
      x: r.x !== undefined ? (typeof r.x === 'number' ? r.x : String(r.x)) : asNumber(r._index),
      start: asNumber(r.low),
      end: asNumber(r.high),
    }));
  const data: DumbbellData = { points, startLabel: 'Low', endLabel: 'High' };
  return {
    id: String(seriesIndex),
    type: TraceType.DUMBBELL,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

function buildLineLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const points: LinePoint[] = rows.map(r => ({
    x: r.x !== undefined ? (typeof r.x === 'number' ? r.x : String(r.x)) : asNumber(r._index),
    y: asNumber(r.value ?? r.y),
  }));
  const data: LinePoint[][] = [points];
  return {
    id: String(seriesIndex),
    type: TraceType.LINE,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * Build a step layer from an AnyChart `step-line` / `step-area` series.
 *
 * The point shape is identical to a line series — AnyChart varies only how the
 * segments are drawn. `stepDirection` is deliberately not emitted: AnyChart
 * exposes it as a per-series setting that the raw series rows do not carry, so
 * claiming a direction here would be a guess.
 * @param series - The AnyChart series to convert
 * @param seriesIndex - Index of the series within its chart, used as the layer id
 * @param selectors - CSS selectors for highlighting, when resolvable
 * @returns The MAIDR step layer
 */
function buildStepLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  return { ...buildLineLayer(series, seriesIndex, selectors), type: TraceType.STEP };
}

/**
 * Build an AREA layer from an AnyChart `area` / `spline-area` series.
 *
 * `AreaTrace` extends `LineTrace` and reads the same `LinePoint[][]`, so the
 * points are the line's unchanged — what the type buys is an announcement that
 * says "area chart" rather than "line chart". The stacked variants are not
 * built here: they are a property of the chart's y scale rather than of any
 * one series, and stacking is only meaningful across the whole set of them.
 * See {@link buildStackedAreaLayer}.
 *
 * @param series - The AnyChart series to convert
 * @param seriesIndex - Index of the series within its chart, used as the layer id
 * @param selectors - CSS selectors for highlighting, when resolvable
 * @returns The MAIDR area layer
 */
function buildAreaLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  return { ...buildLineLayer(series, seriesIndex, selectors), type: TraceType.AREA };
}

/**
 * Build ONE stacked-area layer from every area series on a stacked chart.
 *
 * The other builders emit a layer per series, which is right while the series
 * are read independently. A stacked area is not: the band a reader is on is
 * its own series' value, but the edge they see is the running total of every
 * series at that x, and `AreaTrace` computes that total from the series it was
 * handed. Emitting one layer per series would hand it a single band and let it
 * report a total equal to that band and a share of 100% — a number the chart
 * never drew, announced with the same confidence as a correct one.
 *
 * Each series' OWN value is emitted, never the running edge. `AreaTrace` sums
 * the layer itself precisely because charting libraries disagree about which
 * of the two their `y` is, and the accumulation belongs in one place.
 *
 * @param entries - The chart's area series, with their chart-wide indices
 * @param variant - {@link TraceType.STACKED_AREA} or {@link TraceType.NORMALIZED_AREA}
 * @param options - Binder options, consulted for selector overrides
 * @param panel - The owning panel, in multi-panel mode
 * @returns The single MAIDR layer holding every band
 */
function buildStackedAreaLayer(
  entries: Array<{ series: AnyChartSeries; index: number }>,
  variant: TraceType.STACKED_AREA | TraceType.NORMALIZED_AREA,
  options?: AnyChartBinderOptions,
  panel?: PanelContext,
): MaidrLayer {
  const data: LinePoint[][] = entries.map(({ series }) => {
    const name = readSeriesName(series);
    return extractRawRows(series).map(r => ({
      x: r.x !== undefined ? (typeof r.x === 'number' ? r.x : String(r.x)) : asNumber(r._index),
      y: asNumber(r.value ?? r.y),
      ...(name ? { z: name } : {}),
    }));
  });

  // One selector per band, in band order: `LineTrace.mapToSvgElements` matches
  // the array against its line count, so a shortfall would drop the highlight
  // for the whole layer rather than for the one band that could not be
  // resolved. Emit the array only when every band resolved to a plain string.
  const resolved = entries.map(({ index }) =>
    resolveSelector(index, TraceType.AREA, options, panel));
  const selectors = resolved.filter((one): one is string => typeof one === 'string');

  return {
    id: String(entries[0].index),
    type: variant,
    ...(selectors.length === entries.length ? { selectors } : {}),
    data,
  };
}

function buildScatterLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: ScatterPoint[] = rows.map(r => ({
    x: asNumber(r.x),
    y: asNumber(r.value ?? r.y),
  }));
  return {
    id: String(seriesIndex),
    type: TraceType.SCATTER,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * Build a BOX layer from an AnyChart box series.
 *
 * @remarks
 * AnyChart exposes quartile data (lowest, q1, median, q3, highest) through
 * its iterator, but does not provide direct access to outlier arrays via the
 * standard data iterator API.  As a result, `lowerOutliers` and
 * `upperOutliers` are always empty.  If your chart contains outliers and you
 * need them in the accessible representation, supply them manually by
 * post-processing the {@link Maidr} object returned from
 * {@link anyChartToMaidr}.
 */
function buildBoxLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: BoxPoint[] = rows.map(r => ({
    z: asString(r.x ?? r.name ?? r._index),
    // Outlier arrays are not available through AnyChart's iterator API.
    lowerOutliers: [],
    min: asNumber(r.lowest),
    q1: asNumber(r.q1),
    q2: asNumber(r.median),
    q3: asNumber(r.q3),
    max: asNumber(r.highest),
    upperOutliers: [],
  }));

  // When the caller did not supply selectors, build a `BoxSelector[]` whose
  // entries reference the per-box, per-part attributes that
  // {@link stampBoxAttributes} writes on the rendered SVG. MAIDR's
  // `BoxTrace.mapToSvgElements` bails to `null` (no highlight) unless
  // `selectors.length === points.length`, so we always emit exactly one
  // entry per box. `q1` and `q3` are intentionally omitted — MAIDR derives
  // them from the `iq` element's top/bottom edges via
  // `Svg.createLineElement(iq, 'top'|'bottom')`. Outlier arrays are empty
  // because AnyChart's iterator API does not expose outliers.
  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  const stampedBoxSelectors: BoxSelector[] = data.map((_, b) => {
    const base = `${scope}[${BOX_ATTR}="${stamp}${seriesIndex}-${b}"]`;
    return {
      lowerOutliers: [],
      min: `${base}[${BOX_PART_ATTR}="min"]`,
      iq: `${base}[${BOX_PART_ATTR}="iq"]`,
      q2: `${base}[${BOX_PART_ATTR}="q2"]`,
      max: `${base}[${BOX_PART_ATTR}="max"]`,
      upperOutliers: [],
    };
  });

  return {
    id: String(seriesIndex),
    type: TraceType.BOX,
    selectors: selectors ?? stampedBoxSelectors,
    data,
  };
}

function buildHeatmapLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
): MaidrLayer {
  const rows = extractRawRows(series);

  // Collect unique x and y labels in insertion order.
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();

  for (const r of rows) {
    const xVal = asString(r.x);
    const yVal = asString(r.y ?? r.name);
    if (!xSet.has(xVal)) {
      xLabels.push(xVal);
      xSet.add(xVal);
    }
    if (!ySet.has(yVal)) {
      yLabels.push(yVal);
      ySet.add(yVal);
    }
  }

  // Build the 2D points matrix (y rows × x columns).
  const points: number[][] = Array.from(
    { length: yLabels.length },
    () => Array.from<number>({ length: xLabels.length }).fill(0),
  );
  for (const r of rows) {
    const xi = xLabels.indexOf(asString(r.x));
    const yi = yLabels.indexOf(asString(r.y ?? r.name));
    if (xi >= 0 && yi >= 0)
      points[yi][xi] = asNumber(r.heat ?? r.value ?? r.fill);
  }

  const data: HeatmapData = { x: xLabels, y: yLabels, points };
  return {
    id: String(seriesIndex),
    type: TraceType.HEATMAP,
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * Build a heatmap layer from a chart instance directly (no series).
 *
 * AnyChart's heatMap() chart type is a single-dataset chart that does NOT
 * expose `getSeriesCount()` / `getSeriesAt()`. Its data is accessed via the
 * top-level `chart.data().getIterator()` walk where each row carries
 * `{ x, y, heat }`.
 *
 * This function builds the same `HeatmapData { x, y, points }` shape that
 * {@link buildHeatmapLayer} produces, but sources its rows from the chart's
 * own iterator rather than from a series.
 *
 * The returned layer's `selectors` field defaults to the stamped attribute
 * selector ({@link HEATMAP_ATTR}); pass an explicit override via the
 * `selectors` arg to opt out.
 */
function buildHeatmapLayerFromChart(
  chart: AnyChartInstance,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer | null {
  const dataView = resolveChartDataView(chart);
  if (!dataView)
    return null;
  let iterator: AnyChartIterator | null = null;
  try {
    iterator = dataView.getIterator();
  } catch {
    iterator = null;
  }
  if (!iterator)
    return null;

  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const xSet = new Set<string>();
  const ySet = new Set<string>();
  const rows: Array<{ x: string; y: string; v: number }> = [];

  iterator.reset();
  while (iterator.advance()) {
    const xRaw = iterator.get('x');
    const yRaw = iterator.get('y') ?? iterator.get('name');
    const heatRaw = iterator.get('heat') ?? iterator.get('value') ?? iterator.get('fill');
    const x = asString(xRaw);
    const y = asString(yRaw);
    const v = asNumber(heatRaw);
    if (!xSet.has(x)) {
      xLabels.push(x);
      xSet.add(x);
    }
    if (!ySet.has(y)) {
      yLabels.push(y);
      ySet.add(y);
    }
    rows.push({ x, y, v });
  }

  if (xLabels.length === 0 || yLabels.length === 0)
    return null;

  const points: number[][] = Array.from(
    { length: yLabels.length },
    () => Array.from<number>({ length: xLabels.length }).fill(0),
  );
  for (const r of rows) {
    const xi = xLabels.indexOf(r.x);
    const yi = yLabels.indexOf(r.y);
    if (xi >= 0 && yi >= 0)
      points[yi][xi] = r.v;
  }

  const data: HeatmapData = { x: xLabels, y: yLabels, points };
  const defaultSelector = `${panelScope(panel)}[${HEATMAP_ATTR}]`;
  return {
    id: '0',
    type: TraceType.HEATMAP,
    selectors: selectors ?? defaultSelector,
    data,
    // `stampHeatmapAttributes` walks the chart's cells in row-major order
    // (`r * cols + c`). `Heatmap.mapToSvgElements` defaults to a
    // column-major mapping for <rect> cells unless told otherwise — that
    // mismatch would either transpose the highlight grid or fail the
    // `domElements.length === rows * cols` invariant. Mirror the D3
    // heatmap binder's `domMapping: { order: 'row' }` hint so the model
    // groups the stamped cells the way they were laid out.
    //
    // NOTE: AnyChart's production GraphicsJS renderer emits heatmap cells
    // as <path> elements, not <rect>. The path branch of
    // `Heatmap.mapToSvgElements` unconditionally uses row-major with
    // row-reversal and ignores `domMapping.order` entirely — so this hint
    // is a no-op for current AnyChart heatmaps. It is retained as
    // defensive coverage for any alternative AnyChart build (or future
    // renderer change) that emits <rect> cells instead.
    domMapping: { order: 'row' },
  };
}

function buildCandlestickLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const rows = extractRawRows(series);
  const data: CandlestickPoint[] = rows.map((r) => {
    const open = asNumber(r.open);
    const close = asNumber(r.close);
    const high = asNumber(r.high);
    const low = asNumber(r.low);

    let trend: CandlestickTrend = 'Neutral';
    if (close > open)
      trend = 'Bull';
    else if (close < open)
      trend = 'Bear';

    const midpoint = (high + low) / 2;
    return {
      value: asString(r.x ?? r.name ?? r._index),
      open,
      high,
      low,
      close,
      volume: asNumber(r.volume),
      trend,
      volatility: midpoint > 0 ? (high - low) / midpoint : 0,
    };
  });
  // Default selector targets the attribute stamped by
  // {@link stampCandlestickAttributes}, scoped to this series index. The
  // candlestick model duplicates the matched element across all OHLC
  // segments, so a single attribute per candle is sufficient.
  const defaultSelector
    = `${panelScope(panel)}[${CANDLESTICK_ATTR}^="${panelStampPrefix(panel)}${seriesIndex}-"]`;
  return {
    id: String(seriesIndex),
    type: TraceType.CANDLESTICK,
    selectors: selectors ?? defaultSelector,
    data,
  };
}

/**
 * Build a PIE layer from already-read slice rows.
 *
 * Slices with no numeric value are dropped rather than carried through as
 * gaps: AnyChart draws no wedge for one, so keeping it would slide every later
 * slice's highlight onto its neighbour. The percentage each slice represents
 * is deliberately not emitted — MAIDR's pie trace derives it from the values,
 * so there is exactly one source of truth for it.
 *
 * @param rows - The chart's (or series') raw data rows, in slice order
 * @param seriesIndex - Index used as the layer id and in the default selector
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The MAIDR pie layer
 */
function buildPieLayer(
  rows: Array<Record<string, unknown>>,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const data: PiePoint[] = rows
    .filter(isDrawnDatum)
    .map(r => ({
      x: asString(r.x ?? r.name ?? r._index),
      y: asNumber(r.value ?? r.y),
    }));

  // Default selector targets the attribute stamped by
  // {@link stampPieAttributes}, which writes one per wedge in slice order.
  const defaultSelector
    = `${panelScope(panel)}[${PIE_ATTR}^="${panelStampPrefix(panel)}${seriesIndex}-"]`;
  return {
    id: String(seriesIndex),
    type: TraceType.PIE,
    selectors: selectors ?? defaultSelector,
    data,
  };
}

/**
 * Build a CHOROPLETH layer from an AnyChart map's shaded-region series.
 *
 * Each row is a region and its value. The name comes from the geodata rather
 * than from the row — see {@link regionNameOf} — and a row with no numeric
 * value is dropped, because AnyChart shades no region for one and keeping it
 * would slide every later region's highlight onto its neighbour.
 *
 * **`lon` and `lat` are deliberately omitted.** The grammar's centroids are
 * degrees east and north (`ChoroplethPoint.lon` / `.lat`), and what AnyChart
 * has are its features' `middle-x` / `middle-y` — normalised coordinates in
 * the map's own projection, which are not degrees and cannot be turned into
 * them without inverting a projection the chart does not name. Passing them
 * through would tell a reader that one region lies north of another when the
 * map says nothing of the kind. Without them `ChoroplethTrace` reads the
 * regions as a list in declared order: a poorer reading, and the one the data
 * supports. `neighbors` is not derivable from AnyChart at all and stays
 * absent too.
 *
 * The selectors are emitted as an ARRAY, one exact-match entry per region in
 * DATA order, for the reason {@link stampChoroplethAttributes} explains: a map
 * paints every feature of its geodata in the geodata's order, so a prefix
 * selector — which resolves in document order — would hand the trace its
 * regions shuffled.
 *
 * @param chart - The map the series belongs to, for its geodata
 * @param series - The choropleth series
 * @param seriesIndex - Index used as the layer id and in the default selectors
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The MAIDR choropleth layer
 */
function buildChoroplethLayer(
  chart: AnyChartInstance,
  series: AnyChartSeries,
  seriesIndex: number,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const names = readRegionNames(chart);
  const data: ChoroplethPoint[] = extractRawRows(series)
    .filter(isDrawnDatum)
    .map(row => ({
      x: regionNameOf(series, row, names),
      y: asNumber(row.value ?? row.y),
    }));

  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  const defaultSelectors = data.map(
    (_, i) => `${scope}[${CHOROPLETH_ATTR}="${stamp}${seriesIndex}-${i}"]`,
  );
  return {
    id: String(seriesIndex),
    type: TraceType.CHOROPLETH,
    selectors: selectors ?? defaultSelectors,
    data,
  };
}

/**
 * Build a FUNNEL layer from an AnyChart funnel's (or pyramid's) stage rows.
 *
 * Only the count is emitted. `FunnelTrace` derives each stage's share of the
 * population and its retention from the previous stage itself, and those are
 * the numbers a funnel is read for — computing them here would put the same
 * arithmetic in every adapter and give a reader two sources for one figure.
 *
 * A pyramid is emitted unchanged, in draw order. Its widest stage is at the
 * bottom rather than the top, but the rows still arrive in the order AnyChart
 * consumed them, which is the order the stages follow one another in.
 *
 * @param rows - The chart's raw data rows, in stage order
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The MAIDR funnel layer
 */
function buildFunnelLayer(
  rows: Array<Record<string, unknown>>,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const data: BarPoint[] = rows
    .filter(isDrawnDatum)
    .map(r => ({
      // A funnel's default data mapping is `name` / `value`, unlike the pie's
      // `x` / `value`, so `name` is preferred here and `x` is the fallback.
      x: asString(r.name ?? r.x ?? r._index),
      y: asNumber(r.value ?? r.y),
    }));

  // Default selector targets the attribute stamped by
  // {@link stampFunnelAttributes}, which writes one per segment in stage order.
  const defaultSelector
    = `${panelScope(panel)}[${FUNNEL_ATTR}^="${panelStampPrefix(panel)}0-"]`;
  return {
    id: '0',
    type: TraceType.FUNNEL,
    selectors: selectors ?? defaultSelector,
    data,
  };
}

/**
 * Build a WORD_CLOUD layer from an AnyChart tag cloud's term rows.
 *
 * The selectors are emitted as an ARRAY, one per term in data order, where
 * every other single-dataset builder here emits one prefix selector for the
 * whole set. That is not a stylistic choice: a prefix selector resolves in
 * document order, and a cloud's document order is its packing spiral, which
 * has nothing to do with the order the terms were declared in.
 * `WordCloudTrace` sorts the terms by weight and then indexes the resolved
 * elements by each term's position in the DECLARED data, so the array has to
 * arrive in that order or every highlight lands on someone else's word.
 *
 * @param rows - The chart's raw data rows, in declaration order
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The MAIDR word cloud layer
 */
function buildWordCloudLayer(
  rows: Array<Record<string, unknown>>,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const data: WordCloudPoint[] = rows
    .filter(isDrawnDatum)
    .map(r => ({
      x: asString(r.x ?? r.name ?? r._index),
      y: asNumber(r.value ?? r.y),
    }));

  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  const defaultSelectors = data.map(
    (_, i) => `${scope}[${WORD_CLOUD_ATTR}="${stamp}0-${i}"]`,
  );
  return {
    id: '0',
    type: TraceType.WORD_CLOUD,
    selectors: selectors ?? defaultSelectors,
    data,
  };
}

/**
 * Build a SANKEY layer from a sankey chart's flow rows.
 *
 * Only the edges are emitted. `FlowTrace` derives the nodes, their columns and
 * every total from the flows themselves — a flow names both of its ends, so a
 * node list here would be a second source of truth for something the rows
 * already say.
 *
 * The selectors are emitted as an ARRAY, one exact-match entry per flow in data
 * order, rather than as one prefix selector for the set. `FlowTrace` indexes
 * the resolved elements by each flow's DECLARED position — a node highlights
 * every ribbon that touches it, and the ribbons it touches are named by index —
 * so the order the elements arrive in is load-bearing, and an array pins it to
 * the stamp rather than to whatever order the document happens to hold.
 *
 * @param rows - The chart's raw data rows, in flow order
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The MAIDR sankey layer
 */
function buildSankeyLayer(
  rows: Array<Record<string, unknown>>,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const data: FlowPoint[] = rows
    .filter(isDrawnFlow)
    .map(r => ({
      source: asString(r.from),
      target: asString(r.to),
      value: asNumber(r.weight),
    }));

  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  const defaultSelectors = data.map(
    (_, i) => `${scope}[${SANKEY_ATTR}="${stamp}0-${i}"]`,
  );
  return {
    id: '0',
    type: TraceType.SANKEY,
    selectors: selectors ?? defaultSelectors,
    data,
  };
}

/**
 * Build a GANTT layer from a gantt chart's task tree.
 *
 * The lanes are NESTED, one array per row of the chart, which is what lets an
 * empty one survive: a task with no dates — a heading, a row whose work has
 * not been scheduled — is a real statement about a plan, and a flat list
 * grouped by lane cannot make it. Every lane is named in `lanes` in the same
 * order for the same reason, since an empty lane holds no interval to carry
 * its own name in `x`.
 *
 * The ends are restated in whole days (or hours, on a schedule short enough to
 * need them) rather than left as the milliseconds the tree holds, and the unit
 * is named alongside them — see {@link resolveGanttScale}. The x axis carries
 * a formatter that turns a position back into a date, so a reader is told when
 * a task runs as well as how long it takes.
 *
 * The selectors are emitted as an ARRAY, one exact-match entry per interval in
 * lane order: `GanttTrace` slices the resolved elements lane by lane, so the
 * order they arrive in is the reading, and it withdraws the highlight entirely
 * unless the count matches exactly.
 *
 * @param lanes - The schedule's rows, in draw order
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The MAIDR gantt layer
 */
function buildGanttLayer(
  lanes: GanttLane[],
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const scale = resolveGanttScale(lanes);
  const points: GanttPoint[][] = lanes.map(lane =>
    lane.spans.map(span => ({
      x: lane.name,
      start: span.start / scale.perUnit,
      end: span.end / scale.perUnit,
      ...(span.label && span.label !== lane.name ? { label: span.label } : {}),
    })));

  const data: GanttData = {
    points,
    lanes: lanes.map(lane => lane.name),
    unit: scale.unit,
  };

  const scope = panelScope(panel);
  const stamp = panelStampPrefix(panel);
  const defaultSelectors: string[] = [];
  points.forEach((lane, index) => {
    lane.forEach((_, interval) => {
      defaultSelectors.push(
        `${scope}[${GANTT_ATTR}="${stamp}${index}-${interval}"]`,
      );
    });
  });

  return {
    id: '0',
    type: TraceType.GANTT,
    // A schedule runs its bars left to right, which puts the dates on x and
    // the lanes on y — the opposite of the trace's own default.
    orientation: Orientation.HORIZONTAL,
    selectors: selectors ?? defaultSelectors,
    // The positions stay readable as dates even though the lengths are now
    // counted in units: without this an end announces as the unit count it
    // is, which says how far along the axis a task sits and not when it runs.
    axes: {
      x: {
        format: {
          function: `return new Date(value * ${scale.perUnit}).${
            scale.perUnit === MS_PER_HOUR
              ? 'toLocaleString()'
              : 'toLocaleDateString()'
          }`,
        },
      },
    },
    data,
  };
}

/** One step of a waterfall, before its running total has been worked out. */
interface WaterfallStep {
  /** The category the step is drawn at. */
  x: string;
  /** Whatever the chart's data mode says this row's `value` means. */
  value: number;
  /** Whether the step restates the running total rather than changing it. */
  isTotal: boolean;
}

/**
 * The chart's waterfall series, with their chart-wide indices.
 *
 * Returns nothing for a chart with no series API at all, which is how every
 * single-dataset chart type answers: the stampers run over whatever chart they
 * are given, and asking a pie for its series count throws.
 *
 * @param chart - The chart to inspect
 * @returns Its waterfall series, in chart order
 */
function collectWaterfallSeries(
  chart: AnyChartInstance,
): Array<{ series: AnyChartSeries; index: number }> {
  return collectSeriesOfType(chart, WATERFALL_SERIES_TYPES);
}

/**
 * Reduce a waterfall chart's series to one step per category.
 *
 * A waterfall carrying several series stacks them within each category, and the
 * bridge it draws still runs one step per category: the contribution at a step
 * is everything the series add there together, and the total it arrives at is
 * the same number whichever series contributed it. Summing is therefore what
 * the chart itself does, not an approximation of it — and `WaterfallTrace` has
 * no series dimension to spend the breakdown on anyway.
 *
 * Rows with no numeric value are dropped: AnyChart draws no bar for one, and
 * folding it in as a zero would announce a step the chart never made.
 *
 * @param entries - The chart's waterfall series
 * @returns One step per category, in first-appearance order
 */
function aggregateWaterfallRows(
  entries: Array<{ series: AnyChartSeries; index: number }>,
): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  const byCategory = new Map<string, WaterfallStep>();

  for (const { series } of entries) {
    for (const row of extractRawRows(series)) {
      const value = Number(row.value ?? row.y);
      if (!Number.isFinite(value))
        continue;
      const x = asString(row.x ?? row.name ?? row._index);
      const existing = byCategory.get(x);
      if (existing) {
        existing.value += value;
        existing.isTotal = existing.isTotal || Boolean(row.isTotal);
      } else {
        const step: WaterfallStep = { x, value, isTotal: Boolean(row.isTotal) };
        byCategory.set(x, step);
        steps.push(step);
      }
    }
  }
  return steps;
}

/**
 * Build ONE waterfall layer from every waterfall series on a chart.
 *
 * The running total is accumulated here because `WaterfallPoint` fixes `start`
 * and `end` as absolute positions on the value axis, while AnyChart's default
 * `dataMode` of `'diff'` hands out contributions. In `'absolute'` mode it hands
 * out the totals instead and the contribution is the difference — the same two
 * readings every waterfall producer disagrees about, resolved once here rather
 * than left for the trace to guess at.
 *
 * The first step is read as a total whether or not its row says so, which is
 * what AnyChart does too: there is nothing to carry into the first bar, so it
 * sits on the baseline and states the value it opens at.
 *
 * @param entries - The chart's waterfall series, with their chart-wide indices
 * @param chart - The chart they belong to, consulted for its data mode
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The single MAIDR layer holding every step
 */
function buildWaterfallLayer(
  entries: Array<{ series: AnyChartSeries; index: number }>,
  chart: AnyChartInstance,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  let dataMode: string | undefined;
  let totalsAreAbsolute = false;
  try {
    dataMode = chart.dataMode?.();
    totalsAreAbsolute = chart.drawTotalsAsAbsolute?.() ?? false;
  } catch {
    // A chart that does not answer is on AnyChart's own defaults.
    dataMode = undefined;
  }
  const readsAbsolute = dataMode === 'absolute';

  let running = 0;
  const data: WaterfallPoint[] = aggregateWaterfallRows(entries).map((step, i) => {
    const isTotal = i === 0 || step.isTotal;
    // `drawTotalsAsAbsolute` makes a marked total state its OWN value and leave
    // the running total where it was — the chart draws a bar of that height and
    // carries on from where it left off, so a reading that accumulated it would
    // announce a total the chart never reached.
    const restates = isTotal && totalsAreAbsolute && i > 0;
    const end = restates || readsAbsolute ? step.value : running + step.value;
    // A total sits on the baseline rather than floating, so its bar spans the
    // whole running total and its `delta` is that total — which is what
    // `end - start` gives once `start` is zero.
    const start = isTotal ? 0 : running;
    if (!restates)
      running = end;
    return {
      x: step.x,
      start,
      end,
      delta: end - start,
      kind: (isTotal ? 'total' : end - start < 0 ? 'decrease' : 'increase') as WaterfallKind,
    };
  });

  const defaultSelector
    = `${panelScope(panel)}[${WATERFALL_ATTR}^="${panelStampPrefix(panel)}0-"]`;
  return {
    id: String(entries[0].index),
    type: TraceType.WATERFALL,
    selectors: selectors ?? defaultSelector,
    data,
  };
}

/** A marimekko's two-way table, read off its series. */
interface MosaicTable {
  /** The categories, in first-appearance order — one column each. */
  categories: string[];
  /** What each series is called, when it is called anything. */
  names: Array<string | undefined>;
  /** The values, indexed `[series][category]`. */
  values: number[][];
}

/**
 * The chart's marimekko series, with their chart-wide indices.
 *
 * @param chart - The chart to inspect
 * @returns Its `mekko` series, in chart order
 */
function collectMosaicSeries(
  chart: AnyChartInstance,
): Array<{ series: AnyChartSeries; index: number }> {
  return collectSeriesOfType(chart, MOSAIC_SERIES_TYPES);
}

/**
 * Read a marimekko's series into the rectangular table it was drawn from.
 *
 * `SegmentedTrace` navigates a grid, so every series needs a value at every
 * category even where its own rows have none. A category a series does not
 * carry becomes zero rather than a gap: AnyChart draws no tile for one and
 * contributes nothing for it to the column's total, which is what a zero says
 * — and what the segmented trace's own element pairing already expects.
 *
 * @param entries - The chart's marimekko series
 * @returns The table, indexed `[series][category]`
 */
function readMosaicTable(
  entries: Array<{ series: AnyChartSeries; index: number }>,
): MosaicTable {
  const categories: string[] = [];
  const seen = new Set<string>();
  const rows = entries.map(({ series }) => {
    const byCategory = new Map<string, number>();
    for (const row of extractRawRows(series)) {
      const x = asString(row.x ?? row.name ?? row._index);
      if (!seen.has(x)) {
        seen.add(x);
        categories.push(x);
      }
      byCategory.set(x, asNumber(row.value ?? row.y));
    }
    return byCategory;
  });

  return {
    categories,
    names: entries.map(({ series }) => readSeriesName(series)),
    values: rows.map(byCategory =>
      categories.map(category => byCategory.get(category) ?? 0)),
  };
}

/**
 * Build ONE mosaic layer from every marimekko series on a chart.
 *
 * A marimekko is a stacked bar chart whose bar WIDTHS also carry data, and the
 * width is the one number the rows do not hold: AnyChart derives it from the
 * table, drawing each column at its share of every observation. So it is
 * computed the same way here — the column's total over the grand total — and
 * carried on every cell of the column, which is where the grammar puts it.
 *
 * A reader given only the segment heights has half the table: the conditional
 * proportions without the group sizes they were computed from, so a category of
 * six and one of six hundred read identically.
 *
 * `count` is deliberately not emitted. A marimekko is usually drawn from a
 * contingency table, but AnyChart takes any measure at all, and declaring one
 * would put "Count 42.5" in the announcement for a chart of revenue.
 *
 * @param entries - The chart's marimekko series, with their chart-wide indices
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The single MAIDR layer holding the whole table
 */
function buildMosaicLayer(
  entries: Array<{ series: AnyChartSeries; index: number }>,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const table = readMosaicTable(entries);
  const columnTotals = table.categories.map((_, c) =>
    table.values.reduce((total, row) => total + (Number.isFinite(row[c]) ? row[c] : 0), 0));
  const grandTotal = columnTotals.reduce((total, column) => total + column, 0);

  const data: MosaicPoint[][] = table.values.map((row, s) =>
    row.map((value, c) => ({
      x: table.categories[c],
      y: value,
      z: table.names[s] ?? `Series ${s + 1}`,
      // A grand total of zero has no shares to report, and 0/0 would announce
      // every column as NaN% of the chart.
      ...(grandTotal > 0 ? { width: columnTotals[c] / grandTotal } : {}),
    })));

  const defaultSelector = `${panelScope(panel)}[${MOSAIC_ATTR}]`;
  return {
    id: String(entries[0].index),
    type: TraceType.MOSAIC,
    selectors: selectors ?? defaultSelector,
    data,
    // `stampMosaicAttributes` walks the tiles series-major, which is the order
    // AnyChart renders them in. `SegmentedTrace` defaults its path branch to
    // the same reading, but says so here rather than relying on the default:
    // the two have to agree, and a hint is where that agreement is written
    // down.
    domMapping: { order: 'row' },
  };
}

/**
 * The chart's bar series, when the caller has declared it a diverging chart.
 *
 * Declared rather than detected. AnyChart has no diverging chart type: the
 * idiom is a stacked `anychart.bar()` whose two series straddle zero, which is
 * indistinguishable from a stacked bar chart that happens to contain negative
 * values. A diverging trace replaces the sign in every announcement with the
 * name of a side, so a wrong guess would not merely rename the chart — it
 * would remove the one clue a reader has that the reading is wrong.
 *
 * Two sides are required, because that is what the reading is: the balance
 * MAIDR announces is a difference between exactly two. A chart with fewer
 * keeps its ordinary bar layers and says why.
 *
 * @param chart - The chart to inspect
 * @param options - Binder options, consulted for the opt-in
 * @returns Its bar series, in chart order, or nothing when the chart is not
 * the two-sided one this reading assumes
 */
function collectDivergingSeries(
  chart: AnyChartInstance,
  options?: AnyChartBinderOptions,
): Array<{ series: AnyChartSeries; index: number }> {
  if (options?.diverging !== true)
    return [];

  const entries = collectSeriesOfType(chart, DIVERGING_SERIES_TYPES);
  if (entries.length >= 2)
    return entries;

  console.warn(
    `[maidr/anychart] \`diverging\` was requested but this chart draws ${entries.length} `
    + 'bar series, and a diverging chart is two sides read against each other. '
    + 'Reading it as an ordinary bar chart instead.',
  );
  return [];
}

/**
 * Build ONE diverging layer from the bar series that straddle zero.
 *
 * A layer per series would lose the whole reading: `DivergingTrace` extends
 * the segmented bar, so the sides are its rows and the categories its columns,
 * and the balance between them — which side is ahead at each category, and by
 * how much — is computed down a column of that grid. Split across layers there
 * is no column to compute it from.
 *
 * The values are emitted SIGNED, exactly as the chart draws them. That is the
 * one thing this trace type needs that a stacked bar does not: the pitch takes
 * the magnitude and the announcement names the side, so a cohort of two
 * million on the left sounds bigger than one of ten thousand on the right
 * rather than lower.
 *
 * Each point carries its series' name in `z`, which is what the announcement
 * calls the side. An unnamed series carries the empty string, leaving
 * `DivergingTrace`'s own "left" / "right" fallback in charge — the one place
 * that decision is already made.
 *
 * @param entries - The chart's bar series, with their chart-wide indices
 * @param selectors - Caller-supplied selector override, when there is one
 * @param panel - The owning panel, in multi-panel mode
 * @returns The single MAIDR layer holding both sides
 */
function buildDivergingLayer(
  entries: Array<{ series: AnyChartSeries; index: number }>,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
): MaidrLayer {
  const data: SegmentedPoint[][] = entries.map(({ series }) => {
    const name = readSeriesName(series) ?? '';
    return extractRawRows(series).map(r => ({
      x: asString(r.x ?? r.name ?? r._index),
      y: asNumber(r.value ?? r.y),
      z: name,
    }));
  });

  const defaultSelector = `${panelScope(panel)}[${BAR_ATTR}]`;
  return {
    id: String(entries[0].index),
    type: TraceType.DIVERGING,
    selectors: selectors ?? defaultSelector,
    data,
    // `stampBarAttributes` walks the bars series-major, which is the order
    // AnyChart renders them in, and the sides are declared left first — the
    // order a producer naturally writes them and the one `DivergingTrace`
    // already defaults to. Both are said out loud here rather than relied on:
    // the failure is silent and visual-only, since audio, text and braille
    // never go through the element mapping.
    domMapping: { order: 'row', groupDirection: 'forward' },
  };
}

/**
 * Build a RADAR or POLAR_AREA layer from one series of a radial chart.
 *
 * The points are a line's, unchanged: `RadarTrace` extends `LineTrace` and
 * reads the same `LinePoint[][]`, computing the spoke angles itself from the
 * series it is handed. What the type buys is an announcement that says "radar"
 * rather than "line chart" — and, because the spokes are evenly spaced around a
 * circle, panning that goes out and back rather than sweeping left to right.
 *
 * @param series - The AnyChart series to convert
 * @param seriesIndex - Index of the series within its chart, used as the layer id
 * @param variant - {@link TraceType.RADAR} or {@link TraceType.POLAR_AREA}
 * @param selectors - The layer's selectors, already resolved by the caller
 * @returns The MAIDR radial layer
 */
function buildRadarLayer(
  series: AnyChartSeries,
  seriesIndex: number,
  variant: TraceType.RADAR | TraceType.POLAR_AREA,
  selectors: string | string[] | undefined,
): MaidrLayer {
  return {
    ...buildLineLayer(series, seriesIndex, selectors),
    type: variant,
  };
}

/**
 * The default highlight selector for one series of a radial chart: the
 * attribute {@link stampRadarAttributes} writes, one per mark in spoke order.
 *
 * Built here rather than inside {@link buildRadarLayer} because a caller who
 * passed an explicit `selectors` array may deliberately have left this series
 * out, and a builder that filled the gap with its own default would highlight a
 * series the caller asked it not to.
 *
 * @param seriesIndex - Index of the series within its chart
 * @param panel - The owning panel, in multi-panel mode
 * @returns The attribute selector for that series' marks
 */
function radarSelector(seriesIndex: number, panel?: PanelContext): string {
  return `${panelScope(panel)}[${RADAR_ATTR}^="${panelStampPrefix(panel)}${seriesIndex}-"]`;
}

// ---------------------------------------------------------------------------
// Layer builder dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch to the per-type layer builder. The `traceType` union is limited
 * to what {@link mapSeriesType} can return, so the switch is exhaustive and
 * needs no `default` — adding a new AnyChart trace type is a compile error
 * until a matching case is added here.
 */
function buildLayer(
  chart: AnyChartInstance,
  series: AnyChartSeries,
  seriesIndex: number,
  traceType: AnyChartTraceType,
  selectors: string | string[] | undefined,
  panel?: PanelContext,
  invertedCategories = false,
): MaidrLayer {
  switch (traceType) {
    case TraceType.BAR:
      return buildBarLayer(series, seriesIndex, selectors, invertedCategories, panel);
    case TraceType.DOT:
    case TraceType.LOLLIPOP:
      return buildDotLayer(series, seriesIndex, traceType, selectors);
    case TraceType.DUMBBELL:
      return buildDumbbellLayer(series, seriesIndex, selectors);
    case TraceType.LINE:
      return buildLineLayer(series, seriesIndex, selectors);
    case TraceType.AREA:
      return buildAreaLayer(series, seriesIndex, selectors);
    case TraceType.STEP:
      return buildStepLayer(series, seriesIndex, selectors);
    case TraceType.SCATTER:
      return buildScatterLayer(series, seriesIndex, selectors);
    case TraceType.BOX:
      return buildBoxLayer(series, seriesIndex, selectors, panel);
    case TraceType.HEATMAP:
      return buildHeatmapLayer(series, seriesIndex, selectors);
    case TraceType.CANDLESTICK:
      return buildCandlestickLayer(series, seriesIndex, selectors, panel);
    // The one builder that needs the chart as well as the series: a region's
    // name lives in the geodata the CHART was bound to, never in the row.
    case TraceType.CHOROPLETH:
      return buildChoroplethLayer(chart, series, seriesIndex, selectors, panel);
    case TraceType.PIE:
      return buildPieLayer(extractRawRows(series), seriesIndex, selectors, panel);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * What a pie's two dimensions are called when the chart names neither. A pie
 * is bound to no axis, so there is no axis title to extract — these name what
 * each dimension actually holds rather than leaving the slices unlabelled.
 */
const PIE_AXIS_FALLBACKS = { x: 'Label', y: 'Value' };

/**
 * What a funnel's two dimensions are called when the chart names neither. Like
 * a pie, a funnel is bound to no axis, so there is no axis title to extract.
 */
const FUNNEL_AXIS_FALLBACKS = { x: 'Stage', y: 'Count' };

/**
 * What a tag cloud's two dimensions are called when the chart names neither.
 * A cloud draws its magnitude as a font size rather than against a scale, so
 * it has no axis to borrow a title from either.
 */
const WORD_CLOUD_AXIS_FALLBACKS = { x: 'Term', y: 'Weight' };

/**
 * What a sankey's two dimensions are called when the chart names neither. A
 * sankey is bound to no axis either: its horizontal position is the stage a
 * node was sorted into and its vertical extent is the throughput, and neither
 * is drawn against a scale a title could hang on.
 */
const SANKEY_AXIS_FALLBACKS = { x: 'Node', y: 'Flow' };

/**
 * What a choropleth's two dimensions are called when the chart names neither.
 * A map is bound to no axis: its regions are places rather than positions on a
 * scale, and AnyChart's map chart has no `xAxis()` / `yAxis()` to borrow a
 * title from.
 */
const CHOROPLETH_AXIS_FALLBACKS = { x: 'Region', y: 'Value' };

/**
 * What a gantt's two dimensions are called when the chart names neither. A
 * gantt draws its own timeline header rather than an `xAxis()` / `yAxis()`
 * pair, so there is no axis title to extract; a resource chart's rows are
 * named separately, because what they hold is who is booked rather than what
 * is to be done.
 */
const GANTT_PROJECT_AXIS_FALLBACKS = { x: 'Date', y: 'Task' };
const GANTT_RESOURCE_AXIS_FALLBACKS = { x: 'Date', y: 'Resource' };

/**
 * The fallbacks for the trace types a SERIES can produce that are bound to no
 * axis. Looked up by trace type so the series loop states the rule once
 * instead of asking about each of them in turn.
 */
const AXIS_FALLBACKS_BY_TYPE: Partial<
  Record<AnyChartTraceType, { x: string; y: string }>
> = {
  [TraceType.PIE]: PIE_AXIS_FALLBACKS,
  [TraceType.CHOROPLETH]: CHOROPLETH_AXIS_FALLBACKS,
};

/**
 * Build one {@link MaidrSubplot} from a single AnyChart chart instance.
 *
 * This is the per-chart body shared by {@link anyChartToMaidr} (single
 * panel, `panel === undefined`) and {@link anyChartsToMaidr} (one call per
 * grid cell). Axis titles are extracted per chart, with `options.axes`
 * acting as an override. In panel mode:
 *
 * - every default selector is scoped to the panel's SVG via
 *   {@link PANEL_ATTR} and the token-prefixed stamp values,
 * - layer ids are prefixed `<row>_<col>_` so they stay unique across the
 *   whole figure,
 * - the chart's own title is placed on the FIRST layer, which is what the
 *   core uses as the panel's display name in subplot summaries,
 * - `subplot.selector` points at the panel's SVG root so the core can
 *   resolve the panel container.
 *
 * @returns The subplot, or `null` when the chart has no convertible series.
 */
function buildSubplot(
  chart: AnyChartInstance,
  panel: PanelContext | undefined,
  options?: AnyChartBinderOptions,
): MaidrSubplot | null {
  const xAxisLabel = options?.axes?.x ?? extractAxisTitle(chart, 'x');
  const yAxisLabel = options?.axes?.y ?? extractAxisTitle(chart, 'y');

  /**
   * `fallbacks` name the two dimensions of a trace that is bound to no axis
   * (a pie), where the chart-level extraction has nothing to attach.
   */
  const attachAxes = (
    layer: MaidrLayer,
    fallbacks?: { x: string; y: string },
  ): void => {
    const x = xAxisLabel ?? fallbacks?.x;
    const y = yAxisLabel ?? fallbacks?.y;
    if (!x && !y)
      return;
    // Merged onto whatever the builder already put there, rather than
    // replacing it: a gantt's x axis arrives carrying the formatter that turns
    // its positions back into dates, and that is not a label's to discard.
    const axes = { ...layer.axes };
    if (x)
      axes.x = { ...axes.x, label: x };
    if (y)
      axes.y = { ...axes.y, label: y };
    layer.axes = axes;
  };

  const finalize = (layers: MaidrLayer[]): MaidrSubplot => {
    if (panel) {
      for (const layer of layers) {
        // Layer ids must be unique across the WHOLE figure, not just within
        // one panel; prefix with the grid position (vegalite convention).
        layer.id = `${panel.row}_${panel.col}_${layer.id}`;
      }
      // The first layer's title is the panel's display name in the core's
      // subplot summaries (there is no subplot-level title field).
      const panelTitle = extractTitle(chart);
      if (layers.length > 0 && panelTitle && !layers[0].title)
        layers[0].title = panelTitle;
      return {
        layers,
        selector: `svg[${PANEL_ATTR}="${panel.token}"]`,
      };
    }
    return { layers };
  };

  // Heatmap is a single-dataset chart and does NOT expose
  // getSeriesCount()/getSeriesAt(). Detect it first and route to the
  // chart-level builder before touching the series API (which would throw
  // `e.getSeriesCount is not a function`).
  let chartType: string | undefined;
  try {
    chartType = chart.getType?.();
  } catch {
    chartType = undefined;
  }
  // Production AnyChart builds return `'heat-map'` from getType(); dev builds
  // may return `'heatmap'` / `'heat'`. Match by substring (as
  // stampHeatmapAttributes does) so all three route to the heatmap builder
  // rather than falling through to the series API (which heatmaps do not
  // implement).
  if (chartType?.includes('heat')) {
    const userHeatmapSelector = (options?.selectors?.[0] ?? undefined) as
      | string
      | string[]
      | undefined;
    const layer = buildHeatmapLayerFromChart(chart, userHeatmapSelector, panel);
    if (!layer)
      return null;
    attachAxes(layer);
    return finalize([layer]);
  }

  // A pie is the other single-dataset chart type: it exposes no series API
  // either, and reaching the `getSeriesCount()` fallback below would hand its
  // slices to the heatmap builder, which would emit a one-row heatmap. Route
  // it here, before the series API is touched.
  if (isPieChart(chart)) {
    const rows = readChartRows(chart);
    if (rows.length === 0)
      return null;
    const userPieSelector = (options?.selectors?.[0] ?? undefined) as
      | string
      | string[]
      | undefined;
    const layer = buildPieLayer(rows, 0, userPieSelector, panel);
    attachAxes(layer, PIE_AXIS_FALLBACKS);
    return finalize([layer]);
  }

  // A funnel / pyramid and a tag cloud are single-dataset charts too, and
  // reaching the `getSeriesCount()` fallback below would hand their rows to
  // the heatmap builder — whose rows have an `x` and a `value` but no `y`, so
  // it would collapse them into a one-row heatmap and bind it without a word.
  // Route them here, before the series API is touched.
  const chartLevelSelector = (options?.selectors?.[0] ?? undefined) as
    | string
    | string[]
    | undefined;

  if (isFunnelChart(chart)) {
    const rows = readChartRows(chart);
    if (rows.length === 0)
      return null;
    const layer = buildFunnelLayer(rows, chartLevelSelector, panel);
    attachAxes(layer, FUNNEL_AXIS_FALLBACKS);
    return finalize([layer]);
  }

  if (isWordCloudChart(chart)) {
    const rows = readChartRows(chart);
    if (rows.length === 0)
      return null;
    const layer = buildWordCloudLayer(rows, chartLevelSelector, panel);
    attachAxes(layer, WORD_CLOUD_AXIS_FALLBACKS);
    return finalize([layer]);
  }

  // A sankey is a single-dataset chart as well: its flows live on
  // `chart.data()` and it exposes no series API, so the `getSeriesCount()`
  // fallback below would hand its `from` / `to` / `weight` rows to the heatmap
  // builder and bind a one-row heatmap without a word.
  if (isSankeyChart(chart)) {
    // Filtered here as well as in the builder so a chart whose every row is a
    // dropoff — or whose data has not loaded — is reported as unconvertible
    // rather than bound as a graph with no edges.
    const rows = readChartRows(chart).filter(isDrawnFlow);
    if (rows.length === 0)
      return null;
    const layer = buildSankeyLayer(rows, chartLevelSelector, panel);
    attachAxes(layer, SANKEY_AXIS_FALLBACKS);
    return finalize([layer]);
  }

  // A gantt is the last of the chart-level types, and the one furthest from
  // the rest: it has no series API to reach the loop below with, and its data
  // is a task tree rather than a data view — so the `getSeriesCount()`
  // fallback would route its schedule to the heatmap builder, which would find
  // no iterator and bind nothing at all.
  if (isGanttChart(chart)) {
    const tree = readTaskTree(chart);
    if (!tree)
      return null;
    const lanes = collectGanttLanes(tree);
    // A plan whose every row is undated is not a schedule to read: the lanes
    // exist but nothing is booked in any of them, and a trace of empty lanes
    // announces a chart the reader cannot navigate anywhere within.
    if (lanes.every(lane => lane.spans.length === 0))
      return null;
    const layer = buildGanttLayer(lanes, chartLevelSelector, panel);
    attachAxes(
      layer,
      readChartType(chart) === 'gantt-resource'
        ? GANTT_RESOURCE_AXIS_FALLBACKS
        : GANTT_PROJECT_AXIS_FALLBACKS,
    );
    return finalize([layer]);
  }

  // Defensive fallback: if getType is unavailable but getSeriesCount throws
  // (heatmap-like single-dataset chart), route to the heatmap path anyway.
  let seriesCount = 0;
  try {
    seriesCount = chart.getSeriesCount();
  } catch {
    const userHeatmapSelector = (options?.selectors?.[0] ?? undefined) as
      | string
      | string[]
      | undefined;
    const layer = buildHeatmapLayerFromChart(chart, userHeatmapSelector, panel);
    if (!layer)
      return null;
    // Attach axis labels just like the primary heatmap path above, so
    // production heatmaps that reach this fallback (getType() unavailable)
    // still expose their axis titles.
    attachAxes(layer);
    return finalize([layer]);
  }
  if (seriesCount === 0)
    return null;

  const layers: MaidrLayer[] = [];

  // Stacking is a property of the chart's y scale, so it is read once here
  // rather than per series. On a stacked chart the area series are collected
  // instead of emitted, because their bands only mean anything together —
  // see {@link buildStackedAreaLayer}.
  const areaVariant = resolveAreaVariant(chart);
  const stackedVariant = areaVariant === TraceType.AREA ? null : areaVariant;
  const stackedAreas: Array<{ series: AnyChartSeries; index: number }> = [];

  // Whether the categories are arranged around a circle. Like stacking this is
  // a chart-level fact the series cannot report — a radar's series call
  // themselves lines — so it is read once here and applied to each of them.
  const isRadial = isRadialChart(chart);
  const hasSelectorOverrides = (options?.selectors?.length ?? 0) > 0;

  // A waterfall's series are collected rather than emitted, for the reason the
  // stacked areas are: the chart draws ONE bridge, and each series is a
  // contribution to a step of it. See {@link buildWaterfallLayer}.
  const waterfalls: Array<{ series: AnyChartSeries; index: number }> = [];

  // A marimekko's series are collected for the same reason again: each one is a
  // level of every column, and the column widths — the second magnitude the
  // chart exists to show — only exist across the whole set.
  const mosaics: Array<{ series: AnyChartSeries; index: number }> = [];

  // A diverging chart's two sides are collected as well, because the balance
  // between them is read down a column of one grid. Unlike everything else
  // here this is declared rather than detected — see
  // {@link collectDivergingSeries} — so the set is resolved up front and the
  // loop skips whatever is in it.
  const divergings = collectDivergingSeries(chart, options);
  const divergingIndices = new Set(divergings.map(({ index }) => index));

  for (let i = 0; i < seriesCount; i++) {
    const series = chart.getSeriesAt(i);
    if (!series)
      continue;

    if (divergingIndices.has(i))
      continue;

    const anyChartType = series.seriesType();

    if (anyChartType === 'waterfall') {
      waterfalls.push({ series, index: i });
      continue;
    }

    if (anyChartType === 'mekko') {
      mosaics.push({ series, index: i });
      continue;
    }

    // A radial chart's series are read as spokes whatever they call
    // themselves. `mapSeriesType` would answer LINE for the same series and
    // announce a radar as a line chart — a mis-description rather than a gap,
    // since every announcement it produces is fluent and wrong.
    if (isRadial) {
      const radialType = resolveRadialType(chart, anyChartType);
      if (radialType) {
        // With overrides present `resolveSelector` answers from them and never
        // reaches its own LINE fallback, which is what the trace type passed
        // here would otherwise select — and the line attribute is one the radar
        // stamper never writes.
        const radialSelectors = hasSelectorOverrides
          ? resolveSelector(i, TraceType.LINE, options, panel)
          : radarSelector(i, panel);
        const layer = buildRadarLayer(series, i, radialType, radialSelectors);
        attachAxes(layer);
        layers.push(layer);
        continue;
      }
    }

    // Whether a marker series is a dot plot or a point cloud is a question
    // about the chart's x scale, not about the series — the same shape as the
    // radial check above — so it is asked before the table, which can only
    // answer one of the two.
    const traceType = resolveMarkerVariant(chart, anyChartType)
      ?? mapSeriesType(anyChartType);
    if (!traceType) {
      console.warn(
        `[maidr/anychart] Unsupported AnyChart series type "${anyChartType}". Skipping series ${i}.`,
      );
      continue;
    }

    if (traceType === TraceType.AREA && stackedVariant !== null) {
      stackedAreas.push({ series, index: i });
      continue;
    }

    const selectors = resolveSelector(i, traceType, options, panel);
    // Only when the adapter owns the selectors: a caller who named the marks
    // themselves is describing their own chart, and replacing their list with
    // one built from the stamped attributes would discard what they said.
    const invertedCategories = traceType === TraceType.BAR
      && !hasSelectorOverrides
      && drawsCategoriesReversed(chart, series);
    const layer = buildLayer(chart, series, i, traceType, selectors, panel, invertedCategories);

    // Attach axis labels.
    attachAxes(layer, AXIS_FALLBACKS_BY_TYPE[traceType]);

    layers.push(layer);
  }

  if (stackedVariant !== null && stackedAreas.length > 0) {
    const layer = buildStackedAreaLayer(stackedAreas, stackedVariant, options, panel);
    attachAxes(layer);
    layers.push(layer);
  }

  if (waterfalls.length > 0) {
    const waterfallSelector = hasSelectorOverrides
      ? resolveSelector(waterfalls[0].index, TraceType.BAR, options, panel)
      : undefined;
    const layer = buildWaterfallLayer(waterfalls, chart, waterfallSelector, panel);
    // A bridge with no step is not a chart to bind: every row was missing.
    if ((layer.data as WaterfallPoint[]).length > 0) {
      attachAxes(layer);
      layers.push(layer);
    }
  }

  if (mosaics.length > 0) {
    const mosaicSelector = hasSelectorOverrides
      ? resolveSelector(mosaics[0].index, TraceType.BAR, options, panel)
      : undefined;
    const layer = buildMosaicLayer(mosaics, mosaicSelector, panel);
    // A table with no column is not a chart to bind.
    if ((layer.data as MosaicPoint[][])[0]?.length > 0) {
      attachAxes(layer);
      layers.push(layer);
    }
  }

  if (divergings.length > 0) {
    const divergingSelector = hasSelectorOverrides
      ? resolveSelector(divergings[0].index, TraceType.BAR, options, panel)
      : undefined;
    const layer = buildDivergingLayer(divergings, divergingSelector, panel);
    // A side with no category is not a chart to bind.
    if ((layer.data as SegmentedPoint[][])[0]?.length > 0) {
      attachAxes(layer);
      layers.push(layer);
    }
  }

  if (layers.length === 0)
    return null;

  return finalize(layers);
}

/**
 * Convert an AnyChart chart instance into a MAIDR data object.
 *
 * This function inspects the chart's series and metadata after it has been
 * drawn, then constructs a {@link Maidr} JSON structure that can be passed
 * to the `<Maidr>` React component or used with `bindAnyChart()`.
 *
 * @param chart - A drawn AnyChart chart instance.
 * @param options - Optional overrides for id, title, axes, and selectors.
 * @returns The MAIDR data object, or `null` if no convertible series found.
 */
export function anyChartToMaidr(
  chart: AnyChartInstance,
  options?: AnyChartBinderOptions,
): Maidr | null {
  // Resolve chart metadata.
  const container = resolveContainerElement(chart);
  const id = options?.id ?? container?.id ?? 'anychart-maidr';
  const title = options?.title ?? extractTitle(chart);

  const subplot = buildSubplot(chart, undefined, options);
  if (!subplot)
    return null;

  return {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

/** Elements that have already been bound via {@link bindAnyChart}. */
const boundElements = new WeakSet<Element>();

/**
 * The {@link Maidr} object each group host was bound with, so repeat
 * {@link bindAnyCharts} calls can honor their documented contract and return
 * the CURRENTLY BOUND object. Without this cache a re-bind without an
 * explicit `options.id` would return a freshly built Maidr whose generated
 * id — and therefore every panel-token selector — references attributes
 * that were never stamped into the DOM (stamping only runs on first bind).
 */
const boundGroupData = new WeakMap<Element, Maidr>();

/**
 * Bind an AnyChart chart to MAIDR for accessible interaction.
 *
 * This is the primary high-level API. It extracts data from a drawn
 * AnyChart chart, generates the MAIDR schema, injects it as a
 * `maidr-data` attribute on the chart's container element, and
 * dispatches a `maidr:bindchart` event so the MAIDR runtime picks it up.
 *
 * The MAIDR runtime (`maidr.js`) must be loaded on the page. It
 * listens for `maidr:bindchart` events and initialises accessibility
 * features for the target element.
 *
 * Calling this function multiple times on the same chart is safe: if the
 * container has already been bound, the existing {@link Maidr} data is
 * returned without re-dispatching the initialisation event.
 *
 * @param chart - A drawn AnyChart chart instance.
 * @param options - Optional overrides.
 * @returns The generated {@link Maidr} object, or `null` on failure.
 *
 * @example
 * ```ts
 * const chart = anychart.bar([4, 2, 7, 1]);
 * chart.container('container').draw();
 * bindAnyChart(chart);
 * ```
 */
export function bindAnyChart(
  chart: AnyChartInstance,
  options?: AnyChartBinderOptions,
): Maidr | null {
  const container = resolveContainerElement(chart);
  if (!container) {
    console.warn(
      '[maidr/anychart] Could not find the chart container element. '
      + 'Make sure the chart has been drawn before calling bindAnyChart().',
    );
    return null;
  }

  const maidr = anyChartToMaidr(chart, {
    ...options,
    id: options?.id ?? container.id ?? 'anychart-maidr',
  });

  if (!maidr) {
    console.warn('[maidr/anychart] Could not extract data from AnyChart chart.');
    return null;
  }

  // Enable markers on line-like series so per-point highlight attributes
  // have DOM elements to attach to. If any series was mutated, force a
  // synchronous re-draw so the new marker DOM exists by the time
  // `whenChartRendered` finds the SVG below. This is safer than waiting for
  // a second `stagerendered` event, which AnyChart may or may not fire
  // depending on the render mode in use.
  // Belt-and-suspenders: even though `enableLineMarkersIfNeeded` now exits
  // early for heatmaps, an unexpected chart type that lacks `getSeriesCount`
  // should never crash the entire bind flow. Treat any failure as
  // "no markers mutated" and continue.
  let markersMutated = false;
  try {
    markersMutated = enableLineMarkersIfNeeded(chart);
  } catch (err) {
    console.warn(
      '[maidr/anychart] enableLineMarkersIfNeeded failed; continuing without marker mutation:',
      err,
    );
  }
  if (markersMutated) {
    try {
      (chart as unknown as { draw?: () => void }).draw?.();
    } catch (err) {
      console.warn(
        '[maidr/anychart] Failed to force re-draw after enabling markers:',
        err,
      );
    }
  }

  // Wrap the SVG in a host `<div>` carrying explicit pixel dimensions captured
  // from the original container, so the SVG keeps its size once MAIDR
  // re-parents it into the focusable
  // `<div tabIndex=0 role="img" style="width: fit-content">` wrapper.
  // (The wrapper is purely about sizing — `maidr:bindchart` accepts any
  // `Element`, so an `<svg>` target would bind fine on its own.)
  //
  // The bindchart dispatch below is unconditional: line-marker stamping is
  // best-effort, but the chart must always become focusable so audio /
  // text / braille modalities work even when highlight cannot.
  whenChartRendered(chart, container, (svg) => {
    stampChartAttributes(chart, svg);

    const host = ensureHostWrapper(svg, container);
    if (boundElements.has(host))
      return;
    boundElements.add(host);
    host.setAttribute('maidr-data', JSON.stringify(maidr));

    host.dispatchEvent(
      new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }),
    );
  });

  return maidr;
}

// ---------------------------------------------------------------------------
// Multi-panel public API
// ---------------------------------------------------------------------------

/**
 * Distance (in CSS pixels) two containers' tops may differ while still being
 * clustered into the same visual row by `layout: 'auto'`.
 */
const AUTO_ROW_TOLERANCE_PX = 10;

/** One chart entry with its on-page position, used by the auto layout. */
interface AutoLayoutEntry {
  chart: AnyChartInstance;
  top: number;
  left: number;
}

/**
 * Derive a 2D grid from each chart container's on-page position: cluster
 * containers into rows by bounding-rect top (within
 * {@link AUTO_ROW_TOLERANCE_PX}), then sort each row left-to-right. The
 * result is in visual reading order (top-left panel first), which is the
 * order the MAIDR core expects.
 */
function autoLayoutGrid(charts: AnyChartInstance[]): AnyChartInstance[][] | null {
  const entries: AutoLayoutEntry[] = [];
  for (const chart of charts) {
    const container = resolveContainerElement(chart);
    if (!container) {
      console.warn(
        '[maidr/anychart] layout: "auto" requires every chart to have a '
        + 'resolvable, attached container. Draw all charts before binding, '
        + 'or pass an explicit 2D grid / { rows, columns } layout.',
      );
      return null;
    }
    const rect = container.getBoundingClientRect();
    entries.push({ chart, top: rect.top, left: rect.left });
  }

  entries.sort((a, b) => (a.top - b.top) || (a.left - b.left));

  const rows: Array<{ top: number; entries: AutoLayoutEntry[] }> = [];
  for (const entry of entries) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(entry.top - current.top) <= AUTO_ROW_TOLERANCE_PX)
      current.entries.push(entry);
    else
      rows.push({ top: entry.top, entries: [entry] });
  }

  return rows.map(row =>
    row.entries.sort((a, b) => a.left - b.left).map(e => e.chart),
  );
}

/**
 * Normalize the {@link AnyChartGridInput} into a validated 2D grid.
 *
 * - An explicit 2D array is used as-is (row-major, visual reading order);
 *   empty rows and missing entries are rejected because they crash the MAIDR
 *   core's Figure model.
 * - A flat array is chunked row-major according to `layout`, arranged by
 *   container position (`'auto'`), or kept as a single row when no layout is
 *   given.
 *
 * @returns The grid, or `null` (with a console warning) on invalid input.
 */
function normalizeChartGrid(
  charts: AnyChartGridInput,
  layout: AnyChartsBinderOptions['layout'],
): AnyChartInstance[][] | null {
  if (!Array.isArray(charts) || charts.length === 0) {
    console.warn(
      '[maidr/anychart] Expected a non-empty array of AnyChart instances.',
    );
    return null;
  }

  const mixed = charts as Array<AnyChartInstance | AnyChartInstance[]>;
  const rowCount = mixed.filter(entry => Array.isArray(entry)).length;

  // Explicit 2D grid → subplots 1:1.
  if (rowCount > 0) {
    if (rowCount !== mixed.length) {
      console.warn(
        '[maidr/anychart] Chart grid mixes rows (arrays) and bare chart '
        + 'instances. Pass either a flat array or a full 2D array.',
      );
      return null;
    }
    const grid = charts as AnyChartInstance[][];
    for (const row of grid) {
      if (row.length === 0) {
        console.warn(
          '[maidr/anychart] Chart grid contains an empty row. Empty rows '
          + 'are not allowed (the MAIDR figure model cannot represent them).',
        );
        return null;
      }
      if (row.some(chart => !chart)) {
        console.warn('[maidr/anychart] Chart grid contains a missing chart entry.');
        return null;
      }
    }
    return grid;
  }

  const flat = charts as AnyChartInstance[];
  if (flat.some(chart => !chart)) {
    console.warn('[maidr/anychart] Chart array contains a missing chart entry.');
    return null;
  }

  if (layout === 'auto')
    return autoLayoutGrid(flat);

  const total = flat.length;
  const columns
    = layout?.columns
      ?? (layout?.rows ? Math.ceil(total / layout.rows) : total);
  if (!Number.isInteger(columns) || columns < 1) {
    console.warn(
      '[maidr/anychart] Invalid layout: `columns` (or `ceil(total / rows)`) '
      + 'must be a positive integer.',
    );
    return null;
  }

  const grid: AnyChartInstance[][] = [];
  for (let i = 0; i < total; i += columns)
    grid.push(flat.slice(i, i + columns));
  return grid;
}

/** One panel's chart + token, produced by {@link buildMaidrFromGrid}. */
interface PanelBinding {
  chart: AnyChartInstance;
  token: string;
}

/**
 * Build a multi-panel {@link Maidr} figure from a validated chart grid.
 *
 * Panels whose chart yields no convertible series are dropped (with a
 * warning) rather than emitted as empty subplots, because a subplot with
 * `layers: []` crashes the MAIDR core. Rows that end up empty are dropped
 * entirely. Panel tokens are always derived from the ORIGINAL grid position
 * so selector emission and DOM stamping stay in agreement even when panels
 * are dropped.
 */
function buildMaidrFromGrid(
  grid: AnyChartInstance[][],
  options?: AnyChartsBinderOptions,
): { maidr: Maidr | null; panels: PanelBinding[] } {
  const id = options?.id ?? nextId('anychart-maidr');
  const tokenBase = sanitizePanelToken(id);
  const subplotOptions: AnyChartBinderOptions | undefined
    = options?.axes ? { axes: options.axes } : undefined;

  const panels: PanelBinding[] = [];
  const subplots: MaidrSubplot[][] = [];

  grid.forEach((row, r) => {
    const subplotRow: MaidrSubplot[] = [];
    row.forEach((chart, c) => {
      const token = `${tokenBase}-${r}-${c}`;
      const subplot = buildSubplot(chart, { token, row: r, col: c }, subplotOptions);
      if (!subplot) {
        console.warn(
          `[maidr/anychart] Panel (${r}, ${c}) has no convertible series; `
          + 'dropping it from the figure.',
        );
        return;
      }
      panels.push({ chart, token });
      subplotRow.push(subplot);
    });
    if (subplotRow.length > 0)
      subplots.push(subplotRow);
  });

  if (subplots.length === 0) {
    console.warn('[maidr/anychart] No chart in the grid produced convertible data.');
    return { maidr: null, panels: [] };
  }

  const maidr: Maidr = {
    id,
    ...(options?.title ? { title: options.title } : {}),
    subplots,
  };
  return { maidr, panels };
}

/**
 * Convert a group of AnyChart chart instances into ONE multi-panel MAIDR
 * figure (a 2D subplot grid navigable with arrow keys + Enter).
 *
 * AnyChart has no native facet/small-multiples concept — the idiom is one
 * chart instance per container — so the grouping here is explicit:
 *
 * - `charts` as a 2D array maps 1:1 onto the subplot grid, row-major in
 *   visual reading order (top-left panel first).
 * - `charts` as a flat array is arranged according to `options.layout`
 *   (`{ rows?, columns? }` chunked row-major, `'auto'` derived from the
 *   containers' on-page positions, or a single row when omitted).
 *
 * Each panel's display name is its own chart title; `options.title` names
 * the whole figure and `options.axes` overrides every panel's axis labels.
 *
 * Prefer {@link bindAnyCharts}, which also stamps the per-panel highlight
 * attributes this function's selectors refer to. Use this directly only for
 * inspection or custom mounting flows. Pass a stable `options.id` if you
 * need deterministic output across calls (the default id is generated).
 *
 * @param charts - Drawn AnyChart instances, each in its own container.
 * @param options - Figure-level overrides and flat-array layout.
 * @returns The MAIDR data object, or `null` if nothing was convertible.
 */
export function anyChartsToMaidr(
  charts: AnyChartGridInput,
  options?: AnyChartsBinderOptions,
): Maidr | null {
  const grid = normalizeChartGrid(charts, options?.layout);
  if (!grid)
    return null;
  return buildMaidrFromGrid(grid, options).maidr;
}

/**
 * Stamp one panel's SVG with the panel token and all per-point highlight
 * attributes (token-prefixed so they are unique page-wide). Each stamp
 * family is best-effort: a failure in one must not block the others or the
 * bind itself.
 */
function stampPanelAttributes(
  chart: AnyChartInstance,
  svg: SVGElement,
  token: string,
): void {
  if (!svg.hasAttribute(PANEL_ATTR))
    svg.setAttribute(PANEL_ATTR, token);

  const prefix = `${token}:`;
  stampChartAttributes(chart, svg, prefix);
}

/**
 * Bind a group of AnyChart charts to MAIDR as ONE multi-panel figure.
 *
 * This is the multi-panel counterpart of {@link bindAnyChart}. It accepts
 * the same chart-grid input as {@link anyChartsToMaidr}, then:
 *
 * 1. builds the combined {@link Maidr} object (one subplot per chart),
 * 2. stamps `data-maidr-anychart-panel="<token>"` on each chart's own
 *    `<svg>` and token-prefixed highlight attributes on its marks, so every
 *    selector resolves ONLY inside its own panel,
 * 3. wraps the panels' common ancestor in a transparent host `<div>`, sets
 *    the combined `maidr-data` attribute on it, and dispatches a single
 *    `maidr:bindchart` event once every panel's SVG has rendered.
 *
 * Requirements: every chart must be drawn into its OWN container element
 * (the standard AnyChart idiom), and all panel containers should live under
 * a common wrapper element — the host wraps that wrapper (or groups
 * same-parent siblings) so MAIDR mounts once for the whole figure.
 * Shared-Stage dashboards (multiple charts on one Stage/container) are not
 * supported.
 *
 * Calling this again for the same group is safe: the existing binding is
 * reused and the current {@link Maidr} object is returned.
 *
 * @param charts - Drawn AnyChart instances, each in its own container.
 * @param options - Figure-level overrides and flat-array layout.
 * @returns The generated {@link Maidr} object, or `null` on failure.
 *
 * @example
 * ```ts
 * const q1 = anychart.column([['A', 4], ['B', 2]]);
 * q1.title('Q1'); q1.container('panel-1').draw();
 * const q2 = anychart.column([['A', 6], ['B', 3]]);
 * q2.title('Q2'); q2.container('panel-2').draw();
 *
 * bindAnyCharts([[q1, q2]], { id: 'sales', title: 'Sales by Quarter' });
 * ```
 */
export function bindAnyCharts(
  charts: AnyChartGridInput,
  options?: AnyChartsBinderOptions,
): Maidr | null {
  const grid = normalizeChartGrid(charts, options?.layout);
  if (!grid)
    return null;

  // Every panel needs its own resolvable container before anything else.
  const flatCharts = grid.flat();
  const containers: HTMLElement[] = [];
  for (const chart of flatCharts) {
    const container = resolveContainerElement(chart);
    if (!container) {
      console.warn(
        '[maidr/anychart] Could not find a container element for one of the '
        + 'charts. Make sure every chart has been drawn before calling '
        + 'bindAnyCharts().',
      );
      return null;
    }
    containers.push(container);
  }
  if (new Set(containers).size !== containers.length) {
    console.warn(
      '[maidr/anychart] bindAnyCharts requires each chart to live in its own '
      + 'container element. Shared-Stage dashboards (multiple charts drawn '
      + 'on one Stage) are not supported.',
    );
    return null;
  }

  const { maidr, panels } = buildMaidrFromGrid(grid, options);
  if (!maidr) {
    console.warn('[maidr/anychart] Could not extract data from the AnyChart charts.');
    return null;
  }

  // Enable line markers per chart (same best-effort flow as bindAnyChart).
  for (const chart of flatCharts) {
    let markersMutated = false;
    try {
      markersMutated = enableLineMarkersIfNeeded(chart);
    } catch (err) {
      console.warn(
        '[maidr/anychart] enableLineMarkersIfNeeded failed; continuing without marker mutation:',
        err,
      );
    }
    if (markersMutated) {
      try {
        (chart as unknown as { draw?: () => void }).draw?.();
      } catch (err) {
        console.warn(
          '[maidr/anychart] Failed to force re-draw after enabling markers:',
          err,
        );
      }
    }
  }

  const host = ensureGroupHostWrapper(containers);
  if (!host)
    return null;
  if (boundElements.has(host)) {
    // Reuse path: return the Maidr the host was actually bound with. The
    // freshly built `maidr` above may carry a newly generated id whose
    // panel-token selectors were never stamped into the DOM.
    return boundGroupData.get(host) ?? maidr;
  }

  const containerByChart = new Map<AnyChartInstance, HTMLElement>(
    flatCharts.map((chart, i) => [chart, containers[i]]),
  );

  // Stamp each panel as its SVG becomes available; bind the whole figure
  // once the LAST panel is stamped so `maidr-data` never references
  // attributes that do not exist yet.
  let pending = panels.length;
  const finalize = (): void => {
    pending -= 1;
    if (pending > 0)
      return;
    if (boundElements.has(host))
      return;
    boundElements.add(host);
    boundGroupData.set(host, maidr);
    host.setAttribute('maidr-data', JSON.stringify(maidr));
    host.dispatchEvent(
      new CustomEvent('maidr:bindchart', { bubbles: true, detail: maidr }),
    );
  };

  for (const { chart, token } of panels) {
    const container = containerByChart.get(chart);
    if (!container) {
      // Defensive: cannot happen (panels ⊆ flatCharts), but never stall the bind.
      finalize();
      continue;
    }
    whenChartRendered(chart, container, (svg) => {
      stampPanelAttributes(chart, svg, token);
      finalize();
    });
  }

  return maidr;
}

/**
 * Find the deepest element containing every given element.
 */
function lowestCommonAncestor(elements: HTMLElement[]): HTMLElement | null {
  for (
    let candidate: HTMLElement | null = elements[0];
    candidate;
    candidate = candidate.parentElement
  ) {
    const current = candidate;
    if (elements.every(el => current.contains(el)))
      return current;
  }
  return null;
}

/** Compare two nodes by document order (for stable panel ordering). */
function documentOrder(a: Node, b: Node): number {
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING)
    return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING)
    return 1;
  return 0;
}

/**
 * Ensure ALL panel containers of a multi-panel figure live inside one
 * transparent host `<div>` and return that host.
 *
 * Mirrors {@link ensureHostWrapper} but over a group: the combined
 * `maidr-data` attribute must sit on a single wrapper element containing
 * every panel container, because MAIDR mounts one React root per bound
 * element.
 *
 * Strategy:
 * - If an existing host already contains every panel, reuse it.
 * - If all containers are CONTIGUOUS siblings (same parent, nothing
 *   interleaved between them), insert a `display: contents` host before the
 *   first container (in document order) and move the containers into it —
 *   `display: contents` keeps them participating in the parent's flex/grid
 *   layout exactly as before, and contiguity guarantees the move cannot
 *   reorder any other page content (captions, headings, ...).
 * - Otherwise wrap the containers' lowest common ancestor (for
 *   non-contiguous same-parent panels that is the shared parent itself,
 *   wrapped in place), unless that ancestor is `<body>` / `<html>` (which
 *   cannot be reparented) — in that case the bind fails with guidance to
 *   add a wrapper element.
 *
 * The host carries the union bounding box of all panels via the
 * `data-maidr-host-width` / `-height` attributes consumed by
 * `SizedDomNodeAdapter`, keeping MAIDR's focusable wrapper non-zero-sized.
 */
function ensureGroupHostWrapper(containers: HTMLElement[]): HTMLElement | null {
  const existing = containers[0].parentElement?.closest<HTMLElement>(
    '[data-maidr-anychart-host]',
  );
  if (existing && containers.every(c => existing.contains(c)))
    return existing;

  // Union bounding box of all panels for the sized-host data attributes.
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const container of containers) {
    const rect = container.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  const width = right - left > 0 ? right - left : 600;
  const height = bottom - top > 0 ? bottom - top : 400;

  const host = document.createElement('div');
  host.setAttribute('data-maidr-anychart-host', '');
  host.style.display = 'contents';
  host.dataset.maidrHostWidth = String(width);
  host.dataset.maidrHostHeight = String(height);

  const firstParent = containers[0].parentElement;
  const sameParent
    = firstParent !== null
      && containers.every(c => c.parentElement === firstParent);
  if (sameParent) {
    const ordered = [...containers].sort(documentOrder);
    // Move the containers into the host ONLY when they are contiguous
    // siblings. Pulling non-adjacent panels together would drag them past
    // interleaved content (captions, headings, ...), visibly reordering the
    // page — in that case fall through to the LCA path below, which wraps
    // the shared parent in place and never changes internal order.
    const contiguous = ordered.every(
      (container, i) =>
        i === ordered.length - 1
        || container.nextElementSibling === ordered[i + 1],
    );
    if (contiguous) {
      firstParent.insertBefore(host, ordered[0]);
      for (const container of ordered)
        host.appendChild(container);
      return host;
    }
  }

  const lca = lowestCommonAncestor(containers);
  if (
    !lca
    || lca === document.body
    || lca === document.documentElement
    || !lca.parentNode
  ) {
    console.warn(
      '[maidr/anychart] bindAnyCharts could not find a wrappable common '
      + 'ancestor for the panel containers. Place all panel containers '
      + 'inside one wrapper element and try again.',
    );
    return null;
  }
  lca.parentNode.insertBefore(host, lca);
  host.appendChild(lca);
  return host;
}

/**
 * Ensure the user's chart container is wrapped in a transparent host `<div>`
 * and return that host.
 *
 * The host wraps the user's `container` (not just the SVG inside it) so that
 * MAIDR's `<article>` ends up as a sibling of the chart's bounded box at the
 * page level — not nested inside it. This is critical: many AnyChart usages
 * set the container to a fixed `height: 400px`, and if the MAIDR React tree
 * lives inside that 400px box, the text bar below the chart renders past the
 * container's bottom edge and is visually obscured. Wrapping from the
 * outside places the text bar in normal page flow below the chart, mirroring
 * the Chart.js adapter's sibling-insertion pattern.
 *
 * The host itself uses `display: contents` so it has no layout effect on
 * the original page. Sizing for MAIDR's focusable wrapper is delegated to
 * `SizedDomNodeAdapter` via the `data-maidr-host-width` /
 * `data-maidr-host-height` data attributes stamped here from the original
 * container's measured dimensions. That adapter renders an explicitly sized
 * `<div>` as a direct React child of the focusable wrapper, keeping
 * `width: fit-content` non-zero — and therefore focusable — even though the
 * AnyChart SVG has no intrinsic HTML `width` / `height` attributes.
 */
function ensureHostWrapper(
  svg: SVGElement,
  container: HTMLElement,
): HTMLElement {
  // If we've already wrapped this chart, return the existing host.
  const existing = container.parentElement?.closest<HTMLElement>(
    '[data-maidr-anychart-host]',
  );
  if (existing)
    return existing;

  // Capture the container's pixel dimensions before it is reparented, then
  // hand them to MAIDR via data attributes that `SizedDomNodeAdapter` in
  // `src/index.tsx` reads when it adopts this host into the React tree.
  const rect = container.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : (container.clientWidth || 600);
  const height = rect.height > 0 ? rect.height : (container.clientHeight || 400);

  const host = document.createElement('div');
  host.setAttribute('data-maidr-anychart-host', '');
  host.style.display = 'contents';
  host.dataset.maidrHostWidth = String(width);
  host.dataset.maidrHostHeight = String(height);

  // Wrap the entire user-supplied container with the host. After this:
  //   <body>
  //     <div data-maidr-anychart-host style="display:contents">
  //       <div id="container"> <svg/> </div>
  //     </div>
  //   </body>
  // `initMaidr` will then replace this host with the React root, so MAIDR's
  // <article> sits at the page level, NOT inside the 400px-tall #container.
  const parent = container.parentNode;
  if (parent) {
    parent.insertBefore(host, container);
    host.appendChild(container);
  } else {
    // Fallback (defensive): fall back to wrapping just the SVG if the
    // container is somehow detached. The text bar may overflow in this
    // edge case, but focus and navigation will still work.
    svg.parentNode!.insertBefore(host, svg);
    host.appendChild(svg);
  }

  // Mark the SVG so we can find it from the host (no-op for runtime
  // behavior, useful for diagnostics and tests).
  if (!svg.hasAttribute('data-maidr-anychart-svg')) {
    svg.setAttribute('data-maidr-anychart-svg', '');
  }

  return host;
}

/**
 * Invoke `callback` with the rendered chart SVG once it is in the DOM.
 *
 * Resolution order:
 * 1. If the SVG is already a descendant of `container`, fire synchronously.
 * 2. Otherwise, if AnyChart's Stage exposes `listenOnce('stagerendered', …)`,
 *    register the listener and use `stage.domElement()` when it fires.
 *    `stagerendered` is the official AnyChart event guaranteed to fire after
 *    the SVG is attached to the DOM, in both sync and async render modes.
 * 3. As a last-resort safety net (very old stage shapes), use a scoped
 *    `MutationObserver` on the container with a 5 s timeout.
 */
function whenChartRendered(
  chart: AnyChartInstance,
  container: HTMLElement,
  callback: (svg: SVGElement) => void,
): void {
  const existing = container.querySelector('svg');
  if (existing) {
    callback(existing);
    return;
  }

  // Try AnyChart's official Stage event.
  try {
    const stage = chart.container() as unknown as {
      listenOnce?: (event: string, handler: () => void) => void;
      domElement?: () => HTMLElement | null;
    };
    if (typeof stage?.listenOnce === 'function') {
      stage.listenOnce('stagerendered', () => {
        const svg
          = (typeof stage.domElement === 'function' ? stage.domElement() : null)
            ?? container.querySelector('svg');
        if (svg instanceof SVGElement) {
          callback(svg);
        } else {
          console.warn(
            '[maidr/anychart] `stagerendered` fired but no SVG was found.',
          );
        }
      });
      return;
    }
  } catch {
    // Fall through to MutationObserver.
  }

  // Fallback: observe DOM mutations on the container.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    const svg = container.querySelector('svg');
    if (svg) {
      observer.disconnect();
      if (timeoutId !== undefined)
        clearTimeout(timeoutId);
      callback(svg);
    }
  });
  observer.observe(container, { childList: true, subtree: true });

  timeoutId = setTimeout(() => {
    observer.disconnect();
    console.warn(
      '[maidr/anychart] Timed out waiting for the chart SVG to render. '
      + 'Make sure `chart.draw()` is called before `bindAnyChart()`.',
    );
  }, 5000);
}
