/**
 * DOM introspection for the Observable Plot adapter.
 *
 * Plot labels everything it draws. Each mark becomes a `<g aria-label="bar">`,
 * `<g aria-label="dot">`, and so on, and each piece of an axis becomes a group
 * whose label ends in `-axis tick`, `-axis tick label`, or `-axis label`. That
 * vocabulary is stable, documented, and the only structural contract the
 * adapter needs — which is why it reads the rendered chart rather than asking
 * the user to describe it.
 *
 * @packageDocumentation
 */

/**
 * `aria-label` values that belong to chart furniture rather than to data.
 *
 * Axes, grids, frames, and the hover tip are all drawn as labelled groups
 * exactly like marks are — `x-axis tick label`, `y-grid`, `tip` — so a mark
 * walk that does not exclude them reads the gridlines as a data series.
 */
const NON_MARK_LABEL = /(?:^|-)(?:axis|grid)\b|^(?:frame|tip)$/;

/** Arrows Plot prepends or appends to an axis label to show its direction. */
const AXIS_LABEL_ARROWS = /^[↑↓←→]\s*|\s*[↑↓←→]$/g;

/**
 * Whether an element is — or contains — a chart drawn by Observable Plot.
 *
 * Plot stamps every chart with a generated `plot-<hash>` class, which is the
 * cheapest reliable signal and the one used here. The class is also what
 * scopes Plot's own stylesheet, so a chart without it would not render
 * correctly in the first place.
 *
 * @param element - The element to test.
 * @returns True when the element is a Plot `<svg>` or a `<figure>` around one.
 */
export function isObservablePlot(element: Element): boolean {
  const svg = resolveSvg(element);
  if (!svg)
    return false;
  const className = svg.getAttribute('class') ?? '';
  if (!/(?:^|\s)plot-[0-9a-z]+(?:$|\s)/.test(className))
    return false;
  // A Plot chart always draws at least one labelled group. Requiring one keeps
  // an empty placeholder — which Quarto inserts before a cell resolves — from
  // being bound as a chart with no data.
  return svg.querySelector('g[aria-label]') !== null;
}

/**
 * Finds the `<svg>` of a plot, given any element of it.
 *
 * @param element - The `<svg>` itself, or the `<figure>` wrapping it.
 * @returns The plot's `<svg>`, or `null`.
 */
export function resolveSvg(element: Element): SVGSVGElement | null {
  if (element.tagName.toLowerCase() === 'svg')
    return element as SVGSVGElement;

  // Not the first `<svg>` — the chart's. `legend: true` makes Plot render each
  // swatch as its own 15px `<svg>` and put them *before* the chart inside the
  // `<figure>`, so taking the first one hands the whole conversion a legend
  // square: no mark groups, no scales, nothing to read, and a chart that never
  // binds. That is the shape of the documented example, so it is the common
  // case rather than an exotic one.
  const candidates = Array.from(element.querySelectorAll('svg'));
  return candidates.find(svg => svg.querySelector('g[aria-label]'))
    ?? candidates[0]
    ?? null;
}

/**
 * Finds the `<figure>` wrapping a plot, when it has one.
 *
 * Plot only wraps the chart when it needs somewhere to put a title, subtitle,
 * caption, or legend, so most plots have none.
 *
 * @param element - Any element of the plot.
 * @returns The wrapping `<figure>`, or `null`.
 */
export function resolveFigure(element: Element): Element | null {
  if (element.tagName.toLowerCase() === 'figure')
    return element;
  return element.closest('figure');
}

/**
 * Reads the title, subtitle, and caption Plot rendered.
 *
 * Plot puts the `title` option in an `<h2>`, `subtitle` in an `<h3>`, and
 * `caption` in a `<figcaption>`, all inside the `<figure>`. A plot without any
 * of them has no `<figure>` at all, and this returns an empty object.
 *
 * @param element - Any element of the plot.
 * @returns The strings that are present.
 */
export function readTitles(element: Element): {
  title?: string;
  subtitle?: string;
  caption?: string;
} {
  const figure = resolveFigure(element);
  if (!figure)
    return {};
  return {
    title: textOf(figure.querySelector(':scope > h2')),
    subtitle: textOf(figure.querySelector(':scope > h3')),
    caption: textOf(figure.querySelector(':scope > figcaption')),
  };
}

/**
 * Reads the label Plot drew for an axis.
 *
 * Plot decorates the label with the direction the axis increases in — `↑ Count`
 * for a vertical axis, `Day →` for a horizontal one. The arrow is meaningful to
 * a sighted reader and noise in an announcement, so it is stripped.
 *
 * @param svg  - The plot's `<svg>`.
 * @param axis - Which axis to read.
 * @returns The label, or `undefined` when the axis has none.
 */
