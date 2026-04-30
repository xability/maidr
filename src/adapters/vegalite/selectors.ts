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
 *   - `childElement`  is `path` for most marks, `line` for `tick`.
 */

/**
 * Map a Vega-Lite mark type to the Vega CSS class used in the rendered SVG.
 */
export function markToCssClass(mark: string): string {
  switch (mark) {
    case 'bar':
    case 'rect':
      return 'mark-rect';
    case 'line':
      return 'mark-line';
    case 'area':
      return 'mark-area';
    case 'point':
    case 'circle':
    case 'square':
      return 'mark-symbol';
    case 'tick':
      return 'mark-tick';
    case 'boxplot':
      return 'mark-rect';
    default:
      return `mark-${mark}`;
  }
}

/**
 * Build a single-element CSS selector for a Vega mark group.
 *
 * Used for marks where each datum produces one DOM element
 * (bar, scatter, heatmap, box, histogram).
 */
export function buildSelector(
  mark: string,
  layerIndex: number,
  isLayered: boolean,
): string {
  const cssClass = markToCssClass(mark);
  const childElement = mark === 'tick' ? 'line' : 'path';
  const marksClass = isLayered ? `layer_${layerIndex}_marks` : 'marks';
  return `g.${cssClass}.role-mark.${marksClass} ${childElement}`;
}

/**
 * Build per-series CSS selectors for line and area charts.
 *
 * Vega renders one `path` per series within the marks group, in the
 * order the series appear in the compiled data, so we use `:nth-child`
 * to address each series individually.
 */
export function buildLineSelectors(
  mark: string,
  seriesCount: number,
  layerIndex: number,
  isLayered: boolean,
): string[] {
  const cssClass = markToCssClass(mark);
  const marksClass = isLayered ? `layer_${layerIndex}_marks` : 'marks';
  const selectors: string[] = [];
  for (let i = 0; i < seriesCount; i++) {
    selectors.push(`g.${cssClass}.role-mark.${marksClass} path:nth-child(${i + 1})`);
  }
  return selectors;
}
