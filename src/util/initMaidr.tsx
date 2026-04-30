/**
 * Shared helpers for adopting pre-existing DOM nodes into React's tree.
 *
 * Used by both the script-tag entry point (`index.tsx`) and the Vega-Lite
 * entry point (`vegalite-entry.tsx`) so the initialisation logic lives in
 * one place.
 */

import type { JSX } from 'react';
import type { Maidr } from '../type/grammar';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../maidr-component';
import { Constant } from './constant';

/**
 * Adopts an existing DOM node into React's tree via a ref callback.
 * Used by script-tag and adapter entry points to render a pre-existing plot
 * element as children of the {@link MaidrComponent}.
 */
export function DomNodeAdapter({ node }: { node: HTMLElement }): JSX.Element {
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
 * Renders the `<Maidr>` component around the provided plot element.
 *
 * Creates a transparent wrapper, replaces the plot in the DOM, then mounts
 * the React tree so that `<MaidrComponent>` manages accessibility.
 */
export function initMaidrOnElement(maidr: Maidr, plot: HTMLElement): void {
  if (!plot.parentNode) {
    console.error('[maidr] Plot element has no parent node.');
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
