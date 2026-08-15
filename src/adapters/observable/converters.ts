/**
 * Converts a rendered Observable Plot chart into MAIDR's schema.
 *
 * The adapter reads the drawn chart rather than the options that produced it,
 * because in the setting it was written for — an `{ojs}` cell in a Quarto
 * document — the options are not reachable. What is reachable is the `<svg>`
 * Plot inserted and the `scale` function it hung off that node, and between
 * them they carry everything a layer needs: an element's geometry says where
 * it was drawn, and running that back through the scale says what it means.
 *
 * ## What is recovered, and how exactly
 *
 * Inverting a pixel is exact to within float noise, which {@link cleanNumber}
 * removes, so a bar drawn for `3.14159` is announced as `3.14159`. Three things
 * are less exact than that, and none of them is presented as though it were:
 *
 * - **Marks whose value lives in a colour.** A `cell` mark encodes its
 *   magnitude as an 8-bit fill, so several distinct values render as one
 *   colour and no inversion can tell them apart. Heatmaps are skipped rather
 *   than announced approximately.
 * - **Lines drawn with a non-interpolating curve.** `curveBasis` and
 *   `curveBundle` draw through control points that are not data points. The
 *   adapter detects the mismatch — Plot binds the datum indices to the path,
 *   so the expected count is known — and skips the mark instead of announcing
 *   the control polygon.
 * - **Every line and area, a little.** Their vertices are read back out of the
 *   path's `d` attribute, where the serializer already rounded each
 *   coordinate, so the value is rounded to the precision that quantum buys and
 *   no finer. On an ordinary chart it comes back exact.
 *
 * @packageDocumentation
 */

