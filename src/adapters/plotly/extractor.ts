/**
 * Plotly.js auto-extraction adapter.
 *
 * Reads data directly from a rendered plotly.js chart (`gd._fullData`,
 * `gd._fullLayout`, `gd.calcdata`) and produces a {@link Maidr} JSON
 * structure — no external binder required.
 *
 * Usage: drop `<script src="maidr.js">` on any page that contains
 * plotly.js charts and they become accessible automatically.
 */

import type { MosaicDeclaration } from '../../type/declaration';
import type {
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  ChoroplethPoint,
  ContourPoint,
  ErrorBarPoint,
  FlowPoint,
  GanttData,
  GanttPoint,
  GaugeBand,
  GaugePoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  MosaicPoint,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  TreemapPoint,
  ViolinKdePoint,
  WaterfallKind,
  WaterfallPoint,
  WordCloudPoint,
} from '../../type/grammar';
import type { DeclarationContext } from '../shared/traceDeclaration';
import type {
  PlotlyAnnotation,
  PlotlyAxis,
  PlotlyCalcData,
  PlotlyErrorBar,
  PlotlyFullLayout,
  PlotlyGraphDiv,
  PlotlyHierarchyNode,
  PlotlyLayout,
  PlotlyPolarLayout,
  PlotlySankeyNode,
  PlotlyTrace,
  PolarSeries,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';
import { readDeclarationSlot, resolveFieldRef, warnUnresolvedRef } from '../shared/traceDeclaration';
import {
  barPointSelector,
  boxLayerNthChild,
  choroplethRegionSelectors,
  contourLevelSelectors,
  errorBarAxis,
  generatePlotlySelectors,
  polarSeriesSelectors,
  subplotCssPrefix,
} from './selectors';

// Monotonic counter for generating unique IDs when the graph div has no id.
let plotlyIdCounter = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts MAIDR-compatible data from a plotly.js rendered chart.
 *
 * @param element - Any element inside the plotly graph div, or the div itself.
 * @returns A complete {@link Maidr} object, or `null` if extraction fails.
 */
export function extractPlotlyData(element: HTMLElement): Maidr | null {
  const gd = findGraphDiv(element);
  if (!gd) {
    return null;
  }

  const fullData = gd._fullData ?? gd.data;
  const fullLayout = gd._fullLayout ?? gd.layout;

  if (!fullData || !fullLayout) {
    console.warn('[maidr] Plotly graph div found but no data/layout available.');
    return null;
  }

  const id = gd.id || `plotly-maidr-${++plotlyIdCounter}`;
  const title = extractTitle(fullLayout);

  // Group traces by subplot (xaxis + yaxis combination).
  const subplotMap = groupTracesBySubplot(fullData, gd.calcdata);

  // Build 2D subplot grid.
  const subplotGrid = buildSubplotGrid(subplotMap, fullLayout, gd, id);

  if (subplotGrid.length === 0) {
    console.warn('[maidr] No supported traces found in plotly chart.');
    return null;
  }

  return { id, title, subplots: subplotGrid };
}

/**
 * Finds the `.js-plotly-plot` ancestor (or self) of the given element.
 */
export function findGraphDiv(element: HTMLElement): PlotlyGraphDiv | null {
  const gd = element.closest('.js-plotly-plot') as PlotlyGraphDiv | null;
  if (gd && gd._fullData) {
    return gd;
  }
  // The element itself might be the graph div.
  if ((element as PlotlyGraphDiv)._fullData) {
    return element as PlotlyGraphDiv;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a text string from a value that may be a plain string or
 * an object with a `.text` property. Plotly uses this pattern for
 * layout.title, axis.title, and colorbar.title.
 */
function extractTextOrObject(value: { text?: string } | string | undefined | null): string | undefined {
  if (!value)
    return undefined;
  if (typeof value === 'string')
    return value;
  return value.text ?? undefined;
}

/**
 * A backstop for the English title placeholders, applied whenever `_dfltTitle`
 * has not already settled the question — including when it is present and
 * simply did not match. Every title placeholder in Plotly's English dictionary
 * opens this way; the annotation default, which is not a title, does not.
 */
const PLACEHOLDER_TITLE_PATTERN = /^click to enter /i;

/**
 * The one `_dfltTitle` entry that stands in for something other than a title,
 * and so has no business being compared against one. Its value — `new text` —
 * is also short enough to be a label an author really wrote, where the title
 * placeholders are not.
 */
const NON_TITLE_DFLT_SLOT = 'annotation';

/**
 * Reports whether a resolved title is one of Plotly's title placeholders — the
 * text it substitutes for a title that was never given.
 *
 * Plotly only draws a placeholder in editable mode, so on an ordinary chart it
 * is on screen for nobody; announcing it would tell a blind reader the chart
 * has an axis name that sighted readers cannot see. `_fullLayout._dfltTitle`
 * holds the exact strings Plotly substituted, translated when a locale is set,
 * which is why they are compared against rather than hard-coded.
 */
function isPlaceholderTitle(text: string, layout: PlotlyLayout | undefined): boolean {
  const dfltTitle = (layout as PlotlyFullLayout | undefined)?._dfltTitle;
  if (dfltTitle) {
    for (const [slot, placeholder] of Object.entries(dfltTitle)) {
      if (slot !== NON_TITLE_DFLT_SLOT && placeholder === text)
        return true;
    }
  }
  return PLACEHOLDER_TITLE_PATTERN.test(text);
}

/**
 * Extracts a title only when Plotly resolved it from something the author
 * actually supplied, discarding the placeholders.
 */
function extractGivenTitle(
  value: { text?: string } | string | undefined | null,
  layout: PlotlyLayout | undefined,
): string | undefined {
  const text = extractTextOrObject(value);
  if (!text || isPlaceholderTitle(text, layout))
    return undefined;
  return text;
}

function extractTitle(layout: PlotlyLayout): string | undefined {
  return extractGivenTitle(layout.title, layout);
}

function extractAxisLabel(axis: PlotlyAxis | undefined, layout: PlotlyLayout): string | undefined {
  return extractGivenTitle(axis?.title, layout);
}

function getAxis(layout: PlotlyFullLayout, axisId: string): PlotlyAxis | undefined {
  // plotly uses 'x' → layout.xaxis, 'x2' → layout.xaxis2, etc.
  if (axisId === 'x')
    return layout.xaxis as PlotlyAxis | undefined;
  if (axisId === 'y')
    return layout.yaxis as PlotlyAxis | undefined;
  return layout[`${axisId.charAt(0)}axis${axisId.slice(1)}`] as PlotlyAxis | undefined;
}

// ---------------------------------------------------------------------------
// Grid config extraction for scatter plot navigation
// ---------------------------------------------------------------------------

/**
 * Extracts grid configuration (min, max, tickStep) from Plotly's computed axis.
 * Returns null if the axis doesn't have valid numeric range and tick info.
 *
 * @param layout - The Plotly fullLayout object with computed axis values
 * @param axisId - The axis identifier ('x', 'y', 'x2', 'y2', etc.)
 * @returns Grid config object or null if not available
 */
function extractAxisGridConfig(
  layout: PlotlyFullLayout,
  axisId: string,
): { min: number; max: number; tickStep: number } | null {
  const axis = getAxis(layout, axisId);
  if (!axis)
    return null;

  // Extract range (min, max)
  const range = axis.range;
  if (!range || range.length < 2)
    return null;

  const min = Number(range[0]);
  const max = Number(range[1]);
  if (Number.isNaN(min) || Number.isNaN(max))
    return null;

  // Extract tick step from dtick
  // dtick can be a number or special string (e.g., "M3" for months, "D1" for days)
  let tickStep: number | null = null;

  if (typeof axis.dtick === 'number') {
    tickStep = axis.dtick;
  } else if (typeof axis.dtick === 'string') {
    // Try parsing numeric string
    const parsed = Number.parseFloat(axis.dtick);
    if (!Number.isNaN(parsed)) {
      tickStep = parsed;
    }
    // Skip non-numeric dtick (date/log special formats)
  }

  // Fallback: if tickmode is 'array' and tickvals exist, compute step from values
  if (tickStep === null && axis.tickmode === 'array' && axis.tickvals && axis.tickvals.length >= 2) {
    const sortedTicks = [...axis.tickvals].sort((a, b) => a - b);
    // Use the most common step between adjacent ticks
    const steps: number[] = [];
    for (let i = 1; i < sortedTicks.length; i++) {
      steps.push(sortedTicks[i] - sortedTicks[i - 1]);
    }
    if (steps.length > 0) {
      // Use median step to be robust against irregular spacing
      steps.sort((a, b) => a - b);
      tickStep = steps[Math.floor(steps.length / 2)];
    }
  }

  if (tickStep === null || tickStep <= 0)
    return null;

  // Ensure min < max (Plotly can have reversed axes)
  const actualMin = Math.min(min, max);
  const actualMax = Math.max(min, max);

  return { min: actualMin, max: actualMax, tickStep };
}

// ---------------------------------------------------------------------------
// Trace type mapping
// ---------------------------------------------------------------------------

/**
 * The trace types plotly draws error bars on top of. It is a modifier rather
 * than a trace type of its own, so it has to be recognised before the type
 * itself: a scatter with intervals is an error-bar chart, not a scatter that
 * happens to have whiskers, and reading it as a scatter announces the
 * estimate and drops the uncertainty the chart was drawn to show.
 *
 * A histogram is deliberately absent even though plotly will draw error bars
 * on one: its counts are computed rather than authored, and the layer is
 * already built from bins that carry no per-bin interval.
 */
const ERROR_BAR_TRACE_TYPES = new Set(['scatter', 'scattergl', 'bar']);

/**
 * Maps a plotly.js trace type + mode to a MAIDR TraceType.
 * Returns `null` for unsupported types.
 */
function mapTraceType(trace: PlotlyTrace): TraceType | null {
  const type = trace.type ?? 'scatter';

  if (ERROR_BAR_TRACE_TYPES.has(type) && errorBarAxis(trace) !== null) {
    return TraceType.ERROR_BAR;
  }

  switch (type) {
    case 'scatter':
    case 'scattergl':
      return mapScatterMode(trace);

    case 'bar':
      return TraceType.BAR;

    case 'box':
      return TraceType.BOX;

    // A violin becomes two layers (`violin_box` + `violin_kde`); the KDE type
    // stands for the pair while traces are grouped.
    case 'violin':
      return TraceType.VIOLIN_KDE;

    case 'heatmap':
    case 'heatmapgl':
      return TraceType.HEATMAP;

    // Both draw a scalar field as curves of constant value, and differ only
    // in where the field came from: `contour` is given the grid, and
    // `histogram2dcontour` bins samples into one first. Plotly draws them
    // with the same plotter, into the same layer.
    case 'contour':
    case 'histogram2dcontour':
      return TraceType.CONTOUR;

    case 'histogram':
      return TraceType.HISTOGRAM;

    // `ohlc` carries the same four numbers and differs only in how plotly
    // draws a bar — a tick either side of a vertical range rather than a
    // filled body — so a reader is told open, high, low and close either way.
    // It draws into a layer of its own, which the selector handles.
    case 'candlestick':
    case 'ohlc':
      return TraceType.CANDLESTICK;

    case 'pie':
      return TraceType.PIE;

    case 'funnel':
      return TraceType.FUNNEL;

    case 'waterfall':
      return TraceType.WATERFALL;

    // One tree, three layouts. MAIDR reads all three as the same hierarchy —
    // only the emitted type differs, and the sunburst's angular panning is
    // the one thing that reads it.
    case 'sunburst':
      return TraceType.SUNBURST;

    case 'icicle':
      return TraceType.ICICLE;

    case 'treemap':
      return TraceType.TREEMAP;

    case 'sankey':
      return TraceType.SANKEY;

    // An indicator is a gauge only when it draws one. Without `gauge` it is a
    // number (and maybe a delta) set in text, which a screen reader already
    // reaches — there is no mark, no scale and nothing to sonify.
    case 'indicator':
      if (trace.gauge)
        return TraceType.GAUGE;
      console.warn('[maidr] Plotly indicator has no gauge to read. Skipping.');
      return null;

    // A radar and a polar area differ in the mark alone: both are values on
    // named spokes, and MAIDR navigates them identically.
    case 'scatterpolar':
    case 'scatterpolargl':
      return TraceType.RADAR;

    case 'barpolar':
      return TraceType.POLAR_AREA;

    case 'parcoords':
      return TraceType.PARALLEL;

    // Only the SVG choropleth. `choroplethmapbox` and `choroplethmap` draw
    // their regions into a WebGL canvas, so there is no element per region to
    // highlight and nothing the adapter could scope a selector to.
    case 'choropleth':
      return TraceType.CHOROPLETH;

    default:
      console.warn(`[maidr] Unsupported plotly trace type: "${type}". Skipping.`);
      return null;
  }
}

function mapScatterMode(trace: PlotlyTrace): TraceType {
  // A stacked scatter IS plotly's area chart: naming a `stackgroup` is how one
  // is authored, and plotly turns the fill on itself. The mode does not enter
  // into it — the accumulation is the payload either way.
  if (trace.stackgroup) {
    return isNormalizedStack(trace.groupnorm)
      ? TraceType.NORMALIZED_AREA
      : TraceType.STACKED_AREA;
  }

  const mode = trace.mode;
  if (!mode)
    return TraceType.SCATTER;
  // Ahead of the mark tests, because a cloud is drawn with no mark at all: its
  // terms ARE the text, and read as a scatter it would announce the packing
  // coordinates plotly was handed to lay the glyphs out with.
  if (wordCloudWeights(trace) !== null)
    return TraceType.WORD_CLOUD;
  // When both lines and markers exist, prefer LINE for navigational context.
  if (mode.includes('lines')) {
    // A staircase keeps its step reading even when it is filled: with nothing
    // accumulating, AREA would trade the announced convention for a fill that
    // is decoration.
    if (isStepShape(trace.line?.shape))
      return TraceType.STEP;
    return isFilled(trace.fill) ? TraceType.AREA : TraceType.LINE;
  }
  if (isFilled(trace.fill))
    return TraceType.AREA;
  // A marker per category, with no category drawn twice, is a Cleveland dot
  // plot: the same category-and-value pairing a bar chart draws, with a dot in
  // place of the bar. A scatter reading would announce the category as a
  // coordinate and offer a grid walk over a single row of them.
  if (mode.includes('markers') && dotCategoryAxis(trace) !== null)
    return TraceType.DOT;
  return TraceType.SCATTER;
}

/**
 * Which axis of a markers-only scatter is the category axis of a dot plot, or
 * `null` when the trace is not one.
 *
 * Read off the data rather than off the resolved axis, which is not in hand
 * here and which an author can set to `category` for a chart that is nothing
 * of the kind. The test is deliberately narrow: every position on one axis is
 * a distinct label, and every value on the other is a number. One label drawn
 * twice means the chart is comparing points within a category rather than
 * naming it once, which is a scatter — so the ambiguous case stays a scatter,
 * as it is announced today.
 *
 * @param trace - The resolved plotly trace
 * @returns `'x'`, `'y'`, or null when this is not a dot plot
 */
function dotCategoryAxis(trace: PlotlyTrace): 'x' | 'y' | null {
  if (isDistinctLabels(trace.x) && isMagnitudes(trace.y))
    return 'x';
  if (isDistinctLabels(trace.y) && isMagnitudes(trace.x))
    return 'y';
  return null;
}

/** Whether a column is a non-empty run of labels, none of them repeated. */
function isDistinctLabels(values: (number | string)[] | undefined): boolean {
  if (!values || values.length === 0)
    return false;
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value === '')
      return false;
    if (seen.has(value))
      return false;
    seen.add(value);
  }
  return true;
}

/** Whether a column is a non-empty run of numbers, parallel to the labels. */
function isMagnitudes(values: (number | string)[] | undefined): boolean {
  if (!values || values.length === 0)
    return false;
  return values.every(value => value != null && Number.isFinite(Number(value)));
}

/**
 * Whether plotly fills the region under (or around) this trace.
 *
 * Plotly resolves an unfilled trace to the literal string `'none'` rather
 * than leaving the attribute off, so the absent case has to be spelled out
 * alongside it.
 */
function isFilled(fill: string | undefined): boolean {
  return fill !== undefined && fill !== '' && fill !== 'none';
}

/**
 * Whether a stack group's bands were rescaled to a common total — the direct
 * analogue of the `barnorm` test that splits STACKED from NORMALIZED.
 */
function isNormalizedStack(groupnorm: string | undefined): boolean {
  return groupnorm === 'percent' || groupnorm === 'fraction';
}

/**
 * The `line.shape` values plotly draws as a staircase rather than as an
 * interpolated line. `linear`, `spline` and an absent shape are not here:
 * those really do move gradually between samples.
 */
const STEP_SHAPES = new Set(['hv', 'vh', 'hvh', 'vhv']);

/**
 * Where each staircase shape jumps, in {@link StepDirection} terms.
 *
 * `vhv` is deliberately absent rather than mapped to `mid`. It is the one
 * shape whose horizontal segments do not sit at a sample's own value: it
 * rises at `x[i]`, runs flat at the *mean* of `y[i]` and `y[i+1]` across the
 * interval, then rises again at `x[i+1]`. None of the three conventions
 * describes that, and `mid` would actively mislead — it promises a jump
 * midway between x values, where `vhv` jumps at the x values themselves. The
 * trace still binds as a step (the data is piecewise constant, and the
 * transition rotor is the navigation it wants); only the spoken convention is
 * withheld, which is what {@link MaidrLayer.stepDirection} being optional is
 * for.
 */
const STEP_SHAPE_DIRECTION: Partial<Record<string, StepDirection>> = {
  hv: 'hv',
  vh: 'vh',
  hvh: 'mid',
};

/**
 * Whether plotly draws this `line.shape` as a piecewise-constant staircase.
 */
function isStepShape(shape?: string): boolean {
  return shape !== undefined && STEP_SHAPES.has(shape);
}

/**
 * The step convention a trace authored, or `undefined` when plotly's shape has
 * no {@link StepDirection} equivalent.
 */
function stepDirectionOf(trace: PlotlyTrace): StepDirection | undefined {
  const shape = trace.line?.shape;
  return shape === undefined ? undefined : STEP_SHAPE_DIRECTION[shape];
}

// ---------------------------------------------------------------------------
// Subplot grouping
// ---------------------------------------------------------------------------

interface SubplotGroup {
  xAxisId: string;
  yAxisId: string;
  /**
   * Where the panel sits on the paper, when it is not an axis pair that says
   * so. Every domain-positioned trace sets this — see
   * {@link groupTracesBySubplot}.
   */
  domain?: { x: DomainInterval; y: DomainInterval };
  /**
   * The named subplot the panel is, when it is one (`polar`, `polar2`, `geo`,
   * …). Its domain lives on the layout rather than on the trace, so unlike the
   * domain-positioned types it is resolved later, where the layout is in hand.
   */
  subplotId?: string;
  traces: PlotlyTrace[];
  calcdata: PlotlyCalcData[][];
  traceIndices: number[];
}

/**
 * The trace types plotly positions by their own `domain` rather than by an
 * axis pair. Each is a panel of its own: they carry no `xaxis`/`yaxis`, so
 * falling through to the `'x'`/`'y'` defaults would file them under whichever
 * cartesian panel happens to use the first axis pair, giving them that
 * panel's axis labels and putting two unrelated charts in one subplot.
 */
const DOMAIN_POSITIONED_TYPES = new Set([
  'pie',
  'sunburst',
  'icicle',
  'treemap',
  'sankey',
  'indicator',
  'parcoords',
]);

/**
 * The trace types plotly draws on a polar subplot. They have the same problem
 * the domain-positioned types do, with one difference: several of them share
 * a subplot, and the subplot — named on `trace.subplot` — is what keys the
 * panel, exactly as an axis pair does for a cartesian trace.
 */
const POLAR_TYPES = new Set(['scatterpolar', 'scatterpolargl', 'barpolar']);

/**
 * The trace types plotly draws on a geo subplot. They are keyed the way the
 * polar types are — by the subplot named on the trace — and their domain
 * likewise lives on the layout entry rather than on the trace.
 */
const GEO_TYPES = new Set(['choropleth', 'scattergeo']);

/** A trace within a subplot group, keyed to its calcdata and its global index. */
interface TraceEntry {
  trace: PlotlyTrace;
  /** The MAIDR type it maps to, or `null` when MAIDR has no equivalent. */
  maidrType: TraceType | null;
  /** Index within the group, used to look up `group.calcdata`. */
  calcIdx: number;
  /** Index within `gd._fullData`. */
  globalIdx: number;
}

function groupTracesBySubplot(
  traces: PlotlyTrace[],
  calcdata?: PlotlyCalcData[][],
): Map<string, SubplotGroup> {
  const map = new Map<string, SubplotGroup>();

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];

    // Skip hidden traces and legend-only traces (no visible SVG elements).
    if (trace.visible === false || trace.visible === 'legendonly')
      continue;

    // A domain-positioned trace is its own panel, keyed by its trace index and
    // positioned from its own domain; a polar or geo trace shares a panel with
    // every other trace on the same named subplot. Neither has an axis pair,
    // so both leave the axis ids blank.
    const type = trace.type ?? 'scatter';
    const isDomain = DOMAIN_POSITIONED_TYPES.has(type);
    const subplotId = POLAR_TYPES.has(type)
      ? (trace.subplot ?? 'polar')
      : GEO_TYPES.has(type)
        ? (trace.geo ?? 'geo')
        : undefined;
    const positioned = isDomain || subplotId !== undefined;
    const xAxisId = positioned ? '' : (trace.xaxis ?? 'x');
    const yAxisId = positioned ? '' : (trace.yaxis ?? 'y');
    const key = isDomain ? `domain${i}` : (subplotId ?? `${xAxisId}${yAxisId}`);

    if (!map.has(key)) {
      map.set(key, {
        xAxisId,
        yAxisId,
        ...(isDomain ? { domain: readTraceDomain(trace) } : {}),
        ...(subplotId === undefined ? {} : { subplotId }),
        traces: [],
        calcdata: [],
        traceIndices: [],
      });
    }

    const group = map.get(key)!;
    group.traces.push(trace);
    group.traceIndices.push(i);
    if (calcdata) {
      // Push a placeholder for traces without calcdata so `calcIdx` stays
      // aligned with the group's trace order.
      group.calcdata.push(calcdata[i] ?? []);
    }
  }

  return map;
}

