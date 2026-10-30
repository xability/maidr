/**
 * Splits the path plotly draws a box with into the parts MAIDR highlights.
 *
 * Plotly draws a box -- its median, body, whiskers and caps -- as the
 * subpaths of one `path.box`, in that order (`plotBoxAndWhiskers` in
 * plotly.js 2.35.2). On a vertical box:
 *
 *     M x0,median H x1           the median, across the box
 *     M x0,q1 H x1 V q3 H x0 Z   the body; a notched one adds `L` segments
 *     M xc,q1 V lowerFence       the whisker below the body
 *     M xc,q3 V upperFence       the whisker above it
 *     M xw0,lowerFence H xw1     the caps, when `whiskerwidth` is not 0
 *     M xw0,upperFence H xw1
 *
 * A box on its side exchanges x and y, and H and V. A violin's inner box is
 * drawn the same way without caps, and so is a candle: its body runs from
 * the open to the close, and its whiskers are its wicks. No element of the
 * chart is the body, the median or one whisker alone, so a highlight could
 * only outline the whole box, whichever of them was read.
 *
 * Each box is drawn again as hidden parts stamped with `data-maidr-part` and
 * `data-maidr-index` (the box's position among its group's boxes), which the
 * selectors name: the body (`iq`), its two edges across the box (`q1`,
 * `q3`), the median (`q2`), and the caps, or the whiskers where there are
 * none (`min`, `max`). A box drawn in a shape this does not know gets a copy
 * of the whole path for every part, which is the highlight every part had
 * before. The parts are appended to the box's group rather than inserted
 * beside the box, so that no element plotly drew changes its position among
 * its siblings, which the violin selectors count by; and they follow the
 * box's `d`, which plotly rewrites when the chart is zoomed or resized. A box
 * added or taken away comes with data plotly has computed again, which MAIDR
 * reads again (`claimPlotlyExamination`), splitting the boxes afresh.
 */

import { storeMutationObserver } from './normalizer';

/** The parts a box is split into. */
export type BoxPart = 'iq' | 'q1' | 'q2' | 'q3' | 'min' | 'max';

/**
 * Matches the hidden copies MAIDR's highlight makes of a chart's marks, which
 * carry the attributes of the mark they copy. Mirrors the attribute
 * `Svg.markOwned` stamps, which `Svg` keeps private, as the d3 and AnyChart
 * adapters do.
 */
const MAIDR_COPY_SELECTOR = '[data-maidr-owned]';

/** Attribute naming which part of a split box a hidden part is. */
const PART_ATTRIBUTE = 'data-maidr-part';

/** Attribute holding the position of a part's box among its group's boxes. */
const PART_INDEX_ATTRIBUTE = 'data-maidr-index';

/**
 * The selector for one part of one box, drawn by {@link splitBoxes}.
 *
 * MAIDR's hidden copies of a part carry its attributes too, so they are left
 * out, as they would otherwise match as a second part.
 *
 * @param group - The selector of the box's trace group
 * @param index - The box's position among the group's boxes
 * @param part  - Which part
 * @returns A selector matching that one part
 */
export function boxPartSelector(group: string, index: number, part: BoxPart): string {
  return `${group} > [${PART_INDEX_ATTRIBUTE}="${index}"][${PART_ATTRIBUTE}="${part}"]:not(${MAIDR_COPY_SELECTOR})`;
}

const ALL_PARTS: readonly BoxPart[] = ['iq', 'q1', 'q2', 'q3', 'min', 'max'];

/** A straight segment, in the coordinates of the box's group. */
interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** What a part draws: a path's `d`, or a straight segment. */
type PartShape = string | Segment;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A number in a path's arguments, as plotly writes one. */
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** The parts made for each box, by the box. */
const madeParts = new WeakMap<Element, Map<BoxPart, SVGElement>>();

/** The observer following the boxes' `d` in each group. */
const followers = new WeakMap<Element, MutationObserver>();

/**
 * The numbers in a path's argument list.
 * @param text - The arguments
 * @returns Them, in order
 */