import type {
  AxisConfig,
  BarPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { MarkFacet } from './introspect';
import type { MarkDatum, ObservablePlotOptions, PlotScale, PlotScales } from './types';
import { ensureContainerId, nextId } from '@adapters/shared/selectorUtil';
import { Orientation, TraceType } from '@type/grammar';
import {
  boxCompositeGroups,
  findMarkGroups,
  readAxisLabel,
  readTitles,
  resolveSvg,
  splitFacets,
} from './introspect';
import {
  bandIntervals,
  cleanNumber,
  cleanToGeometry,
  deriveScale,
  isContinuous,
  isDiscrete,
  isTemporal,
  readScales,
  toNumber,
  valueAtColor,
  valueAtPixel,
} from './scales';
import { orderElements, stampLayer, stampSeries } from './selectors';

/** Prefix for generated element ids and the log prefix for adapter warnings. */
const PREFIX = 'maidr-observable';

/**
 * Everything a mark conversion needs that is not the mark itself.
 */
interface ConversionContext {
  /** The plot's scales, after any tick-derived fallback. */
  scales: PlotScales;
  /** Id stamped on the plot's `<svg>`, which scopes every selector. */
  containerId: string;
  /** Axis labels, resolved from options or the rendered axis. */
  axes: { x?: string; y?: string; z?: string };
  /** Caller-supplied trace-type overrides, keyed by Plot's mark label. */
  markTypes: Record<string, string>;
  /** Which axes carry dates, and so need a date format on the announcement. */
  temporal: { x: boolean; y: boolean };
  /** Running count of emitted layers, used to make selector tokens unique. */
  layerCount: number;
}

/**
 * Builds a MAIDR schema from a rendered Observable Plot chart.
 *
 * @param element - The element `Plot.plot()` returned, or any element of it.
 * @param options - Overrides for what the DOM cannot say.
 * @returns The schema, or `null` when no mark could be converted.
 */
export function observablePlotToMaidr(
  element: Element,
  options: ObservablePlotOptions = {},
): Maidr | null {
  const svg = resolveSvg(element);
  if (!svg)
    return null;

  const scales = resolveScales(element, svg);
  const containerId = ensureContainerId(svg, PREFIX);
  const titles = readTitles(element);

  const context: ConversionContext = {
    scales,
    containerId,
    axes: {
      x: options.axes?.x ?? readAxisLabel(svg, 'x'),
      y: options.axes?.y ?? readAxisLabel(svg, 'y'),
      z: options.axes?.z,
    },
    markTypes: options.markTypes ?? {},
    temporal: { x: isTemporal(scales.x), y: isTemporal(scales.y) },
    layerCount: 0,
  };

  const cells = collectFacetCells(svg, context);
  if (cells.length === 0)
    return null;

  const subplots = arrangeSubplots(cells);
  if (subplots.length === 0)
    return null;

  const figureAxes = figureLevelAxes(svg, options, scales);

  return {
    id: options.id ?? nextId(PREFIX),
    ...(options.title ?? titles.title ? { title: options.title ?? titles.title } : {}),
    ...(options.subtitle ?? titles.subtitle ? { subtitle: options.subtitle ?? titles.subtitle } : {}),
    ...(options.caption ?? titles.caption ? { caption: options.caption ?? titles.caption } : {}),
    ...(figureAxes ? { axes: figureAxes } : {}),
    subplots,
  };
}

/**
 * Reads the plot's scales, falling back to the rendered axis ticks.
 *
 * The fallback matters for a plot the adapter did not see rendered — one
 * parsed from saved HTML, or moved with `innerHTML` — where Plot's `scale`
 * function is gone but every tick it drew is still there.
 *
 * @param element - Any element of the plot.
 * @param svg     - The plot's `<svg>`.
 * @returns The scales, with `x` and `y` filled in where possible.
 */
function resolveScales(element: Element, svg: Element): PlotScales {
  const scales = readScales(element);
  if (!scales.x)
    scales.x = deriveScale(svg, 'x');
  if (!scales.y)
    scales.y = deriveScale(svg, 'y');
  return scales;
}

/** One facet cell of the plot, with the layers drawn inside it. */
interface FacetCell {
  /** Row index within the `fy` domain, or 0 when the plot is not faceted. */
  row: number;
  /** Column index within the `fx` domain, or 0 when the plot is not faceted. */
  column: number;
  /** The facet's `fx` / `fy` values, announced as the subplot's title. */
  label?: string;
  layers: MaidrLayer[];
  /** Series names seen in the cell, in first-drawn order. */
  legend: string[];
}

/**
 * Converts every mark of the plot, grouped by the facet it was drawn in.
 *
 * @param svg     - The plot's `<svg>`.
 * @param context - The conversion context.
 * @returns One entry per facet that produced at least one layer.
 */
function collectFacetCells(svg: Element, context: ConversionContext): FacetCell[] {
  const cells = new Map<string, FacetCell>();
  const groups = findMarkGroups(svg);
  // A box plot is four marks that only mean anything together, and this adapter
  // reads none of them; left in, its interquartile box would be announced as an
  // ordinary bar whose value is a height nobody plotted.
  const composite = boxCompositeGroups(groups);

  for (const [index, { label, group }] of groups.entries()) {
    if (composite.has(index))
      continue;
    for (const facet of splitFacets(group)) {
      const converted = convertMark(label, facet, context);
      if (!converted)
        continue;

      const position = facetPosition(facet, context.scales);
      const key = `${position.row}:${position.column}`;
      const cell = cells.get(key) ?? {
        ...position,
        layers: [],
        legend: [],
      };
      cell.layers.push(converted.layer);
      for (const name of converted.legend) {
        if (!cell.legend.includes(name))
          cell.legend.push(name);
      }
      cells.set(key, cell);
    }
  }

  return Array.from(cells.values());
}

/**
 * Locates a facet within the `fx` / `fy` grid.
 *
 * Plot draws each facet in a group translated by the distance between that
 * facet's band and the first one, so adding the offset back to the start of
 * the inner scale's range gives a pixel inside the facet's band.
 *
 * @param facet  - The facet, as returned by `splitFacets`.
 * @param scales - The plot's scales.
 * @returns The facet's row, column, and label.
 */
function facetPosition(
  facet: MarkFacet,
  scales: PlotScales,
): { row: number; column: number; label?: string } {
  const column = facetIndex(scales.fx, scales.x, facet.offsetX);
  const row = facetIndex(scales.fy, scales.y, facet.offsetY);
  const parts = [
    column ? column.value : undefined,
    row ? row.value : undefined,
  ].filter((part): part is string | number => part !== undefined);

  return {
    row: row?.index ?? 0,
    column: column?.index ?? 0,
    ...(parts.length > 0 ? { label: parts.map(String).join(', ') } : {}),
  };
}

/**
 * Matches one facet offset to its band in the facet scale.
 *
 * @param facetScale - The `fx` or `fy` scale, when the plot is faceted.
 * @param innerScale - The corresponding `x` or `y` scale, whose range start is
 *                     the origin the offset is measured from.
 * @param offset     - The facet group's translate along that axis.
 * @returns The band's index and value, or `null` when there is no facet scale.
 */
function facetIndex(
  facetScale: PlotScale | undefined,
  innerScale: PlotScale | undefined,
  offset: number,
): { index: number; value: string | number } | null {
  if (!facetScale || !isDiscrete(facetScale))
    return null;

  const origin = toNumber(innerScale?.range?.[0]) ?? 0;
  const intervals = bandIntervals(facetScale);
  if (intervals.length === 0)
    return null;

  const pixel = offset + origin;
  const match = intervals.find(interval => pixel >= interval.start && pixel <= interval.end)
    ?? intervals.reduce((best, current) =>
      Math.abs(current.start - pixel) < Math.abs(best.start - pixel) ? current : best);

  return { index: intervals.indexOf(match), value: match.value };
}

/**
 * Lays facet cells out as MAIDR's row-major subplot grid.
 *
 * @param cells - The converted facet cells.
 * @returns The subplot grid, rows outermost.
 */
function arrangeSubplots(cells: FacetCell[]): MaidrSubplot[][] {
  const rowCount = Math.max(...cells.map(cell => cell.row)) + 1;
  const columnCount = Math.max(...cells.map(cell => cell.column)) + 1;

  const grid: MaidrSubplot[][] = [];
  for (let row = 0; row < rowCount; row++) {
    const rowSubplots: MaidrSubplot[] = [];
    for (let column = 0; column < columnCount; column++) {
      const cell = cells.find(one => one.row === row && one.column === column);
      // A facet grid can have empty cells — a combination with no data draws
      // nothing. MAIDR reads a subplot with no layers as an empty panel, which
      // is exactly what was drawn, so the hole is preserved rather than
      // collapsed (which would misalign every panel after it).
      rowSubplots.push({
        ...(cell && cell.legend.length > 1 ? { legend: cell.legend } : {}),
        layers: cell?.layers ?? [],
      });
    }
    grid.push(rowSubplots);
  }

  // Faceted plots name their panels so a reader arriving at one is told which
  // facet they are in rather than "Subplot 2 of 3: this is a bar plot" — which
  // is the whole content of the split, and what a legend gives a sighted
  // reader for free. The name goes on the layer's `title`, which is where
  // `focusedSubplotTitle` (src/model/plot.ts) reads a panel's name from.
  // An unfaceted plot has exactly one cell and nothing to name.
  if (grid.length === 1 && grid[0].length === 1)
    return grid;

  for (const cell of cells) {
    const layers = grid[cell.row]?.[cell.column]?.layers;
    if (!layers || !cell.label)
      continue;
    for (const layer of layers)
      layer.title ??= cell.label;
  }
  return grid;
}

/**
 * Figure-wide axis labels, which a faceted plot shares across its panels.
 *
 * @param svg     - The plot's `<svg>`.
 * @param options - The caller's overrides.
 * @param scales  - The plot's scales, used to tell a faceted plot from a plain one.
 * @returns The labels, or `undefined` when the plot is not faceted.
 */
function figureLevelAxes(
  svg: Element,
  options: ObservablePlotOptions,
  scales: PlotScales,
): { x?: Pick<AxisConfig, 'label'>; y?: Pick<AxisConfig, 'label'> } | undefined {
  if (!scales.fx && !scales.fy)
    return undefined;
  const x = options.axes?.x ?? readAxisLabel(svg, 'x');
  const y = options.axes?.y ?? readAxisLabel(svg, 'y');
  if (!x && !y)
    return undefined;
  return {
    ...(x ? { x: { label: x } } : {}),
    ...(y ? { y: { label: y } } : {}),
  };
}

/** A converted mark: its layer, and any series names it contributed. */
interface ConvertedMark {
  layer: MaidrLayer;
  legend: string[];
}

/**
 * Converts one mark, in one facet, into a layer.
 *
 * @param label   - The mark's Plot `aria-label`, which names its kind.
 * @param facet   - The mark's elements within one facet.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the mark is not one the adapter reads.
 */
function convertMark(
  label: string,
  facet: MarkFacet,
  context: ConversionContext,
): ConvertedMark | null {
  if (facet.elements.length === 0)
    return null;

  switch (label) {
    case 'bar':
      return convertBar(facet, context);
    case 'rect':
      return convertRect(facet, context);
    case 'dot':
      return convertDot(facet, context);
    case 'line':
      return convertLine(facet, context, TraceType.LINE);
    case 'area':
      return convertLine(facet, context, TraceType.AREA);
    default:
      return null;
  }
}

/**
 * Reads a bar mark, whether it is plain or stacked.
 *
 * Which it is cannot be asked of the mark — Plot stacks a `barY` the moment it
 * is given a `fill` channel, and draws the result as the same flat list of
 * rects — so it is read off the geometry: two rects sharing a band are a
 * stack, one rect per band is a plain bar.
 *
 * @param facet   - The mark's rects.
 * @param context - The conversion context.
 * @returns The layer, or `null` when neither axis is categorical.
 */
function convertBar(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  const orientation = barOrientation(context.scales);
  if (!orientation)
    return null;

  const data = facet.elements
    .map(element => readRectDatum(element, context.scales, orientation, true))
    .filter((datum): datum is MarkDatum => datum !== null);
  if (data.length === 0)
    return null;

  return buildBarLayer(data, context, orientation, TraceType.BAR);
}

/**
 * Reads a rect mark — the shape Plot's binning produces.
 *
 * A `rect` on a continuous axis is a histogram: its bars span an interval
 * rather than sitting on a category. On a categorical axis it is an ordinary
 * bar chart drawn with a different mark, and is read as one.
 *
 * @param facet   - The mark's rects.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the rects cannot be read.
 */
function convertRect(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  const override = context.markTypes.rect;
  const orientation = barOrientation(context.scales);
  if (orientation && override !== TraceType.HISTOGRAM)
    return convertBar(facet, context);

  const { scales } = context;
  if (!isContinuous(scales.x) || !isContinuous(scales.y))
    return null;

  // Which axis the bins run along is not stated anywhere; `binX` and `binY`
  // both draw a `rect`. It is visible in the geometry: the bars all start at
  // the same baseline on the value axis and tile along the binned one. Read the
  // wrong way round, a horizontal histogram becomes a set of identical bars
  // whose value is the width of a bin.
  const binned = binnedOrientation(facet.elements, scales);
  const binScale = binned === Orientation.VERTICAL ? scales.x : scales.y;

  const bins = facet.elements
    .map(element => readRectDatum(element, scales, binned, false))
    .filter((datum): datum is MarkDatum => datum !== null);
  if (bins.length === 0)
    return null;

  // A binned rect given a `fill` channel is a *stacked* histogram: each bin is
  // drawn as several rects, one per series. Read as one bin apiece it would
  // double the bin count and halve every count, so it becomes a stacked bar
  // over the bins instead — which is what it is, and keeps the series split
  // that the fill was added to show.
  if (hasStackedBins(bins)) {
    const columns = distinctBins(bins);
    const edges = uniformBinEdges(columns, binScale);
    return buildBarLayer(
      bins.map(bin => binAsCategory(bin, columns, edges)),
      context,
      binned,
      TraceType.BAR,
    );
  }

  const ordered = orderedByBin(bins);
  const data = toHistogramPoints(ordered, binScale, binned);
  // The bins are announced left to right, so the elements are moved to match:
  // a selector resolves in document order, and Plot draws pre-binned intervals
  // in whatever order the author's rows arrived in.
  orderElements(ordered.map(bin => bin.element));
  const token = `L${context.layerCount++}`;

  return {
    legend: [],
    layer: {
      id: token,
      type: TraceType.HISTOGRAM,
      orientation: binned,
      selectors: stampLayer(ordered.map(bin => bin.element), context.containerId, token),
      axes: axisConfig(context),
      data,
    },
  };
}

/**
 * Which axis a binned rect mark's bins run along.
 *
 * `binX` and `binY` both draw a `rect`, and nothing in the DOM says which was
 * used. What distinguishes them is the baseline: counts grow from zero, so on
 * the value axis every bar has an edge exactly where the scale puts zero, while
 * on the binned axis at most the one bin that happens to begin there does.
 *
 * That holds whether or not a `fill` channel stacked the bars — a stack's first
 * segment still sits on the baseline — which the geometry alone cannot settle,
 * because bins tile their axis and so do the stack positions.
 *
 * @param elements - The mark's rects.
 * @param scales   - The plot's scales, which say where zero is.
 * @returns The orientation, defaulting to vertical when nothing distinguishes
 *          the two.
 */
function binnedOrientation(elements: readonly Element[], scales: PlotScales): Orientation {
  const onX = countTouching(elements, ['x', 'width'], baselinePixel(scales.x));
  const onY = countTouching(elements, ['y', 'height'], baselinePixel(scales.y));
  return onX > onY ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

/**
 * Where a scale draws zero, which is where a count's bars start.
 *
 * @param scale - The scale to ask.
 * @returns The pixel, or `null` when the scale cannot place zero.
 */
function baselinePixel(scale: PlotScale | undefined): number | null {
  if (!scale || typeof scale.apply !== 'function' || !isContinuous(scale))
    return null;
  return toNumber(scale.apply(0));
}

/**
 * How many rects have an edge on a given pixel along one axis.
 *
 * @param elements   - The mark's rects.
 * @param attributes - The start and extent attributes for that axis.
 * @param baseline   - The pixel to look for.
 * @returns The count, or `0` when there is no baseline to look for.
 */
function countTouching(
  elements: readonly Element[],
  attributes: readonly [string, string],
  baseline: number | null,
): number {
  if (baseline === null)
    return 0;
  let count = 0;
  for (const element of elements) {
    const start = attributeNumber(element, attributes[0]);
    const extent = attributeNumber(element, attributes[1]);
    if (start === null || extent === null)
      continue;
    if (Math.abs(start - baseline) <= 1 || Math.abs(start + extent - baseline) <= 1)
      count++;
  }
  return count;
}

/**
 * The interval of one axis a rect covers, ordered low to high.
 *
 * @param scale  - The scale that axis is drawn on.
 * @param start  - The rect's near edge in pixels.
 * @param extent - Its size in pixels along that axis.
 * @returns The bin's bounds in data units.
 */
function binEdgesAlong(
  scale: PlotScale | undefined,
  start: number,
  extent: number,
): { xMin: number; xMax: number } {
  const near = toNumber(valueAtPixel(scale, start)) ?? 0;
  const far = toNumber(valueAtPixel(scale, start + extent)) ?? 0;
  return { xMin: Math.min(near, far), xMax: Math.max(near, far) };
}

/**
 * Whether the rects of a binned mark stack, rather than tiling the axis.
 *
 * @param bins - The mark's rects, as read.
 * @returns True when two rects cover the same interval of the x axis.
 */
function hasStackedBins(bins: MarkDatum[]): boolean {
  const seen = new Set<string>();
  for (const bin of bins) {
    const key = `${bin.xMin}:${bin.xMax}`;
    if (seen.has(key))
      return true;
    seen.add(key);
  }
  return false;
}

/**
 * The distinct intervals a stacked histogram's rects cover, ordered along the
 * axis.
 *
 * @param bins - The mark's rects, as read.
 * @returns One entry per bin, with the duplicates each series contributed
 *          collapsed.
 */
function distinctBins(bins: MarkDatum[]): MarkDatum[] {
  const seen = new Map<string, MarkDatum>();
  for (const bin of bins) {
    const key = `${bin.xMin}:${bin.xMax}`;
    if (!seen.has(key))
      seen.set(key, bin);
  }
  return [...seen.values()].sort((a, b) => (a.xMin ?? 0) - (b.xMin ?? 0));
}

/**
 * Re-labels a bin by its midpoint, so a stacked histogram reads as a bar chart.
 *
 * The midpoint comes from the reconstructed edges where they could be
 * recovered, so a stacked histogram's categories read as `1` and `3` rather
 * than as the inset-shifted `1.0086` the rect was measured at.
 *
 * @param bin     - The bin.
 * @param columns - The distinct bins, ordered along the axis.
 * @param edges   - Reconstructed bin edges, or `null` when they could not be.
 * @returns The same datum with a numeric category on `x`.
 */
function binAsCategory(
  bin: MarkDatum,
  columns: MarkDatum[],
  edges: number[] | null,
): MarkDatum {
  const index = columns.findIndex(one => one.xMin === bin.xMin && one.xMax === bin.xMax);
  if (edges && index >= 0)
    return { ...bin, x: (edges[index] + edges[index + 1]) / 2 };
  return { ...bin, x: ((bin.xMin ?? 0) + (bin.xMax ?? 0)) / 2 };
}

/**
 * Orders a mark's rects along the axis.
 *
 * A chart drawn out of order still reads left to right, and the elements are
 * moved to match so the highlight follows — stamping alone would not, since a
 * selector resolves in document order.
 *
 * @param bins - The mark's rects, as read.
 * @returns The same rects, ordered by bin start.
 */
function orderedByBin(bins: MarkDatum[]): MarkDatum[] {
  return [...bins].sort((a, b) => (a.xMin ?? 0) - (b.xMin ?? 0));
}

/**
 * Turns bin rectangles into histogram points.
 *
 * The edges cannot simply be read off the rects. Plot insets a binned rect so
 * neighbouring bars are visually separated, and the inset is not symmetric —
 * the left edge moves in by a pixel and the right edge does not — so a bin over
 * `[0, 2]` reads back as `[0.024, 2]`. The bias is a pixel wide, which is
 * nothing on screen and plainly wrong in an announcement.
 *
 * What is exact is the *spacing*: every rect is displaced the same way, so the
 * distance between consecutive left edges is the bin width to full precision.
 * Plot also fits the x domain to the bins' extent, which pins where the first
 * one starts. Together those give every edge, and the reconstruction is only
 * used when the two agree — a plot with an author-set domain or uneven bins
 * fails that check and keeps its measured edges rather than being forced onto
 * a grid it was never drawn on.
 *
 * @param bins  - The bins, already ordered along the axis.
 * @param scale - The x scale, whose domain bounds the bins.
 * @returns One histogram point per bin, in the same order.
 */
function toHistogramPoints(
  bins: MarkDatum[],
  scale: PlotScale | undefined,
  orientation: Orientation,
): HistogramPoint[] {
  const edges = uniformBinEdges(bins, scale);

  return bins.map((bin, index) => {
    const low = edges ? edges[index] : (bin.xMin ?? 0);
    const high = edges ? edges[index + 1] : (bin.xMax ?? 0);
    const midpoint = (low + high) / 2;
    const count = bin.y;

    // `Histogram` reads the bin bounds from `xMin`/`xMax` when the layer is
    // vertical and from `yMin`/`yMax` when it is horizontal, and takes the
    // frequency from the other axis in both cases. See {@link placePoint}.
    return orientation === Orientation.VERTICAL
      ? { x: midpoint, y: count, xMin: low, xMax: high, yMin: 0, yMax: count }
      : { x: count, y: midpoint, xMin: 0, xMax: count, yMin: low, yMax: high };
  });
}

/**
 * Reconstructs evenly spaced bin edges from the x domain.
 *
 * @param bins  - The bins, ordered along the axis.
 * @param scale - The x scale.
 * @returns `bins.length + 1` edges, or `null` when the bins are not evenly
 *          spaced across the domain and so cannot be reconstructed.
 */
function uniformBinEdges(bins: MarkDatum[], scale: PlotScale | undefined): number[] | null {
  if (!scale || !Array.isArray(scale.domain) || scale.domain.length < 2 || bins.length === 0)
    return null;
  const first = toNumber(scale.domain[0]);
  const last = toNumber(scale.domain[scale.domain.length - 1]);
  if (first === null || last === null || first === last)
    return null;
  // A reversed axis states its domain high-to-low. The bins still run low to
  // high along the data, so the endpoints are ordered rather than taken as
  // given — read literally, a reversed axis looks like an empty domain and
  // every bin keeps the inset-shifted edge it was measured at.
  const start = Math.min(first, last);
  const end = Math.max(first, last);

  const width = (end - start) / bins.length;
  // The measured left edges are all displaced by the same inset, so their
  // spacing is the true bin width even though their positions are not.
  for (let index = 1; index < bins.length; index++) {
    const measured = (bins[index].xMin ?? 0) - (bins[index - 1].xMin ?? 0);
    if (Math.abs(measured - width) > width * 0.02)
      return null;
  }

  const span = end - start;
  return Array.from(
    { length: bins.length + 1 },
    (_, index) => cleanNumber(start + index * width, span),
  );
}

/**
 * Reads a dot mark.
 *
 * A dot against two continuous axes is a scatter plot; against a categorical
 * one it is a Cleveland dot plot, which MAIDR navigates as a bar chart and
 * announces as the mark the author actually drew.
 *
 * @param facet   - The mark's circles.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the dots cannot be positioned.
 */
function convertDot(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  const { scales } = context;

  if (isContinuous(scales.x) && isContinuous(scales.y)) {
    const points: ScatterPoint[] = [];
    const elements: Element[] = [];
    for (const element of facet.elements) {
      const centre = dotCentre(element);
      if (!centre)
        continue;
      const x = toNumber(valueAtPixel(scales.x, centre.x));
      const y = toNumber(valueAtPixel(scales.y, centre.y));
      if (x === null || y === null)
        continue;
      points.push({ x, y });
      elements.push(element);
    }
    if (points.length === 0)
      return null;

    const token = `L${context.layerCount++}`;
    return {
      legend: [],
      layer: {
        id: token,
        type: TraceType.SCATTER,
        selectors: stampLayer(elements, context.containerId, token),
        axes: axisConfig(context),
        data: points,
      },
    };
  }

  const orientation = barOrientation(scales);
  if (!orientation)
    return null;

  const data: MarkDatum[] = [];
  for (const element of facet.elements) {
    const centre = dotCentre(element);
    if (!centre)
      continue;
    const datum = readPointDatum(element, scales, orientation, centre);
    if (datum)
      data.push(datum);
  }
  if (data.length === 0)
    return null;

  return buildBarLayer(data, context, orientation, TraceType.DOT);
}

/**
 * Reads a line or area mark, one series per drawn path.
 *
 * @param facet   - The mark's paths.
 * @param context - The conversion context.
 * @param type    - Which trace to emit.
 * @returns The layer, or `null` when no path could be parsed.
 */
function convertLine(
  facet: MarkFacet,
  context: ConversionContext,
  type: TraceType.LINE | TraceType.AREA,
): ConvertedMark | null {
  const { scales } = context;
  const series: LinePoint[][] = [];
  const elements: Element[][] = [];
  const legend: string[] = [];

  for (const element of facet.elements) {
    if (element.tagName.toLowerCase() !== 'path')
      continue;

    const name = valueAtColor(scales.color, strokeOrFill(element));
    const path = parsePathVertices(element, type === TraceType.AREA);
    if (path === null)
      continue;

    const points: LinePoint[] = [];
    for (const vertex of path.vertices) {
      // Unlike a rect's x and y, a path's coordinates were rounded on the way
      // into the `d` attribute, so the inverted value is only good to the
      // quantum that rounding left. Reporting it in full would dress a rounded
      // pixel up as an exact measurement.
      const x = pathValue(scales.x, vertex.x, path.pixelError);
      const y = toNumber(pathValue(scales.y, vertex.y, path.pixelError));
      if (x === null || y === null)
        continue;
      points.push({ x, y, ...(name !== null ? { z: String(name) } : {}) });
    }
    if (points.length === 0)
      continue;

    series.push(points);
    elements.push([element]);
    if (name !== null && !legend.includes(String(name)))
      legend.push(String(name));
  }

  if (series.length === 0)
    return null;

  const token = `L${context.layerCount++}`;
  return {
    legend,
    layer: {
      id: token,
      type,
      selectors: stampSeries(elements, context.containerId, token),
      axes: axisConfig(context),
      data: series,
    },
  };
}

/**
 * Assembles bar-shaped data into a plain or a stacked layer.
 *
 * @param data        - The mark's data, in draw order.
 * @param context     - The conversion context.
 * @param orientation - Which axis carries the magnitude.
 * @param plainType   - The trace to emit when the bars do not stack.
 * @returns The layer and its series names.
 */
function buildBarLayer(
  data: MarkDatum[],
  context: ConversionContext,
  orientation: Orientation,
  plainType: TraceType.BAR | TraceType.DOT,
): ConvertedMark {
  const token = `L${context.layerCount++}`;
  const seriesNames = uniqueInOrder(
    data.map(datum => datum.series).filter((name): name is string => name !== undefined),
  );
  // Only bars stack. A dot mark split by colour is a Cleveland dot plot with
  // groups, and typing it `stacked_bar` both announces it as the wrong chart
  // and loses its highlight — a segmented layer resolves its marks as rects or
  // paths, and a dot draws neither.
  const grid = plainType === TraceType.BAR && seriesNames.length > 1
    ? stackedGrid(data, seriesNames, orientation)
    : null;

  if (!grid) {
    // Along the axis rather than in the order Plot drew them, so the arrow keys
    // sweep the chart the way it looks. Plot draws in data order, which a
    // `sort` option makes something else entirely.
    const ordered = orderAlongAxis(data, orientation);
    const points: BarPoint[] = ordered.map(datum =>
      placePoint(datum.x, datum.y, orientation));
    return {
      legend: [],
      layer: {
        id: token,
        type: plainType,
        orientation,
        selectors: stampLayer(ordered.map(datum => datum.element), context.containerId, token),
        axes: axisConfig(context),
        data: points,
      },
    };
  }

  // Document order now runs series by series across the categories, which is
  // what `order: 'row'` names — and it is true by construction rather than by
  // inspection, so there is no draw order Plot can produce that this misreads.
  orderElements(grid.elements);

  return {
    legend: seriesNames,
    layer: {
      id: token,
      type: TraceType.STACKED,
      orientation,
      selectors: stampLayer(grid.elements, context.containerId, token),
      domMapping: { order: 'row' },
      axes: axisConfig(context),
      data: grid.rows,
    },
  };
}

/**
 * Puts a category and its value on the axes MAIDR reads them from.
 *
 * A trace does not infer which of a point's coordinates is the measurement; it
 * is told by the layer's orientation and reads that axis. `AbstractBarPlot`
 * takes the value from `point.y` when the layer is vertical and from `point.x`
 * when it is horizontal (`src/model/bar.ts`), and `SegmentedTrace` names the
 * category off the opposite one. So a horizontal layer is not a vertical layer
 * with a flag on it: its points are transposed.
 *
 * Emitting them the same way round for both — which this adapter did — leaves a
 * horizontal chart looking bound and reading as nothing at all: `Number('Mon')`
 * is `NaN`, so there is no sonification, no braille, and the description
 * reports its minimum and maximum as missing. Nothing about that is visible in
 * the schema on its own, which is why the layers this builds are checked
 * against the real traces in `test/adapters/observable/traceContract.test.ts`
 * rather than against an expected shape.
 *
 * @param category    - The value on the categorical axis.
 * @param value       - The measurement.
 * @param orientation - Which way the layer runs.
 * @returns The point, with each figure on the axis its trace reads it from.
 */
function placePoint(
  category: string | number,
  value: number,
  orientation: Orientation,
): BarPoint {
  return orientation === Orientation.VERTICAL
    ? { x: category, y: value }
    : { x: value, y: category };
}

/**
 * Arranges a split mark's segments into MAIDR's series-by-category grid.
 *
 * Two orders have to agree here, and neither can be assumed. The categories are
 * ordered along the axis, because that is the order a reader arrows through
 * them — Plot draws in the order the data arrived, which for a stack out of a
 * database is whatever the rows were sorted by. The elements are then listed in
 * the order the grid reads, so the caller can move the DOM to match; a cell
 * with no segment contributes a zero and no element, which is the shape
 * `domMapping` already describes.
 *
 * @param data        - The mark's segments, as read.
 * @param seriesNames - The series, in first-drawn order.
 * @param orientation - Which axis carries the categories.
 * @returns The grid and the elements it describes, or `null` when the segments
 *          do not form one — which is not an error, only a plain bar chart.
 */
function stackedGrid(
  data: MarkDatum[],
  seriesNames: string[],
  orientation: Orientation,
): { rows: SegmentedPoint[][]; elements: Element[] } | null {
  const categories = categoriesAlongAxis(data, orientation);
  if (data.length <= categories.length)
    return null;

  // Two segments sharing a category and a series are two rows of the author's
  // data that the stack transform did not aggregate. The grid has one cell for
  // them and the mark has two rects, so the counts diverge and every later
  // highlight shifts by one. A plain bar layer reads all of them, in order.
  const seen = new Set<string>();
  for (const datum of data) {
    const key = `${String(datum.series)}\u0000${String(datum.x)}`;
    if (seen.has(key))
      return null;
    seen.add(key);
  }

  // Reading this as a stack means moving its segments into the grid's order,
  // and moving a sibling changes what is painted over what. A real stack's
  // segments meet without overlapping, so a mark whose segments do overlap is
  // not one, and is left to the plain bar path — which keeps draw order and
  // repaints nothing.
  if (anyOverlap(data.map(datum => datum.element)))
    return null;

  const rows: SegmentedPoint[][] = [];
  const elements: Element[] = [];
  let missing = false;
  let drawnZero = false;
  for (const name of seriesNames) {
    const row: SegmentedPoint[] = [];
    for (const category of categories) {
      const match = data.find(datum => datum.series === name && datum.x === category);
      row.push({ ...placePoint(category, match?.y ?? 0, orientation), z: name });
      if (match) {
        elements.push(match.element);
        drawnZero ||= match.y === 0;
      } else {
        missing = true;
      }
    }
    rows.push(row);
  }

  // A cell with no segment is written as zero, which is the same thing a
  // segment whose value *is* zero says — and Plot draws a flat rect for that
  // one. A segmented layer skips zero-valued cells when it has fewer elements
  // than cells, so with both kinds present it skips one too many and every
  // later highlight slides along by one. A plain bar layer has no such
  // ambiguity: it announces exactly the segments that were drawn.
  if (missing && drawnZero)
    return null;

  return { rows, elements };
}

/**
 * Puts a mark's data in the order a reader arrows through it, moving the
 * elements to match.
 *
 * Reordering is skipped when any two of the mark's elements overlap: moving a
 * sibling changes what is painted over what, which is invisible for marks that
 * tile — bars, bins, a Cleveland dot plot — and is not for ones that do not.
 * The data then stays in draw order, where it still lines up with the elements.
 *
 * @param data        - The mark's data, in draw order.
 * @param orientation - Which axis carries the categories.
 * @returns The data, ordered along the axis where that is safe.
 */
function orderAlongAxis(data: MarkDatum[], orientation: Orientation): MarkDatum[] {
  if (data.length < 2 || anyOverlap(data.map(datum => datum.element)))
    return data;

  const ordered = [...data].sort((a, b) =>
    markPosition(a.element, orientation) - markPosition(b.element, orientation));
  orderElements(ordered.map(datum => datum.element));
  return ordered;
}

/**
 * Whether any two of a mark's elements overlap on screen.
 *
 * @param elements - The mark's elements.
 * @returns True when two rectangles intersect.
 */
function anyOverlap(elements: readonly Element[]): boolean {
  const boxes = elements.map(bounds).filter((box): box is Bounds => box !== null);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].x1 > boxes[j].x0 && boxes[j].x1 > boxes[i].x0
        && boxes[i].y1 > boxes[j].y0 && boxes[j].y1 > boxes[i].y0) {
        return true;
      }
    }
  }
  return false;
}

