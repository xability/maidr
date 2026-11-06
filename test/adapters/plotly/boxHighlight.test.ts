/**
 * @jest-environment jsdom
 */

/**
 * A plotly box, a violin's inner box and a candle are highlighted part by part.
 *
 * Plotly draws each as the subpaths of one `path.box`: the median, the body,
 * the two whiskers and, on a box, the two caps. Every statistic named that
 * path, so Minimum, 25%, 50%, 75% and Maximum outlined the whole box alike,
 * a candle's open, high, low and close the whole candle, and on a violin the
 * 25% and 75% lines were drawn along the edges of the path's bounding box, at
 * the whisker ends. Each statistic now names the part of the box it is read
 * at. The paths below are the ones plotly.js 2.35.2 drew in Chromium for
 * `examples/plotly-box.html`, `examples/plotly-violin.html` and
 * `examples/plotly-candlestick.html`.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Setosa in the box example: median 243.37, quartiles 273.68 and 213.05, caps at 304 and 167.58. */
const BOX = 'M42.5,243.37H124.17M42.5,273.68H124.17V213.05H42.5ZM83.33,273.68V304M83.33,213.05V167.58M62.92,304H103.75M62.92,167.58H103.75';
/** Setosa's inner box in the violin example: no caps, so the whiskers end it. */
const VIOLIN_BOX = 'M73.13,218.96H93.54M73.13,241.6H93.54V196.32H73.13ZM83.33,241.6V264.23M83.33,196.32V162.37';
/** The 2024-01-03 candle: opened at 152.12 px and closed at its low, 178.53 px, so its lower wick has no length; the upper one runs to 125.71. */
const CANDLE = 'M45.18,177.53H62.82M45.18,178.53H62.82V152.12H45.18ZM54,178.53V178.53M54,152.12V125.71';

/** The line an element draws, read off its attributes. */
function lineOf(element: Element | undefined): number[] {
  return ['x1', 'y1', 'x2', 'y2'].map(name => Number(element?.getAttribute(name)));
}

/**
 * A rendered plotly chart holding the given box-family traces, each drawn in
 * its own group of the box layer.
 * @param traces   - The resolved traces
 * @param calcdata - What plotly computed for each
 * @param paths    - The boxes each trace drew
 * @returns The graph div
 */
function graphDiv(traces: PlotlyTrace[], calcdata: PlotlyCalcData[][], paths: string[][]): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  const subplot = document.createElementNS(SVG_NS, 'g');
  subplot.setAttribute('class', 'subplot xy');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'boxlayer mlayer');
  for (const boxes of paths) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'trace boxes');
    for (const d of boxes) {
      const box = document.createElementNS(SVG_NS, 'path');
      box.setAttribute('class', 'box');
      box.setAttribute('d', d);
      group.appendChild(box);
    }
    layer.appendChild(group);
  }
  subplot.appendChild(layer);
  svg.appendChild(subplot);
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  gd._fullData = traces;
  gd._fullLayout = {
    xaxis: { domain: [0, 1], title: { text: 'Species' } },
    yaxis: { domain: [0, 1], title: { text: 'Sepal Length (cm)' } },
  };
  gd.calcdata = calcdata;
  return gd;
}

/** The only layer of the chart's only panel. */
function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
  const layers = extractPlotlyData(gd)?.subplots[0][0].layers ?? [];
  expect(layers).toHaveLength(1);
  return layers[0];
}

/** The element highlighted on a cell of a trace built from the layer. */
function highlightAt(layer: MaidrLayer, row: number, col: number): Element {
  const trace = TraceFactory.create(layer);
  trace.moveToIndex(row, col);
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    throw new Error('Expected a highlighted element');
  }
  const elements = state.highlight.elements;
  return Array.isArray(elements) ? elements[0] : elements;
}

/**
 * Measures a path or a line as a browser would, off its own geometry: jsdom
 * lays nothing out, and a violin's quartiles and a candle's open and close
 * are read off the edges of a body's bounding box.
 * @returns The element's bounding box
 */
function measure(this: SVGElement): DOMRect {
  const xs: number[] = [];
  const ys: number[] = [];
  if (this.tagName === 'line') {
    xs.push(Number(this.getAttribute('x1')), Number(this.getAttribute('x2')));
    ys.push(Number(this.getAttribute('y1')), Number(this.getAttribute('y2')));
  } else {
    let x = 0;
    let y = 0;
    for (const step of (this.getAttribute('d') ?? '').match(/[MLHVZ][^MLHVZ]*/g) ?? []) {
      const args = (step.slice(1).match(/-?[\d.]+/g) ?? []).map(Number);
      if (step[0] === 'M' || step[0] === 'L')
        [x, y] = args;
      else if (step[0] === 'H')
        x = args[0];
      else if (step[0] === 'V')
        y = args[0];
      else
        continue;
      xs.push(x);
      ys.push(y);
    }
  }
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top } as DOMRect;
}

// jsdom lays nothing out; every chart here is measured off its geometry.
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', { value: measure, configurable: true });
});

