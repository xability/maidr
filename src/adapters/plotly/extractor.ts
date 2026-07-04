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

function extractTitle(layout: PlotlyLayout): string | undefined {
  return extractTextOrObject(layout.title);
}

function extractAxisLabel(axis: PlotlyAxis | undefined): string | undefined {
  return extractTextOrObject(axis?.title);
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
      return mapScatterMode(trace.mode);

    case 'bar':
      return TraceType.BAR;

    case 'box':
      return TraceType.BOX;

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

function mapScatterMode(mode?: string): TraceType {
  if (!mode)
    return TraceType.SCATTER;
  // When both lines and markers exist, prefer LINE for navigational context.
  if (mode.includes('lines'))
    return TraceType.LINE;
  if (mode.includes('markers'))
    return TraceType.SCATTER;
  return TraceType.SCATTER;
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
  const lineTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[] = [];
  const boxTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[] = [];
  const barTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[] = [];
  const otherTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[] = [];

  for (let i = 0; i < group.traces.length; i++) {
    const trace = group.traces[i];
    const maidrType = mapTraceType(trace);
    if (maidrType === TraceType.LINE) {
      lineTraces.push({ trace, calcIdx: i, globalIdx: group.traceIndices[i] });
    } else if (maidrType === TraceType.BOX) {
      boxTraces.push({ trace, calcIdx: i, globalIdx: group.traceIndices[i] });
    } else if (maidrType === TraceType.BAR) {
      barTraces.push({ trace, calcIdx: i, globalIdx: group.traceIndices[i] });
    } else {
      otherTraces.push({ trace, calcIdx: i, globalIdx: group.traceIndices[i] });
    }
  }

  // Build multi-line layer if applicable.
  if (lineTraces.length > 0) {
    const layer = extractMultiLineLayer(lineTraces, xLabel, yLabel, gd);
    if (layer)
      layers.push(layer);
  }

  // Build multi-box layer: all box traces in one layer.
  if (boxTraces.length > 0) {
    const layer = extractMultiBoxLayer(boxTraces, group, xLabel, yLabel, gd);
    if (layer)
      layers.push(layer);
  }

  // Build bar layers: grouped/stacked/normalized for multiple bar traces.
  if (barTraces.length > 1) {
    const barmode = layout.barmode ?? 'group';
    const barnorm = layout.barnorm ?? '';

    if (barmode === 'group') {
      const layer = extractSegmentedBarLayer(barTraces, TraceType.DODGED, xLabel, yLabel, gd);
      if (layer)
        layers.push(layer);
    } else if (barmode === 'stack' || barmode === 'relative') {
      const type = barnorm === 'percent' || barnorm === 'fraction'
        ? TraceType.NORMALIZED
        : TraceType.STACKED;
      const layer = extractSegmentedBarLayer(barTraces, type, xLabel, yLabel, gd);
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
  for (const { trace, calcIdx, globalIdx } of otherTraces) {
    const maidrType = mapTraceType(trace);
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
    const label = extractAxisLabel(axis);
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
      return extractBarLayer(trace, id, title, selectors, axes);

    case TraceType.HEATMAP:
      return extractHeatmapLayer(trace, id, title, selectors, axes);

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

function extractBarLayer(
  trace: PlotlyTrace,
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
    // Plotly stores the bar value on `x` for horizontal bars and on `y` for
    // vertical, which already matches AbstractBarPlot's per-orientation reading
    // (value from `point.x` when HORIZONTAL, from `point.y` otherwise). No swap
    // is needed — and the plotly x/y axes already line up with the layer axes.
    data.push({ x: x[i], y: y[i] });
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

function extractMultiLineLayer(
  lineTraces: { trace: PlotlyTrace; calcIdx: number; globalIdx: number }[],
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
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
    TraceType.LINE,
    lineTraces[0].globalIdx,
    gd,
  );

  return {
    id: String(lineTraces[0].globalIdx),
    type: TraceType.LINE,
    title: legend.length === 1 ? legend[0] : undefined,
    selectors,
    axes,
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
// Heatmap
// ---------------------------------------------------------------------------

function extractHeatmapLayer(
  trace: PlotlyTrace,
  id: string,
  title: string | undefined,
  selectors: string | undefined,
  axes: MaidrLayer['axes'],
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
  const fillLabel = extractColorbarTitle(trace) ?? 'Value';
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
 * Extracts the colorbar title from a plotly trace, if present.
 * Filters out Plotly's editable placeholder titles (e.g., "Click to enter Colorscale title").
 */
function extractColorbarTitle(trace: PlotlyTrace): string | undefined {
  const title = extractTextOrObject(trace.colorbar?.title);

  // Filter out Plotly's editable placeholder titles
  if (title && title.toLowerCase().includes('click to enter')) {
    return undefined;
  }

  return title;
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
  type: TraceType,
  xLabel: string | undefined,
  yLabel: string | undefined,
  gd: PlotlyGraphDiv,
): MaidrLayer | null {
  const data: SegmentedPoint[][] = [];

  // Check orientation from first trace (all traces in a group share orientation).
  const isHorizontal = barTraces[0]?.trace.orientation === 'h';

  for (const { trace } of barTraces) {
    const x = trace.x;
    const y = trace.y;
    if (!x || !y)
      continue;

    const z = trace.name ?? `Series ${data.length + 1}`;
    const len = Math.min(x.length, y.length);
    const series: SegmentedPoint[] = [];

    for (let i = 0; i < len; i++) {
      // Plotly stores the value on `x` for horizontal bars and on `y` for
      // vertical, matching AbstractBarPlot's per-orientation reading — no swap.
      series.push({ x: x[i], y: y[i], z });
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
