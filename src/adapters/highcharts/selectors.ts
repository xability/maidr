/**
 * CSS selector generation for Highcharts SVG elements.
 *
 * Highcharts renders charts as SVG inside a `.highcharts-container` div.
 * Each series gets a group element with predictable class names, and individual
 * data points are rendered as child elements (`rect`, `path`, etc.) with the
 * class `highcharts-point`.
 *
 * Important Highcharts gotcha: the legend item for each series also carries
 * the `highcharts-series-N` class AND contains a `<rect class="highcharts-point">`
 * as its color swatch. A naive selector like `.highcharts-series-0 .highcharts-point`
 * therefore matches the legend swatch in addition to the actual plotted bars,
 * which breaks MAIDR's strict one-element-per-data-point mapping.
 *
 * To avoid this, every selector below is scoped to `.highcharts-series-group`,
 * the `<g>` that wraps the plot-area series. The legend lives in a separate
 * `.highcharts-legend` group, so this scoping cleanly excludes it.
 *
 * Selectors are also scoped to the chart's render target id to support pages
 * with multiple Highcharts charts.
 */

import type { BoxSelector, CandlestickSelector } from '../../type/grammar';
import type { HighchartsChart } from './types';

let selectorCounter = 0;

/**
 * Resets the internal selector counter. Useful for deterministic output in tests.
 */
export function resetSelectorCounter(): void {
  selectorCounter = 0;
}

/**
 * Ensures the chart's render target has an `id` attribute so CSS selectors
 * can be scoped to this specific chart.
 *
 * **Side effect:** If the element does not already have an `id`, this function
 * mutates the DOM by assigning a generated `id` (`maidr-hc-{n}`). This is
 * necessary because MAIDR's highlight system uses `document.querySelectorAll`
 * with selectors that must be scoped to a specific chart container.
 *
 * @returns The element's `id` value (existing or newly assigned).
 */
export function ensureContainerId(chart: HighchartsChart): string {
  const target = chart.renderTo;
  if (!target.id) {
    target.id = `maidr-hc-${selectorCounter++}`;
  }
  return target.id;
}

/**
 * Generates a CSS selector for all point elements in a bar/column series.
 *
 * Highcharts renders bar/column points with the `highcharts-point` class. The
 * element tag varies: `<rect>` for square corners, `<path>` for rounded corners
 * (the default in Highcharts v11+). Matching by class only handles both cases.
 * The elements appear in data order.
 *
 * Scoped under `.highcharts-series-group` to exclude the legend swatch (see
 * file header for details).
 */
export function barSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates CSS selectors for line chart series.
 *
 * For line charts, MAIDR expects one selector per line (the `<path>` element),
 * not individual point selectors. MAIDR's `LineTrace` parses the path's `d`
 * attribute to extract point coordinates and creates circle highlight elements.
 */
export function lineSelectors(containerId: string, seriesIndices: number[]): string[] {
  return seriesIndices.map(
    i => `#${containerId} .highcharts-series-group .highcharts-series-${i} path.highcharts-graph`,
  );
}

/**
 * Generates a CSS selector for all point elements in a scatter series.
 *
 * Scatter points carry the `highcharts-point` class. The element tag may vary
 * by marker shape (`<path>` for most markers, `<rect>` for square markers, etc.),
 * so we match by class only to handle all cases.
 *
 * Important Highcharts gotcha: each scatter point is emitted as TWO sibling
 * elements with the same `highcharts-point` class — the visible marker and a
 * duplicate hit-detection tracker that is `visibility="hidden"`. A naive
 * `.highcharts-point` selector therefore returns 2N elements and breaks
 * MAIDR's one-element-per-data-point assumption. We filter out the trackers
 * via `:not([visibility="hidden"])` so only the visible markers are returned.
 *
 * Note on stability: this is the static (initial render) visibility state.
 * MAIDR's highlight system queries the selector ONCE during trace
 * construction and caches the resulting element references, so any later
 * visibility toggling by Highcharts (e.g. on hover) does not affect the
 * cached set.
 */
