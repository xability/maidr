import type { BoxSelector, MaidrLayer } from '@type/grammar';
import type { NivoLayerInfo, NivoMarks } from './types';
import { cssEscape } from '@adapters/shared/selectorUtil';

/**
 * Data-attribute prefix for the marks this adapter tags itself — the ones
 * Nivo stamps with nothing that covers every configuration (line strokes,
 * scatter nodes).
 */
const ATTR_PREFIX = 'data-maidr-nivo';

/** Tagged on every element of line series `s`: its point markers, or its stroke. */
export const LINE_ATTR = `${ATTR_PREFIX}-line`;

/** Tagged on every scatter node, valued with the index of the layer it belongs to. */
export const NODE_ATTR = `${ATTR_PREFIX}-node`;

/**
 * True when an element is (or lives inside) a MAIDR-created hidden clone.
 *
 * MAIDR's `Svg` helpers stamp every highlight clone with `data-maidr-owned`
 * and insert it beside the original while a figure is focused. `cloneNode`
 * keeps Nivo's `data-testid` and every tag of ours, so a clone is otherwise
 * indistinguishable from the mark it copies, and every lookup here skips it.
 *
 * @param el - The element
 * @returns Whether MAIDR made it
 */
function isMaidrOwned(el: Element): boolean {
  return el.closest('[data-maidr-owned]') !== null;
}

/**
 * The chart's own marks matching a selector, clones excluded.
 *
 * @param root - Where to look
 * @param selector - The CSS selector
 * @returns The matches, in document order
 */
function liveMatches(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector)).filter(el => !isMaidrOwned(el));
}

/**
 * A selector naming the element Nivo stamped with a `data-testid`.
 *
 * @param scope - The chart's scope prefix, e.g. `'#chart '`
 * @param testId - The test id Nivo writes (`bar.item.sales.0`)
 * @returns The selector
 */
export function testIdSelector(scope: string, testId: string): string {
  return `${scope}[data-testid="${cssEscape(testId)}"]`;
}

/**
 * The selectors for one box of a box plot.
 *
 * Nivo draws each box as one `<g data-key="boxplot.<group>.<subGroup>">`
 * holding, in order: the interquartile `<rect>`, the median `<line>`, then
 * for the lower and the upper whisker a stem `<line>` followed — unless
 * `whiskerEndSize` is 0 — by its cap `<line>`. The whisker's far end is its
 * cap when there is one and its stem otherwise.
 *
 * A horizontal box is that same vertical box inside a group transformed with
 * `rotate(-90)`. The core derives the Q1 and Q3 highlights from the edges of
 * the `iq` element's bounding box, which it measures in the element's own,
 * unrotated coordinates — so for a horizontal layer it would take the box's
 * local left and right edges, which the rotation lays along the top and
 * bottom on screen. Such a box names its body for Q1 and Q3 outright, which
 * the core outlines as drawn, rotation and all.
 *
 * @param scope - The chart's scope prefix
 * @param key - The box's `data-key`
 * @param whiskerCaps - Whether Nivo draws whisker caps
 * @param horizontal - Whether the box is drawn rotated
 * @returns The box's selector
 */
function boxSelector(scope: string, key: string, whiskerCaps: boolean, horizontal: boolean): BoxSelector {
  const box = `${scope}[data-key="${cssEscape(key)}"]`;
  const line = (n: number): string => `${box} > line:nth-of-type(${n})`;
  const body = `${box} > rect`;
  return {
    lowerOutliers: [],
    min: line(whiskerCaps ? 3 : 2),
    iq: body,
    q2: line(1),
    max: line(whiskerCaps ? 5 : 3),
    upperOutliers: [],
    ...(horizontal ? { q1: body, q3: body } : {}),
  };
}

/**
 * The selectors for the marks Nivo stamps itself, built from the props alone.
 *
 * - A single bar series names each bar, one entry per payload point.
 * - A stacked or grouped chart names each cell, `[series][category]`, `null`
 *   where Nivo drew no bar.
 * - A pie names its arcs in one selector list, which resolves in document
 *   order — data order — and so is emitted only while that is the order the
 *   slices are laid out in.
 * - A heat map names each cell; the grid runs bottom row first, the reverse of
 *   `data.points`, which is how `Heatmap` indexes it.
 * - A box plot names each part of each box.
 *
 * @param marks - How the layer's marks are found
 * @param scope - The chart's scope prefix
 * @returns The selectors, or undefined for marks only tagging can name
 */
