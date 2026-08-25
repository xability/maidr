/**
 * Pure logic for translating MAIDR navigation positions back into Chart.js
 * element indices (dataset index + element index).
 *
 * MAIDR extraction skips gap markers and, for axis-stacked panels, partitions
 * `chart.data.datasets` across subplots — so neither MAIDR's `col` nor its
 * `row` can be used as a Chart.js index directly. The lookups built here keep
 * highlight resolution O(1) and aligned with the original chart elements.
 */

import type { ChoroplethPoint, GanttData, HeatmapData, MaidrLayer, TreemapPoint } from '../../type/grammar';
import type { ChartJsActiveElement, ChartJsChart, ChartJsDataset, ChartJsDataValue } from './types';
import { TraceType } from '../../type/grammar';
import { drawnCategoryPositions, drawnErrorBarIndices, drawnGeoRows, isMatrixValue, isPointValue, isRangeValue, toFiniteNumber } from './extractor';

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
  /**
   * Point clouds: `pointTargets[layerId][i]` is the element drawing the layer's
   * `data[i]` — the table in the layer's own data order, not a grouping of it.
   *
   * MAIDR names a cloud's selection by data index (see
   * `NavigateCallback.pointIndices`), because a scatter selects a *set* of
   * points and no row/column pair can name one. Keeping the table in data order
   * is what lets this adapter answer that without re-deriving the model's
   * x-bucketing or its grid binning, which would drift from the model silently.
   *
   * Each entry names its own dataset rather than the layer naming one for all
   * of them, because a merged volcano or Manhattan is a single layer drawn
   * from several datasets — one per chromosome, typically.
   */
  pointTargets: Map<string, ChartJsActiveElement[]>;
  /** Bar/line: `barLineIndices[layerId][row][col]` is the original Chart.js element index (gaps skipped). */
  barLineIndices: Map<string, number[][]>;
  /** Heatmap: `heatmapIndices[layerId]` maps `"x\0y"` to the flat Chart.js element index. */
  heatmapIndices: Map<string, Map<string, number>>;
  /** Gantt: `ganttTargets[layerId][lane][interval]` is the element drawing it. */
  ganttTargets: Map<string, ChartJsActiveElement[][]>;
  /**
   * Treemap: `treemapIndices[layerId]` maps `"depth\0index"` to the flat
   * Chart.js element index.
   *
   * `TreemapTrace` addresses a node by depth and by its position within that
   * depth *across parents*, and the position is the order the nodes were
   * declared in. The extractor emits one point per drawn rectangle in the
   * plugin's own layout order, so counting the points per depth reproduces
   * exactly the addresses the model will use -- without re-deriving the tree,
   * which would drift from the model silently.
   */
  treemapIndices: Map<string, Map<string, number>>;
}

/**
 * Whether a layer is navigated as a cloud of points.
 *
 * `VolcanoTrace` extends `ScatterTrace`, so a volcano and a Manhattan are
 * positioned exactly as a scatter is — the threshold changes what is
 * announced, not where a point lives.
 */
