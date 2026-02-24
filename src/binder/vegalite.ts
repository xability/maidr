/**
 * Vega-Lite to MAIDR adapter.
 *
 * Extracts data and encoding information from a Vega-Lite specification
 * (and optionally its compiled Vega view) and produces a MAIDR JSON schema
 * that can be passed to the `<Maidr>` component or the script-tag entry point.
 *
 * @remarks
 * Vega / Vega-Lite are **peer dependencies** — this module only references
 * their public API surface through lightweight type aliases so that the MAIDR
 * bundle does not ship the libraries.
 */

import type {
  BarPoint,
  BoxPoint,
  HeatmapData,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
} from '../type/grammar';
import { Orientation, TraceType } from '../type/grammar';

// ---------------------------------------------------------------------------
// Lightweight type aliases for Vega / Vega-Lite objects so we don't
// import the actual libraries.
// ---------------------------------------------------------------------------

/** Minimal subset of a Vega `View` that the adapter needs. */
export interface VegaView {
  data: (name: string) => Record<string, unknown>[];
  signal: (name: string) => unknown;
  getState: (options?: Record<string, unknown>) => Record<string, unknown>;
  container: () => HTMLElement;
}

/** Minimal Vega-Lite top-level spec shape. */
export interface VegaLiteSpec {
  $schema?: string;
  title?: string | { text?: string };
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

interface VegaLiteEncoding {
  x?: VegaLiteChannelDef;
  y?: VegaLiteChannelDef;
  color?: VegaLiteChannelDef;
  fill?: VegaLiteChannelDef;
  row?: VegaLiteChannelDef;
  column?: VegaLiteChannelDef;
}

interface VegaLiteChannelDef {
  field?: string;
  type?: string;
  aggregate?: string;
  title?: string;
  axis?: { title?: string } | null;
  bin?: boolean | Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link vegaLiteToMaidr}.
 */
export interface VegaLiteToMaidrOptions {
  /** Override the chart id (defaults to `"vl-chart"`). */
  id?: string;
  /** Override the chart title (extracted from spec by default). */
  title?: string;
}

/**
 * Convert a Vega-Lite spec (and optionally its compiled Vega view) into a
 * MAIDR-compatible schema.
 *
 * @param spec - The Vega-Lite specification object.
 * @param view - Optional compiled Vega view for runtime data extraction.
 * @param options - Optional overrides.
 * @returns A complete {@link Maidr} schema ready for MAIDR consumption.
 */
export function vegaLiteToMaidr(
  spec: VegaLiteSpec,
  view?: VegaView,
  options?: VegaLiteToMaidrOptions,
): Maidr {
  const id = options?.id ?? 'vl-chart';
  const title = options?.title ?? extractTitle(spec);

  // Handle composite views (concat / facet).
  if (spec.hconcat) {
    return buildConcatMaidr(id, title, spec.hconcat, 'horizontal', view);
  }
  if (spec.vconcat) {
    return buildConcatMaidr(id, title, spec.vconcat, 'vertical', view);
  }
  if (spec.concat) {
    return buildConcatMaidr(id, title, spec.concat, 'wrap', view);
  }

  // Handle layered specs.
  const isLayered = spec.layer != null && spec.layer.length > 0;
  if (isLayered) {
    const layers = spec.layer!.map((layerSpec, i) =>
      convertLayerSpec(layerSpec, i, view, spec.encoding, isLayered),
    ).filter(Boolean) as MaidrLayer[];

    return {
      id,
      title,
      subplots: [[{ layers }]],
    };
  }

  // Single view.
  const layer = convertLayerSpec(spec, 0, view, undefined, false);
  if (!layer) {
    return { id, title, subplots: [[{ layers: [] }]] };
  }
  return {
    id,
    title,
    subplots: [[{ layers: [layer] }]],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractTitle(spec: VegaLiteSpec): string {
  if (!spec.title)
    return 'Vega-Lite Chart';
  if (typeof spec.title === 'string')
    return spec.title;
  return spec.title.text ?? 'Vega-Lite Chart';
}

function getMarkType(spec: VegaLiteSpec): string | null {
  if (!spec.mark)
    return null;
  return typeof spec.mark === 'string' ? spec.mark : spec.mark.type;
}

/** Map Vega-Lite mark types to MAIDR trace types. */
function markToTraceType(mark: string): TraceType | null {
  switch (mark) {
    case 'bar':
      return TraceType.BAR;
    case 'line':
      return TraceType.LINE;
    case 'point':
    case 'circle':
    case 'square':
      return TraceType.SCATTER;
    case 'area':
      return TraceType.LINE;
    case 'rect':
      return TraceType.HEATMAP;
    case 'boxplot':
      return TraceType.BOX;
    case 'tick':
      return TraceType.BAR;
    default:
      return null;
  }
}

/** Map Vega-Lite mark types to Vega CSS class names used in the SVG. */
function markToCssClass(mark: string): string {
  switch (mark) {
    case 'bar':
    case 'rect':
      return 'mark-rect';
    case 'line':
      return 'mark-line';
    case 'area':
      return 'mark-area';
    case 'point':
    case 'circle':
    case 'square':
      return 'mark-symbol';
    case 'tick':
      return 'mark-tick';
    case 'boxplot':
      return 'mark-rect';
    default:
      return `mark-${mark}`;
  }
}

/**
 * Build a CSS selector for individual mark elements rendered by Vega.
 *
 * Vega uses different class naming for single-view vs layered specs:
 * - Single view: `g.mark-rect.role-mark.marks path`
 * - Layered view: `g.mark-rect.role-mark.layer_0_marks path`
 */
function buildSelector(mark: string, layerIndex: number, isLayered: boolean): string {
  const cssClass = markToCssClass(mark);
  const childElement = mark === 'tick' ? 'line' : 'path';
  const marksClass = isLayered ? `layer_${layerIndex}_marks` : 'marks';
  return `g.${cssClass}.role-mark.${marksClass} ${childElement}`;
}

/**
 * Build an array of CSS selectors for line/area charts (one per series).
 *
 * Line marks in Vega render each series as a single `<path>` element inside
 * a mark group. For multi-series lines, the `color` encoding produces one
 * `<path>` per group.
 */
function buildLineSelectors(
  seriesCount: number,
  layerIndex: number,
  isLayered: boolean,
): string[] {
  const marksClass = isLayered ? `layer_${layerIndex}_marks` : 'marks';
  const selectors: string[] = [];
  for (let i = 0; i < seriesCount; i++) {
    selectors.push(`g.mark-line.role-mark.${marksClass} path:nth-child(${i + 1})`);
  }
  return selectors;
}

/** Extract axis label from encoding channel. */
function getAxisLabel(channel?: VegaLiteChannelDef): string {
  if (!channel)
    return '';
  if (channel.axis && channel.axis.title != null)
    return channel.axis.title;
  if (channel.title)
    return channel.title;
  return channel.field ?? '';
}

/**
 * Resolve the data array for a layer.
 *
 * Tries the compiled Vega view first (more accurate since it includes
 * aggregations, filters, and other transforms), then falls back to the
 * spec's inline data.
 */
function resolveData(
  spec: VegaLiteSpec,
  view?: VegaView,
): Record<string, unknown>[] {
  // Common Vega dataset names produced by the VL compiler.
  const datasetNames = ['data_0', 'source_0', 'data_1', 'source', 'data_2'];
  if (view) {
    for (const name of datasetNames) {
      try {
        const rows = view.data(name);
        if (rows && rows.length > 0)
          return rows;
      } catch {
        // dataset may not exist — try next
      }
    }
  }

  // Inline data fallback.
  if (spec.data && typeof spec.data === 'object') {
    const d = spec.data as { values?: Record<string, unknown>[] };
    if (Array.isArray(d.values))
      return d.values;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Data extraction per chart type
// ---------------------------------------------------------------------------

function extractBarData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): BarPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';

  // Determine which axis is the category and which is the measure.
  const xIsQuantitative = encoding.x?.type === 'quantitative'
    || encoding.x?.aggregate != null;
  const yIsQuantitative = encoding.y?.type === 'quantitative'
    || encoding.y?.aggregate != null;

  return rows.map((row) => {
    if (xIsQuantitative && !yIsQuantitative) {
      // Horizontal bar: x is measure, y is category.
      return {
        x: Number(row[xField] ?? 0),
        y: String(row[yField] ?? ''),
      };
    }
    // Default vertical bar: x is category, y is measure.
    return {
      x: String(row[xField] ?? ''),
      y: Number(row[yField] ?? 0),
    };
  });
}

function extractLineData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): LinePoint[][] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';
  const colorField = encoding.color?.field ?? encoding.fill?.field;

  if (colorField) {
    // Multi-series: group by color field.
    const groups = new Map<string, LinePoint[]>();
    for (const row of rows) {
      const key = String(row[colorField] ?? '');
      const pt: LinePoint = {
        x: (row[xField] ?? 0) as number | string,
        y: Number(row[yField] ?? 0),
        fill: key,
      };
      if (!groups.has(key))
        groups.set(key, []);
      groups.get(key)!.push(pt);
    }
    return [...groups.values()];
  }

  // Single series.
  const pts: LinePoint[] = rows.map(row => ({
    x: (row[xField] ?? 0) as number | string,
    y: Number(row[yField] ?? 0),
  }));
  return [pts];
}

function extractScatterData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): ScatterPoint[] {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';

  return rows.map(row => ({
    x: Number(row[xField] ?? 0),
    y: Number(row[yField] ?? 0),
  }));
}

