import type { BoxSelector, CandlestickSelector } from '@type/grammar';
import type { VictoryLayerInfo } from './types';

/**
 * Data-attribute prefix used to tag Victory-rendered SVG elements so that
 * MAIDR's `Svg.selectAllElements()` can reliably select them later.
 */
const ATTR_PREFIX = 'data-maidr-victory';

/**
 * CSS selector matching every `data-maidr-victory-<n>` tag (supports up to 10
 * layers per subplot, which is well beyond any realistic Victory chart).
 */
const TAGGED_QUERY = Array.from({ length: 10 }, (_, i) => `[${ATTR_PREFIX}-${i}]`).join(', ');

/**
 * Returns all currently-tagged elements inside the container's SVG.
 *
 * Used by the adapter to detect when Victory has detached a tagged node (it
 * re-renders some marks after mount), so the tags can be re-applied to the
 * live nodes.
 */
export function getTaggedElements(container: HTMLElement): Element[] {
  const svg = container.querySelector('svg');
  if (!svg)
    return [];
  return Array.from(svg.querySelectorAll(TAGGED_QUERY));
}

/**
 * Removes all `data-maidr-victory-*` attributes from elements inside the
 * container. Must be called before re-tagging to prevent stale attributes
 * from accumulating across re-renders.
 */
export function clearTaggedElements(container: HTMLElement): void {
  const svg = container.querySelector('svg');
  if (!svg)
    return;

  const tagged = svg.querySelectorAll(TAGGED_QUERY);
  for (const el of tagged) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name.startsWith(ATTR_PREFIX)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/**
 * Finds the Victory data elements inside a container for a given layer,
 * tags them with a unique data attribute, and returns the CSS selector
 * that matches exactly those elements.
 *
 * Strategy:
 * 1. Victory renders each data component's elements with
 *    `role="presentation"` on the individual data shapes.
 * 2. We query for the expected SVG tag (e.g. `rect` for bars) that
 *    carries `role="presentation"`.
 * 3. We skip elements that belong to other layers by tracking which
 *    elements were already claimed.
 * 4. Each claimed element receives a `data-maidr-victory-<layerIndex>`
 *    attribute so MAIDR can select them deterministically.
 *
 * @remarks
 * This relies on Victory's `role="presentation"` attribute on data
 * elements, which is a stable Victory convention (tested with v37).
 * If Victory changes this convention, selector tagging will silently
 * degrade and highlighting will stop working (audio/text/braille are
 * unaffected).
 *
 * @param container  - The DOM node wrapping the Victory chart
 * @param layer      - The extracted layer info
 * @param layerIndex - Numeric index for generating unique attribute names
 * @param claimed    - Set of elements already claimed by prior layers
 * @returns A CSS selector string, or `undefined` if elements could not be
 *          matched (highlighting will gracefully degrade).
 */
export function tagLayerElements(
  container: HTMLElement,
  layer: VictoryLayerInfo,
  layerIndex: number,
  claimed: Set<Element>,
): string | BoxSelector[] | CandlestickSelector | undefined {
  const svg = container.querySelector('svg');
  if (!svg)
    return undefined;

  const attrName = `${ATTR_PREFIX}-${layerIndex}`;
  const { victoryType } = layer;

  // Line charts: single <path> representing the full series.
  if (victoryType === 'VictoryLine') {
    return tagLineElements(svg, layer, attrName, claimed);
  }

  // Candlestick: each candle is a <g> with one body <rect> and two wick
  // <line>s — tag them as a structured CandlestickSelector.
  if (victoryType === 'VictoryCandlestick') {
    return tagCandlestickElements(svg, attrName, claimed);
  }

  // Box plot: component-grouped rects (q1/q3 halves), median lines, and
  // whisker line-pairs with no semantic classes — classify by geometry and
  // tag as a per-box BoxSelector[].
  if (victoryType === 'VictoryBoxPlot') {
    return tagBoxElements(svg, attrName, claimed);
  }

  // Discrete-element charts: one <path role="presentation"> per data point.
  // VictoryBar, VictoryHistogram, VictoryScatter, and VictoryStack all render
  // their data points as <path> elements — Victory's Bar primitive renders a
  // <path> (with arc commands for corner radius), never a <rect>.
  return tagDiscreteElements(svg, layer, attrName, claimed);
}

/**
 * Tags discrete SVG elements (one <path> per data point) for bar,
 * histogram, scatter, and stacked charts.
 */
function tagDiscreteElements(
  svg: SVGElement,
  layer: VictoryLayerInfo,
  attrName: string,
  claimed: Set<Element>,
): string | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"]'),
  ).filter(el => !claimed.has(el));

  // Victory renders exactly one element per data point.
  // Take the first `dataCount` unclaimed elements.
  const matched = candidates.slice(0, layer.dataCount);

  if (matched.length !== layer.dataCount) {
    return undefined;
  }

  for (const el of matched) {
    el.setAttribute(attrName, '');
    claimed.add(el);
    // Scatter points are <path> elements positioned by their `d` moveto, so
    // they expose no x/y or cx/cy. Stamp cx/cy from the path centre so MAIDR's
    // ScatterTrace.groupSvgElements (which groups points by cx/cy) can locate
    // them. Ignored by SVG path rendering; inherited by the highlight clones.
    if (layer.victoryType === 'VictoryScatter') {
      stampPathCenter(el);
    }
  }

  return `[${attrName}]`;
}

