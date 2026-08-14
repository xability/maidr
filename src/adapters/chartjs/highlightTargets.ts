/**
 * Pure logic for translating MAIDR navigation positions back into Chart.js
 * element indices (dataset index + element index).
 *
 * MAIDR extraction skips gap markers and, for axis-stacked panels, partitions
 * `chart.data.datasets` across subplots — so neither MAIDR's `col` nor its
 * `row` can be used as a Chart.js index directly. The lookups built here keep
 * highlight resolution O(1) and aligned with the original chart elements.
 */

import type { GanttData, HeatmapData, MaidrLayer } from '../../type/grammar';
import type { ChartJsActiveElement, ChartJsChart, ChartJsDataset, ChartJsDataValue } from './types';
import { TraceType } from '../../type/grammar';
import { isMatrixValue, isPointValue, isRangeValue, toFiniteNumber } from './extractor';

/**
 * Figure-unique layer id → original Chart.js dataset indices backing that
 * layer, in MAIDR row order. Produced by `extractChartData`.
 */
export type LayerDatasetIndices = ReadonlyMap<string, number[]>;

/**
 * Per-layer lookups that translate a MAIDR navigation position into the
 * original Chart.js element index. MAIDR extraction skips gap markers, so these
 * maps re-derive the raw indices from the chart to keep highlights aligned.
 */
export interface TargetMaps {
  /** Scatter: `scatterBuckets[layerId][col]` lists the Chart.js dataset indices sharing that X. */
  scatterBuckets: Map<string, number[][]>;
  /** Bar/line: `barLineIndices[layerId][row][col]` is the original Chart.js element index (gaps skipped). */
  barLineIndices: Map<string, number[][]>;
  /** Heatmap: `heatmapIndices[layerId]` maps `"x\0y"` to the flat Chart.js element index. */
  heatmapIndices: Map<string, Map<string, number>>;
  /** Gantt: `ganttTargets[layerId][lane][interval]` is the element drawing it. */
  ganttTargets: Map<string, ChartJsActiveElement[][]>;
}

function isSegmentedType(type: string): boolean {
  return type === TraceType.STACKED
    || type === TraceType.DODGED
    || type === TraceType.NORMALIZED
    // A diverging chart is a stacked one whose sides carry opposite signs, so
    // it is drawn from the same grid of elements and indexes identically.
    || type === TraceType.DIVERGING;
}

/**
 * Original indices of a dataset's finite (non-gap) entries, in dataset order.
 * Mirrors the extractor's gap-skipping so MAIDR's `col` (an index into the
 * skipped list) maps back to the Chart.js element index.
 */
function finiteIndices(data: ChartJsDataValue[]): number[] {
  const indices: number[] = [];
  data.forEach((value, i) => {
    if (toFiniteNumber(value) !== null)
      indices.push(i);
  });
  return indices;
}

/**
 * Original indices of a dataset's floating-bar entries, in dataset order.
 * The same job {@link finiteIndices} does for a magnitude: a `[start, end]`
 * pair is not a number, so the gap-skipping test has to be its own.
 */
function rangeIndices(data: ChartJsDataValue[]): number[] {
  const indices: number[] = [];
  data.forEach((value, i) => {
    if (isRangeValue(value))
      indices.push(i);
  });
  return indices;
}

/**
 * Mirror the gantt extractor's lane walk to map a MAIDR (lane, interval)
 * position onto the Chart.js element drawing it.
 *
 * A gantt is the one layer whose grid is transposed against Chart.js's own:
 * MAIDR's row is the *category* (Chart.js's element index) and its column is
 * which dataset booked that lane, so neither axis of the usual bar/line
 * lookup applies and the pair is carried whole.
 *
 * @param datasets - The chart's datasets
 * @param dsIndices - The dataset indices backing the layer, in chart order
 * @param laneCount - How many lanes the emitted payload holds
 * @returns One element per interval, lanes x intervals
 */
function buildGanttTargets(
  datasets: ChartJsDataset[],
  dsIndices: number[],
  laneCount: number,
): ChartJsActiveElement[][] {
  const lanes: ChartJsActiveElement[][] = [];
  for (let lane = 0; lane < laneCount; lane++) {
    const intervals: ChartJsActiveElement[] = [];
    for (const datasetIndex of dsIndices) {
      if (isRangeValue(datasets[datasetIndex]?.data[lane] ?? null))
        intervals.push({ datasetIndex, index: lane });
    }
    lanes.push(intervals);
  }
  return lanes;
}

