/**
 * Minimal type declarations for the Vega / Vega-Lite API surface used by
 * the MAIDR Vega-Lite adapter.
 *
 * Vega and Vega-Lite are **peer dependencies** of MAIDR. The adapter only
 * references their public API through these lightweight aliases so that the
 * MAIDR bundle does not ship the libraries.
 *
 * @see https://vega.github.io/vega-lite/
 */

/**
 * Minimal subset of a Vega `View` that the adapter needs at runtime.
 *
 * The compiled view exposes processed datasets (post-transform / aggregate)
 * via {@link VegaView.data}, which is the most accurate source for chart
 * data extraction.
 *
 * {@link VegaView.runAsync} is used by the adapter to wait for the first
 * render frame to complete, which guarantees the SVG element exists in the
 * container before MAIDR tries to mount on it.
 */
export interface VegaView {
  data: (name: string) => Record<string, unknown>[];
  container: () => HTMLElement | null;
  runAsync: () => Promise<VegaView>;
  /**
   * Look up a Vega scale by name (e.g. `'x'`, `'y'`, `'color'`).
   *
   * Returns `undefined` if the scale doesn't exist. The scale's
   * `domain()` provides the **rendered** domain in the order Vega uses
   * to lay out marks — used by the adapter to align data ordering with
   * the SVG DOM order so MAIDR's index-based highlighting matches the
   * visible chart.
   */
  scale: (name: string) => { domain: () => unknown[] } | undefined;
}

/**
 * Minimal Vega-Lite top-level specification shape.
 *
 * Covers single-view, layered (`layer`), and composite (`hconcat` / `vconcat`
 * / `concat`) specs. Faceted (`facet`) and repeated (`repeat`) specs are
 * recognised but not yet supported by the adapter.
 */
export interface VegaLiteSpec {
  $schema?: string;
  title?: string | { text?: string; subtitle?: string };
  description?: string;
  data?: unknown;
  mark?: string | { type: string };
  encoding?: VegaLiteEncoding;
  layer?: VegaLiteSpec[];
  hconcat?: VegaLiteSpec[];
  vconcat?: VegaLiteSpec[];
  concat?: VegaLiteSpec[];
  facet?: unknown;
  spec?: VegaLiteSpec;
  repeat?: unknown;
}

/**
 * The encoding channels that the adapter inspects when mapping a
 * Vega-Lite spec to a MAIDR trace.
 */
export interface VegaLiteEncoding {
  x?: VegaLiteChannelDef;
  y?: VegaLiteChannelDef;
  /**
   * Modern Vega-Lite dodge channel — when paired with a categorical
   * `field`, Vega-Lite places bars of each subcategory **side-by-side**
   * within the same x slot. The adapter inspects this to classify a
   * `bar` mark as DODGED rather than STACKED.
   */
  xOffset?: VegaLiteChannelDef;
  /** Vertical counterpart of `xOffset`. */
  yOffset?: VegaLiteChannelDef;
  color?: VegaLiteChannelDef;
  fill?: VegaLiteChannelDef;
  row?: VegaLiteChannelDef;
  column?: VegaLiteChannelDef;
}

/**
 * Subset of a Vega-Lite channel definition fields read by the adapter.
 */
export interface VegaLiteChannelDef {
  field?: string;
  type?: string;
  aggregate?: string;
  title?: string;
  axis?: { title?: string } | null;
  bin?: boolean | Record<string, unknown>;
  stack?: boolean | string | null;
}

/**
 * Options accepted by the {@link vegaLiteToMaidr} converter.
 */
export interface VegaLiteToMaidrOptions {
  /** Override the chart id (defaults to `"vl-chart"`). */
  id?: string;
  /** Override the chart title (extracted from the spec by default). */
  title?: string;
  /**
   * Override how MAIDR maps the rendered SVG of a segmented (stacked /
   * normalised / dodged) bar trace back onto the 2-D `data[seriesIndex][barIndex]`
   * grid. Supplied as a hint to {@link MaidrLayer.domMapping}.
   *
   * - `'series-major'` — DOM emits **all bars of one colour** before
   *   moving to the next colour. This is Vega-Lite's default for
   *   stacked / normalised bars.
   * - `'subject-major'` — DOM emits **all colours of one x-subject**
   *   before moving to the next subject. This is Vega-Lite's default
   *   for dodged bars.
   *
   * Leave undefined to use the type-based defaults
   * (stacked/normalised → series-major, dodged → subject-major).
   * Only set this if your Vega-Lite spec uses a non-default mark order
   * or transform that changes the DOM emission sequence.
   */
  domOrder?: 'series-major' | 'subject-major';
}