function extractHeatmapData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): HeatmapData {
  const xField = encoding.x?.field ?? 'x';
  const yField = encoding.y?.field ?? 'y';
  const colorField = encoding.color?.field ?? encoding.fill?.field ?? 'value';

  // Collect unique x / y labels.
  const xLabelsSet = new Set<string>();
  const yLabelsSet = new Set<string>();
  for (const row of rows) {
    xLabelsSet.add(String(row[xField] ?? ''));
    yLabelsSet.add(String(row[yField] ?? ''));
  }
  const xLabels = [...xLabelsSet];
  const yLabels = [...yLabelsSet];

  // Build 2D points grid.
  const xIndex = new Map(xLabels.map((l, i) => [l, i]));
  const yIndex = new Map(yLabels.map((l, i) => [l, i]));
  const points: number[][] = yLabels.map(() => xLabels.map(() => 0));

  for (const row of rows) {
    const xi = xIndex.get(String(row[xField] ?? ''));
    const yi = yIndex.get(String(row[yField] ?? ''));
    if (xi !== undefined && yi !== undefined) {
      points[yi][xi] = Number(row[colorField] ?? 0);
    }
  }

  return { x: xLabels, y: yLabels, points };
}

function extractBoxData(
  rows: Record<string, unknown>[],
  encoding: VegaLiteEncoding,
): BoxPoint[] {
  const catField = encoding.x?.field ?? encoding.y?.field ?? 'x';
  const valField = encoding.x?.type === 'quantitative'
    ? (encoding.x?.field ?? 'x')
    : (encoding.y?.field ?? 'y');

  // Group values by category.
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[catField] ?? '');
    const val = Number(row[valField] ?? 0);
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key)!.push(val);
  }

  const result: BoxPoint[] = [];
  for (const [fill, values] of groups) {
    values.sort((a, b) => a - b);
    const n = values.length;
    const q1 = percentile(values, 0.25);
    const q2 = percentile(values, 0.5);
    const q3 = percentile(values, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    const lowerOutliers = values.filter(v => v < lowerFence);
    const upperOutliers = values.filter(v => v > upperFence);
    const nonOutliers = values.filter(v => v >= lowerFence && v <= upperFence);

    result.push({
      fill,
      lowerOutliers,
      min: nonOutliers.length > 0 ? nonOutliers[0] : (n > 0 ? values[0] : 0),
      q1,
      q2,
      q3,
      max: nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : (n > 0 ? values[n - 1] : 0),
      upperOutliers,
    });
  }
  return result;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0)
    return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi)
    return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------------------------------------------------------------------------