/** A kept subplot together with the trace group it was built from. */
interface PanelEntry {
  group: SubplotGroup;
  subplot: MaidrSubplot;
}

function buildSubplotGrid(
  subplotMap: Map<string, SubplotGroup>,
  layout: PlotlyFullLayout,
  gd: PlotlyGraphDiv,
  maidrId: string,
): MaidrSubplot[][] {
  const panels: PanelEntry[] = [];

  for (const [, group] of subplotMap) {
    const layers = buildSubplotLayers(group, layout, gd);
    if (layers.length > 0) {
      panels.push({ group, subplot: { layers } });
    }
  }

  if (panels.length === 0)
    return [];
  if (panels.length === 1)
    return [[panels[0].subplot]];

  const grid = arrangePanelsIntoGrid(panels, layout);
  if (!grid) {
    // Overlapping axis domains (inset/overlaid axes) or missing domain
    // info: not a grid — keep the flat single-row arrangement.
    return [panels.map(panel => panel.subplot)];
  }

  applyFacetTitles(grid, layout);
  assignSubplotSelectors(grid, maidrId);
  return grid.map(row => row.map(panel => panel.subplot));
}

/**
 * How a trace is named in a warning about its declaration.
 *
 * The index is what an author can find a trace by — plotly traces have no ids
 * — and the name is added when there is one, since that is what the legend
 * shows.
 *
 * @param trace      - The resolved plotly trace
 * @param traceIndex - Its index in `_fullData`
 * @returns The context every declaration warning is located from
 */
function declarationContext(trace: PlotlyTrace, traceIndex: number): DeclarationContext {
  return {
    adapter: 'Plotly',
    seriesRef: trace.name ? `trace ${traceIndex} ("${trace.name}")` : `trace ${traceIndex}`,
  };
}

/**
 * The co-located `maidr` declaration a trace carries, when it is one this
 * adapter reads.
 *
 * Plotly's own arbitrary-metadata attribute is the channel:
 * `trace.meta.maidr`. It is ordinary trace config, so it survives
 * `Plotly.react` and a JSON-authored figure, and — unlike an options bag —
 * it reaches an extractor that is called from a DOM sweep the author never
 * touches.
 *
 * Only the mosaic is declarable here. Every other chart plotly can draw
 * either names itself in `trace.type` or is read from the figure's own
 * configuration, so a declaration of another type is reported rather than
 * quietly dropped: the author wrote it expecting it to do something.
 *
 * @param trace      - The resolved plotly trace
 * @param traceIndex - Its index in `_fullData`
 * @returns The declaration, or null when there is none to read
 */
function readTraceDeclaration(
  trace: PlotlyTrace,
  traceIndex: number,
): MosaicDeclaration | null {
  const context = declarationContext(trace, traceIndex);
  const declaration = readDeclarationSlot(trace.meta, context);
  if (declaration === null) {
    return null;
  }
  if (declaration.type === TraceType.MOSAIC) {
    return declaration;
  }

  console.warn(
    `[MAIDR Plotly] maidr declaration on ${context.seriesRef} declares `
    + `"${declaration.type}", which the plotly adapter does not read; `
    + `reading it as the undeclared chart.`,
  );
  return null;
}

/**
 * The marimekko a panel declares, if the bars it is declared on can draw one.
 *
 * A mosaic is opt-in for a reason that is about the schema rather than about
 * this adapter: plotly's `width` is ordinary bar styling and an array of
 * widths is a legitimate thing to write on any bar trace, so reading one as a
 * marimekko would announce every column's width as a share of all
 * observations — a number the chart does not contain.
 *
 * @param group      - The panel's traces
 * @param barTraces  - The bar traces among them
 * @param layout     - The resolved layout, for `barmode`
 * @returns The declaration to read the panel by, or null
 */
function declaredMosaic(
  group: SubplotGroup,
  barTraces: TraceEntry[],
  layout: PlotlyFullLayout,
): MosaicDeclaration | null {
  let declared: MosaicDeclaration | null = null;
  let declaredOnBars = false;

  // Read once per trace per binding, which is what keeps each warning to one
  // line however many layers the panel ends up with.
  for (let i = 0; i < group.traces.length; i++) {
    const declaration = readTraceDeclaration(group.traces[i], group.traceIndices[i]);
    if (declaration === null || declared !== null) {
      continue;
    }
    declared = declaration;
    declaredOnBars = barTraces.some(entry => entry.trace === group.traces[i]);
  }

  if (declared === null) {
    return null;
  }
  if (!declaredOnBars) {
    console.warn(
      '[MAIDR Plotly] maidr declaration for "mosaic" is not on a bar trace; '
      + 'a mosaic is drawn as bars. Reading the panel as the undeclared chart.',
    );
    return null;
  }

  // Several bar traces are the cells of one column only when plotly stacked
  // them. Grouped side by side they are not a mosaic's segments at all, and
  // the widths would describe columns that were never drawn.
  const barmode = layout.barmode ?? 'group';
  if (barTraces.length > 1 && barmode !== 'stack' && barmode !== 'relative') {
    console.warn(
      `[MAIDR Plotly] maidr declaration for "mosaic" is on a panel whose bars `
      + `are drawn with barmode "${barmode}"; a mosaic stacks its segments. `
      + `Reading the panel as the undeclared chart.`,
    );
    return null;
  }

  return declared;
}

/**
 * Builds all MAIDR layers for one subplot (one x/y axis-pair group).
 */
function buildSubplotLayers(
  group: SubplotGroup,
  layout: PlotlyFullLayout,
  gd: PlotlyGraphDiv,
): MaidrLayer[] {
  const xLabel = resolveAxisLabel(layout, group.xAxisId);
  const yLabel = resolveAxisLabel(layout, group.yAxisId);

  const layers: MaidrLayer[] = [];

  // Group traces that need multi-trace handling.
  const lineTraces: TraceEntry[] = [];
  // Step traces are grouped by the convention they authored, because a layer
  // carries one `stepDirection` for all of its series: merging an `hv` trace
  // with a `vh` one would describe one of them wrongly. Keyed by direction,
  // with '' for the shapes that report none, so those stay together too.
  const stepTraces = new Map<StepDirection | '', TraceEntry[]>();
  // Independent bands over shared axes, read as a multi-series layer the way
  // plain lines are — the fill is what they look like, not a second magnitude.
  const areaTraces: TraceEntry[] = [];
  // Stacked bands, keyed by the group they stack in, for the reason step
  // traces are keyed by direction: two stacks drawn on one panel have two
  // running totals, and merging them would announce a total nothing drew.
  const stackedAreaTraces = new Map<string, TraceEntry[]>();
  const boxTraces: TraceEntry[] = [];
  const barTraces: TraceEntry[] = [];
  const violinTraces: TraceEntry[] = [];
  // Spokes on a polar subplot, read as a multi-series layer the way lines are.
  // The two marks are kept apart because a layer announces one of them.
  const radarTraces: TraceEntry[] = [];
  const polarAreaTraces: TraceEntry[] = [];
  const otherTraces: TraceEntry[] = [];

  for (let i = 0; i < group.traces.length; i++) {
    const trace = group.traces[i];
    // Resolved once per trace: mapping an unsupported type warns, and doing it
    // again below would log the same line twice.
    const entry: TraceEntry = {
      trace,
      maidrType: mapTraceType(trace),
      calcIdx: i,
      globalIdx: group.traceIndices[i],
    };
    if (entry.maidrType === TraceType.LINE) {
      lineTraces.push(entry);
    } else if (entry.maidrType === TraceType.STEP) {
      const key = stepDirectionOf(trace) ?? '';
      const bucket = stepTraces.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        stepTraces.set(key, [entry]);
      }
    } else if (entry.maidrType === TraceType.AREA) {
      areaTraces.push(entry);
    } else if (
      entry.maidrType === TraceType.STACKED_AREA
      || entry.maidrType === TraceType.NORMALIZED_AREA
    ) {
      const key = trace.stackgroup ?? '';
      const bucket = stackedAreaTraces.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        stackedAreaTraces.set(key, [entry]);
      }
    } else if (entry.maidrType === TraceType.BOX) {
      boxTraces.push(entry);
    } else if (entry.maidrType === TraceType.BAR) {
      barTraces.push(entry);
    } else if (entry.maidrType === TraceType.VIOLIN_KDE) {
      violinTraces.push(entry);
    } else if (entry.maidrType === TraceType.RADAR) {
      radarTraces.push(entry);
    } else if (entry.maidrType === TraceType.POLAR_AREA) {
      polarAreaTraces.push(entry);
    } else {
      otherTraces.push(entry);
    }
  }

  // Build multi-line layer if applicable.
  if (lineTraces.length > 0) {
    const layer = extractMultiLineLayer(lineTraces, xLabel, yLabel, gd);
    if (layer)
      layers.push(layer);
  }

  // One step layer per authored convention (usually exactly one).
  for (const [direction, traces] of stepTraces) {
    const layer = extractMultiLineLayer(traces, xLabel, yLabel, gd, {
      type: TraceType.STEP,
      stepDirection: direction === '' ? undefined : direction,
    });
    if (layer)
      layers.push(layer);
  }

  // Unstacked areas share one layer, the way unstacked lines do.
  if (areaTraces.length > 0) {
    const layer = extractMultiLineLayer(areaTraces, xLabel, yLabel, gd, {
      type: TraceType.AREA,
    });
    if (layer)
      layers.push(layer);
  }

  // One layer per stack group. Every trace in a group shares its `groupnorm`,
  // so the first one settles whether the layer is stacked or normalized.
  for (const [, traces] of stackedAreaTraces) {
    const type = traces[0].maidrType === TraceType.NORMALIZED_AREA
      ? TraceType.NORMALIZED_AREA
      : TraceType.STACKED_AREA;
    const bands = type === TraceType.NORMALIZED_AREA
      ? traces.map(entry => ({
          ...entry,
          values: normalizedBandHeights(entry.trace, group.calcdata[entry.calcIdx] ?? []),
        }))
      : traces;
    const layer = extractMultiLineLayer(bands, xLabel, yLabel, gd, { type });
    if (layer)
      layers.push(layer);
  }

  // Build multi-box layer: all box traces in one layer.
  if (boxTraces.length > 0) {
    const layer = extractMultiBoxLayer(boxTraces, group, xLabel, yLabel, gd);
    if (layer)
      layers.push(layer);
  }

  // Build the violin pair: every violin in the subplot shares one box layer
  // and one KDE layer. Halved and overlapped, the same traces are plotly's
  // ridgeline, which is one layer rather than two.
  if (violinTraces.length > 0) {
    if (isRidgeline(violinTraces)) {
      const layer = extractRidgelineLayer(violinTraces, group, layout, xLabel, yLabel);
      if (layer)
        layers.push(layer);
    } else {
      layers.push(...extractViolinLayers(violinTraces, group, layout, xLabel, yLabel));
    }
  }

  // One layer per mark on the polar subplot: the spokes are shared, but a
  // layer announces itself as a radar or as a polar area, not as both.
  for (const [type, traces] of [
    [TraceType.RADAR, radarTraces],
    [TraceType.POLAR_AREA, polarAreaTraces],
  ] as const) {
    if (traces.length === 0)
      continue;
    const layer = extractPolarLayer(traces, type, group, layout);
    if (layer)
      layers.push(layer);
  }

  // A declared marimekko is read as one whatever else the panel's bars would
  // have been taken for: a declaration beats every heuristic.
  const mosaic = declaredMosaic(group, barTraces, layout);
  const mosaicLayer = mosaic && barTraces.length > 0
    ? extractSegmentedBarLayer(
        barTraces,
        group,
        TraceType.MOSAIC,
        xLabel,
        yLabel,
        gd,
        mosaic,
      )
    : null;

  // A schedule reaches plotly as bars floated onto a time axis, so it has to
  // be recognised before the bar shapes are: read as bars, the intervals would
  // announce their durations as magnitudes measured from nothing.
  const ganttLayer = !mosaicLayer && isGanttPanel(barTraces, group, layout)
    ? extractGanttLayer(barTraces, group, layout, xLabel, yLabel)
    : null;

  // Build bar layers: grouped/stacked/normalized for multiple bar traces.
  if (mosaicLayer) {
    layers.push(mosaicLayer);
  } else if (ganttLayer) {
    layers.push(ganttLayer);
  } else if (barTraces.length > 1) {
    const barmode = layout.barmode ?? 'group';
    const barnorm = layout.barnorm ?? '';

    if (barmode === 'group') {
      const layer = extractSegmentedBarLayer(barTraces, group, TraceType.DODGED, xLabel, yLabel, gd);
      if (layer)
        layers.push(layer);
    } else if (barmode === 'stack' || barmode === 'relative') {
      // A pyramid is stacked the same way and drawn the same way; what tells
      // the two apart is that its sides grow in opposite directions from the
      // baseline, which is the sign of the values themselves.
      const type = barnorm === 'percent' || barnorm === 'fraction'
        ? TraceType.NORMALIZED
        : divergingSides(barTraces)
          ? TraceType.DIVERGING
          : TraceType.STACKED;
      const layer = extractSegmentedBarLayer(barTraces, group, type, xLabel, yLabel, gd);
      if (layer)
        layers.push(layer);
    } else {
      // 'overlay' or unknown: treat as individual bars.
      for (const bt of barTraces) {
        otherTraces.push(bt);
      }
    }
  } else if (barTraces.length === 1) {
    otherTraces.push(barTraces[0]);
  }

  // Build individual layers for remaining traces.
  for (const { trace, maidrType, calcIdx, globalIdx } of otherTraces) {
    if (!maidrType)
      continue;

    const cd = group.calcdata[calcIdx] ?? [];
    const layer = extractLayer(trace, maidrType, cd, globalIdx, xLabel, yLabel, gd);
    if (layer)
      layers.push(layer);
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Grid arrangement from axis domains
// ---------------------------------------------------------------------------

/** Tolerance when comparing axis-domain fractions (which lie in [0, 1]). */
const DOMAIN_EPS = 1e-3;

type DomainInterval = [number, number];

interface PositionedPanel extends PanelEntry {
  xDomain: DomainInterval;
  yDomain: DomainInterval;
}

/**
 * Arranges panels into a 2D grid (row-major, visual reading order) by
 * clustering their axis domains: distinct y-domain intervals become rows
 * (top first) and distinct x-domain intervals become columns (left first).
 *
 * Returns `null` when the panels do not form a grid — missing domain info,
 * overlapping domains (inset plots), or two panels sharing one cell
 * (overlaid axes) — so the caller can fall back to a flat single row.
 */
function arrangePanelsIntoGrid(
  panels: PanelEntry[],
  layout: PlotlyFullLayout,
): PositionedPanel[][] | null {
  const positioned: PositionedPanel[] = [];
  for (const panel of panels) {
    // A domain-positioned panel carries its own domain and a polar one names
    // the layout entry holding it (neither has axes to read one from);
    // everything else takes it from the axis pair it was grouped by.
    const own = panel.group.domain ?? readSubplotDomain(layout, panel.group.subplotId);
    const xDomain = own?.x ?? readAxisDomain(getAxis(layout, panel.group.xAxisId));
    const yDomain = own?.y ?? readAxisDomain(getAxis(layout, panel.group.yAxisId));
    if (!xDomain || !yDomain)
      return null;
    positioned.push({ ...panel, xDomain, yDomain });
  }

  const rowIntervals = clusterIntervals(positioned.map(panel => panel.yDomain));
  const colIntervals = clusterIntervals(positioned.map(panel => panel.xDomain));
  if (!rowIntervals || !colIntervals)
    return null;

  // Visual reading order: y-domain 0 is the BOTTOM of the plot area, so a
  // larger domain start renders higher on screen — sort rows descending
  // (top row first) and columns ascending (left column first).
  rowIntervals.sort((a, b) => b[0] - a[0]);
  colIntervals.sort((a, b) => a[0] - b[0]);

  // Validate against layout.grid when present.
  const gridConfig = layout.grid;
  if (gridConfig?.rows != null && rowIntervals.length > gridConfig.rows)
    return null;
  if (gridConfig?.columns != null && colIntervals.length > gridConfig.columns)
    return null;

  const cells: (PositionedPanel | null)[][] = rowIntervals.map(
    () => colIntervals.map(() => null),
  );
  for (const panel of positioned) {
    const row = findIntervalIndex(rowIntervals, panel.yDomain);
    const col = findIntervalIndex(colIntervals, panel.xDomain);
    if (row < 0 || col < 0 || cells[row][col])
      return null; // Two panels in one cell: overlaid axes, not a grid.
    cells[row][col] = panel;
  }

  // Compact ragged rows. A row can never end up empty because every row
  // interval came from at least one panel.
  return cells
    .map(row => row.filter((cell): cell is PositionedPanel => cell !== null))
    .filter(row => row.length > 0);
}

/**
 * Deduplicates domain intervals (within {@link DOMAIN_EPS}) into the
 * distinct grid bands. Returns `null` when two DISTINCT intervals overlap,
 * which means the panels are inset/overlaid rather than gridded.
 */
function clusterIntervals(intervals: DomainInterval[]): DomainInterval[] | null {
  const unique: DomainInterval[] = [];
  for (const interval of intervals) {
    if (findIntervalIndex(unique, interval) === -1)
      unique.push(interval);
  }
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const overlap = Math.min(unique[i][1], unique[j][1])
        - Math.max(unique[i][0], unique[j][0]);
      if (overlap > DOMAIN_EPS)
        return null;
    }
  }
  return unique;
}

function findIntervalIndex(intervals: DomainInterval[], target: DomainInterval): number {
  return intervals.findIndex(interval => intervalsEqual(interval, target));
}

function intervalsEqual(a: DomainInterval, b: DomainInterval): boolean {
  return Math.abs(a[0] - b[0]) < DOMAIN_EPS && Math.abs(a[1] - b[1]) < DOMAIN_EPS;
}

