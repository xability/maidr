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
 * unreliable.  Subplot-level scoping is sufficient and matches
 * py-maidr's proven approach.
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

    // A pyramid is among these: it is a stacked bar chart whose two sides grow
    // opposite ways, drawn through the same renderer, so its bars are the same
    // elements in the same trace-by-trace order.
    case TraceType.BAR:
    case TraceType.HISTOGRAM:
    case TraceType.DODGED:
    case TraceType.STACKED:
    case TraceType.NORMALIZED:
    case TraceType.DIVERGING:
      return `${prefix}.trace.bars .point > path`;

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
    // renderer, down to the `trace bars` group class. Only the layer they sit
    // in differs, and scoping by it keeps them apart from an actual bar trace
    // sharing the panel.
    case TraceType.FUNNEL:
      return `${prefix}.funnellayer .trace.bars .point > path`;

    case TraceType.WATERFALL:
      return `${prefix}.waterfalllayer .trace.bars .point > path`;

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
      return errorBarSelector(prefix, traceData);

    case TraceType.BOX:
      return `${prefix}.trace.boxes .point > path`;

    case TraceType.HEATMAP:
      return `${prefix}.heatmaplayer image`;

    case TraceType.CANDLESTICK:
      // Candlestick reuses box plot rendering: boxlayer > trace.boxes > path.box
      return `${prefix}.trace.boxes .box`;

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
 */
function errorBarSelector(prefix: string, trace: PlotlyTrace | undefined): string | undefined {
  const axis = trace ? errorBarAxis(trace) : null;
  if (axis === null) {
    return undefined;
  }
  const group = trace?.type === 'bar'
    ? `${prefix}.trace.bars`
    : `${prefix}.trace.scatter .errorbars`;
  return `${group} > g.errorbar > path.${axis}error`;
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
