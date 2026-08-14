/**
 * Types for the Recharts adapter.
 *
 * Defines the configuration interfaces for converting Recharts data
 * and SVG structure into MAIDR's accessible format.
 */

import type { GaugeBand, Orientation, StepDirection } from '@type/grammar';

/**
 * Recharts chart types supported by the adapter.
 *
 * Mapping to MAIDR trace types:
 * - `'bar'` → `TraceType.BAR` — Simple bar chart
 * - `'stacked_bar'` → `TraceType.STACKED` — Stacked bar chart (Recharts `<Bar stackId="...">`)
 * - `'dodged_bar'` → `TraceType.DODGED` — Grouped/dodged bar chart (multiple `<Bar>` without stackId)
 * - `'normalized_bar'` → `TraceType.NORMALIZED` — Stacked normalized (100%) bar chart
 * - `'diverging_bar'` → `TraceType.DIVERGING` — Population pyramid or Likert
 *   scale: exactly two `yKeys` drawn back to back with
 *   `<BarChart stackOffset="sign">`, the left-hand one holding NEGATIVE values
 * - `'waterfall'` → `TraceType.WATERFALL` — A starting value carried to an
 *   ending one through signed contributions. The single `yKeys` entry holds
 *   each step's contribution and the adapter accumulates the running totals;
 *   see {@link WaterfallStepConfig}
 * - `'dumbbell'` → `TraceType.DUMBBELL` — Two values compared at each
 *   category, joined by a segment. Exactly two `yKeys` — the starting end
 *   first — named for the reader by `fillKeys`
 * - `'gantt'` → `TraceType.GANTT` — Intervals laid out along a shared axis,
 *   one row per interval: `xKey` names the lane and the two `yKeys` its start
 *   and end; see {@link GanttChartConfig}
 * - `'gauge'` → `TraceType.GAUGE` — One measure read against a range, drawn
 *   as a half-dial `<RadialBarChart>`; see {@link GaugeDialConfig}
 * - `'dot'` → `TraceType.DOT` — Cleveland dot plot: one point per category,
 *   drawn with `<Scatter>` against a category axis
 * - `'lollipop'` → `TraceType.LOLLIPOP` — Lollipop chart: a `<ComposedChart>`
 *   of a thin `<Bar>` stem plus a `<Scatter>` head. Read exactly as a bar is —
 *   the stem is the mark, not extra data
 * - `'funnel'` → `TraceType.FUNNEL` — Funnel chart (`<FunnelChart>` + `<Funnel>`):
 *   a population shrinking across ordered stages. The counts are a bar's data;
 *   MAIDR derives the retention and share it announces from them
 * - `'histogram'` → `TraceType.HISTOGRAM` — Histogram rendered as bar chart with bin ranges
 * - `'line'` → `TraceType.LINE` — Line chart
 * - `'area'` → `TraceType.AREA` — Area chart (Recharts `<Area>`); the fill is
 *   decoration, so the data is a line's
 * - `'stacked_area'` → `TraceType.STACKED_AREA` — Stacked area chart
 *   (`<Area stackId="...">`, multiple `yKeys`)
 * - `'normalized_area'` → `TraceType.NORMALIZED_AREA` — 100% stacked area
 *   (`<AreaChart stackOffset="expand">`, multiple `yKeys`)
 * - `'radar'` → `TraceType.RADAR` — Radar/spider chart (`<RadarChart>` + `<Radar>`)
 * - `'bump'` → `TraceType.BUMP` — Bump chart: rank over time, drawn as a
 *   `<LineChart>` with `<YAxis reversed>`
 * - `'survival'` → `TraceType.SURVIVAL` — Kaplan-Meier curve: a
 *   `<Line type="stepAfter">` plus the censoring marks and confidence band
 *   declared through {@link SurvivalCurveConfig}
 * - `'scatter'` → `TraceType.SCATTER` — Scatter/point plot
 * - `'volcano'` → `TraceType.VOLCANO` — Volcano plot: effect size against
 *   significance, read through the cutoffs in {@link VolcanoPointConfig}
 * - `'manhattan'` → `TraceType.MANHATTAN` — Manhattan plot: genomic position
 *   against significance. Same payload and config as `'volcano'`
 * - `'error_bar'` → `TraceType.ERROR_BAR` — An estimate with the interval
 *   drawn around it (`<ErrorBar>` inside a `<Bar>`/`<Line>`/`<Scatter>`)
 * - `'forest'` → `TraceType.FOREST` — Forest plot: one interval per study
 *   against a shared null line, with the pooled summary last
 * - `'pie'` → `TraceType.PIE` — Pie/doughnut chart (Recharts `<Pie>`); a
 *   doughnut is a pie with an `innerRadius`, which changes nothing about the
 *   data, so both use this type
 * - `'alluvial'` → `TraceType.ALLUVIAL` — Weighted flow between nodes drawn
 *   as a `<Sankey>` whose node set repeats at each stage
 * - `'treemap'` → `TraceType.TREEMAP` — A hierarchy laid out as nested area
 *   (`<Treemap>`). `data` is the nested `{ name, children }` array the
 *   component itself is given, not the adapter's usual flat rows
 * - `'sunburst'` → `TraceType.SUNBURST` — The same hierarchy drawn as rings
 *   (`<SunburstChart>`). `data` is the root's `children`, since the sunburst
 *   draws every node except the root
 */
