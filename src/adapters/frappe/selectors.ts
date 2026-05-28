/**
 * CSS selectors for Frappe Charts SVG elements.
 *
 * Selectors target the individual data-point elements that MAIDR highlights
 * during keyboard navigation. They are **specific to Frappe Charts v1.6.2** —
 * if the host page upgrades Frappe, verify the SVG class names still match.
 *
 * SVG structure reference (v1.6.2), inside `svg.frappe-chart`:
 *
 *   Bars:    <rect class="bar"> inside <g class="dataset-units dataset-bars dataset-{i}">
 *   Lines:   <path class="line-graph-path"> + one <circle> per data point, inside
 *            <g class="dataset-units dataset-line dataset-{i}">
 *   Points:  <circle> inside <g class="dataset-units dataset-line dataset-{i}">  (scatter reuses the line group)
 *
 * For line traces MAIDR highlights one element per data point, so the line
 * selectors target the per-point `<circle>` dots (not the single `<path>`).
 * This requires the Frappe chart to render dots (`lineOptions.dotSize > 0`).
 *
 * Every selector is scoped to the container element's `id` so that charts
 * elsewhere on the same page are never matched.
 */

/**
 * Generates a unique ID with the given prefix using `crypto.randomUUID()`.
 *
 * @param prefix - The prefix for the generated ID.
 * @returns A unique string ID (e.g. `"maidr-frappe-a1b2c3d4"`).
 */
export function nextId(prefix: string): string {
  const uuid = crypto.randomUUID().slice(0, 8);
  return `${prefix}-${uuid}`;
}

/**
 * Assigns a stable, unique `id` to the container element if it doesn't already
 * have one, so the per-layer selectors below can be scoped to it.
 *
 * @param container - The element the Frappe chart was drawn into.
 */
export function ensureContainerId(container: HTMLElement): void {
  if (!container.id) {
    container.id = nextId('maidr-frappe-container');
  }
}

/** Scoped selector for all bar rects (single or stacked bar groups). */
export function barSelector(containerId: string): string {
  return `#${containerId} svg.frappe-chart .dataset-units.dataset-bars rect.bar`;
}

/**
 * Scoped selector for the per-point dot circles of a single line.
 *
 * MAIDR highlights one element per data point, so this targets the `<circle>`
 * dots rather than the single `<path>`. Requires `lineOptions.dotSize > 0`.
 */
export function lineSelector(containerId: string): string {
  return `#${containerId} svg.frappe-chart .dataset-units.dataset-line circle`;
}

/** Scoped selector for the per-point dot circles of one line dataset (multi-line charts). */
export function lineSelectorForDataset(containerId: string, index: number): string {
  return `#${containerId} svg.frappe-chart .dataset-units.dataset-line.dataset-${index} circle`;
}

/** Scoped selector for scatter point circles (rendered in the line dataset group). */
export function scatterSelector(containerId: string): string {
  return `#${containerId} svg.frappe-chart .dataset-units.dataset-line circle`;
}