/**
 * Stamps `cx`/`cy` attributes on a Victory scatter `<path>`, derived from the
 * initial absolute moveto in its `d` attribute (e.g. `M 74, 226 …`).
 *
 * Victory draws each scatter marker as a `<path>` whose centre is the first
 * `M` coordinate; it has no `x`/`y` or `cx`/`cy` of its own. MAIDR's scatter
 * grouping reads `cx`/`cy`, so stamping them here is what enables highlighting.
 * `cx`/`cy` have no effect on `<path>` rendering, so the marker is unchanged.
 */
function stampPathCenter(path: Element): void {
  const d = path.getAttribute('d') ?? '';
  const match = d.match(/M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
  if (!match) {
    return;
  }
  path.setAttribute('cx', match[1]);
  path.setAttribute('cy', match[2]);
}

/**
 * Tags the path element for a VictoryLine layer.
 *
 * Victory renders a single `<path>` with `role="presentation"` for
 * the line. MAIDR's line trace parses the `d` attribute to derive
 * individual point positions.
 */
function tagLineElements(
  svg: SVGElement,
  layer: VictoryLayerInfo,
  attrName: string,
  claimed: Set<Element>,
): string | undefined {
  const candidates = Array.from(
    svg.querySelectorAll('path[role="presentation"]'),
  ).filter(el => !claimed.has(el));

  if (candidates.length === 0)
    return undefined;

  // Heuristic: pick the first path whose `d` attribute contains enough
  // SVG commands to plausibly represent the data points.
  for (const candidate of candidates) {
    const d = candidate.getAttribute('d') ?? '';
    const commandCount = (d.match(/[MLCQTSA]/gi) ?? []).length;
    if (commandCount >= layer.dataCount) {
      candidate.setAttribute(attrName, '');
      claimed.add(candidate);
      return `[${attrName}]`;
    }
  }

  // Fallback: use the first unclaimed path.
  const fallback = candidates[0];
  fallback.setAttribute(attrName, '');
  claimed.add(fallback);
  return `[${attrName}]`;
}

// ---------------------------------------------------------------------------
// Candlestick
// ---------------------------------------------------------------------------

/** Part attributes used to target candlestick sections. */
const CANDLE_BODY = `${ATTR_PREFIX}-cbody`;
const CANDLE_HIGH = `${ATTR_PREFIX}-chigh`;
const CANDLE_LOW = `${ATTR_PREFIX}-clow`;

/**
 * Tags the elements of a VictoryCandlestick layer.
 *
 * Victory renders each candle as a `<g role="presentation">` containing one
 * `<rect>` (the open/close body) and two `<line>` wicks. The wick with the
 * smaller mid-y is the high (upper) wick; the larger is the low (lower) wick.
 *
 * Returns a {@link CandlestickSelector}; MAIDR's Candlestick trace derives the
 * open/close/volatility highlights from the body + wicks.
 */
function tagCandlestickElements(
  svg: SVGElement,
  attrName: string,
  claimed: Set<Element>,
): CandlestickSelector | undefined {
  const bodies = Array.from(
    svg.querySelectorAll('rect[role="presentation"]'),
  ).filter(el => !claimed.has(el));

  if (bodies.length === 0) {
    return undefined;
  }

  for (const body of bodies) {
    tag(body, attrName, CANDLE_BODY, claimed);

    const group = body.parentElement;
    if (!group) {
      continue;
    }
    const wicks = Array.from(group.querySelectorAll('line[role="presentation"]'))
      .map(line => ({ line, y: lineMidY(line) }))
      .filter((w): w is { line: Element; y: number } => w.y !== null)
      .sort((a, b) => a.y - b.y);

    // Smaller mid-y = high (upper) wick; larger = low (lower) wick.
    if (wicks.length >= 1) {
      tag(wicks[0].line, attrName, CANDLE_HIGH, claimed);
    }
    if (wicks.length >= 2) {
      tag(wicks[wicks.length - 1].line, attrName, CANDLE_LOW, claimed);
    }
  }

  return {
    body: `[${CANDLE_BODY}]`,
    wickHigh: `[${CANDLE_HIGH}]`,
    wickLow: `[${CANDLE_LOW}]`,
  };
}

// ---------------------------------------------------------------------------
// Box plot
// ---------------------------------------------------------------------------

/** Part attributes used to target box-plot sections per box. */
const BOX_INDEX = `${ATTR_PREFIX}-bidx`;
const BOX_PART = `${ATTR_PREFIX}-bpart`;

/**
 * Tags the elements of a VictoryBoxPlot layer.
 *
 * Victory renders boxes as component-grouped siblings with no semantic
 * classes: two `<rect>`s per box (q1 lower half, q3 upper half), a median
 * `<line>`, and whisker `<line>` pairs (vertical stem + horizontal cap). We
 * classify by geometry:
 *   - Group rects by centre-x → one box per bucket; the larger-y rect is q1,
 *     the smaller-y rect is q3. Their shared edge is the median y.
 *   - Among horizontal lines within a box's x-range: one inside the box
 *     [q3.top, q1.bottom] is the median; above the box is the max cap; below
 *     is the min cap. (Vertical whisker stems are ignored.)
 *
 * Returns one {@link BoxSelector} per box. Unmatched sections are emitted as
 * selectors that match nothing, so highlighting degrades gracefully per
 * section rather than mis-highlighting.
 */
function tagBoxElements(
  svg: SVGElement,
  attrName: string,
  claimed: Set<Element>,
): BoxSelector[] | undefined {
  const rects = Array.from(
    svg.querySelectorAll('rect[role="presentation"]'),
  ).filter(el => !claimed.has(el)) as SVGElement[];

  // Each box is two rects (q1/q3 halves); bail if the shape is unexpected.
  if (rects.length === 0 || rects.length % 2 !== 0) {
    return undefined;
  }

  // Group rects by rounded centre-x → one bucket per box.
  const byX = new Map<number, SVGElement[]>();
  for (const rect of rects) {
    const x = num(rect.getAttribute('x'));
    const w = num(rect.getAttribute('width'));
    if (x === null || w === null) {
      return undefined;
    }
    const cx = Math.round(x + w / 2);
    const bucket = byX.get(cx);
    if (bucket) {
      bucket.push(rect);
    } else {
      byX.set(cx, [rect]);
    }
  }

  const boxCenters = Array.from(byX.keys()).sort((a, b) => a - b);
  const horizontalLines = Array.from(
    svg.querySelectorAll('line[role="presentation"]'),
  ).filter(el => !claimed.has(el) && isHorizontalLine(el));

  const selectors: BoxSelector[] = [];

  for (let i = 0; i < boxCenters.length; i++) {
    const bucket = byX.get(boxCenters[i])!;
    if (bucket.length !== 2) {
      return undefined;
    }

    // Smaller y = q3 (upper half); larger y = q1 (lower half).
    bucket.sort((a, b) => num(a.getAttribute('y'))! - num(b.getAttribute('y'))!);
    const [q3Rect, q1Rect] = bucket;
    const boxTop = num(q3Rect.getAttribute('y'))!;
    const boxBottom = num(q1Rect.getAttribute('y'))! + num(q1Rect.getAttribute('height'))!;
    const xMin = num(q1Rect.getAttribute('x'))!;
    const xMax = xMin + num(q1Rect.getAttribute('width'))!;

    tagBoxPart(q1Rect, attrName, i, 'q1', claimed);
    tagBoxPart(q3Rect, attrName, i, 'q3', claimed);

    for (const line of horizontalLines) {
      const geom = horizontalLineGeom(line);
      if (!geom || geom.left < xMin - 2 || geom.right > xMax + 2) {
        continue;
      }
      if (geom.y >= boxTop - 1 && geom.y <= boxBottom + 1) {
        tagBoxPart(line, attrName, i, 'q2', claimed); // median, inside the box
      } else if (geom.y < boxTop) {
        tagBoxPart(line, attrName, i, 'max', claimed); // cap above the box
      } else if (geom.y > boxBottom) {
        tagBoxPart(line, attrName, i, 'min', claimed); // cap below the box
      }
    }

    const sel = (part: string): string => `[${BOX_INDEX}="${i}"][${BOX_PART}="${part}"]`;
    selectors.push({
      lowerOutliers: [],
      upperOutliers: [],
      min: sel('min'),
      max: sel('max'),
      iq: sel('q1'), // harmless: direct q1/q3 below bypass iq-edge derivation
      q1: sel('q1'),
      q3: sel('q3'),
      q2: sel('q2'),
    });
  }

  return selectors.length > 0 ? selectors : undefined;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parses a numeric attribute value, returning null when absent/NaN. */
function num(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Stamps the tracking attribute plus a part attribute on an element. */
function tag(el: Element, attrName: string, partAttr: string, claimed: Set<Element>): void {
  el.setAttribute(attrName, '');
  el.setAttribute(partAttr, '');
  claimed.add(el);
}

/** Stamps a box element with its box index and section part. */
function tagBoxPart(el: Element, attrName: string, boxIndex: number, part: string, claimed: Set<Element>): void {
  el.setAttribute(attrName, '');
  el.setAttribute(BOX_INDEX, String(boxIndex));
  el.setAttribute(BOX_PART, part);
  claimed.add(el);
}

/** Returns the mid-point y of a `<line>`, or null if its endpoints are absent. */
function lineMidY(line: Element): number | null {
  const y1 = num(line.getAttribute('y1'));
  const y2 = num(line.getAttribute('y2'));
  if (y1 === null || y2 === null) {
    return null;
  }
  return (y1 + y2) / 2;
}

/** True when a `<line>` is (near-)horizontal. */
function isHorizontalLine(line: Element): boolean {
  const y1 = num(line.getAttribute('y1'));
  const y2 = num(line.getAttribute('y2'));
  const x1 = num(line.getAttribute('x1'));
  const x2 = num(line.getAttribute('x2'));
  if (y1 === null || y2 === null || x1 === null || x2 === null) {
    return false;
  }
  return Math.abs(y1 - y2) <= Math.abs(x1 - x2);
}

/** Returns the left/right x-extent and y of a horizontal `<line>`. */
function horizontalLineGeom(line: Element): { left: number; right: number; y: number } | null {
  const x1 = num(line.getAttribute('x1'));
  const x2 = num(line.getAttribute('x2'));
  const y1 = num(line.getAttribute('y1'));
  const y2 = num(line.getAttribute('y2'));
  if (x1 === null || x2 === null || y1 === null || y2 === null) {
    return null;
  }
  return { left: Math.min(x1, x2), right: Math.max(x1, x2), y: (y1 + y2) / 2 };
}
