import type { BoxSelector, CandlestickSelector, SegmentedPoint } from '@type/grammar';
import type { VictoryLayerInfo } from './types';
import { Orientation } from '@type/grammar';

/**
 * Data-attribute prefix used to tag Victory-rendered SVG elements so that
 * MAIDR's `Svg.selectAllElements()` can reliably select them later.
 */
const ATTR_PREFIX = 'data-maidr-victory';

/**
 * Attribute stamped on each panel's root `<svg>` in multi-panel mode; its
 * value is the panel index. Emitted selectors use it as an ancestor segment
 * so one panel's selectors can never match another panel's marks, and
 * `MaidrSubplot.selector` targets it for subplot-level highlighting.
 */
export const PANEL_ATTR = `${ATTR_PREFIX}-panel`;

/**
 * True when an element is (or lives inside) a MAIDR-created hidden clone.
 *
 * MAIDR's `Svg` helpers stamp every highlight clone with `data-maidr-owned`
 * and insert it next to the original while a figure is focused. `cloneNode`
 * preserves `role` and every `data-maidr-victory-*` attribute, so clones are
 * otherwise indistinguishable from live Victory nodes — every DOM discovery
 * in this module must skip them (`closest` matches the element itself).
 */
function isMaidrOwned(el: Element): boolean {
  return el.closest('[data-maidr-owned]') !== null;
}

/**
 * Scans the container once for every element carrying a layer-tag attribute:
 * the flat single-panel names (`data-maidr-victory-<layer>`), the panel-scoped
 * multi-panel names (`data-maidr-victory-<panel>-<layer>`), and the named
 * box/candlestick part attributes. CSS attribute selectors cannot express
 * name-prefix matching, so an attribute-name scan (rather than an enumerated
 * selector list) keeps discovery unbounded in panel and layer count.
 *
 * The panel stamp ({@link PANEL_ATTR}) shares the prefix but is index-stable
 * and must never be treated as a layer tag, so it is excluded here.
 */
function findTaggedElements(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('*')).filter(el =>
    !isMaidrOwned(el)
    && Array.from(el.attributes).some(attr =>
      attr.name !== PANEL_ATTR && attr.name.startsWith(ATTR_PREFIX)));
}

/**
 * Builds a tag attribute name. In multi-panel mode the panel index is folded
 * into the name (`data-maidr-victory-<panel>-<suffix>`) so names stay unique
 * per panel; single-panel names keep the original flat form
 * (`data-maidr-victory-<suffix>`) for backward compatibility.
 */
function victoryAttr(panelIndex: number | null, suffix: string): string {
  return panelIndex === null
    ? `${ATTR_PREFIX}-${suffix}`
    : `${ATTR_PREFIX}-${panelIndex}-${suffix}`;
}

/**
 * Resolves the per-panel `<svg>` roots inside the container, in document
 * order (which matches the top-level `<VictoryChart>` children order, since
 * each standalone VictoryChart renders exactly one svg).
 *
 * Victory's `VictoryContainer` renders its svg with `role="img"`, so the
 * filter skips decorative user svgs (icons, etc.). If the filter yields fewer
 * svgs than expected (e.g. a Victory version drops the role), all svgs are
 * used as a fallback.
 *
 * MAIDR-owned hidden clones are excluded up front: while the figure is
 * focused, the core inserts a `data-maidr-owned` clone right after each
 * panel svg (with `role="img"` preserved), and counting those would bind
 * every panel after the first to the previous panel's clone during a
 * focused re-tag pass.
 */
export function resolvePanelSvgs(container: HTMLElement, expectedCount: number): SVGElement[] {
  const all = Array.from(container.querySelectorAll('svg')).filter(svg => !isMaidrOwned(svg));

  // Victory renders each chart svg inside a `div.VictoryContainer` wrapper —
  // the most precise signal, immune to user-supplied `role="img"` svgs
  // (icons, illustrations) sitting between panels.
  const containerSvgs = all.filter(
    svg => svg.parentElement?.classList.contains('VictoryContainer') ?? false,
  );
  if (containerSvgs.length === expectedCount)
    return containerSvgs;

  const roleImgSvgs = all.filter(svg => svg.getAttribute('role') === 'img');
  if (roleImgSvgs.length === expectedCount)
    return roleImgSvgs;

  return roleImgSvgs.length >= expectedCount ? roleImgSvgs : all;
}

