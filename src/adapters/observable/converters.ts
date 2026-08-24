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
 *   colour and no inversion can tell them apart. `contour` is the same
 *   problem — the level is carried only by the band's fill, sampled from a
 *   continuous scale rather than a thresholded one — and `density` is worse,
 *   drawing every isoline in one stroke colour so the level is not encoded at
 *   all. All three are skipped rather than announced approximately (#1084).
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
  BoxPoint,
  BoxSelector,
  GanttData,
  GanttPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  ScatterPoint,
  SegmentedPoint,
  SmoothPoint,
  StepDirection,
  TreemapPoint,
} from '@type/grammar';
import type { BoxComposite, MarkFacet, TreeComposite } from './introspect';
import type { MarkDatum, ObservablePlotOptions, PlotScale, PlotScales } from './types';
import { ensureContainerId, nextId } from '@adapters/shared/selectorUtil';
import { Orientation, TraceType } from '@type/grammar';
import { toCategoryShares, toSegmentedShares } from '../shared/normalize';
import {
  boxComposites,
  findMarkGroups,
  readAxisLabel,
  readTitles,
  resolveSvg,
  splitFacets,
  TREE_PATH_SEPARATOR,
  treeComposite,
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
  /**
   * What each drawn point *is*, keyed by the element that draws it.
   *
   * Filled by {@link labelOverlays} from a `text` mark that turned out to be
   * another mark's labels rather than a series of its own. A mark that names
   * its own points -- a tree's dots carry the node path in a `<title>` --
   * needs no entry here; {@link markName} finds those on the element.
   */
  pointNames: Map<Element, string>;
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
    pointNames: new Map<Element, string>(),
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
  // A box plot is four marks that only mean anything together. They are read as
  // one layer here and skipped in the loop below, where the interquartile box
  // would otherwise be announced as an ordinary bar whose value is a height
  // nobody plotted.
  const composites = boxComposites(groups);
  const claimed = new Set(composites.flatMap(({ bar, rule, tick, dot }) =>
    dot === undefined ? [bar, rule, tick] : [bar, rule, tick, dot]));

  // A `text` mark sitting on another mark labels it rather than being a
  // series of its own. Its names move onto the mark it labels and its group
  // is skipped below, where it would otherwise be read as a second scatter
  // at the same coordinates (#1106).
  const overlays = labelOverlays(groups);
  for (const index of overlays.claimed)
    claimed.add(index);
  for (const [element, name] of overlays.names)
    context.pointNames.set(element, name);

  // A tree is three marks that only mean anything together, and it is found
  // after the labels have moved onto the dots, because the paths it is read
  // from arrive that way. Its groups are skipped below, where the dots would
  // be announced as a scatter of the coordinates the layout algorithm chose
  // and the links would produce no layer at all (#1168).
  const tree = treeComposite(groups);
  if (tree) {
    claimed.add(tree.link).add(tree.dot);
    for (const index of tree.texts)
      claimed.add(index);
  }

  const place = (facet: MarkFacet, converted: ConvertedMark): void => {
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
  };

  for (const composite of composites) {
    for (const { facet, converted } of convertBoxComposite(composite, groups, context))
      place(facet, converted);
  }

  if (tree) {
    for (const { facet, converted } of convertTreeComposite(tree, groups, context))
      place(facet, converted);
  }

  for (const [index, { label, group }] of groups.entries()) {
    if (claimed.has(index))
      continue;
    for (const facet of splitFacets(group)) {
      const converted = convertMark(label, facet, context);
      if (!converted)
        continue;

      place(facet, converted);
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
      // A hexbin arrives labelled `dot` like any other, and its hexagons are
      // the same paths a `symbol: 'hexagon'` scatter draws — so the author
      // says which it is, through the same `markTypes` option a binned rect
      // uses to say it is a histogram.
      return context.markTypes.dot === TraceType.HEXBIN
        ? convertHexbin(facet, context)
        : convertDot(facet, context);
    // A tick is a dot drawn as a stroke rather than a symbol -- one mark per
    // observation either way, and the same reading once its centre is found
    // (#1069).
    case 'tick':
      return convertDot(facet, context, tickCentre);
    case 'line':
      return convertLine(facet, context, TraceType.LINE);
    case 'area':
      return convertLine(facet, context, TraceType.AREA);
    // The one mark Plot names after what it means rather than after what it
    // draws, which is what makes it readable without a heuristic (#1081).
    case 'linear-regression':
      return convertRegression(facet, context);
    // A waffle is a bar chart drawn as a count of cells, and the count is in
    // the markup exactly rather than approximated from a colour (#1093).
    case 'waffle':
      return convertWaffle(facet, context);
    // A link is a segment between two points, which is a span along one axis
    // when both of its ends share the other — and an arrow is the same segment
    // with a head on it (#1094).
    case 'link':
    case 'arrow':
      return convertLink(facet, context);
    // `Plot.spike` and `Plot.vector` share this label. A magnitude standing at
    // a position is readable; one that also points somewhere is not (#1098).
    case 'vector':
      return convertSpike(facet, context);
    // The same span a `link` draws, drawn as a `<line>` instead — which is how
    // Plot writes a high-low chart, a gantt and a range plot (#1100).
    case 'rule':
      return convertRule(facet, context);
    // A `text` mark that labels another one never arrives -- `labelOverlays`
    // claims it and gives its names away. What is left is a `Plot.text` that
    // stands alone, which is how a labelled scatter is drawn: a position per
    // point and a name at it, both exact in the markup (#1106).
    case 'text':
      return convertText(facet, context);
    default:
      return null;
  }
}

/**
 * How far apart two parts of one category may sit and still be paired.
 *
 * Plot offsets a stroked mark by half a pixel so it lands on the pixel grid,
 * and it does that to the medians and whiskers but not to the boxes — so the
 * parts of one category sit at 192 and 192.5 rather than at one shared centre.
 * Requiring them to agree exactly would decline every box plot Plot draws.
 */
const PART_TOLERANCE = 1;

/**
 * One facet's box plot, and the facet it was drawn in.
 */
interface ConvertedBox {
  facet: MarkFacet;
  converted: ConvertedMark;
}

/**
 * Reads a box plot's four marks as one `box` layer, facet by facet.
 *
 * {@link boxComposites} has already established that these groups are a box
 * plot — the medians lie inside the boxes, the whiskers run along them, and
 * Plot drew the medians the way `boxY` draws them. What is left is pairing them
 * up category by category, which the detection does not do: it asks whether
 * each box has some median crossing it, and a reading needs to know which one.
 *
 * A facet is matched across the four groups by its offset rather than by its
 * index. Plot emits a facet's `dot` group only where that facet has outliers,
 * so the nth dot facet is not the nth box facet whenever an earlier facet had
 * none.
 *
 * @param composite - The groups this box plot is drawn with.
 * @param groups    - The plot's mark groups, in draw order.
 * @param context   - The conversion context.
 * @returns One entry per facet that could be read; empty when none could.
 */
/** What a tree's one axis is called, there being no second one. */
const TREE_NODE_AXIS = 'Node';

/**
 * Reads a `Plot.tree` or `Plot.cluster` as the hierarchy it draws.
 *
 * {@link treeComposite} has already established that these groups are a tree:
 * every node carries a `<title>` holding its full path from the root, and
 * every parent in those paths is itself a node. What is left is to turn each
 * path into the shape MAIDR addresses a hierarchy by — the node's name, and
 * its ancestors root first with itself excluded.
 *
 * The nodes come from the `dot` mark rather than from the text marks, for two
 * reasons. Plot splits the labels across two marks — leaf and internal — so
 * their document order is not the tree's, while the dots are one element per
 * node in one group; and the dots are what a reader's highlight can point at.
 * The paths reach them through `pointNames`, which {@link labelOverlays} has
 * already filled in by pairing each label to the mark it sits on (#1106) —
 * the same pairing that made this chart read as a labelled scatter before.
 *
 * No node carries a `y`. A tree layout sizes nothing by value and Plot draws
 * every dot alike, so there is no magnitude to announce and the layer names no
 * value axis — the reading `TreemapTrace` takes for a tree that declares none
 * (#1153), and the one an `organization` series, a `treegraph` and an
 * `OrgChart` all get.
 *
 * @param composite - The tree's groups, as indices into the plot's groups.
 * @param groups    - The plot's mark groups, in draw order.
 * @param context   - The conversion context.
 * @returns One entry per facet the tree was drawn in.
 */
function convertTreeComposite(
  composite: TreeComposite,
  groups: readonly { label: string; group: Element }[],
  context: ConversionContext,
): { facet: MarkFacet; converted: ConvertedMark }[] {
  const converted: { facet: MarkFacet; converted: ConvertedMark }[] = [];

  for (const facet of splitFacets(groups[composite.dot].group)) {
    const data: TreemapPoint[] = [];
    const elements: Element[] = [];

    for (const element of facet.elements) {
      // The node's own title, ahead of any label paired onto it. Plot titles
      // every tree dot with its full path, so the exact answer is on the mark
      // being read; the pairing is a fallback for a tree drawn without one.
      // It matters where two trees overlap -- sharing a pair of scales puts
      // their roots on the same point, and the pairing then answers with the
      // other tree's name.
      const path = markName(element) ?? context.pointNames.get(element);
      if (path === null || path === undefined || !path.startsWith(TREE_PATH_SEPARATOR))
        continue;
      const segments = path.split(TREE_PATH_SEPARATOR).slice(1);
      const name = segments[segments.length - 1];
      // Plot invents a root when the data has more than one, so that its
      // layout has somewhere to start: measured on `Plot.tree(['x/1','y/2'])`
      // it draws a sixth dot titled `/` and gives it no label, because it has
      // no name to draw. It is drawing rather than data, and announcing it
      // would put an unnamed node above two the reader can name, so it is
      // dropped and the forest keeps the two roots it has.
      if (name === undefined || name === '')
        continue;
      data.push({ x: name, path: segments.slice(0, -1) });
      elements.push(element);
    }

    if (data.length === 0)
      continue;

    const token = `L${context.layerCount++}`;
    converted.push({
      facet,
      converted: {
        legend: [],
        layer: {
          id: token,
          type: TraceType.TREE,
          // One per node rather than one for the layer: a hierarchy is
          // navigated node by node, and each has its own dot to outline.
          selectors: elements.map((element, index) =>
            stampLayer([element], context.containerId, `${token}-${index}`)),
          // Only the node axis. The tree's own x and y are where the layout
          // put each node, which is what reading this as a scatter announced.
          axes: { x: { label: TREE_NODE_AXIS } },
          data,
        },
      },
    });
  }

  return converted;
}

function convertBoxComposite(
  composite: BoxComposite,
  groups: readonly { label: string; group: Element }[],
  context: ConversionContext,
): ConvertedBox[] {
  const shifted = (index: number): { facets: MarkFacet[]; shift: { x: number; y: number } } => ({
    facets: splitFacets(groups[index].group),
    // Plot centres a rule and a dot on the band by translating their whole
    // group, so the shift belongs to every element inside it.
    shift: translateOf(groups[index].group) ?? { x: 0, y: 0 },
  });

  const boxes = shifted(composite.bar);
  const whiskers = shifted(composite.rule);
  const medians = shifted(composite.tick);
  const outliers = composite.dot === undefined ? null : shifted(composite.dot);

  const converted: ConvertedBox[] = [];
  for (const facet of boxes.facets) {
    const whisker = facetAt(whiskers.facets, facet);
    const median = facetAt(medians.facets, facet);
    if (!whisker || !median)
      continue;

    const layer = readBoxLayer(context, {
      boxes: { elements: facet.elements, shift: boxes.shift },
      whiskers: { elements: whisker.elements, shift: whiskers.shift },
      medians: { elements: median.elements, shift: medians.shift },
      outliers: outliers === null
        ? { elements: [], shift: { x: 0, y: 0 } }
        : { elements: facetAt(outliers.facets, facet)?.elements ?? [], shift: outliers.shift },
    });
    if (layer)
      converted.push({ facet, converted: layer });
  }
  return converted;
}

/**
 * Finds the facet of another mark drawn in the same place as this one.
 *
 * Compared exactly, unlike the parts within a facet below. A facet's offset is
 * not a measurement of anything: Plot writes the same translation into every
 * mark's group for a given facet, so two that belong together carry the same
 * string and parse to the same number. A tolerance here would only make two
 * genuinely adjacent facets confusable.
 *
 * @param facets - The other mark's facets.
 * @param anchor - The facet to match.
 * @returns The matching facet, or `null` when the mark skipped it.
 */
function facetAt(facets: readonly MarkFacet[], anchor: MarkFacet): MarkFacet | null {
  return facets.find(facet =>
    facet.offsetX === anchor.offsetX && facet.offsetY === anchor.offsetY) ?? null;
}

/** A mark's elements together with the translation its group carries. */
interface BoxPart {
  elements: readonly Element[];
  shift: { x: number; y: number };
}

/** The four marks of one facet's box plot. */
interface BoxParts {
  boxes: BoxPart;
  whiskers: BoxPart;
  medians: BoxPart;
  outliers: BoxPart;
}

/**
 * Builds the `box` layer for one facet.
 *
 * The parts are sorted along the category axis and paired by position, which
 * makes the pairing a bijection by construction; each pair then has to agree on
 * where its category is, or these are marks that overlap without belonging to
 * each other and nothing is read.
 *
 * Every value is read off a pixel through the scale, including the outliers'.
 * Plot binds a datum *index* to an outlier rather than the observation, and the
 * source data is not the adapter's to look in, so the pixel is the only place
 * the value exists.
 *
 * @param context - The conversion context.
 * @param parts   - The facet's four marks.
 * @returns The layer, or `null` when the parts do not pair up.
 */
function readBoxLayer(context: ConversionContext, parts: BoxParts): ConvertedMark | null {
  const orientation = barOrientation(context.scales);
  if (!orientation)
    return null;

  const vertical = orientation === Orientation.VERTICAL;
  const categoryScale = vertical ? context.scales.x : context.scales.y;
  const valueScale = vertical ? context.scales.y : context.scales.x;

  const boxes = readIntervals(parts.boxes, vertical, valueScale);
  const whiskers = readSegments(parts.whiskers, vertical, valueScale);
  const medians = readSegments(parts.medians, vertical, valueScale);
  if (!boxes || !whiskers || !medians)
    return null;
  if (boxes.length === 0 || whiskers.length !== boxes.length || medians.length !== boxes.length)
    return null;

  const spots = readSpots(parts.outliers, vertical, valueScale);
  if (!spots)
    return null;

  const token = `L${context.layerCount++}`;
  const data: BoxPoint[] = [];
  const selectors: BoxSelector[] = [];

  for (const [index, box] of boxes.entries()) {
    const whisker = whiskers[index];
    const median = medians[index];
    if (Math.abs(whisker.centre - box.centre) > PART_TOLERANCE
      || Math.abs(median.centre - box.centre) > PART_TOLERANCE) {
      return null;
    }

    const category = valueAtPixel(categoryScale, box.centre);
    if (category === null)
      return null;

    const mine = spots.filter(spot => nearest(boxes, spot.centre) === index);
    // One comparison rather than two, because a `dot` here is an outlier by
    // construction: Plot draws this mark only for the observations that fall
    // outside the whiskers. Anything not below the lower end is therefore above
    // the upper one, and testing that separately would leave a third case with
    // nowhere to go for a point that cannot occur.
    const lower = mine.filter(spot => spot.value < whisker.low);
    const upper = mine.filter(spot => spot.value >= whisker.low);

    data.push({
      z: String(category),
      lowerOutliers: lower.map(spot => spot.value).sort((a, b) => a - b),
      min: whisker.low,
      q1: box.low,
      q2: median.value,
      q3: box.high,
      max: whisker.high,
      upperOutliers: upper.map(spot => spot.value).sort((a, b) => a - b),
    });

    // One line spans both whiskers, so the minimum and the maximum highlight
    // the same element. It is the element that holds them both, which is the
    // truthful answer available; `buildViolinBoxSelectors` in the plotly
    // adapter resolves the same mismatch the same way, over a path that holds
    // the whole box.
    const whiskerSelector = stampLayer(
      [whisker.element],
      context.containerId,
      `${token}-${index}-w`,
    );
    selectors.push({
      lowerOutliers: stampEach(lower, context, `${token}-${index}-lo`),
      min: whiskerSelector,
      iq: stampLayer([box.element], context.containerId, `${token}-${index}-iq`),
      q2: stampLayer([median.element], context.containerId, `${token}-${index}-q2`),
      max: whiskerSelector,
      upperOutliers: stampEach(upper, context, `${token}-${index}-hi`),
    });
  }

  return {
    legend: [],
    layer: {
      id: token,
      type: TraceType.BOX,
      orientation,
      selectors,
      axes: axisConfig(context),
      data,
    },
  };
}

/**
 * Stamps each outlier separately, in the order its values were announced.
 *
 * @param spots   - The outliers of one end of one box.
 * @param context - The conversion context.
 * @param token   - Prefix identifying this end of this box.
 * @returns One selector per outlier.
 */
function stampEach(
  spots: readonly BoxSpot[],
  context: ConversionContext,
  token: string,
): string[] {
  return [...spots]
    .sort((a, b) => a.value - b.value)
    .map((spot, index) => stampLayer([spot.element], context.containerId, `${token}${index}`));
}

/** An interquartile box: where it sits, and the two values it spans. */
interface BoxInterval {
  element: Element;
  centre: number;
  low: number;
  high: number;
}

/** A whisker or a median: where it sits, and the value or values it marks. */
interface BoxSegment {
  element: Element;
  centre: number;
  low: number;
  high: number;
  value: number;
}

/** An outlier: where it sits, and what it is worth. */
interface BoxSpot {
  element: Element;
  centre: number;
  value: number;
}

/**
 * Reads the interquartile boxes, in category order.
 *
 * `q1` and `q3` come back as the smaller and the larger of the rect's two
 * edges rather than as its top and its bottom, so a reversed value axis — which
 * draws the larger value at the smaller pixel — still reports the quartiles the
 * right way round.
 *
 * @param part     - The `bar` mark's rects.
 * @param vertical - Whether the distribution runs up the chart.
 * @param scale    - The value axis.
 * @returns The boxes, or `null` when one could not be read.
 */
function readIntervals(
  part: BoxPart,
  vertical: boolean,
  scale: PlotScale | undefined,
): BoxInterval[] | null {
  const read: BoxInterval[] = [];
  for (const element of part.elements) {
    const x = attributeNumber(element, 'x');
    const y = attributeNumber(element, 'y');
    const width = attributeNumber(element, 'width');
    const height = attributeNumber(element, 'height');
    if (x === null || y === null || width === null || height === null)
      return null;

    const near = toNumber(valueAtPixel(scale, vertical ? y : x));
    const far = toNumber(valueAtPixel(scale, vertical ? y + height : x + width));
    if (near === null || far === null)
      return null;

    read.push({
      element,
      centre: vertical ? x + width / 2 + part.shift.x : y + height / 2 + part.shift.y,
      low: Math.min(near, far),
      high: Math.max(near, far),
    });
  }
  return read.sort((a, b) => a.centre - b.centre);
}

/**
 * Reads the whiskers or the medians, in category order.
 *
 * A whisker runs along the value axis and a median across it, so one carries
 * two values and the other one; both are read the same way and the caller takes
 * the field it needs.
 *
 * @param part     - The `rule` or `tick` mark's lines.
 * @param vertical - Whether the distribution runs up the chart.
 * @param scale    - The value axis.
 * @returns The segments, or `null` when one could not be read.
 */
function readSegments(
  part: BoxPart,
  vertical: boolean,
  scale: PlotScale | undefined,
): BoxSegment[] | null {
  const read: BoxSegment[] = [];
  for (const element of part.elements) {
    const x1 = attributeNumber(element, 'x1');
    const x2 = attributeNumber(element, 'x2');
    const y1 = attributeNumber(element, 'y1');
    const y2 = attributeNumber(element, 'y2');
    if (x1 === null || x2 === null || y1 === null || y2 === null)
      return null;

    const along = vertical ? [y1, y2] : [x1, x2];
    const across = vertical ? [x1, x2] : [y1, y2];
    const first = toNumber(valueAtPixel(scale, along[0]));
    const second = toNumber(valueAtPixel(scale, along[1]));
    if (first === null || second === null)
      return null;

    read.push({
      element,
      centre: (across[0] + across[1]) / 2 + (vertical ? part.shift.x : part.shift.y),
      low: Math.min(first, second),
      high: Math.max(first, second),
      value: first,
    });
  }
  return read.sort((a, b) => a.centre - b.centre);
}

/**
 * Reads the outliers.
 *
 * @param part     - The `dot` mark's circles.
 * @param vertical - Whether the distribution runs up the chart.
 * @param scale    - The value axis.
 * @returns The outliers, or `null` when one could not be read.
 */
function readSpots(
  part: BoxPart,
  vertical: boolean,
  scale: PlotScale | undefined,
): BoxSpot[] | null {
  const read: BoxSpot[] = [];
  for (const element of part.elements) {
    const cx = attributeNumber(element, 'cx');
    const cy = attributeNumber(element, 'cy');
    if (cx === null || cy === null)
      return null;

    const value = toNumber(valueAtPixel(scale, vertical ? cy : cx));
    if (value === null)
      return null;

    read.push({
      element,
      centre: vertical ? cx + part.shift.x : cy + part.shift.y,
      value,
    });
  }
  return read;
}

/**
 * Which box a pixel on the category axis belongs to.
 *
 * @param boxes  - The boxes, in category order.
 * @param centre - The pixel.
 * @returns The index of the nearest box.
 */
function nearest(boxes: readonly BoxInterval[], centre: number): number {
  let best = 0;
  for (const [index, box] of boxes.entries()) {
    if (Math.abs(box.centre - centre) < Math.abs(boxes[best].centre - centre))
      best = index;
  }
  return best;
}

/**
 * Reads a `linearRegressionY` / `linearRegressionX` mark as a smooth curve.
 *
 * Plot gives this mark a group of its own, `aria-label="linear-regression"`,
 * which no other mark produces — so unlike a box plot, whose parts arrive as
 * ordinary `rule`, `bar` and `tick` groups (#1074), nothing here has to be
 * guessed at or declared.
 *
 * The group holds two paths per series: the confidence band, drawn with
 * `stroke="none"`, and the fitted line, drawn with `fill="none"`. They are
 * told apart by that rather than by their order, so a future Plot that draws
 * them the other way round still reads.
 *
 * **The band is not read.** `SmoothPoint` carries `x`, `y`, `svg_x` and
 * `svg_y` and no bounds, and `SmoothTrace` announces none, so there is nowhere
 * for the interval to go on a smooth layer. Widening the grammar would serve
 * r-maidr's `geom_smooth(se = TRUE)` and py-maidr's plotly trendline as much
 * as this mark, and is a decision about the grammar rather than about Plot.
 *
 * The fitted line has exactly two vertices, its ends. That is not a loss: a
 * straight line is completely described by them, and what a reader gets is the
 * trend's start, its finish, and the slope between.
 *
 * @param facet   - The mark's paths.
 * @param context - The conversion context.
 * @returns The layer, or `null` when no fitted line can be read.
 */
function convertRegression(
  facet: MarkFacet,
  context: ConversionContext,
): ConvertedMark | null {
  const { scales } = context;
  const data: SmoothPoint[][] = [];
  const elements: Element[][] = [];
  const legend: string[] = [];

  for (const element of facet.elements) {
    // The band is the filled half; the fit is the stroked one. A path that is
    // neither is not one of the two this mark draws.
    if (element.tagName.toLowerCase() !== 'path' || element.getAttribute('fill') !== 'none')
      continue;

    // The geometry alone: a fit's bound datum indices are the observations it
    // was computed from, not its two vertices, so the count check
    // `parsePathVertices` applies would refuse every fit.
    const path = readPathGeometry(element);
    if (path === null)
      continue;

    const points: SmoothPoint[] = [];
    for (const vertex of path.vertices) {
      const x = toNumber(pathValue(scales.x, vertex.x, path.pixelError));
      const y = toNumber(pathValue(scales.y, vertex.y, path.pixelError));
      if (x === null || y === null)
        continue;
      // The pixels as drawn, which is what `svg_x`/`svg_y` are for: the trace
      // reports where on the page the fit runs, not only what it says.
      points.push({ x, y, svg_x: vertex.x, svg_y: vertex.y });
    }
    if (points.length === 0)
      continue;

    // The stroke, not `strokeOrFill`: that helper prefers `fill`, and a fitted
    // line's fill is `none` by construction — which is the very thing that
    // identified it. A split mark puts the series colour on the stroke.
    const name = valueAtColor(scales.color, element.getAttribute('stroke'));
    if (name !== null && !legend.includes(String(name)))
      legend.push(String(name));
    data.push(points);
    elements.push([element]);
  }

  if (data.length === 0)
    return null;

  const token = `L${context.layerCount++}`;
  return {
    legend,
    layer: {
      id: token,
      type: TraceType.SMOOTH,
      selectors: stampSeries(elements, context.containerId, token),
      axes: axisConfig(context),
      data,
    },
  };
}

/**
 * Reads a hexbin's bins as a lattice.
 *
 * `Plot.dot(data, Plot.hexbin({ r: 'count' }, { x, y }))` draws one `<path>`
 * per bin, each a regular hexagon placed by a `transform` and sized by the `r`
 * scale. Both halves invert exactly and neither goes through a colour:
 *
 * ```
 * transform="translate(30.5, 363.731)"   the bin's centre
 * d="M0,8.607L7.454,4.303L…Z"            radius 7.454, which the r scale
 *                                        maps back to a count of 5
 * ```
 *
 * **The author declares it**, because nothing in the markup can. The marks
 * arrive in a group labelled `dot`, and Plot's own `symbol: 'hexagon'` draws
 * the identical path shape at a different radius, so a scatter of hexagons and
 * a hexbin are indistinguishable. `markTypes` is the option that already
 * exists for exactly this, and a hexbin is a single mark, so one label maps to
 * one type without widening it.
 *
 * The shape is still checked rather than trusted: a declaration that points at
 * marks which are not hexagons is declined, so a mislabelled chart is read as
 * nothing rather than as a lattice of invented counts.
 *
 * `HexbinTrace` navigates rows of bins, and a hex lattice's rows share a
 * y **pixel** exactly, so they are grouped on that rather than on the inverted
 * value — the grouping is then exact instead of tolerant.
 *
 * @param facet   - The mark's hexagons.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the marks are not hexagons.
 */
function convertHexbin(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  const { scales } = context;
  const bins: { row: number; x: number; y: number; count: number; element: Element }[] = [];

  for (const element of facet.elements) {
    if (element.tagName.toLowerCase() !== 'path')
      continue;
    const centre = translateOf(element);
    const radius = hexagonRadius(element);
    if (centre === null || radius === null)
      return null;

    const x = toNumber(valueAtPixel(scales.x, centre.x));
    const y = toNumber(valueAtPixel(scales.y, centre.y));
    const count = binCount(valueAtPixel(scales.r, radius), scales.r, radius);
    if (x === null || y === null || count === null)
      return null;
    bins.push({ row: centre.y, x, y, count, element });
  }

  if (bins.length === 0)
    return null;

  // Bottom row first, since that is the direction the trace steps its row
  // index in, and left to right within each — the way the lattice reads.
  const byRow = new Map<number, typeof bins>();
  for (const bin of bins) {
    const row = byRow.get(bin.row) ?? [];
    row.push(bin);
    byRow.set(bin.row, row);
  }
  const ordered = [...byRow.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, row]) => [...row].sort((a, b) => a.x - b.x));

  const token = `L${context.layerCount++}`;
  return {
    legend: [],
    layer: {
      id: token,
      type: TraceType.HEXBIN,
      selectors: stampLayer(ordered.flat().map(bin => bin.element), context.containerId, token),
      axes: axisConfig(context),
      data: ordered.map(row => row.map(({ x, y, count }) => ({ x, y, count }))),
    },
  };
}