export type RechartsChartType
  = | 'bar'
    | 'stacked_bar'
    | 'dodged_bar'
    | 'normalized_bar'
    | 'diverging_bar'
    | 'waterfall'
    | 'dumbbell'
    | 'gantt'
    | 'gauge'
    | 'dot'
    | 'lollipop'
    | 'funnel'
    | 'histogram'
    | 'line'
    | 'area'
    | 'stacked_area'
    | 'normalized_area'
    | 'radar'
    | 'bump'
    | 'survival'
    | 'scatter'
    | 'volcano'
    | 'manhattan'
    | 'error_bar'
    | 'forest'
    | 'pie'
    | 'alluvial'
    | 'treemap'
    | 'sunburst';

/**
 * A single data series/layer configuration for composed charts.
 * Use this when a chart has multiple series of different types.
 */
export interface RechartsLayerConfig {
  /** Key in the data array for this series' y-values. */
  yKey: string;
  /** Chart type for this series. */
  chartType: RechartsChartType;
  /** Display name for this series (used in legends/descriptions). */
  name?: string;
}

/**
 * Configuration for histogram bin ranges.
 * Required when `chartType` is `'histogram'`.
 */
export interface HistogramBinConfig {
  /** Key in data objects for the lower bin edge. */
  xMinKey: string;
  /** Key in data objects for the upper bin edge. */
  xMaxKey: string;
  /** Key in data objects for the minimum count (typically 0). Defaults to 0. */
  yMinKey?: string;
  /** Key in data objects for the maximum count. Defaults to the yKey value. */
  yMaxKey?: string;
}

/**
 * Configuration for a flow (alluvial) diagram.
 * Required when `chartType` is `'alluvial'`.
 *
 * The `data` array is the `links` half of what Recharts' `<Sankey>` is given:
 * one row per flow. `xKey` names the field holding the source node and the
 * single `yKeys` entry the field holding the magnitude, so only the target
 * needs a key of its own.
 */
export interface FlowLinkConfig {
  /** Key in link objects for the node the flow arrives at. */
  targetKey: string;
  /**
   * The `nodes` half of the `<Sankey>` data, used to resolve the numeric
   * indices Recharts links carry into node names.
   *
   * Recharts addresses nodes by their position in this array, and an index is
   * not something to announce — "flow from 3 to 7" names neither end. Omit it
   * only when the links already carry node names.
   */
  nodes?: Record<string, unknown>[];
  /** Key in node objects for the node's name. Mirrors `<Sankey nameKey>`, and defaults to `'name'`. */
  nodeNameKey?: string;
}

/**
 * Configuration for volcano and Manhattan plots.
 * Optional when `chartType` is `'volcano'` or `'manhattan'`.
 *
 * None of this is inferable from a Recharts `<Scatter>`: the component holds
 * coordinates, and these charts are read for identity and for which side of a
 * cutoff a point falls on. Both arrive from the author or not at all.
 */
export interface VolcanoPointConfig {
  /** Key holding what the point *is* — a gene, a SNP, a probe. */
  labelKey?: string;
  /** Key holding the region the point belongs to — a chromosome. */
  groupKey?: string;
  /**
   * The significance cutoff on the y axis.
   *
   * There is no default: -log10(p) puts the line at 1.3 for p < 0.05 and at
   * 7.3 for genome-wide significance, and a guessed line sorts every point
   * onto the wrong side silently.
   */
  significance?: number;
  /**
   * Which side of the cutoff is the significant one. Defaults to `'above'`,
   * which is right for the transformed axes these charts usually carry.
   * A raw p axis runs the other way and must declare `'below'`.
   */
  significanceDirection?: 'above' | 'below';
  /** The effect-size cutoff, applied to the magnitude of x. */
  effect?: number;
}

/**
 * Configuration for the interval drawn around an estimate.
 * Used when `chartType` is `'error_bar'` or `'forest'`.
 *
 * MAIDR fixes the interval as ABSOLUTE positions on the value axis, while
 * Recharts' `<ErrorBar dataKey>` points at an OFFSET from the estimate. Both
 * are accepted here and normalised to absolutes: declare `errorKey` for the
 * Recharts field, or `yMinKey`/`yMaxKey` when the data already holds bounds.
 */
