/**
 * CSS selectors for Vega-rendered SVG elements.
 *
 * Vega-Lite compiles to a Vega specification, which renders to SVG with
 * predictable class naming patterns. These helpers build the selectors
 * MAIDR uses for visual highlighting during keyboard navigation.
 *
 * SVG structure reference:
 *
 *   Single-view spec:
 *     g.{markClass}.role-mark.marks {childElement}
 *
 *   Layered / concat spec:
 *     g.{markClass}.role-mark.layer_{N}_marks {childElement}
 *
 * Where:
 *   - `markClass`     is the Vega CSS class for the mark (e.g. `mark-rect`).
 *   - `N`             is the zero-based layer index in the compiled spec.
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
 * Emits a CSS comma-selector covering BOTH the single-view (`.marks`)
 * and the layered (`.layer_N_marks`) DOM patterns. Vega-Lite expands
 * mark sugar (`mark.point: true` on lines, `mark.line: true` on areas,
 * etc.) into additional Vega layers at render time, so even a spec
 * with a single user-visible mark may produce a `.layer_0_marks`
 * group instead of `.marks`. Trying both patterns in the same
 * selector avoids having to detect each Vega expansion in the converter.
 *
 * `markGroupPrefix` scopes the mark-group class tokens to a composite
 * child. Vega-Lite compiles concat children to `concat_<i>_marks` /
 * `concat_<i>_layer_<j>_marks` classes, so callers pass `concat_<i>_`
 * to match them. Defaults to `''` for single-view and layered specs.
 */
export function buildSelector(
  mark: string,
  layerIndex: number,
  isLayered: boolean,
  markGroupPrefix = '',
): string {
  const cssClass = markToCssClass(mark);
  const childElement = markToChildElement(mark);
  const layeredClass = `${markGroupPrefix}layer_${layerIndex}_marks`;
  if (isLayered) {
    // Layered specs always render as `.layer_N_marks`; no fallback needed.
    return `g.${cssClass}.role-mark.${layeredClass} ${childElement}`;
  }
  // Single-view specs *usually* render as `.marks`, but Vega may emit
  // `.layer_0_marks` when mark sugar (e.g. `mark.point: true`) expands
  // into siblings. Cover both.
  return (
    `g.${cssClass}.role-mark.${markGroupPrefix}marks ${childElement}, `
    + `g.${cssClass}.role-mark.${layeredClass} ${childElement}`
  );
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
 *
 * `markGroupPrefix` scopes the mark-group class tokens to a composite
 * child (e.g. `concat_<i>_` for concat children). Defaults to `''`.
 */
export function buildLineSelectors(
  mark: string,
  seriesCount: number,
  layerIndex: number,
  isLayered: boolean,
  markGroupPrefix = '',
): string[] {
  const cssClass = markToCssClass(mark);
  const layeredClass = `${markGroupPrefix}layer_${layerIndex}_marks`;
  const selectors: string[] = [];
  for (let i = 0; i < seriesCount; i++) {
    if (isLayered) {
      // Layered specs put each user-visible layer in its own class.
      // Each layer typically has one `<path>` so first-of-type is fine;
      // when the layer itself contains color-encoded multi-series, the
      // caller's selectNthElement(sel, r) indexing still resolves them.
      selectors.push(`g.${cssClass}.role-mark.${layeredClass} > path`);
    } else {
      // Cover both DOM patterns Vega uses for a non-layered single mark:
      //   - `.marks` (single-series simple line)
      //   - `.layer_0_marks` (sugar-expanded sibling group, OR each of
      //     N sibling groups for color-encoded multi-series)
      // No `:nth-child(N)`: when the chart has N color-encoded series,
      // Vega creates N sibling groups each with exactly one `<path>`,
      // so `:nth-child(2)` etc. never match. The caller picks the rth
      // match in document order via Svg.selectNthElement.
      selectors.push(
        `g.${cssClass}.role-mark.${markGroupPrefix}marks > path, `
        + `g.${cssClass}.role-mark.${layeredClass} > path`,
      );
    }
  }
  return selectors;
}
