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
import type { FrappeChart, FrappeChartType, FrappeData, FrappePanel } from './types';
import { Orientation, TraceType } from '@type/grammar';
import {
  barSelectorForDataset,
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
  // Assign a stable container id up-front (used for scoped CSS selectors).
  ensureContainerId(container);

  const id = options.id ?? container.id ?? nextId('maidr-frappe');
  const title = options.title ?? '';

  const subplot = buildSubplot(chart, container, {
    chartType: options.chartType,
    axes: options.axes,
  });

  return {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

/**
 * Options accepted by {@link createMaidrFromFrappeCharts}.
 */
export interface FrappeChartsGridOptions {
  /** Unique ID for the MAIDR instance. Defaults to the wrapper element's `id`. */
  id?: string;
  /** Figure title. */
  title?: string;
  /** Figure subtitle. */
  subtitle?: string;
  /** Figure caption. */
  caption?: string;
  /**
   * When `panels` is a flat array, chunk it into rows of this many panels
   * (row-major). Ignored for 2D input; omit to place all panels in one row.
   */
  columns?: number;
}

/**
 * Creates a single MAIDR figure from a grid of independently rendered Frappe
 * charts, enabling cross-panel arrow-key navigation (arrows move between
 * panels, `Enter` drills into a panel, `Esc` returns).
 *
 * Frappe Charts has no native multi-panel concept, so panel grouping is
 * explicit: lay the chart containers out inside one wrapper element (e.g. a
 * CSS grid) and describe the grid here in visual reading order (row-major,
 * top-left first).
 *
 * Call this **after every panel** has finished rendering (Frappe's entrance
 * animation re-creates SVG nodes, so wait for all panels to settle), then set
 * the `maidr` attribute on the **wrapper** element — not on the individual
 * panel containers, which would create N separate MAIDR figures.
 *
 * @param panels  - The panel grid. A 2D array maps 1:1 to subplot rows; a flat
 *                  array is chunked into rows of `options.columns` panels
 *                  (row-major), or a single row when `columns` is omitted.
 * @param wrapper - The element containing every panel's container. Its `id`
 *                  (generated when missing) becomes the default figure id.
 * @param options - Figure-level options.
 * @returns A {@link Maidr} object ready to be set as the wrapper's `maidr`
 *          attribute.
 *
 * @example
 * ```js
 * const maidr = maidrFrappe.createMaidrFromFrappeCharts(
 *   [
 *     [
 *       { chart: barChart, container: barEl, chartType: 'bar', title: 'Sales' },
 *       { chart: lineChart, container: lineEl, chartType: 'line', title: 'Trend' },
 *     ],
 *   ],
 *   wrapper,
 *   { title: 'Quarterly Dashboard' },
 * );
 * wrapper.setAttribute('maidr', JSON.stringify(maidr));
 * ```
 */
export function createMaidrFromFrappeCharts(
  panels: FrappePanel[][] | FrappePanel[],
  wrapper: HTMLElement,
  options: FrappeChartsGridOptions = {},
): Maidr {
  const grid = normalizePanelGrid(panels, options.columns);

  // Assign a stable wrapper id up-front (used as the default figure id).
  ensureContainerId(wrapper);
  const id = options.id ?? wrapper.id;

  const subplots = grid.map((row, rowIndex) =>
    row.map((panel, colIndex) => {
      if (panel.container === wrapper || !wrapper.contains(panel.container)) {
        throw new Error(
          `[maidr/frappe] Panel [${rowIndex}][${colIndex}]'s container must be a `
          + 'descendant of the wrapper element passed to createMaidrFromFrappeCharts.',
        );
      }
      return buildSubplot(panel.chart, panel.container, {
        chartType: panel.chartType,
        axes: panel.axes,
        panelTitle: panel.title,
        includePanelSelector: true,
      });
    }),
  );

  return {
    id,
    ...(options.title ? { title: options.title } : {}),
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    ...(options.caption ? { caption: options.caption } : {}),
    subplots,
  };
}

// ---------------------------------------------------------------------------
// Subplot builder — shared by the single-chart and grid APIs
// ---------------------------------------------------------------------------

/**
 * Options for {@link buildSubplot}.
 */
interface BuildSubplotOptions {
  /** The panel's Frappe chart type. */
  chartType: FrappeChartType;
  /** Axis labels for the panel's layers. */
  axes?: { x?: string; y?: string };
  /**
   * Panel display name. MAIDR has no subplot-level title field — the FIRST
   * layer's `title` is the panel's display name in subplot summaries, so this
   * is stamped onto `layers[0]`.
   */
  panelTitle?: string;
  /**
   * When true, sets `MaidrSubplot.selector` to the panel's own SVG so the core
   * can resolve per-panel highlight and axes elements. Only useful in
   * multi-panel figures; omitted for single charts to keep their output
   * unchanged.
   */
  includePanelSelector?: boolean;
}

/**
 * Builds one {@link MaidrSubplot} from a rendered Frappe chart. All layer
 * selectors are scoped to the container's `id`, so panels never match each
 * other's SVG elements.
 */
function buildSubplot(
  chart: FrappeChart,
  container: HTMLElement,
  options: BuildSubplotOptions,
): MaidrSubplot {
  const data = chart.data;

  // Assign a stable container id (used for scoped CSS selectors).
  ensureContainerId(container);

  const layers = buildLayers(data, container.id, options);
  if (options.panelTitle && layers.length > 0) {
    layers[0] = { ...layers[0], title: options.panelTitle };
  }

  const isMultiLine = options.chartType === 'line' && data.datasets.length > 1;
  return {
    ...(isMultiLine ? { legend: data.datasets.map((d, i) => d.name ?? `Series ${i + 1}`) } : {}),
    ...(options.includePanelSelector
      ? { selector: `#${container.id} svg.frappe-chart` }
      : {}),
    layers,
  };
}

/**
 * Normalizes the panel input of {@link createMaidrFromFrappeCharts} into a 2D
 * grid, validating that the grid has at least one panel and no empty rows
 * (both crash the core figure model).
 */
function normalizePanelGrid(
  panels: FrappePanel[][] | FrappePanel[],
  columns?: number,
): FrappePanel[][] {
  if (panels.length === 0) {
    throw new Error('[maidr/frappe] createMaidrFromFrappeCharts requires at least one panel.');
  }

  if (Array.isArray(panels[0])) {
    const grid = panels as FrappePanel[][];
    grid.forEach((row, rowIndex) => {
      if (row.length === 0) {
        throw new Error(`[maidr/frappe] Panel grid row ${rowIndex} is empty.`);
      }
    });
    return grid;
  }

  const flat = panels as FrappePanel[];
  if (columns === undefined) {
    return [flat];
  }
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error(`[maidr/frappe] \`columns\` must be a positive integer, got ${columns}.`);
  }

  const grid: FrappePanel[][] = [];
  for (let i = 0; i < flat.length; i += columns) {
    grid.push(flat.slice(i, i + columns));
  }
  return grid;
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
  // Only the first dataset is converted. Frappe renders one `.dataset-{i}`
  // rect group per dataset, so scope the selector to `.dataset-0` — the
  // broad `barSelector` would match every group's rects (2N elements for N
  // data points on a 2-dataset chart) and the core bar trace drops all
  // highlighting on that count mismatch.
  if (data.datasets.length > 1) {
    console.warn(
      `[maidr/frappe] Bar chart has ${data.datasets.length} datasets; only the `
      + 'first is converted. Multi-series bar charts are not yet supported.',
    );
  }

  const dataset = data.datasets[0];
  const points: BarPoint[] = data.labels.map((label, i) => ({
    x: label,
    y: dataset.values[i],
  }));

  return {
    id: nextId('layer'),
    type: TraceType.BAR,
    orientation: Orientation.VERTICAL,
    selectors: barSelectorForDataset(containerId, 0),
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
  // `datasetIndex` is the dataset's position in `data.datasets`, which is
  // the `{i}` in the rendered `.dataset-{i}` group. Scope each layer's
  // selector to its own group so highlight elements stay aligned with the
  // layer's data points.
  return data.datasets.map((dataset, datasetIndex) => {
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
        selectors: [lineSelectorForDataset(containerId, datasetIndex)],
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
      selectors: barSelectorForDataset(containerId, datasetIndex),
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
