/**
 * Data converters for transforming Google Charts data into MAIDR's schema.
 *
 * Google Charts uses a DataTable structure where:
 *   - Column 0 is typically the domain/label column
 *   - Columns 1..N are data series
 *   - Role columns (tooltip, annotation, style) are interspersed
 *
 * MAIDR uses typed data structures per chart type:
 *   BarPoint[]          = [{ x, y }, ...]
 *   LinePoint[][]       = [[{ x, y, fill? }, ...], ...]  (also the area family)
 *   PiePoint[]          = [{ x, y }, ...]  (flat: one entry per slice)
 *   ScatterPoint[]      = [{ x, y }, ...]
 *   SegmentedPoint[][]  = [[{ x, y, fill }, ...], ...]  (stacked/dodged/normalized)
 *   CandlestickPoint[]  = [{ value, open, high, low, close, ... }, ...]
 *   ErrorBarPoint[]     = [{ x, y, yMin?, yMax? }, ...]
 *   FlowPoint[]         = [{ source, target, value }, ...]  (sankey)
 *   TreemapPoint[]      = [{ x, y?, path? }, ...]
 *   WaterfallPoint[]    = [{ x, start, end, delta, kind }, ...]
 *   ChoroplethPoint[]   = [{ x, y, lon?, lat? }, ...]
 *   GanttData           = { points: [[{ x, start, end, label? }, ...], ...], ... }
 *                         — an object, not an array
 *   GaugePoint          = { value, min, max, label?, bands? }
 *                         — an object, not an array, and one layer per dial
 *   DumbbellData        = { points: [{ x, start, end }, ...], startLabel?, endLabel? }
 *                         — an object, not an array
 *   SurvivalPoint[][]   = [[{ x, y, censored?, yMin?, yMax? }, ...], ...]
 *   VolcanoPoint[]      = [{ x, y, label?, group? }, ...]  (also manhattan)
 *   NetworkPoint[]      = [{ source, target }, ...]
 */

import type {
  AxisFormat,
  BarPoint,
  CandlestickPoint,
  CandlestickSelector,
  CandlestickTrend,
  ChoroplethPoint,
  DumbbellData,
  DumbbellPoint,
  ErrorBarPoint,
  FlowPoint,
  GanttData,
  GanttPoint,
  GaugeBand,
  GaugePoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  NetworkPoint,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  SurvivalPoint,
  ThresholdOptions,
  TreemapPoint,
  VolcanoPoint,
  WaterfallKind,
  WaterfallPoint,
} from '@type/grammar';
import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
  GoogleEvents,
  GoogleGaugeOptions,
} from './types';
import { Orientation, TraceType } from '@type/grammar';
import { buildDataSelector, ensureContainerId, nextId } from './selectors';

/**
 * Tolerance (in pixels) for matching SVG rect positions to bounding boxes.
 * Google Charts positions may have floating-point imprecision.
 */
const POSITION_TOLERANCE = 2;

/**
 * Candlestick element width thresholds (in pixels).
 *
 * Google Charts renders candlesticks as SVG rect elements with varying widths:
 * - Grid lines: width ≤ 1px (horizontal or vertical axis lines)
 * - Wicks: width ≤ 3px (thin rects representing high-low range)
 * - Bodies: width > 10px (wider rects representing open-close range)
 *
 * These thresholds are based on default Google Charts rendering. They may need
 * adjustment for custom chart sizes or high-DPI displays.
 */
const CANDLESTICK_GRID_MAX_WIDTH = 1;
const CANDLESTICK_WICK_MAX_WIDTH = 3;
const CANDLESTICK_BODY_MIN_WIDTH = 10;

/**
 * Matches the elliptical-arc command in an SVG path's `d` attribute.
 *
 * Google Charts gives its pie slices no class or id, so the wedges have to be
 * told apart from the other paths in the SVG by their geometry. An arc
 * command is the one thing every wedge has and no legend swatch, axis line,
 * or gridline does; `A`/`a` cannot appear anywhere else in a `d` attribute,
 * whose only other letters are the remaining commands and the `e` of an
 * exponent.
 */
const SVG_ARC_COMMAND = /a/i;

/**
 * Matches the cubic-Bézier command in an SVG path's `d` attribute.
 *
 * The sankey package gives its ribbons no class or id either, so they are
 * told apart from the rest of the SVG the way pie wedges are: by a command
 * only they carry. A ribbon is drawn as a cubic curve between its two nodes;
 * the nodes themselves are `<rect>`s and the labels `<text>`, so nothing else
 * in a sankey's SVG is a curved path.
 */
const SVG_CUBIC_COMMAND = /c/i;

/**
 * Smallest side (in pixels) a `<rect>` must have to be a data cell rather
 * than a gridline or a rule. Mirrors {@link CANDLESTICK_GRID_MAX_WIDTH}.
 */
const CELL_MIN_SIZE = 1;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Longest span (in ms) a schedule may cover before its intervals are measured
 * in days rather than hours.
 *
 * A gantt's length is the fact the chart exists to carry, and it has to be
 * announced in a unit a reader can hold: "0.02 days" and "2880 hours" are the
 * same number said uselessly. Two days is where the two readings cross —
 * below it a schedule is an agenda measured in hours, above it a plan.
 */
const GANTT_HOURLY_MAX_SPAN = 2 * MS_PER_DAY;

/** Google's own defaults for a gauge that names neither end of its dial. */
const GAUGE_DEFAULT_MIN = 0;
const GAUGE_DEFAULT_MAX = 100;

/**
 * What the stretch of a dial the author flagged with no colour is called.
 *
 * {@link GaugeBand}s partition the range — each starts where the previous one
 * ended — while Google's bands are free-standing spans that routinely leave
 * the bottom of the dial uncoloured (`redFrom: 90, yellowFrom: 75` and nothing
 * below 75 is the commonest configuration there is). Emitting only the two
 * coloured bands would put every low value in the yellow one, so the gaps are
 * filled with a band that says exactly what it is and judges nothing.
 */
const GAUGE_UNBANDED = 'unbanded';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The facts a chart's reading needs that live in the draw options rather than
 * in the DataTable, and so have to be handed to the adapter separately.
 *
 * Shared by the single-chart and multi-panel entry points, since a panel of a
 * faceted figure may be any of the chart types that need them.
 */
export interface GoogleChartReadingOptions {
  /**
   * The `Gauge` draw options — the same object passed to `chart.draw(…)`.
   *
   * A dial's range and its coloured bands live there and nowhere else, and
   * they are most of what a gauge means: without them the reading is a bare
   * number with nothing to sit against.
   */
  gaugeOptions?: GoogleGaugeOptions;
  /**
   * Where a `'SurvivalChart'` jumps between samples — `'hv'` for a curve that
   * holds its value until the next event, which is what a Kaplan-Meier
   * estimate does.
   *
   * Omit it when you are not sure: MAIDR substitutes no default, so the
   * description stays silent about the convention rather than naming one the
   * chart never authored.
   */
  stepDirection?: StepDirection;
  /**
   * The cutoffs a `'VolcanoChart'` or `'ManhattanChart'` is read through —
   * the significance line, which side of it counts, and the effect size.
   *
   * These charts carry tens of thousands of points of which a few dozen
   * matter, and the thresholds are what make those few reachable: they drive
   * the summary on entry and the rotor filter that jumps between the hits.
   * They live in the plotted reference lines and in the analysis, never in
   * the DataTable, and MAIDR guesses none — a line at the wrong place would
   * sort every point on the figure onto the wrong side of it, silently.
   */
  thresholdOptions?: ThresholdOptions;
  /**
   * Which rows of a `'WaterfallChart'` restate the running total rather than
   * changing it — the opening and closing bars, and any subtotal drawn along
   * the way, by DataTable row index.
   *
   * Cannot be inferred: a subtotal's start and end are ordinary numbers, and
   * a reader told a subtotal "rose by 950" hears a contribution the chart
   * never made.
   */
  waterfallTotals?: readonly number[];
}

/**
 * Options accepted by {@link createMaidrFromGoogleChart}.
 */
export interface GoogleChartAdapterOptions extends GoogleChartReadingOptions {
  /** Unique ID for the MAIDR instance. Defaults to the container element's `id`. */
  id?: string;
  /** Chart title. Extracted from chart options when omitted. */
  title?: string;
  /**
   * The Google Charts chart type string (e.g. `'BarChart'`, `'LineChart'`).
   * Must be provided because the chart instance does not expose its own type.
   *
   * For stacked, normalized, or grouped (dodged) variants, use the explicit
   * adapter type strings — `'StackedColumnChart'`, `'DodgedColumnChart'`,
   * `'StackedAreaChart'`, `'NormalizedAreaChart'`. Google draws those with
   * the same class as their plain counterpart and the difference lives in the
   * draw options, which the adapter never sees. The same goes for the marks
   * Google has no class for at all — `'DotChart'`, `'LollipopChart'`,
   * `'FunnelChart'`, `'WaterfallChart'`, `'DivergingBarChart'`.
   */
  chartType: GoogleChartType;
}

/**
 * Creates a MAIDR data object from a rendered Google Charts chart.
 *
 * Call this **after** the chart has finished rendering (inside the
 * `google.visualization.events.addListener(chart, 'ready', …)` callback)
 * so that the container DOM already contains the SVG elements.
 *
 * @param chart     - The Google Charts chart instance. Used to access
 *                    `getChartLayoutInterface()` for locating SVG elements.
 * @param dataTable - The `google.visualization.DataTable` (or DataView) used
 *                    to draw the chart.
 * @param container - The DOM element the chart was drawn into.
 * @param options   - Adapter options (chart type is required).
 * @returns A {@link Maidr} object ready to be passed to `<Maidr data={…}>` or
 *          set as the `maidr` / `maidr-data` attribute.
 *
 * @example
 * ```js
 * google.charts.load('current', { packages: ['corechart'] });
 * google.charts.setOnLoadCallback(() => {
 *   const data = google.visualization.arrayToDataTable([
 *     ['City', 'Population'],
 *     ['New York', 8336817],
 *     ['Los Angeles', 3979576],
 *   ]);
 *   const container = document.getElementById('chart');
 *   const chart = new google.visualization.ColumnChart(container);
 *
 *   google.visualization.events.addListener(chart, 'ready', () => {
 *     const maidr = createMaidrFromGoogleChart(chart, data, container, {
 *       chartType: 'ColumnChart',
 *     });
 *     container.setAttribute('maidr', JSON.stringify(maidr));
 *   });
 *
 *   chart.draw(data);
 * });
 * ```
 */
export function createMaidrFromGoogleChart(
  chart: GoogleChart,
  dataTable: GoogleDataTable,
  container: HTMLElement,
  options: GoogleChartAdapterOptions,
): Maidr {
  // Assign a stable container id up-front (used for scoped CSS selectors)
  // BEFORE deriving the maidr id from it. `Element.id` is `''` (never
  // nullish) when unset, so reading it before `ensureContainerId` — and with
  // `??`, which does not treat `''` as missing — would leave `id` empty and
  // make the `nextId` fallback dead. This mirrors the Frappe adapter.
  ensureContainerId(container);

  const id = options.id ?? container.id ?? nextId('maidr-gc');
  const title = options.title ?? '';

  const layers = buildLayers(chart, dataTable, container, options.chartType, options);

  const subplot: MaidrSubplot = { layers };

  return {
    id,
    ...(title ? { title } : {}),
    subplots: [[subplot]],
  };
}

// ---------------------------------------------------------------------------
// Public API — multi-panel (faceted) figures
// ---------------------------------------------------------------------------

/**
 * One panel of a multi-panel figure — the same (chart, dataTable, container,
 * chartType) tuple {@link createMaidrFromGoogleChart} takes, plus an optional
 * panel title announced during subplot navigation.
 */
export interface GoogleChartPanel extends GoogleChartReadingOptions {
  /** The rendered Google Charts chart instance for this panel. */
  chart: GoogleChart;
  /** The DataTable (or DataView) the panel was drawn from. */
  dataTable: GoogleDataTable;
  /** The DOM element the panel was drawn into. Must be inside `options.root`. */
  container: HTMLElement;
  /** The Google Charts chart type string (see {@link GoogleChartAdapterOptions.chartType}). */
  chartType: GoogleChartType;
  /** Panel name announced in subplot summaries (e.g. the facet value). */
  title?: string;
}

/**
 * Options accepted by {@link createMaidrFromGoogleCharts}.
 */
export interface GoogleChartsGridOptions {
  /**
   * Wrapper element containing ALL panel containers. The combined `maidr`
   * attribute must be set on this element (not on the individual panel
   * containers): `root.setAttribute('maidr', JSON.stringify(maidr))`.
   */
  root: HTMLElement;
  /** Unique ID for the MAIDR instance. Defaults to the root element's `id`. */
  id?: string;
  /** Figure-level title announced when the figure receives focus. */
  title?: string;
  /**
   * Grid shape for a FLAT `panels` array, chunked row-major. `columns` wins
   * when both are given; with only `rows`, columns = ceil(n / rows). Ignored
   * when `panels` is already a 2D array.
   */
  layout?: { rows?: number; columns?: number };
}

/**
 * Tolerance (in pixels) when clustering panel containers into visual rows
 * by their `getBoundingClientRect().top`. Panels whose tops differ by no
 * more than this are considered part of the same row.
 */
const ROW_CLUSTER_TOLERANCE = 10;

/**
 * Creates a single multi-panel MAIDR figure from several rendered Google
 * Charts instances (Google Charts has no native facet/trellis concept — a
 * "faceted" page is N chart instances in N containers).
 *
 * Users navigate the resulting figure at subplot level first (arrow keys move
 * between panels, `Enter` drills into a panel, `Esc` returns).
 *
 * Grid shape, in priority order:
 * 1. `panels` is a 2D array (`GoogleChartPanel[][]`) — used directly as the
 *    subplot grid (rows may be ragged, but never empty).
 * 2. `panels` is flat and `options.layout` is given — chunked row-major.
 * 3. Otherwise the grid is inferred from the containers' on-screen geometry
 *    (clustered into rows by top edge, sorted left-to-right within a row).
 *
 * Always supply the grid in visual reading order (top-left panel first).
 *
 * Call this **after every panel has finished rendering** — see
 * {@link whenGoogleChartsReady} — then set the returned object as the `maidr`
 * attribute on `options.root` (NOT on the individual panel containers):
 *
 * @param panels  - Panel specs, flat or as a 2D grid in reading order.
 * @param options - Grid options; `root` is required.
 * @returns A single {@link Maidr} object spanning all panels.
 *
 * @example
 * ```js
 * whenGoogleChartsReady(charts, google.visualization.events, () => {
 *   const maidr = createMaidrFromGoogleCharts(
 *     panels, // [{ chart, dataTable, container, chartType, title }, …]
 *     { root: document.getElementById('grid'), layout: { columns: 2 } },
 *   );
 *   root.setAttribute('maidr', JSON.stringify(maidr));
 * });
 * charts.forEach((chart, i) => chart.draw(dataTables[i], drawOptions[i]));
 * ```
 */