export interface ErrorIntervalConfig {
  /**
   * Key holding the interval as an offset from the estimate — the field a
   * `<ErrorBar dataKey>` points at. A number is a symmetric offset; a
   * `[lower, upper]` pair is an asymmetric one, exactly as Recharts reads it.
   */
  errorKey?: string;
  /** Key holding the absolute lower bound. Takes precedence over `errorKey`. */
  yMinKey?: string;
  /** Key holding the absolute upper bound. Takes precedence over `errorKey`. */
  yMaxKey?: string;
}

/**
 * Configuration for forest plots.
 * Optional when `chartType` is `'forest'`, but a forest plot that declares no
 * `nullValue` gets no claim about significance — see {@link nullValue}.
 */
export interface ForestPlotConfig {
  /**
   * Key holding the study's weight in the pooled estimate, as a fraction of
   * one. A forest plot encodes this as marker area, which no reader is
   * otherwise told: two studies whose intervals look alike can contribute
   * wholly differently to the result.
   */
  weightKey?: string;
  /** Key whose truthy value marks a row as the pooled summary rather than a study. */
  pooledKey?: string;
  /**
   * Index of the pooled summary row, for data that carries no flag column.
   * A meta-analysis draws the pooled row last, so this is usually
   * `data.length - 1`.
   */
  pooledIndex?: number;
  /**
   * The value that means "no effect" — 1 for a ratio measure, 0 for a
   * difference. It is the `<ReferenceLine>` the chart draws, and whether a
   * study's interval crosses it is that study's result.
   *
   * There is deliberately no default: guessing 0 for a ratio chart reports
   * every study as not crossing, since odds ratios are all positive.
   */
  nullValue?: number;
}

/**
 * Configuration for Kaplan-Meier survival curves.
 * Optional when `chartType` is `'survival'`.
 *
 * The key arrays map 1:1 with `yKeys` — the i-th entry belongs to the i-th
 * arm — the same way `fillKeys` names the i-th series.
 */
export interface SurvivalCurveConfig {
  /**
   * Keys whose truthy value marks a censored time, one per arm.
   *
   * Censoring is not an event: the curve does not step there. A reader who
   * cannot tell a censored time from an ordinary one cannot tell a flat tail
   * backed by two hundred subjects from one backed by three.
   */
  censoredKeys?: string[];
  /** Keys for the lower bound of the confidence band, one per arm. */
  yMinKeys?: string[];
  /** Keys for the upper bound of the confidence band, one per arm. */
  yMaxKeys?: string[];
  /**
   * Where the curve jumps between times. Defaults to `'hv'`, which is what
   * `<Line type="stepAfter">` draws and what a Kaplan-Meier curve means:
   * survival holds until an event drops it. Declare `'vh'` for a curve drawn
   * with `type="stepBefore"`.
   */
  stepDirection?: StepDirection;
}

/**
 * Configuration for waterfall charts.
 * Optional when `chartType` is `'waterfall'`.
 *
 * The single `yKeys` entry names each step's CONTRIBUTION, and the adapter
 * accumulates the running totals MAIDR announces — a waterfall bar floats
 * between the total before the step and the total after it, and neither
 * number is in the data. This config only says which rows are *not*
 * contributions: an opening balance, a subtotal, a closing balance.
 */
export interface WaterfallStepConfig {
  /**
   * Key whose truthy value marks a row as restating the running total rather
   * than changing it. Such a row sits on the baseline instead of floating,
   * and a reader told a subtotal "rose by 950" would hear a contribution the
   * chart never made.
   *
   * A restating row's own value becomes the new running total. When it has
   * none, the accumulated total is used, so a "Closing" row need carry no
   * number of its own.
   */
  totalKey?: string;
  /**
   * Indices of the restating rows, for data that carries no flag column.
   * A waterfall usually opens and closes on one, so this is commonly
   * `[0, data.length - 1]`.
   */
  totalIndices?: number[];
  /**
   * Key holding the step kind outright — `'increase'`, `'decrease'` or
   * `'total'`. Takes precedence over both fields above; without any of the
   * three, a step is read from the sign of its contribution.
   */
  kindKey?: string;
}

/**
 * Configuration for gantt charts, timelines and swimlane diagrams.
 * Optional when `chartType` is `'gantt'`.
 *
 * One data row is one interval: `xKey` names its lane and the two `yKeys`
 * entries its start and end, both as positions on the same numeric axis.
 * Dates therefore have to arrive as epoch milliseconds — a `Date` is not a
 * position, and a length in milliseconds needs {@link unit} to read as one.
 */
