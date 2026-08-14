/**
 * CSS selectors for Recharts SVG elements.
 *
 * Recharts renders SVG with specific class names that follow the pattern
 * `.recharts-{component}-{element}`. These selectors target the individual
 * data point elements that MAIDR uses for visual highlighting during
 * keyboard navigation.
 *
 * SVG structure reference (Recharts v2.x / v3.x):
 *
 * BarChart:
 *   g.recharts-bar > g.recharts-bar-rectangles > g.recharts-bar-rectangle > path.recharts-rectangle
 *   [target: .recharts-bar-rectangle .recharts-rectangle]
 *
 * LineChart:
 *   g.recharts-line > g.recharts-line-dots > circle.recharts-line-dot
 *   [target: .recharts-line-dots .recharts-line-dot]
 *
 *   The element-based approach in LineTrace picks up individual dots directly
 *   (similar to how BarTrace uses individual rect elements).
 *
 * AreaChart:
 *   g.recharts-area > g.recharts-area-dots > circle.recharts-area-dot
 *   [target: .recharts-area-dots .recharts-area-dot]
 *
 * RadarChart:
 *   g.recharts-radar > g.recharts-radar-dots > circle.recharts-radar-dot
 *   [target: .recharts-radar-dots .recharts-radar-dot]
 *
 *   Areas and radars carry the line's caveat, because they share its `Dots`
 *   component: it renders nothing unless the consumer sets `dot` on the
 *   `<Area>`/`<Radar>` (the sole exception being a series of exactly one
 *   point). The filled band and the polygon outline are single paths with no
 *   per-sample element to highlight, so the dots are the only index-aligned
 *   marks either chart has.
 *
 * Floating BarChart (waterfall, gantt, dumbbell):
 *   g.recharts-bar-rectangle > path.recharts-rectangle
 *   [target: .recharts-bar-rectangle .recharts-rectangle]
 *
 *   None of the three is a Recharts primitive, and all three draw the same
 *   thing: a bar that does not start at the baseline. Recharts renders one
 *   for a `<Bar>` whose `dataKey` returns a `[start, end]` pair, which gives
 *   exactly one rectangle per row — the waterfall's floating step, the gantt's
 *   interval, the dumbbell's connector — so the ordinary bar selector already
 *   fits.
 *
 *   The other recipe for all three is a transparent offset `<Bar>` stacked
 *   under a visible one, and it does NOT: two `<Bar>`s draw two rectangles per
 *   row, and this selector matches the invisible one as well. Such a chart
 *   puts a `className` on the visible `<Bar>` and passes the narrowed selector
 *   as `selectorOverride`.
 *
 * RadialBarChart (gauge):
 *   g.recharts-radial-bar-sectors > g > path.recharts-radial-bar-sector
 *   [target: .recharts-radial-bar-sectors .recharts-radial-bar-sector]
 *
 *   A gauge draws exactly one measure, so one sector is what the trace wants.
 *
 * Treemap:
 *   g.recharts-treemap-depth-N > g.recharts-layer > g > path.recharts-rectangle
 *   [target: the same, for every depth EXCEPT 0]
 *
 *   Recharts wraps the `data` array in a synthetic root node and draws it as a
 *   full-plot rectangle at depth 0, which is one more rectangle than the
 *   layer declares nodes — and `TreemapTrace` withdraws highlighting entirely
 *   on a count mismatch. Hence the `:not(.recharts-treemap-depth-0)`. The
 *   remaining rectangles come out in document order, which for a tree drawn
 *   as nested `<Layer>`s is depth-first pre-order: the same order the adapter
 *   flattens the nested data in.
 *
 *   The `> g > g >` chain picks a node's OWN rectangle rather than its
 *   descendants', since a child's `<Layer>` is a sibling of its parent's
 *   rectangle. A `<Treemap type="nest">` or one given a custom `content`
 *   draws something else and needs `selectorOverride`.
 *
 * SunburstChart:
 *   g.recharts-sunburst > g > path.recharts-sector
 *   [target: .recharts-sunburst .recharts-sector]
 *
 *   One sector per node in depth-first pre-order, and no sector for the root:
 *   `SunburstChart` renders `data.children`. That is why the adapter is given
 *   those children rather than the root — the declared nodes are then exactly
 *   the drawn ones.
 *
 * ScatterChart:
 *   g.recharts-scatter > g.recharts-scatter-symbol > path.recharts-symbols
 *   [target: .recharts-scatter-symbol .recharts-symbols]
 *
 *   A Cleveland dot plot is a `<Scatter>` against a category axis, and a
 *   lollipop is a `<Scatter>` head over a thin `<Bar>` stem, so both target
 *   the symbols. The head is highlighted rather than the stem: it is where
 *   the value is read off, and a lollipop drawn without one (a custom `<Bar>`
 *   shape carrying its own dot) needs `selectorOverride` anyway.
 *
 * FunnelChart:
 *   g.recharts-trapezoids > g.recharts-funnel-trapezoid > g > path.recharts-trapezoid
 *   [target: .recharts-funnel-trapezoid .recharts-trapezoid]
 *
 *   One trapezoid per stage, in the order the stages are declared, so the
 *   funnel's drawn order and its data order are the same thing.
 *
 * ErrorBar (inside a Bar/Line/Scatter):
 *   g.recharts-errorBars > g.recharts-errorBar > line
 *   [target: .recharts-errorBars .recharts-errorBar]
 *
 *   The whiskers rather than the host mark: an `<ErrorBar>` is the only
 *   element the adapter knows a chart of this type draws, since the estimate
 *   itself may be a bar, a line dot or a scatter symbol depending on what the
 *   author nested it in. A chart that would rather highlight its host mark
 *   passes that selector as `selectorOverride`.
 *
 *   Recharts renders NO whisker for a sample whose error value is zero or
 *   missing (`ErrorBar.js` returns null before drawing). The trace sees fewer
 *   elements than samples and turns highlighting off for the layer rather
 *   than mis-aligning it, the same way a zero-value pie slice behaves.
 *
 *   A forest plot is drawn as a `<ScatterChart>` with `<ErrorBar direction="x">`,
 *   so its marks are the scatter symbols — the square whose area carries the
 *   study's weight — and it targets those instead.
 *
 * Sankey:
 *   g.recharts-sankey-links > path.recharts-sankey-link
 *   [target: .recharts-sankey-links .recharts-sankey-link]
 *
 *   One path per link in declared order, which is the order a flow layer's
 *   selectors have to be in: the trace sorts its edge lists by value the
 *   moment it builds them, and carries each edge's declared position with it.
 *
 * PieChart:
 *   g.recharts-pie > g.recharts-pie-sector > path.recharts-sector
 *   [target: .recharts-pie-sector .recharts-sector]
 *
 *   Recharts emits one sector group per slice in data order, so the selector
 *   already satisfies the pie contract of N elements index-aligned to the
 *   data. The `.recharts-pie-sector` parent scope matters here: the pie's
 *   label lines (`<path class="recharts-curve">`) and, in an active-shape
 *   chart, the enlarged active sector live under `.recharts-pie` too.
 *
 *   One exception is out of the adapter's hands: Recharts renders no sector at
 *   all for a zero-value slice (`Pie.js` drops sectors whose start and end
 *   angles are both 0). `PieTrace` sees fewer elements than slices and turns
 *   highlighting off for the layer rather than mis-aligning it, so audio,
 *   text, and braille still describe every slice including the zero.
 *
 * Selectors are scoped to their parent container classes to avoid matching
 * Recharts utility elements (e.g. Tooltip cursor rectangles) that share the
 * same leaf class name.
 *
 * ## Multi-series limitation
 *
 * Recharts renders axes, grids, and series as sibling `<g>` elements inside
 * a shared surface layer. Because they all share the same tag, CSS positional
 * pseudo-classes (`:nth-child`, `:nth-of-type`) cannot reliably distinguish
 * between series when non-series siblings are interspersed.
 *
 * For **single-series** charts the class selector is unambiguous and
 * highlighting works out of the box.
 *
 * For **multi-series** charts the adapter returns `undefined` for selectors,
 * which disables visual highlighting while preserving audio, text, and braille.
 * To enable highlighting for multi-series charts, add a custom `className` to
 * each Recharts component (e.g. `<Bar className="revenue" />`) and pass the
 * resulting selector via the `selectorOverride` config option.
 */