export function createMaidrFromGoogleCharts(
  panels: GoogleChartPanel[] | GoogleChartPanel[][],
  options: GoogleChartsGridOptions,
): Maidr {
  const root = options.root;
  if (!root) {
    throw new Error('createMaidrFromGoogleCharts: options.root is required '
      + '(a wrapper element containing all panel containers).');
  }

  const grid = resolvePanelGrid(panels, options.layout);
  validatePanelContainers(grid, root);

  if (!root.id) {
    root.id = nextId('maidr-gc');
  }
  const id = options.id ?? root.id;
  const title = options.title ?? '';

  const subplots: MaidrSubplot[][] = grid.map(row => row.map((panel) => {
    ensureContainerId(panel.container);
    const layers = buildLayers(
      panel.chart,
      panel.dataTable,
      panel.container,
      panel.chartType,
      panel,
    );
    if (panel.title && layers.length > 0) {
      // The panel's name belongs to the panel, so it goes on the layer the
      // subplot reads its title from rather than on every layer of a chart
      // that drew more than one.
      layers[0].title = panel.title;
    }
    return {
      layers,
      selector: `#${panel.container.id} svg`,
    };
  }));

  return {
    id,
    ...(title ? { title } : {}),
    subplots,
  };
}

/**
 * Invokes `callback` once EVERY given chart has fired its `'ready'` event.
 *
 * Each Google chart fires `'ready'` independently, so a multi-panel figure
 * must not be assembled until all panels have rendered. Register the gate
 * **before** calling `chart.draw(…)` on any of the charts.
 *
 * @param charts   - The chart instances to wait for.
 * @param events   - The Google Charts event helper, `google.visualization.events`.
 * @param callback - Invoked once, after every chart has fired `'ready'`.
 *
 * @example
 * ```js
 * whenGoogleChartsReady(charts, google.visualization.events, buildMaidr);
 * charts.forEach((chart, i) => chart.draw(dataTables[i], drawOptions[i]));
 * ```
 */
export function whenGoogleChartsReady(
  charts: readonly GoogleChart[],
  events: GoogleEvents,
  callback: () => void,
): void {
  let remaining = charts.length;
  if (remaining === 0) {
    callback();
    return;
  }

  for (const chart of charts) {
    // One-shot per chart (redraws must not double-count): the real
    // `google.visualization.events` API detaches one-time listeners itself.
    events.addOneTimeListener(chart, 'ready', () => {
      remaining -= 1;
      if (remaining === 0) {
        callback();
      }
    });
  }
}

/**
 * Normalizes the `panels` argument of {@link createMaidrFromGoogleCharts}
 * into a 2D grid in visual reading order (see the strategy list there).
 */
function resolvePanelGrid(
  panels: GoogleChartPanel[] | GoogleChartPanel[][],
  layout?: { rows?: number; columns?: number },
): GoogleChartPanel[][] {
  if (panels.length === 0) {
    throw new Error('createMaidrFromGoogleCharts: at least one panel is required.');
  }

  if (Array.isArray(panels[0])) {
    const grid = panels as GoogleChartPanel[][];
    grid.forEach((row, r) => {
      if (row.length === 0) {
        throw new Error(`createMaidrFromGoogleCharts: grid row ${r} is empty.`);
      }
    });
    return grid;
  }

  const flat = panels as GoogleChartPanel[];
  const columns = resolveColumnCount(flat.length, layout);
  if (columns !== undefined) {
    return chunkRowMajor(flat, columns);
  }
  return inferGridFromGeometry(flat);
}

/**
 * Derives the column count from `options.layout`, or `undefined` when no
 * layout was requested (geometry inference applies instead).
 */
function resolveColumnCount(
  panelCount: number,
  layout?: { rows?: number; columns?: number },
): number | undefined {
  if (!layout || (layout.columns === undefined && layout.rows === undefined)) {
    return undefined;
  }
  const requested = layout.columns ?? layout.rows!;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error('createMaidrFromGoogleCharts: layout rows/columns must be a positive integer.');
  }
  return layout.columns ?? Math.ceil(panelCount / layout.rows!);
}

/** Splits a flat panel list into rows of `columns` panels (last row may be shorter). */
function chunkRowMajor(flat: GoogleChartPanel[], columns: number): GoogleChartPanel[][] {
  const grid: GoogleChartPanel[][] = [];
  for (let i = 0; i < flat.length; i += columns) {
    grid.push(flat.slice(i, i + columns));
  }
  return grid;
}

/**
 * Infers the grid from on-screen container geometry: panels are clustered
 * into rows by their bounding-rect top edge (within
 * {@link ROW_CLUSTER_TOLERANCE} pixels) and sorted left-to-right within each
 * row, yielding visual reading order.
 */
function inferGridFromGeometry(flat: GoogleChartPanel[]): GoogleChartPanel[][] {
  const entries = flat.map((panel) => {
    const rect = panel.container.getBoundingClientRect();
    return { panel, top: rect.top, left: rect.left };
  });
  entries.sort((a, b) => a.top - b.top || a.left - b.left);

  const rows: (typeof entries)[] = [];
  for (const entry of entries) {
    const currentRow = rows[rows.length - 1];
    if (currentRow && Math.abs(entry.top - currentRow[0].top) <= ROW_CLUSTER_TOLERANCE) {
      currentRow.push(entry);
    } else {
      rows.push([entry]);
    }
  }

  return rows.map(row =>
    row.sort((a, b) => a.left - b.left).map(entry => entry.panel),
  );
}

/**
 * Ensures every panel container is a proper descendant of `root` (so the
 * `maidr` attribute on `root` covers all panels), that no two panels share a
 * container (marking attributes would collide), and that no panel container
 * is nested inside another panel's container (the id-scoped descendant
 * selectors of the outer panel would also match the inner chart's elements,
 * silently disabling the outer panel's highlighting).
 */
function validatePanelContainers(grid: GoogleChartPanel[][], root: HTMLElement): void {
  const seen = new Set<HTMLElement>();
  grid.forEach((row, r) => row.forEach((panel, c) => {
    const container = panel.container;
    if (!container || container === root || !root.contains(container)) {
      throw new Error(
        `createMaidrFromGoogleCharts: panel [${r}][${c}] container must be a descendant of options.root.`,
      );
    }
    if (seen.has(container)) {
      throw new Error(
        `createMaidrFromGoogleCharts: panel [${r}][${c}] reuses a container already used by another panel.`,
      );
    }
    for (const prev of seen) {
      if (prev.contains(container) || container.contains(prev)) {
        throw new Error(
          `createMaidrFromGoogleCharts: panel [${r}][${c}] container is nested inside `
          + '(or contains) another panel\'s container; id-scoped selectors would match '
          + 'both charts\' elements.',
        );
      }
    }
    seen.add(container);
  }));
}

// ---------------------------------------------------------------------------
// Layer builders — one per supported chart type
// ---------------------------------------------------------------------------

/**
 * Converts one chart into the layers MAIDR reads it as.
 *
 * All but one chart type is a single layer. A `Gauge` is the exception: its
 * DataTable holds one row per dial and {@link GaugePoint} is a single object
 * rather than an array, so a three-dial gauge is three layers a reader pages
 * between — which is what Google drew.
 *
 * @param chart     - The Google Chart instance
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @param chartType - The chart type string the caller supplied
 * @param reading   - The facts that live in the draw options
 * @returns One or more MAIDR layers, in the order they are drawn
 * @throws When `chartType` names a type the adapter cannot convert
 */
/**
 * Which way a Google stepped area moves between its samples.
 *
 * Measured rather than assumed. On a four-category chart drawn across
 * `x = 100..500`, one of the boundary paths reads
 * `M200,196.5 L200,58.5 L300,58.5` -- a vertical riser at the A/B boundary
 * (the jump from 10 to 40), then a horizontal hold across B's band. Vertical
 * then horizontal is `'vh'` (#1055).
 */
const STEPPED_AREA_DIRECTION: StepDirection = 'vh';

function buildLayers(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  chartType: GoogleChartType,
  reading: GoogleChartReadingOptions,
): MaidrLayer[] {
  // A gauge is the one chart drawn as several traces at once, so it is
  // answered before the single-layer switch rather than inside it.
  if (chartType === 'Gauge') {
    return buildGaugeLayers(dt, container, reading.gaugeOptions);
  }

  return [buildLayer(chart, dt, container, chartType, reading)];
}

function buildLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  chartType: Exclude<GoogleChartType, 'Gauge'>,
  reading: GoogleChartReadingOptions,
): MaidrLayer {
  // Intervals are the one reading model the DataTable itself decides: a
  // `role: 'interval'` column is visible to the adapter in a way `isStacked`
  // and `intervals.style` are not. A chart that declares them draws two
  // magnitudes per sample, and reading it as a plain line or bar drops the
  // one a statistical graphic is usually drawn to show.
  const intervals = intervalColumnsFor(dt, chartType);
  if (intervals) {
    // A `BarChart` is the horizontal one; the other three interval-capable
    // types all put their values on the vertical axis.
    const orientation = chartType === 'BarChart' ? Orientation.HORIZONTAL : Orientation.VERTICAL;
    return buildErrorBarLayer(chart, dt, container, intervals, orientation);
  }

  switch (chartType) {
    case 'ColumnChart':
      return buildBarOrSegmentedLayer(chart, dt, container, Orientation.VERTICAL);
    case 'BarChart':
      return buildBarOrSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL);
    case 'LineChart':
      return buildLineLayer(chart, dt, container, TraceType.LINE);
    // A bump chart is a line chart of ranks. Everything that makes it read as
    // one — the inverted pitch, the places gained on every move — is decided
    // by the declared type, so the conversion is a line chart's.
    case 'BumpChart':
      return buildLineLayer(chart, dt, container, TraceType.BUMP);
    case 'AreaChart':
      return buildLineLayer(chart, dt, container, TraceType.AREA);
    case 'StackedAreaChart':
      return buildLineLayer(chart, dt, container, TraceType.STACKED_AREA);
    case 'NormalizedAreaChart':
      return buildLineLayer(chart, dt, container, TraceType.NORMALIZED_AREA);
    // A stepped area is an area whose boundary jumps between samples rather
    // than sliding. Read as an AREA carrying a `stepDirection` rather than as
    // a STEP, so both the fill and the staircase survive -- `AreaTrace` reads
    // that field for exactly this shape (#1055).
    case 'SteppedAreaChart':
      return buildLineLayer(chart, dt, container, TraceType.AREA, STEPPED_AREA_DIRECTION);
    case 'StackedSteppedAreaChart':
      return buildLineLayer(chart, dt, container, TraceType.STACKED_AREA, STEPPED_AREA_DIRECTION);
    case 'NormalizedSteppedAreaChart':
      return buildLineLayer(chart, dt, container, TraceType.NORMALIZED_AREA, STEPPED_AREA_DIRECTION);
    case 'PieChart':
      // No `chart`: unlike the axis-based charts, a PieChart has no
      // `getChartLayoutInterface()` to ask where each slice was drawn.
      return buildPieLayer(dt, container);
    case 'ScatterChart':
      return buildScatterLayer(chart, dt, container);
    // Both are scatters read through a threshold, and one class reads them:
    // they differ in what the x axis means and in nothing a reader navigates.
    case 'VolcanoChart':
      return buildVolcanoLayer(chart, dt, container, TraceType.VOLCANO, reading.thresholdOptions);
    case 'ManhattanChart':
      return buildVolcanoLayer(chart, dt, container, TraceType.MANHATTAN, reading.thresholdOptions);
    case 'StackedColumnChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.VERTICAL, TraceType.STACKED);
    case 'StackedBarChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL, TraceType.STACKED);
    case 'DodgedColumnChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.VERTICAL, TraceType.DODGED);
    case 'DodgedBarChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL, TraceType.DODGED);
    case 'DivergingColumnChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.VERTICAL, TraceType.DIVERGING);
    case 'DivergingBarChart':
      return buildSegmentedLayer(chart, dt, container, Orientation.HORIZONTAL, TraceType.DIVERGING);
    case 'CandlestickChart':
      return buildCandlestickLayer(chart, dt, container);
    // The three marks MAIDR reads exactly as a bar chart. A dot plot and a
    // lollipop differ from a column in what is drawn rather than in what is
    // navigated, and a funnel adds the retention the model derives itself.
    case 'DotChart':
      return buildBarLayer(chart, dt, container, Orientation.VERTICAL, TraceType.DOT);
    case 'LollipopChart':
      return buildBarLayer(chart, dt, container, Orientation.VERTICAL, TraceType.LOLLIPOP);
    case 'FunnelChart':
      // Horizontal, which is how a funnel is drawn: the stages run down the
      // page and the counts along it.
      return buildBarLayer(chart, dt, container, Orientation.HORIZONTAL, TraceType.FUNNEL);
    case 'WaterfallChart':
      return buildWaterfallLayer(dt, container, reading.waterfallTotals);
    case 'DumbbellChart':
      return buildDumbbellLayer(chart, dt, container);
    case 'SurvivalChart':
      return buildSurvivalLayer(chart, dt, container, reading.stepDirection);
    // The packages below draw without a `getChartLayoutInterface()`, so their
    // builders take no `chart` — there is no bounding box to ask for.
    case 'Sankey':
      return buildFlowLayer(dt, container);
    case 'TreeMap':
      return buildTreemapLayer(dt, container);
    case 'GeoChart':
      return buildChoroplethLayer(dt);
    case 'OrgChart':
      return buildNetworkLayer(dt);
    case 'Gantt':
      return buildGanttLayer(dt, container, 'Gantt');
    case 'Timeline':
      return buildGanttLayer(dt, container, 'Timeline');
    default:
      throw new Error(
        `Unsupported Google Charts type: ${chartType as string}. `
        + 'Supported types: AreaChart, BarChart, BumpChart, CandlestickChart, ColumnChart, '
        + 'DivergingBarChart, DivergingColumnChart, DodgedBarChart, DodgedColumnChart, '
        + 'DotChart, DumbbellChart, FunnelChart, Gantt, Gauge, GeoChart, LineChart, '
        + 'LollipopChart, ManhattanChart, NormalizedAreaChart, OrgChart, PieChart, Sankey, '
        + 'ScatterChart, StackedAreaChart, StackedBarChart, StackedColumnChart, '
        + 'SurvivalChart, Timeline, TreeMap, VolcanoChart, WaterfallChart.',
      );
  }
}

// ---------------------------------------------------------------------------
// Bar / Column — auto-detects single vs multi-series
// ---------------------------------------------------------------------------

/**
 * Inspects the DataTable and delegates to {@link buildBarLayer} for a single
 * data column, or to {@link buildSegmentedLayer} when multiple data columns
 * are present (grouped / dodged layout).
 */
function buildBarOrSegmentedLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
): MaidrLayer {
  const dataColCount = countDataColumns(dt);
  if (dataColCount > 1) {
    return buildSegmentedLayer(chart, dt, container, orientation, TraceType.DODGED);
  }
  return buildBarLayer(chart, dt, container, orientation);
}

/**
 * Builds a bar layer, or one of the three other marks MAIDR navigates exactly
 * as a bar.
 *
 * A dot plot, a lollipop and a funnel are all a category and a magnitude —
 * `BarPoint[]`, one row per category — and the trace factory routes DOT and
 * LOLLIPOP straight to `BarTrace` while `FunnelTrace` extends it. So the four
 * differ only in the declared type, which is what makes the chart announce
 * itself as the chart the author drew, and in which element carries the
 * highlight.
 *
 * @param chart       - The Google Chart instance
 * @param dt          - The DataTable the chart was drawn from
 * @param container   - The DOM container element
 * @param orientation - Which axis carries the values
 * @param traceType   - Which of the four readings the caller asked for
 * @returns The MAIDR layer
 */
function buildBarLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
  traceType: TraceType.BAR | TraceType.DOT | TraceType.LOLLIPOP | TraceType.FUNNEL = TraceType.BAR,
): MaidrLayer {
  const data: BarPoint[] = [];
  const rows = dt.getNumberOfRows();
  const dataCol = traceType === TraceType.FUNNEL
    ? funnelValueColumn(dt)
    : firstDataColumn(dt);

  const horizontal = orientation === Orientation.HORIZONTAL;

  for (let r = 0; r < rows; r++) {
    const label = formatCellValue(dt, r, 0);
    const value = numericValue(dt, r, dataCol);
    data.push(horizontal ? { x: value, y: label } : { x: label, y: value });
  }

  // A dot plot draws its values as point markers and everything else as rects
  // — a lollipop's stem is a thin bar series, and a funnel's stage is a bar.
  const selector = traceType === TraceType.DOT
    ? markPointMarkerElements(chart, container, rows, 'data-maidr-dot', 'Dot plot point')
    : markBarElements(chart, container, rows, 1);

  // A reversed category axis draws the bars from the far end while Google goes
  // on emitting the rects in row order, so the payload and the selectors turn
  // round together -- reversing one alone announces a bar and outlines another
  // (#1020, and #988 / #1000 before it). Only for the rect-drawn readings,
  // whose marks `markBarElements` stamped one by one; a funnel has no axis to
  // reverse and a dot plot's markers are stamped by another pass.
  const turnRound = (traceType === TraceType.BAR || traceType === TraceType.LOLLIPOP)
    && typeof selector === 'string'
    && selector.includes('data-maidr-bar')
    && drawsCategoriesReversed(chart, rows, horizontal);
  if (turnRound) {
    data.reverse();
  }

  return {
    id: nextId('layer'),
    type: traceType,
    orientation,
    ...(turnRound
      ? { selectors: reversedBarSelectors(container.id, rows) }
      : (selector ? { selectors: selector } : {})),
    axes: barAxes(
      dt.getColumnLabel(0) || undefined,
      dt.getColumnLabel(dataCol) || undefined,
      horizontal,
    ),
    data,
  };
}

/**
 * Whether a bar layer's payload is written the horizontal way round.
 *
 * `BarTrace` reads a `horz` layer's magnitude from `x` and its category from
 * `y` — see {@link MaidrLayer.orientation}. Declaring the key over the
 * vertical arrangement is not a mislabelling the reader can work around: the
 * magnitude field then holds a category name, `toBarValue` answers `NaN`, and
 * that is indistinguishable from a deliberate gap, so every bar of the layer
 * goes silent while the chart still loads and navigates (#955).
 *
 * @param category  - The label of the axis the categories sit on
 * @param magnitude - The label of the axis the values sit on
 * @param horizontal - Whether the layer declares `horz`
 * @returns The `axes` block paired the way the layer's points are written
 */
function barAxes(
  category: string | undefined,
  magnitude: string | undefined,
  horizontal: boolean,
): MaidrLayer['axes'] {
  // `BarTrace.text` announces each value under the label of the axis it sits
  // on, so the labels have to travel with the payload rather than stay put.
  return horizontal
    ? { x: { label: magnitude }, y: { label: category } }
    : { x: { label: category }, y: { label: magnitude } };
}

/**
 * Picks the column of a funnel table that carries the stage counts.
 *
 * A funnel has no Google class, and the recipe that draws the trapezoid look
 * stacks a **transparent padding series** under the counts to centre each bar.
 * That padding is `(widest - count) / 2`, so it grows exactly as the counts
 * fall — and read as the stages it would announce a funnel that widens.
 *
 * A funnel's counts are non-increasing by definition, which tells the two
 * apart with no option to pass: the first non-increasing data column is the
 * counts. A table with one data column takes that column either way, and a
 * table where no column is non-increasing is not a funnel, so the first data
 * column is left to be read as authored.
 *
 * @param dt - The DataTable to inspect
 * @returns The column to read the stage counts from
 */
function funnelValueColumn(dt: GoogleDataTable): number {
  const columns = dataColumns(dt);
  const rows = dt.getNumberOfRows();

  const falling = columns.find((c) => {
    for (let r = 1; r < rows; r++) {
      if (numericValue(dt, r, c) > numericValue(dt, r - 1, c)) {
        return false;
      }
    }
    return true;
  });

  return falling ?? columns[0] ?? 1;
}

// ---------------------------------------------------------------------------
// Segmented bars (stacked, dodged / grouped, normalized)
// ---------------------------------------------------------------------------

/**
 * Builds a stacked, dodged or diverging layer from the same DataTable shape.
 *
 * A diverging chart is the segmented bar's navigation with one difference that
 * lives entirely in the data: the values arrive **signed**, because the sign
 * is which side of the baseline the bar grows towards. So nothing is stripped
 * or normalised here — `DivergingTrace` pitches the magnitude and announces
 * the side, and a producer that sent absolute values would draw a pyramid with
 * both halves on the right.
 */
function buildSegmentedLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  orientation: Orientation,
  traceType: TraceType.STACKED | TraceType.DODGED | TraceType.DIVERGING,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  // Build standard data array: data[series][category]
  // - row index = series (the "Level" in text output)
  // - col index = category (x-axis value)
  //
  // Navigation:
  // - Up/Down arrows: move between series (changes row)
  // - Left/Right arrows: move between categories (changes col)
  const data: SegmentedPoint[][] = [];
  let seriesCount = 0;
  const horizontal = orientation === Orientation.HORIZONTAL;

  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;

    const series: SegmentedPoint[] = [];
    const fillLabel = dt.getColumnLabel(c) || `Series ${seriesCount + 1}`;

    for (let r = 0; r < rows; r++) {
      const label = formatCellValue(dt, r, 0);
      const value = numericValue(dt, r, c);
      series.push(
        horizontal
          ? { x: value, y: label, z: fillLabel }
          : { x: label, y: value, z: fillLabel },
      );
    }
    data.push(series);
    seriesCount++;
  }

  // Use chart API to find and mark SVG rect elements.
  // Google Charts renders DOM in row-major order (all categories for series 0,
  // then all categories for series 1, etc.), so we set domMapping.order='row'
  // to tell MAIDR to iterate in row-major order when mapping SVG elements.
  const selector = markSegmentedBarElements(chart, container, rows, seriesCount);

  return {
    id: nextId('layer'),
    type: traceType,
    orientation,
    ...(selector ? { selectors: selector } : {}),
    // 'row' tells MAIDR that DOM elements are in row-major order (series-first)
    domMapping: { order: 'row' },
    // A stack has no single value column to name — its data columns are the
    // series names, and those are the `z` *values*. So the magnitude axis is
    // left unnamed rather than borrowing 'Level', which is the label the core
    // already defaults the *band* axis to: emitting it here made a reader hear
    // "Level is Alpha … Level is 1", one word for the series and for its
    // magnitude (#961). Naming the magnitude properly needs `vAxis.title` from
    // the chart's draw options, which this adapter is not handed.
    axes: barAxes(dt.getColumnLabel(0) || undefined, undefined, horizontal),
    data,
  };
}

// ---------------------------------------------------------------------------
// Line / Area
// ---------------------------------------------------------------------------

/**
 * Builds a line layer, one of the three area layers, or a bump layer, from
 * the same DataTable shape.
 *
 * An `AreaChart`'s DataTable is a `LineChart`'s — domain in column 0, one
 * non-role column per series — and MAIDR reads them all as `LinePoint[][]`,
 * so the only difference between them is the declared trace type. Which of
 * the three area readings applies is decided by `isStacked`, which lives in
 * the draw options the adapter never receives, so the caller names it with
 * `'StackedAreaChart'` / `'NormalizedAreaChart'` — the same convention
 * `'StackedColumnChart'` already follows.
 *
 * A bump chart is here for the same reason and with more riding on it: its
 * table is any multi-series line chart's, and the `vAxis: {direction: -1}`
 * that reveals the y values are **ranks** is a draw option. Named, the model
 * inverts the pitch so rank 1 is the highest note and announces the places
 * gained on every move; unnamed, a team climbing the table is heard falling.
 *
 * The per-series values go out raw in every variant. `AreaTrace` derives the
 * running total and each band's share of it itself, so a stacked layer must
 * NOT be handed the accumulated edge.
 *
 * @param chart      - The Google Chart instance
 * @param dt         - The DataTable the chart was drawn from
 * @param container  - The DOM container element
 * @param traceType  - Which of the five readings the caller asked for
 * @returns The MAIDR layer
 */
function buildLineLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  traceType:
    | TraceType.LINE
    | TraceType.AREA
    | TraceType.STACKED_AREA
    | TraceType.NORMALIZED_AREA
    | TraceType.BUMP,
  stepDirection?: StepDirection,
): MaidrLayer {
  const cols = dt.getNumberOfColumns();
  const rows = dt.getNumberOfRows();

  // `hAxis: {direction: -1}` draws the rows from the far end while the table
  // goes on holding them in its own order, so the layer reads as the mirror
  // image of the chart unless the points are turned over (#1040). Asked of the
  // domain axis, which for every reading here is x: an inverted *value* axis
  // is how a bump chart puts rank 1 at the top and moves nothing about where
  // the categories are laid out -- which matters, because this function emits
  // that bump layer too.
  const reversed = drawsCategoriesReversed(chart, rows, false);

  // Each data column (1 .. cols-1) is a separate series.
  const data: LinePoint[][] = [];
  let seriesCount = 0;

  for (let c = 1; c < cols; c++) {
    if (isRoleColumn(dt, c))
      continue;
    const series: LinePoint[] = [];
    for (let r = 0; r < rows; r++) {
      const at = reversed ? rows - 1 - r : r;
      const x = formatCellValue(dt, at, 0);
      const y = numericValue(dt, at, c);
      const z = dt.getColumnLabel(c) || `Series ${c}`;
      series.push({ x, y, z });
    }
    data.push(series);
    seriesCount++;
  }

  // Use chart API to create synthetic point elements for each series
  const selectors = markLinePointElements(chart, container, rows, seriesCount);

  return {
    id: nextId('layer'),
    type: traceType,
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
    ...(stepDirection ? { stepDirection } : {}),
    // A line names each series with one path rather than each point with its
    // own mark, so there is no selector list to permute the way the bar path
    // does -- measured, Google emits that path's vertices in row order, so
    // `LineTrace` is told to turn the elements it parsed over instead (#1026).
    ...(reversed ? { domMapping: { pointOrder: 'reverse' as const } } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(1) || undefined },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

function buildScatterLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: ScatterPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const x = numericValue(dt, r, 0);
    const y = numericValue(dt, r, 1);
    data.push({ x, y });
  }

  // Use chart API to find and mark the correct SVG circle elements
  const selector = markScatterElements(chart, container, data);

  return {
    id: nextId('layer'),
    type: TraceType.SCATTER,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(1) || undefined },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Volcano / Manhattan
// ---------------------------------------------------------------------------

/**
 * Column roles Google lets a row carry its own name in.
 *
 * A volcano's or a Manhattan's payload is the identity of the point — the
 * gene, the SNP — and neither role is drawn as a data value, so a chart
 * carrying one has said what its points are called without adding a series.
 */
const IDENTITY_ROLES = new Set(['annotation', 'tooltip']);

/**
 * Builds a volcano or Manhattan layer from a Google Charts ScatterChart.
 *
 * Both are scatters read almost entirely through a **threshold**: a volcano
 * puts effect size against significance, a Manhattan genomic position against
 * it, and each carries tens of thousands of points of which a few dozen
 * matter. So two things this builder does are the whole reading.
 *
 * **The identity travels.** A reader told "x is 2.3, y is 14.1" has the two
 * numbers the axes already describe and not the one thing they came for,
 * which is *which gene that is*. Google carries it in a `role: 'annotation'`
 * or `role: 'tooltip'` column — one the plain scatter builder skips — and it
 * becomes {@link VolcanoPoint.label}.
 *
 * **Every series is read, not just the first.** The banding recipe for a
 * Manhattan is one data column per chromosome, each null outside its own
 * region, so a builder that stopped at column 1 would read one chromosome and
 * call it the genome. The columns are flattened into the single flat list the
 * schema fixes, each point tagged with its column's label as
 * {@link VolcanoPoint.group}, and the null cells are dropped — they are the
 * recipe's way of leaving a row out of a series, not a missing measurement.
 *
 * A single-series chart gets **no** `group`: with one column its label names
 * the y axis rather than a region, and announcing "Region: -log10(p)" on
 * every point would be inventing a split the chart does not have.
 *
 * @param chart      - The Google Chart instance
 * @param dt         - The DataTable the chart was drawn from
 * @param container  - The DOM container element
 * @param traceType  - Which of the two readings the caller asked for
 * @param thresholds - The cutoffs, when the caller declared them
 * @returns The MAIDR layer
 */
function buildVolcanoLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  traceType: TraceType.VOLCANO | TraceType.MANHATTAN,
  thresholds?: ThresholdOptions,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const columns = dataColumns(dt);

  const data: VolcanoPoint[] = [];
  const marks: PointMark[] = [];

  columns.forEach((col, series) => {
    const group = columns.length > 1 ? dt.getColumnLabel(col) : '';
    const identityCol = identityColumnFor(dt, col);

    for (let r = 0; r < rows; r++) {
      const y = numericValue(dt, r, col);
      if (!Number.isFinite(y)) {
        continue;
      }

      const point: VolcanoPoint = { x: numericValue(dt, r, 0), y };
      if (identityCol !== undefined) {
        const label = formatCellValue(dt, r, identityCol);
        if (label) {
          point.label = label;
        }
      }
      if (group) {
        point.group = group;
      }

      data.push(point);
      // The mark list is built alongside the points rather than from the row
      // count: `ScatterTrace` pairs the resolved elements with the points by
      // index, so a dropped null cell has to drop its marker too.
      marks.push({ series, row: r });
    }
  });

  const selector = markSeriesPointElements(
    chart,
    container,
    marks,
    'data-maidr-hit',
    traceType === TraceType.MANHATTAN ? 'Manhattan point' : 'Volcano point',
  );

  return {
    id: nextId('layer'),
    type: traceType,
    ...(selector ? { selectors: selector } : {}),
    ...(thresholds ? { thresholdOptions: thresholds } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      // Only a single-series chart has a column that names the y axis. On a
      // banded Manhattan the columns are chromosomes, and calling the
      // significance axis "chr1" would be worse than leaving it unnamed.
      y: { label: columns.length === 1 ? dt.getColumnLabel(columns[0]) || undefined : undefined },
    },
    data,
  };
}

/**
 * Finds the column carrying a point's own name.
 *
 * Google admits the identity in either of two places, and both are ordinary
 * on these charts: attached to the **series**, as the role columns that
 * follow its data column, or attached to the **domain**, which is what the
 * per-chromosome recipe needs — a SNP's name belongs to the row rather than
 * to whichever chromosome column happens to be non-null there.
 *
 * @param dt      - The DataTable to inspect
 * @param dataCol - The series being read
 * @returns The identity column, or undefined when the chart names no points
 */
