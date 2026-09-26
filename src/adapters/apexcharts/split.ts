/**
 * Splits ApexCharts' composite box plot and candlestick paths into the parts
 * MAIDR highlights.
 *
 * MAIDR highlights a box's interquartile body, its median and each whisker
 * cap separately, and a candle's body and each wick separately. ApexCharts 7
 * draws neither that way:
 *
 * - a **box** is two `path.apexcharts-boxPlot-area` sharing one `j`. The
 *   first is the lower whisker and cap plus the q1-to-median half of the
 *   body; the second the median-to-q3 half plus the upper whisker and cap.
 *   There is no median element and no element spanning q1 to q3, and each
 *   half's bounding box takes in a whisker, so an edge read off it lands at
 *   the minimum or the maximum instead of a quartile.
 * - a **candle** is one `path.apexcharts-candlestick-area` tracing the body
 *   and both wicks in a single outline, whose bounding box runs from the high
 *   to the low.
 *
 * So each is split into sibling paths stamped with
 * `data-maidr-part` / `data-maidr-index`, which the selectors address. The
 * parts are hidden and ignore the pointer: they exist to be cloned by MAIDR's
 * highlight, not to be seen, so the chart looks and behaves exactly as
 * ApexCharts drew it.
 *
 * The geometry is read from the vertex order ApexCharts 7.6.0 writes
 * (`BoxCandleStick.js`), measured in a browser for vertical and horizontal
 * boxes and for candles. A path that does not have that shape is left alone
 * with a warning — its layer keeps its data and loses only that highlight.
 *
 * Splitting is idempotent and keeps up with ApexCharts: re-running it updates
 * the parts it made before instead of adding more, a part whose original has
 * gone is removed, and a change to an original's `d` is mirrored onto its
 * parts. ApexCharts re-creates every node on a resize or an update, which is
 * why the binding re-runs the adapter then.
 */

import { PART_ATTRIBUTE, PART_INDEX_ATTRIBUTE } from './selectors';

/** The parts a box is split into. */
export type BoxPart = 'iq' | 'q1' | 'q2' | 'q3' | 'min' | 'max';

/** The parts a candle is split into. */
export type CandlePart = 'body' | 'wick-high' | 'wick-low';

/** An SVG coordinate pair. */
interface Vertex {
  x: number;
  y: number;
}