/**
 * The step Plot writes a path coordinate at — three decimals, measured across
 * every mark this adapter reads.
 */
const PATH_QUANTUM = 0.001;

/**
 * A bin's tally, cleaned to what the drawing actually supports.
 *
 * The radius reaches the `d` attribute rounded — Plot writes three decimals —
 * and a radius scale squares it on the way back, so the recovered tally is a
 * hair off: a bin of five comes back as 5.00059 from a drawn 7.454 where the
 * true radius was 7.45356.
 *
 * `HexbinPoint.count` is documented as "how many points fell in it", so a
 * whole number is what the field means, and rounding to one is reading its
 * contract rather than guessing. But only when the reading is unambiguous:
 * `r` need not be a count — a bin sized by a mean or a sum of fractions has a
 * genuinely fractional tally — so the rounding applies only when the recovered
 * value sits within the geometry's own error of an integer, and otherwise the
 * value is cleaned to the precision the pixels support and left alone.
 *
 * @param value  - The tally as inverted, or `null` when there is no r scale.
 * @param scale  - The radius scale.
 * @param radius - The drawn radius, for sizing the error.
 * @returns The tally, or `null` when none could be read.
 */
function binCount(
  value: string | number | null,
  scale: PlotScale | undefined,
  radius: number,
): number | null {
  const tally = toNumber(value);
  if (tally === null)
    return null;

  // Half the quantum Plot writes a coordinate at, carried through the scale.
  // The factor of two is the square-root scale's: `r ∝ √tally`, so a relative
  // error in the radius arrives doubled in the tally. `Plot.hexbin` always
  // sizes by that scale, and a linear one would make this estimate twice the
  // true error — conservative in the wrong direction, since it would round a
  // value that is not near an integer, so it is worth knowing which scale the
  // arithmetic belongs to.
  const error = Math.abs(2 * tally * (PATH_QUANTUM / 2) / radius);
  const whole = Math.round(tally);
  if (Math.abs(tally - whole) <= Math.max(error, 1e-9))
    return whole;
  return cleanToGeometry(tally, scale, PATH_QUANTUM / 2);
}

