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
 * Generates a CSS selector for a series' rendered group element — the
 * `<g class="highcharts-series highcharts-series-N">` wrapping all of the
 * series' marks inside `.highcharts-series-group`.
 *
 * Used as the per-panel `MaidrSubplot.selector`: MAIDR's subplot-layout pass
 * measures this element's bounding box to derive the panels' visual order and
 * the vertical arrow-key direction (Highcharts SVG has no `g[id^="axes_"]`
 * groups, so without a measurable per-panel element the core falls back to
 * data order and Up/Down are inverted for multi-row grids). The first layer's
 * selectors are not a reliable substitute — box, candlestick, and heatmap
 * layers carry structured selector objects the layout pass cannot query.
 */
export function seriesGroupSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex}`;
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
 * Generates a CSS selector for the markers of several `scatter` series read as
 * one volcano or Manhattan plot.
 *
 * MAIDR's `VolcanoTrace` inherits `ScatterTrace`'s single-string selector and
 * pairs the elements it finds with the points by index, so a Manhattan drawn
 * as one series per chromosome needs one selector spanning all of them. A
 * comma-joined selector returns them in **document order**, which is series
 * order: Highcharts appends each series' group and marker group to the shared
 * `.highcharts-series-group` as it renders them, in series order, and gives
 * both the same z-index. That is the order the layer concatenates its points
 * in.
 *
 * The hidden hit-detection duplicates documented on {@link scatterSelector}
 * apply here too and are filtered out the same way.
 */
export function volcanoSelector(containerId: string, seriesIndices: number[]): string {
  return seriesIndices
    .map(i => scatterSelector(containerId, i))
    .join(', ');
}

/**
 * Generates per-bin CSS selectors for a `tilemap` series read as a hexbin.
 *
 * MAIDR's `HexbinTrace` slices its selector list row by row, so the list has
 * to run in lattice order — rows along the y axis, bins along x within each —
 * while Highcharts draws the tiles in `series.data` order, which a tilemap is
 * routinely authored in some other order entirely (a honeycomb map is
 * declared country by country). The adapter therefore stamps
 * `data-maidr-bin-index="N"` onto each rendered tile in lattice order (see
 * `stampHexbinIndices` in adapter.ts) and these selectors address the stamp.
 *
 * A tile Highcharts did not draw has no element to stamp, so its selector
 * matches nothing and `HexbinTrace` withdraws the layer's highlighting rather
 * than pairing bins with their neighbours' tiles — which on a staggered
 * lattice is not even a neighbour in the direction a reader would guess.
 */
export function hexbinSelectors(
  containerId: string,
  seriesIndex: number,
  binCount: number,
): string[] {
  const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex}`;
  const selectors: string[] = [];
  for (let i = 0; i < binCount; i++) {
    selectors.push(`${base} [data-maidr-bin-index="${i}"]`);
  }
  return selectors;
}

/**
 * Generates per-region CSS selectors for a `map` series read as a choropleth.
 *
 * MAIDR's `ChoroplethTrace` indexes its selector list by the order the layer
 * declared its regions — the grid it walks is in latitude order, and `source`
 * takes it back to the declaration — so the list has to run in that order and
 * hold exactly one element per region. Highcharts draws a shape for every
 * point including the ones with no value, which the layer leaves out, so
 * document order is one entry longer than the payload on any map with a gap
 * in it. The adapter therefore stamps `data-maidr-region-index="N"` onto each
 * announced region's shape (see `stampPointIndices` in adapter.ts) and
 * these selectors address the stamp.
 *
 * A region Highcharts did not draw has no element to stamp, so its selector
 * matches nothing and `ChoroplethTrace` withdraws the layer's highlighting
 * rather than shading a neighbouring country for the rest of the session.
 */
export function choroplethSelectors(
  containerId: string,
  seriesIndex: number,
  regionCount: number,
): string[] {
  const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex}`;
  const selectors: string[] = [];
  for (let i = 0; i < regionCount; i++) {
    selectors.push(`${base} [data-maidr-region-index="${i}"]`);
  }
  return selectors;
}

/**
 * Generates a CSS selector for the markers of a lollipop series.
 *
 * Highcharts draws each lollipop as two elements: the marker, rendered by
 * `Series#drawPoints` with the `highcharts-point` class, and the stem down to
 * the baseline — a `<path class="highcharts-lollipop-stem">` that carries no
 * point class and is therefore already excluded. The stem only repeats the
 * value its marker already sits at, so MAIDR highlights the marker alone.
 *
 * The markers come from the same `Series#drawPoints` path as scatter markers,
 * so the hidden hit-detection duplicates documented on {@link scatterSelector}
 * apply here too and are filtered out the same way.
 */