function identityColumnFor(dt: GoogleDataTable, dataCol: number): number | undefined {
  for (let c = dataCol + 1; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c)) {
      break;
    }
    if (IDENTITY_ROLES.has(dt.getColumnRole?.(c) ?? '')) {
      return c;
    }
  }

  for (let c = 1; c < dt.getNumberOfColumns(); c++) {
    if (isRoleColumn(dt, c) && IDENTITY_ROLES.has(dt.getColumnRole?.(c) ?? '')) {
      return c;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Pie / doughnut
// ---------------------------------------------------------------------------

/**
 * Builds a pie layer from a Google Charts PieChart.
 *
 * A doughnut is the same chart class drawn with a `pieHole` option, so it
 * needs no separate branch. Column 0 supplies the slice labels and the first
 * data column their magnitudes; the share of the whole is NOT emitted — the
 * model derives it from the values, so there is exactly one source of truth.
 *
 * A PieChart is not axis-based, so `axes.x` / `axes.y` here name what the
 * slice labels mean and what their values measure rather than any drawn axis.
 */
function buildPieLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const dataCol = firstDataColumn(dt);

  const data: PiePoint[] = [];
  for (let r = 0; r < rows; r++) {
    data.push({
      x: formatCellValue(dt, r, 0),
      y: numericValue(dt, r, dataCol),
    });
  }

  const selector = markPieSliceElements(container, rows);

  return {
    id: nextId('layer'),
    type: TraceType.PIE,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(dataCol) || undefined },
    },
    data,
  };
}

/**
 * Marks the SVG wedge paths of a pie chart and returns a selector for them.
 *
 * Google Charts renders each slice as one `<path>`, in DataTable row order,
 * with no class or id to select on — so the wedges are picked out by the arc
 * command in their `d` attribute (see {@link SVG_ARC_COMMAND}), which no
 * legend swatch or axis line has.
 *
 * When the wedge count does not match the row count the mapping between data
 * and DOM is unknown, and the marks are left off entirely: a 3-D pie draws
 * several paths per slice, and `sliceVisibilityThreshold` folds tiny slices
 * into a single "Other" wedge. Highlighting the wrong slice would tell a
 * sighted collaborator one thing while the audio and text say another, so no
 * highlight is the safer answer.
 *
 * @param container - The DOM container element
 * @param sliceCount - Number of data rows (one per slice)
 * @returns CSS selector for the marked wedges, or undefined when they could
 *          not be identified with confidence
 */
function markPieSliceElements(
  container: HTMLElement,
  sliceCount: number,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  const existingMarked = svg.querySelectorAll('path[data-maidr-slice]');
  existingMarked.forEach(path => path.removeAttribute('data-maidr-slice'));

  const wedges = Array.from(svg.querySelectorAll('path'))
    .filter(path => SVG_ARC_COMMAND.test(path.getAttribute('d') ?? ''));
  if (wedges.length === 0) {
    return undefined;
  }

  if (wedges.length !== sliceCount) {
    console.warn(
      `[MAIDR] Pie slice count mismatch: expected ${sliceCount}, found ${wedges.length}. `
      + 'Visual highlighting is disabled for this chart. 3-D pies (is3D) draw several '
      + 'paths per slice, and sliceVisibilityThreshold merges small slices into one.',
    );
    return undefined;
  }

  wedges.forEach((wedge, index) => wedge.setAttribute('data-maidr-slice', `${index}`));

  return `#${container.id} svg path[data-maidr-slice]`;
}

// ---------------------------------------------------------------------------
// Candlestick
// ---------------------------------------------------------------------------

/**
 * Builds a candlestick layer from a Google Charts CandlestickChart.
 *
 * Google Charts candlestick DataTable format:
 *   - Column 0: Date/datetime (x-axis)
 *   - Column 1: Low value
 *   - Column 2: Open value
 *   - Column 3: Close value
 *   - Column 4: High value
 *
 * MAIDR CandlestickPoint format:
 *   { value, open, high, low, close, volume, trend, volatility }
 */
function buildCandlestickLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: CandlestickPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const value = formatCellValue(dt, r, 0);
    // Google Charts order: Low, Open, Close, High (columns 1-4)
    const low = numericValue(dt, r, 1);
    const open = numericValue(dt, r, 2);
    const close = numericValue(dt, r, 3);
    const high = numericValue(dt, r, 4);

    // Compute trend based on open/close relationship
    let trend: CandlestickTrend = 'Neutral';
    if (close > open) {
      trend = 'Bull';
    } else if (close < open) {
      trend = 'Bear';
    }

    data.push({
      value,
      open,
      high,
      low,
      close,
      volume: undefined, // Google Charts doesn't provide volume data
      trend,
      volatility: high - low,
    });
  }

  // Mark candlestick SVG elements and get selectors
  const selectors = markCandlestickElements(chart, container, rows);

  return {
    id: nextId('layer'),
    type: TraceType.CANDLESTICK,
    ...(selectors ? { selectors } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || 'Date' },
      y: { label: 'Price' },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

/**
 * Builds a waterfall layer from a chart drawn as floating bars.
 *
 * Google has no waterfall in its gallery, and the recipe that draws one is a
 * `CandlestickChart` with the wick collapsed onto the body: low and open both
 * set to the running total before the step, high and close both to the total
 * after. That is exactly the floating bar a waterfall needs, and it is why
 * this reads the candlestick's five-column table as well as the plain
 * `[label, start, end]` one — the two carry the same two numbers.
 *
 * `start` and `end` go out **absolute**, which is what {@link WaterfallPoint}
 * fixes, and `delta` is carried rather than left to be derived: a producer may
 * round the two totals for display, and a delta recomputed from rounded ends
 * is not the number the chart's own label shows.
 *
 * Which rows are totals cannot be inferred — an opening bar's start and end
 * are ordinary numbers — so they are named by the caller. A row that is not
 * named is an increase or a decrease according to its sign, and a step that
 * moved nothing is an increase of zero rather than a total, since calling it
 * one would claim the chart restated its running value there.
 *
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @param totals    - Row indices that restate the running total
 * @returns The MAIDR layer
 */
function buildWaterfallLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  totals: readonly number[] = [],
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const columns = dataColumns(dt);

  // Google's candlestick column order is Low, Open, Close, High, so the two
  // ends of a collapsed wick are the middle pair. A three-column table names
  // them directly.
  const isCandlestick = columns.length >= 4;
  const startCol = isCandlestick ? columns[1] : columns[0];
  const endCol = isCandlestick ? columns[2] : columns[1];

  const restated = new Set(totals);
  const data: WaterfallPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const start = numericValue(dt, r, startCol);
    const end = numericValue(dt, r, endCol);
    const kind: WaterfallKind = restated.has(r)
      ? 'total'
      : (end < start ? 'decrease' : 'increase');

    data.push({ x: formatCellValue(dt, r, 0), start, end, delta: end - start, kind });
  }

  const selector = markFloatingBarElements(container, rows);

  return {
    id: nextId('layer'),
    type: TraceType.WATERFALL,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(endCol) || undefined },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Error bars / intervals
// ---------------------------------------------------------------------------

/**
 * A data column together with the `role: 'interval'` columns attached to it.
 */
interface IntervalGroup {
  /** The column carrying the estimate. */
  dataCol: number;
  /** The interval columns that follow it, in DataTable order. */
  intervalCols: number[];
}

/**
 * Builds an error-bar layer from a chart whose DataTable declares intervals.
 *
 * Google's interval values are absolute positions on the value axis, which is
 * what {@link ErrorBarPoint} fixes as well, so nothing is converted here. A
 * chart may declare several interval pairs at once — a 95% band drawn inside
 * a 99% one — and the reading takes the outermost, because that is the bound
 * a reader asking "is this consistent with zero" wants; the inner pair has no
 * shape in the schema to travel in.
 *
 * A single interval column is read as the one bound it is, chosen by which
 * side of the estimate it falls on. The schema makes the two bounds
 * independently optional for exactly this: a one-sided interval is a real
 * chart, and inventing its other half would draw a symmetry the data does not
 * claim.
 *
 * @param chart       - The Google Chart instance
 * @param dt          - The DataTable the chart was drawn from
 * @param container   - The DOM container element
 * @param group       - The estimate column and its interval columns
 * @param orientation - Which axis carries the values
 * @returns The MAIDR layer
 */
function buildErrorBarLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  group: IntervalGroup,
  orientation: Orientation,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: ErrorBarPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const y = numericValue(dt, r, group.dataCol);
    const point: ErrorBarPoint = { x: formatCellValue(dt, r, 0), y };

    // A missing bound is left off rather than travelling as NaN: the trace
    // drops a section no point measures, and a row of silence reads as a
    // broken chart rather than as an absent bound.
    const bounds = group.intervalCols
      .map(c => numericValue(dt, r, c))
      .filter(bound => Number.isFinite(bound));

    if (bounds.length === 1) {
      if (bounds[0] <= y) {
        point.yMin = bounds[0];
      } else {
        point.yMax = bounds[0];
      }
    } else if (bounds.length > 1) {
      point.yMin = Math.min(...bounds);
      point.yMax = Math.max(...bounds);
    }

    data.push(point);
  }

  const selector = markPointMarkerElements(
    chart,
    container,
    rows,
    'data-maidr-interval',
    'Interval point',
  );

  return {
    id: nextId('layer'),
    type: TraceType.ERROR_BAR,
    orientation,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(group.dataCol) || undefined },
    },
    data,
  };
}

/**
 * Returns the interval columns of a chart that unambiguously draws intervals,
 * or `undefined` when it does not.
 *
 * Only the axis-based core charts draw intervals at all, and only a
 * single-series one can be read as an {@link ErrorBarPoint} list — that shape
 * is flat, so a second estimate column has nowhere to go. A multi-series
 * chart therefore keeps its existing reading, with the intervals dropped as
 * before, rather than silently losing one of its series.
 *
 * Note that `GoogleDataTable.getColumnRole` is optional: a DataView-like
 * object without it reports no roles, so its interval columns are read as
 * extra data series exactly as they were before this existed.
 *
 * @param dt        - The DataTable the chart was drawn from
 * @param chartType - The chart type string the caller supplied
 * @returns The sole estimate column and its intervals, or undefined
 */
function intervalColumnsFor(
  dt: GoogleDataTable,
  chartType: GoogleChartType,
): IntervalGroup | undefined {
  if (chartType !== 'LineChart' && chartType !== 'ScatterChart'
    && chartType !== 'ColumnChart' && chartType !== 'BarChart') {
    return undefined;
  }

  const groups = intervalGroups(dt);
  if (groups.length !== 1 || groups[0].intervalCols.length === 0) {
    return undefined;
  }
  return groups[0];
}

/**
 * Groups every non-role data column with the interval columns following it.
 *
 * Google attaches an interval to the data column it comes after, so the
 * pairing is positional: each `role: 'interval'` column belongs to the most
 * recent data column. Other role columns (tooltip, annotation, style) are
 * skipped without breaking a group, since Google allows them to be
 * interleaved.
 *
 * @param dt - The DataTable to inspect
 * @returns One group per data column, in DataTable order
 */
function intervalGroups(dt: GoogleDataTable): IntervalGroup[] {
  const groups: IntervalGroup[] = [];

  for (let c = 1; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c)) {
      groups.push({ dataCol: c, intervalCols: [] });
      continue;
    }
    if (dt.getColumnRole?.(c) === 'interval') {
      groups[groups.length - 1]?.intervalCols.push(c);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Dumbbell
// ---------------------------------------------------------------------------

/**
 * Builds a dumbbell layer from a chart drawn as a pair of values per category.
 *
 * Google has no dumbbell either, and two recipes draw one: a series with
 * `lineWidth: 0` whose two `role: 'interval'` columns are rendered with
 * `intervals: {style: 'sticks'}`, and a plain `[category, start, end]` table.
 * Both carry the same two numbers, so both are read here.
 *
 * The payload is the {@link DumbbellData} **object** rather than a bare array,
 * because the names of the two ends belong to the chart and not to any one
 * row. Those names are the content of the comparison: "1990" against "2020"
 * tells a reader which dot they are on, which is exactly what the legend gives
 * a sighted reader for free, and they come from the two value columns' own
 * labels.
 *
 * The change between the ends is deliberately **not** emitted. A drawn segment
 * cannot disagree with the dots it joins, so `DumbbellTrace` derives it and
 * there is one source of truth for it.
 *
 * @param chart     - The Google Chart instance
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @returns The MAIDR layer
 */
function buildDumbbellLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const { startCol, endCol } = dumbbellColumns(dt);

  const points: DumbbellPoint[] = [];
  for (let r = 0; r < rows; r++) {
    points.push({
      x: formatCellValue(dt, r, 0),
      start: numericValue(dt, r, startCol),
      end: numericValue(dt, r, endCol),
    });
  }

  // An interval column carries no label of its own, and the trace's own
  // "start" / "end" fallback says more than an empty string would.
  const startLabel = dt.getColumnLabel(startCol);
  const endLabel = dt.getColumnLabel(endCol);
  const data: DumbbellData = {
    points,
    ...(startLabel ? { startLabel } : {}),
    ...(endLabel ? { endLabel } : {}),
  };

  // One drawn marker per row, which is the shape `DumbbellTrace` asks for: it
  // highlights the same element at both ends of a row, since a chart draws one
  // connector per category rather than an element per dot. A chart drawn with
  // no point markers gets no highlight, which is the honest answer.
  const selector = markPointMarkerElements(
    chart,
    container,
    rows,
    'data-maidr-pair',
    'Dumbbell point',
  );

  return {
    id: nextId('layer'),
    type: TraceType.DUMBBELL,
    orientation: Orientation.VERTICAL,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      // No `y`: the two value columns are named after the *ends* being
      // compared, and they travel as `startLabel` / `endLabel`. Taking either
      // as the axis name would announce the quantity as one of its own ends.
    },
    data,
  };
}

/**
 * Locates the two columns a dumbbell's ends are read from.
 *
 * The intervals recipe hides its estimate (`lineWidth: 0`) and draws the pair
 * as intervals, so the two ends are the interval columns there; the plain
 * table puts them in the first two data columns. A table that carries neither
 * pair falls through to columns 1 and 2, which reads whatever is there rather
 * than failing silently on a chart that is nearly a dumbbell.
 *
 * @param dt - The DataTable to inspect
 * @returns The columns the segment runs between
 */
function dumbbellColumns(dt: GoogleDataTable): { startCol: number; endCol: number } {
  const groups = intervalGroups(dt);
  const intervals = groups.length === 1 ? groups[0].intervalCols : [];
  const columns = intervals.length >= 2 ? intervals : dataColumns(dt);

  const startCol = columns[0] ?? 1;
  const endCol = columns[1] ?? startCol + 1;
  return { startCol, endCol };
}

// ---------------------------------------------------------------------------
// Survival (Kaplan-Meier)
// ---------------------------------------------------------------------------

/**
 * One arm of a survival figure: its estimate, its band, and its censoring.
 */
interface SurvivalArm {
  /** The column carrying the survival probability. */
  dataCol: number;
  /** The `role: 'interval'` columns drawing its confidence band. */
  intervalCols: number[];
  /** The boolean column marking the times a subject was censored. */
  censorCol?: number;
}

/**
 * Builds a survival layer from a chart drawn as a Kaplan-Meier curve.
 *
 * Google draws a step line as a `SteppedAreaChart` with `areaOpacity: 0`, and
 * the table is a step chart's: times in column 0, one probability column per
 * arm. What a survival figure carries that a step chart does not is the two
 * things it is actually read for.
 *
 * **The confidence band**, from the arm's `role: 'interval'` columns — the
 * same columns an error bar chart declares, and read the same way, outermost
 * pair first. Both bounds or neither: a lone interval column is half a band,
 * and emitting it twice would announce a band of zero width at every time.
 *
 * **Censoring**, from a boolean column attached to the arm. A censored time is
 * a subject who left the study without the event happening, so the curve does
 * not step there — which is exactly why nothing else in the announcement
 * distinguishes it, and why a reader without it cannot tell a flat tail backed
 * by two hundred subjects from one backed by three. A boolean column is never
 * read as an arm, whether or not it declares a role: no survival curve is
 * drawn from true and false.
 *
 * Times go out **numeric** when the column is, rather than as formatted
 * strings: median survival and the separation between arms are read off the
 * time axis, and a categorical x is answered with silence.
 *
 * @param chart         - The Google Chart instance
 * @param dt            - The DataTable the chart was drawn from
 * @param container     - The DOM container element
 * @param stepDirection - Where the curve jumps, when the caller declared it
 * @returns The MAIDR layer
 */
