/**
 * @jest-environment jsdom
 *
 * The bin `d3.bin()` closes at the end of its domain, read as the chart draws
 * it: not at all.
 *
 * `d3.bin()` closes its last bin at the end of the domain itself, so a
 * threshold there -- `x.ticks()` gives one -- adds a bin from the end to
 * itself, which every value at the very end goes in. The chart draws it 0 px
 * wide. The binder read it with the rest, so the reader was told of 21 bins on
 * a chart of 20, the last "100 to 100", and the values at 100, which the chart
 * does not show, counted there.
 *
 * The charts are drawn with the real d3, as a page draws them.
 */

import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bindD3Histogram } from '@adapters/d3/binders/histogram';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const ROOT = resolve(__dirname, '../../..');

/** d3 as a page loads it, a classic script that sets `window.d3`. */
const D3_SOURCE = readFileSync(join(ROOT, 'node_modules/d3/dist/d3.min.js'), 'utf8');

/**
 * Evaluates a script in the page's global scope, as a `<script>` element does.
 *
 * @param source - The script
 */
function runScript(source: string): void {
  // eslint-disable-next-line no-eval -- the chart is drawn by d3 itself, as a page draws it
  (0, eval)(source);
}

beforeAll(() => {
  runScript(D3_SOURCE);
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

/** Every threshold `x.ticks(20)` gives on 0 to 100, the domain's end among them. */
const TICKS = 'x.ticks(20)';

/**
 * Runs a drawing script against an empty chart, `#scores`.
 *
 * @param script - The script, which draws into `#scores`
 * @returns The chart
 */
function draw(script: string): SVGSVGElement {
  document.body.innerHTML = '<svg id="scores" width="400" height="200"></svg>';
  runScript(script);
  const svg = document.getElementById('scores');
  if (svg === null) {
    throw new Error('d3 drew no chart');
  }
  return svg as unknown as SVGSVGElement;
}

/**
 * Draws a histogram of scores from 0 to 100, 4 px a point, as the D3 example
 * page drew it: a bar per bin, 1 px short of the bin's width.
 *
 * @param values - The scores
 * @param thresholds - The expression the bins' thresholds are given by
 * @returns The chart
 */
function drawHistogram(values: number[], thresholds: string): SVGSVGElement {
  return draw(`(() => {
    const x = d3.scaleLinear().domain([0, 100]).range([0, 400]);
    const bins = d3.bin().domain(x.domain()).thresholds(${thresholds})(${JSON.stringify(values)});
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).range([200, 0]);
    d3.select('#scores').selectAll('rect.bar').data(bins).join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.x0) + 1)
      .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr('y', d => y(d.length))
      .attr('height', d => y(0) - y(d.length));
  })();`);
}

/**
 * Binds one bar to each datum, as a join of pre-aggregated bins leaves them.
 *
 * @param data - One datum per bar
 * @returns The chart
 */
function drawBars(data: Record<string, number>[]): SVGSVGElement {
  return draw(`d3.select('#scores').selectAll('rect.bar').data(${JSON.stringify(data)}).join('rect').attr('class', 'bar');`);
}

/**
 * Binds a chart as the D3 docs bind a `d3.bin()` histogram.
 *
 * @param svg - The chart
 * @returns The layer
 */
function bind(svg: SVGSVGElement): MaidrLayer {
  return bindD3Histogram(svg, {
    selector: 'rect.bar',
    title: 'Scores',
    axes: { x: 'Score', y: 'Count' },
    x: 'x0',
    y: 'length',
    xMin: 'x0',
    xMax: 'x1',
  }).layer;
}

/**
 * Each bin's edges.
 *
 * @param layer - The layer
 * @returns `[xMin, xMax]` per bin
 */
function edges(layer: MaidrLayer): [number, number][] {
  return (layer.data as HistogramPoint[]).map(bin => [bin.xMin, bin.xMax]);
}

/**
 * Where each bin the core reads is outlined: the drawn bar's `x` and `width`,
 * to the pixel, since d3's scale leaves some of them a float's width off.
 *
 * @param layer - The layer
 * @returns One line per bin
 */
function outlines(layer: MaidrLayer): string[] {
  const trace = TraceFactory.create(layer);
  const bins = (layer.data as HistogramPoint[]).length;
  const lines = Array.from({ length: bins }, (_, col) => {
    const state = trace.getStateAt(0, col);
    if (state.empty || state.highlight.empty) {
      return `${col}: no highlight`;
    }
    const { elements } = state.highlight;
    const bar = Array.isArray(elements) ? elements[0] : elements;
    const pixel = (attribute: string): number => Math.round(Number(bar.getAttribute(attribute)));
    return `${col}: x ${pixel('x')}, width ${pixel('width')}`;
  });
  trace.dispose();
  return lines;
}

/** Scores short of 100, as the example page drew them. */
const SHORT_OF_THE_END = [3, 17, 42, 42.5, 77, 99.9];

/** Two scores at the very end of the domain. */
const AT_THE_END = [3, 17, 42, 77, 100, 100];

describe('a d3.bin() histogram whose thresholds include the end of its domain', () => {
  it('reads the 20 bins the chart draws, not the empty 21st from 100 to 100', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const layer = bind(drawHistogram(SHORT_OF_THE_END, TICKS));

    expect(edges(layer)).toHaveLength(20);
    expect(edges(layer).at(-1)).toEqual([95, 100]);
    expect(edges(layer).filter(([from, to]) => from === to)).toEqual([]);
    // Nothing is lost with an empty bin, so nothing needs saying.
    expect(warn).not.toHaveBeenCalled();
  });

  it('outlines each bin it reads on the bar drawn for it', () => {
    const layer = bind(drawHistogram(SHORT_OF_THE_END, TICKS));

    expect(outlines(layer)).toEqual(Array.from({ length: 20 }, (_, col) => `${col}: x ${col * 20 + 1}, width 19`));
  });

  it('leaves out the bin holding the values at 100, which the chart does not show, and says so', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const layer = bind(drawHistogram(AT_THE_END, TICKS));

    expect(edges(layer)).toHaveLength(20);
    expect((layer.data as HistogramPoint[]).at(-1)).toMatchObject({ xMin: 95, xMax: 100, y: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('a bin from 100 to 100, drawn 0 px wide, so it is left out with the 2 it holds');
  });
});

describe('a histogram with no bin 0 wide', () => {
  it('keeps every bin, and one selector for all of them', () => {
    const layer = bind(drawHistogram(AT_THE_END, `${TICKS}.filter(t => t < 100)`));

    expect(edges(layer)).toHaveLength(20);
    expect((layer.data as HistogramPoint[]).at(-1)).toMatchObject({ xMin: 95, xMax: 100, y: 2 });
    expect(layer.selectors).toBe('#scores rect.bar');
  });

  it('keeps every bin of a histogram bound as points at its x values', () => {
    // Pre-aggregated, with no edges anywhere: every bin is a point, as the
    // binder reads such a histogram, and none is left out.
    const svg = drawBars([{ x: 5, y: 3 }, { x: 15, y: 4 }, { x: 25, y: 1 }]);

    const layer = bindD3Histogram(svg, { selector: 'rect.bar' }).layer;

    expect(edges(layer)).toEqual([[5, 5], [15, 15], [25, 25]]);
  });

  it('keeps every bin of a histogram whose every stated bin is a point', () => {
    const svg = drawBars([{ at: 5, n: 3 }, { at: 15, n: 4 }]);

    const layer = bindD3Histogram(svg, { selector: 'rect.bar', x: 'at', y: 'n', xMin: 'at', xMax: 'at' }).layer;

    expect(edges(layer)).toEqual([[5, 5], [15, 15]]);
  });
});
