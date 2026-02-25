/**
 * Duck-typed interfaces for amCharts 5 objects.
 *
 * These interfaces define the minimal surface area of the amCharts 5 API
 * that the MAIDR binder needs. They use duck typing so consumers do not
 * need to import amCharts types directly — any object that structurally
 * matches will work.
 *
 * @remarks
 * Targets amCharts 5. amCharts 4 has a significantly different API and
 * is not supported by this binder.
 */

/**
 * Minimal interface for `am5.Root`.
 */
export interface AmRoot {
  dom: HTMLElement;
  container: AmContainer;
}

/**
 * Minimal interface for an amCharts 5 container (e.g. `root.container`).
 */
export interface AmContainer {
  children: AmListLike<AmEntity>;
}

/**
 * Minimal interface for amCharts 5 list-like collections
 * (e.g. `chart.series`, `chart.xAxes`).
 */
export interface AmListLike<T> {
  values: T[];
}

/**
 * Any amCharts 5 entity that supports `.get()` property access.
 */
export interface AmEntity {
  get: (key: string) => unknown;
  className?: string;
  uid?: number;
}

/**
 * Minimal interface for an amCharts 5 XY chart.
 */
export interface AmXYChart extends AmEntity {
  series: AmListLike<AmXYSeries>;
  xAxes: AmListLike<AmAxis>;
  yAxes: AmListLike<AmAxis>;
}

/**
 * Minimal interface for an amCharts 5 XY series
 * (ColumnSeries, LineSeries, CandlestickSeries, etc.).
 */
export interface AmXYSeries extends AmEntity {
  dataItems: AmDataItem[];
  columns?: AmListLike<AmSprite>;
  bullets?: AmListLike<AmBullet>;
  strokes?: AmListLike<AmSprite>;
}

/**
 * Minimal interface for an amCharts 5 axis.
 */
export interface AmAxis extends AmEntity {
  dataItems: AmDataItem[];
}

/**
 * Minimal interface for an amCharts 5 data item.
 */
export interface AmDataItem {
  get: (key: string) => unknown;
  uid?: number;
  bullets?: AmBullet[];
}

/**
 * Minimal interface for an amCharts 5 bullet (used for scatter points).
 */
export interface AmBullet {
  get: (key: string) => unknown;
  sprite?: AmSprite;
}

/**
 * Minimal interface for an amCharts 5 visual sprite / graphic.
 */
export interface AmSprite {
  dom?: SVGElement;
  uid?: number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for the amCharts-to-MAIDR adapter.
 */
export interface AmChartsBinderOptions {
  /**
   * Override the chart title. By default the binder reads the chart's
   * first title child if one exists.
   */
  title?: string;

  /**
   * Override the chart subtitle.
   */
  subtitle?: string;

  /**
   * Override individual axis labels.
   * Keys are `"x"` or `"y"`.
   */
  axisLabels?: { x?: string; y?: string };
}