export interface GanttChartConfig {
  /**
   * The lanes, in the order the chart draws them.
   *
   * Declared rather than derived so an EMPTY lane survives: nothing booked is
   * a real statement about a schedule, and a lane with no rows cannot name
   * itself. A lane a row names but this list omits is appended at the end
   * rather than dropped.
   */
  lanes?: (string | number)[];
  /**
   * Key holding what an individual interval is called, when its lane is not
   * already its name. A lane commonly holds several — a resource booked
   * twice, a phase that pauses — and without this they are announced by
   * position alone.
   */
  labelKey?: string;
  /**
   * What a unit of the axis is called: `'days'`, `'hours'`, `'weeks'`.
   * The length of an interval is the fact a gantt exists to carry, and a bare
   * number does not carry it.
   */
  unit?: string;
}

/**
 * Configuration for gauge and bullet charts.
 * Required when `chartType` is `'gauge'`.
 *
 * The value comes from the one data row, but nothing else on a gauge does:
 * a `<RadialBarChart>` holds a magnitude and an angle, while the reading is
 * "73 out of 100, 7 below target, in the 'ok' band". The range mirrors the
 * chart's own domain and the rest is author knowledge, so all of it arrives
 * here — there is deliberately no default range, since a guessed maximum
 * misreports the one number the chart draws.
 */
export interface GaugeDialConfig {
  /** Lower end of the dial — the `<PolarAngleAxis domain>` floor. */
  min: number;
  /** Upper end of the dial — the `<PolarAngleAxis domain>` ceiling. */
  max: number;
  /** The target marker a bullet chart draws, when it has one. */
  target?: number;
  /**
   * Qualitative bands, ascending and bounded above only: a band starts where
   * the previous one ended, and the first starts at {@link min}.
   */
  bands?: GaugeBand[];
  /**
   * What the measure is called. Defaults to the data row's `xKey` value, the
   * way every other chart type takes its category label from `xKey`.
   */
  label?: string;
}

/**
 * Per-panel configuration for multi-panel (faceted) charts.
 *
 * Each panel is one Recharts chart in a grid of small multiples. Panel
 * fields mirror the corresponding {@link RechartsAdapterConfig} fields;
 * any field left out falls back to the top-level config value, so shared
 * settings (`data`, `xKey`, axis labels, ...) only need to be declared once.
 *
 * Every panel must define its own `chartType` + `yKeys` (simple mode) or
 * `layers` (composed mode) — these are the only fields without a top-level
 * default, because `subplots` is mutually exclusive with the top-level
 * `chartType`/`layers`.
 */
export interface RechartsSubplotConfig {
  /**
   * Panel display name (e.g. the facet value, "Region: East").
   * Announced when navigating between subplots.
   */
  title?: string;
  /** Panel data array. Falls back to the top-level `data`. */
  data?: Record<string, unknown>[];
  /** Chart type for this panel (simple mode). Mutually exclusive with `layers`. */
  chartType?: RechartsChartType;
  /** Key in data objects for x-axis values. Falls back to the top-level `xKey`. */
  xKey?: string;
  /** Keys in data objects for y-axis values (simple mode). Falls back to the top-level `yKeys`. */
  yKeys?: string[];
  /** Layer configurations for a composed panel (composed mode). */
  layers?: RechartsLayerConfig[];
  /** X-axis label. Falls back to the top-level `xLabel`. */
  xLabel?: string;
  /** Y-axis label. Falls back to the top-level `yLabel`. */
  yLabel?: string;
  /** Bar chart orientation. Falls back to the top-level `orientation`. */
  orientation?: Orientation;
  /** Series display names. Falls back to the top-level `fillKeys`. */
  fillKeys?: string[];
  /** Histogram bin range configuration. Falls back to the top-level `binConfig`. */
  binConfig?: HistogramBinConfig;
  /**
   * Custom CSS selector override for this panel's highlight elements.
   * Unlike other fields, this does NOT fall back to the top-level
   * `selectorOverride` (a single override cannot distinguish panels).
   * Provide an already panel-scoped selector when using this.
   */
  selectorOverride?: string;
  /**
   * Custom CSS selector for this panel's container element — the escape
   * hatch when you render the panel DOM yourself (e.g. via the
   * `useRechartsAdapter` hook) instead of letting `<MaidrRecharts>`
   * generate `.maidr-panel-<row>-<col>` wrapper divs.
   *
   * Used both to scope this panel's highlight selectors and as the
   * subplot container selector, so it must match ONLY this panel.
   */
  panelSelector?: string;
}

