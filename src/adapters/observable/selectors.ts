/**
 * Selector generation for the Observable Plot adapter.
 *
 * MAIDR highlights a data point by resolving the layer's CSS selector against
 * the document and taking the element at the point's index, so a selector has
 * to match exactly the elements the layer's data describes, in the same order.
 *
 * Plot gives an adapter no class or id to aim at: a mark's elements are bare
 * `<rect>`s inside `<g aria-label="bar">`, and a plot with two bar marks has
 * two such groups. Positional selectors (`:nth-of-type`) would express that,
 * but they break the moment Plot nests the elements one level deeper for a
 * facet — which it does, without changing anything else. So the adapter stamps
 * each element with the layer it belongs to and selects on that instead: the
 * mapping is then explicit, order is document order, and nothing depends on
 * where in the tree Plot put the element.
 *
 * @packageDocumentation
 */

/** Attribute stamped on every element a layer covers. */
export const MARK_ATTRIBUTE = 'data-maidr-observable';

/**
 * Stamps a layer's elements and returns the selector that matches them.
 *
 * @param elements    - The layer's drawn elements, in data order.
 * @param containerId - Id of the plot's `<svg>`, which scopes the selector.
 * @param token       - Value identifying this layer within the plot.
 * @returns A selector matching exactly those elements.
 *
 * @example
 * stampLayer(rects, 'maidr-observable-1-a3f', 'L0');
 * // => '#maidr-observable-1-a3f [data-maidr-observable="L0"]'
 */
export function stampLayer(
  elements: readonly Element[],
  containerId: string,
  token: string,
): string {
  for (const element of elements)
    element.setAttribute(MARK_ATTRIBUTE, token);
  return `#${containerId} [${MARK_ATTRIBUTE}="${token}"]`;
}

/**
 * Stamps each series of a multi-series layer separately.
 *
 * A line layer's data is one array per series and its selectors are one string
 * per series, so each series needs a token of its own.
 *
 * @param series      - The elements of each series, in series order.
 * @param containerId - Id of the plot's `<svg>`.
 * @param token       - Value identifying this layer within the plot.
 * @returns One selector per series.
 */
export function stampSeries(
  series: readonly (readonly Element[])[],
  containerId: string,
  token: string,
): string[] {
  return series.map((elements, index) =>
    stampLayer(elements, containerId, `${token}-${index}`));
}
