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

import type {
  BarPoint,
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  ViolinKdePoint,
} from '../../type/grammar';
import type {
  PlotlyAnnotation,
  PlotlyAxis,
  PlotlyCalcData,
  PlotlyFullLayout,
  PlotlyGraphDiv,
  PlotlyLayout,
  PlotlyTrace,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';
import { generatePlotlySelectors, subplotCssPrefix } from './selectors';

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
 * Maps a plotly.js trace type + mode to a MAIDR TraceType.
 * Returns `null` for unsupported types.
 */
function mapTraceType(trace: PlotlyTrace): TraceType | null {
  const type = trace.type ?? 'scatter';

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

    case 'histogram':
      return TraceType.HISTOGRAM;

    case 'candlestick':
      return TraceType.CANDLESTICK;

    default:
      console.warn(`[maidr] Unsupported plotly trace type: "${type}". Skipping.`);
      return null;
  }
}

function mapScatterMode(trace: PlotlyTrace): TraceType {
  const mode = trace.mode;
  if (!mode)
    return TraceType.SCATTER;
  // When both lines and markers exist, prefer LINE for navigational context.
  if (mode.includes('lines'))
    return isStepShape(trace.line?.shape) ? TraceType.STEP : TraceType.LINE;
  if (mode.includes('markers'))
    return TraceType.SCATTER;
  return TraceType.SCATTER;
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
  traces: PlotlyTrace[];
  calcdata: PlotlyCalcData[][];
  traceIndices: number[];
}

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

    const xAxisId = trace.xaxis ?? 'x';
    const yAxisId = trace.yaxis ?? 'y';
    const key = `${xAxisId}${yAxisId}`;

    if (!map.has(key)) {
      map.set(key, {
        xAxisId,
        yAxisId,
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
  const boxTraces: TraceEntry[] = [];
  const barTraces: TraceEntry[] = [];
  const violinTraces: TraceEntry[] = [];
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
    } else if (entry.maidrType === TraceType.BOX) {
      boxTraces.push(entry);
    } else if (entry.maidrType === TraceType.BAR) {
      barTraces.push(entry);
    } else if (entry.maidrType === TraceType.VIOLIN_KDE) {
      violinTraces.push(entry);
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

  // Build multi-box layer: all box traces in one layer.
  if (boxTraces.length > 0) {
    const layer = extractMultiBoxLayer(boxTraces, group, xLabel, yLabel, gd);
    if (layer)
      layers.push(layer);
  }

  // Build the violin pair: every violin in the subplot shares one box layer
  // and one KDE layer.
  if (violinTraces.length > 0) {
    layers.push(...extractViolinLayers(violinTraces, group, layout, xLabel, yLabel));
  }

  // Build bar layers: grouped/stacked/normalized for multiple bar traces.
  if (barTraces.length > 1) {
    const barmode = layout.barmode ?? 'group';
    const barnorm = layout.barnorm ?? '';

    if (barmode === 'group') {
      const layer = extractSegmentedBarLayer(barTraces, group, TraceType.DODGED, xLabel, yLabel, gd);
      if (layer)
        layers.push(layer);
    } else if (barmode === 'stack' || barmode === 'relative') {
      const type = barnorm === 'percent' || barnorm === 'fraction'
        ? TraceType.NORMALIZED
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
    const xDomain = readAxisDomain(getAxis(layout, panel.group.xAxisId));
    const yDomain = readAxisDomain(getAxis(layout, panel.group.yAxisId));
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

function readAxisDomain(axis: PlotlyAxis | undefined): DomainInterval | null {
  const domain = axis?.domain;
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
      return extractBarLayer(trace, calcdata, id, title, selectors, axes);

    case TraceType.HEATMAP:
      return extractHeatmapLayer(trace, id, title, selectors, axes, gd);

    case TraceType.HISTOGRAM:
      return extractHistogramLayer(trace, calcdata, id, title, selectors, axes, traceIndex, gd);

    case TraceType.CANDLESTICK:
      return extractCandlestickLayer(trace, id, title, selectors, axes);

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

function extractBarLayer(
  trace: PlotlyTrace,
  calcdata: PlotlyCalcData[],
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
): MaidrLayer | null {
  const x = trace.x;
  const y = trace.y;
  if (!x || !y)
    return null;

  const isHorizontal = trace.orientation === 'h';
  const len = Math.min(x.length, y.length);
  const data: BarPoint[] = [];

  for (let i = 0; i < len; i++) {
    data.push(barPoint(calcdata[i], x[i], y[i], isHorizontal));
  }

  if (data.length === 0)
    return null;

  return {
    id,
    type: TraceType.BAR,
    title,
    selectors,
    axes,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    data,
  };
}

// ---------------------------------------------------------------------------
// Line (multi-series)
// ---------------------------------------------------------------------------

/**
 * Builds one line-shaped layer from every line (or step) trace in a subplot.
 *
 * Step traces reuse this because their point shape is identical — plotly
 * varies only how the segments between samples are drawn, not the samples
 * themselves — so `step` differs from `line` here by its layer type and the
 * convention it announces.
 */
function extractMultiLineLayer(
  lineTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[],
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
  step?: { type: TraceType.STEP; stepDirection?: StepDirection },
): MaidrLayer | null {
  const data: LinePoint[][] = [];
  const legend: string[] = [];

  for (const { trace } of lineTraces) {
    const x = trace.x;
    const y = trace.y;
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

  // All line traces in the same subplot share the same unscoped selector
  // (e.g. `.subplot.xy .trace.scatter .point`), so any trace index works here.
  const selectors = generatePlotlySelectors(
    step?.type ?? TraceType.LINE,
    lineTraces[0].globalIdx,
    gd,
  );

  return {
    id: String(lineTraces[0].globalIdx),
    type: step?.type ?? TraceType.LINE,
    title: legend.length === 1 ? legend[0] : undefined,
    selectors,
    axes,
    ...(step?.stepDirection ? { stepDirection: step.stepDirection } : {}),
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
    const { trace, calcIdx } = boxTraces[boxIdx];
    const cd = group.calcdata[calcIdx] ?? [];
    const nthChild = boxIdx + 1;

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
  const category = resolveViolinCategory(cd.pos, posAxis);
  if (violinsInTrace > 1 && category) {
    return trace.name ? `${trace.name}, ${category}` : category;
  }
  return trace.name ?? category ?? '';
}

function resolveViolinCategory(
  pos: number | string | undefined,
  posAxis: PlotlyAxis | undefined,
): string | undefined {
  if (typeof pos === 'string')
    return pos;
  if (pos === undefined)
    return undefined;

  const categories = posAxis?._categories;
  if (categories && pos >= 0 && pos < categories.length)
    return String(categories[pos]);
  return String(pos);
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
  if (!trace.z || trace.z.length === 0)
    return null;

  const numCols = trace.z[0]?.length ?? 0;
  const numRows = trace.z.length;
  if (numCols === 0)
    return null;

  // Ensure labels match z dimensions (trim if Plotly provides extras).
  const xLabels = trace.x ? trace.x.slice(0, numCols).map(String) : trace.z[0].map((_, i) => String(i));
  const yLabels = trace.y ? trace.y.slice(0, numRows).map(String) : trace.z.map((_, i) => String(i));

  const data: HeatmapData = {
    x: xLabels,
    y: yLabels,
    points: trace.z,
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
// Segmented bars (dodged / stacked / normalized)
// ---------------------------------------------------------------------------

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
): MaidrLayer | null {
  const data: SegmentedPoint[][] = [];

  // Check orientation from first trace (all traces in a group share orientation).
  const isHorizontal = barTraces[0]?.trace.orientation === 'h';

  for (const { trace, calcIdx } of barTraces) {
    const x = trace.x;
    const y = trace.y;
    if (!x || !y)
      continue;

    const cd = group.calcdata[calcIdx] ?? [];
    const z = trace.name ?? `Series ${data.length + 1}`;
    const len = Math.min(x.length, y.length);
    const series: SegmentedPoint[] = [];

    for (let i = 0; i < len; i++) {
      series.push({ ...barPoint(cd[i], x[i], y[i], isHorizontal), z });
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
