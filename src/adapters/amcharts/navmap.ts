/**
 * Navigation map for amCharts highlighting.
 *
 * MAIDR navigation fires `{ layerId, row, col }`. To highlight the active data
 * point we must map that back to the live amCharts series + dataItem so the
 * overlay can read its pixel geometry. The grouping mirrors how the adapter
 * builds layers in `adapter.ts` (`convertCharts`). Multi-panel figures pass
 * one entry per subplot; the merged map also records each layer's owning
 * chart so highlights clip against the correct panel's plot area.
 */

import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { AmDataItem, AmXYChart, AmXYSeries } from './types';
import { TraceType } from '@type/grammar';

/**
 * The am5 entities to highlight for a navigation position.
 * `kind` tells the overlay whether to read column-box geometry or a point.
 */
export interface NavTarget {
  series: AmXYSeries;
  dataItem: AmDataItem;
  kind: 'column' | 'point';
}

/**
 * Resolves a MAIDR navigation position to the am5 targets to highlight.
 */
export interface NavMap {
  resolve: (layerId: string, row: number, col: number) => NavTarget[];
  /**
   * The chart owning a layer, so highlights can be clipped against the owning
   * panel's plot bounds. Layer ids are unique figure-wide, so the id alone
   * disambiguates the panel.
   */
  chartFor: (layerId: string) => AmXYChart | undefined;
  /** Number of distinct charts (panels) in the map. */
  chartCount: number;
}

/**
 * One subplot's worth of navigation-map input: the MAIDR layers built from a
 * chart, the live series grouped as the adapter grouped them, and the owning
 * chart itself.
 */
export interface NavMapEntry {
  layers: MaidrLayer[];
  groups: SeriesGroups;
  chart: AmXYChart;
}

/**
 * Live am5 series grouped exactly as the adapter groups them when building
 * layers, so each MAIDR layer can be matched back to its source series.
 */
export interface SeriesGroups {
  /** Single → BAR layer; multiple → one segmented layer. */
  barSeriesList: AmXYSeries[];
  /** Merged into a single multi-line LINE layer (one entry per line). */
  lineSeriesList: AmXYSeries[];
  /** One HISTOGRAM layer each, in series order. */
  histogramSeries: AmXYSeries[];
  /** One HEATMAP layer each, in series order. */
  heatmapSeries: AmXYSeries[];
}

type Resolver = (row: number, col: number) => NavTarget[];

/** A live series paired with its extractor-filtered (gap-free) data items. */
interface FilteredSeries {
  series: AmXYSeries;
  items: AmDataItem[];
}

function isHorizontalColumn(series: AmXYSeries): boolean {
  return typeof series.get('categoryYField') === 'string';
}

/**
 * Mirror `extractBarPoints` / `extractSegmentedPoints`: keep only items with a
 * non-null category and a finite value on the series' orientation field pair.
 * The extractor skips the rest, so MAIDR `col` indexes this filtered list — not
 * the raw `series.dataItems` (which retains a slot per null/gap record).
 */
function filterColumnItems(series: AmXYSeries): AmDataItem[] {
  const horizontal = isHorizontalColumn(series);
  const categoryField = horizontal ? 'categoryY' : 'categoryX';
  const valueField = horizontal ? 'valueX' : 'valueY';
  const kept: AmDataItem[] = [];
  for (const item of series.dataItems) {
    const category = item.get(categoryField);
    const value = item.get(valueField);
    if (category == null || value == null)
      continue;
    if (!Number.isFinite(Number(value)))
      continue;
    kept.push(item);
  }
  return kept;
}

/** Mirror `readXValue`: whether an item has any usable X (category/value/date). */
function hasLineX(item: AmDataItem, series: AmXYSeries): boolean {
  if (item.get('categoryX') != null)
    return true;
  if (item.get('valueX') != null)
    return true;
  if (item.get('dateX') instanceof Date)
    return true;
  const fieldName = series.get('categoryXField');
  return typeof fieldName === 'string' && item.get(fieldName) != null;
}

/** Mirror `extractLinePoints`: keep items with a present X and a finite valueY. */
function filterLineItems(series: AmXYSeries): AmDataItem[] {
  const kept: AmDataItem[] = [];
  for (const item of series.dataItems) {
    const y = item.get('valueY');
    if (!hasLineX(item, series) || y == null)
      continue;
    if (!Number.isFinite(Number(y)))
      continue;
    kept.push(item);
  }
  return kept;
}

/** Mirror `extractHistogramPoints`: keep items with finite valueX and valueY. */
function filterHistogramItems(series: AmXYSeries): AmDataItem[] {
  const kept: AmDataItem[] = [];
  for (const item of series.dataItems) {
    const valueX = item.get('valueX');
    const valueY = item.get('valueY');
    if (valueX == null || valueY == null)
      continue;
    if (!Number.isFinite(Number(valueX)) || !Number.isFinite(Number(valueY)))
      continue;
    kept.push(item);
  }
  return kept;
}

