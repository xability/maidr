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
 * Floating BarChart (waterfall, gantt, dumbbell, icicle):
 *   g.recharts-bar-rectangle > path.recharts-rectangle
 *   [target: .recharts-bar-rectangle .recharts-rectangle]
 *
 *   None of the four is a Recharts primitive, and all four draw the same
 *   thing: a bar that does not start at the baseline. Recharts renders one
 *   for a `<Bar>` whose `dataKey` returns a `[start, end]` pair, which gives
 *   exactly one rectangle per row — the waterfall's floating step, the gantt's
 *   interval, the dumbbell's connector, the icicle's band — so the ordinary
 *   bar selector already fits.
 *
 *   An icicle carries the one extra condition, since its rows are a flattened
 *   tree rather than the chart's own data: they must be flattened in the same
 *   depth-first pre-order the adapter emits its nodes in, so that row i is
 *   node i. A chart built the other obvious way — one stacked `<Bar>` per
 *   depth level — draws its rectangles series-major instead, which is not that
 *   order, and needs `selectorOverride`.
 *
 *   The other recipe for all of them is a transparent offset `<Bar>` stacked
 *   under a visible one, and it does NOT work: two `<Bar>`s draw two
 *   rectangles per row, and this selector matches the invisible one as well.
 *   Such a chart puts a `className` on the visible `<Bar>` and passes the
 *   narrowed selector as `selectorOverride`.
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
 * Sankey (alluvial, sankey):
 *   g.recharts-sankey-links > path.recharts-sankey-link
 *   [target: .recharts-sankey-links .recharts-sankey-link]
 *
 *   One path per link in declared order, which is the order a flow layer's
 *   selectors have to be in: the trace sorts its edge lists by value the
 *   moment it builds them, and carries each edge's declared position with it.
 *   Both types are drawn by the same component, so both target the same links.
 *
 * PieChart (pie, polar area):
 *   g.recharts-pie > g.recharts-pie-sector > path.recharts-sector
 *   [target: .recharts-pie-sector .recharts-sector]
 *
 *   Recharts emits one sector group per slice in data order, so the selector
 *   already satisfies the pie contract of N elements index-aligned to the
 *   data. The `.recharts-pie-sector` parent scope matters here: the pie's
 *   label lines (`<path class="recharts-curve">`) and, in an active-shape
 *   chart, the enlarged active sector live under `.recharts-pie` too.
 *
 *   A coxcomb is a `<Pie>` whose slices are all the same angle and whose
 *   `outerRadius` is a function of the datum, so its wedges are these same
 *   sectors, one per spoke.
 *
 *   One exception is out of the adapter's hands: Recharts renders no sector at
 *   all for a zero-value slice (`Pie.js` drops sectors whose start and end
 *   angles are both 0). `PieTrace` sees fewer elements than slices and turns
 *   highlighting off for the layer rather than mis-aligning it, so audio,
 *   text, and braille still describe every slice including the zero.
 *
 * Parallel coordinates:
 *   g.recharts-line > path.recharts-line-curve
 *   [target: .recharts-line .recharts-line-curve]
 *
 *   One `<Line>` per OBSERVATION, so one curve path each — the same selector
 *   repeated once per observation, which is the shape `ParallelTrace` inherits
 *   from `LineTrace`. There are no per-vertex marks aligned to the grid, so
 *   the trace parses each path's own vertices into marks; a chart drawn some
 *   other way (a `<Line>` per axis, an extra reference line) gets no
 *   highlighting rather than a highlight on the wrong polyline.
 *
 * Ridgeline:
 *   g.recharts-area > path.recharts-area-area
 *   [target: .recharts-area .recharts-area-area]
 *
 *   One `<Area>` per group, so one filled band each, and `RidgelineTrace`
 *   wants exactly that — one element per ridge, lit from any sample of it.
 *   The bands come out in the order the `<Area>`s are declared, so they must
 *   be declared in the order the groups first appear in `data`.
 *
 * Hexbin:
 *   g.recharts-scatter-symbol > g.recharts-shape > (the drawn hexagon)
 *   [target: .recharts-scatter-symbol .recharts-shape > *]
 *
 *   The bins are a `<Scatter>`, one symbol group per row in row order — but
 *   Recharts has no hexagon among its own symbol types, so a hexbin always
 *   passes a custom `shape` and there is no `path.recharts-symbols` to target
 *   the way the other scatter families do. What both cases share is the
 *   `g.recharts-shape` wrapper Recharts puts around whatever was drawn, so the
 *   selector takes its child: one element per bin, custom shape or not.
 *
 *   The payload is a LATTICE — rows from the bottom up, each ordered left to
 *   right — while the symbols come out in the order the rows arrive. The two
 *   agree only when the rows already arrive in that order, which is what the
 *   converter checks before emitting this selector at all.
 *
 * Boxen:
 *   no generated selector.
 *
 *   A letter-value plot has no box primitive in Recharts: the rungs are
 *   stacked `<Bar>`s over a transparent base, so the rectangles are one per
 *   rung per distribution and no class name says which rung is which.
 *   `BoxenTrace` wants exactly one element per DISTRIBUTION, so a chart that
 *   wants highlighting puts a `className` on the single `<Bar>` drawing the
 *   outermost rung and passes it as `selectorOverride`.
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
/** The wrapper Recharts puts round each bar, and what `:nth-child` counts. */
const BAR_WRAPPER_CLASS = '.recharts-bar-rectangle';