/** A drawn element's bounding box. */
interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A rect's bounding box, or `null` for anything else.
 *
 * Only rects are measured: they are the marks whose paint order the reordering
 * could change, and the only ones whose extent is readable without a layout.
 *
 * @param element - The element to measure.
 * @returns Its box, or `null`.
 */
function bounds(element: Element): Bounds | null {
  const x = attributeNumber(element, 'x');
  const y = attributeNumber(element, 'y');
  const width = attributeNumber(element, 'width');
  const height = attributeNumber(element, 'height');
  if (x === null || y === null || width === null || height === null)
    return null;
  return { x0: x, y0: y, x1: x + width, y1: y + height };
}

/**
 * The categories of a split mark, ordered the way a reader arrows through them
 * rather than by when they were drawn.
 *
 * @param data        - The mark's segments, as read.
 * @param orientation - Which axis carries the categories.
 * @returns Each distinct category once, in axis order.
 */
function categoriesAlongAxis(
  data: MarkDatum[],
  orientation: Orientation,
): (string | number)[] {
  const positions = new Map<string | number, number>();
  for (const datum of data) {
    const pixel = markPosition(datum.element, orientation);
    const known = positions.get(datum.x);
    if (known === undefined || pixel < known)
      positions.set(datum.x, pixel);
  }
  const entries = [...positions.entries()];
  // Numeric categories are bins, and bins read low to high whichever way the
  // axis points. A horizontal chart draws its first band at the top, so
  // ordering those by pixel would announce the largest bin first.
  if (entries.every(([category]) => typeof category === 'number'))
    entries.sort((a, b) => (a[0] as number) - (b[0] as number));
  else
    entries.sort((a, b) => a[1] - b[1]);
  return entries.map(([category]) => category);
}