function numbers(text: string): number[] {
  return (text.match(NUMBER) ?? []).map(Number);
}

/**
 * Reads a subpath drawn as one straight segment, `M x,y H x2` or `M x,y V y2`.
 * @param subpath - The subpath
 * @returns The command that drew it and its ends, or null for any other shape
 */
function straight(subpath: string): { command: 'H' | 'V'; segment: Segment } | null {
  const found = /^M([^HV]*)([HV])([^HV]*)$/.exec(subpath.trim());
  if (!found) {
    return null;
  }
  const start = numbers(found[1]);
  const to = numbers(found[3]);
  if (start.length !== 2 || to.length !== 1) {
    return null;
  }
  const command = found[2] as 'H' | 'V';
  const [x1, y1] = start;
  return {
    command,
    segment: command === 'H'
      ? { x1, y1, x2: to[0], y2: y1 }
      : { x1, y1, x2: x1, y2: to[0] },
  };
}

/**
 * The segments a closed subpath draws with one command, in drawing order.
 * @param subpath - The body's subpath
 * @param command - `H` or `V`
 * @returns The segments that command drew
 */
function segmentsDrawnBy(subpath: string, command: 'H' | 'V'): Segment[] {
  const segments: Segment[] = [];
  let x = 0;
  let y = 0;
  for (const step of subpath.match(/[MHVLZ][^MHVLZ]*/g) ?? []) {
    const args = numbers(step.slice(1));
    switch (step[0]) {
      case 'M':
      case 'L':
        [x, y] = args;
        break;
      case 'H':
        if (command === 'H') {
          segments.push({ x1: x, y1: y, x2: args[0], y2: y });
        }
        x = args[0];
        break;
      case 'V':
        if (command === 'V') {
          segments.push({ x1: x, y1: y, x2: x, y2: args[0] });
        }
        y = args[0];
        break;
      default:
        break;
    }
  }
  return segments;
}

/**
 * Reads the parts of a box out of the path plotly drew it with.
 *
 * @param d - The box's `d`
 * @returns Each part's shape, or null when the path is not in the shape plotly
 * draws a box in
 */
export function boxParts(d: string): Map<BoxPart, PartShape> | null {
  // Plotly writes a box with absolute commands only.
  if (!/^(?:[MHVLZ][-+\d.,e\s]*)+$/.test(d.trim())) {
    return null;
  }
  const subpaths: string[] = d.trim().match(/M[^M]*/g) ?? [];
  if (![2, 4, 6].includes(subpaths.length)) {
    return null;
  }

  // The median runs across the box, and so do the body's two edges at the
  // quartiles, first the lower quartile's and then the upper one's.
  const median = straight(subpaths[0]);
  if (!median || !/Z\s*$/.test(subpaths[1])) {
    return null;
  }
  const edges = segmentsDrawnBy(subpaths[1], median.command);
  if (edges.length !== 2) {
    return null;
  }
  const parts = new Map<BoxPart, PartShape>([
    ['iq', subpaths[1].trim()],
    ['q1', edges[0]],
    ['q2', median.segment],
    ['q3', edges[1]],
  ]);

  // The last two subpaths are the lower and the upper caps, or the whiskers
  // when no caps are drawn; a box drawn without whiskers has neither.
  if (subpaths.length > 2) {
    const lower = straight(subpaths[subpaths.length - 2]);
    const upper = straight(subpaths[subpaths.length - 1]);
    if (!lower || !upper) {
      return null;
    }
    parts.set('min', lower.segment);
    parts.set('max', upper.segment);
  }
  return parts;
}

/**
 * Whether an element is a box plotly drew, as opposed to a part or a copy.
 * @param element - A child of a box's group
 * @returns True for plotly's own `path.box`
 */
function isPlotlyBox(element: Element): boolean {
  return element.tagName.toLowerCase() === 'path'
    && element.classList.contains('box')
    && !element.matches(MAIDR_COPY_SELECTOR);
}