function containsValue(interval: DomainInterval, value: number): boolean {
  return value >= interval[0] - DOMAIN_EPS && value <= interval[1] + DOMAIN_EPS;
}

/**
 * Reads a trace's own paper domain, which is how plotly positions the traces
 * that have no axes. Returns `undefined` unless BOTH sides are usable — half a
 * domain cannot place a panel in a grid.
 */
function readTraceDomain(
  holder: { domain?: { x?: [number, number]; y?: [number, number] } },
): { x: DomainInterval; y: DomainInterval } | undefined {
  const x = readInterval(holder.domain?.x);
  const y = readInterval(holder.domain?.y);
  return x && y ? { x, y } : undefined;
}

/**
 * Reads a named subplot's paper domain — a polar dial, a geo map. Plotly keeps
 * it on the layout entry the traces name rather than on the traces themselves,
 * so it is resolved here rather than while they are grouped.
 */
function readSubplotDomain(
  layout: PlotlyFullLayout,
  subplotId: string | undefined,
): { x: DomainInterval; y: DomainInterval } | undefined {
  const subplot = subplotId === undefined
    ? undefined
    : (layout[subplotId] as PlotlyPolarLayout | undefined);
  return subplot ? readTraceDomain(subplot) : undefined;
}

function readAxisDomain(axis: PlotlyAxis | undefined): DomainInterval | null {
  return readInterval(axis?.domain);
}

