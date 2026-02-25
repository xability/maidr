/**
 * Vega-Lite entry point for MAIDR.
 *
 * Provides {@link bindVegaLite} — the primary API for making a Vega-Lite
 * chart accessible via MAIDR. Import from `maidr/vegalite` or include the
 * built script tag (`maidr-vegalite.js`).
 *
 * @example
 * ```js
 * // After vegaEmbed renders:
 * import { bindVegaLite } from 'maidr/vegalite';
 *
 * const result = await vegaEmbed('#vis', vlSpec);
 * bindVegaLite(result.view, vlSpec);
 * ```
 *
 * @packageDocumentation
 */

import type { VegaLiteSpec, VegaLiteToMaidrOptions, VegaView } from './binder/vegalite';
import type { Maidr } from './type/grammar';
import { vegaLiteToMaidr } from './binder/vegalite';
import { initMaidrOnElement } from './util/initMaidr';

export {
  type VegaLiteSpec,
  vegaLiteToMaidr,
  type VegaLiteToMaidrOptions,
  type VegaView,
} from './binder/vegalite';
export type { Maidr as MaidrData } from './type/grammar';

/**
 * Initialize MAIDR on a Vega-Lite chart.
 *
 * @param view - The compiled Vega `View` returned by `vegaEmbed`.
 * @param spec - The original Vega-Lite specification.
 * @param options - Optional overrides (id, title, …).
 *
 * @example
 * ```js
 * const result = await vegaEmbed('#vis', vlSpec);
 * bindVegaLite(result.view, vlSpec, { id: 'my-chart' });
 * ```
 */
export function bindVegaLite(
  view: VegaView,
  spec: VegaLiteSpec,
  options?: VegaLiteToMaidrOptions,
): void {
  const container = view.container();
  if (!container) {
    console.error('[maidr/vegalite] View has no container element.');
    return;
  }

  // Find the SVG rendered by Vega inside the container.
  const svg = container.querySelector('svg');
  if (!svg) {
    console.error('[maidr/vegalite] No SVG found in the Vega view container.');
    return;
  }

  // Derive an id from the container or the options.
  // Use || for container.id since empty string is falsy but not nullish.
  const id = options?.id
    || container.id
    || `vl-${Date.now()}`;

  const maidr: Maidr = vegaLiteToMaidr(spec, view, { ...options, id });

  // SVGSVGElement is not an HTMLElement, but initMaidrOnElement only
  // needs basic DOM node capabilities (parentNode, attributes).
  // Widen through Element which both SVG and HTML elements extend.
  initMaidrOnElement(maidr, svg as Element as HTMLElement);
}
