/**
 * Navigation map for amCharts highlighting.
 *
 * MAIDR navigation fires `{ layerId, row, col }`. To highlight the active data
 * point we must map that back to the live amCharts series + dataItem so the
 * overlay can read its pixel geometry. The grouping mirrors how the adapter
 * builds layers in `adapter.ts` (`fromXYChart`).
 */

import type { HeatmapData, MaidrLayer } from '@type/grammar';
import type { AmDataItem, AmXYSeries } from './types';
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

function columnTarget(series: AmXYSeries | undefined, col: number): NavTarget[] {
  const dataItem = series?.dataItems[col];
  return series && dataItem ? [{ series, dataItem, kind: 'column' }] : [];
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
 * Build the navigation map from the MAIDR layers (for IDs + types) and the
 * grouped live series. Layers are matched to series by type and order, which
 * avoids depending on the exact generated ID strings.
 */
export function buildNavigationMap(
  layers: MaidrLayer[],
  groups: SeriesGroups,
): NavMap {
  const resolvers = new Map<string, Resolver>();
  let histIdx = 0;
  let heatIdx = 0;

  for (const layer of layers) {
    switch (layer.type) {
      case TraceType.BAR: {
        const series = groups.barSeriesList[0];
        resolvers.set(layer.id, (_row, col) => columnTarget(series, col));
        break;
      }
      case TraceType.STACKED:
      case TraceType.DODGED:
      case TraceType.NORMALIZED: {
        resolvers.set(layer.id, (row, col) => columnTarget(groups.barSeriesList[row], col));
        break;
      }
      case TraceType.LINE: {
        resolvers.set(layer.id, (row, col) => {
          const series = groups.lineSeriesList[row];
          const dataItem = series?.dataItems[col];
          return series && dataItem ? [{ series, dataItem, kind: 'point' }] : [];
        });
        break;
      }
      case TraceType.HISTOGRAM: {
        const series = groups.histogramSeries[histIdx++];
        resolvers.set(layer.id, (_row, col) => columnTarget(series, col));
        break;
      }
      case TraceType.HEATMAP: {
        const series = groups.heatmapSeries[heatIdx++];
        if (series) {
          resolvers.set(layer.id, buildHeatmapResolver(series, layer.data as HeatmapData));
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    resolve: (layerId, row, col) => resolvers.get(layerId)?.(row, col) ?? [],
  };
}