export function lollipopSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point:not([visibility="hidden"])`;
}

/**
 * Generates a CSS selector for the connectors of a `dumbbell` series.
 *
 * A dumbbell draws three elements per row: the two dots, which
 * `AreaRangeSeries#drawPoints` renders as ordinary markers carrying the point
 * class (plus `highcharts-lollipop-low` / `-high`), and the segment between
 * them, a `<path class="highcharts-lollipop-stem">` that `drawConnector` adds
 * for every row. A `.highcharts-point` selector would therefore return two
 * elements per row, which is one too many: MAIDR's `DumbbellTrace` wants one
 * element per row and highlights the same one from both ends, since the chart
 * draws one connector per row and not one element per dot.
 *
 * The connector is also the more dependable of the two. Highcharts drops the
 * markers when the points get dense enough to overlap
 * (`marker.enabledThreshold`), while `drawConnector` runs unconditionally.
 */
export function dumbbellSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} path.highcharts-lollipop-stem`;
}

/**
 * Generates a CSS selector for the whips of an `errorbar` series.
 *
 * An error bar is a box plot without the quartiles — `ErrorBarSeries` extends
 * `BoxPlotSeries` with `doQuartiles: false` — so each sample is drawn as a
 * `<g class="highcharts-point">` holding the stem, the two caps and the
 * median mark. The group is the whole whip and is what MAIDR highlights: the
 * lower bound, the estimate and the upper bound are three magnitudes read off
 * one drawn element, so all three highlight it.
 *
 * Matching `g.highcharts-point` rather than the bare class is what keeps the
 * count right on the linked series a chart usually pairs an error bar with —
 * the group is the only element inside the series carrying the point class.
 */
export function errorBarSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} g.highcharts-point`;
}

/**
 * Generates per-series CSS selectors for the wedges of a polar `column` series
 * — a wind rose or coxcomb.
 *
 * MAIDR reads a polar area with `RadarTrace`, which inherits `LineTrace`'s
 * selector handling: one entry per series, each resolving to that series' own
 * marks. A polar column draws one arc per spoke carrying the point class, so
 * the count matches the row's values and `LineTrace` highlights the arcs
 * directly rather than falling back to parsing a path.
 *
 * A radar drawn with `line` or `area` series uses {@link lineSelectors}
 * instead: those series draw an outline rather than one mark per spoke.
 */
export function polarAreaSelectors(containerId: string, seriesIndices: number[]): string[] {
  return seriesIndices.map(
    i => `#${containerId} .highcharts-series-group .highcharts-series-${i} .highcharts-point`,
  );
}

/**
 * Generates per-interval CSS selectors for a `gantt` or `xrange` series.
 *
 * MAIDR's `GanttTrace` reads its selector list **grouped by lane** — the flat
 * list is sliced lane by lane — while Highcharts draws the intervals in
 * `series.data` order, which interleaves lanes freely. Document order
 * therefore says nothing about lane membership, so the adapter stamps
 * `data-maidr-task-index="N"` onto each rendered interval in the lane-major
 * order MAIDR expects (see `stampGanttIndices` in adapter.ts) and these
 * selectors address the stamp.
 *
 * Stamping also side-steps how `XRangeSeries#drawPoint` nests its marks: an
 * ordinary task is a `<g class="highcharts-point">` wrapping a
 * `<rect class="highcharts-point highcharts-partfill-original">`, so the point
 * class appears twice per interval, while a gantt milestone is a single
 * `<path class="highcharts-point">` with no wrapper. The stamp lands on the
 * one element Highcharts records as the point's `graphic` in both cases.
 */
export function ganttSelectors(
  containerId: string,
  seriesIndex: number,
  taskCount: number,
): string[] {
  const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex}`;
  const selectors: string[] = [];
  for (let i = 0; i < taskCount; i++) {
    selectors.push(`${base} [data-maidr-task-index="${i}"]`);
  }
  return selectors;
}

/**
 * Generates a CSS selector for the stages of a funnel (or pyramid) series.
 *
 * A funnel series extends the pie series, so each stage is drawn as a
 * `<path class="highcharts-point">` inside the series group in `series.data`
 * order — stage *k* is segment *k*, with no reordering to undo.
 */
export function funnelSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates a CSS selector for the terms of a wordcloud series.
 *
 * Each term is a `<text class="highcharts-point">` inside the series group.
 * Highcharts appends them heaviest first rather than in `series.data` order,
 * so document order here is weight order; the adapter emits its terms in that
 * same order (see `convertWordCloudSeries`) and this selector only has to find
 * them. The sizing probe Highcharts adds while laying the cloud out is
 * destroyed before the render finishes and never carries the point class.
 */
export function wordCloudSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates a CSS selector for the ribbons of a sankey, dependency wheel or
 * arc diagram series.
 *
 * These series draw twice: `SankeySeries#drawPoints` runs the column
 * point-drawing pass over `series.points` (the links) and then again over
 * `series.nodes`, so the series group holds both, and a `.highcharts-point`
 * selector would return links plus nodes. `SankeyPoint#getClassName` marks
 * which is which — every link carries `highcharts-link` and every node
 * `highcharts-node` — so matching the link class alone returns exactly one
 * element per flow, in `series.data` order.
 *
 * MAIDR's `FlowTrace` wants precisely that: its selector list is one entry per
 * flow, and the nodes highlight through the ribbons they touch rather than
 * through marks of their own.
 */
