/**
 * Represents the trend direction for candlestick data points.
 * Used across the application for audio palette selection and data representation.
 */
export type CandlestickTrend = 'Bull' | 'Bear' | 'Neutral';

/**
 * Format function signature for axis values.
 * Takes a value (number or string) and returns a formatted string.
 *
 * @example
 * // Currency formatting
 * const currencyFormat: FormatFunction = (v) => `$${Number(v).toFixed(2)}`;
 *
 * @example
 * // Date formatting
 * const dateFormat: FormatFunction = (v) => new Date(v).toLocaleDateString();
 */
export type FormatFunction = (value: number | string) => string;

/**
 * Supported format type specifiers for JSON/HTML API.
 */
export type FormatType = 'currency' | 'percent' | 'fixed' | 'number' | 'date' | 'scientific';

/**
 * Configuration for formatting values on an axis.
 *
 * Two ways to specify formatting:
 * 1. `function` - Function body string (for custom logic)
 * 2. `type` - Format type specifier (for common patterns)
 *
 * @example
 * // Using function string
 * { "function": "return `$${Number(value).toFixed(2)}`" }
 *
 * @example
 * // Using type specifier
 * { "type": "currency", "decimals": 2 }
 */
export interface AxisFormat {
  /**
   * Function body string for custom formatting.
   * The function receives `value` as parameter and must return a string.
   *
   * @example
   * // Currency formatting
   * { "function": "return `$${Number(value).toFixed(2)}`" }
   *
   * @example
   * // Date formatting
   * { "function": "return new Date(value).toLocaleDateString('en-US')" }
   */
  function?: string;

  /**
   * Format type specifier for common formatting patterns.
   * Use with `decimals`, `currency`, `locale`, `dateOptions` for customization.
   *
   * @example
   * { "type": "currency", "currency": "USD", "decimals": 2 }
   * { "type": "percent", "decimals": 1 }
   * { "type": "date", "dateOptions": { "month": "short", "day": "numeric" } }
   */
  type?: FormatType;

  /**
   * Number of decimal places for numeric formatters.
   * Used with: currency, percent, fixed, number, scientific
   * @default varies by type
   */
  decimals?: number;

  /**
   * ISO 4217 currency code for currency formatter.
   * @default 'USD'
   */
  currency?: string;

  /**
   * BCP 47 locale string for locale-aware formatters.
   * Used with: currency, number, date
   * @default 'en-US'
   */
  locale?: string;

  /**
   * Options for Intl.DateTimeFormat when using date type.
   *
   * @example
   * { "month": "short", "day": "numeric" } // "Jan 15"
   * { "year": "numeric", "month": "long" } // "January 2024"
   */
  dateOptions?: Intl.DateTimeFormatOptions;
}

/**
 * Configuration options for violin plot display.
 * Controls which summary statistics are shown in the violin box overlay.
 * Sent from the Python backend alongside violin_kde and violin_box layers.
 */
export interface ViolinOptions {
  /** Show median line marker. Default: true */
  showMedian?: boolean;
  /** Show mean value marker. Default: false */
  showMean?: boolean;
  /** Show extrema (min/max) markers. Default: true */
  showExtrema?: boolean;
}

/**
 * Data point for violin KDE (kernel density estimation) curves.
 * Library-agnostic — no SVG coordinates embedded in data.
 * The density field falls back to width if absent.
 */
export interface ViolinKdePoint {
  /** Categorical label for the violin (e.g., "setosa") */
  x: string | number;
  /** Position along the density axis */
  y: number;
  /** KDE density value at this point. Falls back to `width` if absent. */
  density?: number;
  /** Half-width of the violin at this Y level (used as density fallback) */
  width?: number;
  /** SVG viewport x-coordinate for highlight positioning (provided by backend) */
  svg_x?: number;
  /** SVG viewport y-coordinate for highlight positioning (provided by backend) */
  svg_y?: number;
}

/**
 * Root MAIDR data structure containing figure metadata and subplot grid.
 * This is the type for the `data` prop passed to the `<Maidr>` React component.
 *
 * @example
 * ```typescript
 * const data: Maidr = {
 *   id: 'my-chart',
 *   title: 'Sales by Quarter',
 *   subplots: [[{
 *     layers: [{
 *       id: '0',
 *       type: 'bar',
 *       axes: { x: 'Quarter', y: 'Revenue' },
 *       data: [{ x: 'Q1', y: 120 }, { x: 'Q2', y: 200 }],
 *     }],
 *   }]],
 * };
 * ```
 */
/**
 * Callback invoked when the active data point changes during navigation.
 * Used by canvas-based charting libraries (e.g., Chart.js) for visual highlighting.
 *
 * `null` means no data point is active — the cursor has left a subplot for the
 * figure lobby of a multi-panel chart. A consumer drawing an overlay must clear
 * it, since there is no other signal that the selection ended: without one, the
 * last point's highlight stays on screen and follows the user to another panel,
 * pointing at a chart it does not belong to.
 *
 * @param info - The current navigation position, or `null` when nothing is
 *   selected
 * @param info.layerId - The ID of the active layer/trace
 * @param info.row - The current row index (e.g., dataset index)
 * @param info.col - The current column index (e.g., data point index)
 */
export type NavigateCallback = (info: { layerId: string; row: number; col: number } | null) => void;

