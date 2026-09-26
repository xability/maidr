/**
 * Minimal uPlot type definitions for the MAIDR adapter.
 *
 * These describe only what the adapter reads off a live `uPlot` instance, so
 * `uplot` never has to be a compile-time dependency of MAIDR. A real instance
 * satisfies them structurally; the field names and meanings follow uPlot 1.6.
 */

/**
 * Columnar data in uPlot's aligned mode (`mode: 1`): `[xs, ys1, ys2, ...]`.
 * A `null` or `undefined` y is a gap in that series.
 */
export type UPlotAlignedData = ReadonlyArray<ArrayLike<number | null | undefined>>;

/**
 * Data in uPlot's faceted mode (`mode: 2`): index 0 is unused and every other
 * entry is one series' own `[xs, ys, ...]` columns.
 */
export type UPlotFacetedData = ReadonlyArray<ReadonlyArray<ArrayLike<number | null | undefined>> | null>;

/**
 * The path cache uPlot leaves on a series after drawing it.
 *
 * uPlot's `paths.bars` builder returns `flags: 0` and a fill path, while the
 * line, stepped and spline builders return `flags: 1` (clip the fill to the
 * band). A series whose `paths` returns nothing (points only) leaves `null`.
 */
export interface UPlotPathCache {
  flags?: number;
  fill?: unknown;
  stroke?: unknown;
}

/** One series, as uPlot holds it after `initSeries`. */
export interface UPlotSeries {
  label?: unknown;
  scale?: string;
  show?: boolean;
  /**
   * Formats a raw value the way uPlot's legend shows it. Always a function on
   * an initialised series; uPlot resolves a template string into one.
   */
  value?: unknown;
  points?: { show?: unknown };
  /** Set by uPlot on every draw of the series; see {@link UPlotPathCache}. */
  _paths?: UPlotPathCache | null;
  /** Faceted mode only: which scale each data column is drawn against. */
  facets?: ReadonlyArray<{ scale?: string }>;
  /**
   * Per-series override read by this adapter only; uPlot keeps unknown keys
   * on a series untouched.
   */
  maidr?: UPlotSeriesMaidrOptions | false;
}

/** One axis, as uPlot holds it. */
export interface UPlotAxis {
  scale?: string;
  label?: unknown;
  show?: boolean;
}

/** One scale, as uPlot holds it. */
export interface UPlotScale {
  time?: boolean;
  /** The current range, once uPlot has laid the scale out. */
  min?: number | null;
  max?: number | null;
  distr?: number;
  ori?: number;
  dir?: number;
}

/** The instance options this adapter reads. */
export interface UPlotOptions {
  title?: string;
  mode?: number;
  ms?: number;
  plugins?: ReadonlyArray<unknown>;
}

/**
 * The parts of a `uPlot` instance the adapter reads.
 */
export interface UPlotInstance {
  /** The `.uplot` wrapper uPlot mounts into its target. */
  readonly root: HTMLElement;
  /** The plotting-area overlay; positioned over the plot, in CSS pixels. */
  readonly over: HTMLElement;
  readonly data: UPlotAlignedData | UPlotFacetedData;
  readonly series: ReadonlyArray<UPlotSeries>;
  readonly axes: ReadonlyArray<UPlotAxis>;
  readonly scales: Readonly<Record<string, UPlotScale | undefined>>;
  readonly mode?: number;
  readonly width?: number;
  readonly height?: number;
  /** Plot area in *device* pixels, relative to the canvas. */
  readonly bbox?: { left: number; top: number; width: number; height: number };
  readonly ctx?: CanvasRenderingContext2D;
  readonly cursor?: { idx?: number | null; left?: number; top?: number };
  /** 1 once uPlot has drawn for the first time (`ready` has fired). */
  readonly status?: number;
  /**
   * Converts a data value to a CSS-pixel offset inside the plotting area
   * (`can = false`) or a device-pixel offset on the canvas (`can = true`).
   */
  valToPos: (val: number, scaleKey: string, can?: boolean) => number;
  setCursor?: (opts: { left: number; top: number }, fireHook?: boolean) => void;
}

/** What a series should be read as. */
export type UPlotSeriesKind = 'line' | 'bar' | 'scatter';

/**
 * Per-series options, set on the series itself as `maidr: { ... }` or passed
 * through {@link MaidrUPlotOptions.series}.
 */
export interface UPlotSeriesMaidrOptions {
  /**
   * What the series is read as. uPlot draws every kind through an opaque
   * `paths` function, so MAIDR infers the kind from the path uPlot last built
   * for it; set this when a custom path builder defeats that inference.
   */
  kind?: UPlotSeriesKind;
  /** Leave this series out of MAIDR entirely. */
  exclude?: boolean;
}

/**
 * Options accepted by `bindUPlot` and `maidrPlugin`.
 */
export interface MaidrUPlotOptions {
  /** Chart id used for DOM ids and `window.maidrLive`; generated when omitted. */
  id?: string;
  /** Chart title; defaults to uPlot's own `title` option. */
  title?: string;
  subtitle?: string;
  caption?: string;
  /** X axis label; defaults to the x axis' label, then the x series' label. */
  xLabel?: string;
  /** Y axis label; defaults to each y scale's axis label. */
  yLabel?: string;
  /**
   * Treat x values as timestamps in this many milliseconds per unit: `1000`
   * for seconds (uPlot's default) or `1` for milliseconds (`ms: 1` in the
   * uPlot options). Only consulted when the x scale is a time scale; inferred
   * from the size of the values when omitted.
   */
  msPerUnit?: number;
  /** Per-series overrides, keyed by the series index in `u.series`. */
  series?: Readonly<Record<number, UPlotSeriesMaidrOptions>>;
  /**
   * Keep MAIDR's reading in step with `u.setData(...)`. On by default: an
   * update replaces the data in place, and new points appended at the end are
   * streamed so monitor mode (`M`) announces them. Set `false` for a chart
   * whose data never changes.
   */
  live?: boolean;
  /** Outline color for the visual highlight drawn over the canvas. */
  highlightColor?: string;
  /** Skip binding entirely (for a plugin registered on many charts). */
  enabled?: boolean;
}

/**
 * A live binding between one uPlot instance and MAIDR.
 */
export interface MaidrUPlotHandle {
  /** The MAIDR chart id. */
  readonly id: string;
  /**
   * Re-reads the instance, as `u.setData` does automatically. Call it after
   * changing series or axes (`u.addSeries`, `u.setSeries`, ...).
   */
  refresh: () => void;
  /** Unmounts MAIDR and puts the chart back where it was. */
  dispose: () => void;
}

/**
 * The plugin object uPlot accepts in its `plugins` option.
 */
export interface UPlotPlugin {
  hooks: {
    ready?: (u: UPlotInstance) => void;
    setData?: (u: UPlotInstance) => void;
    setSize?: (u: UPlotInstance) => void;
    destroy?: (u: UPlotInstance) => void;
  };
}