/**
 * Where a mark's element sits along the axis its categories run on.
 *
 * A vertical bar's categories are spaced across x and a horizontal bar's down
 * y, so reading the wrong one would order every category by its *value*.
 *
 * @param element     - The mark's element.
 * @param orientation - Which axis carries the categories.
 * @returns Its position in pixels along that axis.
 */
function markPosition(element: Element, orientation: Orientation): number {
  const vertical = orientation === Orientation.VERTICAL;
  const names = vertical ? (['x', 'cx'] as const) : (['y', 'cy'] as const);
  const attribute = attributeNumber(element, names[0]) ?? attributeNumber(element, names[1]);
  if (attribute !== null)
    return attribute;
  // Plot draws a dot as a `<circle>` only for the default symbol; every other
  // one is a `<path>` put in place by a transform. Reading zero for those would
  // collapse every category to the same position and fall back to draw order.
  const centre = dotCentre(element);
  if (centre)
    return vertical ? centre.x : centre.y;
  return 0;
}

/**
 * Reads one rectangle as a datum.
 *
 * @param element     - The `<rect>`.
 * @param scales      - The plot's scales.
 * @param orientation - Which axis carries the magnitude.
 * @param categorical - Whether the base axis is a band scale.
 * @returns The datum, or `null` when the rect cannot be read.
 */
