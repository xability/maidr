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
  const subplotGrid = buildSubplotGrid(subplotMap, fullLayout, gd);

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
    if (calcdata && calcdata[i]) {
      group.calcdata.push(calcdata[i]);
    }
  }

  return map;
}

function buildSubplotGrid(
  subplotMap: Map<string, SubplotGroup>,
  layout: PlotlyFullLayout,
  gd: PlotlyGraphDiv,
): MaidrSubplot[][] {
  // For now, treat all subplots as a single row.
  // TODO: Use layout.grid to arrange into proper 2D grid.
  const subplots: MaidrSubplot[] = [];

  for (const [, group] of subplotMap) {
    const xAxis = getAxis(layout, group.xAxisId);
    const yAxis = getAxis(layout, group.yAxisId);
    const xLabel = extractAxisLabel(xAxis);
    const yLabel = extractAxisLabel(yAxis);

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

    if (layers.length > 0) {
      subplots.push({ layers });
    }
  }

  if (subplots.length === 0)
    return [];
  return [subplots]; // Single row for now.
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
    axes.x = xLabel;
  if (yLabel)
    axes.y = yLabel;

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
      const xLabel = typeof axes?.x === 'string' ? axes.x : undefined;
      const yLabel = typeof axes?.y === 'string' ? axes.y : undefined;

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
    if (isHorizontal) {
      data.push({ x: y[i], y: x[i] }); // Swap for horizontal bars.
    } else {
      data.push({ x: x[i], y: y[i] });
    }
  }

  if (data.length === 0)
    return null;

  // For horizontal bars, swap axis labels and set orientation.
  const barAxes = isHorizontal
    ? { ...axes, x: axes?.y, y: axes?.x }
    : axes;

  return {
    id,
    type: TraceType.BAR,
    title,
    selectors,
    axes: barAxes,
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
      series.push({
        x: x[i] as number | string,
        y: Number(y[i]),
        fill: seriesName,
      });
    }

    data.push(series);
    legend.push(seriesName);
  }

  if (data.length === 0)
    return null;

  const axes: MaidrLayer['axes'] = {};
  if (xLabel)
    axes.x = xLabel;
  if (yLabel)
    axes.y = yLabel;

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

    // Build individual selectors for each outlier point (compatible with all browsers).
    const lowerOutliersSel: string[] = [];
    for (let oi = 1; oi <= lowerCount; oi++) {
      lowerOutliersSel.push(`${pointsBase} > path.point:nth-child(${oi})`);
    }
    const upperOutliersSel: string[] = [];
    for (let oi = lowerCount + 1; oi <= lowerCount + upperCount; oi++) {
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
    axes.x = xLabel;
  if (yLabel)
    axes.y = yLabel;

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
      fill,
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
      fill,
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

  // Set the fill axis label for z-values from the colorbar title, or default.
  const fillLabel = extractColorbarTitle(trace) ?? 'Value';
  const heatmapAxes = { ...axes, fill: fillLabel };

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

    const horizontal = trace.orientation === 'h';
    const fill = trace.name ?? `Series ${data.length + 1}`;
    const len = Math.min(x.length, y.length);
    const series: SegmentedPoint[] = [];

    for (let i = 0; i < len; i++) {
      if (horizontal) {
        series.push({ x: y[i], y: x[i], fill });
      } else {
        series.push({ x: x[i], y: y[i], fill });
      }
    }

    data.push(series);
  }

  if (data.length === 0)
    return null;

  // For horizontal bars, swap axis labels.
  const axes: MaidrLayer['axes'] = {};
  if (isHorizontal) {
    if (yLabel)
      axes.x = yLabel;
    if (xLabel)
      axes.y = xLabel;
  } else {
    if (xLabel)
      axes.x = xLabel;
    if (yLabel)
      axes.y = yLabel;
  }

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