export function scatterSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point:not([visibility="hidden"])`;
}

/**
 * Generates a CSS selector for heatmap cell elements.
 *
 * Heatmap cells carry the `highcharts-point` class. They are typically rendered
 * as `<rect>`, but matching by class only is more robust to future Highcharts
 * changes (e.g., rounded-corner cells using `<path>`).
 */
export function heatmapSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates a CSS selector for histogram bar elements.
 *
 * Histogram bins carry the `highcharts-point` class. Like bar/column, the
 * element tag varies between `<rect>` (square corners) and `<path>` (rounded
 * corners, the default in Highcharts v11+). Matching by class only handles both.
 */
export function histogramSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates per-candle {@link CandlestickSelector} entries for a Highcharts
 * candlestick series.
 *
 * MAIDR's `CandlestickTrace` expects either a single legacy selector string or
 * a structured `CandlestickSelector` whose fields (`body`, `wickHigh`,
 * `wickLow`, ...) name the sub-elements per candle so they can be highlighted
 * individually.
 *
 * Highcharts renders each candlestick as a single `<path class="highcharts-point">`
 * whose `d` attribute contains three subpaths:
 * ```
 * M x_left y_open L x_left y_close L x_right y_close L x_right y_open Z   <-- body (rect-with-Z)
 * M x_mid  y_top  L x_mid  y_bodyTop                                       <-- upper wick
 * M x_mid  y_bodyBot L x_mid y_low                                         <-- lower wick
 * ```
 * (subpath order varies between Highcharts releases; ordering is not assumed).
 *
 * The adapter (see `stampCandlestickIndices` / `splitCandlestickPath` in
 * adapter.ts) is responsible for splitting that single `<path>` into three
 * separate `<path>` siblings stamped with:
 * - `data-maidr-candle-index="N"` (per-candle disambiguator)
 * - `data-maidr-candle-part="body" | "upper-wick" | "lower-wick"` (sub-element)
 *
 * The original `<path>` loses its `highcharts-point` class so future class-only
 * queries skip it. This mirrors the boxplot whisker split (see `splitWhiskerPath`).
 *
 * Trade-off: open/close are not provided as separate selectors. MAIDR's
 * `CandlestickTrace` derives open/close line segments from the body's edges
 * via `Svg.createLineElement` when omitted, which is sufficient for
 * highlighting the open/close marks.
 */
export function candlestickSelectors(
  containerId: string,
  seriesIndex: number,
  candleCount: number,
): CandlestickSelector {
  const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} path`;
  const body: string[] = [];
  const wickHigh: string[] = [];
  const wickLow: string[] = [];
  for (let i = 0; i < candleCount; i++) {
    const candleBase = `${base}[data-maidr-candle-index="${i}"]`;
    body.push(`${candleBase}[data-maidr-candle-part="body"]`);
    wickHigh.push(`${candleBase}[data-maidr-candle-part="upper-wick"]`);
    wickLow.push(`${candleBase}[data-maidr-candle-part="lower-wick"]`);
  }
  return { body, wickHigh, wickLow };
}

/**
 * Generates a 2D grid of per-cell CSS selectors for a Highcharts heatmap series.
 *
 * MAIDR's `HeatmapTrace` (when given a `string[][]`) treats `selectors[r][c]`
 * as the selector for the cell at logical row `r`, column `c`. The model
 * reverses incoming rows on construction (so row 0 = bottom of the visual
 * grid), and we account for that here by emitting `data-maidr-row="${rows-1-r}"`
 * — the visual top-down row index that the adapter stamps onto each cell.
 *
 * Highcharts emits heatmap cells in `series.data` order, which depends on the
 * user's data layout (could be row-major or column-major). DOM-order based
 * mapping is fragile across user configs; per-cell stamping (see
 * `stampHeatmapIndices` in adapter.ts) makes the selector→cell mapping
 * unambiguous regardless of insertion order.
 */
export function heatmapSelectors(
  containerId: string,
  seriesIndex: number,
  rows: number,
  cols: number,
): string[][] {
  const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
  const result: string[][] = [];
  for (let r = 0; r < rows; r++) {
    // HeatmapTrace reverses rows on construction; r=0 is logical bottom.
    // Adapter stamps `data-maidr-row` using the visual top-down index
    // (yIdx as provided by Highcharts), so flip back here.
    const visualRow = rows - 1 - r;
    const rowSelectors: string[] = [];
    for (let c = 0; c < cols; c++) {
      rowSelectors.push(`${base}[data-maidr-row="${visualRow}"][data-maidr-col="${c}"]`);
    }
    result.push(rowSelectors);
  }
  return result;
}

/**
 * Generates per-box {@link BoxSelector} entries for a Highcharts boxplot series.
 *
 * MAIDR's `BoxTrace` expects one `BoxSelector` per box (length must equal the
 * number of data points) rather than a single CSS selector string. Each entry
 * names the sub-elements (`iq`, `q2`, `min`, `max`, optional outliers) so
 * `Svg.selectElement` / `Svg.selectAllElements` can locate them individually.
 *
 * Highcharts renders each box as:
 * ```
 * <g class="highcharts-point">
 *   <path class="highcharts-boxplot-stem"   .../>
 *   <path class="highcharts-boxplot-whisker" d="M ... cap1 ... M ... cap2" />
 *   <path class="highcharts-boxplot-box"     .../>  <!-- IQR body -->
 *   <path class="highcharts-boxplot-median"  .../>
 * </g>
 * ```
 *
 * Caller (the adapter) is responsible for stamping each `g.highcharts-point`
 * with `data-maidr-box-index="N"` AND splitting the whisker `<path>` into
 * `data-maidr-box-part="upper-whisker" | "lower-whisker"` siblings so these
 * selectors are stable and per-box. See `stampBoxIndices` / `splitWhiskerPath`
 * in `adapter.ts`.
 *
 * Trade-off: outliers are returned as empty arrays. Highcharts treats outliers
 * as a sibling `scatter` series, not children of the boxplot group; supporting
 * them would require a separate adapter pass.
 */
export function boxplotSelectors(
  containerId: string,
  seriesIndex: number,
  boxCount: number,
): BoxSelector[] {
  const selectors: BoxSelector[] = [];
  for (let i = 0; i < boxCount; i++) {
    const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} g.highcharts-point[data-maidr-box-index="${i}"]`;
    selectors.push({
      lowerOutliers: [],
      min: `${base} path[data-maidr-box-part="lower-whisker"]`,
      iq: `${base} path.highcharts-boxplot-box`,
      q2: `${base} path.highcharts-boxplot-median`,
      max: `${base} path[data-maidr-box-part="upper-whisker"]`,
      upperOutliers: [],
    });
  }
  return selectors;
}
