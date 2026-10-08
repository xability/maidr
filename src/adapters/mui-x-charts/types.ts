import type { PercentileBandOption } from '@adapters/shared/percentileBandOption';
import type { ReactNode } from 'react';

/**
 * The MUI X Charts components this adapter can read.
 *
 * Each is one of the single-component charts `@mui/x-charts` and
 * `@mui/x-charts-pro` export, and the kind decides which props are read and
 * which marks the selectors name:
 *
 * - `bar`, `line`, `scatter`, `pie` -- `<BarChart>`, `<LineChart>`,
 *   `<ScatterChart>`, `<PieChart>` (and their Pro variants)
 * - `sparkline` -- `<SparkLineChart>`, a bar or line chart configured by one
 *   `data` array
 * - `gauge` -- `<Gauge>` / `<GaugeContainer>`
 * - `radar` -- `<RadarChart>`
 * - `heatmap`, `funnel`, `sankey` -- the Pro `<Heatmap>`, `<FunnelChart>` and
 *   `<SankeyChart>`
 */
export type MuiChartKind
  = | 'bar'
    | 'line'
    | 'scatter'
    | 'pie'
    | 'sparkline'
    | 'gauge'
    | 'radar'
    | 'heatmap'
    | 'funnel'
    | 'sankey';

/**
 * Configuration accepted by both the {@link MaidrMuiCharts} wrapper component
 * and the `useMuiChartsAdapter` hook.
 */
export interface MuiChartsAdapterConfig {
  /** Unique identifier for the chart. Used for DOM element IDs. */
  id: string;
  /** Chart title displayed in text descriptions. */
  title?: string;
  /** Chart subtitle. */
  subtitle?: string;
  /** Chart caption. */
  caption?: string;
  /**
   * The MUI X chart to make accessible: one chart element of a kind listed
   * under {@link MuiChartKind}, optionally wrapped in plain elements such as a
   * `<Box>`. Its own props -- `series`, `xAxis`, `yAxis`, `dataset`,
   * `layout`, a sparkline's `data`, a gauge's `value` -- are what the adapter
   * reads.
   */
  children: ReactNode;
  /**
   * Which kind of chart `children` is.
   *
   * Only needed when the kind cannot be recognised on its own. The adapter
   * reads it from the component's name first and, failing that, from the
   * class names MUI stamps on the rendered SVG, so a minifier that renames
   * the component still leaves the second route open.
   */
  chartType?: MuiChartKind;
  /**
   * A `<LineChart>`'s fan charts, each read as one `percentile_band` layer.
   *
   * MUI X has no range series, but a stacked `area` series is filled between
   * its own top and the top of the series below it -- so a band is a hidden
   * base series holding its lower edge and an `area` series stacked on it
   * holding its width. Nothing says which quantiles those edges are, so they
   * are stated here: `median` names the median's series and each band's
   * `series` the `area` series on top of its stack, both by series `id` (or
   * `label`), with the band's two levels as fractions.
   *
   * @example
   * // series: [
   * //   { id: 'p90-base', data: p5, stack: 'p90', showMark: false },
   * //   { id: 'p90', data: p95.map((v, i) => v - p5[i]), stack: 'p90', area: true },
   * //   { id: 'median', data: p50 },
   * // ]
   * percentileBands: [{
   *   median: 'median',
   *   bands: [{ series: 'p90', lower: 0.05, upper: 0.95 }],
   * }]
   */
  percentileBands?: PercentileBandOption[];
}

/**
 * Props for the MaidrMuiCharts component (identical to
 * {@link MuiChartsAdapterConfig}).
 */
export type MaidrMuiChartsProps = MuiChartsAdapterConfig;

/**
 * The subset of an MUI X axis config the adapter reads.
 *
 * Kept structural rather than imported from `@mui/x-charts` so the adapter
 * needs no runtime or type dependency on the library: it reads the props the
 * consumer wrote, and those are plain objects.
 */
export interface MuiAxisConfig {
  id?: string;
  data?: readonly unknown[];
  dataKey?: string;
  label?: string;
  scaleType?: string;
  /** Draw the axis the other way round. */
  reverse?: boolean;
  /** Explicit domain bounds; marks entirely outside them are not drawn. */
  min?: number | Date;
  max?: number | Date;
  valueFormatter?: (value: never, context: never) => string;
}

