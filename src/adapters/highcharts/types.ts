/**
 * Minimal type definitions for Highcharts objects used by the MAIDR adapter.
 *
 * These types represent the subset of the Highcharts API needed for data
 * extraction and visual synchronization. Users provide the actual Highcharts
 * library; MAIDR does not depend on it directly.
 */

/**
 * Options for customizing the {@link highchartsToMaidr} adapter output.
 */
export interface HighchartsAdapterOptions {
  /** Override the generated chart ID. Defaults to `highcharts-{n}`. */
  id?: string;
  /** Override the chart title. Defaults to `chart.title.textStr`. */
  title?: string;
  /** Convert only specific series by index. Default: all visible series. */
  seriesIndices?: number[];
  /**
   * What a dumbbell chart's two ends are called — "1990" and "2020",
   * "before" and "after".
   *
   * Supplied here because Highcharts names them nowhere: a dumbbell series
   * declares a `low` and a `high` and nothing that says what either one is,
   * so the names a legend gives a sighted reader have no field to be read
   * from. Omitted, MAIDR announces them as "start" and "end", which says
   * which dot the cursor is on but not which year it is.
   */
  dumbbellLabels?: {
    /** What the `low` end is called. */
    start?: string;
    /** What the `high` end is called. */
    end?: string;
  };
  /**
   * Whether the chart's line series carry **ranks** rather than values — a
   * bump chart.
   *
   * Highcharts has no bump series: the chart is ordinary `line` series over a
   * reversed axis, so the adapter otherwise decides from the data, and only
   * for a table that is a rank permutation at every period on a reversed axis
   * (see `readsAsBump`). Set it to force that reading on a chart the
   * heuristic declines, or to `false` to suppress it on one it accepts.
   */
  bump?: boolean;
  /**
   * Reads the chart's `scatter` series as a volcano or Manhattan plot.
   *
   * Declared here because Highcharts ships neither series: both are drawn as
   * an ordinary scatter with a plot line across it, and nothing in the chart
   * object distinguishes one from a scatter of two variables. Without this
   * the points are read as a scatter — accurate, but a per-point walk of
   * tens of thousands of points rather than the threshold reading the chart
   * was drawn for.
   */
  significancePlot?: {
    /**
     * Which of the two it is: `volcano` puts effect size against
     * significance, `manhattan` genomic position against it.
     */
    type: 'volcano' | 'manhattan';
    /**
     * Which series to read this way, by Highcharts series index. Defaults to
     * every scatter series, which is what a Manhattan needs — one series per
     * chromosome, all of them one cloud.
     */
    seriesIndices?: number[];
    /**
     * The significance cutoff on the y axis. Defaults to the first numeric
     * `yAxis.plotLines` value, which is the line the chart already draws.
     */
    significance?: number;
    /**
     * Which side of the cutoff is the significant one. MAIDR reads `above`
     * when nothing is declared, which suits the transformed axes these charts
     * usually carry; a **raw p axis runs the other way** and must say so.
     */
    significanceDirection?: 'above' | 'below';
    /**
     * The effect-size cutoff, applied to the magnitude of x. Defaults to the
     * first non-zero numeric `xAxis.plotLines` value.
     */
    effect?: number;
  };
}

/**
 * Options for customizing the {@link highchartsGridToMaidr} adapter output.
 */
export interface HighchartsGridOptions {
  /** Override the generated figure ID. Defaults to `highcharts-grid-{n}`. */
  id?: string;
  /** Figure-level title announced for the whole grid. */
  title?: string;
  /** Figure-level subtitle. */
  subtitle?: string;
  /** Figure-level caption. */
  caption?: string;
  /**
   * Chunks a flat chart list into a grid. Ignored when a 2D chart array is
   * passed (2D input maps 1:1 to the subplot grid). When omitted, a flat
   * list becomes a single row.
   */
  layout?: {
    /** Number of grid rows (columns are derived when only rows is set). */
    rows?: number;
    /** Number of charts per row. Takes precedence over `rows`. */
    columns?: number;
  };
}

/**
 * Represents a Highcharts chart instance.
 * Passed to {@link highchartsToMaidr} to generate MAIDR-compatible data.
 */
export interface HighchartsChart {
  series: HighchartsSeries[];
  xAxis: HighchartsAxis[];
  yAxis: HighchartsAxis[];
  title: { textStr?: string };
  subtitle?: { textStr?: string };
  caption?: { textStr?: string };
  /** The `.highcharts-container` element created by Highcharts. */
  container: HTMLElement;
  /** The user-provided render target element. */
  renderTo: HTMLElement;
  options: {
    chart?: {
      type?: string;
      inverted?: boolean;
      /**
       * Draws the cartesian plane wrapped around a circle — a radar, a spider
       * chart, or a wind rose. The series keep calling themselves `line` and
       * `column`, so this flag is the only thing that says which chart was
       * drawn.
       */
      polar?: boolean;
      /**
       * Draws one axis per variable side by side, with one series per
       * observation. Like `polar`, the series are still `line` series, so the
       * flag is what distinguishes the chart.
       */
      parallelCoordinates?: boolean;
    };
    plotOptions?: {
      series?: { stacking?: string };
      column?: { stacking?: string };
      bar?: { stacking?: string };
      area?: { stacking?: string };
      areaspline?: { stacking?: string };
    };
  };
  tooltip?: {
    refresh: (point: HighchartsPoint | HighchartsPoint[]) => void;
    hide: () => void;
  };
}

