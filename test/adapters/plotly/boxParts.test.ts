/**
 * @jest-environment jsdom
 */

/**
 * The parts of a plotly box, read out of the path plotly draws it with.
 *
 * Plotly draws a box, a violin's inner box and a candle as the subpaths of
 * one `path.box`: the median, the body, the two whiskers and, on a box, the
 * two caps. `splitBoxes` draws each part again, hidden, for the selectors to
 * name. The paths below are the ones plotly.js 2.35.2 drew in Chromium for
 * `examples/plotly-box.html`, `examples/plotly-violin.html` and
 * `examples/plotly-candlestick.html`; `boxHighlight.test.ts` checks what the
 * reader is shown with them.
 */

import { disconnectPlotlyObservers } from '@adapters/plotly/normalizer';
import { boxParts, splitBoxes } from '@adapters/plotly/split';
import { afterEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Setosa in the box example: median 243.37, quartiles 273.68 and 213.05, caps at 304 and 167.58. */
const BOX = 'M42.5,243.37H124.17M42.5,273.68H124.17V213.05H42.5ZM83.33,273.68V304M83.33,213.05V167.58M62.92,304H103.75M62.92,167.58H103.75';
/** Setosa's inner box in the violin example: no caps, so the whiskers end it. */
const VIOLIN_BOX = 'M73.13,218.96H93.54M73.13,241.6H93.54V196.32H73.13ZM83.33,241.6V264.23M83.33,196.32V162.37';
/** The 2024-01-03 candle: opened at 152.12 px and closed at its low, 178.53 px, so its lower wick has no length; the upper one runs to 125.71. */
const CANDLE = 'M45.18,177.53H62.82M45.18,178.53H62.82V152.12H45.18ZM54,178.53V178.53M54,152.12V125.71';

/** A box drawn on its side, as plotly draws one given its samples on x. */
const SIDEWAYS = 'M243,42.5V124M273,42.5V124H213V42.5ZM273,83V304M213,83V167M304,62V103M167,62V103';

/** The line a part draws, read off its attributes. */
function lineOf(element: Element | undefined): number[] {
  return ['x1', 'y1', 'x2', 'y2'].map(name => Number(element?.getAttribute(name)));
}

describe('reading a plotly box path', () => {
  it('reads the body, its quartile edges, the median and the caps of a box', () => {
    const parts = boxParts(BOX);

    expect(parts?.get('iq')).toBe('M42.5,273.68H124.17V213.05H42.5Z');
    expect(parts?.get('q1')).toEqual({ x1: 42.5, y1: 273.68, x2: 124.17, y2: 273.68 });
    expect(parts?.get('q2')).toEqual({ x1: 42.5, y1: 243.37, x2: 124.17, y2: 243.37 });
    expect(parts?.get('q3')).toEqual({ x1: 124.17, y1: 213.05, x2: 42.5, y2: 213.05 });
    expect(parts?.get('min')).toEqual({ x1: 62.92, y1: 304, x2: 103.75, y2: 304 });
    expect(parts?.get('max')).toEqual({ x1: 62.92, y1: 167.58, x2: 103.75, y2: 167.58 });
  });

  it('takes the whiskers for the extremes where no caps are drawn', () => {
    const parts = boxParts(VIOLIN_BOX);

    expect(parts?.get('q1')).toEqual({ x1: 73.13, y1: 241.6, x2: 93.54, y2: 241.6 });
    expect(parts?.get('q3')).toEqual({ x1: 93.54, y1: 196.32, x2: 73.13, y2: 196.32 });
    expect(parts?.get('min')).toEqual({ x1: 83.33, y1: 241.6, x2: 83.33, y2: 264.23 });
    expect(parts?.get('max')).toEqual({ x1: 83.33, y1: 196.32, x2: 83.33, y2: 162.37 });
  });

  it('reads a candle\'s body and its wicks, a wick of no length included', () => {
    const parts = boxParts(CANDLE);

    expect(parts?.get('iq')).toBe('M45.18,178.53H62.82V152.12H45.18Z');
    expect(parts?.get('min')).toEqual({ x1: 54, y1: 178.53, x2: 54, y2: 178.53 });
    expect(parts?.get('max')).toEqual({ x1: 54, y1: 152.12, x2: 54, y2: 125.71 });
  });

  it('reads a box on its side across the value axis', () => {
    const parts = boxParts(SIDEWAYS);

    expect(parts?.get('q1')).toEqual({ x1: 273, y1: 42.5, x2: 273, y2: 124 });
    expect(parts?.get('q2')).toEqual({ x1: 243, y1: 42.5, x2: 243, y2: 124 });
    expect(parts?.get('q3')).toEqual({ x1: 213, y1: 124, x2: 213, y2: 42.5 });
    expect(parts?.get('max')).toEqual({ x1: 167, y1: 62, x2: 167, y2: 103 });
  });

  it('reads the quartile edges of a notched box past its notches', () => {
    const notched = 'M50,240H110M40,270H120V255L110,240L120,225V210H40V225L50,240L40,255ZM80,270V300M80,210V170';

    const parts = boxParts(notched);

    expect(parts?.get('q1')).toEqual({ x1: 40, y1: 270, x2: 120, y2: 270 });
    expect(parts?.get('q3')).toEqual({ x1: 120, y1: 210, x2: 40, y2: 210 });
  });

  it('leaves out the extremes of a box drawn without whiskers', () => {
    const parts = boxParts('M42.5,243.37H124.17M42.5,273.68H124.17V213.05H42.5Z');

    expect(parts?.has('min')).toBe(false);
    expect(parts?.has('max')).toBe(false);
    expect(parts?.get('q2')).toEqual({ x1: 42.5, y1: 243.37, x2: 124.17, y2: 243.37 });
  });

  it('reads no parts out of a path in any other shape', () => {
    expect(boxParts('M0,0Z')).toBeNull();
    expect(boxParts('M0,0C1,1 2,2 3,3M4,4H5')).toBeNull();
    expect(boxParts('m42.5,243.37h80m0,30h80v-60h-80z')).toBeNull();
  });
});

/**
 * A trace group holding plotly's boxes, followed by the points group plotly
 * draws after them.
 * @param paths - Each box's `d`
 * @returns The group
 */
function boxGroup(paths: string[]): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  group.setAttribute('class', 'trace boxes');
  for (const d of paths) {
    const box = document.createElementNS(SVG_NS, 'path');
    box.setAttribute('class', 'box');
    box.setAttribute('d', d);
    box.setAttribute('style', 'stroke-width: 2px; stroke: rgb(31, 119, 180);');
    group.appendChild(box);
  }
  const points = document.createElementNS(SVG_NS, 'g');
  points.setAttribute('class', 'points');
  group.appendChild(points);
  document.body.appendChild(document.createElementNS(SVG_NS, 'svg')).appendChild(group);
  return group;
}