function readInterval(domain: [number, number] | undefined): DomainInterval | null {
  if (!domain || domain.length < 2)
    return null;
  const start = Number(domain[0]);
  const end = Number(domain[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  return [start, end];
}

/**
 * Resolves an axis label, following facet-style `matches:` chains: Plotly
 * Express facets keep the title only on the matched outer axis, so inner
 * axes inherit the label from the axis they match.
 */
function resolveAxisLabel(layout: PlotlyFullLayout, axisId: string): string | undefined {
  let currentId = axisId;
  for (let hop = 0; hop < 8; hop++) {
    const axis = getAxis(layout, currentId);
    if (!axis)
      return undefined;
    const label = extractAxisLabel(axis, layout);
    if (label)
      return label;
    if (!axis.matches || axis.matches === currentId)
      return undefined;
    currentId = axis.matches;
  }
  return undefined;
}

/**
 * Applies facet/subplot titles from layout annotations as each panel's
 * first-layer title — the first layer's title is the panel's display name
 * in MAIDR's subplot summaries.
 *
 * Two annotation shapes are recognised:
 *
 * 1. Axis-domain refs (`xref: 'x2 domain'`) — hand-authored facet labels.
 *    Only annotations whose BOTH refs point at the panel's own axes are
 *    used, so labels are never attributed to the wrong panel.
 * 2. Paper refs (`xref: 'paper'` / `yref: 'paper'`) — what plotly.py emits
 *    for Plotly Express facet labels and `make_subplots`
 *    row/column/subplot titles. These carry no axis association, so they
 *    are resolved geometrically against each panel's axis domains.
 */
function applyFacetTitles(grid: PositionedPanel[][], layout: PlotlyFullLayout): void {
  const annotations = layout.annotations;
  if (!Array.isArray(annotations) || annotations.length === 0)
    return;

  const labels = new Map<PositionedPanel, string[]>();
  const addLabel = (panel: PositionedPanel, text: string): void => {
    const existing = labels.get(panel);
    if (existing) {
      existing.push(text);
    } else {
      labels.set(panel, [text]);
    }
  };

  applyDomainRefTitles(grid, annotations, addLabel);
  applyPaperRefTitles(grid, annotations, addLabel);

  for (const [panel, texts] of labels) {
    panel.subplot.layers[0].title = texts.join(', ');
  }
}

type AddLabel = (panel: PositionedPanel, text: string) => void;

/**
 * Matches annotations with axis-domain refs (`xref: 'x2 domain'`) to the
 * panel owning those axes.
 */
function applyDomainRefTitles(
  grid: PositionedPanel[][],
  annotations: PlotlyAnnotation[],
  addLabel: AddLabel,
): void {
  for (const row of grid) {
    for (const panel of row) {
      const xRef = `${panel.group.xAxisId} domain`;
      const yRef = `${panel.group.yAxisId} domain`;
      for (const annotation of annotations) {
        if (
          annotation
          && typeof annotation.text === 'string'
          && annotation.text.length > 0
          && annotation.xref === xRef
          && annotation.yref === yRef
        ) {
          addLabel(panel, annotation.text);
        }
      }
    }
  }
}

/**
 * How far above a top-row panel's y-domain end a title annotation may sit
 * (in paper units) and still be treated as that panel's title.
 */
const TITLE_BAND = 0.25;

/** A paper-ref annotation that is a candidate facet/subplot title. */
interface PaperTitle {
  text: string;
  x: number;
  y: number;
  angle: number;
}

/**
 * Extracts arrow-less paper-ref annotations with usable text and finite
 * coordinates — the shape plotly.py uses for every facet and subplot title.
 */
function collectPaperTitles(annotations: PlotlyAnnotation[]): PaperTitle[] {
  const titles: PaperTitle[] = [];
  for (const annotation of annotations) {
    if (
      !annotation
      || annotation.xref !== 'paper'
      || annotation.yref !== 'paper'
      || annotation.showarrow !== false
      || typeof annotation.text !== 'string'
      || annotation.text.length === 0
    ) {
      continue;
    }
    const x = Number(annotation.x);
    const y = Number(annotation.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
      continue;
    const angle = Number(annotation.textangle ?? 0);
    titles.push({
      text: annotation.text,
      x,
      y,
      angle: Number.isFinite(angle) ? angle : 0,
    });
  }
  return titles;
}

/**
 * Resolves plotly.py-style paper-ref titles geometrically:
 *
 * - Row titles (px `facet_row`, `make_subplots` `row_titles`): rotated 90°,
 *   at/right of the plot area, vertically inside a row's y-domain — applied
 *   to every panel in that row.
 * - Column titles (px `facet_col`, `column_titles`) and per-panel subplot
 *   titles (px `facet_col_wrap`, `subplot_titles`): both sit just above a
 *   panel's top edge, so each is attributed to the nearest panel top below
 *   it. A title above the TOP row is promoted to a whole-column title only
 *   when no lower panel in that column has its own title.
 *
 * Global x/y axis-title annotations (below or left of the plot area) match
 * no panel and are skipped naturally.
 */
function applyPaperRefTitles(
  grid: PositionedPanel[][],
  annotations: PlotlyAnnotation[],
  addLabel: AddLabel,
): void {
  const titles = collectPaperTitles(annotations);
  if (titles.length === 0)
    return;

  const panels = grid.flat();
  const maxXEnd = Math.max(...panels.map(panel => panel.xDomain[1]));
  const maxYEnd = Math.max(...panels.map(panel => panel.yDomain[1]));

  const rowMatches: { row: PositionedPanel[]; text: string }[] = [];
  const remaining: PaperTitle[] = [];
  for (const title of titles) {
    const row = Math.abs(title.angle) === 90 && title.x >= maxXEnd - DOMAIN_EPS
      ? grid.find(gridRow => containsValue(gridRow[0].yDomain, title.y))
      : undefined;
    if (row) {
      rowMatches.push({ row, text: title.text });
    } else {
      remaining.push(title);
    }
  }

  const pending: { title: PaperTitle; panel: PositionedPanel }[] = [];
  for (const title of remaining) {
    const panel = matchPanelBelowTitle(grid, title);
    if (panel)
      pending.push({ title, panel });
  }

  for (const { title, panel } of pending) {
    const isTopRow = panel.yDomain[1] >= maxYEnd - DOMAIN_EPS;
    const columnHasOwnTitles = pending.some(
      other => other.panel !== panel && intervalsEqual(other.panel.xDomain, panel.xDomain),
    );
    if (isTopRow && !columnHasOwnTitles) {
      for (const columnPanel of panels) {
        if (intervalsEqual(columnPanel.xDomain, panel.xDomain))
          addLabel(columnPanel, title.text);
      }
    } else {
      addLabel(panel, title.text);
    }
  }

  for (const { row, text } of rowMatches) {
    for (const panel of row)
      addLabel(panel, text);
  }
}

/**
 * Finds the panel whose top edge is nearest below a title annotation, with
 * the annotation horizontally inside the panel's x-domain. Rejects
 * annotations floating too far above the panel (e.g. mid-figure notes or
 * `make_subplots`' global axis titles).
 */
function matchPanelBelowTitle(
  grid: PositionedPanel[][],
  title: PaperTitle,
): PositionedPanel | null {
  let best: PositionedPanel | null = null;
  for (const row of grid) {
    for (const panel of row) {
      if (!containsValue(panel.xDomain, title.x))
        continue;
      if (panel.yDomain[1] > title.y + DOMAIN_EPS)
        continue;
      if (!best || panel.yDomain[1] > best.yDomain[1])
        best = panel;
    }
  }
  if (!best)
    return null;

  const offset = title.y - best.yDomain[1];
  return offset <= titleBandAbove(grid, best) + DOMAIN_EPS ? best : null;
}

/**
 * Vertical space above a panel in which a title annotation may sit: half
 * the gap to the row above in the same column, or a fixed band for top-row
 * panels (titles sit between the panel top and the paper edge).
 */
function titleBandAbove(grid: PositionedPanel[][], panel: PositionedPanel): number {
  let gap = Infinity;
  for (const row of grid) {
    for (const other of row) {
      if (!intervalsEqual(other.xDomain, panel.xDomain))
        continue;
      if (other.yDomain[0] > panel.yDomain[1] + DOMAIN_EPS)
        gap = Math.min(gap, other.yDomain[0] - panel.yDomain[1]);
    }
  }
  return gap === Infinity ? TITLE_BAND : gap / 2;
}

/**
 * Emits a per-panel `selector` (`g[id="axes_…"]`) carrying the panel's axis
 * pair (e.g. `x2y2`) as the id suffix. The normalizer's
 * `wrapSubplotBackgrounds` creates matching `<g>` groups around each
 * panel's background rect — wrapping the rendered `.bglayer` rect when one
 * exists, or injecting a transparent rect sized from the panel's computed
 * axis offsets when plotly drew no per-panel backgrounds at all (its
 * default styling: `paper_bgcolor === plot_bgcolor`). The axis pair in the
 * id keys the panel↔DOM association, so it stays correct even when a panel
 * is dropped for unsupported trace types. Ids are prefixed with the chart
 * id to avoid collisions between multiple charts on one page, while still
 * matching the core's `g[id^="axes_"]` detection.
 *
 * These groups also give the core real per-panel geometry, so visual
 * ordering and vertical arrow-key direction are resolved correctly for
 * multi-row grids (the grid rows are emitted top-first).
 */
function assignSubplotSelectors(grid: PanelEntry[][], maidrId: string): void {
  const tag = maidrId.replace(/[^\w-]/g, '_');
  for (const row of grid) {
    for (const panel of row) {
      const axisPair = `${panel.group.xAxisId}${panel.group.yAxisId}`;
      // A pie panel has no axis pair. It also has no background rect in the
      // `.bglayer` for the normalizer to wrap in an `axes_…` group, and the
      // normalizer pairs the ids collected here with those rects positionally
      // — so emitting one for a pie would not just point at a group that does
      // not exist, it would shift every cartesian panel onto its neighbour's.
      if (!axisPair)
        continue;
      panel.subplot.selector = `g[id="axes_${tag}_${axisPair}"]`;
    }
  }
}

// ---------------------------------------------------------------------------
// Layer extraction per trace type
// ---------------------------------------------------------------------------

function extractLayer(
  trace: PlotlyTrace,
  maidrType: TraceType,
  calcdata: PlotlyCalcData[],
  traceIndex: number,
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  const id = String(traceIndex);
  const title = trace.name;
  const selectors = generatePlotlySelectors(maidrType, traceIndex, gd);

  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = { label: xLabel };
  if (yLabel)
    axes.y = { label: yLabel };

  switch (maidrType) {
    case TraceType.SCATTER:
      return extractScatterLayer(trace, id, title, selectors, axes, gd);

    case TraceType.BAR:
      return extractBarLayer(trace, calcdata, TraceType.BAR, id, title, selectors, axes);

    // A dot plot is a bar chart drawn with dots, and MAIDR reads it as one.
    // Its calcdata is a scatter's and carries no bar size, so the marks are
    // the authored values — which is what the chart put on the axis.
    case TraceType.DOT:
      return extractBarLayer(trace, [], TraceType.DOT, id, title, selectors, axes, dotCategoryAxis(trace) === 'y');

    case TraceType.WORD_CLOUD:
      return extractWordCloudLayer(trace, id, title, selectors);

    case TraceType.CHOROPLETH:
      return extractChoroplethLayer(trace, calcdata, id, title, traceIndex, gd);

    // A funnel is a bar chart whose order means something: same points, same
    // orientation handling, and the retention between stages is derived by
    // the trace rather than carried in the payload.
    case TraceType.FUNNEL:
      return extractBarLayer(trace, calcdata, TraceType.FUNNEL, id, title, selectors, axes);

    case TraceType.WATERFALL:
      return extractWaterfallLayer(trace, calcdata, id, title, selectors, axes);

    case TraceType.ERROR_BAR:
      return extractErrorBarLayer(trace, calcdata, id, title, selectors, axes);

    case TraceType.HEATMAP:
      return extractHeatmapLayer(trace, id, title, selectors, axes, gd);

    // `selectors` is not passed on: a contour needs one per level, and which
    // levels the field actually crosses is only known once they are walked.
    case TraceType.CONTOUR:
      return extractContourLayer(trace, calcdata, id, title, axes, traceIndex, gd);

    case TraceType.HISTOGRAM:
      return extractHistogramLayer(trace, calcdata, id, title, selectors, axes, traceIndex, gd);

    case TraceType.CANDLESTICK:
      return extractCandlestickLayer(trace, id, title, selectors, axes);

    // `axes` is deliberately not passed on to any of these: they are drawn on
    // panels with no axis ids, so it is always empty, and each names its own
    // two dimensions the way the pie does.
    case TraceType.PIE:
      return extractPieLayer(trace, calcdata, id, title, selectors);

    case TraceType.SUNBURST:
    case TraceType.ICICLE:
    case TraceType.TREEMAP:
      return extractHierarchyLayer(trace, maidrType, calcdata, id, title, selectors);

    case TraceType.SANKEY:
      return extractSankeyLayer(trace, calcdata, id, title, selectors);

    case TraceType.GAUGE:
      return extractGaugeLayer(trace, id, title, selectors);

    case TraceType.PARALLEL:
      return extractParallelLayer(trace, id, title);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

function extractScatterLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  const x = trace.x;
  const y = trace.y;
  if (!x || !y)
    return null;

  const len = Math.min(x.length, y.length);
  const data: ScatterPoint[] = [];
  for (let i = 0; i < len; i++) {
    // Skip explicit null gaps up front: `Number(null)` is 0 and would slip past
    // the NaN filter as a fabricated (0, 0) point.
    if (x[i] == null || y[i] == null)
      continue;
    const xVal = Number(x[i]);
    const yVal = Number(y[i]);
    if (Number.isNaN(xVal) || Number.isNaN(yVal))
      continue;
    data.push({ x: xVal, y: yVal });
  }

  if (data.length === 0)
    return null;

  // Extract grid config from Plotly's computed axis values for grid navigation
  const layout = gd._fullLayout;
  let enhancedAxes = axes;

  if (layout) {
    const xAxisId = trace.xaxis ?? 'x';
    const yAxisId = trace.yaxis ?? 'y';

    const xGridConfig = extractAxisGridConfig(layout, xAxisId);
    const yGridConfig = extractAxisGridConfig(layout, yAxisId);

    // Only enhance axes if we have grid config for both axes
    if (xGridConfig && yGridConfig) {
      const xLabel = axes?.x?.label;
      const yLabel = axes?.y?.label;

      enhancedAxes = {
        x: xLabel
          ? { label: xLabel, ...xGridConfig }
          : xGridConfig,
        y: yLabel
          ? { label: yLabel, ...yGridConfig }
          : yGridConfig,
      };
    }
  }

  return {
    id,
    type: TraceType.SCATTER,
    title,
    selectors,
    axes: enhancedAxes,
    data,
  };
}

// ---------------------------------------------------------------------------
// Bar
// ---------------------------------------------------------------------------

/**
 * Builds one bar point, taking the value plotly actually drew from calcdata
 * and putting it on the axis the orientation calls for. Shared by the
 * single-trace and segmented bar extractors, which face the same `barnorm`
 * question and must place the value the same way.
 *
 * The value comes from `cd.s`, the bar's own size after `barnorm` has been
 * applied, so it is the percentage or fraction on screen rather than the raw
 * input number. `cd.s` is orientation-independent — plotly keeps the position
 * on `cd.p` for both vertical and horizontal bars. `cd.x`/`cd.y` are
 * deliberately not used: for stacked bars they hold the running top of the
 * stack, not the segment.
 *
 * Plotly stores the bar value on `x` for horizontal bars and on `y` for
 * vertical, which already matches AbstractBarPlot's per-orientation reading
 * (value from `point.x` when HORIZONTAL, from `point.y` otherwise). No swap is
 * needed — and the plotly x/y axes already line up with the layer axes. The
 * raw value on that same axis is the fallback, used when calcdata is
 * unavailable (a chart captured before plotly computed it) or holds a
 * non-finite size.
 */
function barPoint(
  cd: PlotlyCalcData | undefined,
  x: string | number,
  y: string | number,
  isHorizontal: boolean,
): BarPoint {
  const size = cd?.s;
  const drawn = typeof size === 'number' && Number.isFinite(size) ? size : undefined;
  return isHorizontal
    ? { x: drawn ?? x, y }
    : { x, y: drawn ?? y };
}

/**
 * Builds a bar-shaped layer: a plain bar, or a funnel, which plotly draws
 * through the same renderer and describes with the same calcdata.
 */
function extractBarLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  type: TraceType.BAR | TraceType.FUNNEL | TraceType.DOT,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
  horizontal?: boolean,
): MaidrLayer | null {
  const x = trace.x;
  const y = trace.y;
  if (!x || !y)
    return null;

  // A scatter has no `orientation`, so a dot plot says which way it lies by
  // which of its axes holds the categories.
  const isHorizontal = horizontal ?? trace.orientation === 'h';
  const len = Math.min(x.length, y.length);
  const data: BarPoint[] = [];

  for (let i = 0; i < len; i++) {
    data.push(barPoint(calcdata[i], x[i], y[i], isHorizontal));
  }

  if (data.length === 0)
    return null;

  return {
    id,
    type,
    title,
    selectors,
    axes,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    data,
  };
}

// ---------------------------------------------------------------------------
// Gantt
// ---------------------------------------------------------------------------

/**
 * The units a schedule is read in, coarsest first, with the milliseconds a
 * plotly date axis measures in.
 *
 * A date axis puts every position and every duration in milliseconds, and a
 * task announced as lasting 1,209,600,000 has not been announced. The coarsest
 * unit that still gives the shortest interval a whole number of its own is the
 * one a reader would use to describe the chart.
 */
const GANTT_UNITS: { unit: string; ms: number }[] = [
  { unit: 'days', ms: 86400000 },
  { unit: 'hours', ms: 3600000 },
  { unit: 'minutes', ms: 60000 },
  { unit: 'seconds', ms: 1000 },
];

/** One interval, before it is grouped into the lane it belongs to. */
interface GanttInterval {
  /** The lane, as the position axis names it. */
  lane: string;
  /** Where it begins, in milliseconds. */
  start: number;
  /** Where it ends, in milliseconds. */
  end: number;
  /** Which of the panel's bar-layer traces drew it, and which of its points. */
  tracePosition: number;
  pointIndex: number;
}

/**
 * Whether the panel's bar traces are a schedule rather than a bar chart.
 *
 * Plotly has no gantt trace: `plotly.express.timeline` and
 * `figure_factory.create_gantt` both emit horizontal bars whose `base` array
 * floats each one onto a date axis, with the DURATION in `x`. All three
 * conditions are required together — a horizontal bar chart with a shared
 * numeric base is a floating bar chart, not a timeline — and every bar trace
 * on the panel has to be one, since a schedule shares its lanes across the
 * traces and half a schedule cannot be laid out.
 *
 * @param barTraces - The panel's bar traces
 * @param group     - The panel they were grouped into
 * @param layout    - The resolved layout, which types the axes
 * @returns True when the panel draws intervals
 */
function isGanttPanel(
  barTraces: TraceEntry[],
  group: SubplotGroup,
  layout: PlotlyFullLayout,
): boolean {
  if (barTraces.length === 0 || getAxis(layout, group.xAxisId)?.type !== 'date')
    return false;
  return barTraces.every(
    ({ trace }) => trace.orientation === 'h' && Array.isArray(trace.base),
  );
}

/**
 * Reads one interval's ends.
 *
 * Plotly resolved both while positioning the bar: `cd.b` is the base it was
 * floated onto and `cd.s` the duration it runs for, both already converted to
 * the axis's own milliseconds. Without calcdata the authored pair is parsed
 * the way plotly's own `d2c` would, so a chart captured before it was
 * positioned still reads.
 *
 * @param cd       - The calcdata entry for this bar
 * @param base     - What the trace declared as its start
 * @param duration - What the trace declared as its length
 * @returns The two ends in milliseconds, or null when neither source resolves
 */
function ganttEnds(
  cd: PlotlyCalcData | undefined,
  base: number | string | undefined,
  duration: number | string | undefined,
): { start: number; end: number } | null {
  if (typeof cd?.b === 'number' && Number.isFinite(cd.b)
    && typeof cd?.s === 'number' && Number.isFinite(cd.s)) {
    return { start: cd.b, end: cd.b + cd.s };
  }

  const start = ganttInstant(base);
  const length = duration == null ? Number.NaN : Number(duration);
  if (start === null || !Number.isFinite(length))
    return null;
  return { start, end: start + length };
}

/**
 * Parses an authored instant into milliseconds.
 *
 * A date axis accepts both what plotly.py sends — an ISO string — and the
 * epoch milliseconds a hand-written figure may use, so both are admitted.
 *
 * @param value - The authored start of an interval
 * @returns Milliseconds, or null when the value is not an instant
 */
function ganttInstant(value: number | string | undefined): number | null {
  if (value == null)
    return null;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The unit the intervals are announced in, and the milliseconds in one of it.
 *
 * @param intervals - Every interval on the panel
 * @returns The unit, or undefined when nothing lasts a whole second
 */
function ganttUnit(intervals: GanttInterval[]): { unit: string; ms: number } | undefined {
  const shortest = shortestInterval(intervals);
  return GANTT_UNITS.find(candidate => shortest >= candidate.ms);
}

/**
 * The shortest interval on the panel, ignoring the milestones a schedule marks
 * with a zero-length bar — those would drive every unit down to milliseconds
 * while saying nothing about how long the work takes.
 *
 * @param intervals - Every interval on the panel
 * @returns Its length in milliseconds, or 0 when nothing has one
 */
function shortestInterval(intervals: GanttInterval[]): number {
  const lengths = intervals
    .map(interval => interval.end - interval.start)
    .filter(length => Number.isFinite(length) && length > 0);
  return lengths.length === 0 ? 0 : Math.min(...lengths);
}

/**
 * The lanes the schedule is drawn on, in visual order from the top.
 *
 * Taken from the axis rather than from the intervals so a lane with nothing
 * booked survives — an empty row is a real statement about a schedule, and
 * {@link GanttData} is nested to be able to make it. Plotly stacks categories
 * upwards from index 0, so the drawn order is the reverse of the declared one
 * unless the axis was reversed, which is what `plotly.express.timeline` does
 * to put the first task at the top.
 *
 * @param axis      - The position axis, when the layout has one
 * @param intervals - The intervals, for a panel whose lanes are not categories
 * @returns The lane names, top first
 */
function ganttLanes(axis: PlotlyAxis | undefined, intervals: GanttInterval[]): string[] {
  const categories = axis?._categories;
  if (categories && categories.length > 0) {
    const names = categories.map(String);
    const reversed = Array.isArray(axis?.range) && Number(axis.range[0]) > Number(axis.range[1]);
    return reversed ? names : names.reverse();
  }
  // No category axis to read: the lanes are whichever positions were drawn,
  // first seen first, and nothing is claimed about lanes that hold nothing.
  return [...new Set(intervals.map(interval => interval.lane))];
}

/**
 * Builds the schedule layer from every bar trace on the panel.
 *
 * The intervals are regrouped by lane rather than by trace, because a lane is
 * what a reader navigates: `plotly.express.timeline` splits one schedule into
 * a trace per colour, so a resource booked twice in two colours is two traces
 * to plotly and one row here.
 *
 * @param barTraces - The panel's bar traces, all of them intervals
 * @param group     - The panel they were grouped into
 * @param layout    - The resolved layout
 * @param xLabel    - The time axis's name
 * @param yLabel    - The lane axis's name
 * @returns The layer, or null when nothing resolved
 */
function extractGanttLayer(
  barTraces: TraceEntry[],
  group: SubplotGroup,
  layout: PlotlyFullLayout,
  xLabel: string | undefined,
  yLabel: string | undefined,
): MaidrLayer | null {
  const posAxis = getAxis(layout, group.yAxisId);
  const intervals: GanttInterval[] = [];

  for (const { trace, calcIdx } of barTraces) {
    const cds = group.calcdata[calcIdx] ?? [];
    const positions = trace.y ?? [];
    const bases = Array.isArray(trace.base) ? trace.base : [];
    const durations = trace.x ?? [];
    // Plotly draws a bar per calc entry whether or not it resolved, so the
    // position within the trace is what the selector counts by — dropping an
    // interval must not shift the ones after it.
    const tracePosition = barLayerPosition(group, calcIdx);

    for (let i = 0; i < positions.length; i++) {
      const ends = ganttEnds(cds[i], bases[i], durations[i]);
      const lane = resolveAxisCategory(cds[i]?.p ?? positions[i], posAxis);
      if (!ends || lane === undefined)
        continue;
      intervals.push({ lane, ...ends, tracePosition, pointIndex: i });
    }
  }

  if (intervals.length === 0)
    return null;

  const scale = ganttUnit(intervals);
  const lanes = ganttLanes(posAxis, intervals);
  const rowByLane = new Map(lanes.map((lane, row) => [lane, row]));
  const points: GanttPoint[][] = lanes.map(() => []);
  // The layer's selectors are one flat list read row by row, so each row
  // collects its own and they are joined once the intervals are placed.
  const rowSelectors: string[][] = lanes.map(() => []);
  const prefix = subplotCssPrefix(barTraces[0].trace.xaxis, barTraces[0].trace.yaxis);

  for (const interval of intervals) {
    const row = rowByLane.get(interval.lane);
    if (row === undefined)
      continue;
    points[row].push({
      x: interval.lane,
      // Divided into the announced unit so the LENGTH reads in it. The axis
      // format below turns the same number back into the date it names, so
      // both halves of an interval stay readable.
      start: interval.start / (scale?.ms ?? 1),
      end: interval.end / (scale?.ms ?? 1),
    });
    rowSelectors[row].push(
      barPointSelector(prefix, interval.tracePosition, interval.pointIndex),
    );
  }
  const selectors = rowSelectors.flat();

  // Positions are scaled milliseconds, which no reader wants read out. The
  // format takes them back to the instant they name — as a date alone for a
  // schedule measured in days, where the time of day is always midnight.
  const rendered = scale?.unit === 'days' ? 'toLocaleDateString' : 'toLocaleString';
  const axes: MaidrLayer['axes'] = {
    x: {
      ...(xLabel ? { label: xLabel } : {}),
      format: { function: `return new Date(value * ${scale?.ms ?? 1}).${rendered}();` },
    },
  };
  if (yLabel)
    axes.y = { label: yLabel };

  const data: GanttData = {
    points,
    lanes,
    ...(scale ? { unit: scale.unit } : {}),
  };

  return {
    id: String(barTraces[0].globalIdx),
    type: TraceType.GANTT,
    selectors,
    axes,
    // The lanes run down the page and the axis across it, which is what a
    // gantt's `orientation` says — the grid stays lanes-by-intervals either
    // way, and the trace uses this to name its two axes the right way round.
    orientation: Orientation.HORIZONTAL,
    data,
  };
}

/**
 * Where a trace sits among the ones plotly draws into the panel's bar layer.
 *
 * Histograms share bar's renderer and therefore its layer, so they are counted
 * too: a histogram drawn before a schedule's bars shifts every group after it.
 *
 * @param group   - The panel the traces were grouped into
 * @param calcIdx - The trace's index within that panel
 * @returns Its position among the panel's bar-layer traces
 */
function barLayerPosition(group: SubplotGroup, calcIdx: number): number {
  let position = 0;
  for (let i = 0; i < calcIdx; i++) {
    const type = group.traces[i].type;
    if (type === 'bar' || type === 'histogram')
      position++;
  }
  return position;
}

/**
 * Names a categorical coordinate.
 *
 * Plotly stores a category as its index on the axis and keeps the labels in
 * `_categories`, so a position is only a name once the axis is in hand. A
 * position that is already a string is one plotly has not indexed yet, which
 * happens before the chart is drawn.
 *
 * @param pos  - The coordinate, as an index or as the label itself
 * @param axis - The axis it is measured on
 * @returns The category name, or undefined when there is none
 */
function resolveAxisCategory(
  pos: number | string | undefined,
  axis: PlotlyAxis | undefined,
): string | undefined {
  if (typeof pos === 'string')
    return pos;
  if (pos === undefined)
    return undefined;

  const categories = axis?._categories;
  if (categories && pos >= 0 && pos < categories.length)
    return String(categories[pos]);
  return String(pos);
}

// ---------------------------------------------------------------------------
// Word cloud
// ---------------------------------------------------------------------------

/**
 * The weight behind each term of a word cloud, or null when the trace is not
 * one.
 *
 * Plotly has no word cloud. Its documented recipe is a text-mode scatter whose
 * `textfont.size` is an ARRAY — a per-term glyph size is the whole chart, and
 * it is what tells one apart from an ordinary annotated scatter.
 *
 * The weight is the honest difficulty here. The only magnitude the trace is
 * obliged to carry is the size in pixels, which many recipes set to the count
 * itself but some set to a rescaled version of it. So a real weight is taken
 * wherever the author put one — `customdata`, then a numeric `hovertext`,
 * which are the two places plotly carries a per-point number it does not draw
 * — and the glyph size stands in otherwise. The size ranks the terms
 * correctly either way, which is what the reading is walked in.
 *
 * @param trace - The resolved plotly trace
 * @returns One weight per term, or null when this is not a word cloud
 */
function wordCloudWeights(trace: PlotlyTrace): number[] | null {
  const sizes = trace.textfont?.size;
  const terms = trace.text;
  if (
    !trace.mode?.includes('text')
    || !Array.isArray(terms)
    || !Array.isArray(sizes)
  ) {
    return null;
  }

  const len = Math.min(terms.length, sizes.length);
  if (len === 0)
    return null;

  const declared = declaredWeights(trace, len);
  const weights: number[] = [];
  for (let i = 0; i < len; i++) {
    const weight = declared?.[i] ?? Number(sizes[i]);
    if (!Number.isFinite(weight))
      return null;
    weights.push(weight);
  }
  return weights;
}

/**
 * The per-term numbers the author carried alongside the glyphs, when they did.
 *
 * Taken whole or not at all: a column that is numeric for some terms and not
 * for others is not the weights, and mixing it with the glyph sizes would put
 * two different quantities on one axis.
 *
 * @param trace - The resolved plotly trace
 * @param len   - How many terms the cloud draws
 * @returns The weights, or undefined when neither carrier holds them
 */
function declaredWeights(trace: PlotlyTrace, len: number): number[] | undefined {
  for (const carrier of [trace.customdata, trace.hovertext]) {
    if (!Array.isArray(carrier) || carrier.length < len)
      continue;
    const values = carrier.slice(0, len).map(entry => Number(entry));
    if (values.every(value => Number.isFinite(value)))
      return values;
  }
  return undefined;
}

/**
 * What a word cloud calls its two dimensions. The layout carries nothing, so
 * the axes plotly gives the trace name the packing coordinates rather than the
 * chart — they are deliberately not read.
 */
const WORD_CLOUD_TERM_AXIS = 'Term';
const WORD_CLOUD_WEIGHT_AXIS = 'Weight';

function extractWordCloudLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
): MaidrLayer | null {
  const weights = wordCloudWeights(trace);
  const terms = trace.text;
  if (!weights || !Array.isArray(terms))
    return null;

  const data: WordCloudPoint[] = weights.map((weight, i) => ({
    x: String(terms[i]),
    y: weight,
  }));

  return {
    id,
    type: TraceType.WORD_CLOUD,
    title,
    selectors,
    axes: {
      x: { label: WORD_CLOUD_TERM_AXIS },
      y: { label: WORD_CLOUD_WEIGHT_AXIS },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Line (multi-series)
// ---------------------------------------------------------------------------

/** One trace of a line-shaped layer, with the values to read off it. */
interface LineTraceEntry {
  trace: PlotlyTrace;
  calcIdx: number;
  globalIdx: number;
  /**
   * Magnitudes to announce instead of the trace's own `y`, parallel to it.
   * Only a normalized stack needs this: plotly rescaled the bands it drew and
   * the authored numbers are no longer what is on the axis.
   */
  values?: number[];
}

/**
 * How a line-shaped layer is emitted: the type it announces, and — for a
 * staircase — which convention it jumps by. Absent means a plain line.
 */
interface LineVariant {
  type: TraceType;
  stepDirection?: StepDirection;
}

/**
 * Builds one line-shaped layer from every line (step, or area) trace in a
 * subplot.
 *
 * Step and area traces reuse this because their point shape is identical —
 * plotly varies only how the segments between samples are drawn and whether
 * the region under them is filled, not the samples themselves — so they
 * differ from a line here by their layer type and, for a step, the convention
 * it announces. A stacked area emits each band's OWN value, which is what
 * `AreaTrace` accumulates the running totals from.
 */
function extractMultiLineLayer(
  lineTraces: LineTraceEntry[],
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
  variant?: LineVariant,
): MaidrLayer | null {
  const data: LinePoint[][] = [];
  const legend: string[] = [];

  for (const { trace, values } of lineTraces) {
    const x = trace.x;
    const y = values ?? trace.y;
    if (!x || !y)
      continue;

    const len = Math.min(x.length, y.length);
    const series: LinePoint[] = [];
    const seriesName = trace.name ?? `Series ${data.length + 1}`;

    for (let i = 0; i < len; i++) {
      // Plotly uses `null` for line gaps (`y: [1, null, 3]`). Skip them (rather
      // than let `Number(null)` fabricate a `0` that gets announced/sonified),
      // and skip non-finite entries so they cannot poison the line's min/max.
      // Skipping keeps indices aligned with the DOM, which omits null points.
      if (y[i] == null || !Number.isFinite(Number(y[i])))
        continue;
      series.push({
        x: x[i] as number | string,
        y: Number(y[i]),
        z: seriesName,
      });
    }

    data.push(series);
    legend.push(seriesName);
  }

  if (data.length === 0)
    return null;

  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = { label: xLabel };
  if (yLabel)
    axes.y = { label: yLabel };

  const type = variant?.type ?? TraceType.LINE;

  // All line traces in the same subplot share the same unscoped selector
  // (e.g. `.subplot.xy .trace.scatter .point`), so any trace index works here.
  const selectors = generatePlotlySelectors(type, lineTraces[0].globalIdx, gd);

  return {
    id: String(lineTraces[0].globalIdx),
    type,
    title: legend.length === 1 ? legend[0] : undefined,
    selectors,
    axes,
    ...(variant?.stepDirection ? { stepDirection: variant.stepDirection } : {}),
    data,
  };
}

/**
 * The band heights plotly drew for one trace of a normalized stack.
 *
 * `groupnorm` rescales every band so the stack sums to 100 (or to 1), and the
 * axis a reader is on shows the rescaled figure. Plotly keeps each band's own
 * rescaled height on `cd.sNorm`; `cd.y` is deliberately not used, because for
 * a stacked scatter that is the RUNNING TOTAL rather than the band, and
 * feeding it back to a trace that accumulates the bands itself would count
 * every series twice.
 *
 * Stacking interleaves the positions of every trace in the group, so a trace
 * that skipped one gets a blank spliced into its calcdata (`cd.i === null`).
 * Those are not samples this trace authored — dropping them lines the rest up
 * with the trace's own arrays, and a count that still disagrees means the
 * calcdata does not describe these samples and the raw values are the honest
 * fallback.
 *
 * @param trace - The resolved plotly trace
 * @param calcdata - What plotly computed for it
 * @returns One height per authored sample, or undefined when unavailable
 */
function normalizedBandHeights(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
): number[] | undefined {
  // A horizontal stack carries its bands on x, where the layer wants its
  // positions; the raw arrays already sit the right way round for that.
  if (trace.orientation === 'h' || calcdata.length === 0) {
    return undefined;
  }

  const heights: number[] = [];
  for (const cd of calcdata) {
    if (cd.i === null)
      continue;
    if (typeof cd.sNorm !== 'number' || !Number.isFinite(cd.sNorm))
      return undefined;
    heights.push(cd.sNorm);
  }

  return heights.length === trace.y?.length ? heights : undefined;
}

// ---------------------------------------------------------------------------
// Polar (radar, polar area)
// ---------------------------------------------------------------------------

/**
 * What a polar layer calls its two dimensions.
 *
 * The radial axis can be titled and usually is, so its name is read off the
 * layout; plotly's schema has no title for the ANGULAR axis at all, so the
 * spokes are named generically — the pie's reasoning for `Label`/`Value`,
 * applied to a chart whose categories run round a circle instead.
 */
const POLAR_SPOKE_AXIS = 'Spoke';
const POLAR_VALUE_AXIS = 'Value';

/**
 * Builds one layer from every radar (or polar area) trace on a polar subplot.
 *
 * The payload is a multi-line layer's — a spoke is a column and a trace is a
 * row — because that is exactly what `RadarTrace` reads. Plotly names the two
 * coordinates `theta` and `r` rather than `x` and `y`, which is the only
 * difference from {@link extractMultiLineLayer}, and the reason this does not
 * reuse it.
 */
function extractPolarLayer(
  entries: TraceEntry[],
  type: TraceType.RADAR | TraceType.POLAR_AREA,
  group: SubplotGroup,
  layout: PlotlyFullLayout,
): MaidrLayer | null {
  const data: LinePoint[][] = [];
  const series: PolarSeries[] = [];

  for (let position = 0; position < entries.length; position++) {
    const trace = entries[position].trace;
    const theta = trace.theta;
    const r = trace.r;
    if (!theta || !r)
      continue;

    const len = Math.min(theta.length, r.length);
    const spokes: LinePoint[] = [];
    const seriesName = trace.name ?? `Series ${data.length + 1}`;
    for (let i = 0; i < len; i++) {
      // Plotly leaves a spoke off the outline where the value is missing, and
      // `Number(null)` is a finite 0 that would be drawn at the centre.
      if (r[i] == null || !Number.isFinite(Number(r[i])))
        continue;
      spokes.push({ x: theta[i], y: Number(r[i]), z: seriesName });
    }

    if (spokes.length === 0)
      continue;
    data.push(spokes);
    series.push({ trace, position });
  }

  if (data.length === 0)
    return null;

  const subplotId = group.subplotId ?? 'polar';
  const polar = layout[subplotId] as PlotlyPolarLayout | undefined;
  const radialLabel = extractAxisLabel(polar?.radialaxis, layout);

  return {
    id: String(entries[0].globalIdx),
    type,
    title: series.length === 1 ? series[0].trace.name : undefined,
    selectors: polarSeriesSelectors(series, subplotId, type === TraceType.POLAR_AREA),
    axes: {
      x: { label: POLAR_SPOKE_AXIS },
      y: { label: radialLabel ?? POLAR_VALUE_AXIS },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Box (multi-trace)
// ---------------------------------------------------------------------------

/**
 * Combines multiple plotly box traces into a single MAIDR box layer with
 * structured `BoxSelector[]` for per-section highlighting.
 *
 * Each plotly box trace maps to one box in the output array. The CSS
 * selectors follow the py-maidr pattern:
 * - box parts: `{prefix}.boxlayer > g:nth-child(N) > path.box`
 * - outliers: `{prefix}.boxlayer > g:nth-child(N) .points > :nth-child(...)`
 */
function extractMultiBoxLayer(
  boxTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[],
  group: SubplotGroup,
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  const data: BoxPoint[] = [];
  const boxSelectors: BoxSelector[] = [];

  // Derive subplot prefix from first trace's axis refs.
  const firstTrace = gd._fullData?.[boxTraces[0].globalIdx];
  const prefix = subplotCssPrefix(firstTrace?.xaxis, firstTrace?.yaxis);

  for (let boxIdx = 0; boxIdx < boxTraces.length; boxIdx++) {
    const { trace, calcIdx, globalIdx } = boxTraces[boxIdx];
    const cd = group.calcdata[calcIdx] ?? [];
    // Counted across the panel's boxlayer groups rather than across these
    // boxes. A candlestick is drawn through the same renderer and takes a
    // group of its own, so one declared first shifts every box after it — and
    // a box plotly did not draw takes no group at all.
    const nthChild = boxLayerNthChild(gd, globalIdx);

    // Extract data for this box.
    const boxPoint = extractSingleBoxData(trace, cd.length > 0 ? cd[0] : undefined);
    if (!boxPoint)
      continue;

    data.push(boxPoint);

    // Build structured selector for this box.
    const boxSel = `${prefix}.boxlayer > g:nth-child(${nthChild}) > path.box`;
    const pointsBase = `${prefix}.boxlayer > g:nth-child(${nthChild}) .points`;

    const lowerCount = boxPoint.lowerOutliers.length;
    const upperCount = boxPoint.upperOutliers.length;

    // The rendered `.points` group holds `pts2` in ascending order. With
    // `boxpoints: 'all'` (or 'suspectedoutliers') it also contains inliers, so
    // upper outliers are the LAST `upperCount` children — not the ones right
    // after the lower outliers. Index them from the end of the rendered list.
    // (With `boxpoints: 'outliers'` pts2 holds only outliers, so this reduces
    // to the old `lowerCount + 1` start.)
    const renderedCount = (cd.length > 0 ? cd[0]?.pts2?.length : undefined)
      ?? (lowerCount + upperCount);

    // Build individual selectors for each outlier point (compatible with all browsers).
    const lowerOutliersSel: string[] = [];
    for (let oi = 1; oi <= lowerCount; oi++) {
      lowerOutliersSel.push(`${pointsBase} > path.point:nth-child(${oi})`);
    }
    const upperOutliersSel: string[] = [];
    for (let oi = renderedCount - upperCount + 1; oi <= renderedCount; oi++) {
      upperOutliersSel.push(`${pointsBase} > path.point:nth-child(${oi})`);
    }

    boxSelectors.push({
      lowerOutliers: lowerOutliersSel,
      min: boxSel,
      iq: boxSel,
      q2: boxSel,
      max: boxSel,
      q1: boxSel,
      q3: boxSel,
      upperOutliers: upperOutliersSel,
    });
  }

  if (data.length === 0)
    return null;

  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = { label: xLabel };
  if (yLabel)
    axes.y = { label: yLabel };

  return {
    id: String(boxTraces[0].globalIdx),
    type: TraceType.BOX,
    selectors: boxSelectors,
    axes,
    data,
  };
}

/**
 * Extracts a single {@link BoxPoint} from a plotly trace and its calcdata.
 */
function extractSingleBoxData(
  trace: PlotlyTrace,
  cd: PlotlyCalcData | undefined,
): BoxPoint | null {
  // Use trace.name as the category label (e.g. "Setosa", "Versicolor").
  const fill = trace.name ?? '';

  if (cd) {
    const lowerOutliers: number[] = [];
    const upperOutliers: number[] = [];

    if (cd.pts2) {
      const lf = cd.lf ?? cd.min ?? -Infinity;
      const uf = cd.uf ?? cd.max ?? Infinity;
      for (const pt of cd.pts2) {
        const v = pt.v ?? pt.y ?? 0;
        if (v < lf)
          lowerOutliers.push(v);
        else if (v > uf)
          upperOutliers.push(v);
      }
      // Plotly renders outliers in ascending order — sort to match DOM nth-child indexing.
      lowerOutliers.sort((a, b) => a - b);
      upperOutliers.sort((a, b) => a - b);
    }

    return {
      z: fill,
      lowerOutliers,
      min: cd.min ?? cd.lf ?? 0,
      q1: cd.q1 ?? 0,
      q2: cd.med ?? 0,
      q3: cd.q3 ?? 0,
      max: cd.max ?? cd.uf ?? 0,
      upperOutliers,
      mean: cd.mean,
    };
  }

  if (trace.q1 && trace.median && trace.q3) {
    return {
      z: fill,
      lowerOutliers: [],
      min: trace.lowerfence?.[0] ?? trace.q1[0],
      q1: trace.q1[0],
      q2: trace.median[0],
      q3: trace.q3[0],
      max: trace.upperfence?.[0] ?? trace.q3[0],
      upperOutliers: [],
      mean: trace.mean?.[0],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Violin
// ---------------------------------------------------------------------------

/** One violin — a single position within a plotly violin trace. */
interface ViolinEntry {
  /** Category label announced for this violin. */
  label: string;
  /** The calcdata entry plotly computed for it. */
  cd: PlotlyCalcData;
  /** Centre of the violin on the position axis, in plot-area pixels. */
  posCenterPx: number | undefined;
  /** Selector for the KDE outline `path.violin`. */
  kdeSelector: string;
  /** Selector for the inner box `path.box`, which matches only if drawn. */
  boxSelector: string;
  /** Whether this violin's trace draws that inner box. */
  hasBox: boolean;
  /** Selector for the mean line, when plotly draws one. */
  meanSelector: string | null;
}

/**
 * Builds the `violin_box` + `violin_kde` layer pair for a subplot's violin
 * traces.
 *
 * Plotly has already computed both halves: `cd.density` holds the KDE samples
 * and the quartiles sit on the same calcdata entry, so nothing is recomputed
 * here. The box layer comes first because MAIDR shows a subplot's first layer
 * on entry, and the summary is the better starting point.
 */
function extractViolinLayers(
  violinTraces: TraceEntry[],
  group: SubplotGroup,
  layout: PlotlyFullLayout,
  xLabel: string | undefined,
  yLabel: string | undefined,
): MaidrLayer[] {
  const isHorizontal = violinTraces[0].trace.orientation === 'h';
  const posAxis = getAxis(layout, isHorizontal ? group.yAxisId : group.xAxisId);
  const valueAxis = getAxis(layout, isHorizontal ? group.xAxisId : group.yAxisId);

  const violins = collectViolins(violinTraces, group, posAxis);
  if (violins.length === 0)
    return [];

  // The core reverses the rows of a horizontal violin plot into visual order,
  // so emit them reversed to keep plotly's own bottom-to-top order afterwards.
  if (isHorizontal)
    violins.reverse();

  const id = String(violinTraces[0].globalIdx);
  const orientation = isHorizontal ? Orientation.HORIZONTAL : Orientation.VERTICAL;

  return [
    buildViolinBoxLayer(violins, `${id}-box`, orientation, xLabel, yLabel),
    buildViolinKdeLayer(violins, `${id}-kde`, orientation, isHorizontal, valueAxis, xLabel, yLabel),
  ];
}

/**
 * Whether the subplot's violins are plotly's ridgeline.
 *
 * A ridgeline is drawn by halving the curves — `side: 'positive'` — and
 * widening them so they overlap, which is plotly's own documented recipe and
 * the only thing on the trace that distinguishes one. Every violin has to be
 * halved: a chart mixing halved and whole violins is comparing two things and
 * is not a ridgeline.
 *
 * @param violinTraces - The subplot's violin traces
 * @returns True when the panel is a ridgeline
 */
function isRidgeline(violinTraces: TraceEntry[]): boolean {
  return violinTraces.every(({ trace }) => trace.side === 'positive');
}

/**
 * What a ridgeline layer calls its dimensions.
 *
 * `RidgelineTrace` announces the sample's place on the value axis against the
 * layer's x and the density against its z, so the value axis's own name goes
 * on x whichever way plotly drew the curves. Plotly titles no density axis —
 * the offset baseline is not one — so it is named for what it is.
 */
const RIDGELINE_DENSITY_AXIS = 'Density';

/**
 * Builds the ridgeline layer from the subplot's halved violins.
 *
 * The payload is the KDE layer's — plotly computed the same `cd.density`
 * samples either way — and what differs is that a ridgeline is ONE layer: the
 * recipe draws no inner box, so the quartile summary the violin pair opens
 * with would describe marks that are not on the chart.
 *
 * Curves are emitted top first. `RidgelineTrace` reverses nothing, and plotly
 * stacks its categories upwards from the bottom of the position axis, so a
 * horizontal ridgeline's own order is the reverse of the reading one.
 */
function extractRidgelineLayer(
  violinTraces: TraceEntry[],
  group: SubplotGroup,
  layout: PlotlyFullLayout,
  xLabel: string | undefined,
  yLabel: string | undefined,
): MaidrLayer | null {
  const isHorizontal = violinTraces[0].trace.orientation === 'h';
  const posAxis = getAxis(layout, isHorizontal ? group.yAxisId : group.xAxisId);

  const violins = collectViolins(violinTraces, group, posAxis);
  if (violins.length === 0)
    return null;
  if (isHorizontal)
    violins.reverse();

  const data: ViolinKdePoint[][] = violins.map(({ label, cd }) =>
    (cd.density ?? []).map(sample => ({ x: label, y: sample.t, density: sample.v })),
  );

  // The value axis is plotly's x on a horizontal ridgeline, which is where the
  // trace reads it from; a vertical one has the two exchanged.
  const axes: MaidrLayer['axes'] = {};
  const valueLabel = isHorizontal ? xLabel : yLabel;
  if (valueLabel)
    axes.x = { label: valueLabel };
  axes.z = { label: RIDGELINE_DENSITY_AXIS };

  return {
    id: `${violinTraces[0].globalIdx}-ridgeline`,
    type: TraceType.RIDGELINE,
    selectors: violins.map(violin => violin.kdeSelector),
    axes,
    data,
  };
}

/**
 * Flattens the subplot's violin traces into one violin per calcdata entry,
 * in the order plotly renders them, and builds each one's selectors.
 *
 * A trace holds several violins when its categories come from a `x`/`y`
 * array, and plotly draws them as siblings inside the trace's group:
 * every `path.violin` first, then every `path.box`, then every `path.mean`.
 */
function collectViolins(
  violinTraces: TraceEntry[],
  group: SubplotGroup,
  posAxis: PlotlyAxis | undefined,
): ViolinEntry[] {
  const violins: ViolinEntry[] = [];

  // Plotly drops the group of a trace it drew nothing for, so only traces that
  // render advance the `nth-child` index.
  let renderedTraces = 0;

  for (const { trace, calcIdx } of violinTraces) {
    const cds = group.calcdata[calcIdx] ?? [];
    if (!cds.some(cd => cd.density?.length))
      continue;

    renderedTraces += 1;
    const traceGroup = `${subplotCssPrefix(trace.xaxis, trace.yaxis)}.violinlayer > g:nth-child(${renderedTraces})`;
    const count = cds.length;
    const hasBox = trace.box?.visible === true;
    const hasMean = trace.meanline?.visible === true;

    for (let i = 0; i < count; i++) {
      const cd = cds[i];
      // A position without a computed density would become a violin of
      // zeroes. Skipping it leaves the others' `nth-child` indices alone,
      // since plotly renders an element per calc entry either way.
      if (!cd.density?.length)
        continue;

      violins.push({
        label: resolveViolinLabel(trace, cd, posAxis, count),
        cd,
        posCenterPx: resolveViolinCenter(cd, cds[0].t?.bPos, posAxis),
        kdeSelector: `${traceGroup} > path.violin:nth-child(${i + 1})`,
        // Written whether or not this trace draws the box: the position it
        // would occupy holds no `path.box` otherwise, so the selector simply
        // finds nothing and leaves the violins that do have one alone.
        boxSelector: `${traceGroup} > path.box:nth-child(${count + i + 1})`,
        hasBox,
        // Plotly renders the mean inside the box as `path.mean`, and as
        // `path.meanline` when there is no box to draw it in.
        meanSelector: hasMean
          ? (hasBox
              ? `${traceGroup} > path.mean:nth-child(${2 * count + i + 1})`
              : `${traceGroup} > path.meanline:nth-child(${count + i + 1})`)
          : null,
      });
    }
  }

  return violins;
}

/**
 * Names a violin after its category, falling back to the trace name.
 *
 * A trace that draws a single violin is a group of its own — plotly even
 * derives the category from `trace.name` — so the trace name is the label
 * there. A trace that draws several is one series across categories, and both
 * parts are needed to tell its violins apart.
 */
function resolveViolinLabel(
  trace: PlotlyTrace,
  cd: PlotlyCalcData,
  posAxis: PlotlyAxis | undefined,
  violinsInTrace: number,
): string {
  const category = resolveAxisCategory(cd.pos, posAxis);
  if (violinsInTrace > 1 && category) {
    return trace.name ? `${trace.name}, ${category}` : category;
  }
  return trace.name ?? category ?? '';
}

/**
 * Resolves the violin's centre on the position axis, in the plot-area pixel
 * space its `path.violin` is drawn in. Plotly stores it while drawing;
 * `bPos` — the offset that separates grouped violins — reproduces it
 * otherwise.
 */
function resolveViolinCenter(
  cd: PlotlyCalcData,
  bPos: number | undefined,
  posAxis: PlotlyAxis | undefined,
): number | undefined {
  if (typeof cd.posCenterPx === 'number')
    return cd.posCenterPx;
  if (typeof cd.pos !== 'number' || !posAxis?.c2p)
    return undefined;
  return posAxis.c2p(cd.pos + (bPos ?? 0));
}

/**
 * Builds the `violin_box` layer: the quartile summary of every violin.
 *
 * Selectors are emitted only when plotly draws the inner box for all of them —
 * a violin without one has no element to highlight, and the statistics stay
 * navigable regardless.
 */
function buildViolinBoxLayer(
  violins: ViolinEntry[],
  id: string,
  orientation: Orientation,
  xLabel: string | undefined,
  yLabel: string | undefined,
): MaidrLayer {
  const data: BoxPoint[] = violins.map(({ label, cd }) => ({
    z: label,
    // Violin box layers have no outlier sections — the KDE curve covers the
    // tails of the distribution.
    lowerOutliers: [],
    min: cd.min ?? cd.lf ?? 0,
    q1: cd.q1 ?? 0,
    q2: cd.med ?? 0,
    q3: cd.q3 ?? 0,
    max: cd.max ?? cd.uf ?? 0,
    upperOutliers: [],
    ...(cd.mean !== undefined ? { mean: cd.mean } : {}),
  }));

  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = { label: xLabel };
  if (yLabel)
    axes.y = { label: yLabel };

  const selectors = buildViolinBoxSelectors(violins);

  return {
    id,
    type: TraceType.VIOLIN_BOX,
    orientation,
    ...(selectors ? { selectors } : {}),
    axes,
    // One list of sections serves every violin here, so a mean line on any of
    // them makes the mean navigable on all — it is a statistic each of them
    // has. Only the violins drawn with one carry a selector to highlight.
    violinOptions: { showMean: violins.some(violin => violin.meanSelector !== null) },
    data,
  };
}

/**
 * Builds one {@link BoxSelector} per violin, or `undefined` when the chart
 * draws no inner box at all — there is nothing to highlight then, and the core
 * skips highlighting rather than tracking elements that do not exist.
 *
 * A chart that draws some of them still gets a selector per violin, so the
 * ones with a box keep their highlight and the rest match nothing.
 */
function buildViolinBoxSelectors(violins: ViolinEntry[]): BoxSelector[] | undefined {
  if (!violins.some(violin => violin.hasBox))
    return undefined;

  return violins.map(violin => ({
    lowerOutliers: [],
    // Plotly draws the whole box — whiskers, quartile box and median — as a
    // single path, so every section highlights the same element.
    min: violin.boxSelector,
    iq: violin.boxSelector,
    q2: violin.boxSelector,
    max: violin.boxSelector,
    upperOutliers: [],
    ...(violin.meanSelector ? { mean: violin.meanSelector } : {}),
  }));
}

/**
 * Builds the `violin_kde` layer from plotly's density samples, ordered from
 * the bottom of each curve upwards.
 *
 * Highlight circles are appended next to the `path.violin` element, which
 * plotly draws in plot-area coordinates — the same space `c2p` returns — so
 * the centre line of the violin locates each point.
 */
function buildViolinKdeLayer(
  violins: ViolinEntry[],
  id: string,
  orientation: Orientation,
  isHorizontal: boolean,
  valueAxis: PlotlyAxis | undefined,
  xLabel: string | undefined,
  yLabel: string | undefined,
): MaidrLayer {
  const data: ViolinKdePoint[][] = violins.map(({ label, cd, posCenterPx }) =>
    (cd.density ?? []).map((sample) => {
      const point: ViolinKdePoint = { x: label, y: sample.t, density: sample.v };

      const valuePx = valueAxis?.c2p?.(sample.t);
      if (valuePx !== undefined && posCenterPx !== undefined) {
        point.svg_x = isHorizontal ? valuePx : posCenterPx;
        point.svg_y = isHorizontal ? posCenterPx : valuePx;
      }

      return point;
    }),
  );

  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = { label: xLabel };
  if (yLabel)
    axes.y = { label: yLabel };

  return {
    id,
    type: TraceType.VIOLIN_KDE,
    orientation,
    selectors: violins.map(violin => violin.kdeSelector),
    axes,
    data,
  };
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

function extractHeatmapLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  // A heatmap's `z` is the grid of cells. The same attribute carries a flat
  // column on a choropleth, which is a different trace type and a different
  // extractor — so a grid is what it is not being one.
  const grid = Array.isArray(trace.z?.[0]) ? (trace.z as number[][]) : undefined;
  if (!grid || grid.length === 0)
    return null;

  const numCols = grid[0]?.length ?? 0;
  const numRows = grid.length;
  if (numCols === 0)
    return null;

  // Ensure labels match z dimensions (trim if Plotly provides extras).
  const xLabels = trace.x ? trace.x.slice(0, numCols).map(String) : grid[0].map((_, i) => String(i));
  const yLabels = trace.y ? trace.y.slice(0, numRows).map(String) : grid.map((_, i) => String(i));

  const data: HeatmapData = {
    x: xLabels,
    y: yLabels,
    points: grid,
  };

  // Set the z axis label for z-values from the colorbar title, or default.
  const fillLabel = extractColorbarTitle(trace, gd._fullLayout ?? gd.layout) ?? 'Value';
  const heatmapAxes: MaidrLayer['axes'] = { ...axes, z: { label: fillLabel } };

  return {
    id,
    type: TraceType.HEATMAP,
    title,
    selectors,
    axes: heatmapAxes,
    data,
  };
}

/**
 * Extracts the colorbar title from a plotly trace, if the author gave one.
 */
function extractColorbarTitle(trace: PlotlyTrace, layout: PlotlyLayout | undefined): string | undefined {
  return extractGivenTitle(trace.colorbar?.title, layout);
}

// ---------------------------------------------------------------------------
// Contour
// ---------------------------------------------------------------------------

/**
 * The scalar field a contour trace was drawn from.
 *
 * The grid and the coordinates it is indexed by, in DATA units — never pixels.
 * Plotly draws the curves by converting these through the axes, and reading
 * the drawn geometry back would announce every vertex's position on the page.
 */
interface ContourField {
  /** Magnitudes, row-major: `z[row][col]`. */
  z: number[][];
  /** Each column's coordinate. */
  x: number[];
  /** Each row's coordinate. */
  y: number[];
}

/** One vertex of an iso-value curve, in data units. */
interface ContourVertex {
  x: number;
  y: number;
}

/**
 * How many levels a ladder may hold before it is refused.
 *
 * Every level costs a walk over the whole grid, and a chart that asks for
 * thousands is an authoring mistake — plotly's own `ncontours` defaults to
 * 15 — so the ceiling is high enough never to be met by a real chart and low
 * enough that a bad `size` cannot hang the page.
 */
const MAX_CONTOUR_LEVELS = 1000;

/** Trims binary floating-point noise from an interpolated coordinate. */
function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Builds a contour layer: one iso-value curve per level, walked out of the
 * field itself.
 *
 * Plotly computes its curves at draw time and keeps none of them — `calcdata`
 * holds the grid and nothing else — so the curves are recomputed here by
 * marching squares over that grid, at the levels the trace states. The
 * alternative, reading the rendered `d` attributes back through the axes,
 * would hand every vertex to smoothing and to whichever points plotly merged
 * for being too close together.
 *
 * @param trace      - The resolved plotly trace
 * @param calcdata   - Its calculated data, which is where a binned grid lives
 * @param id         - The layer id
 * @param title      - The trace name, when it has one
 * @param axes       - The panel's axis labels
 * @param traceIndex - The trace's index in `_fullData`, for the selectors
 * @param gd         - The plotly graph div
 * @returns The layer, or null when the chart states no levels to walk
 */
function extractContourLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  axes: MaidrLayer['axes'],
  traceIndex: number,
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  // A constraint contour draws the boundary of a region that satisfies an
  // inequality, not a ladder of iso-values. Its `start` and `end` are the
  // ends of that interval, so walking them as levels would announce two
  // curves the chart does not draw.
  if (trace.contours?.type === 'constraint') {
    console.warn(
      '[maidr] Plotly contour draws a constraint region rather than iso-value '
      + 'curves. Skipping.',
    );
    return null;
  }

  const field = contourField(trace, calcdata);
  if (!field) {
    console.warn('[maidr] Plotly contour has no grid to read. Skipping.');
    return null;
  }

  const levels = contourLevels(trace);
  if (!levels) {
    console.warn('[maidr] Plotly contour states no levels to read. Skipping.');
    return null;
  }

  // A level the field never reaches is drawn as an empty group rather than
  // skipped, so the group's position is the level's place in the ladder and
  // not the number of curves before it — which is what the selectors count by.
  const data: ContourPoint[][] = [];
  const levelIndices: number[] = [];
  for (const [index, level] of levels.entries()) {
    const vertices = isoCurves(field, level).flat();
    if (vertices.length === 0)
      continue;
    data.push(vertices.map(vertex => ({ x: vertex.x, y: vertex.y, level })));
    levelIndices.push(index);
  }

  if (data.length === 0) {
    console.warn('[maidr] Plotly contour crosses none of its levels. Skipping.');
    return null;
  }

  // The level is announced on the field's own axis, so it takes the colorbar
  // title when the author gave one. Without one the axis is left unnamed and
  // the trace says "Level", which is what the number is.
  const fieldLabel = extractColorbarTitle(trace, gd._fullLayout ?? gd.layout);
  const contourAxes: MaidrLayer['axes'] = fieldLabel
    ? { ...axes, z: { label: fieldLabel } }
    : axes;

  return {
    id,
    type: TraceType.CONTOUR,
    title,
    selectors: contourLevelSelectors(gd, traceIndex, levelIndices),
    axes: contourAxes,
    data,
  };
}

/**
 * The grid a contour was drawn from, with the coordinates it is indexed by.
 *
 * Calcdata first: it is where a `histogram2dcontour`'s binned grid lives at
 * all, and where a `contour`'s grid has already been trimmed to the columns
 * and rows plotly kept. The trace's own arrays stand in for a chart captured
 * before plotly computed it.
 *
 * @param trace    - The resolved plotly trace
 * @param calcdata - Its calculated data
 * @returns The field, or null when there is no usable grid
 */
function contourField(trace: PlotlyTrace, calcdata: PlotlyCalcData[]): ContourField | null {
  const z = numberGrid(calcdata[0]?.z) ?? numberGrid(trace.z);
  if (!z)
    return null;

  const rows = z.length;
  const cols = z[0].length;
  // One cell is the smallest thing a curve can cross.
  if (rows < 2 || cols < 2)
    return null;

  return {
    z,
    x: gridCoordinates(calcdata[0]?.x, trace.x, cols),
    y: gridCoordinates(calcdata[0]?.y, trace.y, rows),
  };
}

/**
 * Narrows a value to a rectangular grid of magnitudes.
 *
 * A choropleth carries a flat column on the same attribute, so being a grid
 * is what a row of rows is. Cells that are not finite are kept as `NaN` and
 * skipped later, since a hole in the field is not a reason to drop the chart.
 *
 * @param value - Whatever `z` held
 * @returns The grid, or null when the value is not one
 */
function numberGrid(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length === 0 || !Array.isArray(value[0]))
    return null;

  const width = (value[0] as unknown[]).length;
  if (width === 0)
    return null;

  const grid: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < width)
      return null;
    grid.push(row.slice(0, width).map(cell => Number(cell)));
  }
  return grid;
}

/**
 * The coordinate of each column or row of a grid.
 *
 * Plotly's own calculated array is taken first, then the authored one, and
 * failing both the indices — which is what plotly itself draws a grid at when
 * the author names no coordinates, so it is the chart's own reading rather
 * than a stand-in for one.
 *
 * @param calculated - What plotly's calc entry held for the axis
 * @param authored   - What the trace declared for it
 * @param length     - How many coordinates the grid needs
 * @returns One coordinate per column or row
 */
function gridCoordinates(
  calculated: number | number[] | undefined,
  authored: (number | string)[] | undefined,
  length: number,
): number[] {
  for (const candidate of [calculated, authored]) {
    if (!Array.isArray(candidate) || candidate.length < length)
      continue;
    const values = candidate.slice(0, length).map(Number);
    if (values.every(value => Number.isFinite(value)))
      return values;
  }
  return Array.from({ length }, (_, index) => index);
}

/**
 * The ladder of levels a contour draws its curves at.
 *
 * Plotly resolves `start`, `end` and `size` during calc — including for a
 * trace that left `autocontour` on — so the ladder is read off the chart
 * rather than derived from the grid. Guessing it would announce curves at
 * values the chart never drew one at.
 *
 * @param trace - The resolved plotly trace
 * @returns The levels in ascending order, or null when the trace states none
 */
function contourLevels(trace: PlotlyTrace): number[] | null {
  const { start, end, size } = trace.contours ?? {};
  if (
    typeof start !== 'number' || !Number.isFinite(start)
    || typeof end !== 'number' || !Number.isFinite(end)
    || typeof size !== 'number' || !Number.isFinite(size) || size <= 0
  ) {
    return null;
  }

  // The tolerance is plotly's own: it walks to `end` plus a millionth of a
  // step, so a ladder whose last level lands exactly on `end` keeps it
  // instead of losing it to accumulated floating-point error.
  const count = Math.floor((end - start) / size + 1e-6) + 1;
  if (count < 1 || count > MAX_CONTOUR_LEVELS)
    return null;

  return Array.from({ length: count }, (_, index) =>
    withoutFloatNoise(start + index * size));
}

/**
 * Walks one level of the field, by marching squares.
 *
 * Every cell the level crosses contributes one or two segments between the
 * points where it crosses the cell's edges; the segments are then chained
 * into curves. A closed curve repeats its first vertex at the end, which is
 * how the shape says it closed.
 *
 * The two ambiguous cells — opposite corners on one side of the level — are
 * resolved by the average of the four corners, the reading that keeps the
 * side the middle belongs to connected.
 *
 * @param field - The grid and its coordinates
 * @param level - The value to walk
 * @returns One vertex list per curve, disjoint curves in the order found
 */
function isoCurves(field: ContourField, level: number): ContourVertex[][] {
  const segments = crossingSegments(field, level);
  return chainSegments(segments)
    .map(chain => chain.map(edge => edgeVertex(field, edge, level)));
}

/**
 * Identifies a grid edge, so that the two cells sharing one name the same
 * crossing.
 *
 * Chaining on identity rather than on coordinates is what makes it exact: a
 * crossing computed twice from the same two corners can differ in its last
 * bit depending on which way the interpolation ran, and two curves that
 * should meet would then not.
 *
 * The low bit says which way the edge runs — 0 towards the next column, 1
 * towards the next row — and the rest is the grid position it starts at.
 */
function horizontalEdge(cols: number, row: number, col: number): number {
  return (row * cols + col) * 2;
}

function verticalEdge(cols: number, row: number, col: number): number {
  return (row * cols + col) * 2 + 1;
}

/**
 * Every segment the level draws through the grid, as pairs of the edges it
 * crosses.
 *
 * @param field - The grid and its coordinates
 * @param level - The value being walked
 * @returns The segments, in row-major cell order
 */
function crossingSegments(field: ContourField, level: number): [number, number][] {
  const { z } = field;
  const rows = z.length;
  const cols = z[0].length;
  const segments: [number, number][] = [];

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const bottomLeft = z[row][col];
      const bottomRight = z[row][col + 1];
      const topRight = z[row + 1][col + 1];
      const topLeft = z[row + 1][col];
      // A hole in the field is a cell with no crossing rather than a reason
      // to stop: the rest of the curve is still the chart's own.
      if (
        !Number.isFinite(bottomLeft) || !Number.isFinite(bottomRight)
        || !Number.isFinite(topRight) || !Number.isFinite(topLeft)
      ) {
        continue;
      }

      const corners = (bottomLeft >= level ? 1 : 0)
        | (bottomRight >= level ? 2 : 0)
        | (topRight >= level ? 4 : 0)
        | (topLeft >= level ? 8 : 0);
      if (corners === 0 || corners === 15)
        continue;

      const bottom = horizontalEdge(cols, row, col);
      const top = horizontalEdge(cols, row + 1, col);
      const left = verticalEdge(cols, row, col);
      const right = verticalEdge(cols, row, col + 1);

      // The two saddles: the middle decides which pair of corners the curve
      // wraps, and getting it backwards joins two curves that never meet.
      if (corners === 5 || corners === 10) {
        const middleIsHigh
          = (bottomLeft + bottomRight + topRight + topLeft) / 4 >= level;
        // The curve wraps whichever pair of corners the middle does NOT join:
        // with the bottom-left and top-right corners high (case 5), a high
        // middle joins them and leaves the other two wrapped, and a low
        // middle joins the other two and leaves these wrapped.
        if ((corners === 5) === middleIsHigh) {
          // Wrapped separately: the bottom-right corner and the top-left one.
          segments.push([bottom, right], [left, top]);
        } else {
          // Wrapped separately: the bottom-left corner and the top-right one.
          segments.push([left, bottom], [right, top]);
        }
        continue;
      }

      switch (corners) {
        case 1:
        case 14:
          segments.push([left, bottom]);
          break;
        case 2:
        case 13:
          segments.push([bottom, right]);
          break;
        case 3:
        case 12:
          segments.push([left, right]);
          break;
        case 4:
        case 11:
          segments.push([right, top]);
          break;
        case 6:
        case 9:
          segments.push([bottom, top]);
          break;
        case 7:
        case 8:
          segments.push([left, top]);
          break;
      }
    }
  }

  return segments;
}

/**
 * Chains segments into curves, following each one end to end.
 *
 * An edge is shared by at most two cells and each contributes at most one
 * segment to it, so a curve never has a choice about where to go next. A
 * curve that returns to where it started repeats that edge and stops; one
 * that runs off the grid is followed the other way too, so an open curve
 * comes back whole rather than as the two halves either side of wherever the
 * walk happened to begin.
 *
 * @param segments - The level's segments, as pairs of edges
 * @returns One edge list per curve
 */
function chainSegments(segments: readonly [number, number][]): number[][] {
  const byEdge = new Map<number, number[]>();
  segments.forEach(([from, to], index) => {
    for (const edge of [from, to]) {
      const holders = byEdge.get(edge);
      if (holders) {
        holders.push(index);
      } else {
        byEdge.set(edge, [index]);
      }
    }
  });

  const used = Array.from({ length: segments.length }, () => false);
  const curves: number[][] = [];

  for (let start = 0; start < segments.length; start++) {
    if (used[start])
      continue;
    used[start] = true;

    const curve = [segments[start][0], segments[start][1]];
    if (!extendCurve(curve, segments, byEdge, used)) {
      curve.reverse();
      extendCurve(curve, segments, byEdge, used);
      curve.reverse();
    }
    curves.push(curve);
  }

  return curves;
}

/**
 * Follows a curve forward from its last edge for as long as it goes.
 *
 * @param curve    - The edges so far, appended to in place
 * @param segments - The level's segments
 * @param byEdge   - Which segments touch each edge
 * @param used     - Which segments have been walked, marked in place
 * @returns True when the curve closed on itself
 */
function extendCurve(
  curve: number[],
  segments: readonly [number, number][],
  byEdge: ReadonlyMap<number, number[]>,
  used: boolean[],
): boolean {
  for (;;) {
    const end = curve[curve.length - 1];
    const next = byEdge.get(end)?.find(index => !used[index]);
    if (next === undefined)
      return false;

    used[next] = true;
    const [from, to] = segments[next];
    const onward = from === end ? to : from;
    curve.push(onward);
    if (onward === curve[0])
      return true;
  }
}

/**
 * Where the level crosses one grid edge, in data units.
 *
 * Linear between the two corners, which is the same reading the marching
 * squares made when it decided the edge was crossed at all.
 *
 * @param field - The grid and its coordinates
 * @param edge  - The edge identifier
 * @param level - The value being walked
 * @returns The crossing point
 */
function edgeVertex(field: ContourField, edge: number, level: number): ContourVertex {
  const { z, x, y } = field;
  const cols = z[0].length;
  const cell = Math.floor(edge / 2);
  const col = cell % cols;
  const row = (cell - col) / cols;

  if (edge % 2 === 1) {
    const fraction = crossFraction(z[row][col], z[row + 1][col], level);
    return {
      x: withoutFloatNoise(x[col]),
      y: withoutFloatNoise(y[row] + fraction * (y[row + 1] - y[row])),
    };
  }
  const fraction = crossFraction(z[row][col], z[row][col + 1], level);
  return {
    x: withoutFloatNoise(x[col] + fraction * (x[col + 1] - x[col])),
    y: withoutFloatNoise(y[row]),
  };
}

/**
 * How far along an edge the level falls, as a fraction of it.
 *
 * @param from  - The magnitude at the edge's start
 * @param to    - The magnitude at its end
 * @param level - The value being walked
 * @returns The fraction, and the midpoint for an edge with no gradient
 */
function crossFraction(from: number, to: number, level: number): number {
  const span = to - from;
  return span === 0 ? 0.5 : (level - from) / span;
}

// ---------------------------------------------------------------------------
// Choropleth
// ---------------------------------------------------------------------------

/**
 * What a choropleth layer calls its two dimensions. A map has no axes to take
 * a name from; the shaded quantity usually names itself on the colorbar, and
 * the regions are named for what they are.
 */
const CHOROPLETH_REGION_AXIS = 'Region';
const CHOROPLETH_VALUE_AXIS = 'Value';

/** One region as the layer needs it, keyed to the shape plotly drew for it. */
interface ChoroplethRegion {
  name: string | number;
  value: number;
  /** The centroid plotly resolved, when the map has been drawn. */
  ct?: [number, number];
  /** Its position in the trace's own arrays, which is the shape's position. */
  index: number;
}

/**
 * Names one region.
 *
 * `locations` addresses the region rather than naming it: on a world map it is
 * usually an ISO code, and with `locationmode: 'geojson-id'` it is whatever key
 * the feature collection uses — `01`, `06`. Plotly draws no labels either, so
 * the name a sighted reader is given is the text the author attached, and it
 * is preferred wherever there is one.
 *
 * @param trace - The resolved plotly trace
 * @param index - Which region
 * @returns The name to announce it by
 */
function regionName(trace: PlotlyTrace, index: number): string | number {
  for (const carrier of [trace.hovertext, trace.text]) {
    const entry = Array.isArray(carrier) ? carrier[index] : undefined;
    if (typeof entry === 'string' && entry !== '')
      return entry;
  }
  return trace.locations?.[index] ?? index;
}

/**
 * Reads the regions plotly shaded, keeping each one's own position.
 *
 * A region whose value is missing, or whose name matched no feature on the
 * map, is dropped rather than shaded at zero — plotly leaves its path in the
 * DOM with no shape at all, which is why the position is carried rather than
 * recounted: the regions that survive still have to line up with the shapes.
 *
 * The centroid is plotly's own `ct`, copied off the resolved feature while the
 * map was projected, and it is what turns a region list into a map: without a
 * longitude and a latitude there is no north, no gradient and no neighbouring
 * region to move to.
 *
 * @param trace    - The resolved plotly trace
 * @param calcdata - What plotly computed for it
 * @returns The regions, in the order the trace declared them
 */
function drawnRegions(trace: PlotlyTrace, calcdata: PlotlyCalcData[]): ChoroplethRegion[] {
  const values = (trace.z ?? []) as (number | string)[];
  const len = Math.max(values.length, trace.locations?.length ?? 0);

  const regions: ChoroplethRegion[] = [];
  for (let index = 0; index < len; index++) {
    const cd = calcdata[index];
    // Plotly's own calc marks an unusable region by nulling its location, and
    // `Number(null)` is a finite zero that would be shaded as a real reading.
    const raw = cd && 'z' in cd ? cd.z : values[index];
    if (raw == null || (cd && cd.loc === null))
      continue;
    const value = Number(raw);
    if (!Number.isFinite(value))
      continue;

    const centroid = cd?.ct;
    regions.push({
      name: regionName(trace, index),
      value,
      ...(isLonLat(centroid) ? { ct: centroid } : {}),
      index,
    });
  }
  return regions;
}

/** Whether plotly resolved a usable `[lon, lat]` pair for a region. */
function isLonLat(ct: [number, number] | undefined): ct is [number, number] {
  return Array.isArray(ct) && ct.length >= 2
    && Number.isFinite(Number(ct[0])) && Number.isFinite(Number(ct[1]));
}

/**
 * Builds a choropleth layer.
 *
 * `neighbors` is deliberately never emitted: plotly holds each region's
 * polygons but nothing that says which regions share a border, and the
 * grammar asks for silence rather than a guess — two regions can have near
 * centroids and no shared border at all.
 */
function extractChoroplethLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  traceIndex: number,
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  const regions = drawnRegions(trace, calcdata);
  if (regions.length === 0)
    return null;

  const data: ChoroplethPoint[] = regions.map(region => ({
    x: region.name,
    y: region.value,
    ...(region.ct ? { lon: Number(region.ct[0]), lat: Number(region.ct[1]) } : {}),
  }));

  const valueLabel = extractColorbarTitle(trace, gd._fullLayout ?? gd.layout);

  return {
    id,
    type: TraceType.CHOROPLETH,
    title,
    selectors: choroplethRegionSelectors(gd, traceIndex, regions.map(region => region.index)),
    axes: {
      x: { label: CHOROPLETH_REGION_AXIS },
      y: { label: valueLabel ?? CHOROPLETH_VALUE_AXIS },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Pie
// ---------------------------------------------------------------------------

/**
 * What a pie's two dimensions are called. Plotly gives a pie no axes and so no
 * titles to take these from; they are named after the attributes an author
 * writes, `labels` and `values`.
 */
const PIE_LABEL_AXIS = 'Label';
const PIE_VALUE_AXIS = 'Value';

/** One slice as the layer needs it: a label and the magnitude behind it. */
interface PieSlice {
  label: string | number;
  value: number;
}

/**
 * Reads the slices out of what plotly computed for the pie.
 *
 * calcdata is the only source that describes the pie as it was drawn. Plotly
 * does not draw one in the order it was authored: `sort` — on unless a trace
 * turns it off — puts the largest slice first, and calc drops any slice it
 * will not draw at all (a missing or negative value). What survives is exactly
 * the wedges in the DOM, in their order, which is what the layer's
 * data-index-k-is-wedge-k contract needs.
 *
 * @returns The drawn slices, or `null` when plotly has not computed the trace.
 */
function drawnPieSlices(calcdata: PlotlyCalcData[]): PieSlice[] | null {
  if (calcdata.length === 0) {
    return null;
  }

  const slices: PieSlice[] = [];
  for (const cd of calcdata) {
    if (typeof cd.v !== 'number') {
      return null;
    }
    slices.push({ label: cd.label ?? '', value: cd.v });
  }
  return slices;
}

/**
 * Reads the slices from the trace's own arrays, as the author wrote them.
 *
 * The fallback for a chart captured before plotly computed it. A label with no
 * value (and the reverse) is not a slice, so the two arrays are read only as
 * far as both reach.
 */
function authoredPieSlices(trace: PlotlyTrace): PieSlice[] {
  const labels = trace.labels ?? [];
  const values = trace.values ?? [];

  const len = Math.min(labels.length, values.length);
  const slices: PieSlice[] = [];
  for (let i = 0; i < len; i++) {
    slices.push({ label: labels[i], value: Number(values[i]) });
  }
  return slices;
}

function extractPieLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
): MaidrLayer | null {
  const drawn = drawnPieSlices(calcdata);
  const slices = drawn ?? authoredPieSlices(trace);
  if (slices.length === 0)
    return null;

  // The authored order is also the drawn order only when the trace turned
  // `sort` off. Otherwise plotly reordered the wedges and slice k is not
  // wedge k, so the layer goes out without selectors — no highlight at all
  // beats a highlight that lands on a neighbouring slice while the text
  // announces this one.
  const inDrawnOrder = drawn !== null || trace.sort === false;

  const data: PiePoint[] = slices.map(slice => ({ x: slice.label, y: slice.value }));

  return {
    id,
    type: TraceType.PIE,
    title,
    selectors: inDrawnOrder ? selectors : undefined,
    axes: {
      x: { label: PIE_LABEL_AXIS },
      y: { label: PIE_VALUE_AXIS },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Hierarchy (sunburst, icicle, treemap)
// ---------------------------------------------------------------------------

/**
 * What a hierarchy layer calls its two dimensions.
 *
 * Plotly gives these traces no axes to take a name from — a sector's name and
 * its magnitude are the whole chart — so they are named the way a pie's are.
 */
const HIERARCHY_LABEL_AXIS = 'Label';
const HIERARCHY_VALUE_AXIS = 'Value';

/** One sector as the layer needs it: its name, its magnitude and its ancestry. */
interface HierarchySector {
  label: string;
  /** The magnitude, or undefined when the trace declared none for this sector. */
  value: number | undefined;
  /** The names of its ancestors, root first, excluding itself. */
  path: string[];
}

/**
 * Reads the sectors out of the tree plotly computed, in the order it drew them.
 *
 * calcdata is the only source that describes the hierarchy as it was drawn.
 * Plotly stratifies the `labels`/`parents` pair into a tree, sums it, and —
 * unless a trace turns `sort` off — reorders every node's children largest
 * first, so the authored order is not the drawn order. It then draws the tree
 * a level at a time, which is what this walk reproduces: the `g.slice` groups
 * sit in exactly this order, and that is what the layer's
 * sector-k-is-slice-k selector contract needs.
 *
 * A tree whose root plotly synthesised to stand in front of several top-level
 * sectors is refused outright. The stand-in is nameless, the three layouts
 * disagree over whether it is drawn at all, and a sector list that is off by
 * one against the slices would highlight a neighbour for the whole chart.
 *
 * @param calcdata - What plotly computed for the trace
 * @returns The drawn sectors, or null when plotly has not computed the trace
 */
function drawnHierarchySectors(calcdata: PlotlyCalcData[]): HierarchySector[] | null {
  const root = calcdata[0]?.hierarchy;
  if (!root || root.data?.data?.hasMultipleRoots) {
    return null;
  }

  const sectors: HierarchySector[] = [];
  let level: { node: PlotlyHierarchyNode; path: string[] }[] = [{ node: root, path: [] }];

  while (level.length > 0) {
    const next: { node: PlotlyHierarchyNode; path: string[] }[] = [];
    for (const { node, path } of level) {
      const label = node.data?.data?.label;
      if (label === undefined) {
        return null;
      }
      const value = Number(node.value);
      sectors.push({
        label,
        value: Number.isFinite(value) ? value : undefined,
        path,
      });

      const childPath = [...path, label];
      for (const child of node.children ?? []) {
        next.push({ node: child, path: childPath });
      }
    }
    level = next;
  }

  return sectors.length > 0 ? sectors : null;
}

/**
 * Reads the sectors from the trace's own arrays, as the author wrote them.
 *
 * The fallback for a chart captured before plotly computed it. A sector is
 * addressed by its id where the trace has one and by its label otherwise,
 * which is how plotly resolves the `parents` entries against it.
 */
function authoredHierarchySectors(trace: PlotlyTrace): HierarchySector[] {
  const labels = trace.labels ?? [];
  const parents = trace.parents ?? [];
  const values = trace.values ?? [];
  const ids = trace.ids;

  const len = Math.min(labels.length, parents.length);
  const labelByKey = new Map<string, string>();
  const parentByKey = new Map<string, string>();
  for (let i = 0; i < len; i++) {
    const key = String(ids?.[i] ?? labels[i]);
    labelByKey.set(key, String(labels[i]));
    parentByKey.set(key, String(parents[i] ?? ''));
  }

  const sectors: HierarchySector[] = [];
  for (let i = 0; i < len; i++) {
    // A sector plotly would not size is one it declared no magnitude for, and
    // `Number(null)` is a finite 0 that would be announced as one.
    const declared = values[i];
    const value = declared == null ? Number.NaN : Number(declared);
    sectors.push({
      label: String(labels[i]),
      value: Number.isFinite(value) ? value : undefined,
      path: ancestorLabels(String(ids?.[i] ?? labels[i]), labelByKey, parentByKey),
    });
  }
  return sectors;
}

/**
 * Names a sector's ancestors, root first.
 *
 * The walk stops on a key it has already seen: a `parents` array is authored
 * by hand and can name a cycle, which plotly refuses to draw at all and which
 * would otherwise spin here.
 */
function ancestorLabels(
  key: string,
  labelByKey: Map<string, string>,
  parentByKey: Map<string, string>,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>([key]);

  let current = parentByKey.get(key) ?? '';
  while (current !== '' && !seen.has(current)) {
    const label = labelByKey.get(current);
    if (label === undefined) {
      break;
    }
    seen.add(current);
    path.unshift(label);
    current = parentByKey.get(current) ?? '';
  }
  return path;
}

/**
 * Whether the trace draws only part of the tree it declared.
 *
 * `maxdepth` stops the layout after that many levels below its entry point,
 * and `level` moves the entry point to a sector partway down — either way,
 * plotly puts fewer slices on the page than the tree has nodes. `-1` is
 * plotly's own "all of it" and trims nothing.
 *
 * @param trace - The resolved plotly trace
 * @returns True when plotly drew a subset of the computed tree
 */
function isTrimmedHierarchy(trace: PlotlyTrace): boolean {
  const depth = trace.maxdepth;
  return (typeof depth === 'number' && depth > 0)
    || (trace.level !== undefined && trace.level !== '');
}

/**
 * Builds a sunburst, icicle or treemap layer.
 *
 * One extractor for all three because plotly gives them one attribute set and
 * MAIDR gives them one trace: the tree is the chart, and the layout is only
 * how it was drawn. Only the emitted type differs.
 */
function extractHierarchyLayer(
  trace: PlotlyTrace,
  type: TraceType.SUNBURST | TraceType.ICICLE | TraceType.TREEMAP,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
): MaidrLayer | null {
  const drawn = drawnHierarchySectors(calcdata);
  const sectors = drawn ?? authoredHierarchySectors(trace);
  if (sectors.length === 0)
    return null;

  const data: TreemapPoint[] = sectors.map(sector => ({
    x: sector.label,
    ...(sector.value === undefined ? {} : { y: sector.value }),
    ...(sector.path.length > 0 ? { path: sector.path } : {}),
  }));

  return {
    id,
    type,
    title,
    // The wedge contract a pie is under, applied to slices: the authored order
    // is not the drawn one, so a layer built from the trace's own arrays goes
    // out without selectors. No highlight at all beats one that lands on a
    // neighbouring sector while the text announces this one.
    //
    // A trimmed tree is withheld for the same reason. `maxdepth` and `level`
    // narrow what plotly draws without narrowing what it computed, so the walk
    // still yields every node while only some have a `g.slice` on the page —
    // and sector k would then be some other sector's slice.
    selectors: drawn && !isTrimmedHierarchy(trace) ? selectors : undefined,
    axes: {
      x: { label: HIERARCHY_LABEL_AXIS },
      y: { label: HIERARCHY_VALUE_AXIS },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Sankey
// ---------------------------------------------------------------------------

/**
 * What a sankey layer calls its two dimensions. Plotly titles neither, and a
 * flow diagram's dimensions are the same on both sides of every ribbon.
 */
const SANKEY_NODE_AXIS = 'Node';
const SANKEY_VALUE_AXIS = 'Value';

/**
 * Names one end of a flow.
 *
 * A trace authors its ends as INDICES into `node.label`, and plotly's layout
 * pass replaces each index with the node object itself — so which of the two
 * arrives here depends on whether the chart has been drawn. A node beyond the
 * declared labels (one plotly generated for a `node.groups` entry) falls back
 * to its index, which at least identifies it consistently across the flows
 * that touch it.
 *
 * `null` is admitted because `typeof null` is `'object'`: a hole in an
 * authored `link.source` array would otherwise be read as a node and have its
 * label taken off nothing.
 */
function sankeyEndpoint(
  end: number | PlotlySankeyNode | null | undefined,
  labels: (number | string)[],
): string | number {
  if (end !== null && typeof end === 'object') {
    return end.label ?? end.pointNumber ?? '';
  }
  const index = Number(end);
  return labels[index] ?? index;
}

/**
 * Reads the flows out of what plotly computed, in the order it drew the
 * ribbons.
 *
 * Plotly's calc drops every flow it will not draw — a non-positive value, an
 * endpoint that is not a node, both ends inside one group — and keeps the
 * rest in the order they were authored. What survives is exactly the ribbons
 * in the DOM, which is what the layer's flow-k-is-ribbon-k contract needs.
 *
 * @param calcdata - What plotly computed for the trace
 * @param trace    - The resolved plotly trace, which names the nodes
 * @returns The drawn flows, or null when plotly has not computed the trace
 */
function drawnFlows(calcdata: PlotlyCalcData[], trace: PlotlyTrace): FlowPoint[] | null {
  const links = calcdata[0]?._links;
  const labels = trace.node?.label ?? [];
  if (!links || links.length === 0) {
    return null;
  }

  const flows: FlowPoint[] = [];
  for (const link of links) {
    const value = Number(link.value);
    if (!Number.isFinite(value)) {
      return null;
    }
    flows.push({
      source: sankeyEndpoint(link.source, labels),
      target: sankeyEndpoint(link.target, labels),
      value,
    });
  }
  return flows;
}

/**
 * Reads the flows from the trace's own arrays, as the author wrote them.
 *
 * The fallback for a chart captured before plotly computed it. A flow with
 * nothing running through it is dropped here as well, because plotly drops it
 * too and a zero-weight edge would put a node in the graph that the chart
 * does not draw.
 */
function authoredFlows(trace: PlotlyTrace): FlowPoint[] {
  const sources = trace.link?.source ?? [];
  const targets = trace.link?.target ?? [];
  const values = trace.link?.value ?? [];
  const labels = trace.node?.label ?? [];

  const len = Math.min(sources.length, targets.length, values.length);
  const flows: FlowPoint[] = [];
  for (let i = 0; i < len; i++) {
    const value = Number(values[i]);
    if (!Number.isFinite(value) || value <= 0)
      continue;
    flows.push({
      source: sankeyEndpoint(sources[i], labels),
      target: sankeyEndpoint(targets[i], labels),
      value,
    });
  }
  return flows;
}

function extractSankeyLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
): MaidrLayer | null {
  const drawn = drawnFlows(calcdata, trace);
  const flows = drawn ?? authoredFlows(trace);
  if (flows.length === 0)
    return null;

  return {
    id,
    type: TraceType.SANKEY,
    title,
    // Selectors only for the drawn set, for the reason a pie's are withheld:
    // the ribbons are matched to the flows by position, and a list rebuilt
    // from the trace's own arrays cannot promise plotly kept them all.
    selectors: drawn ? selectors : undefined,
    axes: {
      x: { label: SANKEY_NODE_AXIS },
      y: { label: SANKEY_VALUE_AXIS },
    },
    data: flows,
  };
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

/**
 * What a gauge layer calls its two dimensions: the measure it names and the
 * number it reads. Plotly titles neither.
 */
const GAUGE_MEASURE_AXIS = 'Measure';
const GAUGE_VALUE_AXIS = 'Value';

/**
 * The target a gauge was aiming at, when it drew one.
 *
 * `threshold.value` is the marker plotly draws on the dial, and it is the
 * target proper. `delta.reference` is the number an indicator computes its
 * delta against, which is the same thing whenever the author set it — but
 * plotly DEFAULTS it to the measure, and "0 above target" is not a reading, so
 * a reference equal to the value is treated as the absent one it is.
 *
 * Plotly resolves an unset `threshold.value` to the boolean `false`, which
 * `Number` would happily turn into a target of zero. Hence the type test.
 */
function gaugeTarget(trace: PlotlyTrace): number | undefined {
  const threshold = trace.gauge?.threshold?.value;
  if (typeof threshold === 'number' && Number.isFinite(threshold)) {
    return threshold;
  }

  const reference = trace.delta?.reference;
  if (typeof reference === 'number' && Number.isFinite(reference) && reference !== trace.value) {
    return reference;
  }
  return undefined;
}

/**
 * The qualitative bands a bullet chart declared, ascending.
 *
 * Plotly's steps carry a range and a colour; a NAME is optional and usually
 * absent, because the colour is what a sighted reader goes by. A band with no
 * name has no honest label, and "band 2" says nothing a reader could not work
 * out from the numbers — so an unnamed step withdraws the bands entirely
 * rather than having one invented for it.
 */
function gaugeBands(trace: PlotlyTrace): GaugeBand[] | undefined {
  const steps = trace.gauge?.steps;
  if (!steps || steps.length === 0) {
    return undefined;
  }

  const bands: GaugeBand[] = [];
  for (const step of steps) {
    const to = Number(step.range?.[1]);
    if (!step.name || !Number.isFinite(to)) {
      return undefined;
    }
    bands.push({ to, label: step.name });
  }
  return bands.sort((a, b) => a.to - b.to);
}

function extractGaugeLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
): MaidrLayer | null {
  // Read as a number rather than coerced to one: an absent measure is the
  // `undefined` plotly leaves, and `Number(null)` would be a finite zero the
  // chart never drew.
  const value = trace.value;
  const range = trace.gauge?.axis?.range;
  if (typeof value !== 'number' || !Number.isFinite(value) || !range || range.length < 2)
    return null;

  const min = Number(range[0]);
  const max = Number(range[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return null;

  const point: GaugePoint = { value, min, max };

  // The indicator's own title, which is what a gauge tile is captioned with.
  // Unlike an axis title it has no placeholder to guard against: plotly
  // resolves an unset one to the empty string.
  const label = extractTextOrObject(trace.title);
  if (label)
    point.label = label;

  const target = gaugeTarget(trace);
  if (target !== undefined)
    point.target = target;

  const bands = gaugeBands(trace);
  if (bands)
    point.bands = bands;

  return {
    id,
    type: TraceType.GAUGE,
    title,
    selectors,
    axes: {
      x: { label: GAUGE_MEASURE_AXIS },
      y: { label: GAUGE_VALUE_AXIS },
    },
    // A single object rather than an array: a gauge draws exactly one measure.
    data: point,
  };
}

// ---------------------------------------------------------------------------
// Parallel coordinates
// ---------------------------------------------------------------------------

/**
 * What a parallel-coordinates layer calls its two dimensions. Each axis names
 * itself in the x of every point, so the layer's own x names what those are.
 */
const PARALLEL_VARIABLE_AXIS = 'Variable';
const PARALLEL_VALUE_AXIS = 'Value';

/**
 * Builds a parallel-coordinates layer.
 *
 * `ParallelTrace` reads one ROW PER OBSERVATION and one column per axis;
 * plotly stores the transpose, a `values` column per dimension, so the grid is
 * turned over here. Every observation crosses every axis, which is what makes
 * the transpose safe: a dimension shorter than the rest describes fewer
 * observations than the chart drew, and reading past its end would invent
 * values, so the row count is the shortest column.
 *
 * No selectors: plotly draws parcoords lines to a canvas rather than to SVG,
 * so there is nothing per-observation to highlight. The layer still sonifies,
 * navigates and reads out, which is the whole chart bar the visual cue.
 */
function extractParallelLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
): MaidrLayer | null {
  // A hidden dimension is not an axis on the chart, so it is not a column.
  const dimensions = (trace.dimensions ?? []).filter(dimension => dimension.visible !== false);
  if (dimensions.length === 0)
    return null;

  const rows = dimensions.reduce(
    (shortest, dimension) => Math.min(shortest, dimension.values?.length ?? 0),
    Infinity,
  );
  if (!Number.isFinite(rows) || rows === 0)
    return null;

  const data: LinePoint[][] = [];
  for (let row = 0; row < rows; row++) {
    const observation: LinePoint[] = [];
    for (const dimension of dimensions) {
      const value = Number(dimension.values?.[row]);
      // A gap on one axis is a break in the line rather than a value, and the
      // per-axis extents this trace scales its pitch by must not see it.
      if (dimension.values?.[row] == null || !Number.isFinite(value))
        continue;
      observation.push({ x: dimension.label ?? '', y: value });
    }
    if (observation.length > 0)
      data.push(observation);
  }

  if (data.length === 0)
    return null;

  return {
    id,
    type: TraceType.PARALLEL,
    title,
    axes: {
      x: { label: PARALLEL_VARIABLE_AXIS },
      y: { label: PARALLEL_VALUE_AXIS },
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

function extractHistogramLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
  traceIndex: number,
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  // Plotly pre-computes histogram bins in calcdata.
  // Each cd element represents one bin: { p: binCenter, s: count, ... }
  if (calcdata.length > 0 && calcdata[0] != null && 'p' in calcdata[0]) {
    const data: HistogramPoint[] = [];

    // Prefer _fullData xbins (auto-computed) over user-supplied trace.xbins.
    const fullTrace = gd._fullData?.[traceIndex];
    const binSize = fullTrace?.xbins?.size ?? trace.xbins?.size;

    for (let idx = 0; idx < calcdata.length; idx++) {
      const cd = calcdata[idx];
      const center = Number(cd.p ?? 0);
      const count = Number(cd.s ?? 0);

      // Derive bin edges: use binSize if available, otherwise infer
      // from adjacent bin centers.
      let xMin: number;
      let xMax: number;
      if (binSize != null) {
        const halfBin = Number(binSize) / 2;
        xMin = center - halfBin;
        xMax = center + halfBin;
      } else {
        // Infer from neighbors. For first/last bins, mirror the gap.
        const prev = idx > 0 ? Number(calcdata[idx - 1].p ?? 0) : null;
        const next = idx < calcdata.length - 1 ? Number(calcdata[idx + 1].p ?? 0) : null;
        const gap = next != null ? next - center : prev != null ? center - prev : 1;
        xMin = center - gap / 2;
        xMax = center + gap / 2;
      }

      data.push({
        x: center,
        y: count,
        xMin,
        xMax,
        yMin: 0,
        yMax: count,
      });
    }

    return {
      id,
      type: TraceType.HISTOGRAM,
      title,
      selectors,
      axes,
      data,
    };
  }

  // Without calcdata, bin boundaries cannot be computed reliably.
  console.warn('[maidr] Histogram: calcdata unavailable, skipping trace.');
  return null;
}

// ---------------------------------------------------------------------------
// Candlestick
// ---------------------------------------------------------------------------

function extractCandlestickLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
): MaidrLayer | null {
  const { open, high, low, close, x } = trace;
  if (!open || !high || !low || !close)
    return null;

  const len = Math.min(open.length, high.length, low.length, close.length);
  const data: CandlestickPoint[] = [];

  for (let i = 0; i < len; i++) {
    const o = Number(open[i]);
    const c = Number(close[i]);
    const h = Number(high[i]);
    const l = Number(low[i]);
    const trend = c > o ? 'Bull' : c < o ? 'Bear' : 'Neutral';

    if (Number.isNaN(o) || Number.isNaN(c) || Number.isNaN(h) || Number.isNaN(l))
      continue;

    data.push({
      value: x ? String(x[i]) : String(i),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: undefined, // Plotly candlestick does not include volume data.
      trend,
      volatility: h - l,
    });
  }

  if (data.length === 0)
    return null;

  return {
    id,
    type: TraceType.CANDLESTICK,
    title,
    selectors,
    axes,
    data,
  };
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

/**
 * The `measure` values that mark a step restating the running total rather
 * than contributing to it. Plotly accepts both the words and their initials.
 */
const WATERFALL_TOTAL_MEASURES = new Set(['total', 't', 'absolute', 'a']);

/** A measure that resets the running total to the step's own amount. */
const WATERFALL_ABSOLUTE_MEASURES = new Set(['absolute', 'a']);

/** One step as the layer needs it, before its label is attached. */
interface WaterfallStep {
  start: number;
  end: number;
  delta: number;
  kind: WaterfallKind;
}

/**
 * Names what a step did to the running total.
 *
 * A zero-sized relative step is an increase rather than a decrease, matching
 * plotly's own `dir`, which reserves `decreasing` for a negative amount.
 */
function waterfallKind(isSum: boolean, delta: number): WaterfallKind {
  if (isSum)
    return 'total';
  return delta < 0 ? 'decrease' : 'increase';
}

/**
 * Reads one step out of what plotly computed for it.
 *
 * This is the arithmetic plotly's own hover does: the running total after the
 * step is `cd.v` — the trace's base plus everything accumulated so far — and
 * the contribution is the step's authored amount `cd.rawS`. A total's
 * contribution is the whole total it restates, which is what leaves it
 * sitting on the baseline rather than floating like the steps around it.
 *
 * `cd.s` is deliberately not read: for a relative step it already holds the
 * accumulated total, so taking it for the contribution would announce the
 * running total twice and never the change.
 *
 * @param cd - The calcdata entry for this step, when plotly has computed one
 * @returns The step, or null when calcdata cannot describe it
 */
function calcWaterfallStep(cd: PlotlyCalcData | undefined): WaterfallStep | null {
  if (!cd || typeof cd.v !== 'number' || !Number.isFinite(cd.v)) {
    return null;
  }

  const end = cd.v;
  const isSum = cd.isSum === true;
  if (!isSum && (typeof cd.rawS !== 'number' || !Number.isFinite(cd.rawS))) {
    return null;
  }

  const delta = isSum ? end : (cd.rawS as number);
  return { start: end - delta, end, delta, kind: waterfallKind(isSum, delta) };
}

/**
 * Accumulates the steps from what the author wrote, for a chart captured
 * before plotly computed it.
 *
 * Mirrors plotly's own calc so the two agree: a relative step adds its amount
 * to the running total, an absolute one replaces it, and a total leaves it
 * alone while restating it as a bar from the baseline.
 *
 * @param sizes - The value-axis amounts, in step order
 * @param measures - What each step does, `relative` where it says nothing
 * @param base - The value-axis offset the trace is measured from
 * @returns One step per amount
 */
function authoredWaterfallSteps(
  sizes: (number | string)[],
  measures: string[] | undefined,
  base: number,
): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let running = 0;

  for (let i = 0; i < sizes.length; i++) {
    const parsed = Number(sizes[i]);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    const measure = measures?.[i] ?? 'relative';
    const isSum = WATERFALL_TOTAL_MEASURES.has(measure);

    if (WATERFALL_ABSOLUTE_MEASURES.has(measure)) {
      running = amount;
    } else if (!isSum) {
      running += amount;
    }

    const end = base + running;
    const delta = isSum ? end : amount;
    steps.push({ start: end - delta, end, delta, kind: waterfallKind(isSum, delta) });
  }

  return steps;
}

function extractWaterfallLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
): MaidrLayer | null {
  const isHorizontal = trace.orientation === 'h';
  const positions = isHorizontal ? trace.y : trace.x;
  const sizes = isHorizontal ? trace.x : trace.y;
  if (!positions || !sizes)
    return null;

  const parsedBase = Number(trace.base);
  const base = Number.isFinite(parsedBase) ? parsedBase : 0;
  const authored = authoredWaterfallSteps(sizes, trace.measure, base);

  const len = Math.min(positions.length, sizes.length);
  const data: WaterfallPoint[] = [];
  for (let i = 0; i < len; i++) {
    const step = calcWaterfallStep(calcdata[i]) ?? authored[i];
    data.push({
      x: positions[i] as number | string,
      start: step.start,
      end: step.end,
      delta: step.delta,
      kind: step.kind,
    });
  }

  if (data.length === 0)
    return null;

  return {
    id,
    type: TraceType.WATERFALL,
    title,
    selectors,
    // `WaterfallTrace` names the step with the layer's x axis and the
    // contribution with its y axis whichever way plotly drew the bars — the
    // sequence navigates the same either way, so it has no orientation to
    // read. On a horizontal waterfall those are plotly's y and x, so the
    // labels are swapped into the layer rather than announced crossed over.
    axes: isHorizontal ? swappedAxes(axes) : axes,
    data,
  };
}

/**
 * Exchanges a layer's x and y axis labels, for a trace whose navigation has
 * no orientation of its own.
 */
function swappedAxes(axes: MaidrLayer['axes']): MaidrLayer['axes'] {
  const swapped: MaidrLayer['axes'] = {};
  if (axes?.y)
    swapped.x = axes.y;
  if (axes?.x)
    swapped.y = axes.x;
  return swapped;
}

// ---------------------------------------------------------------------------
// Error bars
// ---------------------------------------------------------------------------

/** A sample's interval, either side of which the chart may leave undrawn. */
interface ErrorBounds {
  min?: number;
  max?: number;
}

/**
 * Reads the bounds plotly resolved for one sample.
 *
 * Plotly's errorbar calc turns every flavour of `error_y` — arrays,
 * percentages, square roots — into the two absolute positions it will draw
 * the whip between, and stores them per sample as `ys`/`yh` (`xs`/`xh` for
 * horizontal intervals). Those are exactly what {@link ErrorBarPoint} wants,
 * so nothing is recomputed here.
 *
 * @param cd - The calcdata entry for this sample
 * @param axis - The axis the interval is drawn on
 * @returns The bounds, or null when plotly resolved none
 */
function calcErrorBounds(
  cd: PlotlyCalcData | undefined,
  axis: 'x' | 'y',
): ErrorBounds | null {
  if (!cd)
    return null;

  const low = axis === 'y' ? cd.ys : cd.xs;
  const high = axis === 'y' ? cd.yh : cd.xh;
  if (!Number.isFinite(low) && !Number.isFinite(high))
    return null;

  return {
    ...(Number.isFinite(low) ? { min: low } : {}),
    ...(Number.isFinite(high) ? { max: high } : {}),
  };
}

/**
 * The magnitudes an error-bar container declares at one sample, below and
 * above the estimate.
 *
 * Mirrors plotly's own `computeError`, for the chart captured before it ran.
 *
 * @param options - The trace's `error_x`/`error_y` container
 * @param value - The estimate the interval is drawn around
 * @param index - Which sample this is, for the per-sample arrays
 * @returns `[below, above]`, or null when the container declares nothing
 */
function errorMagnitudes(
  options: PlotlyErrorBar,
  value: number,
  index: number,
): [number, number] | null {
  // Only `data` reads a second array; the scalar types repeat their single
  // magnitude unless the trace declared the other side separately.
  const separate = options.symmetric === false;

  switch (options.type) {
    case 'data': {
      const above = Number(options.array?.[index]);
      return [separate ? Number(options.arrayminus?.[index]) : above, above];
    }
    case 'constant': {
      const above = Math.abs(Number(options.value));
      return [separate ? Math.abs(Number(options.valueminus)) : above, above];
    }
    case 'percent': {
      const above = Math.abs(value * Number(options.value) / 100);
      return [separate ? Math.abs(value * Number(options.valueminus) / 100) : above, above];
    }
    case 'sqrt': {
      const magnitude = Math.sqrt(Math.abs(value));
      return [magnitude, magnitude];
    }
    default:
      return null;
  }
}

/**
 * Turns the declared magnitudes into the absolute bounds the grammar fixes.
 */
function authoredErrorBounds(
  options: PlotlyErrorBar,
  value: number,
  index: number,
): ErrorBounds | null {
  const magnitudes = errorMagnitudes(options, value, index);
  if (!magnitudes)
    return null;

  const [below, above] = magnitudes;
  if (!Number.isFinite(below) && !Number.isFinite(above))
    return null;

  return {
    ...(Number.isFinite(below) ? { min: value - below } : {}),
    ...(Number.isFinite(above) ? { max: value + above } : {}),
  };
}

/**
 * Builds the interval layer for a scatter or bar trace drawn with error bars.
 *
 * A horizontal interval is the same shape with the axes exchanged: the
 * estimate and its bounds come off plotly's x and the sample labels off its
 * y, which is what `orientation` tells the trace so it announces each against
 * the right axis.
 *
 * Samples plotly would not draw are dropped rather than emitted at zero. That
 * also keeps the points lined up with the whips in the DOM, which plotly
 * leaves out for exactly the same samples.
 */
function extractErrorBarLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
): MaidrLayer | null {
  const axis = errorBarAxis(trace);
  if (axis === null)
    return null;

  const isHorizontal = axis === 'x';
  const positions = isHorizontal ? trace.y : trace.x;
  const values = isHorizontal ? trace.x : trace.y;
  const options = (isHorizontal ? trace.error_x : trace.error_y) ?? {};
  if (!positions || !values)
    return null;

  const len = Math.min(positions.length, values.length);
  const data: ErrorBarPoint[] = [];

  for (let i = 0; i < len; i++) {
    // The explicit null gap goes first: `Number(null)` is 0, which is finite
    // and would be announced as an estimate of zero the chart never drew.
    if (positions[i] == null || values[i] == null)
      continue;
    const value = Number(values[i]);
    if (!Number.isFinite(value))
      continue;

    const bounds = calcErrorBounds(calcdata[i], axis)
      ?? authoredErrorBounds(options, value, i);

    data.push({
      x: positions[i] as number | string,
      y: value,
      ...(bounds?.min !== undefined ? { yMin: bounds.min } : {}),
      ...(bounds?.max !== undefined ? { yMax: bounds.max } : {}),
    });
  }

  if (data.length === 0)
    return null;

  return {
    id,
    type: TraceType.ERROR_BAR,
    title,
    selectors,
    axes,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    data,
  };
}

// ---------------------------------------------------------------------------
// Segmented bars (dodged / stacked / normalized)
// ---------------------------------------------------------------------------

/**
 * Whether the panel's bar traces are two sides of one baseline.
 *
 * A population pyramid, and a Likert scale split around a neutral midpoint,
 * are authored the same way: the values on one side are negated so the bars
 * grow the other way, and `barmode` stacks them from a shared zero. What makes
 * it a pyramid rather than a stack is exactly that — one series growing left
 * and another growing right — so it is read off the signs of the values.
 *
 * Every series has to keep to one side. A series that crosses the baseline is
 * not a side of anything, and announcing the chart as diverging would promise
 * a direction per series that it does not have.
 *
 * @param barTraces - The panel's bar traces
 * @returns True when the panel draws two opposed sides
 */
function divergingSides(barTraces: TraceEntry[]): boolean {
  let growsUp = false;
  let growsDown = false;

  for (const { trace } of barTraces) {
    const values = (trace.orientation === 'h' ? trace.x : trace.y) ?? [];
    const numbers = values
      .filter(value => value != null)
      .map(Number)
      .filter(value => Number.isFinite(value) && value !== 0);
    if (numbers.length === 0)
      continue;

    const positive = numbers.every(value => value > 0);
    const negative = numbers.every(value => value < 0);
    if (!positive && !negative)
      return false;
    growsUp = growsUp || positive;
    growsDown = growsDown || negative;
  }

  return growsUp && growsDown;
}

/**
 * Combines multiple plotly bar traces into a single MAIDR segmented bar layer.
 *
 * Produces `SegmentedPoint[][]` where each inner array is one trace/series.
 * The `fill` field on each point carries the trace name (legend label).
 *
 * Used when `_fullLayout.barmode` is `'group'`, `'stack'`, or `'relative'`.
 */
function extractSegmentedBarLayer(
  barTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[],
  group: SubplotGroup,
  type: TraceType,
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
  mosaic?: MosaicDeclaration,
): MaidrLayer | null {
  const data: SegmentedPoint[][] = [];

  // Check orientation from first trace (all traces in a group share orientation).
  const isHorizontal = barTraces[0]?.trace.orientation === 'h';
  const categoryAxis = mosaic
    ? getAxis(
        gd._fullLayout ?? {},
        isHorizontal ? group.yAxisId : group.xAxisId,
      )
    : undefined;

  for (const { trace, calcIdx, globalIdx } of barTraces) {
    const x = trace.x;
    const y = trace.y;
    if (!x || !y)
      continue;

    const cd = group.calcdata[calcIdx] ?? [];
    const z = trace.name ?? `Series ${data.length + 1}`;
    const len = Math.min(x.length, y.length);
    const series: SegmentedPoint[] = [];

    // A marimekko's columns are the two things a stacked bar does not carry:
    // a name, because plotly draws them at precomputed cumulative positions
    // rather than at categories, and a share of all observations.
    const columns = mosaic
      ? mosaicCells(
          trace,
          mosaic,
          declarationContext(trace, globalIdx),
          isHorizontal ? y.slice(0, len) : x.slice(0, len),
          categoryAxis,
        )
      : undefined;

    for (let i = 0; i < len; i++) {
      const point: SegmentedPoint = { ...barPoint(cd[i], x[i], y[i], isHorizontal), z };
      const column = columns?.[i];
      if (column) {
        series.push({
          ...point,
          ...(isHorizontal ? { y: column.name } : { x: column.name }),
          ...(column.width === undefined ? {} : { width: column.width }),
          ...(column.count === undefined ? {} : { count: column.count }),
        } satisfies MosaicPoint);
      } else {
        series.push(point);
      }
    }

    data.push(series);
  }

  if (data.length === 0)
    return null;

  // The plotly x/y axes already line up with the layer axes for both
  // orientations, so no label swap is needed.
  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = { label: xLabel };
  if (yLabel)
    axes.y = { label: yLabel };

  const selectors = generatePlotlySelectors(type, barTraces[0].globalIdx, gd);

  return {
    id: String(barTraces[0].globalIdx),
    type,
    selectors,
    axes,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    data,
  };
}

// ---------------------------------------------------------------------------
// Mosaic
// ---------------------------------------------------------------------------

/** One cell of a declared marimekko, beyond what a stacked bar carries. */
interface MosaicCell {
  /** What the cell's column is called. */
  name: string | number;
  /** The column's share of all observations, as a fraction of one. */
  width?: number;
  /** The cell's own count, when the chart carries the table it was drawn from. */
  count?: number;
}

/**
 * Reads the facts a marimekko adds to a stacked bar, one per cell of one
 * trace.
 *
 * @param trace       - The resolved plotly trace
 * @param declaration - What the author declared on it
 * @param context     - How the trace is named in a warning
 * @param positions   - The trace's coordinate on the category axis
 * @param axis        - That axis, which is where the column names may live
 * @returns One entry per cell, in the trace's own order
 */
function mosaicCells(
  trace: PlotlyTrace,
  declaration: MosaicDeclaration,
  context: DeclarationContext,
  positions: (number | string)[],
  axis: PlotlyAxis | undefined,
): MosaicCell[] {
  const shares = mosaicShares(trace, positions.length);
  const names = mosaicColumnNames(trace, positions, axis);

  let widthResolved = false;
  let countResolved = false;
  const cells = positions.map((_, index) => {
    const row = customRow(trace, index);
    const width = finiteNumber(resolveFieldRef(row, declaration.width, 'width'));
    const count = finiteNumber(resolveFieldRef(row, declaration.count, 'count'));
    widthResolved = widthResolved || width !== undefined;
    countResolved = countResolved || count !== undefined;
    // The drawn widths stand in for a share the author did not declare: they
    // are what the chart put on the page, and this trace said they mean
    // something. A declared field that resolves wins over them.
    return { name: names[index], width: width ?? shares?.[index], count };
  });

  if (declaration.width !== undefined && !widthResolved)
    warnUnresolvedRef(context, declaration.width, 'width');
  if (declaration.count !== undefined && !countResolved)
    warnUnresolvedRef(context, declaration.count, 'count');

  return cells;
}

/**
 * Each column's share of all observations, from the widths plotly drew.
 *
 * Normalised by their own total, so a marimekko authored in counts, in
 * percentages or already in fractions all read the same — and a chart already
 * authored in fractions is unchanged by it.
 *
 * All or nothing: a partial width array would give some columns a share and
 * leave others without one, and a reader comparing them would be comparing a
 * fraction against silence.
 *
 * @param trace - The resolved plotly trace
 * @param count - How many columns the trace draws
 * @returns One share per column, or undefined when the trace draws no widths
 */
function mosaicShares(trace: PlotlyTrace, count: number): number[] | undefined {
  const widths = trace.width;
  if (!Array.isArray(widths) || widths.length < count)
    return undefined;

  const drawn = widths.slice(0, count).map(Number);
  if (!drawn.every(width => Number.isFinite(width) && width >= 0))
    return undefined;

  const total = drawn.reduce((sum, width) => sum + width, 0);
  if (total <= 0)
    return undefined;

  return drawn.map(width => withoutFloatNoise(width / total));
}

/**
 * What a marimekko's columns are called.
 *
 * A plotly marimekko puts its bars at precomputed cumulative positions, so
 * the coordinate is a number and the name has to come from somewhere else:
 * the per-point text the author drew on the columns, the hover text behind
 * them, or the tick the axis labels that position with. Failing all three the
 * position stands, which is what the chart itself shows.
 *
 * @param trace     - The resolved plotly trace
 * @param positions - The trace's coordinate on the category axis
 * @param axis      - That axis
 * @returns One name per column
 */
function mosaicColumnNames(
  trace: PlotlyTrace,
  positions: (number | string)[],
  axis: PlotlyAxis | undefined,
): (string | number)[] {
  const drawn = Array.isArray(trace.text) ? trace.text : undefined;
  const hovered = Array.isArray(trace.hovertext) ? trace.hovertext : undefined;
  const authored = drawn ?? hovered;
  const ticks = axis?.ticktext;
  const tickValues = axis?.tickvals;

  return positions.map((position, index) => {
    const named = authored?.[index];
    if (named !== undefined && named !== null && named !== '')
      return named;

    if (ticks && tickValues) {
      const tick = tickValues.findIndex(value => Number(value) === Number(position));
      if (tick >= 0 && tick < ticks.length)
        return ticks[tick];
    }
    return position;
  });
}

/**
 * The author's own row behind one point.
 *
 * `customdata` is plotly's only per-point channel for values it does not draw
 * with, which makes it the row a declared field is read off.
 *
 * @param trace - The resolved plotly trace
 * @param index - Which point
 * @returns The row, or undefined when the point has none
 */
function customRow(trace: PlotlyTrace, index: number): unknown {
  const row = trace.customdata?.[index];
  return typeof row === 'object' && row !== null ? row : undefined;
}

/**
 * Narrows a resolved field to a number the payload can carry.
 *
 * @param value - Whatever the field resolved to
 * @returns The number, or undefined when it is not one
 */
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;

  // A row that came from a CSV carries its numbers as strings, and a share
  // that arrives as "0.25" is still the share.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
