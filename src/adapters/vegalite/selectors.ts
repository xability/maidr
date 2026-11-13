/**
 * CSS selectors for Vega-rendered SVG elements.
 *
 * Vega-Lite compiles to a Vega specification, which renders to SVG with
 * predictable class naming patterns. These helpers build the selectors
 * MAIDR uses for visual highlighting during keyboard navigation.
 *
 * SVG structure reference:
 *
 *   g.{markClass}.role-mark.{marks} {childElement}
 *
 * Where:
 *   - `markClass`     is the Vega CSS class for the mark (e.g. `mark-rect`).
 *   - `marks`         is the compiled name of the mark group: `marks` for a
 *                     single view, `layer_{N}_marks` for a layer, and so on,
 *                     as `names.ts` gives them.
 *   - `childElement`  is `path` for most marks, `line` for `rule`.
 */

/**
 * Map a Vega-Lite mark type to the Vega CSS class used in the rendered SVG.
 *
 * Vega-Lite marks are not Vega marks: the compiler rewrites several of them
 * (a `tick` is a narrow Vega `rect`), and a **composite** mark expands into
 * a group per part, of which only one carries the values a reader
 * navigates. That part is what this names — the whip of an `errorbar`, the
 * band of an `errorband` — so the class returned is the one that holds one
 * element per sample.
 */
export function markToCssClass(mark: string): string {
  switch (mark) {
    case 'bar':
    case 'rect':
      return 'mark-rect';
    case 'line':
      return 'mark-line';
    case 'area':
    case 'errorband':
      return 'mark-area';
    case 'point':
    case 'circle':
    case 'square':
      return 'mark-symbol';
    // Vega has no `tick` mark. Vega-Lite compiles one to a thin `rect`,
    // so `mark-tick` — which this returned until the dot plot work needed
    // a tick to highlight — matched nothing in any rendered chart.
    case 'tick':
      return 'mark-rect';
    case 'boxplot':
      return 'mark-rect';
    // Vega has no `geoshape` mark either: Vega-Lite compiles one to a Vega
    // `shape` mark, which renders as `mark-shape`. The default branch's
    // `mark-geoshape` matches nothing in a rendered map, which would cost a
    // choropleth its highlighting without costing it anything else.
    case 'geoshape':
      return 'mark-shape';
    case 'errorbar':
      return 'mark-rule';
    default:
      return `mark-${mark}`;
  }
}

/**
 * The SVG element Vega draws one of each mark's instances as.
 *
 * Vega's SVG renderer gives `rule` marks — and the `errorbar` whip, which
 * is a rule — a `<line>` each, and a `text` mark a `<text>` each, while
 * every other mark this adapter reaches is drawn as a `<path>`. Selecting
 * the wrong tag matches nothing, which costs the layer its highlighting
 * without costing it anything else, so the failure is invisible from every
 * other channel.
 *
 * `text` reached here for the first time in #1124, which gave the mark a
 * trace type; before that `buildSelector` was never called with it, and the
 * default branch's `<path>` was a guess nothing exercised. What it renders
 * as is not in doubt — `facets.ts` reads a facet's header out of
 * `g.mark-text.role-title-text text`.
 */
function markToChildElement(mark: string): string {
  if (mark === 'rule' || mark === 'errorbar')
    return 'line';
  if (mark === 'text')
    return 'text';
  return 'path';
}

/**
 * Build a single-element CSS selector for a Vega mark group.
 *
 * Used for marks where each datum produces one DOM element
 * (bar, scatter, heatmap, box, histogram).
 *
 * Emits a CSS comma-selector covering every name the mark group can have.
 * Vega-Lite expands mark sugar (`mark.point: true` on lines, `mark.line:
 * true` on areas, etc.) into additional Vega layers at render time, so even
 * a single view with one user-visible mark may draw it a level down, under
 * `layer_0_marks` rather than `marks` (`markViews` in `names.ts`). Trying both names
 * in the same selector avoids having to detect each Vega expansion in the
 * converter.
 *
 * @param mark - The Vega-Lite mark
 * @param marks - The compiled names of the group its elements are drawn in
 * @returns The selector
 */
