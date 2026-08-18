/**
 * CSS selector generation for plotly.js SVG elements.
 *
 * Generates selectors matching the py-maidr format, scoped to the
 * subplot container: `.subplot.{id} .trace.{type} .point`
 *
 * Plotly renders each subplot inside `<g class="subplot xy">` (or
 * `x2y2`, `x3y3`, etc.) and each trace type has predictable class
 * names on its `<g>` wrapper.
 *
 * NOTE: UID-based per-trace scoping is intentionally omitted.
 * Plotly concatenates UIDs into compound classes (`trace{uid}`) for
 * scatter, and omits them entirely for bars — making UID selectors
 * unreliable.  Subplot-level scoping matches py-maidr's proven
 * approach and is what the scatter and line families use.
 *
 * The bar family is scoped one level finer, to the trace's own group
 * within its layer. Subplot level was not sufficient there: a panel can
 * draw several traces into one `barlayer` — two bars in `overlay` mode, a
 * bar beside a histogram, two funnels — and one selector then named all of
 * their bars at once (#993). Bars carry no uid to scope by, so the group is
 * counted rather than named; see {@link barGroupSelector}.
 */

import type { PlotlyGraphDiv, PlotlyTrace, PolarSeries } from './types';
import { TraceType } from '../../type/grammar';

/**
 * Sankey selector: every ribbon plotly drew, in the order the flows were
 * authored.
 *
 * Unscoped by trace, because plotly appends each sankey's `g.sankey` straight
 * onto the paper beside groups of every other kind — there is no layer to
 * count within, the way `.pielayer` lets a pie be counted. A page with two
 * sankeys therefore matches both traces' ribbons, and `FlowTrace` withdraws
 * the highlight on the count mismatch that produces. That is the intended
 * outcome: the alternative is lighting up another chart's ribbon.
 */
const SANKEY_LINK_SELECTOR = '.sankey .sankey-links > path.sankey-link';

/**
 * Which layer plotly draws each bar-renderer trace type into.
 *
 * All four share the renderer, down to the `g.trace.bars` group class, and
 * differ only in the layer that holds them. Measured on one panel carrying
 * all four: each layer held exactly its own type's groups, two apiece, in
 * `_fullData` order — no type strayed into another's layer.
 */
const BAR_FAMILY_LAYER: Record<string, string> = {
  bar: 'barlayer',
  histogram: 'barlayer',
  funnel: 'funnellayer',
  waterfall: 'waterfalllayer',
};

/**
 * Generates CSS selectors for a given trace type and index.
 *
 * @param maidrType   - The MAIDR trace type.
 * @param traceIndex  - The global index of the trace in `gd._fullData`.
 * @param gd          - The plotly graph div element.
 * @returns CSS selector string, or `undefined` if no selector can be generated.
 */
