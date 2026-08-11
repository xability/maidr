/**
 * CSS selectors for Google Charts SVG elements.
 *
 * Google Charts renders SVG with specific structure patterns. These selectors
 * target the individual data point elements that MAIDR uses for visual
 * highlighting during keyboard navigation.
 *
 * SVG structure reference:
 *
 * Bar/Column Charts:
 *   The chart-area data elements live inside a `<g>` with a `clip-path`
 *   attribute, which distinguishes them from axes, gridlines, legends,
 *   and background rects.
 *   [target: g[clip-path] > rect]
 *
 * Line Charts:
 *   Line paths typically have `fill="none"` to distinguish from area fills.
 *   [target: path[fill="none"] or path]
 *
 * Scatter Charts:
 *   Data points are rendered as circles.
 *   [target: circle]
 *
 * Selectors are scoped to the container element to avoid matching elements
 * from other charts on the same page.
 */

let idCounter = 0;

/**
 * Generates a unique ID with the given prefix.
 *
 * Uses a module-level counter combined with a short random suffix. Avoids
 * `crypto.randomUUID()`, which is only defined in secure contexts
 * (https/localhost) and throws on plain-HTTP pages — the exact CDN
 * script-tag scenario this adapter targets.
 *
 * NOTE: this helper is duplicated in `frappe/selectors.ts`; a shared
 * adapter utility module is a good follow-up once one exists.
 *
 * @param prefix - The prefix for the generated ID
 * @returns A unique string ID (e.g., "maidr-gc-1-a1b2c3")
 */
export function nextId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${idCounter}-${random}`;
}

/**
 * Assigns a stable, unique `id` to the container element if it doesn't
 * already have one. This is called once, up-front, so that the per-layer
 * `buildDataSelector` calls don't mutate the DOM as a side-effect.
 *
 * @param container - The container element to ensure has an ID
 */
export function ensureContainerId(container: HTMLElement): void {
  if (!container.id) {
    container.id = nextId('maidr-gc-container');
  }
}

/**
 * Builds a scoped CSS selector targeting chart data elements inside the
 * container.
 *
 * Google Charts renders its SVG inside the container `<div>`. The chart-area
 * data elements live inside a `<g>` with a `clip-path` attribute, which
 * distinguishes them from axes, gridlines, legends, and background rects.
 * We prefer the narrower `g[clip-path] > <element>` selector; if no
 * clip-path group exists we fall back to the broader `svg <element>`.
 *
 * @param container - The container element holding the chart SVG
 * @param elementSelector - The element type to target (e.g., 'rect', 'circle', 'path')
 * @returns A CSS selector string, or `undefined` when no matching elements
 *          are found.
 */
export function buildDataSelector(
  container: HTMLElement,
  elementSelector: string,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  // Prefer elements inside the chart-area clip-path group (excludes axes,
  // gridlines, legends, background rects).
  const clippedSelector = `g[clip-path] > ${elementSelector}`;
  const clippedCandidates = svg.querySelectorAll(clippedSelector);
  if (clippedCandidates.length > 0)
    return `#${container.id} svg ${clippedSelector}`;

  // Fallback: any matching element in the SVG.
  const candidates = svg.querySelectorAll(elementSelector);
  if (candidates.length > 0)
    return `#${container.id} svg ${elementSelector}`;

  return undefined;
}
