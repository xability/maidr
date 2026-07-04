/**
 * Pure logic for translating MAIDR navigation positions back into Chart.js
 * element indices (dataset index + element index).
 *
 * MAIDR extraction skips gap markers and, for axis-stacked panels, partitions
 * `chart.data.datasets` across subplots — so neither MAIDR's `col` nor its
 * `row` can be used as a Chart.js index directly. The lookups built here keep
 * highlight resolution O(1) and aligned with the original chart elements.
 */

import type { HeatmapData, MaidrLayer } from '../../type/grammar';
import type { ChartJsActiveElement, ChartJsChart, ChartJsDataValue } from './types';
import { TraceType } from '../../type/grammar';
import { isMatrixValue, isPointValue, toFiniteNumber } from './extractor';

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
}

function isSegmentedType(type: string): boolean {
  return type === TraceType.STACKED || type === TraceType.DODGED || type === TraceType.NORMALIZED;
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
  const datasets = chart.data.datasets;

  for (const layer of layers) {
    switch (layer.type) {
      case TraceType.SCATTER: {
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        scatterBuckets.set(layer.id, buildScatterBuckets(datasets[dsIdx]?.data ?? []));
        break;
      }
      case TraceType.BAR: {
        // Single-dataset bar: one MAIDR row backed by the layer's dataset.
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        barLineIndices.set(layer.id, [finiteIndices(datasets[dsIdx]?.data ?? [])]);
        break;
      }
      case TraceType.LINE: {
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

  return { scatterBuckets, barLineIndices, heatmapIndices };
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

  // Bar / line: MAIDR row = dataset, col = point (into the gap-skipped list).
  // Map col back to the original Chart.js element index so highlights stay
  // aligned when the dataset contains gap markers.
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