/**
 * Returns all currently-tagged elements inside the container (across every
 * panel svg).
 *
 * Used by the adapter to detect when Victory has detached a tagged node (it
 * re-renders some marks after mount), so the tags can be re-applied to the
 * live nodes.
 */
export function getTaggedElements(container: HTMLElement): Element[] {
  return findTaggedElements(container);
}

/**
 * Removes all `data-maidr-victory-*` attributes from tagged elements inside
 * the container (across every panel svg). Must be called before re-tagging to
 * prevent stale attributes from accumulating across re-renders. Panel stamps
 * on the svg roots themselves are left intact — they are index-stable.
 */
export function clearTaggedElements(container: HTMLElement): void {
  for (const el of findTaggedElements(container)) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name !== PANEL_ATTR && attr.name.startsWith(ATTR_PREFIX)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/**
 * Finds the Victory data elements inside a container for a given layer,
 * tags them with a unique data attribute, and returns the CSS selector
 * that matches exactly those elements.
 *
 * Strategy:
 * 1. Victory renders each data component's elements with
 *    `role="presentation"` on the individual data shapes.
 * 2. We query for the expected SVG tag (e.g. `rect` for bars) that
 *    carries `role="presentation"`.
 * 3. We skip elements that belong to other layers by tracking which
 *    elements were already claimed.
 * 4. Each claimed element receives a `data-maidr-victory-<layerIndex>`
 *    attribute so MAIDR can select them deterministically.
 *
 * @remarks
 * This relies on Victory's `role="presentation"` attribute on data
 * elements, which is a stable Victory convention (tested with v37).
 * If Victory changes this convention, selector tagging will silently
 * degrade and highlighting will stop working (audio/text/braille are
 * unaffected).
 *
 * The emitted selectors are prefixed with `scope` (e.g. `#<containerId> `, or
 * `#<containerId> [data-maidr-victory-panel="i"] ` in multi-panel mode) so
 * that they cannot match another Victory chart's identically-indexed tags
 * wherever they are read, nor another panel's: the panels share the chart MAIDR
 * resolves them in. The per-element tag attributes only need to be unique
 * within their own container, which `scope` plus the panel-folded names
 * guarantee.
 *
 * @param svg        - The panel's root svg element
 * @param layer      - The extracted layer info
 * @param layerIndex - Numeric index for generating unique attribute names
 * @param claimed    - Set of elements already claimed by prior layers of the
 *                     same panel (must not be shared across panels)
 * @param scope      - Per-chart (and, in multi-panel mode, per-panel) CSS
 *                     scope prefix that names this panel's elements alone
 * @param panelIndex - Panel index in multi-panel mode; `null` keeps the
 *                     original single-panel attribute naming
 * @returns Whatever names this layer's marks: one CSS selector for a series
 *          the model can walk positionally, a `string[]` when the marks have
 *          to be named one by one, a `string[][]` grid naming each segment of
 *          a stack, or the structured selector a box or a candle needs.
 *          `undefined` if the elements could not be matched, in which case
 *          highlighting degrades gracefully.
 */
export function tagLayerElements(
  svg: SVGElement,
  layer: VictoryLayerInfo,
  layerIndex: number,
  claimed: Set<Element>,
  scope: string,
  panelIndex: number | null = null,
): string | string[] | string[][] | BoxSelector[] | CandlestickSelector | undefined {
  const attrName = victoryAttr(panelIndex, String(layerIndex));
  const { victoryType, data } = layer;

  // What was extracted decides the DOM shape before the component name does:
  // one Victory component can draw more than one chart type (a polar
  // VictoryBar is a coxcomb of wedges, a VictoryStack of areas is bands
  // rather than one mark per datum), and the marks differ accordingly.
  if (data.kind === 'area') {
    // Victory's Area primitive renders the same single <path
    // role="presentation"> its Line primitive does, closed along the baseline.
    return tagLineElements(svg, layer, attrName, claimed, scope);
  }
  if (data.kind === 'stackedArea') {
    return tagStackedAreaElements(svg, data.points.length, attrName, claimed, scope);
  }
  if (data.kind === 'errorBar') {
    return tagErrorBarElements(svg, layer.dataCount, attrName, claimed, scope);
  }
  if (data.kind === 'polarArea') {
    return tagPolarWedgeElements(svg, layer.dataCount, attrName, claimed, scope);
  }

  // Line charts: single <path> representing the full series.
  if (victoryType === 'VictoryLine') {
    return tagLineElements(svg, layer, attrName, claimed, scope);
  }

  // Candlestick: each candle is a <g> with one body <rect> and two wick
  // <line>s — tag them as a structured CandlestickSelector.
  if (victoryType === 'VictoryCandlestick') {
    return tagCandlestickElements(svg, attrName, claimed, scope, panelIndex);
  }

  // Box plot: component-grouped rects (q1/q3 halves), median lines, and
  // whisker line-pairs with no semantic classes — classify by geometry and
  // tag as a per-box BoxSelector[].
  if (victoryType === 'VictoryBoxPlot') {
    const horizontal = layer.orientation === Orientation.HORIZONTAL;
    return tagBoxElements(svg, attrName, claimed, scope, panelIndex, horizontal);
  }

  // Discrete-element charts: one <path role="presentation"> per data point.
  // VictoryBar (plain or waterfall), VictoryHistogram, VictoryScatter (plain
  // or dot plot), VictoryStack (stacked or diverging), and VictoryPie
  // all render their data points as <path> elements — Victory's Bar primitive
  // renders a <path> (with arc commands for corner radius), never a <rect>,
  // and its Slice primitive renders the d3-shape arc path for one wedge.
  // Pie wedges come out in data order, which is the index alignment a pie
  // layer's selectors have to satisfy.
  return tagDiscreteElements(svg, layer, attrName, claimed, scope);
}

/**
 * Tags discrete SVG elements (one <path> per data point) for bar,
 * histogram, scatter, and stacked charts.
 */
function tagDiscreteElements(
  svg: SVGElement,
  layer: VictoryLayerInfo,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
): string | string[] | string[][] | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  // Victory renders exactly one element per data point.
  // Take the first `dataCount` unclaimed elements.
  const matched = candidates.slice(0, layer.dataCount);

  if (matched.length !== layer.dataCount) {
    return undefined;
  }
  if (layer.data.kind === 'segmented' && !stackPairsWithBars(layer.data.points, matched.length)) {
    return undefined;
  }

  for (const el of matched) {
    // A reversed layer names its marks one by one below, and the shared
    // attribute would then be a second, wrongly-ordered way to select them.
    if (!layer.categoriesReversed) {
      el.setAttribute(attrName, '');
    }
    claimed.add(el);
    // Scatter points are <path> elements positioned by their `d` moveto, so
    // they expose no x/y or cx/cy. Stamp cx/cy from the path centre so MAIDR's
    // ScatterTrace.groupSvgElements (which groups points by cx/cy) can locate
    // them. Ignored by SVG path rendering; inherited by the highlight clones.
    //
    // Keyed on what was extracted rather than on the component: a `VictoryScatter`
    // over categories is a dot plot, read by the bar trace, which locates its
    // marks by position in the selector's result and needs no coordinates.
    if (layer.data.kind === 'scatter') {
      stampPathCenter(el);
    }
  }

  // A layer read in the drawn order of an inverted axis no longer lines up
  // with the marks, which Victory renders in data order either way (#1018).
  // One shared attribute resolves positionally and would pair point 0 with the
  // mark at the far end, so each mark is named instead -- by the position it
  // now holds in the payload, counted from the other end. Distinct attributes
  // rather than `:nth-child`, so the list is order-independent and #1004's
  // descending-only rule does not apply.
  if (layer.categoriesReversed) {
    // `matched` is in DOM order, which is data order; the payload was turned
    // round, so payload position i is the mark standing at the other end.
    return matched.map((_, i) => {
      const own = `${attrName}-${i}`;
      matched[matched.length - 1 - i].setAttribute(own, '');
      return `${scope}[${own}]`;
    });
  }

  // A stack is read bottom segment first, its series in the order they are
  // declared, but `VictoryStack` paints them the other way round. The shared
  // attribute is walked series by series in document order, which paired
  // every series with another series' segments of the same bars, so each
  // segment is named in a grid instead. (Stacks are not in
  // `REVERSIBLE_KINDS`, so no stack reaches the reversed branch above.)
  if (layer.data.kind === 'segmented') {
    return tagStackSegments(matched, layer.data.points, attrName, scope);
  }

  return `${scope}[${attrName}]`;
}