/**
 * Configuration for the Recharts-to-MAIDR adapter.
 *
 * Supports three configuration modes:
 * 1. **Simple mode** — Set `chartType` and `yKeys` for a single chart type
 *    with one or more data series.
 * 2. **Composed mode** — Set `layers` for mixed chart types (e.g., bar + line).
 * 3. **Subplot mode** — Set `subplots` for multi-panel (faceted) figures
 *    made of a grid of Recharts charts.
 *
 * @example Simple bar chart
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'sales-chart',
 *   title: 'Sales by Quarter',
 *   data: [{ quarter: 'Q1', revenue: 100 }, { quarter: 'Q2', revenue: 200 }],
 *   chartType: 'bar',
 *   xKey: 'quarter',
 *   yKeys: ['revenue'],
 *   xLabel: 'Quarter',
 *   yLabel: 'Revenue ($)',
 * };
 * ```
 *
 * @example Stacked bar chart
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'stacked-chart',
 *   title: 'Revenue by Product',
 *   data: [{ month: 'Jan', productA: 50, productB: 30 }],
 *   chartType: 'stacked_bar',
 *   xKey: 'month',
 *   yKeys: ['productA', 'productB'],
 *   fillKeys: ['Product A', 'Product B'],
 *   xLabel: 'Month',
 *   yLabel: 'Revenue',
 * };
 * ```
 *
 * @example Histogram
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'hist-chart',
 *   title: 'Score Distribution',
 *   data: [{ bin: '0-10', count: 5, xMin: 0, xMax: 10 }],
 *   chartType: 'histogram',
 *   xKey: 'bin',
 *   yKeys: ['count'],
 *   binConfig: { xMinKey: 'xMin', xMaxKey: 'xMax' },
 *   xLabel: 'Score',
 *   yLabel: 'Frequency',
 * };
 * ```
 *
 * @example Stacked area chart
 * ```typescript
 * // Pass each band's OWN value, not the accumulated edge — MAIDR sums the
 * // series to get the running total it announces.
 * const config: RechartsAdapterConfig = {
 *   id: 'traffic-chart',
 *   title: 'Traffic by Source',
 *   data: [{ month: 'Jan', organic: 40, paid: 20 }],
 *   chartType: 'stacked_area',
 *   xKey: 'month',
 *   yKeys: ['organic', 'paid'],
 *   xLabel: 'Month',
 *   yLabel: 'Sessions',
 * };
 * ```
 *
 * @example Bump chart
 * ```typescript
 * // Each yKey holds the competitor's RANK in that period (1 is best), not
 * // the underlying value. MAIDR inverts the pitch so rank 1 is the highest
 * // note; handing it values instead would sonify the chart upside down.
 * const config: RechartsAdapterConfig = {
 *   id: 'table-chart',
 *   title: 'League Position by Matchday',
 *   data: [{ matchday: 1, arsenal: 3, chelsea: 1 }],
 *   chartType: 'bump',
 *   xKey: 'matchday',
 *   yKeys: ['arsenal', 'chelsea'],
 *   xLabel: 'Matchday',
 *   yLabel: 'Position',
 * };
 * ```
 *
 * @example Survival curve
 * ```typescript
 * // One `yKeys` entry per arm, and the per-arm keys line up with it the way
 * // `fillKeys` does. Censoring marks a time where a subject left the study
 * // without the event happening — the curve does not step there.
 * const config: RechartsAdapterConfig = {
 *   id: 'km-chart',
 *   title: 'Overall Survival',
 *   data: [{ months: 0, treated: 1, treatedCensored: false }],
 *   chartType: 'survival',
 *   xKey: 'months',
 *   yKeys: ['treated'],
 *   survivalConfig: { censoredKeys: ['treatedCensored'] },
 *   xLabel: 'Months',
 *   yLabel: 'Survival probability',
 * };
 * ```
 *
 * @example Error bars
 * ```typescript
 * // `errorKey` is the field the Recharts `<ErrorBar dataKey>` points at, so
 * // it holds an OFFSET; the adapter turns it into the absolute bounds MAIDR
 * // announces. Data that already holds bounds uses yMinKey/yMaxKey instead.
 * const config: RechartsAdapterConfig = {
 *   id: 'yield-chart',
 *   title: 'Yield by Treatment',
 *   data: [{ treatment: 'Control', mean: 4.2, sd: 0.6 }],
 *   chartType: 'error_bar',
 *   xKey: 'treatment',
 *   yKeys: ['mean'],
 *   errorConfig: { errorKey: 'sd' },
 *   xLabel: 'Treatment',
 *   yLabel: 'Yield (t/ha)',
 * };
 * ```
 *
 * @example Forest plot
 * ```typescript
 * // `nullValue` is the <ReferenceLine> the chart draws: 1 for a ratio, 0 for
 * // a difference. Without it MAIDR reports the estimate, the interval and the
 * // weight, and makes no claim about significance.
 * const config: RechartsAdapterConfig = {
 *   id: 'meta-chart',
 *   title: 'Effect of the intervention',
 *   data: [{ study: 'Silva 2018', or: 0.62, lo: 0.41, hi: 0.94, weight: 0.12 }],
 *   chartType: 'forest',
 *   xKey: 'study',
 *   yKeys: ['or'],
 *   orientation: Orientation.HORIZONTAL,
 *   errorConfig: { yMinKey: 'lo', yMaxKey: 'hi' },
 *   forestConfig: { weightKey: 'weight', pooledKey: 'pooled', nullValue: 1 },
 *   xLabel: 'Study',
 *   yLabel: 'Odds ratio',
 * };
 * ```
 *
 * @example Volcano plot
 * ```typescript
 * // The labels are the payload on these charts — a reader told "x is 2.3,
 * // y is 14.1" has been given the two numbers they can already see the shape
 * // of, and withheld the gene they came for.
 * const config: RechartsAdapterConfig = {
 *   id: 'volcano-chart',
 *   title: 'Differential Expression',
 *   data: [{ gene: 'TP53', log2fc: 2.4, negLog10P: 14.1 }],
 *   chartType: 'volcano',
 *   xKey: 'log2fc',
 *   yKeys: ['negLog10P'],
 *   volcanoConfig: { labelKey: 'gene', significance: 1.3, effect: 1 },
 *   xLabel: 'log2 fold change',
 *   yLabel: '-log10(p)',
 * };
 * ```
 *
 * @example Alluvial (flow) diagram
 * ```typescript
 * // `data` is the `links` half of what <Sankey> is given; `flowConfig.nodes`
 * // is the other half, and resolves the indices the links carry into names.
 * const config: RechartsAdapterConfig = {
 *   id: 'flow-chart',
 *   title: 'Cohort Movement',
 *   data: [{ source: 0, target: 2, value: 34 }],
 *   chartType: 'alluvial',
 *   xKey: 'source',
 *   yKeys: ['value'],
 *   flowConfig: { targetKey: 'target', nodes: [{ name: 'Free' }, { name: 'Paid' }] },
 *   xLabel: 'Stage',
 *   yLabel: 'Users',
 * };
 * ```
 *
 * @example Diverging bar chart (population pyramid)
 * ```typescript
 * // Exactly two yKeys, the LEFT-hand side first and holding NEGATIVE values —
 * // the sign is the side, and MAIDR pitches the magnitude so the biggest bar
 * // on the left is not heard as the smallest note on the chart.
 * const config: RechartsAdapterConfig = {
 *   id: 'pyramid-chart',
 *   title: 'Population by Age Band',
 *   data: [{ band: '0-9', men: -2_100_000, women: 2_000_000 }],
 *   chartType: 'diverging_bar',
 *   xKey: 'band',
 *   yKeys: ['men', 'women'],
 *   fillKeys: ['Men', 'Women'],
 *   orientation: Orientation.HORIZONTAL,
 *   xLabel: 'Age band',
 *   yLabel: 'People',
 * };
 * ```
 *
 * @example Waterfall chart
 * ```typescript
 * // The yKey holds each step's CONTRIBUTION; the adapter accumulates the
 * // running totals, because a waterfall bar floats between the total before
 * // the step and the total after it and neither number is in the data.
 * const config: RechartsAdapterConfig = {
 *   id: 'bridge-chart',
 *   title: 'Revenue Bridge',
 *   data: [
 *     { step: 'Opening', change: 1200, restates: true },
 *     { step: 'New sales', change: 450 },
 *     { step: 'Churn', change: -180 },
 *     { step: 'Closing', restates: true },
 *   ],
 *   chartType: 'waterfall',
 *   xKey: 'step',
 *   yKeys: ['change'],
 *   waterfallConfig: { totalKey: 'restates' },
 *   xLabel: 'Step',
 *   yLabel: 'Revenue ($k)',
 * };
 * ```
 *
 * @example Dumbbell chart
 * ```typescript
 * // Two yKeys, the starting end first, and `fillKeys` names them: those
 * // names are what the comparison is about, and the legend is where a
 * // sighted reader gets them.
 * const config: RechartsAdapterConfig = {
 *   id: 'life-chart',
 *   title: 'Life Expectancy, 1990 against 2020',
 *   data: [{ country: 'Japan', then: 78.9, now: 84.6 }],
 *   chartType: 'dumbbell',
 *   xKey: 'country',
 *   yKeys: ['then', 'now'],
 *   fillKeys: ['1990', '2020'],
 *   xLabel: 'Country',
 *   yLabel: 'Years',
 * };
 * ```
 *
 * @example Gantt chart
 * ```typescript
 * // One row per interval: `xKey` is its lane and the two `yKeys` its start
 * // and end. Declare `lanes` so a lane with nothing booked still exists —
 * // an empty row is a real statement about a schedule.
 * const config: RechartsAdapterConfig = {
 *   id: 'plan-chart',
 *   title: 'Release Plan',
 *   data: [{ task: 'Design', from: 0, to: 5 }, { task: 'Build', from: 3, to: 12 }],
 *   chartType: 'gantt',
 *   xKey: 'task',
 *   yKeys: ['from', 'to'],
 *   ganttConfig: { lanes: ['Design', 'Build', 'Launch'], unit: 'days' },
 *   xLabel: 'Task',
 *   yLabel: 'Day',
 * };
 * ```
 *
 * @example Gauge chart
 * ```typescript
 * // One data row, and everything the reading needs beyond its value comes
 * // from the config: "73" is not the reading, "73 out of 100, 7 below
 * // target, in the 'ok' band" is.
 * const config: RechartsAdapterConfig = {
 *   id: 'nps-chart',
 *   title: 'Net Promoter Score',
 *   data: [{ measure: 'NPS', score: 73 }],
 *   chartType: 'gauge',
 *   xKey: 'measure',
 *   yKeys: ['score'],
 *   gaugeConfig: {
 *     min: 0,
 *     max: 100,
 *     target: 80,
 *     bands: [{ to: 40, label: 'poor' }, { to: 70, label: 'ok' }, { to: 100, label: 'good' }],
 *   },
 * };
 * ```
 *
 * @example Treemap / sunburst
 * ```typescript
 * // `data` is the nested array Recharts is given, not the adapter's usual
 * // flat rows. `xKey` is the `<Treemap nameKey>` and the single `yKeys`
 * // entry its `dataKey`; children live under `children`, as Recharts
 * // requires. A `<SunburstChart data={{ name: 'World', children }}>` passes
 * // that same `children` array here, since it draws every node but the root.
 * const config: RechartsAdapterConfig = {
 *   id: 'regions-chart',
 *   title: 'Population by Region',
 *   data: [
 *     { name: 'Europe', children: [{ name: 'France', people: 67.4 }] },
 *     { name: 'Asia', children: [{ name: 'Japan', people: 125.1 }] },
 *   ],
 *   chartType: 'treemap',
 *   xKey: 'name',
 *   yKeys: ['people'],
 * };
 * ```
 *
 * @example Pie chart
 * ```typescript
 * // `xKey` is the Recharts `<Pie nameKey>` (the slice label) and the single
 * // `yKeys` entry is its `dataKey` (the slice magnitude).
 * const config: RechartsAdapterConfig = {
 *   id: 'fruit-chart',
 *   title: 'Fruit Sales',
 *   data: [{ fruit: 'Apples', units: 30 }, { fruit: 'Bananas', units: 50 }],
 *   chartType: 'pie',
 *   xKey: 'fruit',
 *   yKeys: ['units'],
 *   xLabel: 'Fruit',
 *   yLabel: 'Units',
 * };
 * ```
 *
 * @example Composed chart (bar + line)
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'mixed-chart',
 *   title: 'Revenue and Trend',
 *   data: [{ month: 'Jan', revenue: 100, trend: 95 }],
 *   xKey: 'month',
 *   layers: [
 *     { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
 *     { yKey: 'trend', chartType: 'line', name: 'Trend' },
 *   ],
 *   xLabel: 'Month',
 *   yLabel: 'Value',
 * };
 * ```
 *
 * @example Multi-panel (faceted) figure — 1x2 grid of bar charts
 * ```typescript
 * const config: RechartsAdapterConfig = {
 *   id: 'sales-by-region',
 *   title: 'Sales by Region',
 *   xKey: 'quarter',           // top-level fields are defaults for every panel
 *   yKeys: ['revenue'],
 *   xLabel: 'Quarter',
 *   yLabel: 'Revenue ($)',
 *   subplots: [[
 *     { title: 'East', chartType: 'bar', data: eastData },
 *     { title: 'West', chartType: 'bar', data: westData },
 *   ]],
 * };
 * ```
 */