export interface Maidr {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /**
   * Optional figure-wide axis labels shared across every subplot — e.g. a facet
   * grid whose panels all sit on one common X and Y axis drawn at the figure
   * margins. Only `label` is honored at the figure level, so the type is
   * narrowed to `Pick<AxisConfig, 'label'>` (a layer's `min` / `max` /
   * `tickStep` / `format` have no figure-wide meaning and would be silently
   * ignored — the narrower type surfaces that as a compile error instead).
   *
   * When present and authored, the figure lobby's `l x` / `l y` announce these
   * as the figure-wide label; when omitted they fall back to the focused
   * subplot's own axis, so existing charts are unaffected.
   *
   * @example
   * axes: { x: { label: "Year" }, y: { label: "Revenue" } }
   */
  axes?: {
    x?: Pick<AxisConfig, 'label'>;
    y?: Pick<AxisConfig, 'label'>;
  };
  /**
   * 2D grid of subplots. Each row is an array of subplots.
   * For a single chart, use `[[{ layers: [...] }]]`.
   */
  subplots: MaidrSubplot[][];
  /**
   * Enables live/realtime mode for this chart. When true:
   * - React consumers can update the `data` prop to replace the chart data in place.
   * - Script-tag consumers can push updates via `window.maidrLive.setData()` /
   *   `window.maidrLive.appendData()`.
   * - The 'M' key toggles monitor mode, which auto-sonifies and announces
   *   newly appended data points.
   *
   * Static charts (the default) are unaffected.
   */
  live?: boolean;
  /**
   * Sliding window size for streaming data. When set, appending a data point
   * beyond this width drops the oldest point(s), keeping at most `maxWidth`
   * points per series. Only applies to `appendData` updates.
   */
  maxWidth?: number;
  /**
   * Optional callback invoked when the active data point changes.
   * Used by canvas-based charting libraries (e.g., Chart.js) for visual highlighting,
   * since canvas elements cannot be targeted with CSS selectors.
   *
   * This field is not serializable as JSON; it is only available when constructing
   * MAIDR data programmatically (e.g., via the Chart.js plugin or React API).
   */
  onNavigate?: NavigateCallback;
}

/**
 * Subplot data structure containing optional legend and trace layers.
 * A subplot groups one or more layers (traces) that share the same coordinate space.
 *
 * @example
 * ```typescript
 * const subplot: MaidrSubplot = {
 *   layers: [
 *     { id: '0', type: 'bar', axes: { x: 'X', y: 'Y' }, data: [...] },
 *     { id: '1', type: 'line', axes: { x: 'X', y: 'Y' }, data: [...] },
 *   ],
 * };
 * ```
 */
export interface MaidrSubplot {
  /** Legend labels for multi-series plots. */
  legend?: string[];
  /** CSS selector for the subplot container element. */
  selector?: string;
  /** Array of trace layers in this subplot. */
  layers: MaidrLayer[];
}

/**
 * Data point for bar charts with x and y coordinates.
 */
export interface BarPoint {
  x: string | number;
  y: number | string;
}

/**
 * Data point for boxplots containing quartiles, min/max, and outliers.
 */
export interface BoxPoint {
  z: string;
  lowerOutliers: number[];
  min: number;
  q1: number;
  q2: number;
  q3: number;
  max: number;
  upperOutliers: number[];
  /** Mean value for violin plots when mean display is enabled. */
  mean?: number;
}

/**
 * One rung of a letter-value ladder: a pair of quantiles symmetric about the
 * median.
 *
 * `p` is the *tail* probability, which is how letter-value plots are defined
 * and how the libraries that draw them report it: `p = 0.25` is the rung
 * spanning the middle half, `p = 0.125` the middle three quarters, and so on
 * inwards from the median. The trace converts it to percentiles for the
 * announcement, because "the 12.5th percentile" is a number a reader can
 * place and "p is 0.125" is one they have to convert.
 */
export interface LetterValueLevel {
  /**
   * Tail probability, strictly between 0 and 0.5.
   *
   * The median is carried separately on `BoxenPoint` and is not a rung, so
   * `0.5` is out of range rather than a way of naming it: a rung at `0.5`
   * would put two positions labelled `50th percentile` either side of the one
   * already called `median`. Values outside the range are dropped.
   */
  p: number;
  /** The lower quantile of the pair: the `p` quantile. */
  lo: number;
  /** The upper quantile of the pair: the `1 - p` quantile. */
  hi: number;
}

/**
 * One boxen (letter-value) plot: a median, a ladder of quantile pairs around
 * it, and whatever fell outside the deepest rung.
 *
 * A box plot's five-number summary is this shape with exactly one rung, and
 * that fixed depth is the reason it cannot express a boxen: the point of a
 * letter-value plot is that a large sample gets *more* rungs, so the tails
 * stay legible instead of collapsing into a whisker and a scatter of dots.
 */
export interface BoxenPoint {
  /** The category this boxen summarises. */
  z: string;
  /** The middle of the distribution. */
  median: number;
  /**
   * The rungs, which the trace sorts outward from the median rather than
   * trusting the order they arrive in -- a producer emitting them
   * inward-first would otherwise be navigated backwards.
   */
  levels: LetterValueLevel[];
  /** Values beyond the deepest rung, below it and above it. */
  lowerOutliers?: number[];
  upperOutliers?: number[];
}

/**
 * DOM selectors for boxplot visual elements.
 */
export interface BoxSelector {
  lowerOutliers: string[];
  min: string;
  iq: string;
  q2: string;
  max: string;
  upperOutliers: string[];
  /** CSS selector for mean marker element in violin plots. */
  mean?: string;
  /** Optional direct CSS selector for Q1 element (bypasses iq edge derivation). */
  q1?: string;
  /** Optional direct CSS selector for Q3 element (bypasses iq edge derivation). */
  q3?: string;
}

/**
 * Data point for candlestick charts with OHLC values, volume, and trend information.
 */
export interface CandlestickPoint {
  value: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Optional volume data. May be undefined when source (e.g., Google Charts) doesn't provide it. */
  volume?: number;
  trend: CandlestickTrend;
  volatility: number;
}