function buildSurvivalLayer(
  chart: GoogleChart,
  dt: GoogleDataTable,
  container: HTMLElement,
  stepDirection?: StepDirection,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const arms = survivalArms(dt);
  const numericTime = dt.getColumnType(0) === 'number';

  const data: SurvivalPoint[][] = arms.map((arm) => {
    const name = dt.getColumnLabel(arm.dataCol);
    const curve: SurvivalPoint[] = [];

    for (let r = 0; r < rows; r++) {
      const point: SurvivalPoint = {
        x: numericTime ? numericValue(dt, r, 0) : formatCellValue(dt, r, 0),
        y: numericValue(dt, r, arm.dataCol),
        ...(name ? { z: name } : {}),
      };

      const bounds = arm.intervalCols
        .map(c => numericValue(dt, r, c))
        .filter(bound => Number.isFinite(bound));
      if (bounds.length > 1) {
        point.yMin = Math.min(...bounds);
        point.yMax = Math.max(...bounds);
      }

      if (arm.censorCol !== undefined && dt.getValue(r, arm.censorCol) === true) {
        point.censored = true;
      }

      curve.push(point);
    }
    return curve;
  });

  // The line family's marking path: one `fill="none"` outline per arm, whose
  // `d` is the step polyline `StepTrace` knows how to read back. A curve drawn
  // as a filled band and nothing else has no outline, and gets no highlight
  // rather than a highlight placed on the band's baseline corners.
  const selectors = markLinePointElements(chart, container, rows, arms.length);

  return {
    id: nextId('layer'),
    type: TraceType.SURVIVAL,
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
    ...(stepDirection ? { stepDirection } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      // Only a one-armed figure has a column naming what is being estimated.
      // With two arms the labels are the arms, and calling the probability
      // axis "Treatment" would name the wrong thing.
      y: { label: arms.length === 1 ? dt.getColumnLabel(arms[0].dataCol) || undefined : undefined },
    },
    data,
  };
}

/**
 * Splits a survival table into its arms.
 *
 * Positional in the same way {@link intervalGroups} is — an interval belongs
 * to the data column it follows — with one addition: a **boolean** column is
 * the censoring flag of the arm before it rather than an arm of its own,
 * whether it declares a role (Google's `certainty`) or not. Read as an arm it
 * would sonify true and false as 1 and 0 and draw a second curve that is not
 * in the chart.
 *
 * @param dt - The DataTable to inspect
 * @returns One entry per arm, in DataTable order
 */
function survivalArms(dt: GoogleDataTable): SurvivalArm[] {
  const arms: SurvivalArm[] = [];

  for (let c = 1; c < dt.getNumberOfColumns(); c++) {
    const arm = arms[arms.length - 1];

    if (dt.getColumnType(c) === 'boolean') {
      if (arm && arm.censorCol === undefined) {
        arm.censorCol = c;
      }
      continue;
    }

    if (isRoleColumn(dt, c)) {
      if (dt.getColumnRole?.(c) === 'interval') {
        arm?.intervalCols.push(c);
      }
      continue;
    }

    arms.push({ dataCol: c, intervalCols: [] });
  }

  return arms;
}

// ---------------------------------------------------------------------------
// Sankey
// ---------------------------------------------------------------------------

/**
 * Builds a sankey layer from a Google Charts Sankey.
 *
 * The DataTable is fixed: column 0 names the node a flow leaves, column 1 the
 * node it arrives at, and the first data column after them carries how much
 * flows. No node list is built — a flow names both of its ends, so `FlowTrace`
 * derives the nodes from the edges and a second list would be a second source
 * of truth for them.
 *
 * A Sankey is not axis-based, so `axes.x` / `axes.y` name what the nodes are
 * and what their weights measure rather than any drawn axis.
 *
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @returns The MAIDR layer
 */
function buildFlowLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const weightCol = nextDataColumn(dt, 2) ?? 2;

  const data: FlowPoint[] = [];
  for (let r = 0; r < rows; r++) {
    data.push({
      source: formatCellValue(dt, r, 0),
      target: formatCellValue(dt, r, 1),
      value: numericValue(dt, r, weightCol),
    });
  }

  const selector = markFlowRibbonElements(container, rows);

  return {
    id: nextId('layer'),
    type: TraceType.SANKEY,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(weightCol) || undefined },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Treemap
// ---------------------------------------------------------------------------

/**
 * Builds a treemap layer from a Google Charts TreeMap.
 *
 * The DataTable is fixed: column 0 is the node's id (which is also its
 * label), column 1 its parent's id — null on the single root row — and the
 * first data column after them its size. MAIDR addresses a node by its
 * **path** rather than by a parent pointer, so the parent column is turned
 * into a `Map` and walked upward once per row.
 *
 * A row that is some other row's parent gets no `y`. Google's convention is
 * that an interior node's size is the sum of its children's and its own cell
 * carries a placeholder (`0`, or null), and emitting that placeholder would
 * be read as a declared value the trace keeps in preference to the sum — so
 * the whole chart would announce a total of zero.
 *
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @returns The MAIDR layer
 */
function buildTreemapLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const sizeCol = nextDataColumn(dt, 2) ?? 2;

  // Identity comes from the raw values, not the formatted ones: a parent
  // pointer has to match the id it names exactly, and a formatter applied to
  // one column and not the other would break every path in the chart.
  const parentOf = new Map<string, string>();
  const hasChildren = new Set<string>();
  for (let r = 0; r < rows; r++) {
    const id = rawKey(dt, r, 0);
    const parent = dt.getValue(r, 1);
    if (parent !== null && parent !== undefined && parent !== '') {
      parentOf.set(id, String(parent));
      hasChildren.add(String(parent));
    }
  }

  const data: TreemapPoint[] = [];
  for (let r = 0; r < rows; r++) {
    const id = rawKey(dt, r, 0);
    const path = ancestorsOf(id, parentOf);
    data.push({
      x: id,
      ...(hasChildren.has(id) ? {} : { y: numericValue(dt, r, sizeCol) }),
      ...(path.length > 0 ? { path } : {}),
    });
  }

  const selector = markRectCellElements(container, rows, 'data-maidr-cell', 'TreeMap cell');

  return {
    id: nextId('layer'),
    type: TraceType.TREEMAP,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      y: { label: dt.getColumnLabel(sizeCol) || undefined },
    },
    data,
  };
}

/**
 * Walks a node's parent pointers upward into the path MAIDR addresses it by.
 *
 * @param id       - The node to walk from
 * @param parentOf - Every declared child-to-parent pointer
 * @returns The node's ancestors, root first, excluding the node itself
 */
function ancestorsOf(id: string, parentOf: Map<string, string>): string[] {
  const path: string[] = [];
  // A malformed table can name a cycle. Stopping at the first node already
  // seen keeps the walk finite and leaves the partial path, which still
  // places the node under the ancestors that are real.
  const seen = new Set<string>([id]);

  let at = parentOf.get(id);
  while (at !== undefined && !seen.has(at)) {
    path.unshift(at);
    seen.add(at);
    at = parentOf.get(at);
  }
  return path;
}

// ---------------------------------------------------------------------------
// Choropleth (GeoChart)
// ---------------------------------------------------------------------------

/**
 * Builds a choropleth layer from a Google Charts GeoChart.
 *
 * A GeoChart takes either of two DataTable shapes, and the columns say which:
 * a **regions** table names a place in column 0 and shades it by column 1,
 * while a **markers** table drawn from coordinates puts a latitude in column 0
 * and a longitude in column 1, with the name and the value after them. Only
 * the second gives MAIDR the centroids, and those are what turn the reading
 * from a list of places into a walk across the map — up is north, left is
 * west — so they are taken whenever the table carries them.
 *
 * A regions table cannot supply them: Google resolves a region name to a
 * drawn shape inside its own geo data and exposes no centroid for it. The
 * schema is explicit that a layer declaring none is read in declared order
 * instead, which is the poorer reading the data supports rather than a set of
 * positions invented for it. `neighbors` is not recoverable either way.
 *
 * **No highlighting.** A GeoChart paints every region of the chosen
 * resolution, not only the rows it was given, and its paths carry no class or
 * id — so even a chart whose row count matched the drawn shapes exactly would
 * be matched in Google's own geographic order rather than the DataTable's, and
 * the highlight would sit on a different country from the one being announced.
 * That is worse than none, which is the rule the pie wedges already follow.
 *
 * @param dt - The DataTable the chart was drawn from
 * @returns The MAIDR layer
 */