function readRectDatum(
  element: Element,
  scales: PlotScales,
  orientation: Orientation,
  categorical: boolean,
): MarkDatum | null {
  const x = attributeNumber(element, 'x');
  const y = attributeNumber(element, 'y');
  const width = attributeNumber(element, 'width');
  const height = attributeNumber(element, 'height');
  if (x === null || y === null || width === null || height === null)
    return null;

  const series = valueAtColor(scales.color, strokeOrFill(element));
  const seriesField = series === null ? {} : { series: String(series) };

  if (orientation === Orientation.VERTICAL) {
    const upper = toNumber(valueAtPixel(scales.y, y));
    const lower = toNumber(valueAtPixel(scales.y, y + height));
    if (upper === null || lower === null)
      return null;
    const base = categorical
      ? valueAtPixel(scales.x, x + width / 2)
      : toNumber(valueAtPixel(scales.x, x + width / 2));
    if (base === null)
      return null;

    return {
      element,
      x: base,
      y: signedMagnitude(upper, lower),
      yMin: Math.min(upper, lower),
      yMax: Math.max(upper, lower),
      // Ordered rather than left-then-right: a reversed x axis draws the
      // interval's larger value at the smaller pixel, and a bin that reports a
      // minimum above its maximum reads as an empty range.
      ...(categorical ? {} : binEdgesAlong(scales.x, x, width)),
      ...seriesField,
    };
  }

  const right = toNumber(valueAtPixel(scales.x, x + width));
  const left = toNumber(valueAtPixel(scales.x, x));
  const base = categorical
    ? valueAtPixel(scales.y, y + height / 2)
    : toNumber(valueAtPixel(scales.y, y + height / 2));
  if (right === null || left === null || base === null)
    return null;

  return {
    element,
    x: base,
    y: signedMagnitude(right, left),
    yMin: Math.min(left, right),
    yMax: Math.max(left, right),
    // A horizontal histogram bins along y, so that is where its intervals are.
    ...(categorical ? {} : binEdgesAlong(scales.y, y, height)),
    ...seriesField,
  };
}