/**
 * Represents a single data series within a Highcharts chart.
 */
export interface HighchartsSeries {
  type: string;
  name: string;
  data: HighchartsPoint[];
  xAxis: HighchartsAxis;
  yAxis: HighchartsAxis;
  index: number;
  visible: boolean;
  /**
   * The series this one is drawn against, resolved by Highcharts from
   * `options.linkedTo` before it renders. An error bar's estimate lives here:
   * the whip carries only the interval.
   */
  linkedParent?: HighchartsSeries;
  options: {
    type?: string;
    /** Identifier another series' `linkedTo` can name. */
    id?: string;
    /**
     * Binds this series to another one, either by its `id` or as `':previous'`.
     * Highcharts resolves it into {@link HighchartsSeries.linkedParent}.
     */
    linkedTo?: string;
    stacking?: string;
    /**
     * Where a line series' staircase rises, when it draws one. Highcharts
     * resolves `plotOptions` into here, so this is set however the chart
     * asked for it. Legacy `true` means `'left'`.
     */
    step?: 'left' | 'center' | 'right' | boolean;
    /**
     * The shape a tilemap draws its tiles with — `hexagon` (the default),
     * `diamond`, `circle` or `square`. The first three stagger alternate
     * columns; a square tilemap is an aligned grid.
     */
    tileShape?: string;
    /** Set by Highcharts on internal series (e.g. the Highstock navigator). */
    isInternal?: boolean;
    /** User- or Highcharts-assigned class name (e.g. `highcharts-navigator-series`). */
    className?: string;
  };
}

/**
 * Represents an individual data point within a Highcharts series.
 */
export interface HighchartsPoint {
  x: number;
  y: number | null;
  category?: string;
  name?: string;
  /**
   * The far end of an interval — a gantt task's finish, an xrange bar's right
   * edge. Highcharts aliases a gantt point's `end` onto it, so both series
   * read the same way.
   */
  x2?: number;
  /** Boxplot / candlestick high value, error bar upper bound, dumbbell high. */
  high?: number;
  /** Boxplot / candlestick low value, error bar lower bound, dumbbell low. */
  low?: number;
  /** Boxplot first quartile. */
  q1?: number;
  /** Boxplot third quartile. */
  q3?: number;
  /** Boxplot median. */
  median?: number;
  /** Candlestick open value. */
  open?: number;
  /** Candlestick close value. */
  close?: number;
  /** Percentage of total when stacking is 'percent'. */
  percentage?: number;
  /**
   * Magnitude for the series that declare `pointArrayMap: ['weight']` rather
   * than a `y` — a word cloud term's weight, and a sankey / dependency wheel /
   * arc diagram link's flow.
   */
  weight?: number;
  /** Sankey-family and network link source node id. */
  from?: string | number;
  /** Sankey-family and network link target node id. */
  to?: string | number;
  /** Treemap / sunburst node id, referenced by a child's `parent`. */
  id?: string;
  /** Treemap / sunburst id of this node's parent, empty at the top level. */
  parent?: string;
  /**
   * Treemap / sunburst magnitude, and a heatmap or tilemap cell's colour
   * value. Those series declare `value` in their `pointArrayMap`, so the
   * number is here rather than in `y` — on a tilemap `y` is the lattice row.
   */
  value?: number;
  /** The marker a bullet chart draws beside its bar. */
  target?: number;
  /** Waterfall step that restates the total of every step so far. */
  isSum?: boolean;
  /** Waterfall step that restates the total since the previous subtotal. */
  isIntermediateSum?: boolean;
  options?: Record<string, unknown>;
  /** Reference to the SVG element for this point (may be undefined if not rendered). */
  graphic?: { element: SVGElement };
  series: HighchartsSeries;
  index: number;
  setState?: (state: string) => void;
}

/**
 * Represents an axis in a Highcharts chart.
 */
export interface HighchartsAxis {
  categories?: string[];
  getExtremes: () => { min: number; max: number };
  isDatetimeAxis?: boolean;
  /**
   * Whether the axis runs the other way — the resolved value, which
   * Highcharts copies from `options.reversed` and also sets by itself on an
   * inverted chart's x axis.
   */
  reversed?: boolean;
  /** Rendered distance from the chart top in px (present after render). */
  top?: number;
  /** Rendered distance from the chart left in px (present after render). */
  left?: number;
  /** Rendered axis height in px (present after render). */
  height?: number;
  /** Rendered axis width in px (present after render). */
  width?: number;
  options: {
    title?: { text?: string };
    type?: string;
    /** Declares {@link HighchartsAxis.reversed}; read as its fallback. */
    reversed?: boolean;
    /**
     * Reference lines drawn across the plot — the significance cutoff of a
     * volcano or Manhattan plot, which is the only place either chart states
     * where its threshold is.
     */
    plotLines?: { value?: number }[];
    /**
     * Qualitative bands drawn behind the axis — the shaded zones of a gauge
     * or a bullet chart. Highcharts names one only in styled mode (via
     * `className`) or through a `label`, so both are read.
     */
    plotBands?: {
      from?: number;
      to?: number;
      label?: { text?: string };
      className?: string;
    }[];
  };
}