export function readAxisLabel(svg: Element, axis: 'x' | 'y' | 'fx' | 'fy'): string | undefined {
  const label = textOf(svg.querySelector(`g[aria-label="${axis}-axis label"] text`));
  if (!label)
    return undefined;
  const stripped = label.replace(AXIS_LABEL_ARROWS, '').trim();
  return stripped || undefined;
}

/**
 * Collects the groups that hold drawn marks, in the order Plot drew them.
 *
 * @param svg - The plot's `<svg>`.
 * @returns One entry per mark, each with the `aria-label` naming its kind.
 */
export function findMarkGroups(svg: Element): { label: string; group: Element }[] {
  const groups: { label: string; group: Element }[] = [];
  for (const child of Array.from(svg.children)) {
    if (child.tagName.toLowerCase() !== 'g')
      continue;
    const label = child.getAttribute('aria-label');
    if (!label || NON_MARK_LABEL.test(label))
      continue;
    groups.push({ label, group: child });
  }
  return groups;
}

/**
 * Finds the mark groups that make up a box plot.
 *
 * `Plot.boxY` is not a mark but four of them — a `rule` for the whiskers, a
 * `bar` for the interquartile box, a `tick` for the median, and a `dot` for the
 * outliers — and nothing in the DOM says they belong together. Read
 * individually they are worse than unreadable: the `bar` is a perfectly
 * ordinary bar mark whose height is `q3 - q1`, so a reader is told a number
 * that appears nowhere in the data and never hears the median or the whiskers
 * at all.
 *
 * What identifies the composite is not that those three marks are present —
 * an error bar chart, a candlestick and a bar chart with a target line each
 * draw the same three — but how they sit on top of each other. In a box plot
 * every median tick lies *inside* its box and every whisker rule *contains*
 * it. Nothing that merely shares the mark types satisfies both.
 *
 * That is conclusive enough to read the composite as a box plot rather than
 * merely to skip it, which is what the caller does with the answer. It stays
 * the outer gate either way: a composite this refuses is four marks that were
 * never a box plot, and one it finds but the reader cannot pair up is skipped
 * as it was before (#1074).
 *
 * @param groups - The plot's mark groups, in draw order.
 * @returns One entry per box plot found, in draw order.
 */
export function boxComposites(
  groups: readonly { label: string; group: Element }[],
): BoxComposite[] {
  const found: BoxComposite[] = [];
  const skip = new Set<number>();
  const indices = (label: string): number[] => groups
    .map((entry, index) => (entry.label === label ? index : -1))
    .filter(index => index >= 0);

  // Every combination, not the first of each: a `ruleY([0])` baseline drawn
  // before the box would otherwise take the rule's place and hide the box plot
  // from a check that only looks once.
  for (const bar of indices('bar')) {
    for (const rule of indices('rule')) {
      for (const tick of indices('tick')) {
        if (skip.has(bar) || skip.has(rule) || skip.has(tick))
          continue;
        if (!isBoxComposite(groups[bar].group, groups[rule].group, groups[tick].group))
          continue;

        skip.add(bar).add(rule).add(tick);
        const outliers = indices('dot')
          .find(index => !skip.has(index) && isOutlierMark(groups[index].group, groups[bar].group));
        if (outliers !== undefined)
          skip.add(outliers);
        found.push({ bar, rule, tick, ...(outliers === undefined ? {} : { dot: outliers }) });
      }
    }
  }

  return found;
}

/** The mark groups of one box plot, as indices into the plot's groups. */
export interface BoxComposite {
  /** The interquartile boxes. */
  bar: number;
  /** The whiskers. */
  rule: number;
  /** The medians. */
  tick: number;
  /** The outliers, absent when the chart drew none. */
  dot?: number;
}

/**
 * Whether three marks sit together the way a box plot's parts do.
 *
 * @param bar  - The candidate interquartile boxes.
 * @param rule - The candidate whiskers.
 * @param tick - The candidate medians.
 * @returns True when every box has a median inside it and a whisker around it.
 */
/** The stroke width `Plot.boxY` gives its median tick. */
const BOX_MEDIAN_STROKE = 2;

function isBoxComposite(bar: Element, rule: Element, tick: Element): boolean {
  // Geometry cannot finish this on its own. A floating rect inside a rule with
  // a line across it is a box plot's shape, and equally a bullet chart's or a
  // candlestick-with-a-marker's, so the arrangement narrows the field and this
  // says which of them it is: `Plot.boxY` builds its median from a tick with
  // `strokeWidth: 2`, which a tick mark does not otherwise carry (#1088).
  if (!drawnAsMedian(tick))
    return false;

  const boxes = leafElements(bar).map(boxOf).filter((box): box is Box => box !== null);
  const ticks = leafElements(tick).map(segmentOf).filter((one): one is Segment => one !== null);
  const rules = leafElements(rule).map(segmentOf).filter((one): one is Segment => one !== null);
  if (boxes.length === 0 || ticks.length < boxes.length || rules.length < boxes.length)
    return false;

  // Either way round: `boxY` stacks its parts vertically and `boxX`
  // horizontally, and both draw the same relationship — the median across the
  // box, the whisker running along it.
  return boxes.every(box =>
    ticks.some(median => crosses(box, median))
    && rules.some(whisker => runsAlong(box, whisker)));
}

