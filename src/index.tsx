import type { JSX } from 'react';
import type { Maidr } from './type/grammar';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from './maidr-component';
import { DomEventType } from './type/event';
import { Constant } from './util/constant';

declare global {
  interface Window {
    maidr?: Maidr;
  }
}

if (document.readyState === 'loading') {
  // Support for regular HTML loading.
  document.addEventListener(DomEventType.DOM_LOADED, main);
} else {
  // Support for Jupyter Notebook, since it is in `complete` state.
  main();
}

// Support for third-party adapters (e.g. maidr/anychart) that bind charts
// after the initial DOM scan.  When an adapter sets `maidr-data` on an
// element and dispatches this event, we initialise MAIDR for that element.
//
// This listener is intentionally permanent (never removed) because adapter
// bindings can happen at any point during the page's lifetime — there is no
// deterministic teardown moment.  A WeakSet or similar guard in the adapter
// prevents duplicate initialisation for the same element.
document.addEventListener('maidr:bindchart', ((event: CustomEvent<Maidr>) => {
  const target = event.target;
  if (!(target instanceof HTMLElement))
    return;

  const json = target.getAttribute(Constant.MAIDR_DATA);
  if (json) {
    parseAndInit(target, json, 'maidr-data');
  }
}) as EventListener);

function parseAndInit(
  plot: HTMLElement,
  json: string,
  source: 'maidr' | 'maidr-data',
): void {
  try {
    const maidr = JSON.parse(json) as Maidr;
    initMaidr(maidr, plot);
  } catch (error) {
    console.error(`Error parsing ${source} attribute:`, error);
  }
}

function main(): void {
  const plotsWithMaidr = document.querySelectorAll<HTMLElement>(
    Constant.MAIDR_JSON_SELECTOR,
  );

  if (plotsWithMaidr.length > 0) {
    plotsWithMaidr.forEach((plot) => {
      const maidrAttr = plot.getAttribute(Constant.MAIDR);

      if (!maidrAttr) {
        return;
      }

      parseAndInit(plot, maidrAttr, 'maidr');
    });

    return;
  }

  const plots = document.querySelectorAll<HTMLElement>(`[${Constant.MAIDR_DATA}]`);
  plots.forEach((plot) => {
    const maidrData = plot.getAttribute(Constant.MAIDR_DATA);
    if (!maidrData) {
      return;
    }

    parseAndInit(plot, maidrData, 'maidr-data');
  });

  // Fall back to window.maidr if no attribute found.
  // TODO: Need to be removed along with `window.d.ts`,
  //  once attribute method is migrated.
  if (plots.length !== 0) {
    return;
  }

  const maidr = window.maidr;
  if (!maidr) {
    return;
  }

  const plot = document.getElementById(maidr.id);
  if (!plot) {
    console.error('Plot not found for maidr:', maidr.id);
    return;
  }
  initMaidr(maidr, plot);
}

/**
 * Adopts an existing DOM node into React's tree via a ref callback.
 * Used by the script-tag entry point to render a pre-existing plot element
 * as children of the {@link MaidrComponent}.
 */
function DomNodeAdapter({ node }: { node: HTMLElement }): JSX.Element {
  const ref = useCallback(
    (container: HTMLDivElement | null) => {
      if (container) {
        // Setup: adopt the existing DOM node into React's tree.
        if (!container.contains(node)) {
          container.appendChild(node);
        }
      } else {
        // Cleanup (unmount / Strict Mode remount): detach the node so it
        // can be re-adopted when the ref callback fires again with a new container.
        node.parentNode?.removeChild(node);
      }
    },
    [node],
  );

  return <div ref={ref} style={{ display: 'contents' }} />;
}

/**
 * Initializes MAIDR for a plot element by rendering the {@link MaidrComponent}
 * React component. The existing plot element is adopted into React's tree
 * via {@link DomNodeAdapter}, giving both script-tag and React consumers
 * the same single code path.
 */
function initMaidr(maidr: Maidr, plot: HTMLElement): void {
  // Create a transparent container for the React root.
  // Replace the plot in the DOM; it will be re-adopted inside <Maidr>.
  const container = document.createElement(Constant.DIV);
  container.style.display = 'contents';
  plot.parentNode!.replaceChild(container, plot);

  const root = createRoot(container, { identifierPrefix: maidr.id });
  root.render(
    <MaidrComponent data={maidr}>
      <DomNodeAdapter node={plot} />
    </MaidrComponent>,
  );
}
