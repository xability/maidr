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

import type { ChoroplethPoint, HeatmapData, MaidrLayer, NetworkPoint } from '@type/grammar';
import type { AmDeclaredLayer } from './declaration';
import type { ChoroplethFields } from './extractor';
import type { AmChart, AmDataItem, AmSprite, AmXYSeries } from './types';
import { TraceType } from '@type/grammar';
import {
  choroplethFields,
  extractCloudMarks,
  extractErrorBarSamples,
  extractForestSamples,
  extractSurvivalArms,
  planDeclarations,
} from './declaration';
import {
  classifySeriesKind,
  extractFlowLinks,
  extractGanttItems,
  extractHierarchyNodes,
  extractNetworkPoints,
  extractSpanItems,
  filterChoroplethItems,
  findGaugeHand,
  findNetworkLink,
  flowRibbonOf,
  isColumnSeries,
  orderedDataItems,
} from './extractor';

/**
 * A mark reached through the data item it hangs on.
 *
 * `kind` tells the overlay which geometry to read: a column's box, a line
 * point, the wedge-shaped sprite of a pie slice, funnel stage or polar column,
 * the glyph of a word cloud's term, or the drawn polygon of a map region.
 */
export interface NavItemTarget {
  series: AmXYSeries;
  dataItem: AmDataItem;
  kind: 'column' | 'point' | 'slice' | 'label' | 'region';
}

/**
 * A ribbon: the band a sankey, chord or alluvial link is drawn as, or the line
 * between two nodes of a force-directed network.
 *
 * The one target named by its sprite rather than by a data item, because a
 * network's lines are not data items at all — amCharts derives them from the
 * tree and keeps them in a list of its own. The resolver has already done the
 * inversion by the time this is built, so the overlay measures what it is
 * handed instead of learning where each library hangs a link.
 */
export interface NavRibbonTarget {
  series: AmXYSeries;
  sprite: AmSprite;
  kind: 'ribbon';
}

/** The am5 entities to highlight for a navigation position. */
export type NavTarget = NavItemTarget | NavRibbonTarget;

/**
 * Resolves a MAIDR navigation position to the am5 targets to highlight.
 */