/** What {@link applyParts} remembers about the parts it made for one original. */
interface SplitRecord {
  parts: Map<string, SVGElement>;
  observer: MutationObserver | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Vertices ApexCharts 7.6.0 writes per box half and per candle. */
const VERTICES_PER_OUTLINE = 11;

/** Parts made so far, keyed by the original path the first of them follows. */
const records = new WeakMap<Element, SplitRecord>();

/**
 * Reads the vertices of an ApexCharts box or candle outline.
 *
 * The outlines are written with absolute `M` and `L` commands only, so every
 * pair of numbers is one vertex.
 *
 * @param d - The path's `d` attribute
 * @returns The vertices, in path order
 */
export function pathVertices(d: string): Vertex[] {
  const numbers = (d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const vertices: Vertex[] = [];
  for (let k = 0; k + 1 < numbers.length; k += 2) {
    vertices.push({ x: numbers[k], y: numbers[k + 1] });
  }
  return vertices;
}

/**
 * Rounds a coordinate for writing back into a path.
 *
 * @param value - A coordinate
 * @returns The coordinate with at most three decimals
 */
function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Writes a polyline, or a closed polygon, as a path `d`.
 *
 * @param points - The vertices
 * @param close  - Whether to close the outline
 * @returns The `d` attribute
 */
function polyline(points: Vertex[], close = false): string {
  const body = points.map((p, k) => `${k === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  return close ? `${body} Z` : body;
}

/**
 * Computes the parts of one box from its two halves.
 *
 * Both orientations share one vertex order, with the axes exchanged: along
 * the value axis the lower half visits q1, the minimum and the median, the
 * upper half the median, q3 and the maximum.
 *
 * @param lowerD     - The `d` of the first (q1-to-median) half
 * @param upperD     - The `d` of the second (median-to-q3) half
 * @param horizontal - Whether the box is drawn horizontally
 * @returns Each part's `d`, or null when the halves do not have the shape
 */
export function computeBoxParts(
  lowerD: string,
  upperD: string,
  horizontal: boolean,
): Record<BoxPart, string> | null {
  const lower = pathVertices(lowerD);
  const upper = pathVertices(upperD);
  if (lower.length < VERTICES_PER_OUTLINE || upper.length < VERTICES_PER_OUTLINE) {
    return null;
  }

  const value = (p: Vertex): number => (horizontal ? p.x : p.y);
  const cross = (p: Vertex): number => (horizontal ? p.y : p.x);
  const at = (v: number, c: number): Vertex => (horizontal ? { x: v, y: c } : { x: c, y: v });

  // The whisker runs along the value axis and the cap across it; anything
  // else is not the outline this was written for.
  const whiskerAligned = cross(lower[1]) === cross(lower[2]) && cross(upper[3]) === cross(upper[4]);
  const capsAligned = value(lower[3]) === value(lower[4]) && value(upper[5]) === value(upper[6]);
  if (!whiskerAligned || !capsAligned) {
    return null;
  }

  const bodyStart = cross(lower[0]);
  const bodyEnd = cross(lower[7]);
  const q1 = value(lower[0]);
  const min = value(lower[2]);
  const median = value(lower[8]);
  const q3 = value(upper[2]);
  const max = value(upper[4]);

  const across = (v: number, from: number, to: number): string => polyline([at(v, from), at(v, to)]);

  return {
    iq: polyline([at(q1, bodyStart), at(q1, bodyEnd), at(q3, bodyEnd), at(q3, bodyStart)], true),
    q1: across(q1, bodyStart, bodyEnd),
    q2: across(median, bodyStart, bodyEnd),
    q3: across(q3, bodyStart, bodyEnd),
    min: across(min, cross(lower[3]), cross(lower[4])),
    max: across(max, cross(upper[5]), cross(upper[6])),
  };
}

/**
 * Computes the parts of one candle from its outline.
 *
 * The outline runs: top-left, top-centre, high, top-centre, top-right,
 * bottom-right, bottom-centre, low, bottom-centre, bottom-left, top-left.
 *
 * @param d - The candle path's `d`
 * @returns Each part's `d`, or null when the path does not have the shape
 */
export function computeCandleParts(d: string): Record<CandlePart, string> | null {
  const v = pathVertices(d);
  if (v.length < VERTICES_PER_OUTLINE) {
    return null;
  }
  const centre = v[1].x;
  if (v[2].x !== centre || v[6].x !== centre || v[7].x !== centre) {
    return null;
  }

  const left = v[0].x;
  const right = v[4].x;
  const top = v[0].y;
  const bottom = v[5].y;
  return {
    'body': polyline([{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }], true),
    'wick-high': polyline([{ x: centre, y: top }, { x: centre, y: v[2].y }]),
    'wick-low': polyline([{ x: centre, y: bottom }, { x: centre, y: v[7].y }]),
  };
}

/**
 * Creates one hidden part path, painted like the original so MAIDR's
 * highlight derives its colour from the chart's own.
 *
 * @param original - The ApexCharts path the part is cut from
 * @param index    - The box or candle's data index
 * @param part     - Which part it is
 * @param filled   - Whether the part is an area (a body) or a line
 * @returns The new, detached path
 */
function createPart(original: Element, index: string, part: string, filled: boolean): SVGElement {
  const doc = original.ownerDocument;
  const path = doc.createElementNS(SVG_NS, 'path') as SVGElement;
  const stroke = original.getAttribute('stroke');
  const strokeWidth = original.getAttribute('stroke-width');
  const fill = original.getAttribute('fill');
  if (stroke) {
    path.setAttribute('stroke', stroke);
  }
  path.setAttribute('stroke-width', strokeWidth ?? '1');
  path.setAttribute('fill', filled && fill ? fill : 'none');
  path.setAttribute('visibility', 'hidden');
  path.setAttribute('pointer-events', 'none');
  path.setAttribute(PART_INDEX_ATTRIBUTE, index);
  path.setAttribute(PART_ATTRIBUTE, part);
  return path;
}

/**
 * Makes, or brings up to date, the parts of one box or candle.
 *
 * @param anchor   - The original the parts are inserted after, and keyed by
 * @param watched  - The originals whose `d` the parts are computed from
 * @param index    - The box or candle's data index
 * @param compute  - Computes every part's `d` from the originals, or null
 * @param filled   - Which parts are areas rather than lines
 * @returns Whether the parts could be computed
 */
function applyParts(
  anchor: Element,
  watched: Element[],
  index: string,
  compute: () => Record<string, string> | null,
  filled: ReadonlySet<string>,
): boolean {
  const parts = compute();
  if (!parts) {
    return false;
  }

  let record = records.get(anchor);
  if (!record) {
    record = { parts: new Map(), observer: null };
    records.set(anchor, record);
  }

  // Inserted after the anchor in order, so the parts follow it in document
  // order and each part's own hidden highlight copy lands right after it.
  let previous: Element = anchor;
  for (const [name, d] of Object.entries(parts)) {
    let path = record.parts.get(name);
    if (!path || !path.isConnected) {
      path = createPart(anchor, index, name, filled.has(name));
      record.parts.set(name, path);
      previous.insertAdjacentElement('afterend', path);
    }
    path.setAttribute('d', d);
    previous = path;
  }

  if (!record.observer && typeof MutationObserver !== 'undefined') {
    const current = record;
    // ApexCharts animates `d` in place on some updates; the parts follow.
    current.observer = new MutationObserver(() => {
      const next = compute();
      if (!next) {
        return;
      }
      for (const [name, d] of Object.entries(next)) {
        current.parts.get(name)?.setAttribute('d', d);
      }
    });
    for (const element of watched) {
      current.observer.observe(element, { attributes: true, attributeFilter: ['d'] });
    }
  }
  return true;
}

/**
 * Removes parts in a series group that no longer belong to a live original —
 * left behind when ApexCharts replaced the paths but kept the group.
 *
 * @param group - The series group
 * @param keep  - The parts made for the originals present now
 */
function removeOrphans(group: Element, keep: ReadonlySet<Element>): void {
  group.querySelectorAll(`[${PART_ATTRIBUTE}]:not([data-maidr-owned])`).forEach((element) => {
    if (!keep.has(element)) {
      element.remove();
    }
  });
}

/**
 * The parts recorded for an original, as a set.
 *
 * @param anchor - The original
 * @returns Its parts, or an empty set
 */
function partsOf(anchor: Element): Element[] {
  return [...(records.get(anchor)?.parts.values() ?? [])];
}

/**
 * Groups a series' ApexCharts paths by their data index `j`, in document
 * order, skipping MAIDR's own hidden copies.
 *
 * @param group     - The series group
 * @param className - The paths' class, e.g. `apexcharts-boxPlot-area`
 * @returns The paths of each index
 */
function pathsByIndex(group: Element, className: string): Map<string, Element[]> {
  const byIndex = new Map<string, Element[]>();
  group.querySelectorAll(`path.${className}:not([data-maidr-owned])`).forEach((path) => {
    const j = path.getAttribute('j');
    if (j === null) {
      return;
    }
    const list = byIndex.get(j) ?? [];
    list.push(path);
    byIndex.set(j, list);
  });
  return byIndex;
}

/**
 * Splits every box of one box plot series.
 *
 * @param group      - The series' `g.apexcharts-series`
 * @param horizontal - Whether the boxes are drawn horizontally
 * @returns The data indices whose box could not be split
 */
export function splitBoxes(group: Element, horizontal: boolean): string[] {
  const failed: string[] = [];
  const keep = new Set<Element>();
  for (const [j, halves] of pathsByIndex(group, 'apexcharts-boxPlot-area')) {
    const [lower, upper] = halves;
    const ok = halves.length === 2 && applyParts(
      upper,
      [lower, upper],
      j,
      () => computeBoxParts(lower.getAttribute('d') ?? '', upper.getAttribute('d') ?? '', horizontal),
      new Set(['iq']),
    );
    if (ok) {
      partsOf(upper).forEach(part => keep.add(part));
    } else {
      failed.push(j);
    }
  }
  removeOrphans(group, keep);
  return failed;
}

/**
 * Splits every candle of one candlestick series.
 *
 * @param group - The series' `g.apexcharts-series`
 * @returns The data indices whose candle could not be split
 */
export function splitCandles(group: Element): string[] {
  const failed: string[] = [];
  const keep = new Set<Element>();
  for (const [j, [candle]] of pathsByIndex(group, 'apexcharts-candlestick-area')) {
    const ok = applyParts(
      candle,
      [candle],
      j,
      () => computeCandleParts(candle.getAttribute('d') ?? ''),
      new Set(['body']),
    );
    if (ok) {
      partsOf(candle).forEach(part => keep.add(part));
    } else {
      failed.push(j);
    }
  }
  removeOrphans(group, keep);
  return failed;
}