/**
 * One estimate with the interval drawn around it.
 *
 * The interval is the reason this is a point shape of its own rather than a
 * scatter point: a chart drawn this way carries two magnitudes at every
 * sample — the estimate, and how far from it the data is consistent with —
 * and a reading that names only the first drops the part most statistical
 * graphics are drawn to show.
 *
 * `lower` and `upper` are absolute positions on the value axis, not offsets
 * from `y`. Producers disagree about which they hand out (matplotlib's
 * `yerr` is an offset, Vega-Lite's `errorbar` computes bounds), so the
 * schema fixes one and each adapter converts to it.
 *
 * The bounds are optional and independently so: a one-sided interval — an
 * upper bound with no lower, say — is a real chart, and dropping the point
 * for want of its other half would lose the estimate too.
 */
export interface ErrorBarPoint {
  /** Position along the main axis. */
  x: number | string;
  /** The estimate itself: a mean, a median, a fitted value. */
  y: number;
  /** Absolute lower bound of the interval, when the chart draws one. */
  yMin?: number;
  /** Absolute upper bound of the interval, when the chart draws one. */
  yMax?: number;
}

/**
 * One row of a forest plot: a study's effect estimate with its interval.
 *
 * A meta-analysis draws one of these per study against a shared null line,
 * with a pooled summary at the foot. It is an {@link ErrorBarPoint} laid out
 * on a categorical row axis, plus the two things that make the figure a
 * forest plot rather than a row of intervals.
 */
export interface ForestPoint extends ErrorBarPoint {
  /**
   * The study's weight in the pooled estimate, as a fraction of one.
   *
   * A forest plot encodes this as marker *area*, which is a magnitude a
   * reader is otherwise never told: two studies whose intervals look alike
   * can contribute wholly differently to the result.
   */
  weight?: number;

  /**
   * Marks the pooled summary rather than a study.
   *
   * It is a different kind of row -- it is not evidence, it is what the
   * evidence came to -- and announcing it as one more study invites a reader
   * to count it among them.
   */
  pooled?: boolean;
}

/**
 * Display configuration for a forest plot layer.
 */
export interface ForestOptions {
  /**
   * The value that means "no effect" -- 1 for a ratio measure, 0 for a
   * difference.
   *
   * Whether an interval crosses it *is the result for that study*, so the
   * trace announces the crossing. There is deliberately **no default**: a
   * ratio chart guessed at 0 would report every study as not crossing, since
   * odds ratios are all positive, and that is a confident wrong answer given
   * to every row. A layer that does not declare it gets the estimate, the
   * interval and the weight, and no claim about significance.
   */
  nullValue?: number;
}

/**
 * What a waterfall step does to the running total.
 *
 * `total` marks a step that restates the running total rather than changing
 * it — the opening and closing bars, and any subtotal drawn along the way.
 * Those sit on the baseline instead of floating, and a reader told a subtotal
 * "rose by 950" would be hearing a contribution the chart never made.
 */
export type WaterfallKind = 'increase' | 'decrease' | 'total';

/**
 * One step of a waterfall chart.
 *
 * A waterfall answers "how did we get from here to there", so a step carries
 * two numbers that a bar chart would conflate: the contribution it made
 * (`delta`) and the running total it produced (`end`). The bar is drawn
 * floating between `start` and `end`, which is why neither alone describes it
 * — the height is the contribution and the position is the total.
 *
 * `start` and `end` are absolute positions on the value axis, so a producer
 * that only knows offsets has to accumulate them before emitting, the same
 * way {@link ErrorBarPoint} fixes absolute bounds.
 */
export interface WaterfallPoint {
  /** The step's label along the category axis. */
  x: number | string;
  /** Running total before this step. */
  start: number;
  /** Running total after this step. */
  end: number;
  /**
   * The signed contribution, `end - start`.
   *
   * Carried rather than derived because a producer may round the two totals
   * for display, and a delta recomputed from rounded ends is not the number
   * the chart's own label shows.
   */
  delta: number;
  /** Whether the step adds, subtracts, or restates the total. */
  kind: WaterfallKind;
}

/**
 * One term of a word cloud.
 *
 * A word cloud is the canonical chart that carries real data while being
 * readable only by eye: the weight is encoded as glyph size and written down
 * nowhere on the page. Structurally it is a categorical label and a
 * magnitude, which is why it needs no shape of its own beyond naming them.
 */
export interface WordCloudPoint {
  /** The term. */
  x: string;
  /**
   * Its weight -- a frequency, a score, a count.
   *
   * Widened to accept a string for the same reason {@link BarPoint.y} is:
   * hand-authored JSON and some producers send numbers as strings, and the
   * trace coerces on the way in. Declaring it `number` alone would not stop
   * one arriving, it would only stop the compiler from admitting it -- and a
   * string reaching the description's running total would concatenate rather
   * than add.
   */
  y: number | string;
}

/**
 * One qualitative band of a bullet chart, named and bounded above.
 *
 * Bands partition the range, so only the upper edge is carried: a band starts
 * where the previous one ended, and the first starts at the gauge's `min`.
 * Carrying both edges would let a chart declare overlapping or gapped bands
 * that the drawing cannot express.
 */
export interface GaugeBand {
  /** Upper edge of the band, inclusive. */
  to: number;
  /** What the band is called -- "poor", "ok", "good". */
  label: string;
}

/**
 * A gauge or bullet chart: one measure against a range.
 *
 * Unlike every other trace's data this is a single object rather than an
 * array, because the chart draws exactly one measure -- the same reason
 * {@link HeatmapData} is an object. An array of one would describe a shape the
 * chart does not have.
 *
 * The value alone is not the reading. "73" means nothing without the range it
 * sits in, the target it was aiming at, and the band it lands in, and none of
 * those are written anywhere a screen reader can reach on a drawn gauge.
 */
export interface GaugePoint {
  /** The measure. */
  value: number;
  /** Lower end of the dial. */
  min: number;
  /** Upper end of the dial. */
  max: number;
  /** What the measure is called, when the chart names it. */
  label?: string;
  /** The target marker a bullet chart draws, when it has one. */
  target?: number;
  /** Qualitative bands, in ascending order. */
  bands?: GaugeBand[];
}

