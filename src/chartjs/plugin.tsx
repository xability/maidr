/**
 * Chart.js plugin that adds MAIDR accessibility to canvas-based charts.
 *
 * This plugin automatically extracts data from Chart.js chart instances,
 * converts it to the MAIDR JSON schema, and renders the MAIDR accessible
 * interface around the chart canvas. Navigation events are bridged back
 * to Chart.js for visual highlighting via `setActiveElements`.
 *
 * @example
 * ```js
 * import { Chart } from 'chart.js/auto';
 * import { maidrPlugin } from 'maidr/chartjs';
 *
 * Chart.register(maidrPlugin);
 *
 * new Chart(ctx, {
 *   type: 'bar',
 *   data: { labels: ['A', 'B', 'C'], datasets: [{ data: [1, 2, 3] }] },
 * });
 * ```
 */

import type { JSX } from 'react';
import type { Root } from 'react-dom/client';
import type { Maidr as MaidrData, NavigateCallback } from '../type/grammar';
import type { ChartJsChart, ChartJsPlugin, MaidrPluginOptions } from './types';
import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr as MaidrComponent } from '../maidr-component';
import { extractMaidrData } from './extractor';

// ---------------------------------------------------------------------------
// Internal state per chart
// ---------------------------------------------------------------------------

interface MaidrChartBinding {
  maidrData: MaidrData;
  root: Root;
  container: HTMLElement;
}

const chartBindings = new WeakMap<ChartJsChart, MaidrChartBinding>();

// ---------------------------------------------------------------------------
// React helper: adopt an existing DOM node into React's tree
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Chart.js highlight bridge
// ---------------------------------------------------------------------------

function createHighlightCallback(chart: ChartJsChart): NavigateCallback {
  return ({ row, col }) => {
    try {
      chart.setActiveElements([{ datasetIndex: row, index: col }]);

      if (chart.tooltip) {
        const meta = chart.getDatasetMeta(row);
        const element = meta?.data?.[col];
        if (element) {
          chart.tooltip.setActiveElements(
            [{ datasetIndex: row, index: col }],
            { x: element.x, y: element.y },
          );
        }
      }

      // 'none' mode skips animations for snappy navigation
      chart.update('none');
    } catch {
      // Silently ignore highlight errors (e.g., after chart destruction)
    }
  };
}

// ---------------------------------------------------------------------------
// Plugin options helper
// ---------------------------------------------------------------------------

function getPluginOptions(chart: ChartJsChart): MaidrPluginOptions {
  const raw = chart.options.plugins?.maidr;
  if (!raw || typeof raw !== 'object')
    return {};
  return raw as MaidrPluginOptions;
}

// ---------------------------------------------------------------------------
// MAIDR rendering
// ---------------------------------------------------------------------------

function renderMaidr(
  maidrData: MaidrData,
  canvas: HTMLCanvasElement,
): { root: Root; container: HTMLElement } {
  // Create a transparent container that wraps the canvas
  const container = document.createElement('div');
  container.style.display = 'contents';
  container.setAttribute('data-maidr-chartjs', maidrData.id);

  const parent = canvas.parentElement;
  if (!parent) {
    throw new Error('MAIDR Chart.js plugin: canvas must be in the DOM');
  }

  // Insert container and move canvas into it
  parent.insertBefore(container, canvas);

  const reactContainer = document.createElement('div');
  reactContainer.style.display = 'contents';
  container.appendChild(reactContainer);

  const root = createRoot(reactContainer, { identifierPrefix: maidrData.id });
  root.render(
    <MaidrComponent data={maidrData}>
      <DomNodeAdapter node={canvas} />
    </MaidrComponent>,
  );

  return { root, container };
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

function initMaidrForChart(chart: ChartJsChart): void {
  // Guard against duplicate initialization
  if (chartBindings.has(chart))
    return;

  const pluginOptions = getPluginOptions(chart);

  if (pluginOptions.enabled === false)
    return;

  // Extract MAIDR data with the highlight callback attached at construction
  const maidrData = extractMaidrData(
    chart,
    pluginOptions,
    createHighlightCallback(chart),
  );

  // Render the MAIDR accessible interface around the canvas
  const { root, container } = renderMaidr(maidrData, chart.canvas);

  chartBindings.set(chart, { maidrData, root, container });
}

function destroyMaidrForChart(chart: ChartJsChart): void {
  const binding = chartBindings.get(chart);
  if (!binding)
    return;

  binding.root.unmount();
  binding.container.remove();
  chartBindings.delete(chart);
}

// ---------------------------------------------------------------------------
// Public plugin object
// ---------------------------------------------------------------------------

/**
 * Chart.js plugin that automatically adds MAIDR accessibility.
 *
 * Register globally with `Chart.register(maidrPlugin)` or per-chart via
 * the `plugins` array in the chart configuration.
 *
 * Disable for a specific chart:
 * ```js
 * new Chart(ctx, {
 *   // ...
 *   options: { plugins: { maidr: { enabled: false } } },
 * });
 * ```
 */
export const maidrPlugin: ChartJsPlugin = {
  id: 'maidr',

  afterInit(chart: ChartJsChart) {
    initMaidrForChart(chart);
  },

  beforeDestroy(chart: ChartJsChart) {
    destroyMaidrForChart(chart);
  },
};
