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
