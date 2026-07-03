import type { MaidrLiveApi } from './service/liveData';
import type { Maidr } from './type/grammar';
import { extractPlotlyData, isPlotlyPlot, normalizePlotlySvg } from './adapters/plotly';
import { liveDataManager } from './service/liveData';
import { DomEventType } from './type/event';
import { Constant } from './util/constant';
import { initMaidrOnElement } from './util/initMaidr';

declare global {
  interface Window {
    maidr?: Maidr;
    /**
     * Realtime/streaming data API. Use `setData` to replace chart data and
     * `appendData` to stream individual points into live charts.
     */
    maidrLive?: MaidrLiveApi;
    /**
     * Disconnects all MAIDR MutationObservers to free memory.
     * Call this when cleaning up in SPAs or before page unload.
     */
    disconnectMaidrObservers?: () => void;
  }
}

// Expose the realtime data API globally for script-tag consumers.
if (window.maidrLive) {
  console.warn('[maidr] window.maidrLive is being redefined — was the maidr script loaded twice?');
}
window.maidrLive = {
  setData: maidr => liveDataManager.setData(maidr),
  appendData: (point, options) => liveDataManager.appendData(point, options),
};

/** Stores active MutationObservers for cleanup. */
let maidrAttributeObserver: MutationObserver | null = null;
let plotlyDivObserver: MutationObserver | null = null;

/**
 * Disconnects all MAIDR MutationObservers to prevent memory leaks.
 * Exposed as `window.disconnectMaidrObservers()` for SPA cleanup.
 */
function disconnectMaidrObservers(): void {
  if (maidrAttributeObserver) {
    maidrAttributeObserver.disconnect();
    maidrAttributeObserver = null;
  }
  if (plotlyDivObserver) {
    plotlyDivObserver.disconnect();
    plotlyDivObserver = null;
  }
}

// Expose cleanup function globally
window.disconnectMaidrObservers = disconnectMaidrObservers;

// Clean up observers on page unload to prevent memory leaks
window.addEventListener('beforeunload', disconnectMaidrObservers);

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

    // Plotly SVGs need DOM normalization before maidr can process them.
    if (isPlotlyPlot(plot)) {
      normalizePlotlySvg(plot as unknown as SVGSVGElement, maidr);
    }

    initMaidrOnElement(maidr, plot);

    // Stamp the initialised value so the [maidr] attribute observer skips this
    // element when React re-adopts it (childList mutation) and keys any later
    // re-init off a consistent value. Set after init so it survives the DOM
    // replace but before the observer's async callback runs.
    plot.setAttribute('data-maidr-value', json);
  } catch (error) {
    console.error(`Error parsing ${source} attribute:`, error);
  }
}

function main(): void {
  const plotsWithMaidr = document.querySelectorAll<HTMLElement>(
    Constant.MAIDR_JSON_SELECTOR,
  );
  const plots = document.querySelectorAll<HTMLElement>(`[${Constant.MAIDR_DATA}]`);

  if (plotsWithMaidr.length > 0) {
    plotsWithMaidr.forEach((plot) => {
      const maidrAttr = plot.getAttribute(Constant.MAIDR);
      if (maidrAttr) {
        parseAndInit(plot, maidrAttr, 'maidr');
      }
    });
  } else if (plots.length > 0) {
    plots.forEach((plot) => {
      const maidrData = plot.getAttribute(Constant.MAIDR_DATA);
      if (maidrData) {
        parseAndInit(plot, maidrData, 'maidr-data');
      }
    });
  } else if (window.maidr) {
    // Fall back to window.maidr if no attribute found.
    // TODO: Need to be removed along with `window.d.ts`,
    //  once attribute method is migrated.
    const maidr = window.maidr;
    const plot = document.getElementById(maidr.id);
    if (plot) {
      initMaidrOnElement(maidr, plot);
    } else {
      console.error('Plot not found for maidr:', maidr.id);
    }
  } else {
    // Auto-detect plotly.js charts without any maidr attributes.
    // Kept in the nothing-found fallback so a chart already bound via a
    // [maidr]/[maidr-data] attribute is never auto-initialised a second time.
    autoInitPlotlyCharts();
  }

  // Always watch for dynamically-added [maidr] attributes (e.g., Google
  // Charts that set [maidr] in a ready callback) and re-init on data change,
  // regardless of what was already initialised above.
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
  initMaidrOnElement(maidrData, svg as unknown as HTMLElement);
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
  // Avoid creating duplicate observers
  if (plotlyDivObserver)
    return;

  plotlyDivObserver = new MutationObserver(() => {
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

  plotlyDivObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Watches for elements that receive a [maidr] attribute after DOMContentLoaded.
 * This supports libraries like Google Charts that render asynchronously and
 * set the maidr attribute in a callback (e.g., the 'ready' event).
 *
 * Stores the attribute value to allow re-initialization when chart data changes.
 */
function observeForMaidrAttributes(): void {
  // Avoid creating duplicate observers
  if (maidrAttributeObserver)
    return;

  maidrAttributeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check for attribute changes on existing elements
      if (mutation.type === 'attributes' && mutation.attributeName === Constant.MAIDR) {
        const target = mutation.target as HTMLElement;
        const maidrAttr = target.getAttribute(Constant.MAIDR);

        if (!maidrAttr)
          continue;

        // Skip if attribute value hasn't changed (allows re-init on data change)
        const previousValue = target.getAttribute('data-maidr-value');
        if (previousValue === maidrAttr) {
          continue;
        }

        // Store the current value and initialize
        target.setAttribute('data-maidr-value', maidrAttr);
        parseAndInit(target, maidrAttr, 'maidr');
      }

      // Check for newly added elements with [maidr] attribute
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          const element = node as HTMLElement;

          // Check the element itself
          const maidrAttr = element.getAttribute(Constant.MAIDR);
          if (maidrAttr) {
            const previousValue = element.getAttribute('data-maidr-value');
            if (previousValue !== maidrAttr) {
              element.setAttribute('data-maidr-value', maidrAttr);
              parseAndInit(element, maidrAttr, 'maidr');
            }
          }

          // Check descendants
          const descendants = element.querySelectorAll<HTMLElement>(`[${Constant.MAIDR}]`);
          for (const desc of descendants) {
            const descAttr = desc.getAttribute(Constant.MAIDR);
            if (descAttr) {
              const prevValue = desc.getAttribute('data-maidr-value');
              if (prevValue !== descAttr) {
                desc.setAttribute('data-maidr-value', descAttr);
                parseAndInit(desc, descAttr, 'maidr');
              }
            }
          }
        }
      }
    }
  });

  maidrAttributeObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [Constant.MAIDR],
  });
}