/**
 * Reads one dot as a datum on a categorical axis.
 *
 * @param element     - The dot's element.
 * @param scales      - The plot's scales.
 * @param orientation - Which axis carries the magnitude.
 * @param centre      - The dot's centre in pixels.
 * @param centre.x    - Its horizontal position.
 * @param centre.y    - Its vertical position.
 * @returns The datum, or `null` when either coordinate cannot be read.
 */
function readPointDatum(
  element: Element,
  scales: PlotScales,
  orientation: Orientation,
  centre: { x: number; y: number },
): MarkDatum | null {
  const isVertical = orientation === Orientation.VERTICAL;
  const base = valueAtPixel(isVertical ? scales.x : scales.y, isVertical ? centre.x : centre.y);
  const magnitude = toNumber(
    valueAtPixel(isVertical ? scales.y : scales.x, isVertical ? centre.y : centre.x),
  );
  if (base === null || magnitude === null)
    return null;

  const series = valueAtColor(scales.color, strokeOrFill(element));
  return {
    element,
    x: base,
    y: magnitude,
    ...(series === null ? {} : { series: String(series) }),
  };
}

/**
 * The value a bar of the given extent encodes.
 *
 * A bar is drawn between a baseline and its value, so the value is the end
 * that is not the baseline — and for a stacked segment, the distance between
 * the two ends, signed by which side of zero it sits on.
 *
 * @param upper - The greater of the two ends, in data units.
 * @param lower - The lesser.
 * @returns The signed value.
 */
