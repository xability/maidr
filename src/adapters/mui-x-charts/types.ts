import type { ReactNode } from 'react';

/**
 * The MUI X Charts components this adapter can read.
 *
 * Each is one of the single-component charts `@mui/x-charts` exports --
 * `<BarChart>`, `<LineChart>`, `<ScatterChart>` and `<PieChart>` -- and the
 * kind decides which props are read and which marks the selectors name.
 */
export type MuiChartKind = 'bar' | 'line' | 'scatter' | 'pie';

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
   * The MUI X chart to make accessible: one `<BarChart>`, `<LineChart>`,
   * `<ScatterChart>` or `<PieChart>` element, optionally wrapped in plain
   * elements such as a `<Box>`. Its `series`, `xAxis`, `yAxis`, `dataset` and
   * `layout` props are what the adapter reads.
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
  /** Bar: the orientation MUI stamps on a series from the chart's `layout`. */
  layout?: 'vertical' | 'horizontal';
}

/**
 * The props of an MUI X chart element that the adapter reads.
 */
export interface MuiChartProps {
  series?: readonly MuiSeriesConfig[];
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
}