import type { RechartsChartType } from './types';
import { cssEscape } from '@adapters/shared/selectorUtil';

/**
 * Returns the CSS class name of the generated wrapper div for one panel of
 * a multi-panel (subplot mode) figure. `<MaidrRecharts>` stamps this class
 * on each panel wrapper it renders.
 */
export function getPanelClassName(row: number, col: number): string {
  return `maidr-panel-${row}-${col}`;
}

/**
 * Returns the CSS selector matching one panel's generated wrapper div.
 */
export function getPanelClassSelector(row: number, col: number): string {
  return `.${getPanelClassName(row, col)}`;
}

/**
 * Returns the CSS selector string for individual data point elements
 * of the given Recharts chart type.
 *
 * Returns `undefined` when `seriesIndex` is provided, because CSS alone
 * cannot reliably target a specific series in Recharts' SVG structure.
 * See the module-level documentation for details.
 *
 * The generated selectors are bare page-global class selectors (e.g.
 * `.recharts-bar-rectangle .recharts-rectangle`). MAIDR resolves them via
 * page-global `document.querySelectorAll`, so with two or more Recharts charts
 * on one page they would cross-match. Pass `chartId` (the `<Maidr>` config id)
 * to scope every selector to that chart's own `#maidr-article-<id>` wrapper so
 * the charts cannot highlight one another's elements.
 *
 * For multi-panel figures every panel lives inside the SAME article wrapper,
 * so `chartId` alone is not enough: pass `panelScope` (a selector matching
 * only that panel's container, e.g. `.maidr-panel-0-1`) to keep each panel's
 * selectors from matching sibling panels' marks.
 *
 * @param chartType - The Recharts chart type
 * @param seriesIndex - When set, indicates a multi-series chart — returns undefined
 * @param chartId - When set, scopes the selector to the chart's `<Maidr>`
 *                  article (`#maidr-article-<id>`) to avoid cross-chart matches
 * @param panelScope - When set, additionally scopes the selector to one
 *                     panel's container within the article (subplot mode)
 * @returns CSS selector string, or undefined for multi-series targeting
 */