/**
 * One row of a dumbbell chart: a category and the pair of values compared at
 * it.
 *
 * The pair is what the chart is for -- before and after, two groups, two
 * years -- and the segment drawn between the dots is the comparison. Which of
 * the two is larger is not fixed: a dumbbell showing a decline draws `end`
 * below `start`, and a chart usually contains both directions at once.
 *
 * The change between them is deliberately absent, and derived instead. A
 * drawn segment cannot disagree with the dots it joins, so an authored delta
 * is a second source of truth for a quantity that already has one -- and the
 * one a reader would be told is the one the chart did not draw.
 */
/**
 * One interval of a gantt chart, timeline or swimlane diagram.
 *
 * The two coordinates are both positions on the same axis rather than a
 * position and a magnitude, which is what makes this a shape of its own. A bar
 * has one number and a baseline; an interval has two numbers and no baseline,
 * and its length is a difference the reader has to be told rather than a
 * height they can hear.
 */
export interface GanttPoint {
  /** Which lane the interval belongs to -- a task, a resource, a phase. */
  x: number | string;
  /** Where the interval begins. */
  start: number;
  /** Where the interval ends. */
  end: number;
  /**
   * What this interval is called, when the lane is not already its name.
   *
   * A lane commonly holds several intervals -- a resource booked twice, a
   * phase that pauses and resumes -- and without this they are announced by
   * position alone. Omit it when the lane names the work.
   */
  label?: string;
}

/**
 * A gantt chart: its lanes, and how its axis reads.
 *
 * An object rather than a bare array, for the reason {@link DumbbellData} is
 * one: a unit belongs to the chart and not to any row, and repeating it per
 * point would let a producer emit rows that disagree about what their numbers
 * measure.
 */
export interface GanttData {
  /**
   * The lanes, in the order the chart draws them, each holding the intervals
   * of one lane.
   *
   * Nested rather than flat so a lane with no intervals still exists: an empty
   * row is a real statement about a schedule -- nothing is booked -- and a
   * flat list grouped by `x` cannot say it.
   */
  points: GanttPoint[][];
  /**
   * What each lane is called, in the order {@link GanttData.points} holds
   * them.
   *
   * A populated lane names itself: every interval carries its lane in `x`. An
   * **empty** lane holds no interval and so has nowhere to carry one, which
   * makes it the only row a reader can navigate onto and be told nothing
   * about -- and an empty lane is exactly the row this shape is nested to be
   * able to express. This is where its name goes.
   *
   * Optional, and optional per entry: a chart with no empty lanes need not
   * supply it, and the trace prefers a lane's own intervals over this when
   * both are present, so a producer cannot make the two disagree about a
   * populated lane.
   */
  lanes?: (string | number)[];
  /**
   * What a unit of the axis is called: "days", "hours", "weeks".
   *
   * The length of an interval is the fact a gantt exists to carry, and a bare
   * number does not carry it. Omitted, the trace announces the length without
   * a unit rather than guessing one.
   */
  unit?: string;
}

export interface DumbbellPoint {
  /** Position along the category axis. */
  x: number | string;
  /** The value the segment starts at -- the earlier, or the reference, one. */
  start: number;
  /** The value the segment ends at. */
  end: number;
}

/**
 * A dumbbell chart: its rows, and what its two ends are called.
 *
 * An object rather than a bare array -- as {@link HeatmapData} and
 * {@link GaugePoint} already are -- because the names of the two ends belong
 * to the chart and not to any one row. Repeating them on every point would
 * let a producer emit rows that disagree about what the chart is comparing.
 *
 * Those names are the content of the comparison. Announced as "start" and
 * "end", a chart of life expectancy in 1990 against 2020 tells the reader
 * which dot they are on and not which year it is, which is the one thing the
 * legend gives a sighted reader for free.
 */
export interface DumbbellData {
  /** The rows, in the order the chart draws them. */
  points: DumbbellPoint[];
  /** What the starting end is called -- "1990", "before", "control". */
  startLabel?: string;
  /** What the finishing end is called -- "2020", "after", "treatment". */
  endLabel?: string;
}

/**
 * Data structure for heatmap charts with x/y labels and 2D point values.
 */
export interface HeatmapData {
  x: string[];
  y: string[];
  points: number[][];
}

/**
 * One hexagonal bin: where its centre is, and how many points fell in it.
 *
 * The centre is carried per bin rather than derived from a lattice origin and
 * a cell size, because a hex lattice staggers alternate rows by half a cell --
 * so a bin's index does not give its position, and a consumer reconstructing
 * one would have to know which rows a particular library chose to offset.
 */
export interface HexbinPoint {
  /** The bin's centre along the x axis. */
  x: number | string;
  /** The bin's centre along the y axis. */
  y: number | string;
  /** How many points fell in it. */
  count: number;
}

/**
 * Data point for histograms extending bar points with bin ranges.
 */