/**
 * One selector per bar, naming the marks in the order the payload lists them.
 *
 * The default bar selector matches every `.recharts-bar-rectangle`, which the
 * model resolves in document order -- and Recharts renders its rectangles in
 * data order whichever way the axis runs. A layer read from the far end
 * therefore cannot use it: point 0 would outline the bar at the other end
 * (#1017).
 *
 * Recharts stamps nothing per point and the schema is built before the chart
 * has rendered, so there is no attribute to name; position is what there is.
 * The bars are the only children of their own `<g class="recharts-layer">` --
 * measured on Recharts 3.8.1 -- so `:nth-child` counts exactly them.
 *
 * The list this returns runs **descending** in `:nth-child`, because payload
 * position 0 is the last bar drawn. That is the direction #1004 requires:
 * `Svg.selectElement` inserts its clone next to the match while the list is
 * still being resolved, so an ascending positional list returns the first
 * element over and over.
 *
 * @param base - The default selector for this chart type, scope and all
 * @param pointCount - How many bars the series drew
 * @returns One selector per point in the payload's order, or `null` when the
 *          base is not one this can count -- the caller then keeps it whole
 *          rather than emitting a list that names nothing
 */
export function reversedBarSelectors(base: string, pointCount: number): string[] | null {
  // Inserted after the wrapper class rather than after the first token: the
  // base carries the chart's own `#maidr-article-…` scope, and in multi-panel
  // mode a panel scope as well, so counting the first thing in the string
  // would number the article instead of the bars.
  if (!base.includes(BAR_WRAPPER_CLASS)) {
    return null;
  }
  return Array.from({ length: pointCount }, (_, i) =>
    base.replace(
      BAR_WRAPPER_CLASS,
      `${BAR_WRAPPER_CLASS}:nth-child(${pointCount - i})`,
    ));
}

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
    // A waterfall step, a gantt interval, a dumbbell connector and an icicle
    // band are drawn by a `<Bar>` too — one floating rectangle per row.
    case 'bar':
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
    case 'diverging_bar':
    case 'histogram':
    case 'waterfall':
    case 'gantt':
    case 'dumbbell':
    case 'icicle':
      return '.recharts-bar-rectangle .recharts-rectangle';
    case 'gauge':
      return '.recharts-radial-bar-sectors .recharts-radial-bar-sector';
    case 'treemap':
      return 'g[class*="recharts-treemap-depth-"]:not(.recharts-treemap-depth-0) > g > g > path.recharts-rectangle';
    case 'sunburst':
      return '.recharts-sunburst .recharts-sector';
    // A bump chart is a <LineChart> of ranks and a survival curve a
    // <LineChart> of step segments, so both draw line dots. So does a step:
    // its curve has more vertices than samples, but its dots are still one
    // per sample, which is what the model pairs its points with.
    case 'line':
    case 'step':
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
    // Both are a `<Sankey>`, so both highlight its ribbons.
    case 'alluvial':
    case 'sankey':
      return '.recharts-sankey-links .recharts-sankey-link';
    // A coxcomb is a `<Pie>` of equal-angle slices, so its wedges are sectors.
    case 'pie':
    case 'polar_area':
      return '.recharts-pie-sector .recharts-sector';
    case 'parallel':
      return '.recharts-line .recharts-line-curve';
    case 'ridgeline':
      return '.recharts-area .recharts-area-area';
    case 'hexbin':
      return '.recharts-scatter-symbol .recharts-shape > *';
    // A boxen has no per-distribution mark of its own; see the module docs.
    case 'boxen':
      return undefined;
  }
}
