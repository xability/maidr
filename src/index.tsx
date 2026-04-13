import type { JSX } from 'react';
import type { Maidr } from './type/grammar';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { createMaidrFromGoogleChart } from './adapters/google-charts/converters';
import { extractPlotlyData, isPlotlyPlot, normalizePlotlySvg } from './adapters/plotly';
import { Maidr as MaidrComponent } from './maidr-component';
import { DomEventType } from './type/event';
import { Constant } from './util/constant';

declare global {
  interface Window {
    maidr?: Maidr;
    maidrGoogleCharts?: {
      createMaidrFromGoogleChart: typeof createMaidrFromGoogleChart;
    };
  }
}

// Expose Google Charts adapter globally for script-tag usage
window.maidrGoogleCharts = {
  createMaidrFromGoogleChart,
};

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

    // Plotly SVGs need DOM normalization before maidr can process them.
    if (isPlotlyPlot(plot)) {
      normalizePlotlySvg(plot as unknown as SVGSVGElement, maidr);
    }

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
  if (maidr) {
    const plot = document.getElementById(maidr.id);
    if (!plot) {
      console.error('Plot not found for maidr:', maidr.id);
      return;
    }
    initMaidr(maidr, plot);
    return;
  }

  // Auto-detect plotly.js charts without any maidr attributes.
  autoInitPlotlyCharts();

  // Watch for dynamically-added [maidr] attributes (e.g., Google Charts).
  observeForMaidrAttributes();
}

/**
 * Scans the page for plotly.js charts and automatically extracts their
 * data to make them accessible — no binder or maidr-data attribute needed.
 *
 * Plotly.newPlot() adds `.js-plotly-plot` to the graph div, creates
 * `svg.main-svg`, sets `gd._fullData`/`gd._fullLayout`, and computes
 * `gd.calcdata` — all synchronously before returning its Promise.
 * By the time DOMContentLoaded fires, everything is ready.
 *
 * For dynamically-created charts (rendered after DOMContentLoaded), a
 * MutationObserver watches for new `.js-plotly-plot` elements.
 */
function autoInitPlotlyCharts(): void {
  // Plotly adds .js-plotly-plot synchronously during newPlot().
  // By DOMContentLoaded, class + SVG + data are all present.
  const plotlyDivs = document.querySelectorAll<HTMLElement>('.js-plotly-plot');

  // Initialize any charts that already exist
  for (const gd of plotlyDivs) {
    initPlotlyChart(gd);
  }

  // ALWAYS watch for dynamically-created charts (e.g. SPA, Jupyter notebooks),
  // even if some charts already exist at load time.
  observeForPlotlyDivs();
}

/**
 * Extracts data and initialises MAIDR for a fully-rendered Plotly chart.
 * Only proceeds when `svg.main-svg` exists — never replaces the graph
 * div itself, which would break Plotly's internal event pipeline.
 */
function initPlotlyChart(gd: HTMLElement): void {
  if (gd.hasAttribute('data-maidr-auto'))
    return;

  const maidrData = extractPlotlyData(gd);
  if (!maidrData)
    return;

  // Require the SVG to exist. Replacing the graph div in the DOM would
  // break Plotly's rendering pipeline — only the SVG is safe to adopt.
  const svg = gd.querySelector<SVGSVGElement>('svg.main-svg');
  if (!svg)
    return;

  gd.setAttribute('data-maidr-auto', '1');
  normalizePlotlySvg(svg, maidrData);
  initMaidr(maidrData, svg as unknown as HTMLElement);
}

/**
 * Watches the DOM for `.js-plotly-plot` elements that appear after
 * DOMContentLoaded (e.g. in SPAs or dynamically-loaded notebooks).
 * Uses plotly_afterplot event as a secondary signal to ensure the
 * SVG is fully rendered before initialising.
 *
 * The observer runs indefinitely to support long-lived applications
 * like Jupyter notebooks where charts may be created at any time.
 */
function observeForPlotlyDivs(): void {
  const observer = new MutationObserver(() => {
    const divs = document.querySelectorAll<HTMLElement>(
      '.js-plotly-plot:not([data-maidr-auto])',
    );
    if (divs.length === 0)
      return;

    // Process each new chart; do NOT disconnect — more charts may appear.
    for (const gd of divs) {
      // If SVG is ready, init now. Otherwise wait for plotly_afterplot.
      if (gd.querySelector('svg.main-svg')) {
        initPlotlyChart(gd);
      } else {
        gd.addEventListener('plotly_afterplot', function onAfterPlot() {
          gd.removeEventListener('plotly_afterplot', onAfterPlot);
          initPlotlyChart(gd);
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Watches for elements that receive a [maidr] attribute after DOMContentLoaded.
 * This supports libraries like Google Charts that render asynchronously and
 * set the maidr attribute in a callback (e.g., the 'ready' event).
 *
 * Uses a data attribute to prevent double-initialization.
 */
function observeForMaidrAttributes(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check for attribute changes on existing elements
      if (mutation.type === 'attributes' && mutation.attributeName === Constant.MAIDR) {
        const target = mutation.target as HTMLElement;

        // Skip if already initialized
        if (target.hasAttribute('data-maidr-init')) {
          continue;
        }

        const maidrAttr = target.getAttribute(Constant.MAIDR);
        if (maidrAttr) {
          target.setAttribute('data-maidr-init', '1');
          parseAndInit(target, maidrAttr, 'maidr');
        }
      }

      // Check for newly added elements with [maidr] attribute
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          const element = node as HTMLElement;

          // Check the element itself
          if (element.hasAttribute(Constant.MAIDR) && !element.hasAttribute('data-maidr-init')) {
            const maidrAttr = element.getAttribute(Constant.MAIDR);
            if (maidrAttr) {
              element.setAttribute('data-maidr-init', '1');
              parseAndInit(element, maidrAttr, 'maidr');
            }
          }

          // Check descendants
          const descendants = element.querySelectorAll<HTMLElement>(
            `[${Constant.MAIDR}]:not([data-maidr-init])`,
          );
          for (const desc of descendants) {
            const maidrAttr = desc.getAttribute(Constant.MAIDR);
            if (maidrAttr) {
              desc.setAttribute('data-maidr-init', '1');
              parseAndInit(desc, maidrAttr, 'maidr');
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [Constant.MAIDR],
  });
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
