/**
 * @jest-environment jsdom
 */

/**
 * The lobby's Up and Down follow where the panels are drawn.
 *
 * A figure is laid out from where each subplot is drawn, found through the
 * first mark its first layer's selectors name: by the `<g id="axes_*">` group
 * holding that mark, as in a matplotlib figure, or by the mark itself where
 * there are no such groups. A subplot whose selectors name the parts of its
 * marks -- a box plot's box and whiskers, a candlestick's bodies and wicks --
 * was taken to have nothing to measure, and one such subplot left the whole
 * figure in data order, where Up adds a row. r-maidr writes a Base R
 * `par(mfrow)` figure top row first, so in its lobby Up moved down the page
 * and Down said there was nothing below the top row. py-maidr writes a
 * matplotlib figure top row first too, and a box plot there was found by
 * nothing whenever its first box had no lower outlier: py-maidr names a box's
 * lower outliers, the first of its parts, by a selector even when there are
 * none, and that selector matches nothing.
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Where a mark is drawn on the page. */
interface Place {
  top: number;
  left: number;
}

/** Where the upper panel's marks are drawn. */
const ABOVE: Place = { top: 40, left: 60 };

/** Where the lower panel's marks are drawn. */
const BELOW: Place = { top: 340, left: 90 };

/** Where each mark is drawn; anything else measures nothing. */
const drawnAt = new Map<Element, Place>();

/** The chart the marks are drawn into. */
let svg: SVGSVGElement;

/**
 * Draws an element into the chart.
 * @param parent What it is drawn in
 * @param tag The element
 * @param className What its selector names it by
 * @param at Where it is drawn
 * @returns The element
 */
function draw(parent: Element, tag: string, className: string, at: Place): Element {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('class', className);
  parent.appendChild(element);
  drawnAt.set(element, at);
  return element;
}

/** The bar chart drawn in the upper or the lower panel. */
const BARS: MaidrLayer = {
  id: 'bars',
  type: TraceType.BAR,
  title: 'Cars by Cylinder Count',
  selectors: '.bar',
  data: [{ x: '4', y: 11 }, { x: '6', y: 7 }],
};

/** A box plot as r-maidr writes one: no lower outliers, no selector for them. */
const R_BOXES: MaidrLayer = {
  id: 'boxes',
  type: TraceType.BOX,
  title: 'Horsepower by Gear Count',
  selectors: [{
    lowerOutliers: [],
    min: '.box-min',
    iq: '.box-iq',
    q2: '.box-q2',
    max: '.box-max',
    upperOutliers: [],
  }],
  data: [{ z: '3', lowerOutliers: [], min: 97, q1: 150, q2: 180, q3: 210, max: 245, upperOutliers: [] }],
};

/**
 * A box plot as py-maidr writes one, its parts in py-maidr's order: the box
 * has no lower outlier, and its lower outliers are still named, as the first
 * none of the box's outliers, so that first selector matches nothing.
 * py-maidr's own selectors filter with `:nth-child(-n+0 of use…)`, which
 * jsdom cannot parse; this names the same nothing.
 */
const PY_BOXES: MaidrLayer = {
  id: 'boxes',
  type: TraceType.BOX,
  title: 'Scores by Group',
  selectors: [{
    lowerOutliers: ['.box-fliers > use:nth-child(-n+0)'],
    min: '.box-min',
    max: '.box-max',
    q2: '.box-q2',
    iq: '.box-iq',
    upperOutliers: ['.box-fliers > use:nth-child(n+1)'],
  }],
  data: [{ z: '1', lowerOutliers: [], min: 10, q1: 12, q2: 14, q3: 16, max: 18, upperOutliers: [50] }],
};

/** A candlestick chart, its marks named by part. */
const CANDLES: MaidrLayer = {
  id: 'candles',
  type: TraceType.CANDLESTICK,
  title: 'Daily Price',
  selectors: { body: '.candle-body', wickHigh: '.candle-high', wickLow: '.candle-low' },
  data: [
    { value: 'Mon', open: 10, high: 12, low: 8, close: 11, volume: 100, trend: 'Bull', volatility: 4 },
    { value: 'Tue', open: 11, high: 13, low: 9, close: 10, volume: 100, trend: 'Bear', volatility: 4 },
  ],
};

