/**
 * @jest-environment jsdom
 */

/**
 * Where MAIDR's copies of a plotly chart's marks go.
 *
 * Plotly looks its marks up again inside a trace's group whenever it restyles
 * or redraws it, and reads the datum it bound to each: a bar trace styles
 * every `path` in its `g.points`, a pie every `path.surface` of a trace, and a
 * scatter trace hands its points out to every `path.point` in turn. MAIDR's
 * copies, made when the chart takes focus, used to sit beside their marks
 * with the same tags and classes and no datum: `Plotly.relayout`, `restyle`
 * and `react` threw on a focused bar chart's copies, and a focused scatter
 * trace gave half its points to them.
 *
 * Once a chart is normalized, its copies go after every trace group of the
 * mark's layer, and are still paired with their marks.
 */

import type { Maidr } from '@type/grammar';
import { normalizePlotlySvg } from '@adapters/plotly/normalizer';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { TraceType } from '@type/grammar';
import { Svg } from '@util/svg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** What plotly binds to a mark, enough to tell its marks from MAIDR's copies. */
interface Bound {
  __data__?: unknown;
}

beforeAll(() => {
  // The layout observer polls for MAIDR's article; nothing here mounts one.
  window.requestAnimationFrame = () => 0;
});

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

/**
 * Draws a plotly chart, binds a datum to each mark as plotly does, and
 * normalizes it as MAIDR does when it binds the chart.
 * @param layers - The markup of the panel's layers
 * @param marks - A selector naming the marks plotly bound data to
 * @param figureLayers - The markup of the layers drawn outside the panels
 * @returns The chart's `svg.main-svg`
 */
function plotlyChart(layers: string, marks: string, figureLayers = ''): SVGSVGElement {
  document.body.innerHTML = '<div class="js-plotly-plot"><div class="svg-container">'
    + `<svg class="main-svg" xmlns="${SVG_NS}"><g class="cartesianlayer"><g class="subplot xy">`
    + `<g class="plot">${layers}</g></g></g>${figureLayers}</svg></div></div>`;
  document.querySelectorAll(marks).forEach((mark, i) => {
    (mark as Bound).__data__ = { i };
  });
  const svg = document.querySelector('svg.main-svg') as SVGSVGElement;
  const schema: Maidr = {
    id: 'chart',
    subplots: [[{ layers: [{ id: '0', type: TraceType.BAR, data: [{ x: 'a', y: 1 }] }] }]],
  };
  normalizePlotlySvg(svg, schema);
  return svg;
}

/**
 * How many of the elements a selector matches carry no datum, as a copy does.
 * @param root - Where plotly looks
 * @param selector - What it looks for
 * @returns The count, and how many it found in all
 */
function unbound(root: Element, selector: string): { found: number; unbound: number } {
  const found = Array.from(root.querySelectorAll(selector));
  return { found: found.length, unbound: found.filter(el => (el as Bound).__data__ === undefined).length };
}

const BARS = '<g class="barlayer mlayer"><g class="trace bars"><g class="points">'
  + '<g class="point"><path id="b0" d="M0,100V60H20V100Z"/></g>'
  + '<g class="point"><path id="b1" d="M30,100V40H50V100Z"/></g>'
  + '<g class="point"><path id="b2" d="M60,100V20H80V100Z"/></g>'
  + '</g></g></g>';

const BAR_SELECTOR = '.barlayer > g.trace.bars:nth-of-type(1) > g.points > g.point > path';

describe('copies of the marks of a focused plotly chart', () => {
  it('leave a bar trace\'s g.points holding only the bars plotly bound data to', () => {
    const svg = plotlyChart(BARS, '.point > path');

    const copies = Svg.selectAllElements(BAR_SELECTOR);

    // Plotly's style pass reads a datum from every `path` it finds here.
    expect(unbound(svg.querySelector('g.points') as Element, 'path')).toEqual({ found: 3, unbound: 0 });
    expect(copies).toHaveLength(3);
    expect(copies.every(copy => copy.parentElement === svg.querySelector('g.barlayer'))).toBe(true);
  });

  it('pairs each copy with its bar, for high contrast to repaint the bars', () => {
    plotlyChart(BARS, '.point > path');
    const trace = new BarTrace({
      id: 'bars',
      type: TraceType.BAR,
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      selectors: BAR_SELECTOR,
      data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }],
    });

    const originals = trace.getAllOriginalElements();

    expect(originals.map(element => element.id)).toEqual(['b0', 'b1', 'b2']);
    trace.dispose();
  });

  it('draws the highlight of a bar outside g.points too', () => {
    const svg = plotlyChart(BARS, '.point > path');
    const [copy] = Svg.selectAllElements(BAR_SELECTOR);

    const highlight = Svg.createHighlightElement(copy, '#03c809');

    expect(unbound(svg.querySelector('g.points') as Element, 'path')).toEqual({ found: 3, unbound: 0 });
    expect(svg.querySelector('g.barlayer')?.lastElementChild).toBe(highlight);
  });

  it('leave a scatter trace one path.point per point plotly drew', () => {
    const points = Array.from({ length: 4 }, (_, i) =>
      `<path class="point" transform="translate(${i * 10},${i * 5})" d="M3,0A3,3 0 1,1 0,-3Z"/>`).join('');
    const svg = plotlyChart(
      `<g class="scatterlayer mlayer"><g class="trace scatter"><g class="points">${points}</g></g></g>`,
      'path.point',
    );

    Svg.selectAllElements('.scatterlayer g.trace.scatter g.points path.point');

    // Plotly joins its points to these in turn: four, not eight.
    expect(unbound(svg.querySelector('g.points') as Element, 'path.point')).toEqual({ found: 4, unbound: 0 });
  });

  it('leave a pie trace\'s slices to the ones plotly bound data to', () => {
    // A pie's layer is outside the panels, and its style pass looks through
    // the whole trace group.
    const svg = plotlyChart('', 'path.surface', '<g class="pielayer"><g class="trace">'
      + '<g class="slice"><path class="surface" d="M0,0L10,0A10,10 0 0,1 0,10Z"/></g>'
      + '<g class="slice"><path class="surface" d="M0,0L0,10A10,10 0 0,1 -10,0Z"/></g></g></g>');

    Svg.selectAllElements('.pielayer > g.trace:nth-of-type(1) g.slice path.surface');

    expect(unbound(svg.querySelector('.pielayer > g.trace') as Element, 'path.surface')).toEqual({ found: 2, unbound: 0 });
  });

  it('keep a mark drawn inside a moved group beside it, where it is drawn in place', () => {
    const svg = plotlyChart('<g class="scatterlayer mlayer"><g class="trace scatter"><g class="text">'
      + '<g class="textpoint" transform="translate(40,40)"><text id="word">word</text></g></g></g></g>', 'text');

    const [copy] = Svg.selectAllElements('#word');

    expect(svg.querySelector('#word')?.nextElementSibling).toBe(copy);
  });
});