function signedMagnitude(upper: number, lower: number): number {
  const magnitude = Math.abs(upper - lower);
  return upper <= 0 && lower < 0 ? -magnitude : magnitude;
}

/**
 * Decides which axis of a bar-shaped mark carries its magnitude.
 *
 * @param scales - The plot's scales.
 * @returns The orientation, or `null` when neither axis is categorical.
 */
function barOrientation(scales: PlotScales): Orientation | null {
  if (isDiscrete(scales.x) && isContinuous(scales.y))
    return Orientation.VERTICAL;
  if (isDiscrete(scales.y) && isContinuous(scales.x))
    return Orientation.HORIZONTAL;
  return null;
}

/**
 * The centre of a dot, however Plot drew it.
 *
 * The default circle symbol becomes a `<circle>` with `cx` / `cy`; every other
 * symbol becomes a `<path>` translated into place.
 *
 * @param element - The dot's element.
 * @returns The centre in pixels, or `null`.
 */
function dotCentre(element: Element): { x: number; y: number } | null {
  const cx = attributeNumber(element, 'cx');
  const cy = attributeNumber(element, 'cy');
  if (cx !== null && cy !== null)
    return { x: cx, y: cy };

  const transform = element.getAttribute('transform');
  const match = transform && /translate\(\s*(-?[\d.]+)(?:\s|\s*,)\s*(-?[\d.]+)\s*\)/.exec(transform);
  if (!match)
    return null;
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * Parses the vertices of a line or area path.
 *
 * Plot draws a line through a curve, and only an interpolating curve passes
 * through its data points — `curveBasis` and friends draw a smoothed path
 * whose command endpoints are not the data. Plot binds the datum indices to
 * the path element, which gives the count the parse has to match: when it does
 * not, the curve is not interpolating and the mark is skipped rather than
 * announced wrongly.
 *
 * An area path is a closed loop — the series, then the baseline back — so only
 * its first half is data.
 *
 * @param element - The `<path>`.
 * @param isArea  - Whether the path closes back along a baseline.
 * @returns The vertices, or `null` when they are not the data points.
 */
function parsePathVertices(
  element: Element,
  isArea: boolean,
): ParsedPath | null {
  const d = element.getAttribute('d');
  if (!d)
    return null;

  const vertices: { x: number; y: number }[] = [];
  let decimals = 0;
  // Each drawing command ends at a coordinate pair; for M and L that pair is
  // the whole command, and for C it is the last of three.
  const commands = d.match(/[MLC][^MLCZ]*/gi) ?? [];
  for (const command of commands) {
    const written = command.slice(1).match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) ?? [];
    const numbers = written.map(Number.parseFloat);
    if (numbers.length < 2)
      continue;
    for (const text of written)
      decimals = Math.max(decimals, (text.split('.')[1] ?? '').length);
    const x = numbers[numbers.length - 2];
    const y = numbers[numbers.length - 1];
    if (Number.isFinite(x) && Number.isFinite(y))
      vertices.push({ x, y });
  }
  if (vertices.length === 0)
    return null;

  // Half the smallest step the coordinates were written at: the most the
  // serializer can have moved a point when it rounded it.
  const pixelError = 0.5 * 10 ** -decimals;
  const data = (element as Element & { __data__?: unknown }).__data__;
  const expected = Array.isArray(data) ? data.length : null;

  if (isArea) {
    // The loop is the series followed by the baseline back, so an even vertex
    // count halves cleanly. A repeated final vertex (Plot emits one when the
    // baseline starts where the series ended) makes it odd; drop it first.
    const usable = vertices.length % 2 === 0 ? vertices : vertices.slice(0, -1);
    const half = usable.slice(0, usable.length / 2);
    return expected !== null && half.length !== expected ? null : { vertices: half, pixelError };
  }

  return expected !== null && vertices.length !== expected
    ? null
    : { vertices, pixelError };
}

