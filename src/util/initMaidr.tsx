/**
 * Shared helpers for adopting pre-existing DOM nodes into React's tree.
 *
 * Used by both the script-tag entry point (`index.tsx`) and the Vega-Lite
 * entry point (`vegalite-entry.tsx`) so the initialisation logic lives in
 * one place.
 */

import type { JSX } from 'react';
import type { Root } from 'react-dom/client';
import type { Maidr } from '../type/grammar';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../maidr-component';
import { Constant } from './constant';

/**
 * Tracks the active React root and its container for each plot element, so a
 * re-initialisation (e.g. a live [maidr] attribute change) can tear down the
 * previous root instead of nesting a second root inside it.
 */
const rootRegistry = new WeakMap<HTMLElement, { root: Root; container: HTMLElement }>();

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
 * Adopts a DOM node into React's tree inside an explicitly sized host div.
 *
 * Used by adapters that bind charts whose rendered element has no intrinsic
 * size (e.g. an AnyChart `<svg>` whose dimensions live in internal layout
 * state rather than HTML width/height attributes). The {@link MaidrComponent}
 * focusable wrapper uses `width: fit-content`; with `display: contents` on
 * the adapter and an intrinsic-less child, the wrapper computes to `0×0`
 * pixels and becomes unfocusable. Wrapping the node in a real layout box
 * with explicit dimensions keeps the wrapper measurable and focusable.
 *
 * Activated by stamping `data-maidr-host-width` and `data-maidr-host-height`
 * on the bound element before dispatching `maidr:bindchart`.
 *
 * Mirrors the Chart.js adapter's `CanvasHost` pattern.
 */
export function SizedDomNodeAdapter({
  node,
  width,
  height,
}: {
  node: HTMLElement;
  width: number;
  height: number;
}): JSX.Element {
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
    [node, width, height],
  );

  return (
    <div
      ref={ref}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
      }}
    />
  );
}

/**
 * Renders the `<Maidr>` component around the provided plot element.
 *
 * Creates a transparent wrapper, replaces the plot in the DOM, then mounts
 * the React tree so that `<MaidrComponent>` manages accessibility. The plot
 * element is adopted via {@link DomNodeAdapter} (or {@link SizedDomNodeAdapter}
 * when it carries `data-maidr-host-width` / `data-maidr-host-height`).
 *
 * Supports re-initialisation for the same plot element (e.g. a live [maidr]
 * data change): any previously mounted root is unmounted and the plot node is
 * restored to its original DOM position before a fresh root is created. Without
 * this teardown a second init would nest a new React root inside the still-
 * mounted old one, duplicating controllers/hotkeys and leaking the old root.
 */
export function initMaidrOnElement(maidr: Maidr, plot: HTMLElement): void {
  // Re-init path: tear down the previous root first. Order matters — unmounting
  // runs DomNodeAdapter's ref cleanup, which detaches `plot`; we then restore
  // `plot` where the old container was so the standard init path below can run.
  const existing = rootRegistry.get(plot);
  if (existing) {
    existing.root.unmount();
    existing.container.parentNode?.replaceChild(plot, existing.container);
    rootRegistry.delete(plot);
  }

  if (!plot.parentNode) {
    console.error('[maidr] Plot element has no parent node.');
    return;
  }

  const container = document.createElement(Constant.DIV);
  container.style.display = 'contents';
  plot.parentNode.replaceChild(container, plot);

  // Opt-in path for adapters whose bound element has no intrinsic size.
  const hostWidth = plot.dataset.maidrHostWidth;
  const hostHeight = plot.dataset.maidrHostHeight;
  const adopt
    = hostWidth && hostHeight
      ? (
          <SizedDomNodeAdapter
            node={plot}
            width={Number(hostWidth)}
            height={Number(hostHeight)}
          />
        )
      : <DomNodeAdapter node={plot} />;

  const root = createRoot(container, { identifierPrefix: maidr.id });
  root.render(
    <MaidrComponent data={maidr}>{adopt}</MaidrComponent>,
  );

  rootRegistry.set(plot, { root, container });
}