afterAll(() => {
  delete (SVGElement.prototype as { getBBox?: unknown }).getBBox;
});

describe('plotly box highlight', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('outlines each statistic of a box at its own part', () => {
    const layer = onlyLayer(graphDiv(
      [{ type: 'box', y: [2.3, 2.9, 3.5, 4.1, 5], name: 'Setosa' }],
      [[{ min: 2.3, q1: 2.9, med: 3.5, q3: 4.1, max: 5, pts2: [] }]],
      [[BOX]],
    ));

    // A vertical box's rows are its sections, lowest first: the lower
    // outliers, the minimum, 25%, 50%, 75%, the maximum.
    expect(lineOf(highlightAt(layer, 1, 0))).toEqual([62.92, 304, 103.75, 304]);
    expect(lineOf(highlightAt(layer, 2, 0))).toEqual([42.5, 273.68, 124.17, 273.68]);
    expect(lineOf(highlightAt(layer, 3, 0))).toEqual([42.5, 243.37, 124.17, 243.37]);
    expect(lineOf(highlightAt(layer, 4, 0))).toEqual([124.17, 213.05, 42.5, 213.05]);
    expect(lineOf(highlightAt(layer, 5, 0))).toEqual([62.92, 167.58, 103.75, 167.58]);
  });

  it('outlines a candle\'s high and low at its wicks', () => {
    const layer = onlyLayer(graphDiv(
      [{
        type: 'candlestick',
        x: ['2024-01-03'],
        open: [152.5],
        high: [154],
        low: [151],
        close: [151],
      }],
      [[{ min: 151, q1: 151, med: 151, q3: 152.5, max: 154 }]],
      [[CANDLE]],
    ));

    // A candle's rows are its volatility, then its prices from the lowest
    // up; the high and the low are each outlined at their own wick, the
    // upper one running from the body's top to the high and the lower one,
    // of no length here, at the low.
    const outlined = [0, 1, 2, 3, 4].map(row => lineOf(highlightAt(layer, row, 0)));
    expect(outlined).toContainEqual([54, 152.12, 54, 125.71]);
    expect(outlined).toContainEqual([54, 178.53, 54, 178.53]);
  });
});

/**
 * A rendered plotly chart holding one violin with its inner box, drawn as
 * plotly draws Setosa in the violin example.
 * @returns The graph div
 */
function violinDiv(): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  const subplot = document.createElementNS(SVG_NS, 'g');
  subplot.setAttribute('class', 'subplot xy');
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'violinlayer mlayer');
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'trace violins');
  const violin = document.createElementNS(SVG_NS, 'path');
  violin.setAttribute('class', 'violin');
  violin.setAttribute('d', 'M83.33,264.23L60,218.96L83.33,162.37L106,218.96Z');
  const box = document.createElementNS(SVG_NS, 'path');
  box.setAttribute('class', 'box');
  box.setAttribute('d', VIOLIN_BOX);
  group.append(violin, box);
  layer.appendChild(group);
  subplot.appendChild(layer);
  svg.appendChild(subplot);
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  gd._fullData = [{ type: 'violin', y: [4.3, 4.8, 5, 5.2, 5.8], name: 'Setosa', box: { visible: true } }];
  gd._fullLayout = {
    xaxis: { domain: [0, 1], _categories: ['Setosa'], c2p: () => 83.33 },
    yaxis: { domain: [0, 1], title: { text: 'Sepal Length (cm)' }, c2p: value => 600 - 90 * value },
  };
  gd.calcdata = [[{
    pos: 0,
    posCenterPx: 83.33,
    min: 4.3,
    q1: 4.8,
    med: 5,
    q3: 5.2,
    max: 5.8,
    density: [{ v: 0.1, t: 4.3 }, { v: 0.9, t: 5 }, { v: 0.1, t: 5.8 }],
  }]];
  return gd;
}

describe('plotly violin box highlight', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('draws a violin\'s quartiles at the edges of its inner box\'s body', () => {
    const layers = extractPlotlyData(violinDiv())?.subplots[0][0].layers ?? [];
    const boxLayer = layers[0];

    // An upright violin's rows are its sections: the minimum, 25%, 50%,
    // 75%, the maximum. The body runs from 241.6 down the page to 196.32,
    // and the whiskers on to 264.23 and 162.37.
    expect(lineOf(highlightAt(boxLayer, 1, 0))).toEqual([73.13, 241.6, 93.54, 241.6]);
    expect(lineOf(highlightAt(boxLayer, 3, 0))).toEqual([73.13, 196.32, 93.54, 196.32]);
  });

  it('marks a violin\'s extremes at the ends of its whiskers', () => {
    const layers = extractPlotlyData(violinDiv())?.subplots[0][0].layers ?? [];
    const boxLayer = layers[0];

    const minimum = highlightAt(boxLayer, 0, 0);
    expect(Number(minimum.getAttribute('cy'))).toBeCloseTo(264.23);
    const maximum = highlightAt(boxLayer, 4, 0);
    expect(Number(maximum.getAttribute('cy'))).toBeCloseTo(162.37);
  });
});
