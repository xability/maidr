/**
 * @jest-environment jsdom
 */

/**
 * Derived lines are measured before any of them is inserted.
 *
 * A candlestick draws its open and close edges along the body, and a box plot
 * draws its quartile edges along the box and a whisker out to each cap. Each
 * of those cost a `getBBox` -- and, for an edge, a `getComputedStyle` -- on an
 * element that had just had a sibling inserted next to it, so the browser had
 * to lay the chart out again before every single one. `Svg.createLineElements`
 * and `Svg.createWhiskerElements` read the whole batch first, build from the
 * numbers, and then write once per anchor.
 *
 * The DOM order those writes leave behind is load-bearing rather than
 * cosmetic: `HighlightService` hands these lines to `Svg.createHighlightElement`,
 * which inserts a *visible* clone directly after the line it highlights, so
 * where the line sits among its siblings is the order the reader sees the
 * highlight painted in. The batch must therefore insert with `anchor.after()`
 * -- appending to the anchor's parent, as `Svg.createCircleElements` does,
 * would move every highlight above the chart marks drawn after it.
 */

import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Candlestick } from '@model/candlestick';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Event {
  readonly kind: 'read' | 'write';
  /** For a write, whether it put a `<line>` into the document. */
  readonly line: boolean;
  readonly what: string;
}

interface Recorder {
  readonly events: Event[];
  readonly restore: () => void;
}

/**
 * Records every layout read and every DOM insertion, in order.
 *
 * `getBBox` answers from a box hung on the element itself, because jsdom lays
 * nothing out and the geometry has to come from somewhere.
 * @returns The log, and the teardown that unwires it
 */
function record(): Recorder {
  const events: Event[] = [];
  const originalStyle = window.getComputedStyle;
  const originalInsert = Element.prototype.insertAdjacentElement;
  const originalAfter = Element.prototype.after;

  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value(this: SVGElement) {
      events.push({ kind: 'read', line: false, what: 'getBBox' });
      return (this as unknown as { bBox?: DOMRect }).bBox
        ?? { x: 0, y: 0, width: 2, height: 4 } as DOMRect;
    },
    configurable: true,
    writable: true,
  });
  window.getComputedStyle = function (element: Element, pseudo?: string | null): CSSStyleDeclaration {
    events.push({ kind: 'read', line: false, what: 'getComputedStyle' });
    return originalStyle.call(window, element, pseudo);
  } as typeof window.getComputedStyle;
  Element.prototype.insertAdjacentElement = function (this: Element, position: InsertPosition, element: Element): Element | null {
    events.push({ kind: 'write', line: element.tagName === 'line', what: 'insertAdjacentElement' });
    return originalInsert.call(this, position, element);
  };
  Element.prototype.after = function (this: Element, ...nodes: (Node | string)[]): void {
    events.push({
      kind: 'write',
      line: nodes.some(node => node instanceof Element && node.tagName === 'line'),
      what: 'after',
    });
    originalAfter.apply(this, nodes);
  };

  return {
    events,
    restore: () => {
      Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
      window.getComputedStyle = originalStyle;
      Element.prototype.insertAdjacentElement = originalInsert;
      Element.prototype.after = originalAfter;
    },
  };
}

/**
 * How many reads were taken with a DOM write standing between them and the
 * previous read -- the measurement the browser has to lay the chart out again
 * to answer.
 *
 * One per batch is the floor, and what the batch buys: the reads of a batch
 * are consecutive, so only its first can follow a write.
 * @param events - The recorded log
 * @returns The count
 */
function forcedLayouts(events: readonly Event[]): number {
  let forced = 0;
  let wrote = false;
  for (const event of events) {
    if (event.kind === 'write') {
      wrote = true;
    } else {
      if (wrote) {
        forced++;
      }
      wrote = false;
    }
  }
  return forced;
}

/**
 * How many times a given read was taken.
 * @param events - The recorded log
 * @param what - The read's name
 * @returns The count
 */
function reads(events: readonly Event[], what: string): number {
  return events.filter(event => event.kind === 'read' && event.what === what).length;
}

/**
 * The unbroken run of `<line>` siblings directly after an element.
 *
 * A run rather than every following line, because that is the claim: the
 * batch puts the lines it derives from this anchor immediately after it, the
 * way inserting them one at a time did.
 * @param element - The anchor
 * @returns Their `y1` then `x1`, which is enough to tell the edges apart
 */
function linesAfter(element: Element): string[] {
  const found: string[] = [];
  for (let node = element.nextElementSibling; node !== null; node = node.nextElementSibling) {
    if (node.tagName !== 'line') {
      break;
    }
    found.push(`${node.getAttribute('y1')},${node.getAttribute('x1')}`);
  }
  return found;
}

const CANDLES = 5;