function buildChoroplethLayer(dt: GoogleDataTable): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const placed = dt.getNumberOfColumns() > 1
    && dt.getColumnType(0) === 'number'
    && dt.getColumnType(1) === 'number';

  // In a coordinate table the region's own name is the first string column
  // after the pair, and the value the first number column after it.
  const nameCol = placed ? stringColumn(dt, 2) : 0;
  const valueCol = placed ? (numberColumn(dt, 2) ?? 2) : firstDataColumn(dt);

  const data: ChoroplethPoint[] = [];
  for (let r = 0; r < rows; r++) {
    const point: ChoroplethPoint = {
      x: nameCol === undefined
        // A marker table need not name its markers. The coordinate pair is
        // then the only identity the row has, and it is a truthful one.
        ? `${formatCellValue(dt, r, 0)}, ${formatCellValue(dt, r, 1)}`
        : formatCellValue(dt, r, nameCol),
      y: numericValue(dt, r, valueCol),
    };

    if (placed) {
      point.lat = numericValue(dt, r, 0);
      point.lon = numericValue(dt, r, 1);
    }

    data.push(point);
  }

  return {
    id: nextId('layer'),
    type: TraceType.CHOROPLETH,
    axes: {
      // Only when a column names the regions. Falling back to column 0 on a
      // coordinate table would call the region axis "Lat".
      x: { label: nameCol === undefined ? undefined : dt.getColumnLabel(nameCol) || undefined },
      y: { label: dt.getColumnLabel(valueCol) || undefined },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Network (OrgChart)
// ---------------------------------------------------------------------------

/**
 * Builds a network layer from a Google Charts OrgChart.
 *
 * The DataTable is `[node id (+ optional formatted name), parent id, tooltip]`
 * and it maps straight onto {@link NetworkPoint}: one link per row that names
 * a parent, from the parent to the node. No node list is emitted —
 * `NetworkTrace` derives the nodes and their degrees from the links, exactly
 * as `FlowTrace` does, and a second list would be a second source of truth for
 * them.
 *
 * Identity comes from the **raw** cell rather than the formatted one, because
 * a parent pointer has to match the id it names: an OrgChart routinely puts
 * markup in the formatted value (`{v: 'Mike', f: 'Mike<div>President</div>'}`)
 * and matching on that would leave every node a root.
 *
 * A row whose parent is empty is the tree's root and contributes no link,
 * which is right rather than lossy: it reaches the graph as the source of its
 * children's links.
 *
 * **No highlighting.** An OrgChart renders an HTML `<table>` rather than SVG,
 * and draws no element per link at all — the connectors are cell borders. The
 * selectors are typed for SVG elements throughout the model, so there is
 * nothing here to point at; audio, text and braille carry the whole graph.
 *
 * @param dt - The DataTable the chart was drawn from
 * @returns The MAIDR layer
 */
function buildNetworkLayer(dt: GoogleDataTable): MaidrLayer {
  const rows = dt.getNumberOfRows();
  const data: NetworkPoint[] = [];

  for (let r = 0; r < rows; r++) {
    const parent = dt.getValue(r, 1);
    if (parent === null || parent === undefined || parent === '') {
      continue;
    }
    data.push({ source: String(parent), target: rawKey(dt, r, 0) });
  }

  return {
    id: nextId('layer'),
    type: TraceType.NETWORK,
    axes: {
      x: { label: dt.getColumnLabel(0) || undefined },
      // A network has no second axis, and the trace announces the node's
      // **degree** under this label on every move. "Links: 3" is what that
      // number is; the schema's fallback would call it "Y".
      y: { label: 'Links' },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

/**
 * Builds one layer per dial of a Google Charts Gauge.
 *
 * The DataTable is `[Label, Value]` rows and Google draws one dial for each,
 * side by side in a single container. {@link GaugePoint} is a single object
 * rather than an array — a gauge draws exactly one measure — so a three-row
 * table becomes three layers a reader pages between, which is the shape the
 * chart actually has.
 *
 * The dial's range and its coloured bands are **not in the DataTable**. They
 * live in the draw options, which the adapter never receives, so the caller
 * hands them over as {@link GoogleChartAdapterOptions.gaugeOptions}. Without
 * them the dial falls back to Google's own defaults of 0 to 100 and no bands,
 * which is a correct reading of a gauge drawn with the defaults and a wrong
 * one of any other — so pass them.
 *
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @param options   - The gauge draw options, when the caller supplied them
 * @returns One MAIDR layer per dial, in DataTable row order
 */
function buildGaugeLayers(
  dt: GoogleDataTable,
  container: HTMLElement,
  options: GoogleGaugeOptions = {},
): MaidrLayer[] {
  const rows = dt.getNumberOfRows();
  const valueCol = firstDataColumn(dt);

  const min = options.min ?? GAUGE_DEFAULT_MIN;
  const max = options.max ?? GAUGE_DEFAULT_MAX;
  const bands = gaugeBands(options, min);

  const selectors = markGaugeDialElements(container, rows);

  const layers: MaidrLayer[] = [];
  for (let r = 0; r < rows; r++) {
    const label = formatCellValue(dt, r, 0);
    const data: GaugePoint = {
      value: numericValue(dt, r, valueCol),
      min,
      max,
      ...(label ? { label } : {}),
      ...(bands ? { bands } : {}),
    };

    layers.push({
      id: nextId('layer'),
      type: TraceType.GAUGE,
      // Every dial is a gauge, so the trace type cannot tell two of them
      // apart on a layer switch. The measure's own name can.
      ...(label ? { name: label } : {}),
      ...(selectors ? { selectors: selectors[r] } : {}),
      axes: {
        x: { label: dt.getColumnLabel(0) || undefined },
        y: { label: dt.getColumnLabel(valueCol) || undefined },
      },
      data,
    });
  }

  return layers;
}

/**
 * Turns Google's coloured spans into the ascending bands MAIDR reads.
 *
 * The two models differ in a way that matters: a {@link GaugeBand} carries
 * only its upper edge, because bands partition the range and each starts where
 * the previous one ended, while Google's `greenFrom`/`greenTo` triples are
 * free-standing spans that may leave stretches of the dial uncoloured. The
 * commonest configuration of all — a red band at the top, a yellow one under
 * it, nothing below — leaves most of the dial bare, and emitting the two
 * coloured bands alone would report every low value as yellow.
 *
 * So the gaps are filled: wherever the next declared span starts above where
 * the last one ended, a {@link GAUGE_UNBANDED} band covers the difference. A
 * gap left at the *top* needs nothing, since a value above every band is
 * already reported as belonging to none.
 *
 * @param options - The gauge draw options
 * @param min     - The dial's lower end, where the first band starts
 * @returns The bands in ascending order, or undefined when none were declared
 */
function gaugeBands(options: GoogleGaugeOptions, min: number): GaugeBand[] | undefined {
  const declared = [
    { label: 'green', from: options.greenFrom, to: options.greenTo },
    { label: 'yellow', from: options.yellowFrom, to: options.yellowTo },
    { label: 'red', from: options.redFrom, to: options.redTo },
  ]
    .filter((band): band is { label: string; from: number; to: number } =>
      typeof band.from === 'number' && typeof band.to === 'number')
    .sort((a, b) => a.from - b.from);

  if (declared.length === 0) {
    return undefined;
  }

  const bands: GaugeBand[] = [];
  let edge = min;
  for (const band of declared) {
    if (band.from > edge) {
      bands.push({ to: band.from, label: GAUGE_UNBANDED });
    }
    bands.push({ to: band.to, label: band.label });
    edge = band.to;
  }
  return bands;
}

// ---------------------------------------------------------------------------
// Gantt / timeline
// ---------------------------------------------------------------------------

/**
 * The columns a schedule is read out of, whichever package drew it.
 */
interface GanttColumns {
  /** The column naming the lane a row belongs to. */
  laneCol: number;
  /** The column naming the individual interval, when the lane does not. */
  labelCol?: number;
  /** Where the interval begins. */
  startCol: number;
  /** Where it ends. */
  endCol: number;
}

/**
 * Builds a gantt layer from a Google Charts Gantt or Timeline.
 *
 * The two packages draw the same thing from different tables — a Gantt's row
 * is `[Task ID, Task Name, (Resource), Start, End, Duration, Percent, Deps]`
 * and a Timeline's is `[Row label, (Bar label), (tooltip), Start, End]` — so
 * they share this builder and differ only in which column names the lane.
 * Each package's own grouping is preserved: a Gantt draws one row per task
 * and a Timeline merges the rows sharing a label into one, which is why a
 * Timeline's bar label becomes {@link GanttPoint.label} and a Gantt's task
 * name becomes the lane itself.
 *
 * Dates are converted to hours or days rather than to milliseconds. The
 * length of an interval is what a schedule is drawn to compare, and MAIDR
 * announces it as a bare number with {@link GanttData.unit} appended: left in
 * epoch milliseconds every task would be announced as an unreadable
 * eight-digit figure. The ends stay readable because the axis carries a
 * format that turns the same unit back into a date.
 *
 * @param dt        - The DataTable the chart was drawn from
 * @param container - The DOM container element
 * @param chartType - Which of the two packages drew it
 * @returns The MAIDR layer
 */
function buildGanttLayer(
  dt: GoogleDataTable,
  container: HTMLElement,
  chartType: 'Gantt' | 'Timeline',
): MaidrLayer {
  const columns = ganttColumns(dt, chartType);
  const rows = dt.getNumberOfRows();
  const scale = ganttScale(dt, columns, rows);

  // First appearance decides lane order, which is the order both packages
  // draw their rows in.
  const laneIndex = new Map<string, number>();
  const points: GanttPoint[][] = [];
  const lanes: string[] = [];
  // Which lane each row landed in, so the drawn bars can be told apart from
  // the order MAIDR walks them in (see below).
  const laneOfRow: number[] = [];

  for (let r = 0; r < rows; r++) {
    const lane = formatCellValue(dt, r, columns.laneCol);
    let index = laneIndex.get(lane);
    if (index === undefined) {
      index = points.length;
      laneIndex.set(lane, index);
      points.push([]);
      lanes.push(lane);
    }

    const point: GanttPoint = {
      x: lane,
      start: scale.toAxis(dt.getValue(r, columns.startCol)),
      end: scale.toAxis(dt.getValue(r, columns.endCol)),
    };

    // Only when it says something the lane does not: a Timeline whose bar
    // label repeats its row label would otherwise announce the name twice.
    if (columns.labelCol !== undefined) {
      const label = formatCellValue(dt, r, columns.labelCol);
      if (label && label !== lane) {
        point.label = label;
      }
    }

    points[index].push(point);
    laneOfRow.push(index);
  }

  const data: GanttData = {
    points,
    lanes,
    ...(scale.unit ? { unit: scale.unit } : {}),
  };

  // `GanttTrace` slices the marked bars lane by lane, so the drawn order has
  // to be the lane order too. Google draws in DataTable row order, which is
  // lane order exactly when the rows of a lane are already contiguous — every
  // Gantt (one lane per task) and every Timeline whose rows are authored
  // together. A table that interleaves its lanes would mark the bars in an
  // order the trace reads as another lane's, so it gets no marks at all.
  const grouped = isGroupedByLane(laneOfRow);
  if (!grouped) {
    console.warn(
      `[MAIDR] ${chartType}: rows of the same lane are not contiguous in the DataTable, `
      + 'so the drawn bars cannot be matched to the lanes. Visual highlighting is '
      + 'disabled for this chart.',
    );
  }
  const selector = grouped
    ? markRectCellElements(container, rows, 'data-maidr-lane-bar', `${chartType} bar`)
    : undefined;

  return {
    id: nextId('layer'),
    type: TraceType.GANTT,
    // A schedule runs its bars left to right, which puts the axis on x and
    // the lanes on y — the opposite of the trace's default.
    orientation: Orientation.HORIZONTAL,
    ...(selector ? { selectors: selector } : {}),
    axes: {
      x: {
        label: dt.getColumnLabel(columns.startCol) || undefined,
        ...(scale.format ? { format: scale.format } : {}),
      },
      y: { label: dt.getColumnLabel(columns.laneCol) || undefined },
    },
    data,
  };
}

/**
 * Locates the columns a schedule is read out of.
 *
 * The two date columns are found by type rather than by position, because a
 * Gantt's optional Resource column and a Timeline's optional bar-label and
 * tooltip columns both shift everything after them. The lane is the one fixed
 * difference between the packages: a Gantt names its row in column 1 (Task
 * Name, column 0 being an id the chart never shows), a Timeline in column 0.
 *
 * @param dt        - The DataTable to inspect
 * @param chartType - Which of the two packages drew it
 * @returns The columns to read
 */
function ganttColumns(dt: GoogleDataTable, chartType: 'Gantt' | 'Timeline'): GanttColumns {
  const laneCol = chartType === 'Gantt' && dt.getNumberOfColumns() > 1 ? 1 : 0;

  const dateCols: number[] = [];
  const numberCols: number[] = [];
  for (let c = laneCol + 1; c < dt.getNumberOfColumns(); c++) {
    if (isRoleColumn(dt, c)) {
      continue;
    }
    const type = dt.getColumnType(c);
    if (type === 'date' || type === 'datetime') {
      dateCols.push(c);
    } else if (type === 'number') {
      numberCols.push(c);
    }
  }

  // Both packages require dates, but a DataView that has lost its column
  // types still has to be read from somewhere: the two ends are then the
  // first two numeric columns, which is where Google puts them.
  const ends = dateCols.length >= 2 ? dateCols : numberCols;
  const startCol = ends[0] ?? laneCol + 1;
  const endCol = ends[1] ?? startCol + 1;

  // A Timeline's bar label is the column between the row label and the dates,
  // when it declared one; a Gantt has no such column — its task name is the
  // lane.
  const labelCol = chartType === 'Timeline' && startCol > 1
    && !isRoleColumn(dt, 1) && dt.getColumnType(1) === 'string'
    ? 1
    : undefined;

  return { laneCol, labelCol, startCol, endCol };
}

/**
 * How a schedule's dates map onto the axis MAIDR announces.
 */
interface GanttScale {
  /** Converts one cell value to its axis position. */
  toAxis: (raw: unknown) => number;
  /** What one axis unit is called, when the columns hold dates. */
  unit?: string;
  /** Turns an axis position back into a date for the announcement. */
  format?: AxisFormat;
}

/**
 * Chooses the unit a schedule's intervals are measured in.
 *
 * A table whose ends are plain numbers is left alone — the producer already
 * chose a unit and the adapter has no name for it. Dates are divided down to
 * hours or days depending on how much of the axis the chart covers, and the
 * axis gets a format that renders the same number back as a date, so the ends
 * read as dates while the length reads as a count of the unit.
 *
 * @param dt      - The DataTable the chart was drawn from
 * @param columns - Where the dates are
 * @param rows    - How many rows to inspect
 * @returns The conversion, unit and axis format
 */
function ganttScale(dt: GoogleDataTable, columns: GanttColumns, rows: number): GanttScale {
  const stamps: number[] = [];
  let allDates = rows > 0;

  for (let r = 0; r < rows; r++) {
    for (const c of [columns.startCol, columns.endCol]) {
      const raw = dt.getValue(r, c);
      if (raw instanceof Date) {
        stamps.push(raw.getTime());
      } else {
        allDates = false;
      }
    }
  }

  if (!allDates) {
    return { toAxis: raw => Number(raw) };
  }

  const span = Math.max(...stamps) - Math.min(...stamps);
  const hourly = span <= GANTT_HOURLY_MAX_SPAN;
  const perUnit = hourly ? MS_PER_HOUR : MS_PER_DAY;

  return {
    toAxis: raw => (raw instanceof Date ? raw.getTime() / perUnit : Number.NaN),
    unit: hourly ? 'hours' : 'days',
    format: {
      function: hourly
        ? `return new Date(value * ${MS_PER_HOUR}).toLocaleString()`
        : `return new Date(value * ${MS_PER_DAY}).toLocaleDateString()`,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers — cell value extraction
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable string for a cell value.
 *
 * Prefers the formatted value (which respects locale and date formatting)
 * and only falls back to the raw value when the formatted string is empty.
 */
function formatCellValue(dt: GoogleDataTable, row: number, col: number): string {
  const formatted = dt.getFormattedValue(row, col);
  if (formatted)
    return formatted;

  const raw = dt.getValue(row, col);
  if (raw instanceof Date)
    return raw.toLocaleDateString();
  return String(raw ?? '');
}

/**
 * Returns a cell's raw value as an identity key.
 *
 * Distinct from {@link formatCellValue}, which prefers the formatted string:
 * a hierarchy's parent pointers have to match the ids they name exactly, and
 * a formatter applied to the id column but not the parent column would break
 * every path in the chart.
 */
function rawKey(dt: GoogleDataTable, row: number, col: number): string {
  return String(dt.getValue(row, col) ?? '');
}

/**
 * Extracts a numeric value from a cell, returning `NaN` for genuinely
 * missing data instead of silently coercing it to `0`.
 */
function numericValue(dt: GoogleDataTable, row: number, col: number): number {
  const raw = dt.getValue(row, col);
  if (raw === null || raw === undefined)
    return Number.NaN;
  return Number(raw);
}

// ---------------------------------------------------------------------------
// Helpers — DataTable inspection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when column `c` is a "role" column (tooltip, annotation,
 * style, etc.) rather than a data column.
 */
function isRoleColumn(dt: GoogleDataTable, c: number): boolean {
  if (dt.getColumnRole) {
    const role = dt.getColumnRole(c);
    return role !== '' && role !== 'data';
  }
  return false;
}

/**
 * Returns the index of the first non-role data column.
 *
 * Defensive: a DataTable may carry a role column (tooltip, style, …) directly
 * after the domain column, so column 1 is not necessarily data. Falls back to
 * column 1 when every column past the domain is a role column, which leaves
 * the value lookup to fail loudly rather than silently reading a tooltip.
 */
function firstDataColumn(dt: GoogleDataTable): number {
  return nextDataColumn(dt, 1) ?? 1;
}

/**
 * Returns the index of the first non-role data column at or after `from`, or
 * `undefined` when every remaining column carries a role.
 *
 * The fixed-shape packages need this: a Sankey's weight and a TreeMap's size
 * are "the column after the two identity columns", which a tooltip column
 * sitting between them would otherwise displace.
 */
function nextDataColumn(dt: GoogleDataTable, from: number): number | undefined {
  for (let c = from; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c)) {
      return c;
    }
  }
  return undefined;
}

/**
 * Whether the rows of each lane are contiguous, in the order the lanes were
 * first seen.
 *
 * @param laneOfRow - The lane index each row landed in, in row order
 * @returns True when the sequence never returns to a lane it has left
 */
function isGroupedByLane(laneOfRow: readonly number[]): boolean {
  return laneOfRow.every((lane, row) => row === 0 || lane >= laneOfRow[row - 1]);
}

/**
 * Lists the non-role data columns (excluding the domain/label column 0), in
 * DataTable order.
 *
 * The fixed-shape readings need the columns as a list rather than one at a
 * time: a waterfall's two ends are the second and third of them, and a
 * funnel's counts are whichever one falls.
 */
function dataColumns(dt: GoogleDataTable): number[] {
  const columns: number[] = [];
  for (let c = 1; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c)) {
      columns.push(c);
    }
  }
  return columns;
}

/**
 * Counts non-role data columns (excluding the domain/label column 0).
 */
function countDataColumns(dt: GoogleDataTable): number {
  return dataColumns(dt).length;
}

/**
 * Returns the first non-role column at or after `from` of the given type, or
 * `undefined` when there is none.
 *
 * A GeoChart's marker table is positional but optional past its coordinate
 * pair — the name and the value may each be absent — so the two are found by
 * type rather than counted off.
 */
function typedColumn(
  dt: GoogleDataTable,
  from: number,
  type: 'string' | 'number',
): number | undefined {
  for (let c = from; c < dt.getNumberOfColumns(); c++) {
    if (!isRoleColumn(dt, c) && dt.getColumnType(c) === type) {
      return c;
    }
  }
  return undefined;
}

/** The first string column at or after `from`. See {@link typedColumn}. */
function stringColumn(dt: GoogleDataTable, from: number): number | undefined {
  return typedColumn(dt, from, 'string');
}

/** The first number column at or after `from`. See {@link typedColumn}. */
function numberColumn(dt: GoogleDataTable, from: number): number | undefined {
  return typedColumn(dt, from, 'number');
}

// ---------------------------------------------------------------------------
// Helpers — SVG element marking via chart layout API
// ---------------------------------------------------------------------------

/**
 * Uses the Google Charts layout API to find and mark the SVG rect elements
 * that correspond to each bar. Returns a CSS selector for the marked elements.
 *
 * Google Charts renders many overlapping rect elements for visual effects.
 * The layout API provides the exact bounding box for each bar, allowing us
 * to identify the correct elements by matching coordinates.
 *
 * @param chart - The Google Chart instance
 * @param container - The DOM container element
 * @param rowCount - Number of data rows (bars per series)
 * @param seriesCount - Number of data series
 * @returns CSS selector for the marked elements, or undefined if no elements found
 */
/**
 * Whether the chart draws its categories in the opposite order to the rows.
 *
 * `hAxis: {direction: -1}` (or `vAxis` on a bar chart) reverses which end the
 * categories start at, while Google goes on emitting the rects in row order --
 * so a layer emitted as written is announced as the mirror image of the chart
 * (#1020).
 *
 * The draw options never reach this adapter, but they do not have to: the
 * layout interface reports where each row was actually placed, and the drawing
 * is what the reading has to follow. This is the same interface
 * {@link markBarElements} already uses to find the rects, so nothing new is
 * asked of the chart or of the caller.
 *
 * **Which location is asked follows the orientation**, because Google puts the
 * categories on whichever axis the bars do not run along: a `ColumnChart` has
 * them on x, a `BarChart` on y. Asking x on a horizontal chart reads the
 * magnitude* axis, which is virtually never itself reversed -- so the check
 * would answer no however the categories were drawn. Measured on four rows:
 *
 *   ColumnChart, plain                  getXLocation(0) = 162  (3) = 439
 *   ColumnChart, hAxis: {direction:-1}  getXLocation(0) = 439  (3) = 162
 *   BarChart,    plain                  getYLocation(0) = 108  (3) = 293
 *   BarChart,    vAxis: {direction:-1}  getYLocation(0) = 293  (3) = 108
 *
 * and, on that same reversed `BarChart`, `getXLocation` reads 116 then 127 --
 * ascending, and unchanged from the plain chart, which is what asking the
 * wrong axis buys.
 *
 * The comparison itself is the same either way. Google numbers y downward, so
 * a smaller number is nearer the top, and "the last row lands before the
 * first" reads as `last < first` on both axes.
 *
 * A chart that answers neither location -- one drawn without a cartesian
 * layout, or a build whose interface differs -- keeps the reading it has today
 * rather than being turned round on a guess.
 *
 * @param chart - The drawn Google Chart
 * @param rowCount - How many rows the DataTable holds
 * @param horizontal - Whether the bars run along x, putting categories on y
 * @returns True when the last row is drawn before the first
 */
function drawsCategoriesReversed(
  chart: GoogleChart,
  rowCount: number,
  horizontal: boolean,
): boolean {
  if (rowCount < 2)
    return false;
  try {
    const layout = chart.getChartLayoutInterface();
    const locate = horizontal ? layout?.getYLocation : layout?.getXLocation;
    const first = locate?.call(layout, 0);
    const last = locate?.call(layout, rowCount - 1);
    if (typeof first !== 'number' || typeof last !== 'number'
      || !Number.isFinite(first) || !Number.isFinite(last)) {
      return false;
    }
    return last < first;
  } catch {
    return false;
  }
}

/**
 * One selector per bar, naming the marks in the order the payload lists them.
 *
 * {@link markBarElements} stamps `data-maidr-bar="<series>-<row>"` on every
 * rect, so a reversed reading needs no new attribute -- only the list, built
 * from the far end (#1020).
 *
 * @param containerId - The chart container's id
 * @param rowCount - How many rows the DataTable holds
 * @returns One selector per row, in the payload's order
 */
function reversedBarSelectors(containerId: string, rowCount: number): string[] {
  return Array.from(
    { length: rowCount },
    (_, i) => `#${containerId} svg rect[data-maidr-bar="0-${rowCount - 1 - i}"]`,
  );
}

function markBarElements(
  chart: GoogleChart,
  container: HTMLElement,
  rowCount: number,
  seriesCount: number,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const layout = chart.getChartLayoutInterface();
  if (!layout)
    return buildDataSelector(container, 'rect');

  // Get all rects in the SVG
  const allRects = svg.querySelectorAll('rect');

  // Clear any existing marks from previous initializations
  allRects.forEach(rect => rect.removeAttribute('data-maidr-bar'));

  let markedCount = 0;

  // For each series and data point, find the corresponding rect
  for (let series = 0; series < seriesCount; series++) {
    for (let dataIndex = 0; dataIndex < rowCount; dataIndex++) {
      const bbox = layout.getBoundingBox(`bar#${series}#${dataIndex}`);
      if (!bbox)
        continue;

      const rect = findRectByBoundingBox(allRects, bbox);
      if (rect) {
        // Mark with series and index for ordered selection
        rect.setAttribute('data-maidr-bar', `${series}-${dataIndex}`);
        markedCount++;
      }
    }
  }

  if (markedCount === 0)
    return buildDataSelector(container, 'rect');

  return `#${container.id} svg rect[data-maidr-bar]`;
}

/**
 * Uses the Google Charts layout API to find and mark the SVG rect elements
 * for segmented bar charts (stacked, dodged, normalized).
 *
 * Unlike simple bar charts, segmented charts have a 2D structure where
 * SegmentedTrace expects elements ordered **category-first**:
 *   Category A: Series 0, Series 1
 *   Category B: Series 0, Series 1
 *   etc.
 *
 * This function marks elements in the correct order for mapToSvgElements().
 *
 * @param chart - The Google Chart instance
 * @param container - The DOM container element
 * @param categoryCount - Number of categories
 * @param seriesCount - Number of data series
 * @returns CSS selector for the marked elements, or undefined if no elements found
 */
function markSegmentedBarElements(
  chart: GoogleChart,
  container: HTMLElement,
  categoryCount: number,
  seriesCount: number,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const layout = chart.getChartLayoutInterface();
  if (!layout)
    return buildDataSelector(container, 'rect');

  // Get all rects in the SVG
  const allRects = svg.querySelectorAll('rect');

  // Clear any existing marks from previous initializations
  allRects.forEach(rect => rect.removeAttribute('data-maidr-bar'));

  let markedCount = 0;

  // Mark elements in ROW-MAJOR order (series-first, then categories within each series)
  // This matches Google Charts' DOM rendering order, where all bars for series 0
  // appear first, followed by all bars for series 1, etc.
  //
  // With domMapping.order='row', MAIDR iterates:
  //   for (r = 0 to numSeries)
  //     for (c = 0 to numCategories)
  //       svgElements[r].push(domElements[domIndex++])
  //
  // Google Charts' getBoundingBox uses: bar#seriesIndex#categoryIndex
  for (let series = 0; series < seriesCount; series++) {
    for (let category = 0; category < categoryCount; category++) {
      const bbox = layout.getBoundingBox(`bar#${series}#${category}`);
      if (!bbox) {
        continue;
      }

      const rect = findRectByBoundingBox(allRects, bbox);
      if (rect) {
        rect.setAttribute('data-maidr-bar', `${markedCount}`);
        markedCount++;
      }
    }
  }

  const selector = `#${container.id} svg rect[data-maidr-bar]`;

  if (markedCount === 0)
    return buildDataSelector(container, 'rect');

  return selector;
}

/**
 * Finds an SVG rect element that matches the given bounding box coordinates.
 *
 * Due to floating-point precision issues in Google Charts rendering,
 * we use a small tolerance when comparing positions.
 *
 * @param rects - NodeList of SVG rect elements to search
 * @param bbox - The target bounding box from the chart layout API
 * @returns The matching rect element, or null if not found
 */
function findRectByBoundingBox(
  rects: NodeListOf<SVGRectElement>,
  bbox: GoogleBoundingBox,
): SVGRectElement | null {
  for (const rect of rects) {
    const x = Number.parseFloat(rect.getAttribute('x') || '0');
    const y = Number.parseFloat(rect.getAttribute('y') || '0');
    const width = Number.parseFloat(rect.getAttribute('width') || '0');
    const height = Number.parseFloat(rect.getAttribute('height') || '0');

    // Match by position and size with tolerance
    const xMatch = Math.abs(x - bbox.left) <= POSITION_TOLERANCE;
    const yMatch = Math.abs(y - bbox.top) <= POSITION_TOLERANCE;
    const widthMatch = Math.abs(width - bbox.width) <= POSITION_TOLERANCE;
    const heightMatch = Math.abs(height - bbox.height) <= POSITION_TOLERANCE;

    if (xMatch && yMatch && widthMatch && heightMatch) {
      return rect;
    }
  }
  return null;
}

/**
 * Uses the Google Charts layout API to find and mark the SVG circle elements
 * that correspond to each scatter point. Returns a CSS selector for the marked elements.
 *
 * Google Charts renders multiple overlapping circles per data point for visual effects.
 * This function tries two approaches:
 * 1. Use getBoundingBox('point#0#i') to get exact positions (preferred)
 * 2. Fall back to getXLocation/getYLocation with skip-already-marked logic
 *
 * @param chart - The Google Chart instance
 * @param container - The DOM container element
 * @param data - Array of scatter points with x, y coordinates
 * @returns CSS selector for the marked elements, or undefined if no elements found
 */
function markScatterElements(
  chart: GoogleChart,
  container: HTMLElement,
  data: ScatterPoint[],
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const layout = chart.getChartLayoutInterface();
  if (!layout)
    return buildDataSelector(container, 'circle');

  // Get all circles in the SVG
  const allCircles = svg.querySelectorAll('circle');
  if (allCircles.length === 0)
    return undefined;

  // Clear any existing marks from previous initializations
  allCircles.forEach(circle => circle.removeAttribute('data-maidr-point'));

  let markedCount = 0;

  // Approach 1: Try getBoundingBox('point#series#row') - similar to bar charts
  for (let i = 0; i < data.length; i++) {
    const bbox = layout.getBoundingBox(`point#0#${i}`);
    if (bbox) {
      const circle = findCircleByBoundingBox(allCircles, bbox);
      if (circle && !circle.hasAttribute('data-maidr-point')) {
        circle.setAttribute('data-maidr-point', `${i}`);
        markedCount++;
      }
    }
  }

  // Approach 2: Fallback to position-based matching if getBoundingBox didn't work
  if (markedCount === 0 && layout.getXLocation && layout.getYLocation) {
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      const expectedX = layout.getXLocation(point.x);
      const expectedY = layout.getYLocation(point.y);

      // Skip circles that are already marked (handles multiple circles per point)
      const circle = findUnmarkedCircleByPosition(allCircles, expectedX, expectedY);
      if (circle) {
        circle.setAttribute('data-maidr-point', `${i}`);
        markedCount++;
      }
    }
  }

  if (markedCount === 0) {
    return buildDataSelector(container, 'circle');
  }

  return `#${container.id} svg circle[data-maidr-point]`;
}

/**
 * Finds an SVG circle element that matches the given bounding box.
 *
 * The bounding box center should match the circle's cx/cy position.
 *
 * @param circles - NodeList of SVG circle elements to search
 * @param bbox - The target bounding box from the chart layout API
 * @returns The matching circle element, or null if not found
 */
function findCircleByBoundingBox(
  circles: NodeListOf<SVGCircleElement>,
  bbox: GoogleBoundingBox,
): SVGCircleElement | null {
  // Calculate center of bounding box
  const centerX = bbox.left + bbox.width / 2;
  const centerY = bbox.top + bbox.height / 2;

  for (const circle of circles) {
    const cx = Number.parseFloat(circle.getAttribute('cx') || '0');
    const cy = Number.parseFloat(circle.getAttribute('cy') || '0');

    // Match by center position with tolerance
    const xMatch = Math.abs(cx - centerX) <= POSITION_TOLERANCE;
    const yMatch = Math.abs(cy - centerY) <= POSITION_TOLERANCE;

    if (xMatch && yMatch) {
      return circle;
    }
  }
  return null;
}

/**
 * Finds an unmarked SVG circle element at the specified pixel position.
 *
 * Skips circles that already have the data-maidr-point attribute to handle
 * Google Charts rendering multiple overlapping circles per data point.
 *
 * @param circles - NodeList of SVG circle elements to search
 * @param expectedX - Expected x-coordinate (center)
 * @param expectedY - Expected y-coordinate (center)
 * @returns The matching unmarked circle element, or null if not found
 */
function findUnmarkedCircleByPosition(
  circles: NodeListOf<SVGCircleElement>,
  expectedX: number,
  expectedY: number,
): SVGCircleElement | null {
  for (const circle of circles) {
    // Skip already-marked circles
    if (circle.hasAttribute('data-maidr-point')) {
      continue;
    }

    const cx = Number.parseFloat(circle.getAttribute('cx') || '0');
    const cy = Number.parseFloat(circle.getAttribute('cy') || '0');

    // Match by center position with tolerance
    const xMatch = Math.abs(cx - expectedX) <= POSITION_TOLERANCE;
    const yMatch = Math.abs(cy - expectedY) <= POSITION_TOLERANCE;

    if (xMatch && yMatch) {
      return circle;
    }
  }
  return null;
}

/**
 * Marks line chart path elements with series identifiers and returns per-series selectors.
 *
 * Google Charts line charts render `<path>` elements inside a `g[clip-path]` group.
 * This function marks each line path with a `data-maidr-line-series` attribute
 * so MAIDR's `mapViaPathParsing` can parse the path `d` attribute and create
 * synthetic highlight circles at each data point.
 *
 * @param _chart - The Google Chart instance (unused, kept for API consistency)
 * @param container - The DOM container element
 * @param _rowCount - Number of data points per series (unused)
 * @param seriesCount - Number of data series
 * @returns Array of CSS selectors (one per series), or undefined if no paths found
 */
function markLinePointElements(
  _chart: GoogleChart,
  container: HTMLElement,
  _rowCount: number,
  seriesCount: number,
): string[] | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  const existingMarked = svg.querySelectorAll('path[data-maidr-line-series]');
  existingMarked.forEach(path => path.removeAttribute('data-maidr-line-series'));

  // Find line paths: paths with fill="none" inside clip-path group (actual data lines)
  // These exclude axis lines, gridlines, etc.
  //
  // An area chart draws two paths per series — the filled band and the line
  // along its top edge — and `fill="none"` keeps only the second, which is
  // what this wants: the outline's `d` runs through the data vertices, while
  // the band's closes back along the baseline and would parse into twice as
  // many points. An area drawn with `lineWidth: 0` has no outline and so gets
  // no highlight, which is the honest answer when the chart drew nothing to
  // highlight a point with.
  const linePaths = svg.querySelectorAll('g[clip-path] path[fill="none"]');

  if (linePaths.length === 0) {
    return undefined;
  }

  // Mark each path with its series index
  // Google Charts renders paths in series order
  const selectors: string[] = [];
  const pathsToMark = Math.min(linePaths.length, seriesCount);

  for (let series = 0; series < pathsToMark; series++) {
    const path = linePaths[series];
    path.setAttribute('data-maidr-line-series', `${series}`);
    selectors.push(`#${container.id} svg path[data-maidr-line-series="${series}"]`);
  }

  return selectors.length > 0 ? selectors : undefined;
}

/**
 * Marks candlestick SVG elements (bodies and wicks) and returns a CandlestickSelector.
 *
 * Google Charts renders candlesticks as pairs of rect elements:
 *   - Wick: narrow rect (width=2) representing high-low range
 *   - Body: wider rect (width~43) representing open-close range
 *
 * Elements are filtered from grid lines by checking width:
 *   - Grid lines: width=1 (vertical) or height=1 (horizontal)
 *   - Wicks: width=2
 *   - Bodies: width > 10 (typically 43)
 *
 * @param _chart - The Google Chart instance (unused, kept for API consistency)
 * @param container - The DOM container element
 * @param rowCount - Number of candlesticks
 * @returns CandlestickSelector object or undefined if no elements found
 */
function markCandlestickElements(
  _chart: GoogleChart,
  container: HTMLElement,
  rowCount: number,
): CandlestickSelector | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  const existingMarked = svg.querySelectorAll('rect[data-maidr-candle-body], rect[data-maidr-candle-wick]');
  existingMarked.forEach((rect) => {
    rect.removeAttribute('data-maidr-candle-body');
    rect.removeAttribute('data-maidr-candle-wick');
  });

  const { bodies, wicks } = floatingBarRects(svg);

  // We expect equal numbers of bodies and wicks
  if (bodies.length === 0) {
    return undefined;
  }

  // Warn if element counts don't match expected row count (aids debugging)
  if (bodies.length !== rowCount) {
    console.warn(
      `[MAIDR] Candlestick body count mismatch: expected ${rowCount}, found ${bodies.length}. `
      + 'This may indicate pixel threshold issues with custom chart sizes or high-DPI displays.',
    );
  }
  if (wicks.length !== rowCount) {
    console.warn(
      `[MAIDR] Candlestick wick count mismatch: expected ${rowCount}, found ${wicks.length}.`,
    );
  }

  // Mark bodies with index
  const bodiesToMark = Math.min(bodies.length, rowCount);
  for (let i = 0; i < bodiesToMark; i++) {
    bodies[i].setAttribute('data-maidr-candle-body', `${i}`);
  }

  // Mark wicks with index
  const wicksToMark = Math.min(wicks.length, rowCount);
  for (let i = 0; i < wicksToMark; i++) {
    wicks[i].setAttribute('data-maidr-candle-wick', `${i}`);
  }

  // Build selector object
  const selector: CandlestickSelector = {
    body: `#${container.id} svg rect[data-maidr-candle-body]`,
  };

  if (wicksToMark > 0) {
    selector.wick = `#${container.id} svg rect[data-maidr-candle-wick]`;
  }

  return selector;
}