export function stampedSelectors(marks: NivoMarks, scope: string): MaidrLayer['selectors'] | undefined {
  switch (marks.kind) {
    case 'bar':
      return marks.testIds.map(id => testIdSelector(scope, id));
    case 'barGrid':
      return marks.testIds.map(row => row.map(id => (id === null ? null : testIdSelector(scope, id))));
    case 'arcs':
      return marks.ordered
        ? marks.testIds.map(id => testIdSelector(scope, id)).join(', ')
        : undefined;
    case 'cells':
      return [...marks.testIds].reverse().map(row => row.map(id => (id === null ? null : testIdSelector(scope, id))));
    case 'boxes':
      return marks.keys.map(key => boxSelector(scope, key, marks.whiskerCaps, marks.horizontal));
    case 'lines':
    case 'nodes':
      return undefined;
  }
}

/**
 * Every selector string a layer's selectors contain.
 *
 * @param selectors - A layer's selectors
 * @returns The strings, flattened
 */
function selectorStrings(selectors: MaidrLayer['selectors']): string[] {
  if (typeof selectors === 'string')
    return [selectors];
  if (!Array.isArray(selectors)) {
    return selectors
      ? Object.values(selectors).flat().filter((one): one is string => typeof one === 'string')
      : [];
  }
  return (selectors as unknown[]).flatMap((entry): string[] => {
    if (typeof entry === 'string')
      return [entry];
    if (Array.isArray(entry))
      return entry.filter((one): one is string => typeof one === 'string');
    if (entry !== null && typeof entry === 'object')
      return Object.values(entry).flat().filter((one): one is string => typeof one === 'string');
    return [];
  });
}

/**
 * Whether every selector of a stamped layer finds its mark in the container
 * — and, for a pie, one mark per slice.
 *
 * A grid or a box selector that half resolves is declined whole by the core,
 * so a chart still being drawn (a `Responsive*` chart before it has measured
 * its parent) is reported as unresolved rather than emitted early.
 *
 * @param container - The chart's container
 * @param marks - How the layer's marks are found
 * @param selectors - The stamped selectors
 * @returns Whether they all resolve
 */
function stampedResolve(container: HTMLElement, marks: NivoMarks, selectors: MaidrLayer['selectors']): boolean {
  if (marks.kind === 'arcs')
    return liveMatches(container, selectors as string).length === marks.testIds.length;
  return selectorStrings(selectors).every(selector => liveMatches(container, selector).length > 0);
}

/**
 * Tags a line chart's series and returns one selector per series.
 *
 * The point markers are preferred: Nivo stamps each with
 * `data-testid="line.point.<series>.<n>"`, and one element per reading is
 * what the line trace pairs most exactly. Without them (`enablePoints` off,
 * or a `layers` list leaving them out) each series' stroke is tagged instead
 * — the one `<path fill="none">` Nivo draws per series, in the **reverse** of
 * data order, so that the first series is painted on top (measured on 0.99).
 *
 * @param svg - The chart's svg
 * @param marks - The line layer's marks
 * @param scope - The chart's scope prefix
 * @returns One selector per series, or undefined when the marks are not all there
 */
function tagLines(svg: Element, marks: Extract<NivoMarks, { kind: 'lines' }>, scope: string): string[] | undefined {
  const selectors = Array.from({ length: marks.seriesCount }, (_, s) => `${scope}[${LINE_ATTR}="${s}"]`);

  if (marks.points) {
    const found = marks.points.map(ids => ids.map(id => liveMatches(svg, `[data-testid="${cssEscape(id)}"]`)[0]));
    if (found.every(series => series.every(el => el !== undefined))) {
      found.forEach((series, s) => series.forEach(el => el.setAttribute(LINE_ATTR, String(s))));
      return selectors;
    }
  }

  const strokes = liveMatches(svg, 'path[fill="none"]')
    .filter(path => path.closest('defs, clipPath, marker, symbol, pattern, mask') === null);
  if (strokes.length !== marks.seriesCount)
    return undefined;
  strokes.reverse().forEach((path, s) => path.setAttribute(LINE_ATTR, String(s)));
  return selectors;
}

/**
 * Containers whose scatter nodes have been counted once. Only that first
 * count, taken as the chart first draws, is reported on: after a data change
 * react-spring keeps the leaving nodes in the DOM until they have shrunk away,
 * so a later mismatch can be a transition rather than a chart that never fits.
 */
const countedNodes = new WeakSet<Element>();

/**
 * The `<circle>`s drawn directly under the plot's `<g>`, which is where
 * `@nivo/scatterplot` renders its nodes layer (a fragment of circles). A
 * legend's circle symbols sit in groups of their own further down, and so are
 * not among them.
 *
 * @param svg - The chart's svg
 * @returns The circles, in document order, clones excluded
 */