export function generatePlotlySelectors(
  maidrType: TraceType,
  traceIndex: number,
  gd: HTMLElement,
): string | undefined {
  const plotlyGd = gd as unknown as PlotlyGraphDiv;
  const traceData = plotlyGd._fullData?.[traceIndex];

  // Build subplot prefix: `.subplot.xy `, `.subplot.x2y2 `, etc.
  const prefix = subplotCssPrefix(traceData?.xaxis, traceData?.yaxis);

  switch (maidrType) {
    case TraceType.SCATTER:
      return `${prefix}.trace.scatter .point`;

    // Scoped unconditionally, not only when the panel holds several groups: a
    // one-group panel resolves the same either way, and a selector that is
    // right only in the common case is the shape of the bug this closes.
    // Without a resolved trace there is no position to count to, so the
    // panel-wide selector stands as the last thing available.
    case TraceType.BAR:
    case TraceType.HISTOGRAM:
      return barFamilySelector(prefix, plotlyGd, traceIndex, traceData)
        ?? `${prefix}.trace.bars .point > path`;

    // A segmented layer spans several traces — a pyramid and a marimekko
    // among them, both stacked bar charts drawn through the same renderer —
    // so no single group names its bars. Its selector is a list over the
    // groups it covers, and only `extractSegmentedBarLayer` knows which those
    // are; it builds one and never asks here. Answering with the panel-wide
    // selector would hand a stray caller the very mismatch #993 is about, so
    // this declines instead.
    case TraceType.DODGED:
    case TraceType.STACKED:
    case TraceType.NORMALIZED:
    case TraceType.DIVERGING:
    case TraceType.MOSAIC:
      return undefined;

    // A step trace is a scatter trace plotly drew as a staircase, and an area
    // is one it filled in underneath, so their markers — when they have any —
    // are the same `.point` elements.
    case TraceType.LINE:
    case TraceType.STEP:
    case TraceType.AREA:
    case TraceType.STACKED_AREA:
    case TraceType.NORMALIZED_AREA:
      return lineSelector(prefix, traceData?.mode);

    // Funnel and waterfall are bar-like: plotly draws both through the bar
    // renderer, down to the `trace bars` group class, and only the layer they
    // sit in differs. Scoped to the trace's own group within that layer for
    // the same reason a bar is: two funnels on a panel get two groups, and
    // the layer-wide selector named both (#993).
    case TraceType.FUNNEL:
    case TraceType.WATERFALL:
      return barFamilySelector(prefix, plotlyGd, traceIndex, traceData)
        ?? (maidrType === TraceType.FUNNEL
          ? `${prefix}.funnellayer .trace.bars .point > path`
          : `${prefix}.waterfalllayer .trace.bars .point > path`);

    // A dot plot is a scatter with one marker per category, so its marks are
    // scatter markers — but a bar-shaped layer pairs its selector with its own
    // points alone, so this one is scoped to the single trace it describes
    // rather than to every scatter on the panel.
    case TraceType.DOT:
      return scatterTraceScope(prefix, traceData, '.point');

    // A word cloud is a scatter drawn as text: the glyph is the mark, and it
    // is the only thing on the panel that carries the term.
    case TraceType.WORD_CLOUD:
      return scatterTraceScope(prefix, traceData, 'g.textpoint > text');

    case TraceType.ERROR_BAR:
      return errorBarSelector(prefix, plotlyGd, traceIndex);

    case TraceType.BOX:
      return `${prefix}.trace.boxes .point > path`;

    case TraceType.HEATMAP:
      return `${prefix}.heatmaplayer image`;

    case TraceType.CANDLESTICK:
      return candlestickSelector(plotlyGd, traceIndex, prefix);

    case TraceType.PIE:
      return pieSelector(plotlyGd, traceIndex);

    // The three hierarchy layouts. Plotly draws each into a layer of its own
    // and gives every sector the same `g.slice > path.surface`, so they differ
    // only in which layer is scoped to.
    case TraceType.SUNBURST:
    case TraceType.ICICLE:
    case TraceType.TREEMAP:
      return hierarchySelector(plotlyGd, traceIndex);

    case TraceType.SANKEY:
      return SANKEY_LINK_SELECTOR;

    case TraceType.GAUGE:
      return gaugeSelector(plotlyGd, traceIndex);

    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the subplot CSS prefix from trace axis references.
 *
 * Plotly renders each subplot inside `<g class="subplot xy">`.
 * Axis names follow the pattern: `x` → `x`, `x2` → `x2`, etc.
 */
export function subplotCssPrefix(xaxis?: string, yaxis?: string): string {
  const x = xaxis ?? 'x';
  const y = yaxis ?? 'y';
  return `.subplot.${x}${y} `;
}

/**
 * Line selector: returns a selector only when markers are present.
 *
 * `mode: 'lines'` produces a single `<path class="js-line">` per series
 * with no individual point elements — per-point highlighting is not
 * possible. When markers exist (`mode` includes `'markers'`), plotly
 * renders `<path class="point">` elements that can be highlighted.
 */
function lineSelector(prefix: string, mode?: string): string | undefined {
  if (mode?.includes('markers')) {
    return `${prefix}.trace.scatter .point`;
  }
  // Lines-only mode: no per-point SVG elements to highlight.
  return undefined;
}

/**
 * Scopes a selector to one scatter trace's own marks.
 *
 * The subplot prefix alone matches every scatter on the panel, which is what
 * the line and scatter layers want — they describe all of them. A layer built
 * from a single trace needs its own marks and nothing else, and the uid class
 * plotly hangs on each `g.trace` is the only thing that names one: the group
 * order inside `.scatterlayer` is the fill z-order plotly sorted them into,
 * not the order of `_fullData`, so counting siblings would pick the wrong one.
 *
 * A uid that is not a usable class name — plotly generates safe ones, but an
 * author may set `uid` to anything — withdraws the selector rather than
 * emitting one that would silently match nothing.
 *
 * @param prefix - The subplot prefix the trace is drawn in
 * @param trace  - The resolved plotly trace
 * @param marks  - The selector for the marks within the trace's group
 * @returns The scoped selector, or undefined when the trace cannot be named
 */
function scatterTraceScope(
  prefix: string,
  trace: PlotlyTrace | undefined,
  marks: string,
): string | undefined {
  const uid = trace?.uid;
  if (!uid || !/^[\w-]+$/.test(uid)) {
    return undefined;
  }
  return `${prefix}.scatterlayer g.trace.trace${uid} ${marks}`;
}

/**
 * One bar-family trace's own bars, resolved from the trace itself.
 *
 * Returns undefined when there is no resolved trace, or when its type is not
 * one the bar renderer draws — either way there is no group to count to, and
 * the caller falls back to the layer-wide selector it used before.
 *
 * @param prefix     - The subplot prefix the trace is drawn in
 * @param gd         - The plotly graph div
 * @param traceIndex - The global index of the trace being selected
 * @param trace      - That trace, when plotly has resolved one
 * @returns The scoped selector, or undefined
 */
function barFamilySelector(
  prefix: string,
  gd: PlotlyGraphDiv,
  traceIndex: number,
  trace: PlotlyTrace | undefined,
): string | undefined {
  if (!trace) {
    return undefined;
  }
  const layer = BAR_FAMILY_LAYER[trace.type ?? ''];
  const position = barLayerPosition(gd, traceIndex, trace);
  return layer === undefined || position < 0
    ? undefined
    : barGroupSelector(prefix, layer, position);
}

/**
 * Every bar plotly drew for one bar-family trace.
 *
 * Scoped to that trace's own group rather than to the panel, because a panel
 * can draw more than one trace into its `barlayer` and the panel-wide
 * selector named all of their bars at once. Measured: two bars in `overlay`
 * mode, a bar beside a histogram, or two histograms each give a layer a
 * selector matching every group's bars (#993).
 *
 * What that cost differed by layer. A plain one saw more elements than points
 * and withdrew its highlight — no outline at all. A segmented one does not
 * compare counts, it chunks, so the extra elements shifted every cell instead:
 * with a histogram's group drawn first, series A at 'charlie' announced its
 * own value while outlining the histogram's first bin.
 *
 * The same holds one layer over: two funnels or two waterfalls on a panel
 * each get two groups in their own layer, and the layer-wide selector named
 * both — measured, 6 elements for two three-point traces.
 *
 * @param prefix        - The subplot prefix the trace is drawn in
 * @param layer         - The layer plotly drew it into, e.g. `'barlayer'`
 * @param tracePosition - Its position among that layer's traces on the panel
 * @returns The selector for that trace's bars, in its own point order
 */
export function barGroupSelector(
  prefix: string,
  layer: string,
  tracePosition: number,
): string {
  return `${prefix}.${layer} > g.trace.bars:nth-of-type(${tracePosition + 1})`
    + ` .point > path`;
}

/**
 * The bar plotly drew for one point of one bar-family trace.
 *
 * Bars are addressed individually — rather than through the one selector the
 * bar layers share — wherever a layer regroups its points into rows that are
 * not the traces plotly drew. A schedule does exactly that: its lanes are
 * categories, and the intervals in one lane may come from several traces.
 *
 * @param prefix        - The subplot prefix the trace is drawn in
 * @param tracePosition - Its position among the panel's bar-layer traces
 * @param pointIndex    - Which of that trace's points, in calc order
 * @returns The selector for that one bar's path
 */
export function barPointSelector(
  prefix: string,
  tracePosition: number,
  pointIndex: number,
): string {
  return `${prefix}.barlayer > g.trace.bars:nth-of-type(${tracePosition + 1})`
    + ` > g.points > g.point:nth-of-type(${pointIndex + 1}) > path`;
}

/**
 * Choropleth selectors: one region at a time, in the order the trace declared
 * them.
 *
 * Plotly draws a path per calc entry — including the entries it resolved to no
 * region at all, which stay in the DOM with no shape — so a region is
 * addressed by its own position rather than by counting the ones before it.
 * That keeps the pairing right for a map whose data has holes, which is the
 * ordinary case: a value the source had nothing for is still a row.
 *
 * The trace's group is counted within its own geo subplot, since plotly hangs
 * no uid class on these groups either.
 *
 * @param gd         - The plotly graph div
 * @param traceIndex - The global index of the choropleth trace
 * @param indices    - The calc index of each region the layer emitted
 * @returns One selector per region
 */
export function choroplethRegionSelectors(
  gd: PlotlyGraphDiv,
  traceIndex: number,
  indices: number[],
): string[] {
  const geoId = gd._fullData?.[traceIndex]?.geo ?? 'geo';
  const position = drawnBefore(
    gd,
    traceIndex,
    'choropleth',
    trace => (trace.geo ?? 'geo') === geoId,
  ) + 1;
  const group = `.geolayer > g.geo.${geoId} > g.backplot > g.choroplethlayer`
    + ` > g.trace.choropleth:nth-of-type(${position})`;
  return indices.map(index =>
    `${group} > path.choroplethlocation:nth-of-type(${index + 1})`);
}

/**
 * The trace types plotly draws into a panel's `g.contourlayer`, and so the
 * ones whose groups a contour has to count past.
 *
 * `histogram2dcontour` names `contourlayer` as its own layer and is drawn by
 * the contour plotter, so the two share both the layer and the `g.contour`
 * class plotly gives each trace's group.
 */
const CONTOURLAYER_TRACE_TYPES = ['contour', 'histogram2dcontour'];

/**
 * Contour selectors: the curves plotly drew for one level at a time.
 *
 * Plotly gives every level a `g.contourlevel` of its own — one per level in
 * the ladder, whether or not the field crosses it — and puts the level's
 * curves inside as `path.openline` and `path.closedline`. A level the field
 * never reaches therefore still takes a group, which is why a curve is
 * addressed by the index of the LEVEL it runs at rather than by counting the
 * curves before it.
 *
 * The trace's group is counted within its own panel, since plotly hangs no
 * uid class on these groups either.
 *
 * @param gd           - The plotly graph div
 * @param traceIndex   - The global index of the contour trace
 * @param levelIndices - The ladder position of each level the layer emitted
 * @returns One selector per level
 */
export function contourLevelSelectors(
  gd: PlotlyGraphDiv,
  traceIndex: number,
  levelIndices: number[],
): string[] {
  const trace = gd._fullData?.[traceIndex];
  const prefix = subplotCssPrefix(trace?.xaxis, trace?.yaxis);
  const position = layerNthChild(gd, traceIndex, CONTOURLAYER_TRACE_TYPES);
  const lines = `${prefix}.contourlayer > g.contour:nth-of-type(${position})`
    + ` > g.contourlines`;
  return levelIndices.map(index =>
    `${lines} > g.contourlevel:nth-of-type(${index + 1}) > path`);
}

/**
 * Which axis carries a trace's error bars, or `null` when it draws none.
 *
 * Plotly resolves an `error_x`/`error_y` container onto every trace that
 * could carry one, so the `visible` flag — not the container's presence — is
 * what says a chart drew intervals. A trace with both gets its vertical ones
 * read: a MAIDR error-bar layer carries one interval per sample, and the
 * vertical is the one a reader means by "the error bar".
 *
 * Lives here, beside the selector, because the two must agree: reading the
 * y bounds while highlighting `path.xerror` would announce one interval and
 * light up another.
 *
 * @param trace - The resolved plotly trace
 * @returns `'y'`, `'x'`, or null when neither axis draws an interval
 */
export function errorBarAxis(trace: PlotlyTrace): 'x' | 'y' | null {
  if (trace.error_y?.visible === true)
    return 'y';
  if (trace.error_x?.visible === true)
    return 'x';
  return null;
}

/**
 * Error-bar selector: the whip drawn at each sample.
 *
 * The `g.errorbar` group around it would be the tidier target — plotly emits
 * exactly one per sample, whether or not the sample got a whip — but the
 * whisker inside carries its own inline stroke, so a highlight clone of the
 * group would be recoloured on the group and repaint identically to the
 * original. The path itself is what can actually be seen highlighted.
 *
 * Plotly puts a bar-like trace's error bars straight into the trace group and
 * a scatter's into an `errorbars` group of their own, drawn under the line.
 *
 * Both are scoped to the one trace the layer describes rather than to the
 * panel. Two traces carrying intervals on one subplot is an ordinary chart —
 * a measurement against its control — and a panel-wide selector would give
 * both layers every whip on the panel. `ErrorBarTrace` withholds highlighting
 * outright when the elements do not match its samples, so the visual modality
 * would go silently missing for both.
 *
 * @param prefix     - The subplot prefix the trace is drawn in
 * @param gd         - The plotly graph div
 * @param traceIndex - The global index of the trace carrying the intervals
 * @returns The selector, or undefined when the trace draws no intervals
 */
function errorBarSelector(
  prefix: string,
  gd: PlotlyGraphDiv,
  traceIndex: number,
): string | undefined {
  const trace = gd._fullData?.[traceIndex];
  const axis = trace ? errorBarAxis(trace) : null;
  if (!trace || axis === null) {
    return undefined;
  }
  const whip = `g.errorbar > path.${axis}error`;
  if (trace.type === 'bar') {
    // Bar groups carry no uid class, so the trace is named by its position
    // among the panel's bar-layer traces — the count {@link barPointSelector}
    // is under, and histograms share that layer.
    const position = barLayerPosition(gd, traceIndex, trace) + 1;
    return `${prefix}.barlayer > g.trace.bars:nth-of-type(${position}) > ${whip}`;
  }
  return scatterTraceScope(prefix, trace, `.errorbars > ${whip}`);
}

/**
 * A bar-family trace's position among the ones plotly drew into the same
 * layer on the same panel, which is what a `nth-of-type` selector counts by.
 *
 * Histograms are counted alongside bars: plotly draws them through the bar
 * renderer and into the same `barlayer`, so one sitting before this trace
 * shifts its group. Funnels and waterfalls each count only their own kind,
 * because each has a layer to itself.
 *
 * @param gd         - The plotly graph div
 * @param traceIndex - The global index of the trace being selected
 * @param trace      - That trace, whose axes name the panel
 * @returns How many traces plotly drew into its layer before it, or -1 when
 *          the trace is not one the bar renderer draws
 */
function barLayerPosition(
  gd: PlotlyGraphDiv,
  traceIndex: number,
  trace: PlotlyTrace,
): number {
  const layer = BAR_FAMILY_LAYER[trace.type ?? ''];
  if (layer === undefined) {
    return -1;
  }

  const traces = gd._fullData ?? [];
  let position = 0;
  for (let i = 0; i < traceIndex; i++) {
    const other = traces[i];
    if (
      BAR_FAMILY_LAYER[other?.type ?? ''] === layer
      && other.visible !== false
      && other.visible !== 'legendonly'
      && (other.xaxis ?? 'x') === (trace.xaxis ?? 'x')
      && (other.yaxis ?? 'y') === (trace.yaxis ?? 'y')
    ) {
      position++;
    }
  }
  return position;
}

/**
 * Pie selector: the wedge paths of one pie trace, in drawing order.
 *
 * A pie has no axes, so plotly draws it in `.pielayer` rather than in a
 * `.subplot.xy` group — the prefix every other selector here is scoped by does
 * not exist for one. It also gives each pie a bare `<g class="trace">` with no
 * uid class (scatter's `trace{uid}` has no pie counterpart), so the only thing
 * distinguishing one pie from another on the same paper is its position among
 * them. Plotly orders those groups to match the traces it drew, skipping the
 * ones it did not, hence counting only the drawn pies before this one.
 */
function pieSelector(gd: PlotlyGraphDiv, traceIndex: number): string {
  const traces = gd._fullData ?? [];
  let drawnBefore = 0;
  for (let i = 0; i < traceIndex; i++) {
    if (isDrawnPie(traces[i])) {
      drawnBefore++;
    }
  }
  return `.pielayer > g.trace:nth-of-type(${drawnBefore + 1}) g.slice path.surface`;
}

/**
 * Whether a trace is a pie plotly put on the paper. A hidden or legend-only
 * trace gets no group in `.pielayer`, so it must not shift the count.
 */
/**
 * The trace types plotly draws into `g.boxlayer`, and so the ones that
 * occupy a slot a candlestick has to count past.
 *
 * A `go.Violin` draws into `g.violinlayer` and a scatter into
 * `g.scatterlayer`, so neither shifts the count — measured, not assumed.
 */
const BOXLAYER_TRACE_TYPES = new Set(['box', 'candlestick']);

/**
 * The marks of one candlestick or OHLC trace.
 *
 * Scoped three ways, each for a measured reason.
 *
 * **The subplot prefix excludes the rangeslider.** Plotly gives a candlestick
 * chart one *by default*, and it holds a complete second copy of the plot at
 * `g.infolayer > g.rangeslider-container > g.rangeslider-rangeplot`. For a
 * four-candle chart the old `.trace.boxes .box` matched **eight** elements,
 * so the index-to-element mapping was wrong for every candle and half the
 * highlights landed in the thumbnail. The duplicate's ancestor carries the
 * `xy` class but not `subplot`, so the prefix is what leaves it out.
 *
 * **The position picks this trace out of its layer.** A `go.Box` shares
 * `g.boxlayer` and draws its own `path.box`, so one box beside one
 * four-candle trace made `.trace.boxes path.box` match five. Counting
 * siblings is safe here in a way it is not for `.scatterlayer`, whose groups
 * are in fill z-order: measured with three interleaved traces, `boxlayer`
 * children follow `_fullData` order.
 *
 * The count comes from {@link drawnBefore}, once per type sharing the layer,
 * so a hidden trace does not take a slot — it draws no group, and counting it
 * would push its neighbours onto one that does not exist. Only traces on this
 * panel are counted, because each panel has a `boxlayer` of its own; a pie is
 * counted across the figure instead, since `pielayer` is figure-level.
 *
 * **`ohlc` is a different layer.** It draws into
 * `g.ohlclayer > g.trace.ohlc > path` rather than sharing the box machinery,
 * so a `boxlayer` selector matches nothing at all for it.
 *
 * @param gd         - The plotly graph div
 * @param traceIndex - The trace's index in `_fullData`
 * @param prefix     - The subplot prefix the trace is drawn in
 * @returns The selector for that trace's marks
 */
function candlestickSelector(
  gd: PlotlyGraphDiv,
  traceIndex: number,
  prefix: string,
): string {
  const isOhlc = gd._fullData?.[traceIndex]?.type === 'ohlc';
  const nth = isOhlc
    ? layerNthChild(gd, traceIndex, ['ohlc'])
    : boxLayerNthChild(gd, traceIndex);

  return isOhlc
    ? `${prefix}.ohlclayer > .trace.ohlc:nth-of-type(${nth}) > path`
    : `${prefix}.boxlayer > .trace.boxes:nth-of-type(${nth}) path.box`;
}

/**
 * A trace's 1-based position among the groups plotly drew into its panel's
 * `g.boxlayer`.
 *
 * Box and candlestick share that layer, so the count has to span both: a
 * candlestick declared first takes the first group, and a walk over boxes
 * alone would hand the box that follows the candlestick's group.
 *
 * @param gd         - The plotly graph div
 * @param traceIndex - The trace's index in `_fullData`
 * @returns Its 1-based position among the panel's boxlayer groups
 */
export function boxLayerNthChild(gd: PlotlyGraphDiv, traceIndex: number): number {
  return layerNthChild(gd, traceIndex, [...BOXLAYER_TRACE_TYPES]);
}

/**
 * A trace's 1-based position among the same-panel traces of the given types.
 *
 * `drawnBefore` counts one plotly type at a time, so a layer holding more than
 * one takes a call per type. Summing them is the whole count, because a trace
 * has exactly one type.
 *
 * @param gd         - The plotly graph div
 * @param traceIndex - The trace's index in `_fullData`
 * @param types      - The plotly trace types sharing the layer
 * @returns Its 1-based position among them
 */
function layerNthChild(
  gd: PlotlyGraphDiv,
  traceIndex: number,
  types: string[],
): number {
  const self = gd._fullData?.[traceIndex];
  const onThisPanel = (trace: PlotlyTrace): boolean =>
    trace.xaxis === self?.xaxis && trace.yaxis === self?.yaxis;

  return types.reduce(
    (total, type) => total + drawnBefore(gd, traceIndex, type, onThisPanel),
    0,
  ) + 1;
}

function isDrawnPie(trace: PlotlyTrace | undefined): boolean {
  return trace?.type === 'pie'
    && trace.visible !== false
    && trace.visible !== 'legendonly';
}

/**
 * How many traces of one plotly type were drawn before the given one.
 *
 * The pie's counting problem, generalised: every trace positioned by its own
 * domain shares one layer with its siblings and carries no class of its own,
 * so its position among the drawn ones is the only thing that picks it out.
 *
 * @param gd         - The plotly graph div
 * @param traceIndex - The global index of the trace being selected
 * @param type       - The plotly trace type sharing the layer
 * @param sameLayer  - Narrows the count to the traces sharing one layer, for a
 *                     family drawn once per subplot rather than once per paper
 * @returns How many traces of that type plotly drew before this one
 */
function drawnBefore(
  gd: PlotlyGraphDiv,
  traceIndex: number,
  type: string,
  sameLayer?: (trace: PlotlyTrace) => boolean,
): number {
  const traces = gd._fullData ?? [];
  let count = 0;
  for (let i = 0; i < traceIndex; i++) {
    const trace = traces[i];
    if (
      trace?.type === type
      && trace.visible !== false
      && trace.visible !== 'legendonly'
      && (sameLayer === undefined || sameLayer(trace))
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Hierarchy selector: every sector of one sunburst, icicle or treemap, in the
 * order plotly drew them.
 *
 * All three draw into `.{type}layer`, one `g.trace.{type}` per trace, and give
 * each sector a `g.slice` holding the `path.surface` that is the drawn shape.
 * A treemap's breadcrumb bar is deliberately not matched: its ancestors are
 * `g.pathbar` groups rather than slices, and they repeat nodes the reader has
 * already been given.
 *
 * The layer is counted through the same trick {@link pieSelector} uses, and
 * for the same reason — plotly hangs no uid class on these groups either.
 */
function hierarchySelector(gd: PlotlyGraphDiv, traceIndex: number): string | undefined {
  const type = gd._fullData?.[traceIndex]?.type;
  if (!type) {
    return undefined;
  }
  const position = drawnBefore(gd, traceIndex, type) + 1;
  return `.${type}layer > g.trace.${type}:nth-of-type(${position}) g.slice > path.surface`;
}

/**
 * Gauge selector: the bar plotly fills to the measure.
 *
 * The two shapes draw it differently — an angular dial fills an arc, a bullet
 * fills a rectangle — and each is the one element on the tile whose extent is
 * the reading, which is what a highlight should land on. The surrounding
 * background arc, the step bands and the threshold line are all context the
 * value is read against rather than the value itself.
 */
function gaugeSelector(gd: PlotlyGraphDiv, traceIndex: number): string {
  const trace = gd._fullData?.[traceIndex];
  const position = drawnBefore(gd, traceIndex, 'indicator') + 1;
  const bar = trace?.gauge?.shape === 'bullet'
    ? 'g.value-bullet > rect'
    : 'g.value-arc > path';
  return `.indicatorlayer > g.trace:nth-of-type(${position}) ${bar}`;
}

/**
 * Polar selectors: one per series, which is what a line-shaped layer needs.
 *
 * `LineTrace` pairs its series with its selectors by position, so a single
 * selector covering the whole layer would resolve to nothing on a chart with
 * more than one series. Plotly gives every scatter group a `trace{uid}`
 * compound class, so each series can be named directly; barpolar's groups
 * carry no uid and are counted within the subplot's `g.barlayer` instead.
 *
 * A uid that is not a usable class name — plotly generates safe ones, but an
 * author may set `uid` to anything — withdraws the whole list rather than
 * emitting a selector that would silently match nothing.
 *
 * @param series    - The layer's series, each with its position among the subplot's traces
 * @param subplotId - The polar subplot they are drawn on (`polar`, `polar2`, …)
 * @param isBar     - Whether these are barpolar traces rather than scatterpolar
 * @returns One selector per series, or undefined when none can be built
 */
export function polarSeriesSelectors(
  series: PolarSeries[],
  subplotId: string,
  isBar: boolean,
): string[] | undefined {
  const prefix = `.polarlayer > g.${subplotId} > g.frontplot`;

  if (isBar) {
    // Counted by the trace's position among the subplot's barpolar traces
    // rather than among the layer's series: plotly draws a group for a trace
    // whose values were all unusable too, so a dropped series still shifts
    // every group after it.
    return series.map(one =>
      `${prefix} > g.barlayer > g.trace:nth-of-type(${one.position + 1}) g.point > path`);
  }

  const selectors: string[] = [];
  for (const { trace } of series) {
    const uid = trace.uid;
    if (!uid || !/^[\w-]+$/.test(uid)) {
      return undefined;
    }
    selectors.push(`${prefix} > g.scatterlayer > g.trace.trace${uid} .point`);
  }
  return selectors;
}