export interface NavMap {
  /**
   * @param layerId - The layer the position belongs to
   * @param row - The MAIDR row, or `-1` when `pointIndices` is given
   * @param col - The MAIDR column, or `-1` when `pointIndices` is given
   * @param pointIndices - For a layer that names its own marks, the
   *   `layer.data` indices to outline. A cloud's selection is a set of points
   *   that no row/column pair can name, and a flow or network position names a
   *   node rather than the ribbon drawn for it, so both are addressed by data
   *   index instead.
   */
  resolve: (
    layerId: string,
    row: number,
    col: number,
    pointIndices?: readonly number[],
  ) => NavTarget[];
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
 * Where one choropleth layer came from: the polygon series amCharts drew, and
 * the field names a declaration renamed its facts to, when the author gave
 * one.
 *
 * The fields have to travel with the series because they change *which
 * regions the layer kept*: a map whose value hangs on a column amCharts was
 * never bound to reads as no regions at all without them, and the highlight
 * would then index a list of a different length from the one the reader is
 * walking.
 */
export interface AmChoroplethSource {
  series: AmXYSeries;
  fields?: ChoroplethFields;
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
  /**
   * One CANDLESTICK layer each, in series order.
   *
   * A candlestick and an OHLC share the bucket for the reason they share a
   * trace type: the same five numbers, a different mark, and the same one
   * column per candle for the highlight to point at (#1053).
   */
  candlestickSeriesList: AmXYSeries[];
  /** One DUMBBELL layer each, in series order. */
  dumbbellSeriesList: AmXYSeries[];
  /** One GANTT layer each, in series order. */
  ganttSeriesList: AmXYSeries[];
  /**
   * One TREEMAP, ICICLE or SUNBURST layer each, in series order.
   *
   * One bucket for three layouts because they are one tree drawn three ways
   * and the highlight walks the same nodes whichever it is. Which *mark* to
   * measure is decided from the layer's trace type where the resolver is
   * built, since that is the part that differs.
   */
  hierarchySeriesList: AmXYSeries[];
  /** One WORD_CLOUD layer each, in series order. */
  wordCloudSeriesList: AmXYSeries[];
  /**
   * One SANKEY or CHORD layer each, in series order.
   *
   * One bucket for both because they are one weighted graph drawn two ways —
   * the same `extractFlowLinks` walk, the same ribbon per link — and only the
   * announced type differs. An `ArcDiagram` lands here too, as a sankey. A
   * declared **alluvial** does not: it is the same am5flow series read a third
   * way, so it travels in {@link declaredList} with the other declared layers.
   */
  flowSeriesList: AmXYSeries[];
  /** One NETWORK layer each, in series order. */
  networkSeriesList: AmXYSeries[];
  /**
   * One CHOROPLETH layer each, in series order.
   *
   * The one bucket that carries a declaration alongside the series, because a
   * map is the one type this adapter reads BOTH ways: an `am5map`
   * `MapPolygonSeries` bound to a `valueField` is a choropleth on its own, and
   * one whose value hangs on a column amCharts was never told about is a
   * choropleth the author declared. Both emit `TraceType.CHOROPLETH`, so one
   * ordered bucket keeps the layers and their sources in step — which two
   * buckets could not, since the layers interleave in series order.
   */
  choroplethSeriesList: AmChoroplethSource[];
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

type Resolver = (
  row: number,
  col: number,
  pointIndices?: readonly number[],
) => NavTarget[];

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
 *
 * Read through {@link orderedDataItems} for the same reason: a series laid
 * along an inversed axis is drawn from the far end, and the extractor reads it
 * that way (#1037). This is the highlight half of that pairing, and it has to
 * move with the payload or the overlay outlines the wrong mark (#1024).
 */
function filterColumnItems(series: AmXYSeries): AmDataItem[] {
  const horizontal = isHorizontalColumn(series);
  const categoryField = horizontal ? 'categoryY' : 'categoryX';
  const valueField = horizontal ? 'valueX' : 'valueY';
  const kept: AmDataItem[] = [];
  for (const item of orderedDataItems(series)) {
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

/**
 * Mirror `extractLinePoints`: keep items with a present X and a finite valueY,
 * in the order they were drawn — see {@link filterColumnItems} on why the
 * order is read from {@link orderedDataItems} rather than from the series.
 */
function filterLineItems(series: AmXYSeries): AmDataItem[] {
  const kept: AmDataItem[] = [];
  for (const item of orderedDataItems(series)) {
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

/**
 * Mirror `extractCandlestickPoints`: keep the candles carrying all four
 * prices, since the extractor skips the rest and MAIDR `col` indexes what is
 * left rather than the raw items.
 */
function filterCandlestickItems(series: AmXYSeries): AmDataItem[] {
  const kept: AmDataItem[] = [];
  for (const item of orderedDataItems(series)) {
    const prices = ['openValueY', 'highValueY', 'lowValueY', 'valueY']
      .map(key => Number(item.get(key)));
    if (prices.every(price => Number.isFinite(price)))
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
 * Build a resolver for a treemap, icicle or sunburst layer.
 *
 * MAIDR addresses a tree node by depth and by its position within that depth,
 * taking the position from the order the nodes were declared in — which is the
 * order the walk emitted them, so gathering the walk by depth rebuilds exactly
 * the grid the reader is navigating. That is true of all three layouts: they
 * are one tree drawn three ways.
 *
 * What is not the same is the mark. A treemap block and an icicle bar are
 * rectangles, which the overlay measures as it measures a column; a sunburst
 * node is a `Slice`, which reports a degenerate box at its own centre and has
 * to be measured from its radius and sweep instead. Hence the `kind` — the one
 * thing the caller has to say.
 */
function buildHierarchyResolver(
  series: AmXYSeries | undefined,
  kind: NavItemTarget['kind'],
): Resolver {
  const levels: AmDataItem[][] = [];
  for (const node of series ? extractHierarchyNodes(series) : []) {
    (levels[node.depth] ??= []).push(node.dataItem);
  }
  return (row, col) => {
    const dataItem = levels[row]?.[col];
    return series && dataItem ? [{ series, dataItem, kind }] : [];
  };
}

/**
 * Build a resolver for a gauge layer.
 *
 * Structurally the simplest resolver there is: `GaugeTrace` is a 1x1 grid and
 * its position is always `(0, 0)`, so there is no ordering to mirror and no
 * index to invert — every position is the needle.
 *
 * The plumbing is the only wrinkle. A {@link NavTarget} names a series and a
 * data item, and a ClockHand has neither: it is a bullet on an *axis*. Rather
 * than widen the target for one layer, the hand is handed to the overlay
 * through a data item that answers `graphics` with it — which is exactly the
 * read `kind: 'column'` already makes — and a stand-in series that nothing on
 * that path asks anything of. The same trick `asStandalonePanel` uses to give
 * a bare series the shape of a chart.
 *
 * If the hand reports no usable box the overlay clears rather than falling
 * back to the chart. An outline around the whole dial would say nothing about
 * where the needle is.
 */
function buildGaugeResolver(chart: AmChart): Resolver {
  const hand = findGaugeHand(chart);
  if (!hand) {
    return () => [];
  }

  const dataItem = {
    get: (key: string) => (key === 'graphics' ? hand.sprite : undefined),
  } as AmDataItem;
  const series = {
    className: 'ClockHand',
    get: () => undefined,
    dataItems: [],
  } as unknown as AmXYSeries;

  return () => [{ series, dataItem, kind: 'column' }];
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
  const kind: NavItemTarget['kind'] = isColumnSeries(declared.series) ? 'column' : 'point';

  return (_row, col) => {
    const dataItem = items[col];
    const owner = owners[col];
    return dataItem && owner ? [{ series: owner, dataItem, kind }] : [];
  };
}

/**
 * Build a resolver for a declared point cloud — a scatter, a volcano or a
 * Manhattan.
 *
 * A cloud is the one family whose selection is a *set of points* rather than a
 * position: the model navigates it through x-buckets, y-buckets, a flat point
 * order, a binned grid and a within-cell grouping, and no row/column pair can
 * say which of those is live. It therefore names the points it has highlighted
 * by their index in the `data` array this adapter supplied, and this inverts
 * that index against the same walk `extractScatterPoints` and
 * `extractVolcanoPoints` used to build it.
 *
 * The binning stays in the model. Nothing here reconstructs it — a copy would
 * drift silently and outline a confidently wrong mark, which is why this
 * resolver was left unregistered until the position could say which point it
 * meant.
 *
 * The marks are read once, at build time, and the resolver is a lookup — the
 * same shape as {@link buildSurvivalResolver} and {@link buildIntervalResolver},
 * which index their own extractor-order lists.
 *
 * @param declared - The declared cloud layer, if one matched.
 * @param layer - The emitted layer, whose `data` the indices address.
 * @returns A resolver mapping data indices to the marks that drew them.
 */
function buildCloudResolver(
  declared: AmDeclaredLayer | undefined,
  layer: MaidrLayer,
): Resolver {
  const marks = declared ? extractCloudMarks(declared) : [];
  // An index only means anything if this list and `layer.data` are the same
  // list. Both come from the one walk over `[series, ...arms]` filtered by
  // `readCloudPoint`, so a mismatch means the chart moved underneath the
  // extraction. Resolving to nothing then clears the overlay, which is the
  // honest answer — the same one this layer type gave before it had a resolver
  // at all, and strictly better than a box on a mark picked by a stale index.
  const aligned = Array.isArray(layer.data) && marks.length === layer.data.length;
  if (!aligned) {
    return () => [];
  }
  return (_row, _col, pointIndices) => {
    if (!pointIndices) {
      return [];
    }
    const targets: NavTarget[] = [];
    for (const index of pointIndices) {
      const mark = marks[index];
      if (mark) {
        targets.push({ series: mark.series, dataItem: mark.item, kind: 'point' });
      }
    }
    return targets;
  };
}

/**
 * Build a resolver for a flow layer — a sankey, a chord, or the alluvial an
 * author declares on the same am5flow series.
 *
 * The second family to be addressed by data index rather than by position, and
 * for the same reason as {@link buildCloudResolver}: what MAIDR hands back for
 * a flow trace is its *braille* position, `(stage, index within stage)`, and
 * turning that into a node would mean reimplementing the model's own
 * first-appearance node ordering together with its longest-path stage layering
 * here. That is a derived graph structure rather than an ordering over data
 * this adapter emitted, and a copy of it drifts silently — #895 and #903 both
 * refused to ship one, and left this unregistered instead.
 *
 * `FlowTrace` now publishes the one ribbon it outlined as an index into the
 * `data` this adapter supplied, so the inversion is a lookup: `layer.data[i]`
 * was read from `extractFlowLinks(series)[i]` by construction, and that entry
 * carries the data item amCharts drew the band from. **One ribbon, not every
 * flow touching the node** — the model publishes exactly what its own
 * `mapToSvgElements` selects, so this overlay and an SVG renderer outline the
 * same band at the same cursor position.
 *
 * @param series - The am5flow series that drew the ribbons, if one matched.
 * @param layer - The emitted layer, whose `data` the indices address.
 * @returns A resolver mapping data indices to the ribbons that drew them.
 */
function buildFlowResolver(series: AmXYSeries | undefined, layer: MaidrLayer): Resolver {
  if (!series || !Array.isArray(layer.data)) {
    return () => [];
  }
  const links = extractFlowLinks(series);
  // The alignment guard {@link buildCloudResolver} makes: an index only means
  // anything if this list and `layer.data` are the same list. A mismatch means
  // the chart moved underneath the extraction, and resolving to nothing then
  // clears the overlay — the honest blank these four types shipped with, and
  // strictly better than a band picked by a stale index.
  if (links.length !== layer.data.length) {
    return () => [];
  }
  return (_row, _col, pointIndices) => {
    if (!pointIndices) {
      return [];
    }
    const targets: NavTarget[] = [];
    for (const index of pointIndices) {
      const link = links[index];
      const sprite = link ? flowRibbonOf(link.item) : undefined;
      if (sprite) {
        targets.push({ series, sprite, kind: 'ribbon' });
      }
    }
    return targets;
  };
}

/**
 * Build a resolver for a force-directed network layer.
 *
 * The same inversion as {@link buildFlowResolver}, with the model's connected
 * component walk in the place of its stage layering, and one difference that
 * belongs to amCharts rather than to MAIDR: a network's links are not data
 * items. `ForceDirected` is a *hierarchy* series, so `extractNetworkPoints`
 * derives the links from the tree and from the rows' `linkWith` columns, and
 * the drawn lines live in a list of the series' own. A published index
 * therefore names a point first — two node names — and {@link findNetworkLink}
 * finds the line joining that pair.
 *
 * The re-extraction is the alignment guard: a list of a different length from
 * `layer.data` means the graph changed under the map, and the resolver then
 * answers nothing rather than pairing an index with whatever now sits at it.
 *
 * @param series - The `ForceDirected` series that drew the graph, if one matched.
 * @param layer - The emitted layer, whose `data` the indices address.
 * @returns A resolver mapping data indices to the lines that drew them.
 */
function buildNetworkResolver(series: AmXYSeries | undefined, layer: MaidrLayer): Resolver {
  const points = layer.data as NetworkPoint[];
  if (!series || !Array.isArray(points)) {
    return () => [];
  }
  if (extractNetworkPoints(series).length !== points.length) {
    return () => [];
  }
  return (_row, _col, pointIndices) => {
    if (!pointIndices) {
      return [];
    }
    const targets: NavTarget[] = [];
    for (const index of pointIndices) {
      const point = points[index];
      const sprite = point ? findNetworkLink(series, point) : undefined;
      if (sprite) {
        targets.push({ series, sprite, kind: 'ribbon' });
      }
    }
    return targets;
  };
}

/**
 * Lay the regions out the way `ChoroplethTrace` does, as indices into the
 * layer's own `data` array.
 *
 * **This mirrors model logic, deliberately, and the line it sits on is worth
 * stating.** What the codebase refuses to copy is a *derived structure* — a
 * scatter's binning, a flow's stage layering — because a copy of one drifts
 * silently and then outlines a confidently wrong mark. `arrange`
 * (`src/model/choropleth.ts`) is not that: it is a pure sort-and-chunk over
 * exactly the numbers this adapter emitted, with no graph in it, the same kind
 * of ordering {@link buildHeatmapResolver} already mirrors for the model's
 * y-reversal and `filterWordCloudItems` for its weight order.
 *
 * Two things keep it honest rather than optimistic. A layer that declared no
 * centroids arranges to one band in declared order, so the mirror degenerates
 * to the identity map — which is the common case here, since the centroid read
 * is unverified. And the contract is pinned by a test that constructs the real
 * `ChoroplethTrace` and asks it, at every position, which region it just
 * named.
 *
 * Sorted with the model's own comparisons on a stable sort, so regions of
 * equal latitude keep their declared order in both.
 *
 * @param points - The regions the layer declared.
 * @returns Their `data` indices, banded south-first and west-to-east.
 */
function arrangeRegions(points: readonly ChoroplethPoint[]): number[][] {
  const placed = points.map((point, at) => ({
    at,
    lat: typeof point.lat === 'number' ? point.lat : Number.NaN,
    lon: typeof point.lon === 'number' ? point.lon : Number.NaN,
  }));
  if (placed.length === 0) {
    return [];
  }
  if (!placed.every(region => Number.isFinite(region.lat) && Number.isFinite(region.lon))) {
    return [placed.map(region => region.at)];
  }

  const bands = Math.max(1, Math.round(Math.sqrt(placed.length)));
  const perBand = Math.ceil(placed.length / bands);
  const southFirst = [...placed].sort((a, b) => a.lat - b.lat);

  const arranged: number[][] = [];
  for (let start = 0; start < southFirst.length; start += perBand) {
    arranged.push(
      southFirst
        .slice(start, start + perBand)
        .sort((a, b) => a.lon - b.lon)
        .map(region => region.at),
    );
  }
  return arranged;
}

/**
 * Build a resolver for a choropleth layer.
 *
 * A map is the one layer whose navigation grid is neither the declared order
 * nor a filtered view of it: the regions are banded by latitude and read west
 * to east inside each band, so `(row, col)` names a place on the map rather
 * than a position in the data. {@link arrangeRegions} rebuilds that banding
 * over the layer's own points and hands back the declared index, which then
 * indexes the drawn polygons.
 *
 * The alignment guard is what makes it safe: the polygons are re-filtered with
 * the same rule the extraction used, and a list of a different length from
 * `layer.data` means the chart moved underneath the conversion. The resolver
 * then answers nothing, the overlay clears, and no stale index gets outlined —
 * the same call {@link buildCloudResolver} makes.
 */
function buildChoroplethResolver(
  source: AmChoroplethSource | undefined,
  layer: MaidrLayer,
): Resolver {
  const points = layer.data as ChoroplethPoint[];
  if (!source || !Array.isArray(points)) {
    return () => [];
  }

  const items = filterChoroplethItems(source.series, source.fields);
  if (items.length !== points.length) {
    return () => [];
  }

  const bands = arrangeRegions(points);
  return (row, col) => {
    const at = bands[row]?.[col];
    const dataItem = at === undefined ? undefined : items[at];
    return dataItem ? [{ series: source.series, dataItem, kind: 'region' }] : [];
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
    resolve: (layerId, row, col, pointIndices) =>
      resolvers.get(layerId)?.(row, col, pointIndices) ?? [],
    chartFor: layerId => owners.get(layerId),
    chartCount: new Set(entries.map(entry => entry.chart)).size,
  };
}

// ---------------------------------------------------------------------------
// Series grouping
// ---------------------------------------------------------------------------

/**
 * Group a chart's live series exactly as `buildChartLayers` groups them when
 * it builds the layers.
 *
 * The one place in the adapter that deliberately duplicates a decision: the
 * layer a reader hears and the mark the overlay outlines have to be the same
 * series, so this asks the same two questions of the same chart —
 * {@link planDeclarations} first, since a declared series is never also
 * classified and an absorbed one is never a layer of its own, then
 * `classifySeriesKind`. A kind added to one side and forgotten on the other is
 * the failure this shape exists to make visible: audio and text keep working
 * while the highlight silently vanishes.
 *
 * It lives here rather than beside the binder that calls it because
 * {@link SeriesGroups} is defined here and the resolvers that consume it are
 * here — and because the binder's own module cannot be loaded without React,
 * which left this untested for as long as it sat there.
 *
 * @param chart - The live chart whose series to group.
 * @returns The same buckets `addEntryResolvers` walks.
 */
export function groupSeries(chart: AmChart): SeriesGroups {
  const groups: SeriesGroups = {
    barSeriesList: [],
    dotSeriesList: [],
    lollipopSeriesList: [],
    lineSeriesList: [],
    stepSeriesList: [],
    areaSeriesList: [],
    radarSeriesList: [],
    polarSeriesList: [],
    histogramSeries: [],
    heatmapSeries: [],
    pieSeriesList: [],
    funnelSeriesList: [],
    waterfallSeriesList: [],
    candlestickSeriesList: [],
    dumbbellSeriesList: [],
    ganttSeriesList: [],
    hierarchySeriesList: [],
    wordCloudSeriesList: [],
    flowSeriesList: [],
    networkSeriesList: [],
    choroplethSeriesList: [],
    declaredList: [],
  };

  // The same plan `buildChartLayers` builds, asked of the same chart: a
  // declared series is never also classified, and an absorbed one is never a
  // layer of its own — so the layer a reader hears and the mark the overlay
  // outlines are always the same series.
  const plan = planDeclarations(chart);

  for (const series of chart.series.values) {
    if (plan.absorbed.has(series)) {
      continue;
    }
    const declared = plan.declared.get(series);
    if (declared) {
      // A declared choropleth goes to the map bucket rather than the declared
      // one: its layer is a CHOROPLETH like any other, and keeping both kinds
      // in one ordered bucket is what lets the resolver find the source of the
      // n-th map layer without depending on generated ids.
      if (declared.declaration.type === TraceType.CHOROPLETH) {
        groups.choroplethSeriesList.push({
          series,
          fields: choroplethFields(declared.declaration),
        });
      } else {
        groups.declaredList.push(declared);
      }
      continue;
    }

    switch (classifySeriesKind(series)) {
      case 'bar':
        groups.barSeriesList.push(series);
        break;
      // A dot and a lollipop read as a bar chart but are drawn with different
      // marks, so the highlight measures different sprites and they keep
      // buckets of their own.
      case 'dot':
        groups.dotSeriesList.push(series);
        break;
      case 'lollipop':
        groups.lollipopSeriesList.push(series);
        break;
      // A bump chart's competitors are line series too. Whether the layer they
      // merge into is read as ranks is a property of the group, decided where
      // the layer is built, so the highlight path has one bucket for both.
      case 'line':
        groups.lineSeriesList.push(series);
        break;
      case 'step':
        groups.stepSeriesList.push(series);
        break;
      case 'area':
        groups.areaSeriesList.push(series);
        break;
      case 'radar':
        groups.radarSeriesList.push(series);
        break;
      case 'polar':
        groups.polarSeriesList.push(series);
        break;
      case 'histogram':
        groups.histogramSeries.push(series);
        break;
      case 'heatmap':
        groups.heatmapSeries.push(series);
        break;
      case 'pie':
        groups.pieSeriesList.push(series);
        break;
      case 'funnel':
        groups.funnelSeriesList.push(series);
        break;
      case 'waterfall':
        groups.waterfallSeriesList.push(series);
        break;
      case 'candlestick':
        groups.candlestickSeriesList.push(series);
        break;
      case 'dumbbell':
        groups.dumbbellSeriesList.push(series);
        break;
      case 'gantt':
        groups.ganttSeriesList.push(series);
        break;
      // A treemap, an icicle and a sunburst draw one tree three ways; the
      // highlight walks the same nodes whichever it is, so they share a
      // bucket. Which *mark* to measure is decided from the layer's trace type
      // where the resolver is built, since that is what differs.
      case 'treemap':
      case 'icicle':
      case 'sunburst':
        groups.hierarchySeriesList.push(series);
        break;
      case 'wordcloud':
        groups.wordCloudSeriesList.push(series);
        break;
      // A map region IS addressable — the polygon amCharts drew reports a box
      // — so a choropleth gets a bucket and a resolver. The banding the model
      // navigates it by is rebuilt from the layer's own centroids; see
      // `buildChoroplethResolver`.
      case 'choropleth':
        groups.choroplethSeriesList.push({ series });
        break;
      // A sankey and a chord are one weighted graph drawn two ways, so they
      // share a bucket the way a treemap and an icicle do. Both had none at
      // all until #904: the only position on offer was the *braille* one — a
      // stage and an index within it — and recovering the node from that would
      // have meant reimplementing the model's stage layering here. The trace
      // now names the ribbon it outlined instead, as an index into the data
      // this adapter emitted, which is an inversion rather than a copy.
      case 'sankey':
      case 'chord':
        groups.flowSeriesList.push(series);
        break;
      // The same story with the component walk in place of the layering.
      case 'network':
        groups.networkSeriesList.push(series);
        break;
      default:
        break;
    }
  }

  return groups;
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
  const candlestickSeries = filterSeries(groups.candlestickSeriesList, filterCandlestickItems);
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
  let candlestickIdx = 0;
  let dumbbellIdx = 0;
  let ganttIdx = 0;
  let hierarchyIdx = 0;
  let wordCloudIdx = 0;
  let flowIdx = 0;
  let networkIdx = 0;
  let choroplethIdx = 0;

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
        const kind: NavItemTarget['kind']
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
      case TraceType.CANDLESTICK: {
        // MAIDR's row picks which of the five numbers is announced -- open,
        // high, low, close or volatility -- and every one of them belongs to
        // the same candle, so only the column decides what is outlined. The
        // reading a dumbbell already gives its two ends, for the same reason.
        const entry = candlestickSeries[candlestickIdx++];
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
      case TraceType.ICICLE:
      case TraceType.SUNBURST: {
        // One tree, three marks: a treemap block and an icicle bar are
        // rectangles, a sunburst node is a wedge.
        const kind: NavItemTarget['kind']
          = layer.type === TraceType.SUNBURST ? 'slice' : 'column';
        register(
          layer.id,
          buildHierarchyResolver(groups.hierarchySeriesList[hierarchyIdx++], kind),
        );
        break;
      }
      case TraceType.GAUGE: {
        // The one layer whose source is the chart rather than a series — a
        // ClockHand gauge has no series for `groupSeries` to have bucketed.
        register(layer.id, buildGaugeResolver(chart));
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
        // The navigation callback now says which points it means, by their
        // index in the `data` this adapter supplied, so a cloud resolves to the
        // marks that drew them. It stayed unresolved for as long as the only
        // position on offer was the braille one, which for a scatter is a cell
        // of a *binned grid* rather than a point.
        register(layer.id, buildCloudResolver(nextDeclared(layer.type), layer));
        break;
      }
      case TraceType.CHOROPLETH: {
        register(
          layer.id,
          buildChoroplethResolver(groups.choroplethSeriesList[choroplethIdx++], layer),
        );
        break;
      }
      case TraceType.HEATMAP: {
        const series = groups.heatmapSeries[heatIdx++];
        if (series) {
          register(layer.id, buildHeatmapResolver(series, layer.data as HeatmapData));
        }
        break;
      }
      // A sankey and a chord are one weighted graph drawn two ways, and were
      // collected together for that reason; an `ArcDiagram` is announced as a
      // sankey and lands with them.
      case TraceType.SANKEY:
      case TraceType.CHORD: {
        register(layer.id, buildFlowResolver(groups.flowSeriesList[flowIdx++], layer));
        break;
      }
      // The same am5flow series, read a third way — so its resolver is the
      // flow one, taken from the declared queue rather than from the bucket.
      case TraceType.ALLUVIAL: {
        register(
          layer.id,
          buildFlowResolver(nextDeclared(TraceType.ALLUVIAL)?.series, layer),
        );
        break;
      }
      case TraceType.NETWORK: {
        register(
          layer.id,
          buildNetworkResolver(groups.networkSeriesList[networkIdx++], layer),
        );
        break;
      }
      default:
        break;
    }
  }
}
