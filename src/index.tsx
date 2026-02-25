import type { JSX } from 'react';
import type { MaidrRef } from './maidr-component';
import type { Maidr } from './type/grammar';
import { createRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from './maidr-component';
import { DomEventType } from './type/event';
import { Constant } from './util/constant';

/**
 * Global registry of MAIDR plot handles, keyed by plot ID.
 *
 * Script-tag consumers can use `maidrPlots.get(id)` to obtain a
 * {@link MaidrRef} handle for programmatic data updates.
 *
 * @example
 * ```js
 * // After MAIDR has initialized a plot with id "my-chart":
 * const handle = maidrPlots.get('my-chart');
 * handle?.setData(newMaidrJson);
 * ```
 */
export const maidrPlots = new Map<string, MaidrRef>();

declare global {
  interface Window {
    maidr?: Maidr;
    /**
     * Global registry of initialized MAIDR plot handles.
     * Available when using the script-tag entry point.
     */
    maidrPlots?: Map<string, MaidrRef>;
  }
}

// Expose the registry on window for script-tag consumers.
window.maidrPlots = maidrPlots;

if (document.readyState === 'loading') {
  // Support for regular HTML loading.
  document.addEventListener(DomEventType.DOM_LOADED, main);
} else {
  // Support for Jupyter Notebook, since it is in `complete` state.
  main();
}

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
 *
 * The returned {@link MaidrRef} handle is also registered in the global
 * {@link maidrPlots} map so that script-tag consumers can access it via
 * `window.maidrPlots.get(maidr.id)`.
 */
function initMaidr(maidr: Maidr, plot: HTMLElement): void {
  // Create a transparent container for the React root.
  // Replace the plot in the DOM; it will be re-adopted inside <Maidr>.
  const container = document.createElement(Constant.DIV);
  container.style.display = 'contents';
  plot.parentNode!.replaceChild(container, plot);

  // Create a ref to capture the imperative handle from the <Maidr> component.
  const maidrRef = createRef<MaidrRef>();

  const root = createRoot(container, { identifierPrefix: maidr.id });
  root.render(
    <MaidrComponent ref={maidrRef} data={maidr}>
      <DomNodeAdapter node={plot} />
    </MaidrComponent>,
  );

  // Register a proxy handle in the global registry. The proxy delegates to the
  // ref once React has committed the render (the ref is null during the first
  // synchronous render pass but populated immediately after commit).
  const handle: MaidrRef = {
    setData(newData) {
      maidrRef.current?.setData(newData);
    },
  };
  maidrPlots.set(maidr.id, handle);
}
