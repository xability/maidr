/**
 * Main adapter that converts an amCharts 5 chart into a MAIDR data object.
 *
 * @example
 * ```ts
 * import { fromAmCharts } from 'maidr/amcharts';
 *
 * const root = am5.Root.new("chartdiv");
 * const chart = root.container.children.push(
 *   am5xy.XYChart.new(root, {})
 * );
 * // ... configure chart, axes, series, data ...
 *
 * const maidrData = fromAmCharts(root);
 * ```
 */

import type {
  BarPoint,
  CandlestickPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '@type/grammar';
import type {
  AmChartsBinderOptions,
  AmRoot,
  AmXYChart,
  AmXYSeries,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import {
  classifySeriesKind,
  extractBarPoints,
  extractCandlestickPoints,
  extractLinePoints,
  extractScatterPoints,
  readAxisLabel,
} from './extractors';
import {
  buildColumnSelector,
  buildLineSelector,
  buildScatterSelector,
} from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an amCharts 5 {@link AmRoot} into a MAIDR data object.
 *
 * The function inspects the root's container children, finds the first
 * XY chart, and converts each of its series into a MAIDR layer.
 *
 * @param root    The amCharts 5 `Root` instance.
 * @param options Optional overrides for title, subtitle, and axis labels.
 * @returns       A {@link Maidr} object ready for `<Maidr data={...}>`.
 *
 * @throws If no supported chart is found inside the root.
 */
export function fromAmCharts(root: AmRoot, options?: AmChartsBinderOptions): Maidr {
  const chart = findXYChart(root);
  if (!chart) {
    throw new Error(
      'maidr amCharts binder: no XYChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling fromAmCharts().',
    );
  }

  return fromXYChart(chart, root.dom, options);
}

/**
 * Convert an amCharts 5 {@link AmXYChart} directly into a MAIDR data object.
 *
 * Use this when you already hold a reference to the chart object.
 *
 * @param chart        The amCharts 5 XY chart instance.
 * @param containerEl  The DOM element that contains the chart's rendered output.
 * @param options      Optional overrides.
 */
export function fromXYChart(
  chart: AmXYChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): Maidr {
  const title = options?.title ?? readChartTitle(chart);
  const subtitle = options?.subtitle;
  const xLabel = options?.axisLabels?.x ?? readAxisLabel(chart.xAxes.values[0], 'x');
  const yLabel = options?.axisLabels?.y ?? readAxisLabel(chart.yAxes.values[0], 'y');

  const layers: MaidrLayer[] = [];
  const lineLayers: LinePoint[][] = [];
  let lineLayerSelectors: string[] | undefined;

  for (const series of chart.series.values) {
    const kind = classifySeriesKind(series);

    switch (kind) {
      case 'bar': {
        const data = extractBarPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildBarLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'line': {
        const points = extractLinePoints(series);
        if (points.length === 0)
          break;
        lineLayers.push(points);

        const sel = buildLineSelector(series, containerEl);
        if (sel) {
          lineLayerSelectors ??= [];
          lineLayerSelectors.push(sel);
        }
        break;
      }
      case 'scatter': {
        const data = extractScatterPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildScatterLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'candlestick': {
        const data = extractCandlestickPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildCandlestickLayer(series, data, xLabel, yLabel));
        break;
      }
      default:
        // Skip unsupported series types.
        break;
    }
  }

  // Merge all line series into a single multi-line layer.
  if (lineLayers.length > 0) {
    layers.push(buildLineLayer(lineLayers, lineLayerSelectors, xLabel, yLabel));
  }

  const id = `amcharts-${containerEl.id || uid()}`;

  const subplot: MaidrSubplot = { layers };

  return {
    id,
    title,
    subtitle,
    subplots: [[subplot]],
  };
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

function buildBarLayer(
  series: AmXYSeries,
  data: BarPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const isHorizontal = typeof series.get('categoryYField') === 'string';
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.BAR,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildLineLayer(
  data: LinePoint[][],
  selectors: string[] | undefined,
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  return {
    id: `line-${uid()}`,
    type: TraceType.LINE,
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildScatterLayer(
  series: AmXYSeries,
  data: ScatterPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const selector = buildScatterSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.SCATTER,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

function buildCandlestickLayer(
  series: AmXYSeries,
  data: CandlestickPoint[],
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.CANDLESTICK,
    title: seriesName(series),
    axes: { x: xLabel, y: yLabel },
    data,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findXYChart(root: AmRoot): AmXYChart | undefined {
  for (const child of root.container.children.values) {
    // Duck-type check: XYChart has series, xAxes, yAxes.
    const c = child as Partial<AmXYChart>;
    if (c.series && c.xAxes && c.yAxes) {
      return c as AmXYChart;
    }
  }
  return undefined;
}

function readChartTitle(chart: AmXYChart): string | undefined {
  // amCharts 5 titles are typically children of the chart.
  // A title entity has className "Label" and text property.
  const children = (chart as unknown as { children?: { values: Array<{ className?: string; get: (k: string) => unknown }> } }).children;
  if (!children)
    return undefined;

  for (const child of children.values) {
    if (child.className === 'Label' || child.className === 'Title') {
      const text = child.get('text');
      if (typeof text === 'string' && text.length > 0)
        return text;
    }
  }
  return undefined;
}

function seriesName(series: AmXYSeries): string | undefined {
  const name = series.get('name');
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function layerId(series: AmXYSeries): string {
  return `amcharts-series-${series.uid ?? uid()}`;
}

let _counter = 0;
function uid(): string {
  return String(++_counter);
}