/**
 * Draws a box plot's parts: its whiskers, its box, its median, and one
 * outlier above it.
 * @param parent What it is drawn in
 * @param at Where it is drawn
 */
function drawBoxes(parent: Element, at: Place): void {
  for (const part of ['box-min', 'box-iq', 'box-q2', 'box-max']) {
    draw(parent, part === 'box-iq' ? 'polygon' : 'polyline', part, at);
  }
  draw(draw(parent, 'g', 'box-fliers', at), 'use', 'box-flier', at);
}

/**
 * Draws a candlestick chart's bodies and wicks.
 * @param parent What it is drawn in
 * @param at Where it is drawn
 */
function drawCandles(parent: Element, at: Place): void {
  for (const part of ['candle-body', 'candle-high', 'candle-low']) {
    draw(parent, part === 'candle-body' ? 'rect' : 'line', part, at);
    draw(parent, part === 'candle-body' ? 'rect' : 'line', part, at);
  }
}

/**
 * A figure of two panels, one above the other, written top row first, as
 * r-maidr writes a Base R `par(mfrow = c(2, 1))` figure and py-maidr a
 * matplotlib `subplots(2, 1)` one.
 * @param upper The upper panel's layer
 * @param lower The lower panel's layer
 * @returns The payload
 */
function stacked(upper: MaidrLayer, lower: MaidrLayer): Maidr {
  return { id: 'stacked-figure', subplots: [[{ layers: [upper] }], [{ layers: [lower] }]] };
}

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  // jsdom lays nothing out; the box plot's highlight is built from this.
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 20, height: 20 }),
    configurable: true,
  });
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const at = drawnAt.get(this) ?? { top: 0, left: 0 };
    const size = drawnAt.has(this) ? 20 : 0;
    return {
      top: at.top,
      left: at.left,
      width: size,
      height: size,
      right: at.left + size,
      bottom: at.top + size,
      x: at.left,
      y: at.top,
      toJSON: () => ({}),
    } as DOMRect;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  drawnAt.clear();
  document.body.innerHTML = '';
});

describe('a lobby whose panels are measured through their marks', () => {
  it.each([
    ['a box plot', R_BOXES, drawBoxes],
    ['a box plot whose first part names nothing', PY_BOXES, drawBoxes],
    ['a candlestick chart', CANDLES, drawCandles],
  ])('moves down to %s drawn below, and refuses to move up from the top', (_, lower, drawLower) => {
    draw(svg, 'rect', 'bar', ABOVE);
    draw(svg, 'rect', 'bar', { top: ABOVE.top + 40, left: ABOVE.left + 60 });
    drawLower(svg, BELOW);
    const figure = new Figure(stacked(BARS, lower));
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    figure.moveOnce('FORWARD');

    const refusedUp = figure.moveOnce('UPWARD');
    const movedDown = figure.moveOnce('DOWNWARD');

    expect(refusedUp).toBe(false);
    expect(movedDown).toBe(true);
    expect(figure.activeSubplot).toBe(figure.subplots[1][0]);
    expect(figure.state).toMatchObject({ empty: false, index: 2 });
  });

  it('opens on a box plot drawn above in its axes group, though its first part names nothing', () => {
    const upper = draw(svg, 'g', 'axes', { top: 20, left: 40 });
    upper.setAttribute('id', 'axes_1');
    drawBoxes(upper, ABOVE);
    const lower = draw(svg, 'g', 'axes', { top: 320, left: 40 });
    lower.setAttribute('id', 'axes_2');
    draw(lower, 'path', 'bar', BELOW);
    const figure = new Figure(stacked(PY_BOXES, BARS));
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    figure.moveOnce('FORWARD');
    const opensOn = figure.activeSubplot;

    const refusedUp = figure.moveOnce('UPWARD');
    const movedDown = figure.moveOnce('DOWNWARD');

    expect(opensOn).toBe(figure.subplots[0][0]);
    expect(refusedUp).toBe(false);
    expect(movedDown).toBe(true);
    expect(figure.activeSubplot).toBe(figure.subplots[1][0]);
    expect(figure.state).toMatchObject({ empty: false, index: 2 });
  });
});