export function getRechartsSelector(
  chartType: RechartsChartType,
  seriesIndex?: number,
  chartId?: string,
  panelScope?: string,
): string | undefined {
  // Multi-series positional targeting is unreliable with CSS alone.
  // Return undefined to gracefully disable highlighting.
  if (seriesIndex != null) {
    return undefined;
  }

  const base = baseRechartsSelector(chartType);
  if (base === undefined) {
    return base;
  }
  // Scope to the chart's own `<Maidr>` article so multiple Recharts charts on
  // one page cannot cross-highlight under page-global selector resolution,
  // then to the panel's own container so sibling panels cannot either.
  const scopes: string[] = [];
  if (chartId !== undefined) {
    scopes.push(`#maidr-article-${cssEscape(chartId)}`);
  }
  if (panelScope !== undefined) {
    scopes.push(panelScope);
  }
  if (scopes.length === 0) {
    return base;
  }
  return `${scopes.join(' ')} ${base}`;
}

/**
 * Returns the unscoped, page-global leaf selector for a Recharts chart type.
 */
function baseRechartsSelector(chartType: RechartsChartType): string | undefined {
  switch (chartType) {
    // A waterfall step, a gantt interval and a dumbbell connector are drawn by
    // a `<Bar>` too — one floating rectangle per row.
    case 'bar':
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
    case 'diverging_bar':
    case 'histogram':
    case 'waterfall':
    case 'gantt':
    case 'dumbbell':
      return '.recharts-bar-rectangle .recharts-rectangle';
    case 'gauge':
      return '.recharts-radial-bar-sectors .recharts-radial-bar-sector';
    case 'treemap':
      return 'g[class*="recharts-treemap-depth-"]:not(.recharts-treemap-depth-0) > g > g > path.recharts-rectangle';
    case 'sunburst':
      return '.recharts-sunburst .recharts-sector';
    // A bump chart is a <LineChart> of ranks and a survival curve a
    // <LineChart> of step segments, so both draw line dots.
    case 'line':
    case 'bump':
    case 'survival':
      return '.recharts-line-dots .recharts-line-dot';
    case 'area':
    case 'stacked_area':
    case 'normalized_area':
      return '.recharts-area-dots .recharts-area-dot';
    case 'radar':
      return '.recharts-radar-dots .recharts-radar-dot';
    // A volcano and a Manhattan plot are literally scatters, and a forest plot
    // is a <ScatterChart> whose symbols carry the study weights.
    case 'scatter':
    case 'dot':
    case 'lollipop':
    case 'volcano':
    case 'manhattan':
    case 'forest':
      return '.recharts-scatter-symbol .recharts-symbols';
    case 'funnel':
      return '.recharts-funnel-trapezoid .recharts-trapezoid';
    case 'error_bar':
      return '.recharts-errorBars .recharts-errorBar';
    case 'alluvial':
      return '.recharts-sankey-links .recharts-sankey-link';
    case 'pie':
      return '.recharts-pie-sector .recharts-sector';
  }
}