function plotCircles(svg: Element): Element[] {
  return Array.from(svg.children)
    .filter(child => child.tagName.toLowerCase() === 'g')
    .flatMap(plot => Array.from(plot.children))
    .filter(child => child.tagName.toLowerCase() === 'circle' && !isMaidrOwned(child));
}

/**
 * Tags the scatter nodes of every layer at once and returns each layer's
 * selector.
 *
 * Nivo's nodes carry no attribute naming their datum, so they are found by
 * position: one `<circle>` per datum of every visible series, series by
 * series, in data order, directly under the plot's `<g>`. The count has to
 * match exactly; a custom `nodeComponent` or an annotation drawn with circles
 * changes it, and the layers then go without a highlight — said once in the
 * console — rather than outlining the wrong node.
 *
 * @param container - The chart's container
 * @param svg - The chart's svg
 * @param layers - The chart's layers, scatter or not
 * @param scope - The chart's scope prefix
 * @returns Each layer's selector, by index; undefined for any not tagged
 */
function tagNodes(container: HTMLElement, svg: Element, layers: NivoLayerInfo[], scope: string): (string | undefined)[] {
  const circles = plotCircles(svg);
  const expected = layers.find(layer => layer.marks.kind === 'nodes')?.marks;
  if (expected?.kind === 'nodes' && circles.length > 0 && !countedNodes.has(container)) {
    countedNodes.add(container);
    if (circles.length !== expected.drawn) {
      console.warn(
        `MAIDR: this Nivo scatter plot draws ${circles.length} nodes where its data has `
        + `${expected.drawn}, so its points cannot be matched to them and are not highlighted. `
        + 'A custom nodeComponent or circle annotations cause this.',
      );
    }
  }
  return layers.map((layer, index) => {
    const { marks } = layer;
    if (marks.kind !== 'nodes' || circles.length !== marks.drawn)
      return undefined;
    for (const kept of marks.kept)
      circles[marks.offset + kept].setAttribute(NODE_ATTR, String(index));
    return `${scope}[${NODE_ATTR}="${index}"]`;
  });
}

/** Containers already told that their chart is drawn on a canvas. */
const warnedCanvas = new WeakSet<Element>();

/**
 * Resolves the selectors of every layer of one chart against its rendered
 * DOM, tagging the marks Nivo does not stamp itself.
 *
 * A layer whose marks are not all there yet — a `Responsive*` chart renders
 * nothing until it has measured its parent — gets no selectors; the caller
 * tries again once the DOM changes.
 *
 * @param container - The element the chart is rendered in
 * @param layers - The chart's extracted layers
 * @param scope - The chart's scope prefix, e.g. `'#chart '`
 * @returns Each layer's selectors, by index; undefined where unresolved
 */
export function resolveNivoSelectors(
  container: HTMLElement,
  layers: NivoLayerInfo[],
  scope: string,
): (MaidrLayer['selectors'] | undefined)[] {
  const svg = liveMatches(container, 'svg')[0];
  if (!svg) {
    // The `*Canvas` components draw into a <canvas>, with nothing to outline.
    if (layers.length > 0 && container.querySelector('canvas') && !warnedCanvas.has(container)) {
      warnedCanvas.add(container);
      console.warn(
        'MAIDR: this Nivo chart is drawn on a <canvas>, so its marks cannot be '
        + 'highlighted. Audio, text and braille still work; use the SVG '
        + 'component (e.g. ResponsiveBar rather than ResponsiveBarCanvas) for the highlight.',
      );
    }
    return layers.map(() => undefined);
  }

  const nodeSelectors = layers.some(layer => layer.marks.kind === 'nodes')
    ? tagNodes(container, svg, layers, scope)
    : [];

  return layers.map((layer, index) => {
    const { marks } = layer;
    if (marks.kind === 'lines')
      return tagLines(svg, marks, scope);
    if (marks.kind === 'nodes')
      return nodeSelectors[index];
    const selectors = stampedSelectors(marks, scope);
    return selectors && stampedResolve(container, marks, selectors) ? selectors : undefined;
  });
}

/**
 * Every element currently carrying one of this adapter's tags.
 *
 * @param container - The chart's container
 * @returns The tagged elements, clones excluded
 */
export function getTaggedElements(container: HTMLElement): Element[] {
  return liveMatches(container, `[${LINE_ATTR}], [${NODE_ATTR}]`);
}