/**
 * The subset of an MUI X series config the adapter reads, across the four
 * supported kinds.
 */
export interface MuiSeriesConfig {
  id?: string | number;
  type?: string;
  label?: string | ((location: 'tooltip' | 'legend') => string);
  data?: readonly unknown[];
  dataKey?: string;
  /**
   * Reads the series' value (bar, line) or `{ x, y }` point (scatter) off one
   * `dataset` row.
   */
  valueGetter?: (row: never) => unknown;
  /** Bar and line: series sharing a `stack` id are drawn on top of each other. */
  stack?: string;
  /** Bar and line: `'expand'` normalises each stack to a share of one. */
  stackOffset?: string;
  /** Line: fill the region under the line. */
  area?: boolean;
  /** Line: the d3 curve the line is drawn with; `step*` draws a staircase. */
  curve?: string;
  /** Scatter: which dataset columns hold x, y and the point id. */
  datasetKeys?: { x?: string; y?: string; id?: string };
  /** Pie: angles in degrees clockwise from 12 o'clock. */
  startAngle?: number;
  endAngle?: number;
  /** Pie: draw the slices sorted by value rather than in data order. */
  sortingValues?: 'none' | 'asc' | 'desc' | ((a: number, b: number) => number);
  /** Bar and funnel: the orientation of the series. */
  layout?: 'vertical' | 'horizontal';
}

/** One node of a sankey, when the chart names its nodes. */
export interface MuiSankeyNode {
  id: string | number;
  label?: string;
}

/** One link of a sankey. */
export interface MuiSankeyLink {
  source: string | number;
  target: string | number;
  value: number;
}

/** A `<SankeyChart>`'s single series: an object, not an array. */
export interface MuiSankeySeries {
  label?: string;
  data?: { nodes?: readonly MuiSankeyNode[]; links?: readonly MuiSankeyLink[] };
}

/** One radar spoke, when named with its own bounds. */
export interface MuiRadarMetric {
  name: string;
  min?: number;
  max?: number;
}

/**
 * The props of an MUI X chart element that the adapter reads.
 */
export interface MuiChartProps {
  /** An array for every chart but `<SankeyChart>`, whose one series is an object. */
  series?: readonly MuiSeriesConfig[] | MuiSankeySeries;
  xAxis?: readonly MuiAxisConfig[];
  yAxis?: readonly MuiAxisConfig[];
  dataset?: readonly Record<string, unknown>[];
  /** Bar: `'horizontal'` lays the bars along the y axis. */
  layout?: 'vertical' | 'horizontal';
  /** Bar and scatter: `'svg-batch'` / `'svg-progressive'` draw no per-mark element. */
  renderer?: string;
  /** Without it the chart sizes itself to its container. */
  width?: number;
  disableKeyboardNavigation?: boolean;
  /** Sparkline: its values, in place of a `series`. */
  data?: readonly unknown[];
  /** Sparkline: `'bar'` draws bars, anything else a line. */
  plotType?: 'line' | 'bar';
  /** Sparkline: fill under the line. */
  area?: boolean;
  /** Sparkline: the d3 curve of the line. */
  curve?: string;
  /** Gauge: the measure, and the range of its dial. */
  value?: number | null;
  valueMin?: number;
  valueMax?: number;
  /** Radar: the spokes. */
  radar?: { metrics?: readonly (string | MuiRadarMetric)[]; max?: number };
  /** Heatmap: the colour axis, whose scale decides which cells are drawn. */
  zAxis?: readonly { colorMap?: MuiColorMap }[];
  /** Funnel: the stage names, when the data items carry none. */
  categoryAxis?: { categories?: readonly unknown[] };
}

/**
 * The part of an MUI X colour map that decides whether a value gets a colour
 * -- and so, on a heatmap, whether its cell is drawn at all.
 */
export interface MuiColorMap {
  type?: 'continuous' | 'piecewise' | 'ordinal';
  /** Ordinal: the values that have a colour. */
  values?: readonly unknown[];
  /** Ordinal: one colour per value (or per index, without `values`). */
  colors?: readonly unknown[];
  /** The colour of a value the map does not cover; without it, none. */
  unknownColor?: string;
}
