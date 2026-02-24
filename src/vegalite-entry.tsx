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

import type { JSX } from 'react';
import type { VegaLiteSpec, VegaLiteToMaidrOptions, VegaView } from './binder/vegalite';
import type { Maidr } from './type/grammar';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { vegaLiteToMaidr } from './binder/vegalite';
import { Maidr as MaidrComponent } from './maidr-component';
import { Constant } from './util/constant';

export {
  type VegaLiteSpec,
  vegaLiteToMaidr,
  type VegaLiteToMaidrOptions,
  type VegaView,
} from './binder/vegalite';
export type { Maidr as MaidrData } from './type/grammar';

/**
 * Adopt an existing DOM node into the React tree (same pattern as the
 * script-tag entry point).
 */
function DomNodeAdapter({ node }: { node: HTMLElement }): JSX.Element {
  const ref = useCallback(
    (container: HTMLDivElement | null) => {
      if (container) {
        if (!container.contains(node)) {
          container.appendChild(node);
        }
      } else {
        node.parentNode?.removeChild(node);
      }
    },
    [node],
  );

  return <div ref={ref} style={{ display: 'contents' }} />;
}

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
  const id = options?.id
    ?? container.id
    ?? `vl-${Date.now()}`;

  const maidr: Maidr = vegaLiteToMaidr(spec, view, { ...options, id });

  initMaidrOnElement(maidr, svg as unknown as HTMLElement);
}

/**
 * Low-level initialization: renders the `<Maidr>` component around the
 * provided plot element (same as the core script-tag entry).
 */
function initMaidrOnElement(maidr: Maidr, plot: HTMLElement): void {
  if (!plot.parentNode) {
    console.error('[maidr/vegalite] Plot element has no parent node.');
    return;
  }

  const wrapper = document.createElement(Constant.DIV);
  wrapper.style.display = 'contents';
  plot.parentNode.replaceChild(wrapper, plot);

  const root = createRoot(wrapper, { identifierPrefix: maidr.id });
  root.render(
    <MaidrComponent data={maidr}>
      <DomNodeAdapter node={plot} />
    </MaidrComponent>,
  );
}
