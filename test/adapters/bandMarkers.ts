import { Svg } from '@util/svg';

/**
 * Test helper for the adapters' percentile band cases: which of the elements
 * an adapter named each quantile is marked on.
 *
 * A percentile band's quantile is marked, point by point, where it is drawn:
 * on the edge of the band it bounds, or on the median's line. The marker
 * stands at a vertex of that element's outline, so the element is the one
 * of `named` with a vertex where the quantile's first marker is.
 *
 * @param highlightValues - The trace's highlight values, quantile by point
 * @param named - The elements the adapter's selectors named
 * @returns For each quantile, the element its first marker stands on, or
 *   null when it has no marker or stands on none of them
 */
export function markedOn(
  highlightValues: SVGElement[][][] | null | undefined,
  named: readonly (Element | null)[],
): (Element | null)[] | undefined {
  return highlightValues?.map((row) => {
    const [marker] = (row[0] ?? []) as SVGElement[];
    if (marker === undefined || marker.tagName.toLowerCase() !== 'circle') {
      return null;
    }
    const cx = Number(marker.getAttribute('cx'));
    const cy = Number(marker.getAttribute('cy'));
    return named.find(element => element !== null
      && (Svg.outlineOf(element)?.vertices ?? []).some(vertex =>
        Math.abs(vertex.x - cx) < 1e-6 && Math.abs(vertex.y - cy) < 1e-6)) ?? null;
  });
}