export interface RechartsAdapterConfig {
  /** Unique identifier for the chart (used for DOM IDs). */
  id: string;

  /** Chart title displayed in text descriptions. */
  title?: string;

  /** Chart subtitle. */
  subtitle?: string;

  /** Chart caption. */
  caption?: string;

  /**
   * Recharts data array. Each item is one data point with named fields.
   * Required in simple/composed mode. In subplot mode it acts as the
   * default data for panels that do not provide their own `data`, and may
   * be omitted when every panel does.
   */
  data?: Record<string, unknown>[];

  /**
   * Chart type for simple mode (single chart type with one or more series).
   * Mutually exclusive with `layers`.
   */
  chartType?: RechartsChartType;

  /** Key in data objects for x-axis values. */
  xKey: string;

  /**
   * Keys in data objects for y-axis values (simple mode).
   * Each key creates a separate data series.
   * Mutually exclusive with `layers`.
   */
  yKeys?: string[];

  /**
   * Layer configurations for composed charts (composed mode).
   * Each layer defines a chart type and data key.
   * Mutually exclusive with `chartType`/`yKeys`.
   */
  layers?: RechartsLayerConfig[];

  /**
   * Panel configurations for multi-panel (faceted) figures (subplot mode).
   * Mutually exclusive with the top-level `chartType` and `layers`.
   *
   * A 2D array describes the panel grid directly in row-major visual
   * reading order (`subplots[0][0]` is the top-left panel). A flat array
   * is chunked into rows of {@link columns} panels (one single row when
   * `columns` is omitted). Rows may be ragged but never empty.
   *
   * When rendering through `<MaidrRecharts>`, pass one Recharts chart per
   * panel as children in the same row-major order — each child is wrapped
   * in a generated `.maidr-panel-<row>-<col>` div used for per-panel
   * highlight scoping. See {@link RechartsSubplotConfig.panelSelector} for
   * the custom-DOM escape hatch.
   */
  subplots?: RechartsSubplotConfig[] | RechartsSubplotConfig[][];