/**
 * Whether a stack's bars pair one to one with its points.
 *
 * `VictoryStack` fills every series out to the categories of all of them,
 * drawing a bar of no height for each category a series lacks (victory-stack
 * `fillData`). A stack whose series do not hold the same categories in the
 * same order therefore draws bars that are no point of the layer, and no
 * position pairs the bars with the points: such a stack is left without a
 * highlight rather than outlined on other segments.
 *
 * @param series - The layer's points, one row per series
 * @param bars   - How many bars were matched for the layer
 * @returns True when every series has one bar per category, in step
 */
function stackPairsWithBars(series: SegmentedPoint[][], bars: number): boolean {
  const categories = (series[0] ?? []).map(point => String(point.x));
  return bars === series.length * categories.length
    && series.every(row => row.length === categories.length
      && row.every((point, col) => String(point.x) === categories[col]));
}

/**
 * Names each segment of a stacked bar layer, as a `[series][category]` grid
 * in payload order.
 *
 * `VictoryStack` reverses the render order of its children so the topmost
 * series paints last, which puts the series in the DOM back to front, each
 * one's bars in data order: the reversal {@link tagStackedAreaElements} undoes
 * for the bands of a stacked area.
 *
 * @param bars     - The layer's bars, in document order
 * @param series   - The layer's points, one row per series, bottom first
 * @param attrName - The layer's tracking attribute name
 * @param scope    - Per-chart (and per-panel) CSS scope prefix
 * @returns One selector per segment, each matching that segment alone
 */
