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
 * Minimal interface for a chart the adapter can convert: an `XYChart` (or an
 * am5stock `StockPanel`, which extends it) or an am5percent chart -- a
 * `PieChart` or the `SlicedChart` a funnel lives in.
 *
 * Both expose their data through a series list. Only an XY chart is bound to
 * axes and owns a plot area, so `xAxes` / `yAxes` / `plotContainer` are
 * optional — a pie has none of the three, and every read of them is guarded.
 */
export interface AmChart extends AmEntity {
  series: AmListLike<AmXYSeries>;
  xAxes?: AmListLike<AmAxis>;
  yAxes?: AmListLike<AmAxis>;
  /** The masked plot area container; its bounds clip the visible columns. */
  plotContainer?: {
    toGlobal?: (point: AmPoint) => AmPoint;
    width?: () => number;
    height?: () => number;
    globalBounds?: () => AmBounds;
  };
}

/**
 * The name this chart interface has always carried in the adapter's public
 * API, kept as an alias so existing imports keep working now that a pie chart
 * satisfies the same surface.
 */
export type AmXYChart = AmChart;

/**
 * Minimal interface for an amCharts 5 series (ColumnSeries, LineSeries,
 * PieSeries, etc.).
 *
 * The per-kind collections are optional because no series type has them all:
 * `columns` belongs to a column series, `bullets` / `strokes` to a line one,
 * and a pie series has neither — its wedges are reached through each data
 * item's `slice` instead.
 */
export interface AmXYSeries extends AmEntity {
  dataItems: AmDataItem[];
  /**
   * The per-kind graphics lists, each an am5 `ListTemplate`: the drawn sprites
   * under `values`, and the template they were all made from under `template`.
   *
   * The template is where a chart's styling is declared, and styling is the
   * only signal amCharts leaves for the marks it has no series class for — a
   * hairline `columns.template` is a lollipop's stem, and a `strokes.template`
   * at zero opacity is what makes a line series a dot plot.
   */
  columns?: AmListLike<AmSprite> & { template?: AmSprite };
  bullets?: AmListLike<AmBullet>;
  strokes?: AmListLike<AmSprite> & { template?: AmSprite };
  /**
   * The fill graphics of a line series, as an am5 `ListTemplate`.
   *
   * amCharts has no area series class — an area chart is a `LineSeries` whose
   * fills have been made visible — so the template's settings are the only
   * thing that tells an area from a line.
   */
  fills?: { template?: AmSprite };
  /** Converts a series-local point to root-container coordinates. */
  toGlobal?: (point: AmPoint) => AmPoint;
  /**
   * The series' own laid-out box, which every am5 series has because a series
   * is a `Container`. Read only for a standalone series — an am5hierarchy
   * layout pushed straight into the root container — where the series IS the
   * panel and there is no `plotContainer` to measure instead.
   */
  width?: () => number;
  height?: () => number;
  globalBounds?: () => AmBounds;
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
  /**
   * The author's own record behind the mark — the object they put in
   * `series.data`, which amCharts keeps untouched on every data item it makes.
   *
   * `get()` answers with the *chart's* reading of a row (`valueY`, `categoryX`,
   * the fields a series was told to bind), so a column the chart was never
   * bound to — a censoring flag, a gene name, a study's weight — is reachable
   * nowhere else. It is the row a co-located declaration's field names are
   * resolved against, which is why it is typed `unknown` and narrowed once, in
   * `resolveFieldRef`.
   */
  dataContext?: unknown;
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
  /**
   * Global bounding box in CSS px.
   *
   * Reliable for a sprite drawn from primitives. A `Slice` is not one: it
   * paints through a draw callback, so nothing feeds the bounds accumulator
   * and it reports a degenerate box at its own centre. Read a wedge's extent
   * from its settings instead — see `wedgeBounds`.
   */
  globalBounds?: () => AmBounds;
  /** Settings accessor; a `Slice` carries radius / startAngle / arc here. */
  get?: (key: string) => unknown;
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

  /**
   * What a dumbbell chart's two ends are called — "1990" and "2020", "before"
   * and "after".
   *
   * Supplied here because there is nowhere to read them from: amCharts names
   * the series, not the two ends of its columns, so anything taken off the
   * chart would be a guess. Left out, MAIDR announces "start" and "end", which
   * says which dot the cursor is on but not what it stands for.
   */
  dumbbellLabels?: { start?: string; end?: string };

  /**
   * Whether the chart's line series carry ranks — a bump chart — rather than
   * magnitudes.
   *
   * amCharts has no bump series: a rank table is line series on a value axis
   * whose renderer is inversed, so first place sits at the top. That inversion
   * is also how a plain chart of descending magnitudes is drawn, which is why
   * the adapter corroborates it against the values themselves and why this
   * option exists at all.
   *
   * - `true` says the lines are ranks when amCharts was not told to invert the
   *   axis. The values still have to read as ranks, since the option applies to
   *   every panel of the figure and must not invert a plain line chart's pitch.
   * - `false` suppresses the reading entirely, for a chart of small integers
   *   that happens to look like a ranking.
   * - Left out, the adapter decides from the axis and the values together.
   */
  bump?: boolean;
}
