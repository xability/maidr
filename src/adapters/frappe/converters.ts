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
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { FrappeChart, FrappeChartType, FrappeData, FrappeDataset, FrappePanel } from './types';
import { Orientation, TraceType } from '@type/grammar';
import { toSegmentedShares } from '../shared/normalize';
import {
  barSelector,
  barSelectorForDataset,
  ensureContainerId,
  lineSelector,
  lineSelectorForDataset,
  nextId,
  percentageBarSelector,
  scatterSelector,
  sliceSelector,
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
   * Which chart was drawn, in the adapter's own names — see
   * {@link FrappeChartType}. Required because a chart instance does not expose
   * its type in a stable way, and because Frappe draws several distinct
   * statistical charts with the same `type`. Multi-line charts use `'line'`
   * (the adapter auto-detects multiple datasets).
   */
  chartType: FrappeChartType;
  /**
   * Axis labels. `z` names the dimension the series themselves vary along —
   * the two sides of a `'diverging'` chart, for instance — and is ignored by
   * the types that have no third dimension.
   */
  axes?: { x?: string; y?: string; z?: string };
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
 * The chart types whose layer belongs to the multi-line family: several series
 * read independently over one shared set of categories. Multiple datasets of
 * one of these get a selector per series plus a subplot legend naming them.
 */
const LINE_FAMILY_TYPES: ReadonlySet<FrappeChartType> = new Set<FrappeChartType>([
  'area',
  'bump',
  'line',
]);

/**
 * Options for {@link buildSubplot}.
 */
interface BuildSubplotOptions {
  /** The panel's Frappe chart type. */
  chartType: FrappeChartType;
  /** Axis labels for the panel's layers. */
  axes?: { x?: string; y?: string; z?: string };
  /**
   * The chart's `maxSlices` setting, read from the instance. Pie / donut only
   * — see {@link buildPieLayer}.
   */
  maxSlices?: number;
  /**
   * The chart's `lineOptions.regionFill` setting, read from the instance. Line
   * charts only — it fills the band between the line and the baseline, which
   * makes the chart an area chart. See {@link buildLayers}.
   */
  regionFill?: boolean;
  /**
   * Panel display name. MAIDR has no subplot-level title field — the FIRST
   * layer's `title` is the panel's display name in subplot summaries, so this
   * is stamped onto `layers[0]`.
   */
  panelTitle?: string;
}

/**
 * Builds one {@link MaidrSubplot} from a rendered Frappe chart. All layer
 * selectors are scoped to the container's `id`, so panels never match each
 * other's SVG elements.
 *
 * No `MaidrSubplot.selector` is emitted deliberately: the core resolves that
 * selector into a `visibility: hidden` clone inserted right after the match,
 * and the only whole-panel target in Frappe output is the top-level
 * `svg.frappe-chart` — an element in normal HTML flow, whose hidden clone
 * would double the panel's height on every focus. The core's visual-layout
 * pass instead measures the first element matched by each panel's first
 * layer selector (all container-id-scoped, so per-panel unique), which keeps
 * multi-row grids ordered and vertically oriented correctly.
 */
function buildSubplot(
  chart: FrappeChart,
  container: HTMLElement,
  options: BuildSubplotOptions,
): MaidrSubplot {
  const data = chart.data;

  // Assign a stable container id (used for scoped CSS selectors).
  ensureContainerId(container);

  const layers = buildLayers(data, container.id, {
    ...options,
    maxSlices: chart.config?.maxSlices,
    regionFill: Boolean(chart.lineOptions?.regionFill),
  });
  if (options.panelTitle && layers.length > 0) {
    layers[0] = { ...layers[0], title: options.panelTitle };
  }

  const isMultiLine = LINE_FAMILY_TYPES.has(options.chartType) && data.datasets.length > 1;
  return {
    ...(isMultiLine ? { legend: data.datasets.map(seriesName) } : {}),
    layers,
  };
}

/**
 * What a series is called where the grammar needs a name and the author gave
 * none — a legend entry, or a `SegmentedPoint.z`. Positional rather than
 * empty, so two unnamed series stay tellable apart.
 */
function seriesName(dataset: FrappeDataset, index: number): string {
  return dataset.name ?? `Series ${index + 1}`;
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
  options: BuildSubplotOptions,
): MaidrLayer[] {
  switch (options.chartType) {
    case 'bar':
      return [buildBarLayer(data, containerId, options)];
    case 'line':
      // A line whose region is filled is an area chart. The setting is an
      // instance field Frappe keeps verbatim, so reading it is more reliable
      // than asking the author to name the chart twice — and an author who
      // passes `chartType: 'area'` for a plain `{ data }` object, which has no
      // instance to read, lands on the same layer.
      return [buildLineLayer(
        data,
        containerId,
        options,
        options.regionFill ? TraceType.AREA : TraceType.LINE,
      )];
    case 'area':
      return [buildLineLayer(data, containerId, options, TraceType.AREA)];
    case 'bump':
      return [buildLineLayer(data, containerId, options, TraceType.BUMP)];
    case 'scatter':
      // Frappe places its marks at evenly spaced label positions whatever the
      // label holds, so a 'scatter' over category names is a dot plot rather
      // than a scatter plot — and `Number('Mon')` is `NaN`, which would leave
      // the layer with no x values at all.
      if (hasNumericLabels(data)) {
        return [buildScatterLayer(data, containerId, options)];
      }
      console.warn(
        '[maidr/frappe] Chart type \'scatter\' has non-numeric labels, which Frappe '
        + 'spaces evenly as categories rather than placing at their x values. '
        + 'Converting as a dot plot; pass chartType: \'dot\' to say so directly.',
      );
      return [buildDotLayer(data, containerId, options)];
    case 'dot':
      return [buildDotLayer(data, containerId, options)];
    case 'diverging':
      return [buildDivergingLayer(data, containerId, options)];
    case 'axis-mixed':
      return buildMixedLayers(data, containerId, options);
    case 'pie':
    case 'donut':
      return [buildPieLayer(data, containerId, options)];
    case 'percentage':
      return [buildPercentageLayer(data, containerId, options)];
    default:
      throw new Error(
        `Unsupported Frappe chart type: ${options.chartType as string}. `
        + 'Supported types: bar, line, area, bump, scatter, dot, diverging, '
        + 'axis-mixed, pie, donut, percentage.',
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

/**
 * Builds the layer for the multi-line family — line, area and bump charts.
 *
 * All three are the same geometry converted the same way: one inner array per
 * dataset, the dataset's name carried on every point, and one selector per
 * `.dataset-{i}` group. What differs is only what the chart *is*, which the
 * caller resolves and passes in, so a reader is told whether they are hearing
 * a line, a filled band, or a table of ranks.
 *
 * @param data        - The chart's labels and datasets
 * @param containerId - The chart container's id, for scoping the selectors
 * @param options     - Adapter options, for the axis labels
 * @param type        - Which of the three this chart is
 * @returns The converted layer
 */
function buildLineLayer(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
  type: TraceType.AREA | TraceType.BUMP | TraceType.LINE,
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
    type,
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
 * Whether every label is a number Frappe's marks could be placed at.
 *
 * A blank label counts as categorical: `Number('')` is `0`, so a chart with
 * one would otherwise be converted as a scatter plot with a point at the
 * origin that the chart never drew.
 */
function hasNumericLabels(data: FrappeData): boolean {
  return data.labels.every((label) => {
    if (typeof label === 'number') {
      return Number.isFinite(label);
    }
    return label.trim() !== '' && Number.isFinite(Number(label));
  });
}

/**
 * Builds the layer for a dot plot — a line chart whose connecting line is
 * hidden (`lineOptions: { hideLine: 1 }`), drawn over categories.
 *
 * This is the same rendering the adapter calls `'scatter'`, converted the
 * other way. Frappe spaces its labels evenly whatever they hold, so a chart
 * over category names places a mark *per category* rather than at an x value:
 * one category and one value per point, which is what a bar chart carries and
 * what `TraceType.DOT` reads. The marks are the `<circle>` dots of the line
 * dataset group, which is where the highlight goes.
 */
function buildDotLayer(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer {
  // Only the first dataset is converted, so scope the selector to its own
  // `.dataset-0` group: the broad line selector would match every group's
  // dots and the core drops all highlighting on the count mismatch.
  if (data.datasets.length > 1) {
    console.warn(
      `[maidr/frappe] Dot plot has ${data.datasets.length} datasets; only the `
      + 'first is converted. Multi-series dot plots are not yet supported.',
    );
  }

  const dataset = data.datasets[0];
  const points: BarPoint[] = data.labels.map((label, i) => ({
    x: label,
    y: dataset.values[i],
  }));

  return {
    id: nextId('layer'),
    type: TraceType.DOT,
    orientation: Orientation.VERTICAL,
    selectors: lineSelectorForDataset(containerId, 0),
    axes: buildAxes(options),
    data: points,
  };
}

/** Which way a series grows, read off its values rather than its position. */
type SeriesSide = 'flat' | 'mixed' | 'negative' | 'positive';

/**
 * Reads which side of the zero line a series is drawn on.
 *
 * Zeros and gaps are skipped: a band with nobody in it says nothing about the
 * side its series is on, and counting it would make an otherwise clean chart
 * look mixed.
 */
function sideOf(values: number[]): SeriesSide {
  let side: SeriesSide = 'flat';
  for (const value of values) {
    if (!Number.isFinite(value) || value === 0) {
      continue;
    }
    const here: SeriesSide = value > 0 ? 'positive' : 'negative';
    if (side === 'flat') {
      side = here;
    } else if (side !== here) {
      return 'mixed';
    }
  }
  return side;
}

/**
 * Builds the layer for a diverging bar chart — two signed bar series drawn
 * either side of Frappe's zero line, one growing down and one growing up.
 *
 * The values are emitted **as the chart draws them**, sign and all: the
 * downward series is negative. `DivergingTrace` takes the magnitude for the
 * pitch and names the side in the announcement, so a producer that stripped
 * the sign would leave it nothing to name the sides with.
 *
 * Shape is validated rather than assumed. A layer built from three series, or
 * from two that grow the same way, would still sonify — it would just describe
 * a chart with sides that are not there, which is worse than refusing, since
 * the sign is the one clue the announcement deliberately removes.
 *
 * @throws When the chart is not two series with opposite signs.
 */
function buildDivergingLayer(
  data: FrappeData,
  containerId: string,
  options: FrappeChartAdapterOptions,
): MaidrLayer {
  if (data.datasets.length !== 2) {
    throw new Error(
      '[maidr/frappe] A diverging chart needs exactly two datasets, one drawn '
      + `below the zero line and one above; got ${data.datasets.length}.`,
    );
  }

  const sides = data.datasets.map(dataset => sideOf(dataset.values));
  if (!sides.includes('negative') || !sides.includes('positive')) {
    throw new Error(
      '[maidr/frappe] A diverging chart\'s two datasets must have opposite signs '
      + `(one all-negative, one all-positive); got ${sides.join(' and ')}. `
      + 'Negate the values of the series that should grow downwards.',
    );
  }

  const sideValues: SegmentedPoint[][] = data.datasets.map((dataset, index) =>
    data.labels.map((label, i) => ({
      x: label,
      y: dataset.values[i],
      z: seriesName(dataset, index),
    })),
  );

  return {
    id: nextId('layer'),
    type: TraceType.DIVERGING,
    // Frappe has no horizontal bars, so the classic back-to-back population
    // pyramid is not drawable — only the vertical up/down form, whose
    // magnitude is on `y`.
    orientation: Orientation.VERTICAL,
    // A segmented trace maps ONE selector across every series, so this is the
    // broad all-groups selector rather than the per-dataset one the bar and
    // line layers use. Frappe appends dataset 0's rects and then dataset 1's,
    // which is the series-major order `order: 'row'` names.
    selectors: barSelector(containerId),
    domMapping: { order: 'row' },
    axes: buildAxes(options),
    data: sideValues,
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

/**
 * Frappe's own `maxSlices` default: everything past the 19th largest slice is
 * collapsed into one "Rest" wedge. Assumed when the adapter is handed a plain
 * `{ data }` object with no live config to read.
 */
const DEFAULT_MAX_SLICES = 20;

/** The label Frappe gives the collapsed tail slice. */
const REST_SLICE_LABEL = 'Rest';

/**
 * What a pie's two dimensions are called when the caller names neither. A pie
 * has no axes to take labels from, so these name what each dimension holds
 * rather than leaving the slices unlabelled.
 */
const PIE_AXIS_FALLBACKS = { x: 'Label', y: 'Value' };

/**
 * Builds the layer for a pie or donut chart.
 *
 * Frappe aggregates before it draws (`AggregationChart.calc()`, v1.6.2): it
 * sums every dataset at each label, drops any label whose total is not a
 * number `>= 0`, and — only when there are more labels than `maxSlices` —
 * sorts the totals descending and collapses the tail into a single "Rest"
 * slice. The wedges are appended in exactly that order, so the conversion has
 * to reproduce it: slice k must be wedge k or every highlight past the first
 * reordered label lands on the wrong wedge.
 *
 * The percentage each slice represents is deliberately not emitted — MAIDR's
 * pie trace derives it from the values, so there is one source of truth.
 */
function buildPieLayer(
  data: FrappeData,
  containerId: string,
  options: BuildSubplotOptions,
): MaidrLayer {
  const chartType = options.chartType === 'donut' ? 'donut' : 'pie';

  return {
    id: nextId('layer'),
    type: TraceType.PIE,
    selectors: sliceSelector(containerId, chartType),
    axes: buildAxes(options, PIE_AXIS_FALLBACKS),
    data: aggregateSlices(data, options.maxSlices ?? DEFAULT_MAX_SLICES),
  };
}

/**
 * Sums the datasets per label and collapses the tail exactly as Frappe does,
 * yielding one point per rendered wedge, in wedge order.
 */
function aggregateSlices(data: FrappeData, maxSlices: number): PiePoint[] {
  const totals: PiePoint[] = data.labels
    .map((label, i) => ({
      x: label,
      // Frappe rounds each total to four decimals before drawing it; matching
      // that keeps the announced value identical to the chart's own tooltip
      // instead of the float noise a sum of several datasets can leave.
      y: round4(data.datasets.reduce((sum, dataset) => sum + dataset.values[i], 0)),
    }))
    // A label whose datasets do not sum to a number `>= 0` gets no wedge — a
    // negative total is meaningless in a pie, and a missing value sums to NaN,
    // which fails the same comparison. Dropping both here is what keeps the
    // points index-aligned with the wedges.
    .filter(point => point.y >= 0);

  if (totals.length <= maxSlices) {
    return totals;
  }

  const sorted = [...totals].sort((a, b) => b.y - a.y);
  const rest = sorted
    .slice(maxSlices - 1)
    .reduce((sum, point) => sum + point.y, 0);
  return [...sorted.slice(0, maxSlices - 1), { x: REST_SLICE_LABEL, y: round4(rest) }];
}

/**
 * What a percentage chart's dimensions are called when the caller names none.
 *
 * `x` is the magnitude because the chart is read horizontally, and it is a
 * share* rather than a value: the layer emits percentages, not the counts the
 * author wrote. `y` names the one column, which Frappe draws as the whole bar
 * and labels nowhere.
 */
const PERCENTAGE_AXIS_FALLBACKS = { x: 'Share', y: 'Total' };

/**
 * The single column's name — what the whole bar stands for.
 *
 * A horizontal segmented layer announces its category from `y`, and a
 * percentage chart has exactly one: the grand total the bands divide up.
 */
const PERCENTAGE_COLUMN = 'Total';

/**
 * Builds the layer for a percentage chart — one bar divided into labelled
 * bands, which is a 100% stacked bar with a single column.
 *
 * Frappe builds this chart from the same `AggregationChart.calc()` as the pie:
 * measured against v1.6.2, a percentage chart and a pie given identical data
 * produce identical `state.labels` and `state.sliceTotals`, down to the
 * `maxSlices` collapse and the drop of any label whose datasets do not sum to
 * a number `>= 0`. So the bands come from {@link aggregateSlices} rather than
 * from a second copy of that arithmetic, and band k is bar k for the same
 * reason slice k is wedge k.
 *
 * The values are emitted as **shares**, through the same
 * {@link toSegmentedShares} the other 100% charts use: `NORMALIZED` divides
 * nothing itself, so an adapter that passed the counts through would pitch a
 * reader the raw numbers while every band is drawn as its fraction of one bar.
 * That trade — the counts are no longer announced — is what a percentage chart
 * draws, and is the position already settled for every other 100% chart here.
 *
 * @param data        - The chart's labels and datasets
 * @param containerId - The chart container's id, for scoping the selector
 * @param options     - Adapter options, for the axis labels and `maxSlices`
 * @returns The converted layer
 */
function buildPercentageLayer(
  data: FrappeData,
  containerId: string,
  options: BuildSubplotOptions,
): MaidrLayer {
  const slices = aggregateSlices(data, options.maxSlices ?? DEFAULT_MAX_SLICES);
  const bands: SegmentedPoint[][] = slices.map(slice => [{
    x: slice.y,
    y: PERCENTAGE_COLUMN,
    z: String(slice.x),
  }]);

  return {
    id: nextId('layer'),
    type: TraceType.NORMALIZED,
    // The bar runs across, so the magnitude is on `x` and the column on `y` —
    // which is what a horizontal segmented trace reads, and the only way round
    // that puts the share in the field it takes the pitch from.
    orientation: Orientation.HORIZONTAL,
    // A segmented trace maps ONE selector across every series and splits the
    // match itself. `order: 'row'` is series-major: band 0's rect, then band
    // 1's, which is the order Frappe appends them in. The default is
    // column-major *and* bottom-to-top, so leaving it off would hand band 0
    // the last bar rather than the first, even though there is only one column.
    selectors: percentageBarSelector(containerId),
    domMapping: { order: 'row' },
    axes: buildAxes(options, PERCENTAGE_AXIS_FALLBACKS),
    data: toSegmentedShares(bands, true),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Builds the layer's axis labels. `fallbacks` name the two dimensions of a
 * chart that has no axes to take them from (a pie), where an unlabelled layer
 * would leave the reader with nothing to call the slices or their values.
 */
function buildAxes(
  options: FrappeChartAdapterOptions,
  fallbacks?: { x: string; y: string },
): { x?: AxisConfig; y?: AxisConfig; z?: AxisConfig } {
  const axes: { x?: AxisConfig; y?: AxisConfig; z?: AxisConfig } = {};
  const x = options.axes?.x ?? fallbacks?.x;
  const y = options.axes?.y ?? fallbacks?.y;
  if (x) {
    axes.x = { label: x };
  }
  if (y) {
    axes.y = { label: y };
  }
  // No fallback: a `z` names the dimension the series vary along, and only the
  // types that have one ever read it. Naming it for the rest would put a third
  // label into an announcement that has nothing to attach it to.
  if (options.axes?.z) {
    axes.z = { label: options.axes.z };
  }
  return axes;
}