/**
 * Whether a tick mark is a box plot's median rather than one an author drew.
 *
 * Measured against Plot 0.6.17, the stroke width survives the box's `fill` and
 * `stroke` being overridden, so a chart styled by its author is still
 * recognised; `fill` does not, which is why the grey `#ccc` interquartile box
 * is not what is tested. A faceted mark carries its styling on each facet
 * container rather than on the mark itself.
 *
 * @param tick - The candidate medians' mark group.
 * @returns True when Plot drew them as a box plot's medians.
 */
function drawnAsMedian(tick: Element): boolean {
  const facets = facetGroupsOf(tick);
  const carriers = facets.length > 0 ? facets : [tick];
  return carriers.every((element) => {
    const width = numberOf(element, 'stroke-width');
    return width === BOX_MEDIAN_STROKE;
  });
}

/**
 * Whether a line lies across a box, the way a median does.
 *
 * @param box  - The interquartile box.
 * @param line - The candidate median.
 * @returns True on either axis.
 */
function crosses(box: Box, line: Segment): boolean {
  return (spans(box.x, line.x) && within(box.y, midpoint(line.y)))
    || (spans(box.y, line.y) && within(box.x, midpoint(line.x)));
}

/**
 * Whether a line runs along a box the way a whisker does.
 *
 * Overlapping rather than containing. A whisker usually does reach past both
 * ends of its box, and requiring that was the original test — but outliers
 * move a quartile, and enough of them on one side pull it beyond the whisker's
 * end, so a perfectly ordinary box plot can have its box stick out (#1088).
 * What holds either way is that the two run along the same axis and meet.
 *
 * @param box  - The interquartile box.
 * @param line - The candidate whisker.
 * @returns True on either axis.
 */
function runsAlong(box: Box, line: Segment): boolean {
  return spans(box.x, line.x) && spans(box.y, line.y);
}

/**
 * Whether a dot mark holds a box plot's outliers rather than data of its own.
 *
 * Outliers sit on the same categories as the boxes and outside them, which is
 * what makes them outliers. Counting them cannot identify them: Plot draws a
 * facet's dot group only where that facet has any.
 *
 * @param dot - The candidate outlier mark.
 * @param bar - The composite's interquartile boxes.
 * @returns True when every dot sits on a box's category, beyond the box.
 */
function isOutlierMark(dot: Element, bar: Element): boolean {
  const dots = leafElements(dot).map(centreOf).filter((one): one is Point => one !== null);
  const boxes = leafElements(bar).map(boxOf).filter((box): box is Box => box !== null);
  if (dots.length === 0 || boxes.length === 0)
    return false;

  // Beyond the box on the axis the distribution runs along, and on it on the
  // other — whichever way round the box plot was drawn.
  return dots.every(point => boxes.some(box =>
    (within(box.x, point.x) && !within(box.y, point.y))
    || (within(box.y, point.y) && !within(box.x, point.x))));
}

/** A rectangle's extent along both axes. */
interface Box {
  x: [number, number];
  y: [number, number];
}

/** A straight mark: a point on one axis and an extent on the other. */
interface Segment {
  x: [number, number];
  y: [number, number];
}

/** A dot's centre. */
interface Point {
  x: number;
  y: number;
}

/** Reads a `<rect>`'s extent, or `null` when it is not one. */
function boxOf(element: Element): Box | null {
  const x = numberOf(element, 'x');
  const y = numberOf(element, 'y');
  const width = numberOf(element, 'width');
  const height = numberOf(element, 'height');
  if (x === null || y === null || width === null || height === null)
    return null;
  return { x: [x, x + width], y: [y, y + height] };
}

/** Reads a `<line>`'s extent, or `null` when it is not one. */
function segmentOf(element: Element): Segment | null {
  const x1 = numberOf(element, 'x1');
  const x2 = numberOf(element, 'x2');
  const y1 = numberOf(element, 'y1');
  const y2 = numberOf(element, 'y2');
  if (x1 === null || x2 === null || y1 === null || y2 === null)
    return null;
  return { x: [Math.min(x1, x2), Math.max(x1, x2)], y: [Math.min(y1, y2), Math.max(y1, y2)] };
}

/** Reads a `<circle>`'s centre, or `null` when it is not one. */
function centreOf(element: Element): Point | null {
  const x = numberOf(element, 'cx');
  const y = numberOf(element, 'cy');
  return x === null || y === null ? null : { x, y };
}