function tagStackSegments(
  bars: Element[],
  series: SegmentedPoint[][],
  attrName: string,
  scope: string,
): string[][] {
  const grid = series.map(() => new Array<string>());
  let next = 0;
  for (let row = series.length - 1; row >= 0; row--) {
    for (let col = 0; col < series[row].length; col++) {
      const segmentAttr = `${attrName}-segment-${row}-${col}`;
      bars[next++].setAttribute(segmentAttr, '');
      grid[row].push(`${scope}[${segmentAttr}]`);
    }
  }
  return grid;
}

/**
 * Stamps `cx`/`cy` attributes on a Victory scatter `<path>`, derived from the
 * initial absolute moveto in its `d` attribute (e.g. `M 74, 226 …`).
 *
 * Victory draws each scatter marker as a `<path>` whose centre is the first
 * `M` coordinate; it has no `x`/`y` or `cx`/`cy` of its own. MAIDR's scatter
 * grouping reads `cx`/`cy`, so stamping them here is what enables highlighting.
 * `cx`/`cy` have no effect on `<path>` rendering, so the marker is unchanged.
 */
function stampPathCenter(path: Element): void {
  const d = path.getAttribute('d') ?? '';
  const match = d.match(/M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
  if (!match) {
    return;
  }
  path.setAttribute('cx', match[1]);
  path.setAttribute('cy', match[2]);
}

/**
 * Tags the path element for a VictoryLine layer.
 *
 * Victory renders a single `<path>` with `role="presentation"` for
 * the line. MAIDR's line trace parses the `d` attribute to derive
 * individual point positions.
 */
function tagLineElements(
  svg: SVGElement,
  layer: VictoryLayerInfo,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
): string | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  if (candidates.length === 0)
    return undefined;

  // Heuristic: pick the first path whose `d` attribute contains enough
  // SVG commands to plausibly represent the data points.
  for (const candidate of candidates) {
    const d = candidate.getAttribute('d') ?? '';
    const commandCount = (d.match(/[MLCQTSA]/gi) ?? []).length;
    if (commandCount >= layer.dataCount) {
      candidate.setAttribute(attrName, '');
      claimed.add(candidate);
      return `${scope}[${attrName}]`;
    }
  }

  // Fallback: use the first unclaimed path.
  const fallback = candidates[0];
  fallback.setAttribute(attrName, '');
  claimed.add(fallback);
  return `${scope}[${attrName}]`;
}

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

