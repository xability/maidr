import type { JSX } from 'react';
import type { Maidr } from './type/grammar';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { isPlotlyPlot, normalizePlotlySvg } from './adapter/plotly';
import { extractPlotlyData } from './adapter/plotly-extractor';
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

  if (plotlyDivs.length > 0) {
    for (const gd of plotlyDivs) {
      initPlotlyChart(gd);
    }
    return;
  }

  // For charts created after DOMContentLoaded (e.g. SPA, dynamic loading),
  // watch the DOM for .js-plotly-plot to appear.
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
 * Disconnects automatically after 30 seconds.
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
    attributes: true,
    attributeFilter: ['class'],
  });

  // Safety: stop watching after 30 seconds.
  setTimeout(() => observer.disconnect(), 30_000);
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