export interface HistogramPoint extends BarPoint {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Data point for line charts with optional fill color for multi-series plots.
 */
export interface LinePoint {
  x: number | string;
  y: number;
  z?: string;
  /**
   * Ordinal level name announced in place of the raw numeric `y`, for a chart
   * whose y axis is a category rather than a magnitude — a hypnogram's sleep
   * stages, a Likert response, a severity grade. `y` stays numeric because it
   * drives sonification, braille and the min/max range, so the human-readable
   * name has to travel alongside it.
   *
   * An empty string counts as absent, so a producer that emits `''` for an
   * unnamed level gets the numeric announcement rather than a blank one.
   * Omitting it entirely is the right shape for a continuous y.
   *
   * @example
   * { x: 1.5, y: 3, label: 'REM' }
   */
  label?: string;
}

/**
 * One point on one iso-value curve of a contour plot.
 *
 * A contour draws a scalar field as curves of constant value, so a layer is
 * one curve per level -- structurally the multi-line layer {@link LineTrace}
 * already navigates. What makes it a type of its own is that the **level is a
 * first-class object rather than a colour**: the questions a reader brings are
 * how many levels there are, where the 0.05 contour runs, and how far apart
 * the curves are here.
 */
export interface ContourPoint extends LinePoint {
  /**
   * The value of the field along this curve.
   *
   * Constant down a curve and carried on every point of it, the way `z` is:
   * the grammar's unit is the point, and a producer emitting a flat list has
   * nowhere else to put it.
   */
  level?: number;
}

/**
 * Data point for one slice of a pie chart.
 *
 * A pie layer's `data` is a flat `PiePoint[]` — one entry per slice, in the
 * order the slices are drawn — never the nested group array the bar-family
 * types use.
 *
 * `y` is strictly numeric, unlike {@link BarPoint.y}: it is both the sonified
 * magnitude and the numerator of the slice's percentage, and a percentage
 * derived from a string is not a percentage.
 *
 * There is deliberately no `percentage` field. The share of the whole is
 * derived once in the model as `y / sum(y) * 100`, so an authored percentage
 * can never disagree with the values it is supposedly derived from.
 */
export interface PiePoint {
  /** Slice label, e.g. the category the slice stands for. */
  x: string | number;
  /** Slice magnitude. Negative values are not meaningful in a pie. */
  y: number;
}

/**
 * Data point for scatter plots with x and y coordinates, plus optional z for 3D.
 */
export interface ScatterPoint {
  x: number;
  y: number;
  z?: number;
}

/**
 * One point of a volcano or Manhattan plot.
 *
 * Both are scatters read almost entirely through a threshold: a volcano puts
 * effect size against significance, a Manhattan puts genomic position against
 * it. They routinely carry tens of thousands of points of which a few dozen
 * matter, so the question is never "what is at this coordinate" -- it is
 * "which points cross the line, and what are they called".
 */
export interface VolcanoPoint extends ScatterPoint {
  /**
   * What the point *is* -- a gene, a SNP, a probe.
   *
   * Identity is the payload on these charts, not the coordinates. A reader
   * told "x is 2.3, y is 14.1" has been given the two numbers they can see
   * the shape of already and withheld the one thing they came for.
   */
  label?: string;

  /**
   * The region the point belongs to -- a chromosome on a Manhattan plot.
   *
   * Announced alongside the point, because "which chromosome is it on" is
   * the second question every one of these charts is read for.
   */
  group?: string;
}

/**
 * Display configuration for a volcano or Manhattan plot layer.
 */
export interface ThresholdOptions {
  /**
   * The significance cutoff on the y axis.
   *
   * There is deliberately no default. These charts are drawn on transformed
   * axes whose conventions differ by field and by software: -log10(p) at 1.3
   * for p < 0.05, and at 7.3 for genome-wide significance. A guessed line
   * would sort every point on the figure onto the wrong side, silently.
   */
  significance?: number;

  /**
   * Which side of the significance cutoff is the significant one.
   *
   * `above` is the default because the transformed axes these charts usually
   * carry -- -log10(p) and its relatives -- put the interesting points at the
   * top. A **raw p axis runs the other way**: there, p <= 0.05 is the
   * finding, and a reading fixed to `above` would select precisely the points
   * that failed to reach significance and announce them as the result.
   *
   * That is not a degraded reading, it is the exact inverse of one, which is
   * why this is declarable rather than assumed.
   */
  significanceDirection?: 'above' | 'below';

  /**
   * The effect-size cutoff on the x axis, applied to its **magnitude** -- a
   * volcano is symmetric, and a fold change of -2 is as large an effect as
   * one of +2.
   */
  effect?: number;
}

/**
 * Data point for segmented/grouped bar charts with fill color identifier.
 */
export interface SegmentedPoint extends BarPoint {
  z: string;
}

/**
 * One cell of a mosaic (marimekko) plot.
 *
 * A mosaic is a stacked bar chart in which the **bar widths also encode
 * data** -- typically each category's share of all observations. A reader
 * given only the segment heights has half the table: the conditional
 * proportions without the group sizes they were computed from, so a category
 * of six people and one of six hundred read identically.
 */
export interface MosaicPoint extends SegmentedPoint {
  /**
   * The category's share of all observations, as a fraction of one -- the
   * width its column is drawn at.
   *
   * Carried on every cell of the column rather than once per column, the way
   * `z` is carried on every cell of a series: the grammar's unit is the
   * point, and a producer emitting a flat list has nowhere else to put it.
   */
  width?: number;

  /**
   * The cell's own count, when the producer has the contingency table.
   *
   * A mosaic is drawn *from* a two-way table, and the count is the number the
   * table was built on. It is optional because a producer working from
   * proportions alone genuinely does not have it, and inventing one by
   * multiplying out a rounded share would put a number in the announcement
   * that the data does not contain.
   */
  count?: number;
}

/**
 * Data point for smooth/regression plots with data and SVG coordinate pairs.
 */
export interface SmoothPoint {
  x: number;
  y: number;
  svg_x: number;
  svg_y: number;
}

/**
 * Where a step chart jumps between two consecutive samples.
 *
 * - `hv` — hold `y[i]` until `x[i+1]`, then jump (matplotlib `steps-post`).
 * - `vh` — jump at `x[i]`, then hold until `x[i+1]` (matplotlib `steps-pre`).
 * - `mid` — jump at the midpoint of the two x values (matplotlib `steps-mid`).
 *
 * `hv` is what `ggplot2::geom_step()` draws by default, but MAIDR substitutes
 * no default of its own: see {@link MaidrLayer.stepDirection}.
 */
export type StepDirection = 'hv' | 'vh' | 'mid';

/**
 * Data point for step charts — structurally a {@link LinePoint}.
 *
 * The ordinal `label` that lets a hypnogram announce "REM" instead of "3"
 * started here, but it is not a step-only pairing: a line or path over the
 * same ordinal y needs it just as much, so it now lives on `LinePoint` and
 * every trace in the line family reads it.
 *
 * The name is kept because a step layer's `data` is authored as
 * `StepPoint[][]`, and it says which chart the points belong to.
 *
 * @example
 * { x: 1.5, y: 3, label: 'REM' }
 */
export type StepPoint = LinePoint;

/**
 * One point of a Kaplan-Meier survival curve.
 *
 * The curve itself is a step function -- survival holds until an event drops
 * it -- so this is a {@link StepPoint} with the two things a survival figure
 * carries that a step chart does not.
 */
export interface SurvivalPoint extends StepPoint {
  /**
   * A subject left the study at this time without the event happening.
   *
   * Censoring marks are drawn as ticks on the curve rather than as steps,
   * because censoring does not change the estimate -- it changes how much of
   * the curve is still supported by data. A reader who cannot tell a censored
   * time from an ordinary one cannot tell a flat tail backed by two hundred
   * subjects from one backed by three.
   */
  censored?: boolean;

