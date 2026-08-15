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
import type { AmDeclaredLayer } from './declaration';
import type { AmChart, AmDataItem, AmXYSeries } from './types';
import { TraceType } from '@type/grammar';
import {
  extractErrorBarSamples,
  extractForestSamples,
  extractSurvivalArms,
} from './declaration';
import {
  extractGanttItems,
  extractHierarchyNodes,
  extractSpanItems,
  isColumnSeries,
} from './extractor';

/**
 * The am5 entities to highlight for a navigation position.
 * `kind` tells the overlay which geometry to read: a column's box, a line
 * point, the wedge-shaped sprite of a pie slice, funnel stage or polar column,
 * or the glyph of a word cloud's term.
 */
export interface NavTarget {
  series: AmXYSeries;
  dataItem: AmDataItem;
  kind: 'column' | 'point' | 'slice' | 'label';
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
  chartFor: (layerId: string) => AmChart | undefined;
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
  chart: AmChart;
}

/**
 * Live am5 series grouped exactly as the adapter groups them when building
 * layers, so each MAIDR layer can be matched back to its source series.
 */
export interface SeriesGroups {
  /** Single → BAR layer; multiple → one segmented layer. */
  barSeriesList: AmXYSeries[];
  /** One DOT layer each, in series order. */
  dotSeriesList: AmXYSeries[];
  /** One LOLLIPOP layer each, in series order. */
  lollipopSeriesList: AmXYSeries[];
  /**
   * Merged into a single multi-line layer (one entry per line) — a LINE, or
   * the BUMP the same lines become when they carry ranks. The two are one
   * bucket because they are one layer: what differs is how the numbers are
   * announced, not which mark each position addresses.
   */
  lineSeriesList: AmXYSeries[];
  /** Merged into a single STEP layer, the staircase counterpart of the above. */
  stepSeriesList: AmXYSeries[];
  /** Merged into one AREA / STACKED_AREA / NORMALIZED_AREA layer. */
  areaSeriesList: AmXYSeries[];
  /** Merged into a single RADAR layer (one entry per closed outline). */
  radarSeriesList: AmXYSeries[];
  /** Merged into a single POLAR_AREA layer, the wedge counterpart of the above. */
  polarSeriesList: AmXYSeries[];
  /** One HISTOGRAM layer each, in series order. */
  histogramSeries: AmXYSeries[];
  /** One HEATMAP layer each, in series order. */
  heatmapSeries: AmXYSeries[];
  /** One PIE layer each, in series order. */
  pieSeriesList: AmXYSeries[];
  /** One FUNNEL layer each, in series order. */
  funnelSeriesList: AmXYSeries[];
  /** One WATERFALL layer each, in series order. */
  waterfallSeriesList: AmXYSeries[];
  /** One DUMBBELL layer each, in series order. */
  dumbbellSeriesList: AmXYSeries[];
  /** One GANTT layer each, in series order. */
  ganttSeriesList: AmXYSeries[];
  /** One TREEMAP or ICICLE layer each, in series order. */
  hierarchySeriesList: AmXYSeries[];
  /** One WORD_CLOUD layer each, in series order. */
  wordCloudSeriesList: AmXYSeries[];
  /**
   * One layer each for the series that declared what they mean, in series
   * order — a survival curve, an error bar, a forest plot, a cloud.
   *
   * Kept as the plan rather than as a series list: a declared layer routinely
   * spans several series (the column drawing an interval, the arms merged into
   * one curve), and the highlight has to walk exactly the ones the layer was
   * built from.
   */
  declaredList: AmDeclaredLayer[];
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

/**
 * Mirror `extractPiePoints`: keep items with a category and a finite value.
 * Serves funnel stages too, which the extractor reads through the same fields.
 */
function filterPieItems(series: AmXYSeries): AmDataItem[] {
  const kept: AmDataItem[] = [];
  for (const item of series.dataItems) {
    const category = item.get('category');
    const value = item.get('value');
    if (category == null || value == null)
      continue;
    if (!Number.isFinite(Number(value)))
      continue;
    kept.push(item);
  }
  return kept;
}

/**
 * Mirror `WordCloudTrace`: the terms a cloud declares, heaviest first.
 *
 * A word cloud is the one layer whose navigation order is not the order it was
 * declared in. Its arrangement on the page is chosen to pack glyphs and
 * carries nothing, so MAIDR walks the terms by weight — and the position it
 * reports is an index into THAT order. Filtering alone would leave every
 * highlight on whichever term happens to sit at the same rank.
 *
 * Sorted with the same comparison the trace uses, on a stable sort, so terms
 * of equal weight keep their declared order in both.
 */
function filterWordCloudItems(series: AmXYSeries): AmDataItem[] {
  return filterPieItems(series)
    .sort((a, b) => Number(b.get('value')) - Number(a.get('value')));
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

/**
 * Pair each series with its gap-filtered items and drop the series left with
 * none — exactly what the adapter does when it builds the layers, so MAIDR's
 * row indices keep naming the same series the extractor emitted.
 */
function filterSeries(
  seriesList: AmXYSeries[],
  keep: (series: AmXYSeries) => AmDataItem[],
): FilteredSeries[] {
  return seriesList
    .map(series => ({ series, items: keep(series) }))
    .filter(entry => entry.items.length > 0);
}

function columnTargetFrom(entry: FilteredSeries | undefined, col: number): NavTarget[] {
  const dataItem = entry?.items[col];
  return entry && dataItem ? [{ series: entry.series, dataItem, kind: 'column' }] : [];
}

/**
 * Build a resolver for a gantt layer: MAIDR walks lanes by intervals, and so
 * does the grouping the extractor emitted, so the position indexes it directly.
 */
function buildGanttResolver(series: AmXYSeries | undefined): Resolver {
  const lanes = series ? extractGanttItems(series) : [];
  return (row, col) => {
    const dataItem = lanes[row]?.[col];
    return series && dataItem ? [{ series, dataItem, kind: 'column' }] : [];
  };
}

/**
 * Build a resolver for a treemap or icicle layer.
 *
 * MAIDR addresses a tree node by depth and by its position within that depth,
 * taking the position from the order the nodes were declared in — which is the
 * order the walk emitted them, so gathering the walk by depth rebuilds exactly
 * the grid the reader is navigating.
 */
function buildHierarchyResolver(series: AmXYSeries | undefined): Resolver {
  const levels: AmDataItem[][] = [];
  for (const node of series ? extractHierarchyNodes(series) : []) {
    (levels[node.depth] ??= []).push(node.dataItem);
  }
  return (row, col) => {
    const dataItem = levels[row]?.[col];
    // A node is drawn as a rectangle, which the overlay measures the same way
    // it measures a column.
    return series && dataItem ? [{ series, dataItem, kind: 'column' }] : [];
  };
}

/**
 * Build a resolver for a declared survival figure.
 *
 * Rows are the arms and columns the samples, exactly as a merged line layer is
 * navigated — a survival curve is a step line with two more things said about
 * it, and neither of them changes which mark a position addresses.
 */
function buildSurvivalResolver(declared: AmDeclaredLayer | undefined): Resolver {
  const arms = declared ? extractSurvivalArms(declared).items : [];
  const series = declared ? [declared.series, ...declared.arms] : [];
  return (row, col) => {
    const dataItem = arms[row]?.[col];
    const owner = series[row];
    return owner && dataItem ? [{ series: owner, dataItem, kind: 'point' }] : [];
  };
}

/**
 * Build a resolver for a declared error bar or forest plot.
 *
 * The row walks the interval's three sections — lower bound, estimate, upper
 * bound — and a chart draws one mark per sample rather than one per bound, so
 * every section resolves to the same mark. A highlight that stays put while the
 * announcement moves between the bounds is the honest rendering of that; the
 * alternative is pointing at marks the chart never drew, which is the call the
 * dumbbell's two ends already make.
 */
function buildIntervalResolver(declared: AmDeclaredLayer | undefined): Resolver {
  if (!declared) {
    return () => [];
  }
  const { items, owners } = declared.declaration.type === TraceType.FOREST
    ? extractForestSamples(declared)
    : extractErrorBarSamples(declared);
  const kind: NavTarget['kind'] = isColumnSeries(declared.series) ? 'column' : 'point';

  return (_row, col) => {
    const dataItem = items[col];
    const owner = owners[col];
    return dataItem && owner ? [{ series: owner, dataItem, kind }] : [];
  };
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
  const owners = new Map<string, AmChart>();

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
  owners: Map<string, AmChart>,
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
  const dotSeries = filterSeries(groups.dotSeriesList, filterColumnItems);
  const lollipopSeries = filterSeries(groups.lollipopSeriesList, filterColumnItems);
  const lineSeries = filterSeries(groups.lineSeriesList, filterLineItems);
  const stepSeries = filterSeries(groups.stepSeriesList, filterLineItems);
  const areaSeries = filterSeries(groups.areaSeriesList, filterLineItems);
  const radarSeries = filterSeries(groups.radarSeriesList, filterLineItems);
  const polarSeries = filterSeries(groups.polarSeriesList, filterLineItems);
  const histogramSeries = filterSeries(groups.histogramSeries, filterHistogramItems);
  const pieSeries = filterSeries(groups.pieSeriesList, filterPieItems);
  const funnelSeries = filterSeries(groups.funnelSeriesList, filterPieItems);
  const waterfallSeries = filterSeries(groups.waterfallSeriesList, extractSpanItems);
  const dumbbellSeries = filterSeries(groups.dumbbellSeriesList, extractSpanItems);
  const wordCloudSeries = filterSeries(groups.wordCloudSeriesList, filterWordCloudItems);

  // Every merged layer indexes its OWN series list — sharing one would
  // misplace every highlight on a chart carrying two of these at once.
  const mergedByType: Partial<Record<TraceType, FilteredSeries[]>> = {
    [TraceType.LINE]: lineSeries,
    [TraceType.BUMP]: lineSeries,
    [TraceType.STEP]: stepSeries,
    [TraceType.AREA]: areaSeries,
    [TraceType.STACKED_AREA]: areaSeries,
    [TraceType.NORMALIZED_AREA]: areaSeries,
    [TraceType.RADAR]: radarSeries,
    [TraceType.POLAR_AREA]: polarSeries,
  };

  // Declared layers keep one queue per declared type rather than one counter:
  // several types can be declared on one chart, and each type's layers appear
  // in the same order as the series that declared them.
  const declaredQueues = new Map<string, AmDeclaredLayer[]>();
  for (const declared of groups.declaredList) {
    const queue = declaredQueues.get(declared.declaration.type);
    if (queue) {
      queue.push(declared);
    } else {
      declaredQueues.set(declared.declaration.type, [declared]);
    }
  }
  const nextDeclared = (type: TraceType): AmDeclaredLayer | undefined =>
    declaredQueues.get(type)?.shift();

  let dotIdx = 0;
  let lollipopIdx = 0;
  let histIdx = 0;
  let heatIdx = 0;
  let pieIdx = 0;
  let funnelIdx = 0;
  let waterfallIdx = 0;
  let dumbbellIdx = 0;
  let ganttIdx = 0;
  let hierarchyIdx = 0;
  let wordCloudIdx = 0;

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
      // A diverging pair is two column series read as one layer, exactly as a
      // dodged one is; only the sign of the values differs.
      case TraceType.STACKED:
      case TraceType.DODGED:
      case TraceType.DIVERGING:
      case TraceType.NORMALIZED: {
        register(layer.id, (row, col) => columnTargetFrom(segmentedBars[row], col));
        break;
      }
      case TraceType.DOT: {
        // The mark is the bullet, not a column, so the overlay measures the
        // point the bullet sits on.
        const entry = dotSeries[dotIdx++];
        register(layer.id, (_row, col) => {
          const dataItem = entry?.items[col];
          return entry && dataItem
            ? [{ series: entry.series, dataItem, kind: 'point' }]
            : [];
        });
        break;
      }
      case TraceType.LOLLIPOP: {
        // A stem is still a column, thin as it is, and the box around it is
        // what puts the highlight on the whole mark rather than on the dot.
        const entry = lollipopSeries[lollipopIdx++];
        register(layer.id, (_row, col) => columnTargetFrom(entry, col));
        break;
      }
      // A bump chart is navigated as the multi-line layer it is drawn as, and
      // its lines were collected with the rest — the rank is what the trace
      // announces, not a different mark to point at.
      case TraceType.LINE:
      case TraceType.BUMP:
      case TraceType.STEP:
      case TraceType.AREA:
      case TraceType.STACKED_AREA:
      case TraceType.NORMALIZED_AREA:
      case TraceType.RADAR:
      case TraceType.POLAR_AREA: {
        const seriesList = mergedByType[layer.type] ?? [];
        // A polar area draws its values as wedges rather than as points on a
        // line, so the sprite the overlay measures differs even though the
        // navigable grid is the same.
        const kind: NavTarget['kind']
          = layer.type === TraceType.POLAR_AREA ? 'slice' : 'point';
        register(layer.id, (row, col) => {
          const entry = seriesList[row];
          const dataItem = entry?.items[col];
          return entry && dataItem
            ? [{ series: entry.series, dataItem, kind }]
            : [];
        });
        break;
      }
      case TraceType.HISTOGRAM: {
        const entry = histogramSeries[histIdx++];
        register(layer.id, (_row, col) => columnTargetFrom(entry, col));
        break;
      }
      case TraceType.PIE: {
        // A pie is a single row of slices, so only the column moves.
        const entry = pieSeries[pieIdx++];
        register(layer.id, (_row, col) => {
          const dataItem = entry?.items[col];
          return entry && dataItem
            ? [{ series: entry.series, dataItem, kind: 'slice' }]
            : [];
        });
        break;
      }
      case TraceType.FUNNEL: {
        // A funnel is a single row of stages, so only the column moves.
        const entry = funnelSeries[funnelIdx++];
        register(layer.id, (_row, col) => {
          const dataItem = entry?.items[col];
          return entry && dataItem
            ? [{ series: entry.series, dataItem, kind: 'slice' }]
            : [];
        });
        break;
      }
      case TraceType.WATERFALL: {
        // A bridge is a single row of steps, so only the column moves.
        const entry = waterfallSeries[waterfallIdx++];
        register(layer.id, (_row, col) => columnTargetFrom(entry, col));
        break;
      }
      case TraceType.DUMBBELL: {
        // Rows are the two ends and columns the categories, but a chart draws
        // one column per category and not one per dot — so both ends resolve
        // to the same mark, which is the honest rendering of a highlight that
        // stays put while the announcement moves between the ends.
        const entry = dumbbellSeries[dumbbellIdx++];
        register(layer.id, (_row, col) => columnTargetFrom(entry, col));
        break;
      }
      case TraceType.GANTT: {
        register(layer.id, buildGanttResolver(groups.ganttSeriesList[ganttIdx++]));
        break;
      }
      case TraceType.TREEMAP:
      case TraceType.ICICLE: {
        register(
          layer.id,
          buildHierarchyResolver(groups.hierarchySeriesList[hierarchyIdx++]),
        );
        break;
      }
      case TraceType.WORD_CLOUD: {
        // A cloud is a single row of terms, so only the column moves — and it
        // indexes them by weight, which `filterWordCloudItems` has already put
        // the data items in.
        const entry = wordCloudSeries[wordCloudIdx++];
        register(layer.id, (_row, col) => {
          const dataItem = entry?.items[col];
          return entry && dataItem
            ? [{ series: entry.series, dataItem, kind: 'label' }]
            : [];
        });
        break;
      }
      case TraceType.SURVIVAL: {
        register(layer.id, buildSurvivalResolver(nextDeclared(TraceType.SURVIVAL)));
        break;
      }
      case TraceType.ERROR_BAR:
      case TraceType.FOREST: {
        register(layer.id, buildIntervalResolver(nextDeclared(layer.type)));
        break;
      }
      case TraceType.MANHATTAN:
      case TraceType.VOLCANO:
      case TraceType.SCATTER: {
        // Deliberately unresolved, and the queue is drained so a second cloud
        // still matches its own layer. A canvas highlight is driven by the
        // braille position the navigation callback carries, and a scatter's
        // braille surface is a *binned grid* rather than the points — so a
        // position here names a cell of that grid, and reading it as a point
        // index would outline whichever mark happens to sit at that ordinal.
        // Resolving to nothing clears the overlay instead, which is the
        // truthful answer until the position says which point it means.
        nextDeclared(layer.type);
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