/**
 * Removes this adapter's tags from the container, so a re-tag after Nivo
 * re-renders never leaves a stale one behind.
 *
 * @param container - The chart's container
 */
export function clearTaggedElements(container: HTMLElement): void {
  for (const el of getTaggedElements(container)) {
    el.removeAttribute(LINE_ATTR);
    el.removeAttribute(NODE_ATTR);
  }
}

/**
 * A cheap signature of what the chart has drawn: whether there is an svg (or
 * only a canvas) and how many elements of its own the svg holds.
 *
 * A pass that could not name every layer's marks is only worth repeating
 * once this changes. Without it, a layer that never resolves — a `*Canvas`
 * chart, a pie laid out by value, nodes that never match their count — would
 * have every later mutation in the container re-run the whole pass, and Nivo
 * mounts its tooltip inside that container on every hover. The tooltip lives
 * outside the svg, and MAIDR's own copies are not counted, so neither changes
 * the signature.
 *
 * @param container - The chart's container
 * @returns The signature
 */
export function drawnSignature(container: HTMLElement): string {
  const svg = liveMatches(container, 'svg')[0];
  if (!svg)
    return container.querySelector('canvas') ? 'canvas' : 'none';
  const all = svg.getElementsByTagName('*').length;
  const copies = svg.querySelectorAll('[data-maidr-owned], [data-maidr-owned] *').length;
  return `svg:${all - copies}`;
}

/**
 * The attributes that place a mark, which Nivo (through react-spring) moves
 * a mark by — on a resize, or while it animates in — without replacing it.
 */
export const GEOMETRY_ATTRIBUTES: readonly string[] = [
  'x',
  'y',
  'width',
  'height',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'transform',
];

/** The attributes that say which mark an element is. */
const IDENTITY_ATTRIBUTES = ['data-testid', 'data-key', LINE_ATTR, NODE_ATTR];

/**
 * Whether a MAIDR copy was made from a given mark: the same element type,
 * naming the same mark.
 *
 * @param mark - The chart's own element
 * @param copy - The MAIDR-owned element after it
 * @returns Whether the copy is of that mark
 */
function isCopyOf(mark: Element, copy: Element): boolean {
  if (mark.tagName !== copy.tagName)
    return false;
  const named = IDENTITY_ATTRIBUTES.filter(attr => mark.hasAttribute(attr));
  return named.length > 0 && named.every(attr => copy.getAttribute(attr) === mark.getAttribute(attr));
}

/**
 * Copies a mark's geometry onto a copy of it, descending through children
 * that line up one for one.
 *
 * @param from - The chart's own element
 * @param to - The copy
 */
function copyGeometry(from: Element, to: Element): void {
  for (const attr of GEOMETRY_ATTRIBUTES) {
    const value = from.getAttribute(attr);
    // Written only on a change: an unchanged write still queues a mutation
    // record, which would wake the observer that called this.
    if (value !== null && to.getAttribute(attr) !== value)
      to.setAttribute(attr, value);
  }
  const fromChildren = from.children;
  const toChildren = to.children;
  if (fromChildren.length !== toChildren.length)
    return;
  for (let i = 0; i < fromChildren.length; i++) {
    if (fromChildren[i].tagName === toChildren[i].tagName)
      copyGeometry(fromChildren[i], toChildren[i]);
  }
}

/**
 * Moves MAIDR's copies of the chart's marks to where the marks now are.
 *
 * MAIDR outlines a mark by copying it when the plot takes focus: a hidden copy
 * straight after the mark, and the visible outline copied from that. Nivo moves
 * a mark by rewriting its attributes rather than replacing it, so after a
 * resize, or when focus arrives while react-spring is still animating the
 * chart in, the copies keep the geometry the mark had when they were made.
 * This carries the mark's geometry over to every copy of it that names the
 * same mark — the ones this adapter's selectors point at — so the next
 * outline, and the one showing, sit on the mark again.
 *
 * Copies of marks that carry no naming attribute (the parts of a box, and the
 * edges and whiskers the core derives from them) are left as they are.
 *
 * @param container - The chart's container
 */
export function syncHighlightCopies(container: HTMLElement): void {
  for (const copy of Array.from(container.querySelectorAll('[data-maidr-owned]'))) {
    if (copy.parentElement?.closest('[data-maidr-owned]'))
      continue;
    let mark = copy.previousElementSibling;
    while (mark && mark.hasAttribute('data-maidr-owned'))
      mark = mark.previousElementSibling;
    if (mark && isCopyOf(mark, copy))
      copyGeometry(mark, copy);
  }
}