export function buildSelector(mark: string, marks: readonly string[]): string {
  const cssClass = markToCssClass(mark);
  const childElement = markToChildElement(mark);
  return marks.map(name => `g.${cssClass}.role-mark.${name} ${childElement}`).join(', ');
}

/**
 * Name the group a Vega mark's elements are drawn in, and the element each
 * one is drawn as.
 *
 * Vega draws a mark's items as the children of its group, one element each,
 * in the order of the rows they are drawn from, so the row at a position is
 * the group's child at that position. The groups are the ones
 * {@link buildSelector} names the elements under.
 *
 * @param mark - The Vega-Lite mark
 * @param marks - The compiled names of the group its elements are drawn in
 * @returns The group, as a selector list naming it under each name it can
 * have, and the element's tag
 */
export function buildMarkGroup(mark: string, marks: readonly string[]): { marks: string; element: string } {
  const cssClass = markToCssClass(mark);
  return {
    marks: marks.map(name => `g.${cssClass}.role-mark.${name}`).join(', '),
    element: markToChildElement(mark),
  };
}

/**
 * Build per-series CSS selectors for line and area charts.
 *
 * Vega's render shape depends on whether multi-series come from a
 * user-authored layered spec (`alt.layer(...)` / `c1 + c2`) or from a
 * single mark with a `color` encoding (Vega's typical multi-series case):
 *
 *   - **Layered spec**: each series lives in its own `.layer_N_marks`
 *     class, e.g. `.layer_0_marks`, `.layer_1_marks`. Per-series
 *     addressing is by class.
 *
 *   - **Color-encoded multi-series in one mark**: Vega emits N sibling
 *     `<g class="mark-line role-mark layer_0_marks">` groups (NOT
 *     `.marks`), each containing exactly one `<path>`. All groups share
 *     the same class chain, so CSS `:nth-child(N)` cannot distinguish
 *     them and `:nth-of-type(N)` would also count unrelated `<g>`
 *     siblings (axes, legend). Per-series addressing must be done at
 *     the JS layer by indexing `querySelectorAll(...)` results in
 *     document order.
 *
 *   - **Single-series**: one `<path>` in either `.marks` or
 *     `.layer_0_marks` depending on whether mark sugar (`mark.point: true`,
 *     `mark.line: true`) caused Vega to expand into siblings.
 *
 * For ALL non-layered cases, this function emits N copies of the same
 * selector matching every line `<path>` under any line-mark group; the
 * caller (`LineTrace.mapViaPathParsing`) is expected to resolve the Nth
 * series via document-order indexing (`Svg.selectNthElement(sel, r)`).
 * No `:nth-child(N)`: when the chart has N color-encoded series, Vega
 * creates N sibling groups each with exactly one `<path>`, so
 * `:nth-child(2)` etc. never match.
 *
 * A line that draws an overlay -- points on a line, a line along an area,
 * whether its mark def or the chart's `config` turns them on -- is turned by
 * Vega-Lite into a layer of its own, the path first
 * (`normalize/pathoverlay.js`): the path is then one level down, under
 * `layer_<i>_layer_0_marks`, and nothing is named `layer_<i>_marks`. Both
 * names are listed (`markViews` in `names.ts`). A layer is drawn under one of them
 * only, since a layer is either a unit, named `layer_<i>`, or a layer of its
 * own, whose children are named `layer_<i>_layer_<j>`.
 *
 * @param mark - The Vega-Lite mark
 * @param seriesCount - How many series the layer draws
 * @param marks - The compiled names of the group its paths are drawn in
 * @returns One selector per series
 */
export function buildLineSelectors(mark: string, seriesCount: number, marks: readonly string[]): string[] {
  const cssClass = markToCssClass(mark);
  const selector = marks.map(name => `g.${cssClass}.role-mark.${name} > path`).join(', ');
  return Array.from({ length: seriesCount }, () => selector);
}