/** The part of the given box, by name. */
function partOf(group: Element, index: number, name: string): Element | undefined {
  return group.querySelector(`[data-maidr-index="${index}"][data-maidr-part="${name}"]`) ?? undefined;
}

describe('splitting plotly\'s boxes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('draws each part hidden, after everything plotly drew in the group', () => {
    const group = boxGroup([BOX, VIOLIN_BOX]);

    splitBoxes(group);

    const children = Array.from(group.children);
    expect(children.slice(0, 3).map(child => child.getAttribute('class'))).toEqual(['box', 'box', 'points']);
    expect(lineOf(partOf(group, 1, 'q1'))).toEqual([73.13, 241.6, 93.54, 241.6]);
    expect(partOf(group, 0, 'iq')?.getAttribute('d')).toBe('M42.5,273.68H124.17V213.05H42.5Z');
    expect(partOf(group, 0, 'min')?.getAttribute('visibility')).toBe('hidden');
    expect(partOf(group, 0, 'min')?.getAttribute('style')).toContain('stroke-width: 2px');
  });

  it('draws the parts once however often it is asked', () => {
    const group = boxGroup([BOX]);

    splitBoxes(group);
    splitBoxes(group);

    expect(group.querySelectorAll('[data-maidr-part]')).toHaveLength(6);
  });

  it('gives every part the whole box when the path is in no shape it knows', () => {
    const group = boxGroup(['M0,0C1,1 2,2 3,3']);

    splitBoxes(group);

    expect(partOf(group, 0, 'q2')?.getAttribute('d')).toBe('M0,0C1,1 2,2 3,3');
    expect(partOf(group, 0, 'max')?.getAttribute('d')).toBe('M0,0C1,1 2,2 3,3');
  });

  it('follows a box plotly draws again', async () => {
    const group = boxGroup([BOX]);
    splitBoxes(group);

    group.querySelector('path.box')?.setAttribute('d', VIOLIN_BOX);
    await Promise.resolve();

    expect(lineOf(partOf(group, 0, 'q1'))).toEqual([73.13, 241.6, 93.54, 241.6]);
    expect(group.querySelectorAll('[data-maidr-part]')).toHaveLength(6);
  });

  it('stops following a group with the adapter\'s other observers, and again once split again', async () => {
    const group = boxGroup([BOX]);
    const box = group.querySelector('path.box');
    splitBoxes(group);

    disconnectPlotlyObservers(document.body);
    box?.setAttribute('d', VIOLIN_BOX);
    await Promise.resolve();
    expect(lineOf(partOf(group, 0, 'q1'))).toEqual([42.5, 273.68, 124.17, 273.68]);

    splitBoxes(group);
    expect(lineOf(partOf(group, 0, 'q1'))).toEqual([73.13, 241.6, 93.54, 241.6]);
    box?.setAttribute('d', BOX);
    await Promise.resolve();
    expect(lineOf(partOf(group, 0, 'q1'))).toEqual([42.5, 273.68, 124.17, 273.68]);
  });
});
