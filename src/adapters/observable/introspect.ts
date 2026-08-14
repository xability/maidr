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
  return element.querySelector('svg');
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
 * Finds the mark groups that make up a box plot, so they can be left alone.
 *
 * `Plot.boxY` is not a mark but four of them — a `rule` for the whiskers, a
 * `bar` for the interquartile box, a `tick` for the median, and a `dot` for the
 * outliers — and nothing in the DOM says they belong together. Read
 * individually they are worse than unreadable: the `bar` is a perfectly
 * ordinary bar mark whose height is `q3 - q1`, so a reader is told a number
 * that appears nowhere in the data and never hears the median or the whiskers
 * at all.
 *
 * The composite is recognised by its parts arriving together with one element
 * each per distribution. A baseline `ruleY([0])` alongside a bar chart draws a
 * single line however many bars there are, so it does not match.
 *
 * @param groups - The plot's mark groups, in draw order.
 * @returns Indices of the groups that form box plots.
 */
export function boxCompositeGroups(
  groups: readonly { label: string; group: Element }[],
): Set<number> {
  const skip = new Set<number>();
  const find = (label: string): number => groups.findIndex((entry, index) =>
    entry.label === label && !skip.has(index));

  const rule = find('rule');
  const bar = find('bar');
  const tick = find('tick');
  if (rule < 0 || bar < 0 || tick < 0)
    return skip;

  const count = groups[bar].group.children.length;
  if (count === 0
    || groups[rule].group.children.length !== count
    || groups[tick].group.children.length !== count) {
    return skip;
  }

  skip.add(rule).add(bar).add(tick);
  // The outliers, when the data has any: a dot mark drawn after the box with
  // one element per distribution. A scatter of its own would not sit here.
  const dot = groups.findIndex((entry, index) =>
    entry.label === 'dot' && index > tick && entry.group.children.length === count);
  if (dot >= 0)
    skip.add(dot);

  return skip;
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
  const children = Array.from(group.children);
  const facetGroups = children.filter(child => child.tagName.toLowerCase() === 'g');

  // A mark is faceted when *every* child is a group; a mixed set means the
  // groups are part of the mark itself (an axis tick's line and label, say)
  // rather than facet containers.
  if (facetGroups.length > 0 && facetGroups.length === children.length) {
    return facetGroups.map((facet) => {
      const [offsetX, offsetY] = translateOf(facet);
      return { offsetX, offsetY, elements: Array.from(facet.children) };
    });
  }

  return [{ offsetX: 0, offsetY: 0, elements: children }];
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