  /** Lower bound of the confidence band at this time, when the chart draws one. */
  yMin?: number;

  /** Upper bound of the confidence band at this time, when the chart draws one. */
  yMax?: number;
}

/**
 * Canonical axis configuration. Every axis (x, y, z) must be specified as an
 * object of this shape. The `label` is optional and falls back to built-in
 * defaults ('X', 'Y', 'Level') when omitted.
 *
 * Grid navigation properties (`min`, `max`, `tickStep`) are currently consumed
 * by scatter-plot traces only; they are silently ignored by other trace types.
 *
 * Formatting configuration lives inline as `format` on each axis, allowing
 * different formatters per axis without a separate top-level block.
 *
 * @example
 * // Simple label
 * axes: { x: { label: "Date" }, y: { label: "Price" } }
 *
 * @example
 * // With grid navigation (scatter)
 * axes: {
 *   x: { label: "Sepal Length", min: 4.3, max: 7.9, tickStep: 0.7 },
 *   y: { label: "Sepal Width",  min: 2,   max: 4.4, tickStep: 0.5 }
 * }
 *
 * @example
 * // With formatting
 * axes: {
 *   x: { label: "Date" },
 *   y: { label: "Price", format: { type: "currency", decimals: 2 } }
 * }
 */
export interface AxisConfig {
  /** Axis label displayed in text descriptions. Defaults applied when absent. */
  label?: string;
  /** Minimum value for grid navigation (scatter only). */
  min?: number;
  /** Maximum value for grid navigation (scatter only). */
  max?: number;
  /** Step size for grid navigation (scatter only). */
  tickStep?: number;
  /** Optional per-axis value formatting applied in text descriptions. */
  format?: AxisFormat;
}

/**
 * Chart orientation for bar and box plots.
 */
export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

/**
 * DOM selectors for candlestick chart visual elements.
 */
export interface CandlestickSelector {
  body: string | string[];
  wickHigh?: string | string[];
  wickLow?: string | string[];
  wick?: string | string[]; // single combined wick (high-to-low) line
  open?: string | string[];
  close?: string | string[];
}

/**
 * Layer/trace definition containing plot type, data, and rendering configuration.
 */
export interface MaidrLayer {
  id: string;
  type: TraceType;
  title?: string;
  /**
   * What this layer is, when a subplot's layers are the same kind of thing.
   *
   * Announced on a layer switch in place of the trace type. Without it, two
   * layers of one type are indistinguishable — a hue-split error bar chart
   * announces "Layer 1 of 2: error_bar plot" and then "Layer 2 of 2:
   * error_bar plot", so a reader hears two different sets of numbers and is
   * never told that the first is Male and the second Female, which is the
   * whole content of the split and what a legend gives a sighted reader for
   * free.
   *
   * Distinct from `title`, which names the *chart* rather than the layer:
   * producers put the figure's title there for every layer of a figure, so it
   * cannot say which layer this is.
   *
   * @example
   * name: 'Male'
   */
  name?: string;
  selectors?: string | string[] | string[][] | BoxSelector[] | CandlestickSelector;
  orientation?: Orientation;
  /**
   * Optional DOM mapping hints. When provided, individual traces can opt-in
   * to use these hints to map DOM elements to the internal row-major data grid
   * without changing default behavior when omitted.
   */
  domMapping?: {
    /**
     * Specify DOM flattening order for grid-like traces.
     * 'row' => row-major, 'column' => column-major.
     */
    order?: 'row' | 'column';
    /**
     * For segmented/dodged bars, control the per-column group/level iteration.
     * 'forward' => iterate groups top-to-bottom (as previously domOrder='forward').
     * 'reverse' => iterate bottom-to-top (default).
     */
    groupDirection?: 'forward' | 'reverse';
    /**
     * For boxplots, control the Q1/Q3 edge mapping for IQR box.
     * 'forward' => Q1=bottom, Q3=top (default for vertical)
     * 'reverse' => Q1=top, Q3=bottom (for Base R vertical boxplots)
     */
    iqrDirection?: 'forward' | 'reverse';
  };
  /**
   * Axis configuration. Every axis (x, y, z) is specified as an {@link AxisConfig}
   * object with an optional `label`, optional grid navigation properties
   * (`min`, `max`, `tickStep`), and optional per-axis `format`.
   *
   * @example
   * // Basic labels
   * axes: { x: { label: "Date" }, y: { label: "Price" } }
   *
   * @example
   * // With per-axis formatting
   * axes: {
   *   x: { label: "Date" },
   *   y: { label: "Price", format: { type: "currency", decimals: 2 } }
   * }
   *
   * @example
   * // With grid navigation (scatter)
   * axes: {
   *   x: { label: "Sepal Length", min: 4.3, max: 7.9, tickStep: 0.7 },
   *   y: { label: "Sepal Width",  min: 2,   max: 4.4, tickStep: 0.5 }
   * }
   */
  axes?: {
    x?: AxisConfig;
    y?: AxisConfig;
    z?: AxisConfig;
  };
  /** Display configuration for a forest plot layer. */
  forestOptions?: ForestOptions;
  /** Threshold configuration for a volcano or Manhattan plot layer. */
  thresholdOptions?: ThresholdOptions;
  /**
   * Optional display configuration for violin plot layers (VIOLIN_KDE and VIOLIN_BOX).
   * Controls which summary statistics are shown in the violin box overlay.
   */
  violinOptions?: ViolinOptions;
  /**
   * Where a {@link TraceType.STEP} layer jumps between samples. Ignored by
   * every other trace type. Omit it when the producing library does not report
   * one: MAIDR does not substitute a default, so the description stays silent
   * about the convention rather than naming one the data never authored.
   *
   * @example
   * stepDirection: 'hv'
   */
  stepDirection?: StepDirection;
  data:
    | BarPoint[]
    | BoxPoint[]
    | BoxenPoint[]
    | CandlestickPoint[]
    | DumbbellData
    | ErrorBarPoint[]
    | ForestPoint[]
    | GanttData
    | GaugePoint
    | HeatmapData
    | HexbinPoint[][]
    | HistogramPoint[]
    | LinePoint[][]
    | PiePoint[]
    | ScatterPoint[]
    | MosaicPoint[][]
    | VolcanoPoint[]
    | SegmentedPoint[][]
    | SmoothPoint[][]
    | ContourPoint[][]
    | StepPoint[][]
    | SurvivalPoint[][]
    | ViolinKdePoint[][]
    | WaterfallPoint[]
    | WordCloudPoint[];
}

/**
 * Enumeration of supported plot trace types.
 * Use these values for the `type` field in {@link MaidrLayer}.
 *
 * @example
 * ```typescript
 * import { TraceType } from 'maidr/react';
 * const layer = { id: '0', type: TraceType.BAR, ... };
 * // Or use the string value directly:
 * const layer2 = { id: '0', type: 'bar', ... };
 * ```
 */
export enum TraceType {
  /**
   * A filled band between a series and a baseline. Navigates exactly as
   * {@link TraceType.LINE} does — the fill is what the mark looks like, not
   * an extra magnitude — so several `AREA` series are read independently of
   * one another. Use {@link TraceType.STACKED_AREA} when the bands sit on
   * top of each other instead.
   */
  AREA = 'area',
  BAR = 'bar',
  /**
   * Rank over time, one line per competitor -- a bump chart. Navigated as a
   * multi-line layer, with the one difference that decides whether it reads
   * correctly: the y axis is a *rank*, so rank 1 is the best position and the
   * smallest number, and the pitch is inverted to match. Each point announces
   * the places gained or lost alongside the rank, since the overtake is what
   * the chart is drawn for.
   *
   * A slope graph of *values* is a {@link TraceType.LINE} layer with two
   * samples, not this.
   */
  BUMP = 'bump',
  BOX = 'box',
  /**
   * A letter-value plot: the box plot's five-number summary generalised to a
   * variable-depth ladder of quantiles, so a large sample's tails stay
   * legible. Navigated as a box plot is -- one distribution per row, its
   * summary values walked along the other axis -- with the ladder read
   * outward from the median in value order, and each rung announced as the
   * percentile it actually is.
   */
  BOXEN = 'boxen',
  CANDLESTICK = 'candlestick',
  /**
   * Virtual layer comparing candlestick OHLC fields against a reference
   * line (e.g. a moving average). Never declared in MAIDR JSON — created at
   * runtime by the candlestick delta feature (Alt+L to toggle, Ctrl+Shift+L
   * to pick the reference line).
   */
  CANDLESTICK_DELTA = 'candlestick_delta',
  /**
   * Two series drawn back to back across a shared category axis, one growing
   * left and one growing right -- a population pyramid, or a Likert scale
   * split around a neutral midpoint. Navigated as a
   * {@link TraceType.STACKED} layer is, with the one difference that decides
   * whether it reads correctly: the values arrive **signed**, and the sign is
   * a direction rather than a magnitude, so the pitch takes the size and the
   * announcement names the side.
   */
  /**
   * A scalar field drawn as curves of constant value. Read as a
   * {@link TraceType.LINE} layer the level is just a series name, so the two
   * questions the chart is drawn for -- what value this curve is, and how
   * steeply the field changes here -- both go unanswered.
   */
  CONTOUR = 'contour',
  DIVERGING = 'diverging_bar',
  DODGED = 'dodged_bar',
  /**
   * A category and a value drawn as a point rather than a bar -- a Cleveland
   * dot plot. Read exactly as a {@link TraceType.BAR} is; the two differ in
   * the mark, not in what a reader navigates, which is why this carries no
   * model of its own. It exists so the chart announces itself as the chart
   * the author drew.
   */
  DOT = 'dot',
  /**
   * Two values per category joined by a segment -- before and after, two
   * groups, two years. The gap is the message, so the trace announces the
   * change alongside each end rather than leaving the reader to subtract two
   * numbers they heard one at a time.
   */
  DUMBBELL = 'dumbbell',
  /**
   * An estimate with the interval drawn around it — an error bar, a
   * confidence interval, a point range. Navigated as a grid of
   * `[lower, value, upper]` against the samples, so the reader can move
   * between the three magnitudes at one x as readily as between samples.
   */
  ERROR_BAR = 'error_bar',
  /**
   * A single measure read against a range -- a gauge, or a bullet chart with
   * its target and qualitative bands. One navigable point whose meaning is
   * entirely relational: 73 says nothing without the 100 it is out of, the 80
   * it was aiming at, and the band it lands in.
   */
  /**
   * Intervals along a shared axis, one lane per row -- a gantt chart, a
   * timeline, a swimlane diagram. Each point carries a start and an end
   * rather than a magnitude, so what the reader is told is a span and its
   * length, and where it sits is carried in the panning: a lane's intervals
   * sweep left to right with the axis, so later is audibly later.
   */
  /**
   * One effect estimate with its interval per study, against a shared null
   * line, with a pooled summary at the foot -- the standard figure of a
   * meta-analysis. Read as an {@link TraceType.ERROR_BAR} layer it loses the
   * three things it is drawn for: whether an interval crosses the null, how
   * much each study weighs, and which row is the pooled result rather than
   * evidence.
   */
  FOREST = 'forest',
  GANTT = 'gantt',
  /**
   * A population shrinking across ordered stages. Navigated as a
   * {@link TraceType.BAR} layer is, with the one difference that decides
   * whether the chart is readable: the number a reader wants is the
   * **retention** between adjacent stages, not the count, so that is what the
   * pitch carries. The counts are announced alongside it.
   */
  FUNNEL = 'funnel',
  GAUGE = 'gauge',
  HEATMAP = 'heat',
  /**
   * Hexagonal binning: the standard answer to an overplotted scatter. Read as
   * a lattice of cells each carrying a count, which is a {@link
   * TraceType.HEATMAP} -- with the one difference that decides its
   * navigation: a hex lattice staggers alternate rows, so a column index does
   * not identify a position. A vertical move keeps the bin whose centre is
   * nearest in x, and the announcement gives the centre rather than the
   * indices.
   */
  HEXBIN = 'hexbin',
  HISTOGRAM = 'hist',
  LINE = 'line',
  /**
   * A dot plot with a stem to the baseline. Read exactly as
   * {@link TraceType.DOT} and {@link TraceType.BAR} are -- the stem is what
   * the mark looks like, not a second magnitude.
   */
  LOLLIPOP = 'lollipop',
  /**
   * A stacked bar chart whose bar **widths** also encode data -- a two-way
   * contingency table drawn as tiles. Read as a {@link TraceType.STACKED}
   * layer it loses the width entirely, which is half the table: the
   * conditional proportions arrive without the group sizes they were
   * computed from.
   */
  /**
   * Genomic position against significance -- the standard figure of a GWAS.
   * Read as a {@link TraceType.SCATTER} it offers point-by-point navigation
   * over tens of thousands of points, which is not a viable path to the few
   * dozen that matter.
   */
  MANHATTAN = 'manhattan',
  MOSAIC = 'mosaic',
  NORMALIZED = 'stacked_normalized_bar',
  /** {@link TraceType.STACKED_AREA} whose bands are shares of a common total. */
  NORMALIZED_AREA = 'stacked_normalized_area',
  /**
   * One polyline per observation across several axes, one axis per variable.
   * Navigated as a multi-line layer -- an observation per row, an axis per
   * column -- with the one difference that decides the chart: every column is
   * a different quantity, so a value is pitched against its OWN axis rather
   * than against one range for the layer.
   */
  PARALLEL = 'parallel_coordinates',
  PIE = 'pie',
  /**
   * Categories arranged around a circle rather than along an axis, drawn as
   * wedges whose radius is the value -- a polar area, coxcomb or rose chart.
   * Read exactly as {@link TraceType.RADAR} is; the two differ in the mark,
   * not in what a reader navigates.
   */
  POLAR_AREA = 'polar_area',
  /**
   * Categories arranged around a circle rather than along an axis, joined
   * into a closed outline -- a radar or spider chart. Navigated as a
   * multi-line layer, with each spoke a column and each series a row; what
   * the circle adds is that a spoke's stereo position follows its angle
   * rather than its index, so a sweep goes out and comes back.
   */
  RADAR = 'radar',
  /**
   * One density curve per group along a shared value axis, the curves offset
   * down the page so their shapes can be compared. The offset is presentation
   * -- it exists so the curves do not overlap illegibly -- so a layer carries
   * each group's curve on its own terms and never the baseline it was drawn
   * from. Reading it as a {@link TraceType.VIOLIN_KDE} pitches every group
   * against a reference curve, which answers a different question than the
   * one a ridgeline is drawn to ask.
   */
  RIDGELINE = 'ridgeline',
  SCATTER = 'point',
  SMOOTH = 'smooth',
  STACKED = 'stacked_bar',
  /**
   * Area bands stacked on one another, so a band's *height* is its own
   * series' value while the band's *top edge* is the running total. Reading
   * such a layer as a {@link TraceType.LINE} announces one number where the
   * chart draws two, with nothing to say which one was heard — which is why
   * this is a type of its own rather than a line with a fill.
   */
  STACKED_AREA = 'stacked_area',
  STEP = 'step',
  /**
   * A Kaplan-Meier survival curve: the probability of surviving past each
   * time, dropping in steps as events occur. Read as a {@link TraceType.STEP}
   * layer it loses the two facts the figure is drawn for -- the median
   * survival, which is the number most readers came for, and which times are
   * censored rather than events.
   */
  SURVIVAL = 'survival',
  VIOLIN_BOX = 'violin_box',
  VIOLIN_KDE = 'violin_kde',
  /**
   * Effect size against significance -- the standard figure of a differential
   * expression analysis. Read as a {@link TraceType.SCATTER} it announces the
   * two coordinates and withholds the point's identity, which is the payload.
   */
  VOLCANO = 'volcano',
  /**
   * A sequence of signed contributions carrying a starting value to an ending
   * one — the staple of financial and product reporting. Each step draws a
   * floating bar from its running total before to its running total after, so
   * the point carries both the contribution and the total it produced.
   */
  WATERFALL = 'waterfall',
  /**
   * Terms sized by weight. The layout carries no information -- it is chosen
   * to pack glyphs, not to encode anything -- so the trace reads it as what
   * it measures: a term and a magnitude, walked in weight order.
   */
  WORD_CLOUD = 'word_cloud',
}