function columnTargetFrom(entry: FilteredSeries | undefined, col: number): NavTarget[] {
  const dataItem = entry?.items[col];
  return entry && dataItem ? [{ series: entry.series, dataItem, kind: 'column' }] : [];
}

/**
 * Build a resolver for a heatmap layer. amCharts heatmap dataItems are a flat,
 * insertion-ordered list, so we index them by `categoryX`/`categoryY` value.
 * MAIDR's Heatmap model reverses the Y axis (`src/model/heatmap.ts`), so we
 * un-reverse the row: `extractorYi = (numY - 1) - row`.
 */
function buildHeatmapResolver(series: AmXYSeries, data: HeatmapData): Resolver {
  const cellByCategory = new Map<string, AmDataItem>();
  for (const dataItem of series.dataItems) {
    const cx = dataItem.get('categoryX');
    const cy = dataItem.get('categoryY');
    if (cx == null || cy == null)
      continue;
    cellByCategory.set(`${String(cx)}\0${String(cy)}`, dataItem);
  }

  const numY = data.y.length;
  return (row, col) => {
    const extractorYi = numY - 1 - row;
    const xLabel = data.x[col];
    const yLabel = data.y[extractorYi];
    if (xLabel == null || yLabel == null)
      return [];
    const dataItem = cellByCategory.get(`${xLabel}\0${yLabel}`);
    return dataItem ? [{ series, dataItem, kind: 'column' }] : [];
  };
}

/**
 * Build the navigation map from one entry per subplot. Each entry's layers
 * are matched to its grouped live series by type and order (avoiding any
 * dependence on the exact generated ID strings), and all resolvers merge into
 * one layerId-keyed map — layer ids are unique across the whole figure.
 */
export function buildNavigationMap(entries: readonly NavMapEntry[]): NavMap {
  const resolvers = new Map<string, Resolver>();
  const owners = new Map<string, AmXYChart>();

  for (const entry of entries) {
    addEntryResolvers(entry, resolvers, owners);
  }

  return {
    resolve: (layerId, row, col) => resolvers.get(layerId)?.(row, col) ?? [],
    chartFor: layerId => owners.get(layerId),
    chartCount: new Set(entries.map(entry => entry.chart)).size,
  };
}

/** Register the resolvers (and owning chart) for one subplot's layers. */
function addEntryResolvers(
  { layers, groups, chart }: NavMapEntry,
  resolvers: Map<string, Resolver>,
  owners: Map<string, AmXYChart>,
): void {
  // Precompute gap-filtered items per series, then drop empty series exactly as
  // the adapter does when building layers (`buildSegmentedLayer` / `fromXYChart`
  // skip series that yield no points). This keeps MAIDR row/col indices aligned
  // with the live dataItems even when a series contains null/gap records.
  const barItems: FilteredSeries[] = groups.barSeriesList.map(series => ({
    series,
    items: filterColumnItems(series),
  }));
  const segmentedBars = barItems.filter(entry => entry.items.length > 0);
  const lineSeries = groups.lineSeriesList
    .map(series => ({ series, items: filterLineItems(series) }))
    .filter(entry => entry.items.length > 0);
  const histogramSeries = groups.histogramSeries
    .map(series => ({ series, items: filterHistogramItems(series) }))
    .filter(entry => entry.items.length > 0);

  let histIdx = 0;
  let heatIdx = 0;

  const register = (layerId: string, resolver: Resolver): void => {
    resolvers.set(layerId, resolver);
    owners.set(layerId, chart);
  };

  for (const layer of layers) {
    switch (layer.type) {
      case TraceType.BAR: {
        const entry = barItems[0];
        register(layer.id, (_row, col) => columnTargetFrom(entry, col));
        break;
      }
      case TraceType.STACKED:
      case TraceType.DODGED:
      case TraceType.NORMALIZED: {
        register(layer.id, (row, col) => columnTargetFrom(segmentedBars[row], col));
        break;
      }
      case TraceType.LINE: {
        register(layer.id, (row, col) => {
          const entry = lineSeries[row];
          const dataItem = entry?.items[col];
          return entry && dataItem
            ? [{ series: entry.series, dataItem, kind: 'point' }]
            : [];
        });
        break;
      }
      case TraceType.HISTOGRAM: {
        const entry = histogramSeries[histIdx++];
        register(layer.id, (_row, col) => columnTargetFrom(entry, col));
        break;
      }
      case TraceType.HEATMAP: {
        const series = groups.heatmapSeries[heatIdx++];
        if (series) {
          register(layer.id, buildHeatmapResolver(series, layer.data as HeatmapData));
        }
        break;
      }
      default:
        break;
    }
  }
}