export function flowSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-link`;
}

/**
 * Generates a CSS selector for the links of a networkgraph series.
 *
 * A network graph draws its nodes as ordinary markers and its links as bare
 * `<path>` elements (`NetworkgraphPoint#renderLink`), and unlike the sankey
 * family it gives the links no class of their own — both end up carrying only
 * `highcharts-point`. The nodes are the ones Highcharts marks, via the
 * `highcharts-node` class it puts on every node it creates, so the links are
 * what is left once those are excluded.
 *
 * Excluding by class rather than relying on document order is deliberate:
 * nodes render into `series.markerGroup` and links into `series.group`, two
 * sibling elements that both carry `highcharts-series-N`, so which of them a
 * query reaches first is a fact about group creation rather than about the
 * data.
 */
export function networkSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point:not(.highcharts-node)`;
}

/**
 * Generates per-node CSS selectors for a treemap or sunburst series.
 *
 * MAIDR's `TreemapTrace` indexes its selector list by the order the nodes were
 * declared, but neither series draws in that order: `TreemapSeries#drawPoints`
 * files each rectangle into a `level-group-N` container whose `zIndex` is the
 * negated depth, so the DOM is grouped by depth and the deepest level comes
 * first. Document order therefore says nothing about declaration order, which
 * is why the adapter stamps `data-maidr-node-index="N"` onto each rendered
 * node (see `stampTreeIndices` in adapter.ts) and these selectors address the
 * stamp.
 *
 * A node Highcharts did not draw — one hidden below the current root, or a
 * point it found no room for — has no element to stamp, so its selector
 * matches nothing and `TreemapTrace` withdraws the layer's highlighting
 * rather than pairing the remaining nodes with the wrong rectangles.
 */
export function treemapSelectors(
  containerId: string,
  seriesIndex: number,
  nodeCount: number,
): string[] {
  const base = `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex}`;
  const selectors: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    selectors.push(`${base} [data-maidr-node-index="${i}"]`);
  }
  return selectors;
}

/**
 * Generates a CSS selector for the needle of a `gauge` series.
 *
 * A dial is the one mark in this adapter that carries no point class at all:
 * `GaugeSeries#drawPoints` builds it with `addClass('highcharts-dial')` and
 * never runs the shared point-drawing pass, so `.highcharts-point` matches
 * nothing on a gauge. The pivot the needle turns on is a separate
 * `.highcharts-pivot` circle that repeats no value, so the needle alone is
 * what MAIDR highlights.
 */
export function gaugeSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-dial`;
}

/**
 * Generates a CSS selector for the arc of a `solidgauge` series.
 *
 * A solid gauge draws the reading as a filled arc rather than a needle, and
 * that arc is an ordinary point: `SolidGaugeSeries#drawPoints` adds
 * `point.getClassName()` to it, so the point class is there.
 */
export function solidGaugeSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates a CSS selector for the measure bar of a `bullet` series.
 *
 * A bullet series extends column, so the bar is a plain point — but each bar
 * also gets a target marker drawn with `point.getClassName() +
 * ' highcharts-bullet-target'`, which means the point class appears twice per
 * datum. The target is announced as the gauge point's `target` rather than
 * highlighted, so it is excluded here and the bar is what the cursor lands on.
 */
export function bulletSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point:not(.highcharts-bullet-target)`;
}

/**
 * Generates a CSS selector for the floating bars of a `waterfall` series.
 *
 * A waterfall extends column, so each step is one `.highcharts-point` in
 * `series.data` order. The dashed connectors Highcharts strings between the
 * bars are a single `path.highcharts-graph` carrying no point class, so they
 * are already excluded — which is what MAIDR wants, since a connector only
 * repeats the running total the two bars it joins already announce.
 */
export function waterfallSelector(containerId: string, seriesIndex: number): string {
  return `#${containerId} .highcharts-series-group .highcharts-series-${seriesIndex} .highcharts-point`;
}

/**
 * Generates a CSS selector for the wedges of a pie (or doughnut) series.
 *
 * Highcharts draws each slice as a `<path class="highcharts-point">` inside
 * the series group, in `series.data` order — a pie is not reordered the way a
 * plotly one is. The data labels Highcharts places around the pie live in a
 * separate `.highcharts-data-labels` group and carry neither that class nor a
 * `<path>` of their own, so no filtering is needed beyond the
 * `.highcharts-series-group` scoping that already excludes the legend swatch
 * (see file header).
 */
export function pieSelector(containerId: string, seriesIndex: number): string {
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