/**
 * Creates one hidden part, styled as its box so that a highlight takes its
 * colour from the chart's own.
 * @param box   - The box the part is cut from
 * @param index - The box's position among its group's boxes
 * @param name  - Which part it is
 * @param shape - What it draws
 * @returns The new, detached part
 */
function createPart(box: Element, index: number, name: BoxPart, shape: PartShape): SVGElement {
  const part = box.ownerDocument.createElementNS(
    SVG_NS,
    typeof shape === 'string' ? 'path' : 'line',
  ) as SVGElement;
  part.setAttribute('style', box.getAttribute('style') ?? '');
  part.setAttribute('visibility', 'hidden');
  part.setAttribute('pointer-events', 'none');
  part.setAttribute(PART_INDEX_ATTRIBUTE, String(index));
  part.setAttribute(PART_ATTRIBUTE, name);
  return part;
}

/**
 * Sets an attribute only when it changes, so that following a box's `d` does
 * not record a change of its own.
 * @param element - The element
 * @param name    - The attribute
 * @param value   - Its value
 */
function setIfChanged(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * Makes, or brings up to date, the parts of one box.
 * @param group - The box's group, which the parts are appended to
 * @param box   - The box
 * @param index - Its position among the group's boxes
 */
function drawParts(group: Element, box: Element, index: number): void {
  const d = box.getAttribute('d') ?? '';
  const shapes = boxParts(d) ?? new Map<BoxPart, PartShape>(
    ALL_PARTS.map((name): [BoxPart, PartShape] => [name, d]),
  );

  const made = madeParts.get(box) ?? new Map<BoxPart, SVGElement>();
  madeParts.set(box, made);
  for (const [name, shape] of shapes) {
    let part = made.get(name);
    const tag = typeof shape === 'string' ? 'path' : 'line';
    if (!part || !part.isConnected || part.tagName.toLowerCase() !== tag) {
      part?.remove();
      part = createPart(box, index, name, shape);
      made.set(name, part);
      group.appendChild(part);
    }
    setIfChanged(part, PART_INDEX_ATTRIBUTE, String(index));
    if (typeof shape === 'string') {
      setIfChanged(part, 'd', shape);
    } else {
      setIfChanged(part, 'x1', String(shape.x1));
      setIfChanged(part, 'y1', String(shape.y1));
      setIfChanged(part, 'x2', String(shape.x2));
      setIfChanged(part, 'y2', String(shape.y2));
    }
  }
  // A part the box no longer has: a whisker the chart stopped drawing.
  for (const [name, part] of made) {
    if (!shapes.has(name)) {
      part.remove();
      made.delete(name);
    }
  }
}

/**
 * Splits every box plotly drew in one trace's group into the parts the
 * selectors name, and keeps them in step with the boxes from then on.
 *
 * Safe to run again: the parts already made are brought up to date rather
 * than made twice, and those of a box that is gone are removed.
 *
 * @param group - The trace's `g` in plotly's box or violin layer
 */
export function splitBoxes(group: Element): void {
  const boxes = Array.from(group.children).filter(isPlotlyBox);
  boxes.forEach((box, index) => drawParts(group, box, index));

  const kept = new Set<Element>(boxes.flatMap(box => [...(madeParts.get(box)?.values() ?? [])]));
  for (const part of Array.from(group.querySelectorAll(`:scope > [${PART_ATTRIBUTE}]:not(${MAIDR_COPY_SELECTOR})`))) {
    if (!kept.has(part)) {
      part.remove();
    }
  }

  if (typeof MutationObserver === 'undefined') {
    return;
  }
  let follower = followers.get(group);
  if (!follower) {
    follower = new MutationObserver((records) => {
      if (records.some(record => isPlotlyBox(record.target as Element))) {
        splitBoxes(group);
      }
    });
    followers.set(group, follower);
  }
  // Observing again changes nothing while it follows, and starts it again
  // once `disconnectPlotlyObservers` has stopped it; it is stored with the
  // adapter's other observers for that, and dropped with them once the group
  // leaves the page.
  follower.observe(group, { attributes: true, attributeFilter: ['d'], subtree: true });
  storeMutationObserver(group, follower);
}
