/**
 * Data converters for transforming Frappe Charts data into MAIDR's schema.
 *
 * Frappe Charts uses a `{ labels, datasets }` data model where:
 *   - `labels` are the shared x-axis categories
 *   - each `dataset` is a series of y-`values` aligned to `labels`
 *
 * MAIDR uses typed data structures per chart type:
 *   BarPoint[]      = [{ x, y }, ...]
 *   LinePoint[][]   = [[{ x, y, z? }, ...], ...]   (one inner array per line)
 *   ScatterPoint[]  = [{ x, y }, ...]
 */

import type {
  AxisConfig,
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '@type/grammar';
import type { FrappeChart, FrappeChartType, FrappeData } from './types';
import { Orientation, TraceType } from '@type/grammar';
import {
  barSelector,
  ensureContainerId,
  lineSelector,
  lineSelectorForDataset,
  nextId,
  scatterSelector,
} from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createMaidrFromFrappeChart}.
 */
export interface FrappeChartAdapterOptions {
  /** Unique ID for the MAIDR instance. Defaults to the container element's `id`. */
  id?: string;
  /** Chart title. */
  title?: string;
  /**
   * The Frappe chart type. Required because the chart instance does not expose
   * its own type in a stable way. Multi-line charts use `'line'` (the adapter
   * auto-detects multiple datasets).
   */
  chartType: FrappeChartType;
  /** Axis labels. */
  axes?: { x?: string; y?: string };
}

/**
 * Creates a MAIDR data object from a rendered Frappe chart.
 *
 * Call this **after** the chart has finished rendering (e.g. inside a
 * `requestAnimationFrame` callback once `svg.frappe-chart` exists) so the
 * container DOM already contains the SVG elements the selectors target.
 *
 * @param chart     - The Frappe chart instance (only its `data` is read). You
 *                    may also pass a plain `{ data }` object if your build does
 *                    not expose the instance.
 * @param container - The element the chart was drawn into.
 * @param options   - Adapter options (chart type is required).
 * @returns A {@link Maidr} object ready to be set as the `maidr` attribute or
 *          passed to `<Maidr data={…}>`.
 *
 * @example
 * ```js
 * const chart = new frappe.Chart('#chart', { type: 'bar', data, height: 400 });
 * requestAnimationFrame(() => {
 *   const container = document.querySelector('#chart');
 *   const maidr = maidrFrappe.createMaidrFromFrappeChart(chart, container, {
 *     chartType: 'bar',
 *     title: 'Daily Visitors',
 *     axes: { x: 'Day', y: 'Visitors' },
 *   });
 *   container.setAttribute('maidr', JSON.stringify(maidr));
 * });
 * ```
 */
export function createMaidrFromFrappeChart(
  chart: FrappeChart,
  container: HTMLElement,
  options: FrappeChartAdapterOptions,
): Maidr {
  const data = chart.data;

  // Assign a stable container id up-front (used for scoped CSS selectors).
  ensureContainerId(container);

  const id = options.id ?? container.id ?? nextId('maidr-frappe');
  const title = options.title ?? '';

  const layers = buildLayers(data, container.id, options);

  const isMultiLine = options.chartType === 'line' && data.datasets.length > 1;
  const subplot: MaidrSubplot = {
    ...(isMultiLine ? { legend: data.datasets.map((d, i) => d.name ?? `Series ${i + 1}`) } : {}),
    layers,
  };

  return {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

// ---------------------------------------------------------------------------
// Layer builders — one per supported chart type
// ---------------------------------------------------------------------------

function buildLayers(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer[] {
  switch (options.chartType) {
    case 'bar':
      return [buildBarLayer(data, containerId, options)];
    case 'line':
      return [buildLineLayer(data, containerId, options)];
    case 'scatter':
      return [buildScatterLayer(data, containerId, options)];
    case 'axis-mixed':
      return buildMixedLayers(data, containerId, options);
    default:
      throw new Error(
        `Unsupported Frappe chart type: ${options.chartType as string}. `
        + 'Supported types: bar, line, scatter, axis-mixed.',
      );
  }
}

function buildBarLayer(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer {
  const dataset = data.datasets[0];
  const points: BarPoint[] = data.labels.map((label, i) => ({
    x: label,
    y: dataset.values[i],
  }));

  return {
    id: nextId('layer'),
    type: TraceType.BAR,
    orientation: Orientation.VERTICAL,
    selectors: barSelector(containerId),
    axes: buildAxes(options),
    data: points,
  };
}

function buildLineLayer(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer {
  const multiLine = data.datasets.length > 1;

  const lines: LinePoint[][] = data.datasets.map(dataset =>
    data.labels.map((label, i) => ({
      x: label,
      y: dataset.values[i],
      ...(dataset.name ? { z: dataset.name } : {}),
    })),
  );

  // LineTrace expects a string[] of selectors, one per line. For multi-line
  // charts each line lives in its own `.dataset-{i}` group; for a single line
  // the broader line-path selector is sufficient.
  const selectors = multiLine
    ? data.datasets.map((_, i) => lineSelectorForDataset(containerId, i))
    : [lineSelector(containerId)];

  return {
    id: nextId('layer'),
    type: TraceType.LINE,
    selectors,
    axes: buildAxes(options),
    data: lines,
  };
}

function buildScatterLayer(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer {
  const dataset = data.datasets[0];
  const points: ScatterPoint[] = data.labels.map((label, i) => ({
    x: Number(label),
    y: dataset.values[i],
  }));

  return {
    id: nextId('layer'),
    type: TraceType.SCATTER,
    selectors: scatterSelector(containerId),
    axes: buildAxes(options),
    data: points,
  };
}

/**
 * Builds the layers for an `axis-mixed` chart: one MAIDR layer per dataset,
 * typed by the dataset's `chartType` (defaulting to bar). The canonical case
 * is a single bar series plus a single line series, navigable with PageUp /
 * PageDown.
 */
function buildMixedLayers(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer[] {
  return data.datasets.map((dataset) => {
    const kind = dataset.chartType ?? 'bar';

    if (kind === 'line') {
      const line: LinePoint[][] = [
        data.labels.map((label, i) => ({
          x: label,
          y: dataset.values[i],
          ...(dataset.name ? { z: dataset.name } : {}),
        })),
      ];
      return {
        id: nextId('layer'),
        type: TraceType.LINE,
        ...(dataset.name ? { title: dataset.name } : {}),
        selectors: [lineSelector(containerId)],
        axes: buildAxes(options),
        data: line,
      } satisfies MaidrLayer;
    }

    const points: BarPoint[] = data.labels.map((label, i) => ({
      x: label,
      y: dataset.values[i],
    }));
    return {
      id: nextId('layer'),
      type: TraceType.BAR,
      ...(dataset.name ? { title: dataset.name } : {}),
      orientation: Orientation.VERTICAL,
      selectors: barSelector(containerId),
      axes: buildAxes(options),
      data: points,
    } satisfies MaidrLayer;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAxes(options: FrappeChartAdapterOptions): { x?: AxisConfig; y?: AxisConfig } {
  const axes: { x?: AxisConfig; y?: AxisConfig } = {};
  if (options.axes?.x) {
    axes.x = { label: options.axes.x };
  }
  if (options.axes?.y) {
    axes.y = { label: options.axes.y };
  }
  return axes;
}