function isPointCloudType(type: string): boolean {
  return type === TraceType.SCATTER
    || type === TraceType.VOLCANO
    || type === TraceType.MANHATTAN;
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
 * The dataset positions a bar-family layer's columns map to, in the order the
 * layer emits them.
 *
 * The bar family is read in the order its categories are *drawn*, which a
 * reversed axis turns round (#1015). Chart.js carries no CSS selectors, so
 * that looked like a one-sided change -- but the plugin outlines by index
 * through this table, and a table built in the written order names a
 * different bar from the one the reader was just told about (#1024).
 *
 * Built by the same walk the extractor emits the payload with, rather than by
 * reversing a written-order list: the two lists have to agree, and the surest
 * way for them to agree is for them to be the same walk.
 *
 * @param chart - The chart being read
 * @param data - The backing dataset's entries
 * @param keep - Which entries the payload kept, gaps having been skipped
 * @returns The dataset positions, in the payload's column order
 */
function drawnEntryIndices(
  chart: ChartJsChart,
  data: ChartJsDataValue[],
  keep: (value: ChartJsDataValue) => boolean,
): number[] {
  return drawnCategoryPositions(chart, data.length).filter(i => keep(data[i]));
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
 * The Chart.js element drawing each of a point layer's data entries, in the
 * layer's own `data` order.
 *
 * `extractScatterLayers` builds that data as
 * `group.indices.flatMap(i => datasetToScatterPoints(datasets[i]))`, keeping
 * every entry `isPointValue` accepts. This walks the same datasets in the same
 * order with the same filter, so the element at index `i` here drew `data[i]`
 * there.
 *
 * That correspondence is the whole contract: MAIDR names the points it has
 * highlighted by their position in the array this adapter supplied, and the
 * adapter inverts it by replaying its own extraction. Nothing about the model's
 * x-bucketing, its reading order or its grid binning is reconstructed here — a
 * copy of that would drift from the model silently and outline a confidently
 * wrong point.
 *
 * @param datasets - The chart's datasets
 * @param dsIndices - The dataset indices backing the layer, in MAIDR row order
 * @returns One element per point of the layer, in `layer.data` order
 */
function buildPointTargets(
  datasets: ChartJsDataset[],
  dsIndices: number[],
): ChartJsActiveElement[] {
  const targets: ChartJsActiveElement[] = [];
  for (const datasetIndex of dsIndices) {
    (datasets[datasetIndex]?.data ?? []).forEach((value, index) => {
      if (isPointValue(value))
        targets.push({ datasetIndex, index });
    });
  }
  return targets;
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
/**
 * Address every declared node the way `TreemapTrace` will.
 *
 * The model places a node at `(depth, position)` where depth is its path
 * length and position is its index *within that depth, across parents*, in
 * declaration order. Counting per depth over the declared list reproduces
 * that: the extractor emits one point per drawn rectangle in the plugin's
 * layout order, so a point's index in the list is also its Chart.js element
 * index.
 *
 * This holds because the treemap plugin draws every group level it was given
 * -- measured, a two-level chart yields elements for the continents as well as
 * the countries -- so the model never has to invent an ancestor that no
 * rectangle exists for. A producer that emitted leaves only would shift every
 * position, which is why the addresses are built from the emitted points
 * rather than from the chart.
 *
 * @param points - The layer's declared nodes, in emission order
 * @returns `"depth\0position"` to the element index drawing that node
 */
function buildTreemapIndex(points: readonly TreemapPoint[]): Map<string, number> {
  const index = new Map<string, number>();
  const seen = new Map<number, number>();

  points.forEach((point, element) => {
    const depth = point.path?.length ?? 0;
    const position = seen.get(depth) ?? 0;
    seen.set(depth, position + 1);
    index.set(`${depth}\0${position}`, element);
  });

  return index;
}

export function computeTargetMaps(
  chart: ChartJsChart,
  layers: MaidrLayer[],
  layerDatasetIndices: LayerDatasetIndices,
): TargetMaps {
  const pointTargets = new Map<string, ChartJsActiveElement[]>();
  const barLineIndices = new Map<string, number[][]>();
  const heatmapIndices = new Map<string, Map<string, number>>();
  const ganttTargets = new Map<string, ChartJsActiveElement[][]>();
  const treemapIndices = new Map<string, Map<string, number>>();
  const datasets = chart.data.datasets;

  for (const layer of layers) {
    switch (layer.type) {
      // A volcano and a Manhattan are scatters read through a threshold, so
      // they are addressed by the same data indices — over however many
      // datasets the declared layer merged.
      case TraceType.SCATTER:
      case TraceType.VOLCANO:
      case TraceType.MANHATTAN: {
        const dsIndices = layerDatasetIndices.get(layer.id)
          ?? [firstDatasetIndex(layerDatasetIndices, layer.id)];
        const targets = buildPointTargets(datasets, dsIndices);
        // An index only means anything if this table and `layer.data` are the
        // same list. They are built by the same walk over the same datasets, so
        // a mismatch means the chart moved underneath the extraction — and a
        // stale index would outline a mark chosen at random. Registering
        // nothing clears the overlay instead, which is the truthful answer.
        if (Array.isArray(layer.data) && targets.length === layer.data.length)
          pointTargets.set(layer.id, targets);
        break;
      }
      case TraceType.BAR:
      case TraceType.DOT:
      case TraceType.FUNNEL: {
        // Single-dataset bar, and the dot plot drawn by the same builder: a
        // single MAIDR row backed by the layer's own dataset, its columns in
        // the order the categories are drawn.
        //
        // A funnel comes out of that same builder, one layer per dataset, so
        // its row is its own dataset's -- which is why the extractor records
        // the mapping rather than leaving it to the every-dataset default.
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        const data = datasets[dsIdx]?.data ?? [];
        barLineIndices.set(
          layer.id,
          [drawnEntryIndices(chart, data, value => toFiniteNumber(value) !== null)],
        );
        break;
      }
      case TraceType.STACKED:
      case TraceType.DODGED:
      case TraceType.NORMALIZED:
      case TraceType.DIVERGING: {
        // A segmented grid is kept rectangular -- a gap collapses to 0 rather
        // than being skipped -- so every row shares one column map, and the
        // payload's own width is the category count that map has to cover.
        const width = Array.isArray(layer.data) && Array.isArray(layer.data[0])
          ? layer.data[0].length
          : 0;
        barLineIndices.set(layer.id, [drawnCategoryPositions(chart, width)]);
        break;
      }
      case TraceType.GAUGE:
      case TraceType.PIE: {
        // A pie's row is always 0 and its col is the slice; a gauge's only
        // position is the ring's first arc. Neither has a category axis to
        // reverse, so both keep the written order.
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        barLineIndices.set(layer.id, [finiteIndices(datasets[dsIdx]?.data ?? [])]);
        break;
      }
      case TraceType.DUMBBELL:
      case TraceType.WATERFALL: {
        // One series of floating bars: a single MAIDR row whose columns are
        // the steps, or the paired rows of a dumbbell. Their entries are
        // `[start, end]` pairs, so the finite test a magnitude uses would skip
        // every one of them.
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        const data = datasets[dsIdx]?.data ?? [];
        barLineIndices.set(layer.id, [drawnEntryIndices(chart, data, isRangeValue)]);
        break;
      }
      case TraceType.GANTT: {
        // Lanes come from the payload rather than the datasets so an empty
        // lane keeps its row — the extractor emits one per category.
        const lanes = (layer.data as GanttData).points.length;
        const dsIndices = layerDatasetIndices.get(layer.id) ?? datasets.map((_, i) => i);
        // `points` and `lanes` were emitted in drawn order, so the targets are
        // reordered to match rather than left in the order the rows were
        // written.
        const written = buildGanttTargets(datasets, dsIndices, lanes);
        ganttTargets.set(
          layer.id,
          drawnCategoryPositions(chart, lanes).map(lane => written[lane] ?? []),
        );
        break;
      }
      // A filled band is drawn from the same dataset a line is, one per
      // series, so it indexes identically — the fill changes the mark, not
      // where a point lives. A staircase is the same again, and so are the
      // ranks of a bump chart: one row per series, one column per position
      // along it. All six come out of `extractLineLayers`' one walk, so they
      // are read in the order the categories are drawn (#1029) and their map
      // is built by that same walk.
      case TraceType.LINE:
      case TraceType.AREA:
      case TraceType.STACKED_AREA:
      case TraceType.NORMALIZED_AREA:
      case TraceType.STEP:
      case TraceType.BUMP: {
        // One MAIDR row per backing dataset, in MAIDR row order.
        const dsIndices = layerDatasetIndices.get(layer.id) ?? datasets.map((_, i) => i);
        barLineIndices.set(
          layer.id,
          dsIndices.map(dsIdx =>
            drawnEntryIndices(chart, datasets[dsIdx]?.data ?? [], value =>
              toFiniteNumber(value) !== null)),
        );
        break;
      }
      // The same row-and-column shape, from walks of their own -- a survival
      // curve is extracted by `extractSurvivalLayer`, and the spokes of a
      // radar or a polar area are laid out around a radial `r` scale, which
      // has no Cartesian category axis to reverse. Keeping the written order
      // here is what keeps each of them paired with its own payload.
      case TraceType.SURVIVAL:
      case TraceType.RADAR:
      case TraceType.POLAR_AREA: {
        const dsIndices = layerDatasetIndices.get(layer.id) ?? datasets.map((_, i) => i);
        barLineIndices.set(
          layer.id,
          dsIndices.map(dsIdx => finiteIndices(datasets[dsIdx]?.data ?? [])),
        );
        break;
      }
      // An interval chart is one MAIDR row per dataset, columns along the
      // category axis -- the shape a line has. It cannot borrow the line
      // branch's walk, though: that tests the raw entries with
      // `toFiniteNumber`, which reads `.y` and so finds nothing at all on a
      // horizontal chart, whose data carry the estimate on `x`. The
      // extractor's own walk is shared instead, so the table and the payload
      // cannot drift (#1176).
      case TraceType.ERROR_BAR: {
        const dsIndices = layerDatasetIndices.get(layer.id) ?? datasets.map((_, i) => i);
        barLineIndices.set(
          layer.id,
          dsIndices.map(dsIdx => drawnErrorBarIndices(chart, dsIdx)),
        );
        break;
      }
      // A map's regions, in the order the payload announced them. Built even
      // for a banded map, because whether it is banded is a question about
      // the payload rather than about the chart, and it is asked at resolve
      // time in `resolveActiveTargets`.
      case TraceType.CHOROPLETH: {
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        barLineIndices.set(layer.id, [drawnGeoRows(chart, dsIdx).map(row => row.index)]);
        break;
      }
      case TraceType.HEATMAP: {
        const dsIdx = firstDatasetIndex(layerDatasetIndices, layer.id);
        heatmapIndices.set(layer.id, buildHeatmapIndex(datasets[dsIdx]?.data ?? []));
        break;
      }
      // A `chartjs-chart-graph` tree reads through `TreemapTrace` like any
      // other hierarchy, and its nodes are drawn one element each in dataset
      // order -- which is the order the payload emits them in, so the
      // treemap's own depth/position addressing applies unchanged.
      case TraceType.TREE:
      case TraceType.TREEMAP: {
        if (Array.isArray(layer.data))
          treemapIndices.set(layer.id, buildTreemapIndex(layer.data as TreemapPoint[]));
        break;
      }
      default:
        break;
    }
  }

  return { pointTargets, barLineIndices, heatmapIndices, ganttTargets, treemapIndices };
}

/**
 * Resolve a MAIDR navigation event into the Chart.js active elements that
 * should be highlighted. Returns an array because one position can cover
 * several marks — a scatter column holds every point sharing an X.
 *
 * @param layers - The layers of the figure
 * @param maps - The prebuilt per-layer lookups
 * @param layerDatasetIndices - Layer id to the dataset indices backing it
 * @param layerId - The layer the position belongs to
 * @param row - The MAIDR row, or `-1` when the event carries `pointIndices`
 * @param col - The MAIDR column, or `-1` when the event carries `pointIndices`
 * @param pointIndices - For a point cloud, the `layer.data` indices to outline
 * @returns The elements to highlight, empty when nothing resolves
 */
export function resolveActiveTargets(
  layers: MaidrLayer[],
  maps: TargetMaps,
  layerDatasetIndices: LayerDatasetIndices,
  layerId: string,
  row: number,
  col: number,
  pointIndices?: readonly number[],
): ChartJsActiveElement[] {
  const layer = layers.find(l => l.id === layerId);
  if (!layer)
    return [];

  // Segmented bars: MAIDR row = group (dataset), col = category. The grid is
  // kept rectangular (gaps collapse to 0 rather than being skipped), so the
  // only thing between `col` and the Chart.js element index is the drawn
  // order of the categories -- which a reversed axis turns round (#1024).
  if (isSegmentedType(layer.type)) {
    const datasetIndex = rowDatasetIndex(layerDatasetIndices, layerId, row);
    const index = maps.barLineIndices.get(layer.id)?.[0]?.[col];
    return index === undefined ? [] : [{ datasetIndex, index }];
  }

  // A point cloud names its selection by `layer.data` index, not by position:
  // the model navigates it through five different index spaces (x-bucket,
  // y-bucket, flat point, grid cell, in-cell group) and no row/column pair can
  // say which one is live. Each entry carries its own dataset, so a merged
  // volcano or Manhattan highlights across the datasets it was folded from.
  if (isPointCloudType(layer.type)) {
    const targets = maps.pointTargets.get(layer.id);
    if (!targets || !pointIndices)
      return [];
    const active: ChartJsActiveElement[] = [];
    for (const index of pointIndices) {
      const target = targets[index];
      if (target)
        active.push(target);
    }
    return active;
  }

  // Gantt: MAIDR row = lane (the Chart.js element index), col = which dataset
  // booked that lane. Both halves come from the prebuilt pair.
  if (layer.type === TraceType.GANTT) {
    const target = maps.ganttTargets.get(layer.id)?.[row]?.[col];
    return target ? [target] : [];
  }

  // Dumbbell: MAIDR row = which end of the pair, col = the category. Both ends
  // are drawn by the one floating bar that connects them, so the row does not
  // change what is highlighted — the same reading `DumbbellTrace` gives its own
  // selectors, which repeat one element per category across the two ends.
  if (layer.type === TraceType.DUMBBELL) {
    const index = maps.barLineIndices.get(layer.id)?.[0]?.[col];
    if (index === undefined)
      return [];
    return [{ datasetIndex: firstDatasetIndex(layerDatasetIndices, layer.id), index }];
  }

  // Candlestick / OHLC: a single dataset of candles. MAIDR `col` selects the
  // candle; MAIDR `row` picks the OHLC field (volatility/open/high/low/close)
  // for audio/text and does NOT change which element to highlight.
  if (layer.type === TraceType.CANDLESTICK)
    return [{ datasetIndex: firstDatasetIndex(layerDatasetIndices, layer.id), index: col }];

  // Treemap: MAIDR row = depth, col = position within that depth. The nodes
  // were emitted one per drawn rectangle, so the prebuilt pair is the whole
  // answer -- there is no dataset partition to undo, a treemap being a single
  // dataset by construction.
  if (layer.type === TraceType.TREEMAP || layer.type === TraceType.TREE) {
    const index = maps.treemapIndices.get(layer.id)?.get(`${row}\0${col}`);
    if (index === undefined)
      return [];
    return [{ datasetIndex: firstDatasetIndex(layerDatasetIndices, layer.id), index }];
  }

  // Sankey: nothing is outlined, deliberately.
  //
  // A `FlowTrace` navigates **nodes** -- `row` and `col` address a node in a
  // stage grid it derives by walking the graph -- while the Chart.js elements
  // are **flows**. Nothing in `NavigateCallback` carries the node's identity,
  // so the only way to pair the two here would be to re-derive the stage
  // assignment in the adapter, which is exactly the drift the treemap branch
  // above avoids by reproducing the model's addressing rather than its
  // algorithm.
  //
  // Falling through instead would be worse than declining: the bar/line
  // branch at the bottom answers `{ index: col }` for a layer it has no map
  // for, so a node in the second column would outline the second *ribbon* --
  // audio, text and braille all correct while the wrong element lights up,
  // which is the one failure an accessibility suite cannot hear (#814).
  if (layer.type === TraceType.SANKEY)
    return [];

  // Network: nothing is outlined either, and for a sharper reason than the
  // sankey's.
  //
  // `NetworkTrace` navigates **nodes** and names its highlight as one
  // *link* -- `highlightedPointIndices` is an index into the declared link
  // array, deliberately, so that the canvas and SVG channels cannot outline
  // different lines. Chart.js's active-element mechanism addresses
  // `meta.data`, and for `chartjs-chart-graph` those elements are the
  // **nodes**: the links are drawn by the dataset element, which
  // `setActiveElements` cannot name. So the one thing the trace asks to be
  // outlined is the one thing this cannot outline, and answering with a node
  // instead would light up a mark the reader was not told about.
  if (layer.type === TraceType.NETWORK)
    return [];

  // Choropleth / bubble map: `col` is the region, but only when the model
  // left the regions where the payload put them.
  //
  // `ChoroplethTrace` lays a *placed* map out geographically -- south to
  // north in bands of equal count, west to east within each band -- so
  // `(row, col)` there addresses a position on the globe and nothing in
  // `NavigateCallback` carries the region's identity back. Re-deriving the
  // banding here is the drift the treemap branch above avoids, so a placed
  // map outlines nothing, the way the sankey branch declines for the same
  // reason (#814): the bottom branch would answer `{index: col}` and outline
  // a region chosen by where it happens to sit in its band.
  //
  // A map with no centroids is a different case and not a lesser one: the
  // model keeps it "in declared order in one band", which is a documented
  // contract of the trace rather than an artefact -- pinned by
  // `test/model/choropleth.test.ts` -- so row 0, column `i` *is* the payload's
  // `i`, and the prebuilt walk maps that back onto the drawn element.
  if (layer.type === TraceType.CHOROPLETH) {
    const regions = layer.data as ChoroplethPoint[];
    const placed = regions.every(
      region => Number.isFinite(region.lat) && Number.isFinite(region.lon),
    );
    if (placed)
      return [];
    const index = maps.barLineIndices.get(layer.id)?.[0]?.[col];
    if (index === undefined)
      return [];
    return [{ datasetIndex: firstDatasetIndex(layerDatasetIndices, layer.id), index }];
  }

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