// Layer conversion
// ---------------------------------------------------------------------------

function convertLayerSpec(
  spec: VegaLiteSpec,
  index: number,
  view?: VegaView,
  parentEncoding?: VegaLiteEncoding,
  isLayered?: boolean,
): MaidrLayer | null {
  const mark = getMarkType(spec);
  if (!mark)
    return null;

  const traceType = markToTraceType(mark);
  if (!traceType)
    return null;

  // Merge parent encoding (from layered spec) with layer encoding.
  const encoding: VegaLiteEncoding = {
    ...parentEncoding,
    ...spec.encoding,
  };

  const rows = resolveData(spec, view);

  const axes: MaidrLayer['axes'] = {
    x: getAxisLabel(encoding.x),
    y: getAxisLabel(encoding.y),
  };

  const layered = isLayered ?? false;

  let data: MaidrLayer['data'];
  let selectors: MaidrLayer['selectors'];
  let orientation: Orientation | undefined;

  switch (traceType) {
    case TraceType.BAR: {
      data = extractBarData(rows, encoding);
      selectors = buildSelector(mark, index, layered);
      // Detect horizontal bars.
      const xIsQuant = encoding.x?.type === 'quantitative'
        || encoding.x?.aggregate != null;
      const yIsQuant = encoding.y?.type === 'quantitative'
        || encoding.y?.aggregate != null;
      if (xIsQuant && !yIsQuant) {
        orientation = Orientation.HORIZONTAL;
      }
      break;
    }
    case TraceType.LINE: {
      const lineData = extractLineData(rows, encoding);
      data = lineData;
      // Line traces expect selectors as string[] (one per series).
      selectors = buildLineSelectors(lineData.length, index, layered);
      break;
    }
    case TraceType.SCATTER:
      data = extractScatterData(rows, encoding);
      selectors = buildSelector(mark, index, layered);
      break;
    case TraceType.HEATMAP:
      data = extractHeatmapData(rows, encoding);
      selectors = buildSelector(mark, index, layered);
      break;
    case TraceType.BOX:
      data = extractBoxData(rows, encoding);
      selectors = buildSelector(mark, index, layered);
      break;
    default:
      return null;
  }

  const layer: MaidrLayer = {
    id: String(index),
    type: traceType,
    selectors,
    axes,
    data,
  };

  if (orientation) {
    layer.orientation = orientation;
  }

  return layer;
}

// ---------------------------------------------------------------------------
// Composite views (concat / facet)
// ---------------------------------------------------------------------------

function buildConcatMaidr(
  id: string,
  title: string,
  specs: VegaLiteSpec[],
  direction: 'horizontal' | 'vertical' | 'wrap',
  view?: VegaView,
): Maidr {
  const subplotEntries: MaidrSubplot[] = specs.map((childSpec, i) => {
    // Handle child specs that are themselves layered.
    if (childSpec.layer) {
      const layers = childSpec.layer.map((layerSpec, j) =>
        convertLayerSpec(layerSpec, j, view, childSpec.encoding, true),
      ).filter(Boolean) as MaidrLayer[];
      return { layers };
    }
    const layer = convertLayerSpec(childSpec, i, view, undefined, false);
    return { layers: layer ? [layer] : [] };
  });

  // vconcat produces one subplot per row (column layout).
  // hconcat produces all subplots in a single row (row layout).
  let subplots: MaidrSubplot[][];
  if (direction === 'vertical') {
    subplots = subplotEntries.map(s => [s]);
  } else {
    subplots = [subplotEntries];
  }

  return { id, title, subplots };
}