describe('a candlestick deriving its edges', () => {
  let recorder: Recorder;

  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}">${
      '<rect class="body" x="0" y="0" width="2" height="4" />'.repeat(CANDLES)}</svg>`;
    recorder = record();
  });

  afterEach(() => {
    recorder.restore();
    document.body.innerHTML = '';
  });

  /**
   * Rising candles, so the close is the body's top edge and the open its
   * bottom -- two lines per body, from the one body.
   * @returns The layer
   */
  function layer(): MaidrLayer {
    return {
      id: 'candlestick',
      type: TraceType.CANDLESTICK,
      axes: { x: { label: 'Date' }, y: { label: 'Price' } },
      selectors: { body: '.body' },
      data: Array.from({ length: CANDLES }, (_, i) => ({
        value: `d${i}`,
        open: 10,
        high: 15,
        low: 9,
        close: 14,
        volume: 1,
        volatility: 6,
      })),
    } as MaidrLayer;
  }

  test('measures each body once, before any edge is inserted', () => {
    const trace = new Candlestick(layer());

    // One read of each kind per body, not one per edge.
    expect(reads(recorder.events, 'getBBox')).toBe(CANDLES);
    expect(reads(recorder.events, 'getComputedStyle')).toBe(CANDLES);
    // One, for the batch as a whole: the hidden body clones are already in
    // the document when it starts reading. Drawing an edge at a time cost one
    // per edge.
    expect(forcedLayouts(recorder.events)).toBe(1);

    trace.dispose();
  });

  test('leaves each body followed by its close edge and then its open edge', () => {
    const trace = new Candlestick(layer());

    // The chart's own bodies; `collectElements` cloned each one beside it.
    const bodies = [...document.querySelectorAll('rect.body:not([data-maidr-owned])')];
    expect(bodies).toHaveLength(CANDLES);
    for (const body of bodies) {
      // The clone `collectElements` made sits between the chart's own body
      // and the edges, which anchor on the clone.
      const clone = body.nextElementSibling!;
      expect(clone.tagName).toBe('rect');
      // Top edge (close, y1 = 0) before bottom edge (open, y1 = 4), which is
      // the order inserting one at a time after the same anchor produced.
      expect(linesAfter(clone)).toEqual(['0,0', '4,0']);
      // Directly after the anchor: not appended to the parent.
      expect(clone.nextElementSibling?.tagName).toBe('line');
    }

    trace.dispose();
  });
});

const BOXES = 3;

describe('a box plot deriving its quartile edges and whiskers', () => {
  let recorder: Recorder;

  /**
   * Puts an element in the chart with the box the chart would have laid out.
   * @param tag - The SVG tag
   * @param id - Its id, which the selector names
   * @param bBox - What `getBBox` reports
   * @param bBox.x - Its left edge
   * @param bBox.y - Its top edge
   * @param bBox.width - Its width
   * @param bBox.height - Its height
   */
  function place(tag: string, id: string, bBox: { x: number; y: number; width: number; height: number }): void {
    const element = document.createElementNS(SVG_NS, tag);
    element.setAttribute('id', id);
    (element as unknown as { bBox: unknown }).bBox = bBox;
    document.querySelector('svg')!.appendChild(element);
  }

  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
    for (let i = 0; i < BOXES; i++) {
      place('path', `box${i}`, { x: 10, y: 40, width: 20, height: 30 });
      place('path', `median${i}`, { x: 10, y: 55, width: 20, height: 0 });
      place('path', `low${i}`, { x: 15, y: 90, width: 10, height: 0 });
      place('path', `high${i}`, { x: 15, y: 10, width: 10, height: 0 });
    }
    recorder = record();
  });

  afterEach(() => {
    recorder.restore();
    document.body.innerHTML = '';
  });

  /**
   * Vertical boxes with both caps clear of the body, so every whisker is real.
   * @returns The layer
   */
  function layer(): MaidrLayer {
    const selectors: BoxSelector[] = Array.from({ length: BOXES }, (_, i) => ({
      lowerOutliers: [],
      upperOutliers: [],
      min: `#low${i}`,
      iq: `#box${i}`,
      q2: `#median${i}`,
      max: `#high${i}`,
    }));
    const point: BoxPoint = {
      z: 'a',
      lowerOutliers: [],
      min: 2,
      q1: 4,
      q2: 5,
      q3: 6,
      max: 8,
      upperOutliers: [],
    };
    return {
      id: 'box',
      type: TraceType.BOX,
      title: 'A box',
      orientation: Orientation.VERTICAL,
      axes: { x: { label: 'Group' }, y: { label: 'Value' } },
      selectors,
      data: Array.from({ length: BOXES }, () => point),
    } as MaidrLayer;
  }

  test('measures each element once per batch, before any line is inserted', () => {
    const trace = new BoxTrace(layer());

    // The edge batch reads each box; the whisker batch reads each box and
    // both its caps. Four reads per box, where a box was read four times over
    // by itself before.
    expect(reads(recorder.events, 'getBBox')).toBe(BOXES * 4);
    // One style read per box, for both its edges.
    expect(reads(recorder.events, 'getComputedStyle')).toBe(BOXES);
    // One, for the whisker batch, whose reads follow the edge batch's writes.
    // The edge batch itself reads before anything has been inserted at all.
    // Drawing a box at a time cost four per box.
    expect(forcedLayouts(recorder.events)).toBe(1);

    trace.dispose();
  });

  test('leaves each box followed by its whiskers and then its quartile edges', () => {
    const trace = new BoxTrace(layer());

    for (let i = 0; i < BOXES; i++) {
      const box = document.getElementById(`box${i}`)!;
      expect(linesAfter(box)).toEqual([
        // The upper cap's whisker, then the lower cap's: the order repeated
        // `insertAdjacentElement(afterend)` left behind.
        '10,20',
        '90,20',
        // Then q3 (the box's top edge) and q1 (its bottom edge).
        '40,10',
        '70,10',
      ]);
      // Directly after the box: not appended to the parent.
      expect(box.nextElementSibling?.tagName).toBe('line');
    }

    trace.dispose();
  });

  test('still reports the whiskers to a renderer, lower cap first', () => {
    const trace = new BoxTrace(layer());

    const whiskers = trace
      .getGeometryElements()
      .filter(element => element.tagName === 'line');

    expect(whiskers).toHaveLength(BOXES * 2);
    expect(whiskers.slice(0, 2).map(w => w.getAttribute('y1'))).toEqual(['90', '10']);

    trace.dispose();
  });
});