/** Reads a numeric attribute. */
function numberOf(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null)
    return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Half a pixel of slack, for marks drawn on a shared edge. */
const SLACK = 0.5;

/** The middle of a range. */
function midpoint(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/** Whether a value lies within a range. */
function within(range: [number, number], value: number): boolean {
  return value >= range[0] - SLACK && value <= range[1] + SLACK;
}

/** Whether two ranges overlap along an axis. */
function spans(range: [number, number], other: [number, number]): boolean {
  return other[0] <= range[1] + SLACK && other[1] >= range[0] - SLACK;
}

/**
 * Every drawn element of a mark, from inside its facet groups when it has any.
 *
 * A faceted mark's children are facets rather than marks, so counting or
 * reading them directly answers a different question from the one asked.
 *
 * @param group - A mark group.
 * @returns The mark's leaf elements.
 */
function leafElements(group: Element): Element[] {
  const facets = facetGroupsOf(group);
  if (facets.length > 0)
    return facets.flatMap(facet => Array.from(facet.children));
  return Array.from(group.children);
}

/**
 * A mark's facet containers, or none when the mark is not faceted.
 *
 * Plot nests each facet's elements in a translated `<g>`, so a mark is faceted
 * when *every* child is a group; a mixed set means the groups are part of the
 * mark itself — an axis tick's line and label, say — rather than facet
 * containers.
 *
 * Three separate readings turn on that distinction: what a mark's leaf elements
 * are, how it splits into facets, and where Plot wrote the styling that says a
 * `tick` is a box plot's median (#1074). They have to agree, so the rule lives
 * here rather than being spelled out at each of them.
 *
 * @param group - A mark group.
 * @returns The facet groups, or an empty array when the mark has none.
 */
export function facetGroupsOf(group: Element): Element[] {
  const children = Array.from(group.children);
  const facets = children.filter(child => child.tagName.toLowerCase() === 'g');
  return facets.length > 0 && facets.length === children.length ? facets : [];
}

/**
 * One facet's share of a mark, and where on the canvas it was drawn.
 *
 * A faceted plot nests each facet's elements in a translated `<g>` inside the
 * mark group; an unfaceted one puts the elements directly in the group. Both
 * come back through here, the second as a single facet whose offset is zero,
 * so callers need no special case.
 */
export interface MarkFacet {
  /** Horizontal offset of the facet, used to match it to an `fx` band. */
  offsetX: number;
  /** Vertical offset of the facet, used to match it to an `fy` band. */
  offsetY: number;
  /** The mark's drawn elements within this facet, in document order. */
  elements: Element[];
}

/**
 * Splits a mark group into facets.
 *
 * @param group - A group returned by {@link findMarkGroups}.
 * @returns One entry per facet, or a single entry for an unfaceted mark.
 */
export function splitFacets(group: Element): MarkFacet[] {
  const facetGroups = facetGroupsOf(group);
  if (facetGroups.length > 0) {
    return facetGroups.map((facet) => {
      const [offsetX, offsetY] = translateOf(facet);
      return { offsetX, offsetY, elements: Array.from(facet.children) };
    });
  }

  return [{ offsetX: 0, offsetY: 0, elements: Array.from(group.children) }];
}

/**
 * Reads an element's `transform="translate(x, y)"` offset.
 *
 * Plot positions facets, tick labels, and non-circular dot symbols with a
 * translate, so this is how each of them is located. The arguments are parsed
 * by splitting rather than by one regular expression, which keeps a
 * pathological `transform` attribute from costing more than a scan of it.
 *
 * @param element - The element to read.
 * @returns The `[x, y]` offset, or `null` when there is no translate.
 */
export function parseTranslate(element: Element): [number, number] | null {
  const transform = element.getAttribute('transform');
  if (!transform)
    return null;
  const match = /translate\(([^)]*)\)/.exec(transform);
  if (!match)
    return null;

  const parts = match[1].split(/[\s,]+/).filter(part => part.length > 0).map(Number.parseFloat);
  if (parts.length === 0 || !Number.isFinite(parts[0]))
    return null;
  const y = parts.length > 1 && Number.isFinite(parts[1]) ? parts[1] : 0;
  return [parts[0], y];
}

/**
 * Reads an element's translate offset, treating a missing one as no offset.
 *
 * @param element - The element to read.
 * @returns The `[x, y]` offset, defaulting to `[0, 0]`.
 */
function translateOf(element: Element): [number, number] {
  return parseTranslate(element) ?? [0, 0];
}

/** Returns an element's trimmed text, or `undefined` when it has none. */
function textOf(element: Element | null): string | undefined {
  const text = element?.textContent?.trim();
  return text || undefined;
}