  /**
   * Number of panels per row when `subplots` is a flat array.
   * Ignored when `subplots` is already a 2D grid.
   */
  columns?: number;

  /** X-axis label. */
  xLabel?: string;

  /** Y-axis label. */
  yLabel?: string;

  /** Bar/box chart orientation. Defaults to vertical. */
  orientation?: Orientation;

  /**
   * Display names for each series in stacked/dodged/normalized/diverging bar
   * charts. Maps 1:1 with `yKeys` — the i-th fillKey names the i-th yKey.
   * When omitted, the yKey strings are used as fill labels.
   *
   * A dumbbell reads them as the names of its two ends. They are the content
   * of that comparison: announced as "start" and "end", a chart of life
   * expectancy in 1990 against 2020 tells the reader which dot they are on
   * and not which year it is.
   */
  fillKeys?: string[];

  /**
   * Histogram bin range configuration.
   * Required when `chartType` is `'histogram'`.
   */
  binConfig?: HistogramBinConfig;

  /**
   * Flow link configuration.
   * Required when `chartType` is `'alluvial'`.
   */
  flowConfig?: FlowLinkConfig;

  /**
   * Point labels and cutoffs for a volcano or Manhattan plot.
   * Used when `chartType` is `'volcano'` or `'manhattan'`.
   */
  volcanoConfig?: VolcanoPointConfig;