/**
 * Tags the band `<path>`s of a stacked-area layer — one selector per band.
 *
 * `VictoryStack` reverses the render order of its children so the topmost band
 * paints last, which puts the bands in the DOM back to front. The emitted
 * selectors are ordered to match the extracted bands instead, since an area
 * trace reads its series in the order the payload lists them and would
 * otherwise highlight one band while announcing another.
 *
 * @param svg       - The panel's root svg element
 * @param bandCount - Number of bands the layer extracted
 * @param attrName  - The layer's tracking attribute name
 * @param claimed   - Elements already claimed by prior layers of this panel
 * @param scope     - Per-chart (and per-panel) CSS scope prefix
 * @returns One selector per band, or undefined when the bands were not found
 */
function tagStackedAreaElements(
  svg: SVGElement,
  bandCount: number,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
): string[] | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  if (candidates.length < bandCount) {
    return undefined;
  }

  const paths = candidates.slice(0, bandCount);
  const selectors: string[] = [];

  for (let band = 0; band < bandCount; band++) {
    const element = paths[bandCount - 1 - band];
    const bandAttr = `${attrName}-band-${band}`;
    element.setAttribute(attrName, '');
    element.setAttribute(bandAttr, '');
    claimed.add(element);
    selectors.push(`${scope}[${bandAttr}]`);
  }

  return selectors;
}

// ---------------------------------------------------------------------------
// Polar
// ---------------------------------------------------------------------------

/**
 * Tags the wedge `<path>`s of a polar `VictoryBar` layer.
 *
 * A polar chart's axis is itself a `<path role="presentation">` — a circle
 * drawn from two arcs — and it renders before or after the marks depending on
 * where the axis component sits among the chart's children, so the plain
 * "first N presentation paths" rule can hand back the axis as data. Victory
 * translates every polar mark to the chart origin and leaves the axis
 * untransformed, which tells the two apart whichever order they arrive in.
 *
 * @param svg       - The panel's root svg element
 * @param dataCount - Number of wedges the layer extracted
 * @param attrName  - The layer's tracking attribute name
 * @param claimed   - Elements already claimed by prior layers of this panel
 * @param scope     - Per-chart (and per-panel) CSS scope prefix
 * @returns A CSS selector matching the wedges, or undefined when not found
 */
function tagPolarWedgeElements(
  svg: SVGElement,
  dataCount: number,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
): string | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"][transform]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  const matched = candidates.slice(0, dataCount);
  if (matched.length !== dataCount) {
    return undefined;
  }

  for (const element of matched) {
    element.setAttribute(attrName, '');
    claimed.add(element);
  }

  return `${scope}[${attrName}]`;
}

// ---------------------------------------------------------------------------
// Error bar
// ---------------------------------------------------------------------------

/**
 * Tags the group of lines Victory draws for each sample of a VictoryErrorBar
 * layer.
 *
 * Victory draws each sample as a `<g>` holding up to four `<line>`s: two caps
 * (`data-type="border-*"`) and two whiskers running out from the estimate
 * (`data-type="cross-*"`). Nothing else in a Victory svg carries `data-type`,
 * so it is what separates these from an axis rule or a box plot's whiskers,
 * and grouping by the parent `<g>` recovers one group per sample.
 *
 * One element per sample is exactly what MAIDR's error bar trace asks for: it
 * highlights the same element for the estimate and for both bounds, because a
 * chart draws one whip per sample rather than one mark per bound. The group is
 * that whip, and a named group is outlined through every line it holds: both
 * whiskers and both caps. Tagging the first whisker alone outlined the half of
 * the interval above the estimate, and never the bound below it. Every line of
 * the sample is claimed so a sibling layer that classifies bare `<line>`s
 * cannot pick them up.
 *
 * @param svg       - The panel's root svg element
 * @param dataCount - Number of samples the layer extracted
 * @param attrName  - The layer's tracking attribute name
 * @param claimed   - Elements already claimed by prior layers of this panel
 * @param scope     - Per-chart (and per-panel) CSS scope prefix
 * @returns A CSS selector matching one group per sample, or undefined
 */