/** A parsed line or area path: where it goes, and how precisely it says so. */
interface ParsedPath {
  /** The path's vertices, in drawing order. */
  vertices: { x: number; y: number }[];
  /** Half the pixel quantum the coordinates were rounded to. */
  pixelError: number;
}

/**
 * Inverts a path coordinate, rounded to the precision the path can carry.
 *
 * @param scale      - The scale that positioned the path.
 * @param pixel      - The coordinate read out of the `d` attribute.
 * @param pixelError - Half the quantum the coordinate was written at.
 * @returns The value, or `null` when the scale cannot invert it.
 */
function pathValue(
  scale: PlotScale | undefined,
  pixel: number,
  pixelError: number,
): string | number | null {
  const value = valueAtPixel(scale, pixel);
  if (typeof value !== 'number' || isTemporal(scale))
    return value;
  return cleanToGeometry(value, scale, pixelError);
}

/** The colour a mark was drawn in, whichever channel carries it. */
function strokeOrFill(element: Element): string | null {
  return element.getAttribute('fill')
    ?? element.getAttribute('stroke')
    ?? element.parentElement?.getAttribute('fill')
    ?? element.parentElement?.getAttribute('stroke')
    ?? null;
}

/** Reads a numeric attribute, or `null` when it is absent or not a number. */
function attributeNumber(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null)
    return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The distinct values of a list, in the order they first appear. */
function uniqueInOrder<T>(values: T[]): T[] {
  const seen: T[] = [];
  for (const value of values) {
    if (!seen.includes(value))
      seen.push(value);
  }
  return seen;
}

/**
 * Builds a layer's axis configuration from the resolved labels.
 *
 * A temporal axis also carries `format: { type: 'date' }`. Its values travel as
 * epoch milliseconds — a trace's point types are numeric because the value has
 * to drive sonification and the min/max range — and the format is what turns
 * them back into dates when they are announced.
 *
 * @param context - The conversion context.
 * @returns The axes object, or `undefined` when nothing is known about them.
 */
function axisConfig(context: ConversionContext): MaidrLayer['axes'] {
  const { x, y, z } = context.axes;
  const dateFormat = { type: 'date' } as const;
  const xAxis = x || context.temporal.x
    ? { ...(x ? { label: x } : {}), ...(context.temporal.x ? { format: dateFormat } : {}) }
    : undefined;
  const yAxis = y || context.temporal.y
    ? { ...(y ? { label: y } : {}), ...(context.temporal.y ? { format: dateFormat } : {}) }
    : undefined;
  if (!xAxis && !yAxis && !z)
    return undefined;
  return {
    ...(xAxis ? { x: xAxis } : {}),
    ...(yAxis ? { y: yAxis } : {}),
    ...(z ? { z: { label: z } } : {}),
  };
}