/**
 * Splits the data rects of a floating-bar chart into bodies and wicks, left to
 * right.
 *
 * Google draws a candlestick — and so a waterfall, which is a candlestick with
 * the wick collapsed onto the body — as plain `<rect>`s with no class or id,
 * alongside the gridline rects. Width is what tells the three apart: a
 * gridline is a hairline, a wick a few pixels, a body the width of a bar.
 * Rects between the wick and body thresholds are chart decoration and belong
 * to neither list.
 *
 * @param svg - The chart's SVG root
 * @returns The bodies and the wicks, each sorted by x
 */
function floatingBarRects(svg: SVGSVGElement): {
  bodies: SVGRectElement[];
  wicks: SVGRectElement[];
} {
  const bodies: SVGRectElement[] = [];
  const wicks: SVGRectElement[] = [];

  // Rects inside the clip-path group are the data elements, not axis/legend.
  for (const rect of svg.querySelectorAll<SVGRectElement>('g[clip-path] rect')) {
    const width = Number.parseFloat(rect.getAttribute('width') || '0');
    const height = Number.parseFloat(rect.getAttribute('height') || '0');

    // Skip grid lines (very thin horizontal or vertical lines)
    if (width <= CANDLESTICK_GRID_MAX_WIDTH || height <= CANDLESTICK_GRID_MAX_WIDTH) {
      continue;
    }

    if (width <= CANDLESTICK_WICK_MAX_WIDTH) {
      wicks.push(rect);
    } else if (width > CANDLESTICK_BODY_MIN_WIDTH) {
      bodies.push(rect);
    }
  }

  const byX = (a: SVGRectElement, b: SVGRectElement): number =>
    Number.parseFloat(a.getAttribute('x') || '0') - Number.parseFloat(b.getAttribute('x') || '0');

  return { bodies: bodies.sort(byX), wicks: wicks.sort(byX) };
}