/**
 * Mirror `ScatterTrace`'s X-bucket construction (`src/model/scatter.ts:86-100`)
 * to map MAIDR's `col` (an X-bucket index) back to one or more original
 * Chart.js dataset indices. Points are sorted by X, then Y; consecutive points
 * sharing an X form a bucket. Reads the raw dataset (not the filtered layer
 * data) so bucket entries are original, highlight-aligned indices.
 */
function buildScatterBuckets(data: ChartJsDataValue[]): number[][] {
  // Track original dataset indices through the (x, y) sort so bucket entries are
  // Chart.js element indices, not positions in the gap-filtered point list.
  const indexed: { x: number; y: number; i: number }[] = [];
  data.forEach((value, i) => {
    if (isPointValue(value))
      indexed.push({ x: value.x, y: value.y, i });
  });
  indexed.sort((a, b) => a.x - b.x || a.y - b.y);
  const buckets: number[][] = [];
  let currentX: number | null = null;
  for (const { x, i } of indexed) {
    if (currentX === null || currentX !== x) {
      currentX = x;
      buckets.push([]);
    }
    buckets[buckets.length - 1].push(i);
  }
  return buckets;
}

/**
 * Map each `"x\0y"` cell key to its flat Chart.js element index. The matrix
 * plugin's data order is arbitrary (commonly x-major), so highlighting must
 * look up cells by coordinate rather than assuming a y-major grid.
 */
function buildHeatmapIndex(data: ChartJsDataValue[]): Map<string, number> {
  const index = new Map<string, number>();
  data.forEach((value, i) => {
    if (isMatrixValue(value))
      index.set(`${String(value.x)}\0${String(value.y)}`, i);
  });
  return index;
}

/** Chart.js dataset index backing the given MAIDR row of a layer. */
function rowDatasetIndex(
  layerDatasetIndices: LayerDatasetIndices,
  layerId: string,
  row: number,
): number {
  return layerDatasetIndices.get(layerId)?.[row] ?? row;
}

/** Chart.js dataset index backing a single-dataset layer. */
function firstDatasetIndex(
  layerDatasetIndices: LayerDatasetIndices,
  layerId: string,
): number {
  return layerDatasetIndices.get(layerId)?.[0] ?? 0;
}

/**
 * Precompute all per-layer position→index lookups from the raw chart, once at
 * init. This keeps highlight resolution O(1) and aligned with the original
 * Chart.js element indices even though MAIDR extraction skips gap markers and
 * axis-stacked panels see only a partition of the datasets.
 */
export function computeTargetMaps(
  chart: ChartJsChart,
  layers: MaidrLayer[],
  layerDatasetIndices: LayerDatasetIndices,
): TargetMaps {
  const scatterBuckets = new Map<string, number[][]>();
  const barLineIndices = new Map<string, number[][]>();
  const heatmapIndices = new Map<string, Map<string, number>>();
  const ganttTargets = new Map<string, ChartJsActiveElement[][]>();
  const datasets = chart.data.datasets;

  for (const layer of layers) {
    switch (layer.type) {
      case TraceType.SCATTER: {
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        scatterBuckets.set(layer.id, buildScatterBuckets(datasets[dsIdx]?.data ?? []));
        break;
      }
      case TraceType.BAR:
      case TraceType.PIE: {
        // Single-dataset bar, or one pie/doughnut ring: a single MAIDR row
        // backed by the layer's own dataset. A pie's row is always 0 and its
        // col is the slice, which is the same shape.
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        barLineIndices.set(layer.id, [finiteIndices(datasets[dsIdx]?.data ?? [])]);
        break;
      }
      case TraceType.WATERFALL: {
        // One series of floating bars: a single MAIDR row whose columns are
        // the steps. Their entries are `[start, end]` pairs, so the finite
        // test a magnitude uses would skip every one of them.
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        barLineIndices.set(layer.id, [rangeIndices(datasets[dsIdx]?.data ?? [])]);
        break;
      }
      case TraceType.GANTT: {
        // Lanes come from the payload rather than the datasets so an empty
        // lane keeps its row — the extractor emits one per category.
        const lanes = (layer.data as GanttData).points.length;
        const dsIndices = layerDatasetIndices.get(layer.id) ?? datasets.map((_, i) => i);
        ganttTargets.set(layer.id, buildGanttTargets(datasets, dsIndices, lanes));
        break;
      }
      // A filled band is drawn from the same dataset a line is, one per
      // series, so it indexes identically — the fill changes the mark, not
      // where a point lives. A staircase is the same again, and so are the
      // spokes of a radar and the ranks of a bump chart: one row per series,
      // one column per position along it.
      case TraceType.LINE:
      case TraceType.AREA:
      case TraceType.STACKED_AREA:
      case TraceType.NORMALIZED_AREA:
      case TraceType.STEP:
      case TraceType.BUMP:
      case TraceType.RADAR:
      case TraceType.POLAR_AREA: {
        // One MAIDR row per backing dataset, in MAIDR row order.
        const dsIndices = layerDatasetIndices.get(layer.id) ?? datasets.map((_, i) => i);
        barLineIndices.set(
          layer.id,
          dsIndices.map(dsIdx => finiteIndices(datasets[dsIdx]?.data ?? [])),
        );
        break;
      }
      case TraceType.HEATMAP: {
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        heatmapIndices.set(layer.id, buildHeatmapIndex(datasets[dsIdx]?.data ?? []));
        break;
      }
      default:
        break;
    }
  }

  return { scatterBuckets, barLineIndices, heatmapIndices, ganttTargets };
}