function tagErrorBarElements(
  svg: SVGElement,
  dataCount: number,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
): string | undefined {
  const whiskers = Array.from(
    svg.querySelectorAll('line[data-type^="cross-"]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  // A Set keeps insertion order, so the samples come out in document order.
  const bySample = new Set<Element>();
  for (const whisker of whiskers) {
    if (whisker.parentElement) {
      bySample.add(whisker.parentElement);
    }
  }

  const samples = Array.from(bySample).slice(0, dataCount);
  if (samples.length !== dataCount) {
    return undefined;
  }

  for (const sample of samples) {
    sample.setAttribute(attrName, '');
    for (const line of Array.from(sample.querySelectorAll('line'))) {
      claimed.add(line);
    }
  }

  return `${scope}[${attrName}]`;
}

// ---------------------------------------------------------------------------
// Candlestick
// ---------------------------------------------------------------------------

/**
 * Tags the elements of a VictoryCandlestick layer.
 *
 * Victory renders each candle as a `<g role="presentation">` containing one
 * `<rect>` (the open/close body) and two `<line>` wicks. The wick with the
 * smaller mid-y is the high (upper) wick; the larger is the low (lower) wick.
 *
 * Returns a {@link CandlestickSelector}; MAIDR's Candlestick trace derives the
 * open/close/volatility highlights from the body + wicks.
 */
function tagCandlestickElements(
  svg: SVGElement,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
  panelIndex: number | null,
): CandlestickSelector | undefined {
  const bodyAttr = victoryAttr(panelIndex, 'cbody');
  const highAttr = victoryAttr(panelIndex, 'chigh');
  const lowAttr = victoryAttr(panelIndex, 'clow');

  const bodies = Array.from(
    svg.querySelectorAll('rect[role="presentation"]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  if (bodies.length === 0) {
    return undefined;
  }

  for (const body of bodies) {
    tag(body, attrName, bodyAttr, claimed);

    const group = body.parentElement;
    if (!group) {
      continue;
    }
    const wicks = Array.from(group.querySelectorAll('line[role="presentation"]'))
      .filter(line => !isMaidrOwned(line))
      .map(line => ({ line, y: lineMidY(line) }))
      .filter((w): w is { line: Element; y: number } => w.y !== null)
      .sort((a, b) => a.y - b.y);

    // Smaller mid-y = high (upper) wick; larger = low (lower) wick.
    if (wicks.length >= 1) {
      tag(wicks[0].line, attrName, highAttr, claimed);
    }
    if (wicks.length >= 2) {
      tag(wicks[wicks.length - 1].line, attrName, lowAttr, claimed);
    }
  }

  return {
    body: `${scope}[${bodyAttr}]`,
    wickHigh: `${scope}[${highAttr}]`,
    wickLow: `${scope}[${lowAttr}]`,
  };
}

// ---------------------------------------------------------------------------
// Box plot
// ---------------------------------------------------------------------------

/**
 * Tags the elements of a VictoryBoxPlot layer.
 *
 * Victory renders boxes as component-grouped siblings with no semantic
 * classes: two `<rect>`s per box (the halves either side of the median), a
 * median `<line>`, and whisker `<line>` pairs (a stem along the box and a cap
 * across it). We classify by geometry, measured in each box's own terms (see
 * {@link BoxSpan}), so a box drawn on its side reads as an upright one does:
 *   - Group rects by centre across the boxes → one box per bucket; the half
 *     lower in value is q1, the higher q3. Their shared edge is the median.
 *   - Among the lines drawn across a box, within its breadth: one inside the
 *     box is the median; beyond its upper end is the max cap; beyond its lower
 *     end is the min cap. (Whisker stems, which run along it, are ignored.)
 *
 * Only upright boxes were measured until this read `horizontal`. On their
 * side, the two halves of a box sit side by side rather than one above the
 * other, so a box's halves came out in buckets of one and the layer had no
 * highlight at all.
 *
 * Returns one {@link BoxSelector} per box, in data order. Unmatched sections
 * are emitted as selectors that match nothing, so highlighting degrades
 * gracefully per section rather than mis-highlighting. Two boxes whose
 * centres round to the same pixel, upright or on their side, share a bucket
 * of four rects, and the layer is then left without a highlight rather than
 * outlined on the wrong box.
 */
function tagBoxElements(
  svg: SVGElement,
  attrName: string,
  claimed: Set<Element>,
  scope: string,
  panelIndex: number | null,
  horizontal: boolean,
): BoxSelector[] | undefined {
  const boxIndexAttr = victoryAttr(panelIndex, 'bidx');
  const boxPartAttr = victoryAttr(panelIndex, 'bpart');

  const rects = Array.from(
    svg.querySelectorAll('rect[role="presentation"]'),
  ).filter(el => !claimed.has(el) && !isMaidrOwned(el));

  // Each box is two rects (q1/q3 halves); bail if the shape is unexpected.
  if (rects.length === 0 || rects.length % 2 !== 0) {
    return undefined;
  }

  // Group rects by rounded centre across the boxes → one bucket per box.
  const byCentre = new Map<number, { rect: Element; span: BoxSpan }[]>();
  for (const rect of rects) {
    const span = rectSpan(rect, horizontal);
    if (span === null) {
      return undefined;
    }
    const centre = Math.round((span.acrossFrom + span.acrossTo) / 2);
    const bucket = byCentre.get(centre);
    if (bucket) {
      bucket.push({ rect, span });
    } else {
      byCentre.set(centre, [{ rect, span }]);
    }
  }

  const boxCentres = Array.from(byCentre.keys()).sort((a, b) => a - b);
  const crossLines = Array.from(svg.querySelectorAll('line[role="presentation"]'))
    .filter(el => !claimed.has(el) && !isMaidrOwned(el))
    .map(line => ({ line, span: lineSpan(line, horizontal) }))
    .filter((cross): cross is { line: Element; span: BoxSpan } =>
      cross.span !== null && runsAcross(cross.span));

  const selectors: BoxSelector[] = [];

  for (let i = 0; i < boxCentres.length; i++) {
    const bucket = byCentre.get(boxCentres[i]);
    if (!bucket || bucket.length !== 2) {
      return undefined;
    }

    // The half lower in value is q1, the higher q3.
    bucket.sort((a, b) => a.span.valueFrom - b.span.valueFrom);
    const [q1, q3] = bucket;
    const low = q1.span.valueFrom;
    const high = q3.span.valueTo;

    tagBoxPart(q1.rect, attrName, boxIndexAttr, boxPartAttr, i, 'q1', claimed);
    tagBoxPart(q3.rect, attrName, boxIndexAttr, boxPartAttr, i, 'q3', claimed);

    for (const { line, span } of crossLines) {
      if (span.acrossFrom < q1.span.acrossFrom - 2 || span.acrossTo > q1.span.acrossTo + 2) {
        continue;
      }
      const at = (span.valueFrom + span.valueTo) / 2;
      if (at >= low - 1 && at <= high + 1) {
        tagBoxPart(line, attrName, boxIndexAttr, boxPartAttr, i, 'q2', claimed); // median, inside the box
      } else if (at > high) {
        tagBoxPart(line, attrName, boxIndexAttr, boxPartAttr, i, 'max', claimed); // cap beyond the upper end
      } else if (at < low) {
        tagBoxPart(line, attrName, boxIndexAttr, boxPartAttr, i, 'min', claimed); // cap beyond the lower end
      }
    }

    const sel = (part: string): string => `${scope}[${boxIndexAttr}="${i}"][${boxPartAttr}="${part}"]`;
    selectors.push({
      lowerOutliers: [],
      upperOutliers: [],
      min: sel('min'),
      max: sel('max'),
      iq: sel('q1'), // harmless: direct q1/q3 below bypass iq-edge derivation
      q1: sel('q1'),
      q3: sel('q3'),
      q2: sel('q2'),
    });
  }

  return selectors.length > 0 ? selectors : undefined;
}

/**
 * Where a box plot mark lies, in its box's own terms: `value` grows with the
 * value the mark is drawn at, and `across` with the order of the data the
 * boxes are drawn from.
 *
 * An upright box's values run up the page, where screen y falls, and Victory
 * draws upright boxes left to right in data order. A box on its side runs its
 * values rightward, and Victory stacks those boxes from the bottom up. So
 * `value` is screen y negated and `across` is x for the first, and the other
 * way round for the second.
 */
interface BoxSpan {
  valueFrom: number;
  valueTo: number;
  acrossFrom: number;
  acrossTo: number;
}

/**
 * A screen-space box as a {@link BoxSpan}.
 *
 * @param left       - Its smallest x
 * @param right      - Its largest x
 * @param top        - Its smallest screen y
 * @param bottom     - Its largest screen y
 * @param horizontal - Whether the boxes are drawn on their side
 * @returns The same extent in the box's own terms
 */
function boxSpan(left: number, right: number, top: number, bottom: number, horizontal: boolean): BoxSpan {
  return horizontal
    ? { valueFrom: left, valueTo: right, acrossFrom: -bottom, acrossTo: -top }
    : { valueFrom: -bottom, valueTo: -top, acrossFrom: left, acrossTo: right };
}

/** The {@link BoxSpan} of a `<rect>`, or null when its geometry is absent. */
function rectSpan(rect: Element, horizontal: boolean): BoxSpan | null {
  const x = num(rect.getAttribute('x'));
  const y = num(rect.getAttribute('y'));
  const width = num(rect.getAttribute('width'));
  const height = num(rect.getAttribute('height'));
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  return boxSpan(x, x + width, y, y + height, horizontal);
}

/** The {@link BoxSpan} of a `<line>`, or null when its endpoints are absent. */
function lineSpan(line: Element, horizontal: boolean): BoxSpan | null {
  const x1 = num(line.getAttribute('x1'));
  const x2 = num(line.getAttribute('x2'));
  const y1 = num(line.getAttribute('y1'));
  const y2 = num(line.getAttribute('y2'));
  if (x1 === null || x2 === null || y1 === null || y2 === null) {
    return null;
  }
  return boxSpan(Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2), horizontal);
}

/**
 * True when a line runs across the boxes rather than along their values: a
 * cap or a median, not a whisker stem.
 */
function runsAcross(span: BoxSpan): boolean {
  return span.valueTo - span.valueFrom <= span.acrossTo - span.acrossFrom;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parses a numeric attribute value, returning null when absent/NaN. */
function num(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Stamps the tracking attribute plus a part attribute on an element. */
function tag(el: Element, attrName: string, partAttr: string, claimed: Set<Element>): void {
  el.setAttribute(attrName, '');
  el.setAttribute(partAttr, '');
  claimed.add(el);
}

/** Stamps a box element with its box index and section part. */
function tagBoxPart(
  el: Element,
  attrName: string,
  boxIndexAttr: string,
  boxPartAttr: string,
  boxIndex: number,
  part: string,
  claimed: Set<Element>,
): void {
  el.setAttribute(attrName, '');
  el.setAttribute(boxIndexAttr, String(boxIndex));
  el.setAttribute(boxPartAttr, part);
  claimed.add(el);
}

/** Returns the mid-point y of a `<line>`, or null if its endpoints are absent. */
function lineMidY(line: Element): number | null {
  const y1 = num(line.getAttribute('y1'));
  const y2 = num(line.getAttribute('y2'));
  if (y1 === null || y2 === null) {
    return null;
  }
  return (y1 + y2) / 2;
}