/**
 * The `translate(x, y)` a mark was placed by, when it carries one.
 *
 * @param element - The mark.
 * @returns Its centre in pixels, or `null` when it is not translated.
 */
function translateOf(element: Element): { x: number; y: number } | null {
  const written = element.getAttribute('transform') ?? '';
  const match = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(written);
  if (!match)
    return null;
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * The radius of a regular hexagon, or `null` when the path is not one.
 *
 * Plot draws a hexbin's cell with its vertices at `(0, ±2r/√3)` and
 * `(±r, ±r/√3)`, so the radius is the widest `|x|` — and every vertex has to
 * sit where that radius puts it, or this is some other six-sided shape and
 * reading a count off its size would be reading a number the chart does not
 * hold.
 *
 * @param element - The `<path>`.
 * @returns The radius, or `null` when the shape does not match.
 */
function hexagonRadius(element: Element): number | null {
  const drawn = readPathGeometry(element);
  if (drawn === null || drawn.vertices.length !== 6)
    return null;

  const radius = Math.max(...drawn.vertices.map(vertex => Math.abs(vertex.x)));
  if (!(radius > 0))
    return null;

  const tall = radius * 2 / Math.sqrt(3);
  const expected = [
    { x: 0, y: tall },
    { x: radius, y: tall / 2 },
    { x: radius, y: -tall / 2 },
    { x: 0, y: -tall },
    { x: -radius, y: -tall / 2 },
    { x: -radius, y: tall / 2 },
  ];
  // Against the quantum the coordinates were written at. Doubled to be
  // generous rather than because there are two sources of error — the expected
  // vertices are computed from the measured radius, so only the drawn path
  // carries the rounding. Erring loose here can only admit a shape that is
  // nearly a hexagon, never reject one that is.
  const tolerance = Math.max(drawn.pixelError * 2, 1e-6);
  const matches = expected.every(want => drawn.vertices.some(vertex =>
    Math.abs(vertex.x - want.x) <= tolerance && Math.abs(vertex.y - want.y) <= tolerance));
  return matches ? radius : null;
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

  if (isFloating(data, context.scales, orientation))
    return null;

  return buildBarLayer(data, context, orientation, TraceType.BAR);
}

/**
 * Whether a bar mark's rects float free of the baseline.
 *
 * A bar's value is the length of the bar, which is only the datum because one
 * of its ends is zero. `y1`/`y2` breaks that: a waterfall step drawn from 140
 * down to 90 has length 50, and 50 is not what happened — the step is a fall of
 * 50, and 90 is where it landed. MAIDR's bar grammar has one value per point
 * and nowhere to put the second, so such a mark is left unread rather than
 * announced as a rise of 50.
 *
 * A stacked segment is also off the baseline and must *not* be caught by this:
 * there the length genuinely is the value. What separates them is that a stack
 * is built from a colour channel, so its segments carry a series and rest on
 * one another, and every column still has one segment standing on the baseline.
 * A mark where no rect reaches it is floating.
 *
 * @param data        - The mark's rects, as read.
 * @param scales      - The plot's scales, which say where zero is.
 * @param orientation - Which axis carries the magnitude.
 * @returns True when the mark is a ranged bar rather than a bar chart.
 */
function isFloating(
  data: readonly MarkDatum[],
  scales: PlotScales,
  orientation: Orientation,
): boolean {
  // More rects than categories is what a stack is: its segments share a
  // category and pile up on one another, and the ones above the first are off
  // the baseline by design. Asking instead whether any rect has a *colour* —
  // which is what this did — exempts every mark with a `fill`, and a waterfall
  // coloured by rise and fall is both a floating bar and a coloured one. It
  // still has one rect per category, so counting is the test that separates
  // them, and it is the same one `stackedGrid` applies.
  if (data.length > new Set(data.map(datum => datum.x)).size)
    return false;

  const value = orientation === Orientation.VERTICAL ? scales.y : scales.x;
  const baseline = baselinePixel(value);
  if (baseline === null)
    return false;
  const attributes = orientation === Orientation.VERTICAL
    ? (['y', 'height'] as const)
    : (['x', 'width'] as const);
  // Every rect, not merely one: a waterfall's opening step is drawn from zero
  // like any bar, so a mark is only a bar chart if all of them are.
  const elements = data.map(datum => datum.element);
  return countTouching(elements, attributes, baseline) < elements.length;
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
/**
 * Reads a standalone `Plot.text` as the labelled scatter it draws.
 *
 * Both halves are exact rather than inferred. The position is the mark's
 * `transform`, the same place `dot`, `tick` and `vector` take theirs from,
 * and the name is what the element draws -- nothing inverted, nothing
 * rounded, no colour involved.
 *
 * Only on two continuous scales, which is what a labelled scatter is. A
 * `text` on a categorical axis is a value written over a bar, and the bar
 * mark already carries that value; reading it here would announce every
 * count twice, once as a bar and once as a point standing at the same
 * place.
 *
 * @param facet   - The mark's elements within one facet.
 * @param context - The conversion context.
 * @returns The layer, or null when the mark is not a labelled scatter.
 */
function convertText(
  facet: MarkFacet,
  context: ConversionContext,
): ConvertedMark | null {
  const { scales } = context;
  return isContinuous(scales.x) && isContinuous(scales.y)
    ? convertDot(facet, context)
    : null;
}

function convertDot(
  facet: MarkFacet,
  context: ConversionContext,
  centreOf: (element: Element) => { x: number; y: number } | null = dotCentre,
): ConvertedMark | null {
  const { scales } = context;

  if (isContinuous(scales.x) && isContinuous(scales.y)) {
    const points: ScatterPoint[] = [];
    const elements: Element[] = [];
    for (const element of facet.elements) {
      const centre = centreOf(element);
      if (!centre)
        continue;
      const x = toNumber(valueAtPixel(scales.x, centre.x));
      const y = toNumber(valueAtPixel(scales.y, centre.y));
      if (x === null || y === null)
        continue;
      // A label the mark carries itself -- a tree node's path, in a
      // `<title>` -- or one a `text` mark handed over.
      const name = context.pointNames.get(element) ?? markName(element);
      points.push(name === null ? { x, y } : { x, y, label: name });
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
    const centre = centreOf(element);
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
 * Reads a `spike` mark as positions carrying a magnitude.
 *
 * A spike map stands a magnitude at a place, and both halves are written down:
 * the place is the mark's `translate`, and the magnitude is how far the spike
 * reaches, inverted through the `length` scale that sized it. Measured on
 * `@observablehq/plot@0.6.17` against a scale of `[0, 12] → [0, 18]`, spikes
 * drawn 7.5, 18 and 12 pixels tall return 5, 12 and 8 exactly.
 *
 * It is announced as a scatter carrying `z`, which is a labelled third
 * measurement: the trace speaks it alongside the position and scales it into
 * an audio intensity across the layer's range, so the magnitude is both said
 * and heard.
 *
 * **A vector that points somewhere is refused.** `Plot.vector` draws the same
 * length with a `rotate`, and a flow field's direction is usually the thing it
 * was drawn for — there is no field in the grammar for a bearing, so reading
 * only the magnitude would announce half a chart without saying which half.
 * Plot writes `rotate()` into the transform exactly when a rotation channel was
 * given, even where its value is zero, so the mark says which it is: measured,
 * `vector(pts, {x, y, length})` produces `translate(40,253.333) translate(0,3.75)`
 * and `vector(pts, {…, rotate: 'r'})` produces
 * `translate(40,253.333) rotate(0) translate(0,3.75)`.
 *
 * @param facet   - The mark's paths.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the mark is not a set of plain spikes.
 */
function convertSpike(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  const { scales } = context;
  const points: ScatterPoint[] = [];
  const elements: Element[] = [];
  for (const element of facet.elements) {
    if (!isPath(element))
      continue;
    // Asked of the mark rather than of the path: one rotated vector among
    // straight ones is still a chart about direction.
    if (/\brotate\(/.test(element.getAttribute('transform') ?? ''))
      return null;

    const at = translateOf(element);
    const rise = spikeRise(element);
    if (at === null || rise === null)
      continue;

    const x = toNumber(valueAtPixel(scales.x, at.x));
    const y = toNumber(valueAtPixel(scales.y, at.y));
    // The scale is sized from the magnitude's size, so it inverts a distance
    // and the direction of the rise carries the sign: measured, a magnitude of
    // -8 draws `M-3.5,0L0,12L3.5,0`, reaching *down* by the same 12 pixels a
    // magnitude of 8 reaches up. Read off the raw `y` instead, a spike map of
    // net migration would announce every loss as a gain.
    //
    // A mark with no `length` channel has no such scale, and this is where it
    // is turned away: `Plot.vector(pts, {x, y})` draws every arrow the same
    // default height, so the only number to hand is the mark's own styling.
    // No separate guard, because inverting through a scale that is not there
    // already yields nothing and drops the point.
    const size = toNumber(pathValue(scales.length, Math.abs(rise), PATH_QUANTUM / 2));
    if (x === null || y === null || size === null)
      continue;
    // `rise > 0` rather than `rise < 0` so that a flat spike keeps a positive
    // zero: `-size` on a size of `0` is `-0`, which is a magnitude of zero
    // wearing a minus sign.
    const z = rise > 0 ? -size : size;

    points.push({ x, y, z });
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

/**
 * How far a spike rises from its base, in pixels, and which way.
 *
 * Both shapes grow from the origin they are translated to — a spike is a
 * triangle, `M-3.5,0L0,-7.5L3.5,0`, and a vector is a shaft with a head,
 * `M0,0L0,-7.5M-1.5,-6L0,-7.5L1.5,-6` — so the apex is the vertex furthest
 * from that base. Its sign is kept because it is the magnitude's: a negative
 * magnitude reaches down rather than up.
 *
 * Taken across the whole `d` rather than the first subpath. A vector's head is
 * drawn at the far end, so it cannot reach past the apex, and a spike has no
 * second subpath at all.
 *
 * A rise of zero is a rise, not a failure to find one. A magnitude of exactly
 * `0` is still drawn — measured, `M-3.5,0L0,0L3.5,0` for a spike and
 * `M0,0L0,0M0,0L0,0L0,0` for a vector — and a spike map of net migration that
 * dropped every place with no net change would be missing the places the
 * reader most wants to hear are there. `null` is reserved for a path that
 * could not be read at all, which `readPathGeometry` already reports.
 *
 * @param element - The mark's `<path>`.
 * @returns The signed rise in pixels, or `null` when the path cannot be read.
 */
function spikeRise(element: Element): number | null {
  const drawn = readPathGeometry(element);
  if (drawn === null)
    return null;

  return drawn.vertices.reduce(
    (far, vertex) => (Math.abs(vertex.y) > Math.abs(far) ? vertex.y : far),
    0,
  );
}

/**
 * Reads a `link` or `arrow` mark as a gantt of the spans it draws.
 *
 * A link joins two points, which says nothing on its own. It says something
 * when both ends share a coordinate: the segment is then a **span** along the
 * other axis, at one position on this one — an interval in a lane, which is
 * what a gantt, a timeline and a swimlane diagram all are.
 *
 * A gantt rather than a dumbbell, deliberately. The dumbbell shape asserts that
 * the two ends are a comparison — before and after, two groups, two years — and
 * nothing in a `link` says so. The dots that usually sit at each end are a
 * separate mark with its own `aria-label`, so reading them as one chart would
 * mean inferring a composite out of two independently labelled groups, which is
 * the inference that went wrong in #1088. There it was settled by provenance;
 * here Plot leaves none. `GanttPoint` claims only `{lane, start, end}`, which is
 * exactly what was drawn, and the dots stay the scatter they are.
 *
 * The question is asked of the **whole mark**, not of each path. One `link` can
 * hold both spans and diagonals, and three spans plus one diagonal is not a
 * gantt with a stray element — it is a chart this reading does not understand,
 * and announcing three quarters of it would be worse than declining it.
 *
 * @param facet   - The mark's paths.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the mark is not a set of spans.
 */
function convertLink(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  return convertSpans(facet, context, readSpan, isPath);
}

/**
 * Reads a mark whose elements are spans as a gantt of them.
 *
 * The two callers differ only in what a span is drawn as — a `link` writes a
 * `<path>`, a `rule` writes a `<line>` — and in what each has to refuse before
 * getting here. Everything downstream of that is one reading, so it is one
 * function.
 *
 * @param facet   - The mark's elements.
 * @param context - The conversion context.
 * @param read    - How to take a span off one element.
 * @param drawn   - Which of the mark's elements were meant to carry a span, so
 *                  that "every one or none" counts the right denominator.
 * @returns The layer, or `null` when the mark is not a set of spans.
 */
function convertSpans(
  facet: MarkFacet,
  context: ConversionContext,
  read: (element: Element, alongX: boolean) => Span | null,
  drawn: (element: Element) => boolean,
): ConvertedMark | null {
  const { scales } = context;
  const orientation = barOrientation(scales);
  if (!orientation)
    return null;

  // A lane runs along the axis the two ends agree on, so a horizontal span —
  // the ordinary gantt — sits on a discrete y, which is what `barOrientation`
  // calls horizontal.
  const alongX = orientation === Orientation.HORIZONTAL;
  const spans = facet.elements
    .map(element => read(element, alongX))
    .filter((span): span is Span => span !== null);
  // Every element or none: a mark holding one diagonal is handed back whole.
  if (spans.length === 0 || spans.length !== facet.elements.filter(drawn).length)
    return null;

  const laneScale = alongX ? scales.y : scales.x;
  const spanScale = alongX ? scales.x : scales.y;
  const lanes = laneScale?.domain;
  if (!Array.isArray(lanes) || lanes.length === 0)
    return null;

  // Nested by lane, in the scale's order rather than the drawing's, so a lane
  // holding nothing is an empty row rather than a row that is not there. That
  // is a real statement about a schedule, and the one row a flat list cannot
  // make.
  const rows: GanttPoint[][] = lanes.map(() => []);
  const elements: Element[][] = lanes.map(() => []);
  for (const span of spans) {
    const lane = valueAtPixel(laneScale, span.at);
    // Through the path's own quantum, not the raw pixel: a `link` writes its
    // `d` at three decimals, so inverting 88.333 in full announced 2.9999931
    // for a span drawn from 3. A rect's attributes are exact and need no such
    // care; a path's have already been rounded once.
    const start = toNumber(pathValue(spanScale, span.from, span.pixelError));
    const end = toNumber(pathValue(spanScale, span.to, span.pixelError));
    if (lane === null || start === null || end === null)
      continue;
    const row = lanes.indexOf(lane);
    if (row < 0)
      continue;
    rows[row].push({ x: lane, start, end });
    elements[row].push(span.element);
  }
  if (rows.every(row => row.length === 0))
    return null;

  const token = `L${context.layerCount++}`;
  const data: GanttData = { points: rows, lanes: lanes as (string | number)[] };

  return {
    legend: [],
    layer: {
      id: token,
      type: TraceType.GANTT,
      orientation,
      selectors: stampSeries(elements, context.containerId, token),
      axes: axisConfig(context),
      data,
    },
  };
}

/**
 * Reads a `rule` mark as a gantt of the intervals it draws.
 *
 * `Plot.ruleX` and `Plot.ruleY` are how Plot draws a high-low chart, a range
 * plot and a gantt, and they draw them exactly: a `<line>` carries both of its
 * ends as attributes, so there is no `d` to tokenise and nothing rounded to
 * undo. Measured on `@observablehq/plot@0.6.17`, `ruleY(rows, {y, x1, x2})`
 * over lanes Mon/Tue/Wed writes `x1="98" x2="446" y1="32" y2="32"`, which on a
 * scale of `[1, 11] → [40, 620]` is the interval 2 to 8 in the first lane.
 *
 * **A rule that agrees with itself is not a measurement.** Three other things
 * wear this same label, and all three give themselves away the same way — every
 * line ends where every other one does:
 *
 * - `Plot.ruleY([5])`, a reference line, is drawn once from the x range's
 *   minimum to its maximum. It spans the frame because Plot handed it the
 *   frame, not because a row said so, and announcing it as an interval would
 *   put a span in the reading that no row of the data contains.
 * - `Plot.ruleX(rows, {x})`, positions with no value, draws every line the
 *   same full height of the frame.
 * - `Plot.ruleX(rows, {x, y})`, a lollipop's stems, all start at the baseline:
 *   measured, `y1="370"` on every line, which is 0 on a domain of `[0, 11]`.
 *   Read as spans they announce "0 to 8" where the chart means "8", and the
 *   `dot` mark at their tips is already read as a scatter carrying that 8.
 *
 * So the question is asked of the whole mark, as it is for a `link` (#1094):
 * if every line shares an end, that end is the frame or the baseline rather
 * than anything measured, and the mark is handed back.
 *
 * The cost is a rule mark holding one line, and a gantt whose rows genuinely
 * all begin together — both are drawn exactly as the cases above and the markup
 * cannot separate them. That trade goes the other way from the constant floor
 * in #1095, because there refusing cost the chart its only reading, while here
 * the shapes being refused are either not data at all or already announced by
 * the mark beside them.
 *
 * @param facet   - The mark's lines.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the mark is not a set of intervals.
 */
function convertRule(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  // Read through the same projector the shared body will use, so the two agree
  // on what a span is: a line lying across the lanes rather than along one is
  // refused there, and never reaches the question below.
  const alongX = barOrientation(context.scales) === Orientation.HORIZONTAL;
  const spans = facet.elements
    .filter(isLine)
    .map(line => lineSpan(line, alongX))
    .filter((span): span is Span => span !== null);

  // Vacuously true on no spans, which refuses a mark holding nothing readable
  // for the same reason it refuses one holding nothing measured.
  const agrees = (pick: (span: Span) => number): boolean =>
    spans.every(span => pick(span) === pick(spans[0]));
  if (agrees(span => span.from) || agrees(span => span.to))
    return null;

  return convertSpans(facet, context, lineSpan, isLine);
}

/**
 * The span a `<line>` draws, or `null` when its ends disagree on the lane axis.
 *
 * A line writes both of its ends as attributes, at whatever precision they were
 * computed to — `y2="125.00000000000001"` for a value of 8 — so there is no
 * serialiser to have rounded them and `pixelError` is zero. The cleaning that
 * turns that back into 8 is the scale's, and it happens downstream.
 *
 * @param element - The mark's `<line>`.
 * @param alongX  - Whether the span runs along x.
 * @returns The span, or `null` when this is not one.
 */
function lineSpan(element: Element, alongX: boolean): Span | null {
  if (!isLine(element))
    return null;

  const x1 = attributeNumber(element, 'x1');
  const y1 = attributeNumber(element, 'y1');
  const x2 = attributeNumber(element, 'x2');
  const y2 = attributeNumber(element, 'y2');
  if (x1 === null || y1 === null || x2 === null || y2 === null)
    return null;

  const at = alongX ? y1 : x1;
  const other = alongX ? y2 : x2;
  if (at !== other)
    return null;

  return {
    element,
    at,
    from: alongX ? x1 : y1,
    to: alongX ? x2 : y2,
    pixelError: 0,
  };
}

/** One drawn span: where along its lane axis it sits, and the two ends. */
interface Span {
  element: Element;
  /** Position on the axis both ends share. */
  at: number;
  /** Pixel of the end drawn first. */
  from: number;
  /** Pixel of the end drawn last. */
  to: number;
  /**
   * The quantum the coordinates were written at, or `0` when they were not
   * written at one — a `<line>`'s ends are attributes rather than a serialised
   * `d`, so there is no rounding to undo.
   */
  pixelError: number;
}

/** Whether an element is a `<path>`. */
function isPath(element: Element): boolean {
  return element.tagName.toLowerCase() === 'path';
}

/** Whether an element is a `<line>`. */
function isLine(element: Element): boolean {
  return element.tagName.toLowerCase() === 'line';
}

/**
 * Reads one link as a span, or refuses it.
 *
 * Only the **first subpath** is the segment. `Plot.arrow` writes its head into
 * the same `d` as a second subpath, and those vertices are decoration rather
 * than data. Within that subpath only the two ends are data either: a `curve`
 * puts control points between them — `bump-x` writes
 * `M88.333,32C233.333,32,233.333,32,378.333,32` — which are the shape of the
 * connector and not positions anything was measured at.
 *
 * @param element - A child of the mark's group.
 * @param alongX  - Whether the span is expected to run along x.
 * @returns The span, or `null` when this path is not one.
 */
function readSpan(element: Element, alongX: boolean): Span | null {
  if (!isPath(element))
    return null;

  const ends = firstSubpathEnds(element.getAttribute('d') ?? '');
  if (!ends)
    return null;

  const { from, to } = ends;
  // The ends have to agree on the lane axis exactly. Both come from the same
  // `d`, written at one precision, so a span really drawn across one lane says
  // so in the same digits — the argument {@link floorIsLevel} rests on.
  const at = alongX ? from.y : from.x;
  const other = alongX ? to.y : to.x;
  if (at !== other)
    return null;

  return {
    element,
    at,
    from: alongX ? from.x : from.y,
    to: alongX ? to.x : to.y,
    pixelError: ends.pixelError,
  };
}

/**
 * The first and last vertex of a path's first subpath, and their precision.
 *
 * @param d - The `d` attribute.
 * @returns The two ends and their quantum, or `null` when there are not two.
 */
function firstSubpathEnds(
  d: string,
): { from: { x: number; y: number }; to: { x: number; y: number }; pixelError: number } | null {
  const vertices: { x: number; y: number }[] = [];
  let decimals = 0;
  const commands = d.match(/[MLC][^MLCZ]*/gi) ?? [];
  for (const [index, command] of commands.entries()) {
    // A second `M` opens the next subpath, which for an arrow is its head.
    if (index > 0 && command[0].toUpperCase() === 'M')
      break;
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
  // Exactly two. A link has two endpoints and a `curve` joins them with a
  // single command — `bump-x` writes one `C`, whose control points are not
  // separate vertices — so a first subpath carrying more than two is not a
  // link, and guessing which of them were the ends would be inventing a span.
  if (vertices.length !== 2)
    return null;

  return {
    from: vertices[0],
    to: vertices[1],
    // Half the smallest step the coordinates were written at, as
    // {@link readPathGeometry} computes it for the same reason.
    pixelError: 0.5 * 10 ** -decimals,
  };
}

/**
 * Reads a waffle mark as a bar chart of tallies.
 *
 * A waffle says its value by how many cells it fills, and both halves of that
 * are written down: the `<pattern>` a path is filled with gives the cell's
 * size, and the path itself is the outline around the filled cells — a
 * rectangle when they fill whole rows, a staircase when the last row is
 * partial. Nothing here is inverted from a colour or approximated.
 *
 * The tally is not announced directly, because a cell is not always one unit:
 * `unit: 5` draws 12 as 2.4 cells. What is announced is the height those cells
 * would have as a solid bar — their total area over the width of the lattice —
 * put back through the scale, which is the same reading a bar gets and needs no
 * knowledge of `unit` at all.
 *
 * The lattice's width has to be taken across the whole mark. A category holding
 * less than a full row is only as wide as the cells it drew, so on its own it
 * understates how many lanes there are; some category always fills a row,
 * because Plot sizes the lattice to the largest value.
 *
 * Measured on `@observablehq/plot@0.6.17` against `waffleY` and `waffleX`, a
 * `fill`-stacked waffle, `unit` of 2 and 5, a partial row, and a fractional
 * value: every tally comes back exactly.
 *
 * @param facet   - The mark's paths and patterns.
 * @param context - The conversion context.
 * @returns The layer, or `null` when the mark is not a readable waffle.
 */
function convertWaffle(facet: MarkFacet, context: ConversionContext): ConvertedMark | null {
  const { scales } = context;
  const orientation = barOrientation(scales);
  if (!orientation)
    return null;

  const vertical = orientation === Orientation.VERTICAL;
  const patches = facet.elements
    .map(element => readWafflePatch(element))
    .filter((patch): patch is WafflePatch => patch !== null);
  if (patches.length === 0)
    return null;

  // The cell's size across the lattice, which is the axis the lanes run along:
  // a `waffleY` stacks rows up the band and lays its cells out across it, and
  // a `waffleX` does the same thing turned on its side.
  const laneSize = vertical ? patches[0].cell.width : patches[0].cell.height;
  if (!(laneSize > 0))
    return null;
  const widest = Math.max(...patches.map(patch => (vertical ? patch.across.x : patch.across.y)));
  const lanes = Math.round(widest / laneSize);
  // Only a mark whose every category tallies zero has nothing to size the
  // lattice from, and Plot does not draw one: measured on 0.6.17, a waffle of
  // all zeroes — one category or three, `waffleY` or `waffleX` — emits no
  // group at all, so there is no mark here to arrive with. Guarded anyway, so
  // that a lattice of no lanes cannot divide a tally.
  if (!(lanes >= 1))
    return null;

  const magnitude = vertical ? scales.y : scales.x;
  const category = vertical ? scales.x : scales.y;
  const data: MarkDatum[] = [];
  for (const patch of patches) {
    // The height this many cells would have as a solid bar: their area spread
    // across the lattice's full width.
    const depth = patch.area / (lanes * laneSize);
    const from = vertical ? patch.origin.y : patch.origin.x;
    // A vertical waffle grows upward, which is towards smaller pixels.
    const to = vertical ? from - depth : from + depth;
    const base = toNumber(valueAtPixel(magnitude, from));
    const tip = toNumber(valueAtPixel(magnitude, to));
    const where = valueAtPixel(category, vertical ? patch.origin.x : patch.origin.y);
    if (base === null || tip === null || where === null)
      continue;

    // The colour lives on the pattern's swatch rather than on the path, so the
    // series is named the same way every other mark names one — through the
    // colour scale — just from a step further in.
    const series = valueAtColor(scales.color, patch.colour);

    data.push({
      element: patch.element,
      x: where,
      y: signedMagnitude(tip, base),
      ...(series === null ? {} : { series: String(series) }),
    });
  }
  if (data.length === 0)
    return null;

  return buildBarLayer(data, context, orientation, TraceType.BAR);
}

/** One filled region of a waffle, and the lattice it was drawn on. */
interface WafflePatch {
  element: Element;
  /** Area of the filled outline, in square pixels. */
  area: number;
  /** How far the outline reaches along each axis, in pixels. */
  across: { x: number; y: number };
  /** Where the mark placed this patch, from its `transform`. */
  origin: { x: number; y: number };
  /** The lattice cell, from the `<pattern>` the patch is filled with. */
  cell: { width: number; height: number };
  /** The swatch colour on the patch's pattern, when a `fill` split the mark. */
  colour: string | null;
}

/**
 * Reads one waffle path, together with the pattern it is filled with.
 *
 * The pattern is where the cell's size lives, and — when a `fill` channel split
 * the mark — where its colour lives too: Plot puts the series colour on the
 * `<rect>` inside the pattern rather than on the path, which carries only
 * `url(#…)`.
 *
 * @param element - A child of the waffle group.
 * @returns The patch, or `null` when this is not a filled waffle path.
 */
function readWafflePatch(element: Element): WafflePatch | null {
  if (element.tagName.toLowerCase() !== 'path')
    return null;

  const pattern = patternOf(element);
  if (!pattern)
    return null;
  const width = attributeNumber(pattern, 'width');
  const height = attributeNumber(pattern, 'height');
  if (width === null || height === null || width <= 0 || height <= 0)
    return null;

  const drawn = readPathGeometry(element);
  // One outline, not several: a waffle draws its filled cells as a single
  // closed region, and a `d` in pieces is some other mark in this group whose
  // vertices would enclose an area belonging to neither piece.
  //
  // No minimum vertex count, deliberately. A category holding nothing is still
  // drawn — `M0,0L0,0…Z`, every vertex on the origin — and encloses no area,
  // so it reads as the zero it is rather than being dropped from the chart.
  // Anything degenerate enough to have fewer vertices encloses no area either
  // and arrives at the same answer.
  if (drawn === null || drawn.subpaths !== 1)
    return null;

  const swatch = pattern.querySelector('rect');
  const colour = swatch?.getAttribute('fill') ?? null;

  return {
    element,
    area: polygonArea(drawn.vertices),
    across: { x: extentOf(drawn.vertices, 'x'), y: extentOf(drawn.vertices, 'y') },
    origin: translateOf(element) ?? { x: 0, y: 0 },
    cell: { width, height },
    colour,
  };
}

/**
 * The `<pattern>` an element's `fill` points at.
 *
 * @param element - The filled element.
 * @returns The pattern, or `null` when the fill is not a pattern reference.
 */
function patternOf(element: Element): Element | null {
  const reference = /^url\(#(.+)\)$/.exec(element.getAttribute('fill') ?? '');
  if (!reference)
    return null;

  // Scanned rather than selected by id: an id goes into a selector unescaped
  // only if it happens to be a valid identifier, and `CSS.escape` is not
  // something this adapter can count on in every document it is handed.
  const scope = element.closest('svg') ?? element.parentElement;
  const patterns = Array.from(scope?.querySelectorAll('pattern') ?? []);
  return patterns.find(pattern => pattern.getAttribute('id') === reference[1]) ?? null;
}

/**
 * The area a closed outline encloses, by the shoelace formula.
 *
 * Taken as a magnitude, because the sign only says which way round the outline
 * was drawn.
 *
 * @param vertices - The outline's vertices, in drawing order.
 * @returns The area in square pixels.
 */
function polygonArea(vertices: readonly { x: number; y: number }[]): number {
  let twice = 0;
  for (let index = 0; index < vertices.length; index++) {
    const here = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    twice += here.x * next.y - next.x * here.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * How far a set of vertices reaches along one axis.
 *
 * @param vertices - The vertices.
 * @param axis     - Which coordinate to measure.
 * @returns The extent in pixels.
 */
function extentOf(vertices: readonly { x: number; y: number }[], axis: 'x' | 'y'): number {
  const values = vertices.map(vertex => vertex[axis]);
  return Math.max(...values) - Math.min(...values);
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
  /** Each band's drawn edges in pixels, for deciding whether they stack. */
  const bands: { upper: number[]; lower: number[] }[] = [];
  /**
   * The convention the mark's curve draws, when it draws a staircase. One
   * mark has one curve, so the first path that says so answers for all of
   * them.
   */
  let stepDirection: StepDirection | undefined;

  // Parsed first, read second: whether a band's floor is the series below it
  // or a lower bound of its own is a question about the whole mark, and the
  // answer decides how each band's own value is read.
  const drawn: { element: Element; path: ParsedPath; name: unknown }[] = [];
  for (const element of facet.elements) {
    if (element.tagName.toLowerCase() !== 'path')
      continue;

    const name = valueAtColor(scales.color, strokeOrFill(element));
    const path = parsePathVertices(element, type === TraceType.AREA);
    if (path === null)
      continue;
    stepDirection ??= path.stepDirection;

    drawn.push({ element, path, name });
    // Every parsed band counts towards the stack question, including one whose
    // vertices go on to invert to nothing and leave it with no points. Whether
    // the bands rest on one another is a fact about what was drawn, and a band
    // drawn on a scale that cannot invert it is still holding up the one above.
    // Collected before the reading rather than after it, which is a change from
    // when the two were one pass: such a band used to be invisible here.
    if (path.lower) {
      bands.push({
        upper: path.vertices.map(vertex => vertex.y),
        lower: path.lower.map(vertex => vertex.y),
      });
    }
  }

  // A stacked area draws two magnitudes per sample — the band's own height and
  // the running total its top edge traces — and `AreaTrace` announces the
  // second only when it is told the layer is stacked. Typed as a plain area the
  // values are right and half the chart's meaning is missing, because a reader
  // is never told what the bands add up to or what share this one is. The
  // totals are summed there rather than sent from here, which is what the
  // per-series values read off the band are.
  const stacked = type === TraceType.AREA && bandsStack(bands);

  for (const { element, path, name } of drawn) {
    // Subtracting the floor turns a stack's running total back into each
    // series' own value, and it says something quite different about a band
    // that stacks on nothing. A floor that follows the data is a lower bound —
    // a confidence band, a min/max range, a Bollinger band — and the distance
    // up to the ceiling is the interval's width, not a value: measured, a band
    // drawn at 8/12, 11/15, 9/13 and 13/17 announced a flat 4, which its own y
    // axis contradicts (#1092).
    //
    // MAIDR has a shape for a value with an interval around it — `SmoothPoint`'s
    // `yMin`/`yMax` — but a band on its own has no centre to carry one, so this
    // hands the mark back rather than choosing a value for it.
    if (type === TraceType.AREA && !stacked && path.lower && !floorIsLevel(path.lower))
      continue;

    const points: LinePoint[] = [];
    for (const [index, vertex] of path.vertices.entries()) {
      // Unlike a rect's x and y, a path's coordinates were rounded on the way
      // into the `d` attribute, so the inverted value is only good to the
      // quantum that rounding left. Reporting it in full would dress a rounded
      // pixel up as an exact measurement.
      const x = pathValue(scales.x, vertex.x, path.pixelError);
      const top = toNumber(pathValue(scales.y, vertex.y, path.pixelError));
      if (x === null || top === null)
        continue;

      // An area's value is the height of its band, not the height of its top
      // edge. The two agree only while the band sits on the baseline, and a
      // `fill` channel makes `Plot.areaY` stack by default — so the top edge is
      // then the running total and this series' own value appears nowhere else.
      // Read that way a three-series chart announced 180 for a series drawn
      // from 60.
      const floor = path.lower?.[index];
      const base = floor
        ? toNumber(pathValue(scales.y, floor.y, path.pixelError))
        : 0;
      if (base === null)
        continue;
      // Rounded to what the geometry supports, and against twice the quantum:
      // both edges were rounded on the way into the `d` attribute, so their
      // difference carries both errors. Without it a band of exactly 33 comes
      // back as 33.0001 — a rounded pixel presented as a measurement.
      const y = base === 0
        ? top
        : cleanToGeometry(top - base, scales.y, path.pixelError * 2);

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
  // The same question of a stacked area, asked per sample rather than per
  // column: bands that add to one at every x are a 100% area.
  const heights = series[0]?.map((_, sample) =>
    series.map(band => Number(band[sample]?.y))) ?? [];
  const normalized = stacked && columnsAreShares(heights);
  if (normalized) {
    const scaled = toCategoryShares(series.map(band => band.map(point => Number(point.y))));
    for (const [band, values] of scaled.entries()) {
      for (const [sample, value] of values.entries())
        series[band][sample] = { ...series[band][sample], y: value };
    }
  }
  // A staircase is a step chart, which is navigated by transition rather than
  // by sample and described in runs. An area stays an area: its trace reads
  // the convention to tell a stepped band's risers from its samples, the way
  // `bindD3Area` does.
  const kind = normalized
    ? TraceType.NORMALIZED_AREA
    : stacked
      ? TraceType.STACKED_AREA
      : (type === TraceType.LINE && stepDirection !== undefined ? TraceType.STEP : type);

  return {
    legend,
    layer: {
      id: token,
      type: kind,
      ...(stepDirection !== undefined ? { stepDirection } : {}),
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

  // A 100% stack is the same grid with every column adding to one. Read as a
  // plain stack it announces fractions and never says they are parts of a
  // whole, so the shares are pinned to a hundred here the way the Recharts,
  // Vega-Lite, amCharts and Frappe adapters do — `NORMALIZED` divides nothing
  // itself.
  const horizontal = orientation === Orientation.HORIZONTAL;
  const magnitude = (point: SegmentedPoint): number =>
    Number(horizontal ? point.x : point.y);
  const columns = grid.rows[0]?.map((_, column) =>
    grid.rows.map(row => magnitude(row[column]))) ?? [];
  const shares = columnsAreShares(columns);

  return {
    legend: seriesNames,
    layer: {
      id: token,
      type: shares ? TraceType.NORMALIZED : TraceType.STACKED,
      orientation,
      selectors: stampLayer(grid.elements, context.containerId, token),
      domMapping: { order: 'row' },
      axes: axisConfig(context),
      data: shares ? toSegmentedShares(grid.rows, horizontal) : grid.rows,
    },
  };
}

/**
 * Whether a stack's columns each add up to one — that is, whether it is a 100%
 * chart rather than an ordinary stack.
 *
 * `Plot.stackY({ offset: 'normalize' })` divides before it draws, so the values
 * that come back out of the pixels are already shares. Read as a plain stack
 * they are announced as fractions of one, and the reader is never told the
 * columns are parts of a whole.
 *
 * The test is on the values rather than on the scale. A y domain of exactly
 * `[0, 1]` looks like the obvious signal and is not one: an author who widens
 * it for headroom (`y: { domain: [0, 1.2] }`) draws a 100% chart whose domain
 * is not `[0, 1]` and whose columns do not span the frame, and the domain test
 * misses it. Summing the columns catches that chart and needs nothing else.
 *
 * It does not separate Plot's own normalization from an author who divided
 * their numbers first, and there is nothing there to separate: both are a
 * chart of shares, and {@link toCategoryShares} is idempotent in proportion,
 * so `0.3`/`0.7` and Plot's `0.75`/`0.25` both come out as percentages of a
 * hundred.
 *
 * @param columns - The stack's magnitudes, as `[column][segment]`.
 * @returns True when every column sums to one.
 */
function columnsAreShares(columns: readonly number[][]): boolean {
  if (columns.length === 0)
    return false;
  return columns.every((column) => {
    if (column.some(value => !Number.isFinite(value)))
      return false;
    const total = column.reduce((sum, value) => sum + value, 0);
    // Loose enough for the float noise of inverting a pixel, tight enough that
    // a stack of counts is never mistaken for one of shares: the nearest
    // whole-number total is two.
    return Math.abs(total - 1) < 1e-6;
  });
}

/**
 * Whether an area's floor is a base it was given rather than data of its own.
 *
 * A level floor is one the chart chose: the baseline, which `Plot.areaY` draws
 * at the value zero whatever the y domain says — measured on 0.6.17 at pixel
 * 486.667 for a domain of `[5, 20]` whose range ends at 370, off the frame and
 * inverting to exactly zero — or a constant `y1`, which is the same thing at a
 * different height. Either way the band's height is a magnitude above a base,
 * which is what the reading announces.
 *
 * A floor that moves is following something. Given `y1` and `y2` off the data
 * an area is an interval, and its floor traces the lower bound sample by
 * sample — so the height is the width of that interval and not a value.
 *
 * The one case this cannot separate is a genuine interval around a flat
 * series, whose lower bound is constant and so looks exactly like a chosen
 * base. Nothing in the drawing tells those apart, which is where the test
 * stops rather than where it guesses.
 *
 * Compared exactly, unlike {@link bandsStack}, which needs a pixel of slack
 * because it compares two *different* paths' edges and Plot offsets a stroked
 * mark by half a pixel. There is nothing to absorb inside one path: a floor's
 * vertices are read from the `d` attribute rather than computed, so Plot's
 * output rounding has already erased any noise below the quantum. Measured on
 * 0.6.17, a `y1` of `1/3`, of `Math.PI`, of `-2.7`, one alternating between
 * `0.1 + 0.2` and `0.3`, and one stepping by `1e-9` all write the same number
 * at every vertex; a `y1` stepping by `0.4` writes `314 328 342 356 370`. A
 * floor either does not move or moves in whole pixels, so slack here would
 * only admit a band whose bound moves too little to see.
 *
 * @param floor - The band's lower edge, in pixels.
 * @returns True when every floor vertex sits at one height.
 */
function floorIsLevel(floor: readonly { x: number; y: number }[]): boolean {
  return floor.every(vertex => vertex.y === floor[0].y);
}

/**
 * Whether a mark's area bands rest on one another.
 *
 * `Plot.areaY` stacks by default when a `fill` splits it, but bands given their
 * own `y1` and `y2` are independent and may overlap — and the difference is not
 * cosmetic. A stacked layer makes `AreaTrace` announce a running total and each
 * band's share of it, so calling an independent set stacked hands a reader a
 * total of things that were never added together.
 *
 * The drawn edges answer it outright: bands stack exactly when each one's floor
 * is the previous one's ceiling. Comparing the pixels rather than the inverted
 * values keeps the tolerance in the units the question is about — a pixel — and
 * a band's floor is the very edge the one below it drew.
 *
 * @param bands - Each band's upper and lower edge, in pixels, in draw order.
 * @returns True when every band after the first sits on the one before it.
 */
function bandsStack(bands: readonly { upper: number[]; lower: number[] }[]): boolean {
  if (bands.length < 2)
    return false;
  for (let index = 1; index < bands.length; index++) {
    const floor = bands[index].lower;
    const ceiling = bands[index - 1].upper;
    if (floor.length !== ceiling.length)
      return false;
    if (floor.some((pixel, at) => Math.abs(pixel - ceiling[at]) > 1))
      return false;
  }
  return true;
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
  // Which side of zero the bar was drawn on, not which of its two ends landed
  // on the smaller pixel. Those agree only while the axis runs the usual way:
  // `y: {reverse: true}`, or an explicitly descending domain, puts the bar's
  // near-zero end at the top and its negative end at the bottom, and reading
  // the sign off pixel order then announced a budget cut of 4.2 as a gain of
  // 4.2 — with the sonified pitch and the reported range wrong to match.
  const away = Math.abs(upper) >= Math.abs(lower) ? upper : lower;
  return away < 0 ? -magnitude : magnitude;
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
/**
 * How far apart a label and the point it names may sit and still be paired.
 *
 * Plot writes a label's position into the same `transform` it writes the
 * point's, so the two coincide exactly -- a `dy` offset is applied when the
 * text is laid out, not to the transform. Measured on a `Plot.dot` +
 * `Plot.text` scatter with `dy: -8`: both marks at `translate(40,238.376)`.
 * The tolerance is here for the half-pixel Plot nudges stroked marks by,
 * not because anything is expected to be further off than that.
 */
const LABEL_TOLERANCE = 1;

/**
 * What a mark says the point it drew *is*.
 *
 * Two places carry it, and the `<title>` wins where both do. `Plot.tree`
 * draws `<circle><title>/a/b</title></circle>` for the node and a `text`
 * showing only `b`, so the title is the unambiguous one -- and reading
 * `textContent` off that text element would give `"b/a/b"`, since a
 * `<title>` child's text is part of its parent's `textContent`. Own text
 * nodes only, therefore, when there is no title.
 *
 * @param element - The element the mark drew.
 * @returns The name, or null when the mark drew no name.
 */
function markName(element: Element): string | null {
  const title = element.querySelector('title')?.textContent?.trim();
  if (title)
    return title;

  const own = Array.from(element.childNodes)
    .filter(node => node.nodeType === 3 /* Node.TEXT_NODE */)
    .map(node => node.textContent ?? '')
    .join('')
    .trim();
  return own === '' ? null : own;
}

/**
 * Pairs each `text` mark that labels another mark with what it labels.
 *
 * `Plot.text` draws a labelled scatter on its own, and it also draws the
 * labels *of* another mark -- `Plot.tree` is four marks, of which two are
 * `text` sitting exactly on the `dot` it drew for each node. Read
 * independently the second case emits a second and third series at the same
 * coordinates as the first, so a five-node tree becomes three layers a
 * reader has to walk separately to learn one thing.
 *
 * Position is what tells them apart, and it tells them apart exactly:
 * Plot writes the label's transform from the same channel it writes the
 * point's, so a label of a mark lands on it. A `Plot.text` that is its own
 * series has no mark under it to land on.
 *
 * The names travel onto the labelled mark rather than the `text` group
 * being merely dropped, so a `Plot.dot` + `Plot.text` scatter -- the
 * ordinary way to draw one -- reads as one named series rather than as an
 * unnamed one beside a nameless duplicate.
 *
 * Compared facet by facet, through `splitFacets`, because a faceted mark's
 * own children are per-facet wrappers rather than the elements it drew.
 * Reading positions off those compares the *facets'* offsets, which
 * coincide between any two marks faceted alike -- so every pairing appears
 * to succeed, the `text` group is claimed, and the names are keyed by
 * wrappers that nothing ever looks up. Measured: a faceted `Plot.dot` +
 * `Plot.text` came out as one unnamed layer per panel, having lost the
 * names rather than duplicated them.
 *
 * @param groups - The plot's mark groups, in draw order.
 * @returns The `text` groups to skip, and the names they give away.
 */
export function labelOverlays(
  groups: readonly { label: string; group: Element }[],
): { claimed: Set<number>; names: Map<Element, string> } {
  const claimed = new Set<number>();
  const names = new Map<Element, string>();

  groups.forEach(({ label, group }, index) => {
    if (label !== 'text')
      return;
    const labelFacets = splitFacets(group);
    if (labelFacets.every(facet => facet.elements.length === 0))
      return;

    for (const [target, entry] of groups.entries()) {
      if (target === index || entry.label === 'text')
        continue;
      const pointFacets = splitFacets(entry.group);
      if (pointFacets.length !== labelFacets.length)
        continue;

      const paired = new Map<Element, string>();
      const everyFacetPairs = labelFacets.every((facet, at) =>
        pairLabels(facet.elements, pointFacets[at].elements, paired));
      if (!everyFacetPairs)
        continue;

      claimed.add(index);
      for (const [element, name] of paired)
        names.set(element, name);
      break;
    }
  });

  return { claimed, names };
}

/**
 * Matches every label in one facet to a point of its own in another.
 *
 * @param labels - The `text` elements drawn in the facet.
 * @param points - The elements of the mark they might label.
 * @param into   - Collects the name each matched point is given.
 * @returns True when every label found a point of its own.
 */
function pairLabels(
  labels: readonly Element[],
  points: readonly Element[],
  into: Map<Element, string>,
): boolean {
  const centres = points
    .map((element) => {
      const centre = dotCentre(element);
      return centre === null ? null : { element, ...centre };
    })
    .filter((entry): entry is { element: Element; x: number; y: number } =>
      entry !== null);

  const taken = new Set<Element>();
  for (const element of labels) {
    const at = dotCentre(element);
    if (at === null)
      return false;
    const match = centres.find(point => !taken.has(point.element)
      && Math.abs(point.x - at.x) <= LABEL_TOLERANCE
      && Math.abs(point.y - at.y) <= LABEL_TOLERANCE);
    if (!match)
      return false;
    taken.add(match.element);
    const name = markName(element);
    if (name !== null)
      into.set(match.element, name);
  }

  // Every label had to find a point of its own. One that did not is a series
  // in its own right that happens to pass near another mark.
  return labels.length > 0;
}

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
 * The centre of a tick, which Plot draws as a `<line>` rather than a symbol.
 *
 * One end of the stroke carries the value and the other spans the band, so the
 * pair that agrees is the measured coordinate and the pair that does not is the
 * category's extent. Measured on a rendered strip plot: a `tickX` comes out
 * `x1=40 x2=40 y1=23 y2=44`, a `tickY` `x1=68 x2=316 y1=370 y2=370`.
 *
 * The midpoint answers both: a pair that agrees is its own midpoint, and a pair
 * that spans a band has the band's centre between them. Either end of the
 * spanning pair would in fact invert to the same category — a tick is drawn
 * exactly across its own band, so its ends are inside it — so the centre is
 * chosen for being the band's representative point rather than to guard
 * against anything.
 *
 * @param element - The tick's element.
 * @returns The centre in pixels, or `null`.
 */
function tickCentre(element: Element): { x: number; y: number } | null {
  const x1 = attributeNumber(element, 'x1');
  const x2 = attributeNumber(element, 'x2');
  const y1 = attributeNumber(element, 'y1');
  const y2 = attributeNumber(element, 'y2');
  if (x1 === null || x2 === null || y1 === null || y2 === null)
    return null;

  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/**
 * Reads where a path goes, and how precisely it says so.
 *
 * Just the geometry: no comparison against the datum indices bound to the
 * element, because what those mean depends on the mark. On a line they are its
 * samples, so a mismatch says the curve does not pass through them. On a
 * regression fit they are the *observations the fit was computed from*, and
 * the path is the fitted line through them — two vertices for any number of
 * observations — so the same comparison would refuse every fit ever drawn.
 *
 * @param element - The `<path>`.
 * @returns Its vertices, their rounding quantum, and how many subpaths it was
 *          drawn in, or `null` when it has no vertices.
 */
function readPathGeometry(
  element: Element,
): { vertices: { x: number; y: number }[]; pixelError: number; subpaths: number } | null {
  const d = element.getAttribute('d');
  if (!d)
    return null;

  const vertices: { x: number; y: number }[] = [];
  let decimals = 0;
  // Each drawing command ends at a coordinate pair; for M and L that pair is
  // the whole command, and for C it is the last of three.
  const commands = d.match(/[MLC][^MLCZ]*/gi) ?? [];
  // Every `M` starts a subpath, and a mark drawn in more than one was broken
  // somewhere. Counted here rather than at the caller so it comes from the
  // same tokenisation as the vertices it describes.
  let subpaths = 0;
  for (const command of commands) {
    if (command[0].toUpperCase() === 'M')
      subpaths++;
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
  return { vertices, pixelError: 0.5 * 10 ** -decimals, subpaths };
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
  const drawn = readPathGeometry(element);
  if (drawn === null)
    return null;
  const { vertices, pixelError, subpaths } = drawn;
  const data = (element as Element & { __data__?: unknown }).__data__;
  const expected = Array.isArray(data) ? data.length : null;

  // A gap breaks the mark into subpaths, and the count below cannot see it:
  // it asks how many vertices there are, not whether they are the samples, and
  // a break moves both numbers at once. Measured on `@observablehq/plot@0.6.17`,
  // a `step-after` or `step-before` line whose `y` goes null, and a
  // `step-after` area whose `x` does, land back on their own sample count — so
  // the reading is accepted and the pieces are paired off with the samples
  // they are not. What comes out is a subpath's opening move announced as a
  // datum, a corner announced as another, and the gap itself gone (#1079).
  //
  // Reading the pieces properly is possible and is what `LinePoint` is for,
  // but it needs the surviving samples matched to the subpaths that hold them.
  // Until that exists this refuses rather than guesses, which costs nothing:
  // every line and area Plot draws without a gap is a single subpath.
  if (subpaths > 1)
    return null;

  if (isArea) {
    // The loop is the series followed by the baseline back, so an even vertex
    // count halves cleanly. A repeated final vertex (Plot emits one when the
    // baseline starts where the series ended) makes it odd; drop it first.
    const usable = vertices.length % 2 === 0 ? vertices : vertices.slice(0, -1);
    const half = usable.slice(0, usable.length / 2);
    // The other half is that same baseline, walked back, so reversing it lines
    // it up with the top edge vertex for vertex. It is not decoration: on a
    // stacked area the "baseline" is the series below, and the band between the
    // two edges is the only place this series' own value appears.
    const lower = usable.slice(usable.length / 2).reverse();
    if (expected === null || half.length === expected)
      return { vertices: half, lower, pixelError };

    // A stepped band draws its baseline as a staircase too, so the two halves
    // stay the same length and the same sample indices cut both.
    const stair = readStaircase(half, expected, pixelError);
    return stair === null
      ? null
      : {
          vertices: stair.vertices,
          lower: stair.indices.map(index => lower[index]),
          pixelError,
          stepDirection: stair.direction,
        };
  }

  if (expected === null || vertices.length === expected)
    return { vertices, pixelError };

  const stair = readStaircase(vertices, expected, pixelError);
  return stair === null
    ? null
    : { vertices: stair.vertices, pixelError, stepDirection: stair.direction };
}

/**
 * Reads a staircase back out of the vertices a step curve drew.
 *
 * A step curve is the one non-matching vertex count that is still worth
 * reading. `curveBasis` and friends draw through control points that are not
 * the data at all, but a staircase passes through every sample and adds a
 * corner between each pair — and where the corner sits says which convention
 * drew it, so nothing has to be declared or guessed.
 *
 * Measured against `@observablehq/plot@0.6.17`, samples at x pixels 40/330/620
 * and y pixels 370/20/195:
 *
 * ```
 * step-after   M40,370 L330,370 L330,20 L620,20 L620,195     2n-1, corners at the next sample
 * step-before  M40,370 L40,20  L330,20 L330,195 L620,195     2n-1, corners at the current one
 * step         M40,370 L185,370 L185,20 L475,20 L475,195 L620,195   2n, corners at the midpoints
 * ```
 *
 * In all three the samples' `y` sit at the even indices. The `x` do too for
 * the first two; for the centred curve the interior samples are **not on the
 * path** — only the midpoints between them are — so they come back by forward
 * substitution from the first, and the last sample, which *is* drawn, checks
 * the result rather than being trusted.
 *
 * Every corner is verified rather than assumed. A path that merely happens to
 * carry `2n - 1` vertices is refused, because reading it as a staircase would
 * announce transitions the chart never drew.
 *
 * @param drawn      - The path's vertices, in drawing order.
 * @param expected   - How many samples the bound datum indices say there are.
 * @param pixelError - The most the serializer can have moved a coordinate.
 * @returns The samples and the convention, or `null` when this is no staircase.
 */
function readStaircase(
  drawn: { x: number; y: number }[],
  expected: number,
  pixelError: number,
): Staircase | null {
  const indices = Array.from({ length: expected }, (_, k) => 2 * k);
  const at = (k: number): { x: number; y: number } => drawn[2 * k];

  if (drawn.length === 2 * expected - 1) {
    // `hv` holds the level and turns at the next sample, so the corner takes
    // its y from the sample behind it and its x from the one ahead. `vh` is
    // the same corner reflected. Both put the samples on the even indices.
    const corners = (direction: StepDirection): boolean =>
      indices.slice(0, -1).every((_, k) => {
        const corner = drawn[2 * k + 1];
        return direction === 'hv'
          ? corner.y === at(k).y && corner.x === at(k + 1).x
          : corner.x === at(k).x && corner.y === at(k + 1).y;
      });

    for (const direction of ['hv', 'vh'] as const) {
      if (corners(direction))
        return { vertices: indices.map((_, k) => at(k)), indices, direction };
    }
    return null;
  }

  if (drawn.length === 2 * expected)
    return readCentredStaircase(drawn, expected, pixelError, indices);

  return null;
}

/**
 * The centred case, where the risers land midway between the samples.
 *
 * `m[k]` is the midpoint of samples `k` and `k + 1`, so `x[k+1] = 2·m[k] − x[k]`
 * walks the samples out from the first. The error does not compound: a wrong
 * `x[k]` reaches `x[k+1]` negated rather than amplified, so it alternates
 * around the serializer's own quantum instead of growing. Measured over 50
 * samples at deliberately uneven spacing, the largest departure from the true
 * pixel was 0.002 — twice the quantum the coordinates were written at.
 *
 * @param drawn      - The path's vertices, in drawing order.
 * @param expected   - How many samples there are.
 * @param pixelError - The most the serializer can have moved a coordinate.
 * @param indices    - The even indices, which is where the samples' y sit.
 * @returns The samples, or `null` when the corners are not midpoints.
 */
function readCentredStaircase(
  drawn: { x: number; y: number }[],
  expected: number,
  pixelError: number,
  indices: number[],
): Staircase | null {
  for (let k = 1; k < expected; k++) {
    const riser = drawn[2 * k - 1];
    // The riser is vertical — both its ends share the midpoint's x — and it
    // rises from the level the sample behind it holds.
    if (riser.x !== drawn[2 * k].x || riser.y !== drawn[2 * k - 2].y)
      return null;
  }
  // The last drawn vertex is the final sample, held at its own level.
  if (drawn[2 * expected - 1].y !== drawn[2 * expected - 2].y)
    return null;

  const xs = [drawn[0].x];
  for (let k = 1; k < expected; k++)
    xs.push(2 * drawn[2 * k - 1].x - xs[k - 1]);

  // The last sample is drawn, so the substitution can be checked instead of
  // trusted. A path that is not a staircase misses by whole pixels; the
  // tolerance is only for the rounding each substitution carried along.
  const drift = Math.abs(xs[expected - 1] - drawn[2 * expected - 1].x);
  if (drift > 2 * pixelError * expected)
    return null;

  return {
    vertices: xs.map((x, k) => ({ x, y: drawn[2 * k].y })),
    indices,
    direction: 'mid',
  };
}

/** A staircase read back out of a drawn path. */
interface Staircase {
  /** The samples, with a centred curve's interior x substituted back. */
  vertices: { x: number; y: number }[];
  /** Which drawn vertices those are, so an area's baseline cuts to match. */
  indices: number[];
  /** The convention the corners describe. */
  direction: StepDirection;
}

/** A parsed line or area path: where it goes, and how precisely it says so. */
interface ParsedPath {
  /**
   * Which way a staircase's risers go, when the path drew one.
   *
   * Absent on an ordinary curve, whose samples are simply its vertices.
   */
  stepDirection?: StepDirection;
  /** The path's vertices, in drawing order. */
  vertices: { x: number; y: number }[];
  /**
   * An area band's lower edge, aligned with {@link vertices}.
   *
   * Absent for a line, which has no band.
   */
  lower?: { x: number; y: number }[];
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
