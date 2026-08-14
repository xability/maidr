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
 * removes, so a bar drawn for `3.14159` is announced as `3.14159`. Two things
 * are not recovered exactly and are therefore not claimed:
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
import { findMarkGroups, readAxisLabel, readTitles, resolveSvg, splitFacets } from './introspect';
import {
  bandIntervals,
  cleanNumber,
  deriveScale,
  isContinuous,
  isDiscrete,
  readScales,
  toNumber,
  valueAtColor,
  valueAtPixel,
} from './scales';
import { stampLayer, stampSeries } from './selectors';

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

  for (const { label, group } of findMarkGroups(svg)) {
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

  const bins = facet.elements
    .map(element => readRectDatum(element, scales, Orientation.VERTICAL, false))
    .filter((datum): datum is MarkDatum => datum !== null);
  if (bins.length === 0)
    return null;

  const data = toHistogramPoints(bins, scales.x);
  const token = `L${context.layerCount++}`;

  return {
    legend: [],
    layer: {
      id: token,
      type: TraceType.HISTOGRAM,
      selectors: stampLayer(facet.elements.slice(0, data.length), context.containerId, token),
      axes: axisConfig(context),
      data,
    },
  };
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
 * @param bins  - The bins, in draw order.
 * @param scale - The x scale, whose domain bounds the bins.
 * @returns One histogram point per bin, ordered along the axis.
 */
function toHistogramPoints(bins: MarkDatum[], scale: PlotScale | undefined): HistogramPoint[] {
  const sorted = [...bins].sort((a, b) => (a.xMin ?? 0) - (b.xMin ?? 0));
  const edges = uniformBinEdges(sorted, scale);

  return sorted.map((bin, index) => {
    const xMin = edges ? edges[index] : (bin.xMin ?? 0);
    const xMax = edges ? edges[index + 1] : (bin.xMax ?? 0);

    return {
      x: (xMin + xMax) / 2,
      y: bin.y,
      xMin,
      xMax,
      yMin: bin.yMin ?? 0,
      yMax: bin.yMax ?? bin.y,
    };
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
  if (!scale || !Array.isArray(scale.domain) || scale.domain.length < 2)
    return null;
  const start = toNumber(scale.domain[0]);
  const end = toNumber(scale.domain[scale.domain.length - 1]);
  if (start === null || end === null || end <= start)
    return null;

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
    const vertices = parsePathVertices(element, type === TraceType.AREA);
    if (vertices === null)
      continue;

    const points: LinePoint[] = [];
    for (const vertex of vertices) {
      const x = valueAtPixel(scales.x, vertex.x);
      const y = toNumber(valueAtPixel(scales.y, vertex.y));
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
  const categories = uniqueInOrder(data.map(datum => datum.x));
  const seriesNames = uniqueInOrder(
    data.map(datum => datum.series).filter((name): name is string => name !== undefined),
  );
  const stacked = seriesNames.length > 1 && data.length > categories.length;

  if (!stacked) {
    const points: BarPoint[] = data.map(datum => ({ x: datum.x, y: datum.y }));
    return {
      legend: [],
      layer: {
        id: token,
        type: plainType,
        orientation,
        selectors: stampLayer(data.map(datum => datum.element), context.containerId, token),
        axes: axisConfig(context),
        data: points,
      },
    };
  }

  const grid: SegmentedPoint[][] = seriesNames.map(name =>
    categories.map((category) => {
      const match = data.find(datum => datum.series === name && datum.x === category);
      return { x: category, y: match?.y ?? 0, z: name };
    }));

  const order = domOrder(data, seriesNames);

  return {
    legend: seriesNames,
    layer: {
      id: token,
      type: TraceType.STACKED,
      orientation,
      selectors: stampLayer(data.map(datum => datum.element), context.containerId, token),
      domMapping: {
        order,
        // Within a category Plot draws the stack from the baseline outwards, so
        // the first segment is the first series. MAIDR's default is the other
        // way round — most producers draw a stack top-down — and the series
        // order here is itself read from the order the segments appear, so the
        // two agree by construction and saying so keeps them aligned.
        ...(order === 'column' ? { groupDirection: 'forward' as const } : {}),
      },
      axes: axisConfig(context),
      data: grid,
    },
  };
}

/**
 * Works out whether a stack was drawn series by series or category by category.
 *
 * MAIDR pairs a segmented layer's single selector with its data by walking the
 * matched elements in document order, so it has to be told which way that
 * order runs. Plot draws in the order the data arrived, and tidy data comes
 * both ways round, so the answer is read off the elements rather than assumed.
 *
 * @param data        - The mark's data, in draw order.
 * @param seriesNames - The series, in first-drawn order.
 * @returns `'row'` for series-major order, `'column'` for category-major.
 */
function domOrder(data: MarkDatum[], seriesNames: string[]): 'row' | 'column' {
  let seriesChanges = 0;
  for (let index = 1; index < data.length; index++) {
    if (data[index].series !== data[index - 1].series)
      seriesChanges++;
  }
  // Series-major order changes series once per series boundary; category-major
  // changes it on nearly every element.
  return seriesChanges <= seriesNames.length ? 'row' : 'column';
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
      ...(categorical
        ? {}
        : {
            xMin: toNumber(valueAtPixel(scales.x, x)) ?? 0,
            xMax: toNumber(valueAtPixel(scales.x, x + width)) ?? 0,
          }),
      ...seriesField,
    };
  }

  const right = toNumber(valueAtPixel(scales.x, x + width));
  const left = toNumber(valueAtPixel(scales.x, x));
  const base = valueAtPixel(scales.y, y + height / 2);
  if (right === null || left === null || base === null)
    return null;

  return {
    element,
    x: base,
    y: signedMagnitude(right, left),
    yMin: Math.min(left, right),
    yMax: Math.max(left, right),
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
): { x: number; y: number }[] | null {
  const d = element.getAttribute('d');
  if (!d)
    return null;

  const vertices: { x: number; y: number }[] = [];
  // Each drawing command ends at a coordinate pair; for M and L that pair is
  // the whole command, and for C it is the last of three.
  const commands = d.match(/[MLC][^MLCZ]*/gi) ?? [];
  for (const command of commands) {
    const numbers = (command.slice(1).match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) ?? [])
      .map(Number.parseFloat);
    if (numbers.length < 2)
      continue;
    const x = numbers[numbers.length - 2];
    const y = numbers[numbers.length - 1];
    if (Number.isFinite(x) && Number.isFinite(y))
      vertices.push({ x, y });
  }
  if (vertices.length === 0)
    return null;

  const data = (element as Element & { __data__?: unknown }).__data__;
  const expected = Array.isArray(data) ? data.length : null;

  if (isArea) {
    // The loop is the series followed by the baseline back, so an even vertex
    // count halves cleanly. A repeated final vertex (Plot emits one when the
    // baseline starts where the series ended) makes it odd; drop it first.
    const usable = vertices.length % 2 === 0 ? vertices : vertices.slice(0, -1);
    const half = usable.slice(0, usable.length / 2);
    return expected !== null && half.length !== expected ? null : half;
  }

  return expected !== null && vertices.length !== expected ? null : vertices;
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

/** Builds a layer's axis configuration from the resolved labels. */
function axisConfig(context: ConversionContext): MaidrLayer['axes'] {
  const { x, y, z } = context.axes;
  if (!x && !y && !z)
    return undefined;
  return {
    ...(x ? { x: { label: x } } : {}),
    ...(y ? { y: { label: y } } : {}),
    ...(z ? { z: { label: z } } : {}),
  };
}