/**
 * Resolve a MAIDR navigation event into the Chart.js active elements that
 * should be highlighted. Returns an array because scatter X-buckets can
 * contain multiple points that share an X coordinate.
 */
export function resolveActiveTargets(
  layers: MaidrLayer[],
  maps: TargetMaps,
  layerDatasetIndices: LayerDatasetIndices,
  layerId: string,
  row: number,
  col: number,
): ChartJsActiveElement[] {
  const layer = layers.find(l => l.id === layerId);
  if (!layer)
    return [];

  // Segmented bars: MAIDR row = group (dataset), col = category (index).
  // The category grid is kept rectangular (gaps collapse to 0), so col is the
  // native Chart.js element index and needs no remapping.
  if (isSegmentedType(layer.type))
    return [{ datasetIndex: rowDatasetIndex(layerDatasetIndices, layerId, row), index: col }];

  // Scatter: col is an X-bucket; expand to all points sharing that X.
  if (layer.type === TraceType.SCATTER) {
    const buckets = maps.scatterBuckets.get(layer.id);
    if (!buckets || col < 0 || col >= buckets.length)
      return [];
    const datasetIndex = firstDatasetIndex(layerDatasetIndices, layer.id);
    return buckets[col].map(index => ({ datasetIndex, index }));
  }

  // Gantt: MAIDR row = lane (the Chart.js element index), col = which dataset
  // booked that lane. Both halves come from the prebuilt pair.
  if (layer.type === TraceType.GANTT) {
    const target = maps.ganttTargets.get(layer.id)?.[row]?.[col];
    return target ? [target] : [];
  }

  // Candlestick / OHLC: a single dataset of candles. MAIDR `col` selects the
  // candle; MAIDR `row` picks the OHLC field (volatility/open/high/low/close)
  // for audio/text and does NOT change which element to highlight.
  if (layer.type === TraceType.CANDLESTICK)
    return [{ datasetIndex: firstDatasetIndex(layerDatasetIndices, layer.id), index: col }];

  // Heatmap / Matrix: look the active cell up by coordinate (the matrix data
  // order is arbitrary). MAIDR's Heatmap model reverses the Y axis (row 0 =
  // bottom), so un-reverse to recover the original yLabel before the lookup.
  if (layer.type === TraceType.HEATMAP) {
    const hd = layer.data as HeatmapData;
    const originalYi = (hd.y.length - 1) - row;
    const xLabel = hd.x[col];
    const yLabel = hd.y[originalYi];
    if (xLabel === undefined || yLabel === undefined)
      return [];
    const flatIndex = maps.heatmapIndices.get(layer.id)?.get(`${xLabel}\0${yLabel}`);
    if (flatIndex === undefined)
      return [];
    return [{ datasetIndex: firstDatasetIndex(layerDatasetIndices, layer.id), index: flatIndex }];
  }

  // Bar / line / pie / waterfall: MAIDR row = dataset (always 0 for a pie,
  // whose slices are one row, and for a waterfall's single chain of steps),
  // col = point (into the gap-skipped list). Map col back to the
  // original Chart.js element index so highlights stay aligned when the dataset
  // contains gap markers.
  const indexMap = maps.barLineIndices.get(layer.id);
  const datasetIndex = rowDatasetIndex(layerDatasetIndices, layerId, row);
  if (indexMap) {
    const index = indexMap[row]?.[col];
    if (index === undefined)
      return [];
    return [{ datasetIndex, index }];
  }
  return [{ datasetIndex, index: col }];
}