/**
 * Marks the floating bars of a waterfall and returns a selector for them.
 *
 * `WaterfallTrace` wants one element per step in step order, which is left to
 * right. The bar is the body of the candlestick the chart is drawn as; the
 * wick sits behind it at the same extent and is not a second mark, so only the
 * bodies are marked.
 *
 * All or nothing, and for a stricter reason than the count guards elsewhere:
 * `WaterfallTrace.mapToSvgElements` discards a list whose length is not the
 * step count, so a partial match would leave the marks in the DOM and the
 * highlight off anyway.
 *
 * One selector **per step** rather than one attribute selector for all of
 * them, because the steps are ordered by the x the bars were drawn at and a
 * single selector would be resolved in document order instead. The two agree
 * for a chart Google emits left to right and part company for anything else,
 * silently and only in the highlight.
 *
 * @param container - The DOM container element
 * @param stepCount - Number of data rows (one per step)
 * @returns One CSS selector per step in step order, or undefined when the bars
 *          could not be identified with confidence
 */
function markFloatingBarElements(
  container: HTMLElement,
  stepCount: number,
): string[] | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  svg.querySelectorAll('rect[data-maidr-step]')
    .forEach(rect => rect.removeAttribute('data-maidr-step'));

  const { bodies } = floatingBarRects(svg);
  if (bodies.length === 0) {
    return undefined;
  }

  if (bodies.length !== stepCount) {
    console.warn(
      `[MAIDR] Waterfall step count mismatch: expected ${stepCount}, found ${bodies.length}. `
      + 'Visual highlighting is disabled for this chart. A step that moved nothing draws '
      + 'a bar too short to tell from a gridline.',
    );
    return undefined;
  }

  bodies.forEach((body, index) => body.setAttribute('data-maidr-step', `${index}`));

  return bodies.map((_, index) => `#${container.id} svg rect[data-maidr-step="${index}"]`);
}

/**
 * Marks the dials of a gauge and returns one selector per dial.
 *
 * The gauge package exposes no `getChartLayoutInterface()`, so the dials are
 * matched by count and by the order Google draws them in, which is DataTable
 * row order. Two DOM shapes are tried, most specific first: the dial face is a
 * `<circle>` when the package draws one per gauge, and otherwise each dial has
 * an `<svg>` of its own, which highlights the whole face rather than the
 * needle but still points at the right measure.
 *
 * The counts must match exactly. A gauge that draws a needle hub as a second
 * circle would otherwise have every dial matched to the wrong measure, and a
 * highlight on the wrong dial tells a sighted collaborator something the audio
 * is not saying.
 *
 * NOTE: written from the package's documented structure rather than from a
 * real render, so the failure mode is deliberately "no highlight and a
 * warning" rather than a guess.
 *
 * @param container - The DOM container element
 * @param dialCount - Number of data rows (one per dial)
 * @returns One CSS selector per dial in row order, or undefined when the dials
 *          could not be identified with confidence
 */
function markGaugeDialElements(
  container: HTMLElement,
  dialCount: number,
): string[] | undefined {
  // Clear any existing marks from previous initializations
  container.querySelectorAll('[data-maidr-dial]')
    .forEach(element => element.removeAttribute('data-maidr-dial'));

  const faces = Array.from(container.querySelectorAll('circle'));
  const roots = Array.from(container.querySelectorAll('svg'));
  const dials = faces.length === dialCount
    ? faces
    : (roots.length === dialCount ? roots : undefined);

  if (!dials) {
    console.warn(
      `[MAIDR] Gauge dial count mismatch: expected ${dialCount}, found `
      + `${faces.length} dial faces and ${roots.length} dial roots. `
      + 'Visual highlighting is disabled for this chart.',
    );
    return undefined;
  }

  dials.forEach((dial, index) => dial.setAttribute('data-maidr-dial', `${index}`));

  return dials.map((_, index) => `#${container.id} [data-maidr-dial="${index}"]`);
}

/**
 * One drawn point marker: which series drew it, and which row it stands for.
 *
 * The pair is what the layout API is addressed by (`point#series#row`), and
 * the position in the list is the index of the data point it belongs to — the
 * two are not the same on a chart whose series skip rows.
 */
interface PointMark {
  /** The series that drew the marker, in DataTable column order. */
  series: number;
  /** The DataTable row it stands for. */
  row: number;
}

/**
 * Marks the point markers of the first series and returns a selector for them.
 *
 * Three charts highlight a row through its drawn point rather than through a
 * bar: an interval chart, where `ErrorBarTrace` puts a single mark on the
 * sample whichever bound the cursor is on; a dot plot, whose mark is the point
 * and nothing else; and a dumbbell, which highlights its row at both ends.
 *
 * @param chart     - The Google Chart instance
 * @param container - The DOM container element
 * @param rowCount  - Number of rows, one point each
 * @param attribute - The marking attribute to set
 * @param what      - What the points are, for the mismatch warning
 * @returns CSS selector for the marked circles, or undefined when the chart
 *          drew none the rows could be matched to
 */
function markPointMarkerElements(
  chart: GoogleChart,
  container: HTMLElement,
  rowCount: number,
  attribute: string,
  what: string,
): string | undefined {
  const marks = Array.from({ length: rowCount }, (_, row) => ({ series: 0, row }));
  return markSeriesPointElements(chart, container, marks, attribute, what);
}

/**
 * Marks one drawn point marker per data point and returns a selector for them.
 *
 * The markers are located through the layout API the way scatter points are,
 * one `point#series#row` box at a time, so a chart drawing several series
 * (a banded Manhattan plot) is marked in the order its points were flattened
 * into the layer's data.
 *
 * All or nothing: a chart drawn without visible point markers (`pointSize: 0`,
 * which is a LineChart's default) has nothing to mark, and a partial match
 * would leave the trace with a list that does not line up with the data, which
 * it discards anyway. Audio, text and braille are unaffected either way.
 *
 * The **document order** is verified rather than assumed. A single attribute
 * selector is resolved by the browser in document order while the marks are
 * made in data order, so a chart that emitted its circles in some other order
 * would highlight a point belonging to a different row on every move —
 * silently, and only in the highlight.
 *
 * @param chart     - The Google Chart instance
 * @param container - The DOM container element
 * @param marks     - The marker to find per data point, in data order
 * @param attribute - The marking attribute to set
 * @param what      - What the points are, for the mismatch warning
 * @returns CSS selector for the marked circles, or undefined when the chart
 *          drew none the data could be matched to
 */
function markSeriesPointElements(
  chart: GoogleChart,
  container: HTMLElement,
  marks: readonly PointMark[],
  attribute: string,
  what: string,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  const layout = chart.getChartLayoutInterface();
  if (!layout) {
    return undefined;
  }

  const allCircles = svg.querySelectorAll('circle');
  if (allCircles.length === 0) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  allCircles.forEach(circle => circle.removeAttribute(attribute));

  const withdraw = (): undefined => {
    // A partial or out-of-order match is withdrawn rather than shipped: the
    // marks left behind would resolve to a list that does not line up with the
    // data, and the next chart drawn into this container would inherit them.
    allCircles.forEach(circle => circle.removeAttribute(attribute));
    return undefined;
  };

  let markedCount = 0;
  marks.forEach((mark, index) => {
    const bbox = layout.getBoundingBox(`point#${mark.series}#${mark.row}`);
    if (!bbox) {
      return;
    }
    const circle = findCircleByBoundingBox(allCircles, bbox);
    if (circle && !circle.hasAttribute(attribute)) {
      circle.setAttribute(attribute, `${index}`);
      markedCount++;
    }
  });

  if (markedCount !== marks.length) {
    if (markedCount > 0) {
      console.warn(
        `[MAIDR] ${what} count mismatch: expected ${marks.length}, marked ${markedCount}. `
        + 'Visual highlighting is disabled for this chart.',
      );
    }
    return withdraw();
  }

  const drawn = Array.from(svg.querySelectorAll(`circle[${attribute}]`));
  if (drawn.some((circle, index) => circle.getAttribute(attribute) !== `${index}`)) {
    console.warn(
      `[MAIDR] ${what} order mismatch: the chart drew its markers in an order other than `
      + 'the data\'s, so a highlight would sit on a different point from the one being '
      + 'announced. Visual highlighting is disabled for this chart.',
    );
    return withdraw();
  }

  return `#${container.id} svg circle[${attribute}]`;
}

/**
 * Marks the ribbons of a sankey diagram and returns a selector for them.
 *
 * `FlowTrace` wants one element per flow in declared order, which is the
 * order Google emits the ribbons in. The sankey package exposes no
 * `getChartLayoutInterface()`, so there is no bounding box to match against
 * and the ribbons are picked out by the cubic command in their `d` attribute
 * (see {@link SVG_CUBIC_COMMAND}) — the nodes are `<rect>`s and the labels
 * `<text>`, so nothing else in the SVG is a curve.
 *
 * When the ribbon count does not match the row count the mapping is unknown,
 * and the marks are left off entirely — the pie precedent, for the same
 * reason: highlighting the wrong flow would tell a sighted collaborator one
 * thing while the audio and text say another.
 *
 * @param container - The DOM container element
 * @param flowCount - Number of data rows (one per flow)
 * @returns CSS selector for the marked ribbons, or undefined when they could
 *          not be identified with confidence
 */
function markFlowRibbonElements(
  container: HTMLElement,
  flowCount: number,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  svg.querySelectorAll('path[data-maidr-flow]')
    .forEach(path => path.removeAttribute('data-maidr-flow'));

  const ribbons = Array.from(svg.querySelectorAll('path'))
    .filter(path => SVG_CUBIC_COMMAND.test(path.getAttribute('d') ?? ''));
  if (ribbons.length === 0) {
    return undefined;
  }

  if (ribbons.length !== flowCount) {
    console.warn(
      `[MAIDR] Sankey ribbon count mismatch: expected ${flowCount}, found ${ribbons.length}. `
      + 'Visual highlighting is disabled for this chart.',
    );
    return undefined;
  }

  ribbons.forEach((ribbon, index) => ribbon.setAttribute('data-maidr-flow', `${index}`));

  return `#${container.id} svg path[data-maidr-flow]`;
}

/**
 * Marks the `<rect>` cells a layout-less package draws — a treemap's tiles, a
 * schedule's bars — and returns a selector for them.
 *
 * Neither package exposes `getChartLayoutInterface()`, so there is no
 * bounding box to match a row against: the only thing tying the cells to the
 * data is the order Google emits them in, which is DataTable row order. That
 * order only means anything when every drawn cell is a data cell, so the
 * marks are withdrawn unless the count matches exactly.
 *
 * It frequently will not, and by design rather than by accident: a TreeMap is
 * a drill-down chart that renders `maxDepth` levels at a time and redraws on
 * click, and a Gantt adds an inner rect for percent complete. Both then ship
 * with audio, text and braille and no highlight, which is the honest reading
 * of a DOM that cannot be mapped.
 *
 * @param container - The DOM container element
 * @param expected  - Number of data rows (one per drawn cell)
 * @param attribute - The marking attribute to set
 * @param what      - What the cells are, for the mismatch warning
 * @returns CSS selector for the marked cells, or undefined when they could
 *          not be identified with confidence
 */
function markRectCellElements(
  container: HTMLElement,
  expected: number,
  attribute: string,
  what: string,
): string | undefined {
  const svg = container.querySelector('svg');
  if (!svg) {
    return undefined;
  }

  // Clear any existing marks from previous initializations
  svg.querySelectorAll(`rect[${attribute}]`)
    .forEach(rect => rect.removeAttribute(attribute));

  // Prefer the chart-area clip group, which excludes the background rect and
  // the axis furniture; fall back to the whole SVG when the package draws
  // without one.
  const clipped = svg.querySelectorAll('g[clip-path] rect');
  const candidates = clipped.length > 0 ? clipped : svg.querySelectorAll('rect');

  const cells = Array.from(candidates).filter((rect) => {
    const width = Number.parseFloat(rect.getAttribute('width') || '0');
    const height = Number.parseFloat(rect.getAttribute('height') || '0');
    return width > CELL_MIN_SIZE && height > CELL_MIN_SIZE;
  });
  if (cells.length === 0) {
    return undefined;
  }

  if (cells.length !== expected) {
    console.warn(
      `[MAIDR] ${what} count mismatch: expected ${expected}, found ${cells.length}. `
      + 'Visual highlighting is disabled for this chart.',
    );
    return undefined;
  }

  cells.forEach((cell, index) => cell.setAttribute(attribute, `${index}`));

  return `#${container.id} svg rect[${attribute}]`;
}