  /**
   * Interval configuration.
   * Used when `chartType` is `'error_bar'` or `'forest'`.
   */
  errorConfig?: ErrorIntervalConfig;

  /**
   * Forest plot configuration.
   * Used when `chartType` is `'forest'`.
   */
  forestConfig?: ForestPlotConfig;

  /**
   * Survival curve configuration.
   * Used when `chartType` is `'survival'`.
   */
  survivalConfig?: SurvivalCurveConfig;

  /**
   * Waterfall step configuration.
   * Used when `chartType` is `'waterfall'`.
   */
  waterfallConfig?: WaterfallStepConfig;

  /**
   * Gantt lane configuration.
   * Used when `chartType` is `'gantt'`.
   */
  ganttConfig?: GanttChartConfig;

  /**
   * Gauge range, target and bands.
   * Required when `chartType` is `'gauge'`.
   */
  gaugeConfig?: GaugeDialConfig;

  /**
   * Custom CSS selector override for SVG highlighting.
   *
   * By default the adapter generates selectors from Recharts' built-in
   * class names. For multi-series charts, CSS selectors cannot reliably
   * distinguish between series, so highlighting is disabled.
   *
   * To enable highlighting for multi-series charts, add a custom
   * `className` to each Recharts component and pass the selector here:
   *
   * @example
   * ```tsx
   * <Bar className="revenue-bar" dataKey="revenue" />
   * // then set selectorOverride: '.revenue-bar .recharts-bar-rectangle'
   * ```
   */
  selectorOverride?: string;
}

/**
 * Props for the MaidrRecharts wrapper component.
 */
export interface MaidrRechartsProps extends RechartsAdapterConfig {
  /** Recharts chart component(s) to make accessible. */
  children: React.ReactNode;
}
