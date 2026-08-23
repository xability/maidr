/**
 * @jest-environment jsdom
 */

/**
 * Tests for `TactileSvgGeometry.isRenderable`, the filter that decides which
 * of a chart's SVG elements reach the pins.
 *
 * The rest of `svgGeometry.ts` needs `getScreenCTM` and the SVG geometry
 * interfaces, which jsdom does not implement; this half is attribute
 * inspection and can be held to its contract here.
 *
 * What it has to get right is a distinction with no margin for a near miss.
 * At sixty pins across, a tick mark is one or two pins long — the same size as
 * a small mark — so leaving the ticks in puts a row of things under the
 * reader's finger that feel exactly like data and are not. Dropping a mark
 * instead is the same failure in the other direction, and worse: the reader
 * has no way to tell a chart with a missing bar from a chart that never had
 * one. So the matching is on whole words rather than substrings, and the case
 * that proves it is `candlestick` — a plot type MAIDR supports, whose name
 * contains "tick".
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { TactileSvgGeometry } from '@util/tactile/svgGeometry';
import { TactileViewport } from '@util/tactile/viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG element with the given attributes.
 * @param tag - The element's tag name
 * @param attributes - Attributes to set on it
 */
function element(tag: string, attributes: Record<string, string> = {}): Element {
  const created = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    created.setAttribute(name, value);
  }
  return created;
}

describe('tactileSvgGeometry.isRenderable', () => {
  let plain: Element;

  beforeEach(() => {
    plain = element('path');
  });

  it('should render an ordinary shape', () => {
    expect(TactileSvgGeometry.isRenderable(plain)).toBe(true);
  });

  describe('tags carrying no geometry', () => {
    it.each(['text', 'tspan', 'defs', 'clipPath', 'title', 'desc', 'style'])(
      'should skip %s',
      (tag) => {
        expect(TactileSvgGeometry.isRenderable(element(tag))).toBe(false);
      },
    );
  });

  describe('maidr\'s own shapes', () => {
    it('should skip an element maidr owns', () => {
      expect(TactileSvgGeometry.isRenderable(element('rect', { 'data-maidr-owned': '' }))).toBe(false);
    });

    it('should skip a hidden element', () => {
      expect(TactileSvgGeometry.isRenderable(element('rect', { visibility: 'hidden' }))).toBe(false);
    });

    it('should skip an element that is not displayed', () => {
      expect(TactileSvgGeometry.isRenderable(element('rect', { display: 'none' }))).toBe(false);
    });
  });

  describe('axis furniture', () => {
    // Taken from what the libraries actually emit rather than invented: the
    // matplotlib ids are from `fig.savefig(format='svg')`, and the rest are
    // each library's documented class names.
    it.each([
      ['matplotlib, the whole x axis', 'id', 'matplotlib.axis_1'],
      ['matplotlib, one tick', 'id', 'xtick_3'],
      ['matplotlib, one y tick', 'id', 'ytick_1'],
      ['plotly, a tick', 'class', 'xtick'],
      ['plotly, a grid line', 'class', 'ygrid crisp'],
      ['d3, a tick group', 'class', 'tick'],
      ['d3, the axis line', 'class', 'domain'],
      ['vega, an axis tick', 'class', 'mark-rule role-axis-tick'],
      ['recharts, a tick line', 'class', 'recharts-cartesian-axis-tick-line'],
      ['highcharts, a grid line', 'class', 'highcharts-grid-line'],
    ])('should skip %s', (_case, attribute, value) => {
      expect(TactileSvgGeometry.isRenderable(element('path', { [attribute]: value }))).toBe(false);
    });
  });

  describe('data that only looks like furniture', () => {
    it('should render a candlestick mark', () => {
      // "candlestick" contains "tick". A substring match erases the whole
      // chart, and does it silently -- the display still draws, just with no
      // data on it.
      expect(TactileSvgGeometry.isRenderable(element('path', { class: 'candlestick' }))).toBe(true);
      expect(TactileSvgGeometry.isRenderable(element('path', { class: 'maidr-candlestick-body' }))).toBe(true);
    });

    it.each([
      'gridiron',
      'ticker',
      'axisymmetric',
      'domainwall',
      'spineless',
      'sticker-count',
    ])('should render a mark classed %s', (className) => {
      expect(TactileSvgGeometry.isRenderable(element('path', { class: className }))).toBe(true);
    });

    it('should render a bar whose id merely ends in a number', () => {
      expect(TactileSvgGeometry.isRenderable(element('path', { id: 'patch_3' }))).toBe(true);
    });

    it('should render the group holding the whole plot', () => {
      // matplotlib calls it `axes_1`, and everything drawn is inside it. This
      // is why the plural is not a furniture word: skipping it would skip the
      // chart wherever the walk starts above that group.
      expect(TactileSvgGeometry.isRenderable(element('g', { id: 'axes_1' }))).toBe(true);
    });
  });
});

describe('tactileSvgGeometry.ringsOf on a mark the model supplied', () => {
  /**
   * Puts an element in a state `ringsOf` can measure. jsdom implements neither
   * `getScreenCTM` nor `getBBox`, and both are read directly, so a stand-in for
   * each is the whole of what is needed — the identity transform and a known
   * box, so a returned ring reads as the box it came from.
   *
   * @param target - The element to make measurable
   * @param box - The box `getBBox` should report
   * @param box.x - Left edge in user space
   * @param box.y - Top edge in user space
   * @param box.width - Width in user space
   * @param box.height - Height in user space
   */
  function measurable(
    target: Element,
    box: { x: number; y: number; width: number; height: number },
  ): SVGGraphicsElement {
    const graphics = target as unknown as Record<string, unknown>;
    graphics.getScreenCTM = (): unknown => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    graphics.getBBox = (): unknown => box;
    return target as unknown as SVGGraphicsElement;
  }

  const viewport = new TactileViewport({ left: 0, top: 0, width: 100, height: 100 }, 60, 40);

  it('should draw a word rather than skipping it as a label', () => {
    // A word cloud is made of `<text>`: the words are the marks and their size
    // is the value. Sifting a chart's subtree drops lettering, because a tick
    // label at this scale is a pin of noise that reads as data — but a mark the
    // model hands over is data whatever it is made of, and applying the same
    // rule there left the display flat. Not a degraded picture: no picture, and
    // to a reader indistinguishable from a device that is switched off.
    const word = measurable(element('text'), { x: 10, y: 10, width: 30, height: 20 });

    expect(TactileSvgGeometry.ringsOf(word, viewport).length).toBeGreaterThan(0);
  });

  it('should draw the lettering inside a mark drawn as a group', () => {
    const group = element('g');
    const word = measurable(element('text'), { x: 10, y: 10, width: 30, height: 20 });
    group.appendChild(word);

    expect(TactileSvgGeometry.ringsOf(group as SVGGraphicsElement, viewport).length)
      .toBeGreaterThan(0);
  });

  it('should still skip what a chart hides inside a mark', () => {
    const group = element('g');
    const hidden = measurable(
      element('text', { visibility: 'hidden' }),
      { x: 10, y: 10, width: 30, height: 20 },
    );
    group.appendChild(hidden);

    expect(TactileSvgGeometry.ringsOf(group as SVGGraphicsElement, viewport)).toEqual([]);
  });
});
