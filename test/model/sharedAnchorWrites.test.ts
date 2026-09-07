/**
 * @jest-environment jsdom
 */

/**
 * Where a trace inserts the lines it derives, when one element is several
 * parts of the same box.
 *
 * A box plot's selectors usually name a different element per part, but two
 * shipped adapters point more than one part at a single node: Victory names
 * one `<path>` as both `iq` and `q1` (`src/adapters/victory/selectors.ts`),
 * and Plotly draws a violin's whole inner box as one `<path>` and names it
 * `min`, `iq`, `q2` and `max` (`src/adapters/plotly/extractor.ts`).
 *
 * That makes the write order load-bearing. `AbstractTrace.getAllOriginalElements`
 * pairs each hidden clone back to the chart's own element by
 * `previousElementSibling` -- same tag, not hidden -- and
 * `HighContrastService.getAllTraceElements` feeds exactly that set to the
 * recolouring a low-vision reader sees. A derived edge or whisker inserted
 * before the clone stands between the two and the pairing is refused; inserted
 * after, the clone sits directly against the shared element and the pairing is
 * accepted, adding a member to the trace's high-contrast palette. Deriving the
 * lines earlier is therefore only free if they are still *written* where they
 * always were, which is what this pins.
 */

import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { ViolinBoxTrace } from '@model/violinBox';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Puts an element in the chart, carrying the box the chart would have laid out.
 * @param tag - The SVG tag
 * @param id - Its id, which the selectors name
 * @param bBox - What `getBBox` reports for it
 * @param bBox.x - Its left edge
 * @param bBox.y - Its top edge
 * @param bBox.width - Its width
 * @param bBox.height - Its height
 */
function place(
  tag: string,
  id: string,
  bBox: { x: number; y: number; width: number; height: number },
): void {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('id', id);
  (element as unknown as { bBox: unknown }).bBox = bBox;
  document.querySelector('svg')!.appendChild(element);
}

/**
 * Names one sibling well enough to tell the derived lines, the clones and the
 * chart's own marks apart.
 * @param node - The sibling
 * @returns Its tag, its id or its `y1`, and whether MAIDR made it
 */
function describeNode(node: Element): string {
  const id = node.getAttribute('id') ?? `y1=${node.getAttribute('y1')}`;
  return `${node.tagName}#${id}${node.hasAttribute('data-maidr-owned') ? ' owned' : ''}`;
}

/**
 * Every sibling after an element, in document order.
 * @param element - The anchor
 * @returns One description per following sibling
 */
function siblingsAfter(element: Element): string[] {
  const found: string[] = [];
  for (let node = element.nextElementSibling; node !== null; node = node.nextElementSibling) {
    found.push(describeNode(node));
  }
  return found;
}

/** The part of a trace this file reads. */
interface Reporting {
  getAllOriginalElements: () => SVGElement[];
}

/**
 * The ids of the chart's own elements a trace reports as its originals.
 * @param trace - The trace
 * @returns One id per reported element, in the order reported
 */
function originalIds(trace: Reporting): string[] {
  return trace.getAllOriginalElements().map(element => element.getAttribute('id') ?? '?');
}

const POINT: BoxPoint = {
  z: 'a',
  lowerOutliers: [],
  min: 2,
  q1: 4,
  q2: 5,
  q3: 6,
  max: 8,
  upperOutliers: [],
};

/**
 * A one-box vertical layer with the given selectors.
 * @param type - The trace type
 * @param selector - The box's selectors
 * @returns The layer
 */
function layer(type: TraceType, selector: BoxSelector): MaidrLayer {
  return {
    id: 'shared-anchor',
    type,
    title: 'A box',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: [selector],
    data: [POINT],
  } as MaidrLayer;
}

