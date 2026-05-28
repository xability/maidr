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
 * A 2D point in pixels, as used by amCharts' `Sprite.toGlobal()`.
 */
export interface AmPoint {
  x: number;
  y: number;
}

/**
 * Global bounding box in CSS pixels (relative to the root container), as
 * returned by amCharts' `Sprite.globalBounds()` / `Container.globalBounds()`.
 */
export interface AmBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Minimal interface for an amCharts 5 event dispatcher (`root.events`,
 * `series.events`). Returns a disposer-like value we treat opaquely.
 */
export interface AmEvents {
  on: (type: string, callback: () => void) => { dispose?: () => void } | unknown;
}

/**
 * Minimal interface for `am5.Root`.
 */
export interface AmRoot {
  dom: HTMLElement;
  container: AmContainer;
  /** Render/lifecycle events (e.g. `frameended`); present at runtime. */
  events?: AmEvents;
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
  /** The masked plot area container; its bounds clip the visible columns. */
  plotContainer?: { globalBounds?: () => AmBounds };
}

/**
 * Minimal interface for an amCharts 5 XY series
 * (ColumnSeries, LineSeries, etc.).
 */
export interface AmXYSeries extends AmEntity {
  dataItems: AmDataItem[];
  columns?: AmListLike<AmSprite>;
  bullets?: AmListLike<AmBullet>;
  strokes?: AmListLike<AmSprite>;
  /** Converts a series-local point to root-container coordinates. */
  toGlobal?: (point: AmPoint) => AmPoint;
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
 * Minimal interface for an amCharts 5 bullet (used for line point markers).
 */
export interface AmBullet {
  get: (key: string) => unknown;
  sprite?: AmSprite;
}

/**
 * Minimal interface for an amCharts 5 visual sprite / graphic.
 *
 * In amCharts 5, geometry accessors (`x()`, `y()`, `width()`, `height()`)
 * are methods returning pixels in the sprite's local coordinate space, and
 * `toGlobal()` maps a local point to root-container coordinates. They are
 * optional here because not every sprite exposes laid-out geometry.
 */
export interface AmSprite {
  dom?: SVGElement;
  uid?: number;
  x?: () => number;
  y?: () => number;
  width?: () => number;
  height?: () => number;
  toGlobal?: (point: AmPoint) => AmPoint;
  /** Global bounding box in CSS px; the reliable way to get a sprite's rect. */
  globalBounds?: () => AmBounds;
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