beforeEach(() => {
  document.body.innerHTML = `<svg xmlns="${SVG_NS}"></svg>`;
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value(this: SVGElement) {
      return (this as unknown as { bBox?: DOMRect }).bBox
        ?? { x: 0, y: 0, width: 2, height: 4 } as DOMRect;
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  document.body.innerHTML = '';
});

describe('a victory box, whose `iq` and `q1` are one element', () => {
  beforeEach(() => {
    place('path', 'min0', { x: 15, y: 90, width: 10, height: 0 });
    place('path', 'q1_0', { x: 10, y: 40, width: 20, height: 30 });
    place('path', 'q3_0', { x: 10, y: 40, width: 20, height: 0 });
    place('path', 'q2_0', { x: 10, y: 55, width: 20, height: 0 });
    place('path', 'max0', { x: 15, y: 10, width: 10, height: 0 });
  });

  /**
   * @returns A trace over the placed elements
   */
  function build(): BoxTrace {
    return new BoxTrace(layer(TraceType.BOX, {
      lowerOutliers: [],
      upperOutliers: [],
      min: '#min0',
      max: '#max0',
      // The shared element: `iq` and `q1` name the same `<path>`.
      iq: '#q1_0',
      q1: '#q1_0',
      q3: '#q3_0',
      q2: '#q2_0',
    }));
  }

  test('leaves its whiskers between the shared element and the q1 clone', () => {
    const trace = build();

    // The upper cap's whisker, then the lower cap's, then the clone: the
    // order repeated `insertAdjacentElement(afterend)` left behind.
    expect(siblingsAfter(document.getElementById('q1_0')!).slice(0, 3)).toEqual([
      'line#y1=10 owned',
      'line#y1=90 owned',
      'path#q1_0 owned',
    ]);

    trace.dispose();
  });

  test('does not report the shared element as an original', () => {
    const trace = build();

    // The q1 clone's previous sibling is a whisker, so it pairs with nothing
    // and `#q1_0` is not recoloured in high contrast.
    expect(originalIds(trace)).toEqual(['min0', 'q2_0', 'q3_0', 'max0']);

    trace.dispose();
  });
});

describe('a plotly violin box, drawn as one element', () => {
  beforeEach(() => {
    place('path', 'box0', { x: 10, y: 40, width: 20, height: 30 });
  });

  /**
   * The whole box is one `<path>`: no cap sits outside it, so it has no
   * whiskers, and with no `q1`/`q3` selectors both quartile edges are derived
   * from it.
   * @returns The selector
   */
  function selector(): BoxSelector {
    return {
      lowerOutliers: [],
      upperOutliers: [],
      min: '#box0',
      max: '#box0',
      iq: '#box0',
      q2: '#box0',
    };
  }

  test.each([
    ['box', (): BoxTrace => new BoxTrace(layer(TraceType.BOX, selector()))],
    ['violin box', (): ViolinBoxTrace => new ViolinBoxTrace(layer(TraceType.VIOLIN_BOX, selector()))],
  ])('leaves a %s\'s derived edges between the element and its clones', (_name, make) => {
    const trace = make();

    // q3 (the box's top edge) and q1 (its bottom edge) first, then the
    // clones, which were inserted before the edges were.
    expect(siblingsAfter(document.getElementById('box0')!)).toEqual([
      'line#y1=40 owned',
      'line#y1=70 owned',
      'path#box0 owned',
      'path#box0 owned',
      'path#box0 owned',
    ]);
    // Every clone's previous sibling is a derived line or another clone, so
    // the box is reported no differently than a box drawn as five elements.
    expect(originalIds(trace)).toEqual([]);

    trace.dispose();
  });
});

describe('a violin box whose median is drawn on the box itself', () => {
  beforeEach(() => {
    place('path', 'vlow0', { x: 15, y: 90, width: 10, height: 0 });
    place('path', 'vb0', { x: 10, y: 40, width: 20, height: 30 });
    place('path', 'vhigh0', { x: 15, y: 10, width: 10, height: 0 });
  });

  /**
   * @returns A trace whose `iq` and `q2` are one element, with both caps clear
   *   of it so it has real whiskers as well as derived edges
   */
  function build(): ViolinBoxTrace {
    return new ViolinBoxTrace(layer(TraceType.VIOLIN_BOX, {
      lowerOutliers: [],
      upperOutliers: [],
      min: '#vlow0',
      max: '#vhigh0',
      iq: '#vb0',
      q2: '#vb0',
    }));
  }

  test('writes its whiskers and edges ahead of the median clone', () => {
    const trace = build();

    // Sliced: the chart's own upper cap and its clone follow these.
    expect(siblingsAfter(document.getElementById('vb0')!).slice(0, 5)).toEqual([
      'line#y1=10 owned',
      'line#y1=90 owned',
      'line#y1=40 owned',
      'line#y1=70 owned',
      'path#vb0 owned',
    ]);

    trace.dispose();
  });

  test('reports only the caps as originals', () => {
    const trace = build();

    expect(originalIds(trace)).toEqual(['vlow0', 'vhigh0']);

    trace.dispose();
  });
});
