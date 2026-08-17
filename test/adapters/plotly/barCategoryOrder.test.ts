/**
 * @jest-environment jsdom
 */

/**
 * A plotly bar chart has to be emitted in the order plotly draws it (#987).
 *
 * `categoryorder` sorts the category axis and leaves the trace's own `x` and
 * `y` alone, so the bars arrived in an order the chart does not show. Every
 * label kept its own value and — because plotly renders bars in the trace's
 * order too — the highlight kept landing on the right bar. What was wrong was
 * everything that reads the index as a *position*: the direction arrowing
 * travels, the stereo pan (`BarTrace.audio` pans by `col`), the braille line,
 * and the autoplay sweep.
 *
 * Measured on plotly.js in Chromium for `x: ['charlie','alpha','bravo']`,
 * `y: [3, 1, 2]`, reading each rendered path's own bounding box:
 *
 *   layout                     calcdata p   heights in DOM   heights left→right
 *   (none)                     0, 1, 2      304, 101, 203    304, 101, 203
 *   categoryorder asc          2, 0, 1      304, 101, 203    101, 203, 304
 *   categoryorder total desc   0, 2, 1      304, 101, 203    304, 203, 101
 *   autorange reversed         0, 1, 2      304, 101, 203    203, 101, 304
 *
 * Two things follow. `calcdata[i].p` is already the resolved axis position, so
 * the drawn order is free here — no category list to consult, unlike a heatmap
 * (#985). And the DOM order stays the trace's, which is why the selectors have
 * to be narrowed and permuted alongside the points: reordering the data alone
 * would turn a correct highlight into a wrong one.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An axis drawn from its low end, left to right. */
const FORWARD = [-0.5, 2.5];
/** A reversed axis, which plotly resolves to a high-to-low range. */
const BACKWARD = [2.5, -0.5];

/** Categories in the order the trace names them. */
const X = ['charlie', 'alpha', 'bravo'];
/** Their values, in that same order. */
const Y = [3, 1, 2];

/** The positions plotly resolves when nothing sorts the axis. */
const UNSORTED = [0, 1, 2];
/** What `categoryorder: 'category ascending'` resolves to, measured. */
const SORTED = [2, 0, 1];

/**
 * A rendered plotly div holding one bar trace.
 * @param positions - Each point's resolved axis position, or undefined for none
 * @param range     - The category axis's resolved range
 * @returns The graph div
 */
function graphDiv(positions: (number | undefined)[], range: number[] = FORWARD): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = [
    { type: 'bar', x: X, y: Y } as unknown as PlotlyTrace,
  ];
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: { type: 'category', range },
    yaxis: { type: 'linear', range: [0, 3.5] },
  };
  (gd as unknown as { calcdata: PlotlyCalcData[][] }).calcdata = [
    positions.map((at, index) => ({ p: at, s: Y[index] }) as PlotlyCalcData),
  ];
  return gd;
}

/**
 * The layer a bar trace converts to.
 * @param positions - Each point's resolved axis position
 * @param range     - The category axis's resolved range
 * @returns The emitted layer
 */
function layerFor(positions: (number | undefined)[], range?: number[]): MaidrLayer {
  const layer = extractPlotlyData(graphDiv(positions, range))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

/** The category names a layer announces, in the order it announces them. */
function announced(layer: MaidrLayer): unknown[] {
  return (layer.data as BarPoint[]).map(point => point.x);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a bar chart plotly draws in the trace\'s own order', () => {
  it('announces the bars as the trace names them', () => {
    expect(announced(layerFor(UNSORTED))).toEqual(X);
  });

  it('keeps its one selector rather than narrowing it', () => {
    // Nothing has moved, so there is no reason to take on `nth-child`'s
    // brittleness. The overwhelmingly common chart is left exactly as it was.
    expect(typeof layerFor(UNSORTED).selectors).toBe('string');
  });
});

describe('a bar chart whose categories plotly re-sorts', () => {
  it('announces them left to right as drawn', () => {
    // 'alpha' is drawn at position 0, 'bravo' at 1, 'charlie' at 2. Before the
    // fix this was the trace's order, which is not what the chart shows.
    expect(announced(layerFor(SORTED))).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('carries each value with its own category', () => {
    expect((layerFor(SORTED).data as BarPoint[]).map(point => point.y)).toEqual([1, 2, 3]);
  });

  it('narrows the selector to one per bar', () => {
    const { selectors } = layerFor(SORTED);

    expect(Array.isArray(selectors)).toBe(true);
    expect((selectors as string[]).length).toBe(3);
  });

  it('points each selector at the bar its own point announces', () => {
    // The DOM order is the trace's, so the bar announced first -- 'alpha',
    // which the trace names second -- is the second `.point` in the DOM.
    const selectors = layerFor(SORTED).selectors as string[];

    expect(selectors[0]).toContain(':nth-child(2)');
    expect(selectors[1]).toContain(':nth-child(3)');
    expect(selectors[2]).toContain(':nth-child(1)');
  });

  it('keeps the rest of the selector intact', () => {
    const selectors = layerFor(SORTED).selectors as string[];

    expect(selectors[0].endsWith('.point:nth-child(2) > path')).toBe(true);
    expect(selectors[0].startsWith('.subplot.xy ')).toBe(true);
  });
});

describe('a reversed category axis', () => {
  it('draws the bars right to left, so they come back reversed', () => {
    expect(announced(layerFor(UNSORTED, BACKWARD))).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('composes with a sort rather than replacing it', () => {
    // The sort decides which category sits where along the axis; the reversal
    // decides which end that axis starts from. Both apply.
    expect(announced(layerFor(SORTED, BACKWARD))).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('moves the selectors with them', () => {
    const selectors = layerFor(UNSORTED, BACKWARD).selectors as string[];

    expect(selectors[0]).toContain(':nth-child(3)');
    expect(selectors[2]).toContain(':nth-child(1)');
  });
});

describe('a numeric axis', () => {
  it('reads the bars in numeric order, which is the drawn one', () => {
    // Not a `categoryorder` case at all: plotly resolves a *linear* axis for
    // numeric labels and draws each bar at its own value, so an ascending
    // sweep of `p` is the drawn order there too. Measured with
    // `x: [10, 2, 1]`, `y: [3, 1, 2]` — the bars come out left to right with
    // heights 203, 101, 304, which is `x = 1, 2, 10`, while the DOM keeps the
    // trace's 304, 101, 203.
    const layer = layerFor([10, 2, 1]);

    expect(announced(layer)).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('narrows its selectors too, since the DOM is still the trace order', () => {
    expect(Array.isArray(layerFor([10, 2, 1]).selectors)).toBe(true);
  });
});

describe('an order that cannot be resolved', () => {
  it('leaves a trace plotly has not calculated alone', () => {
    // No position means nothing is known about where the bars are drawn.
    const layer = layerFor([undefined, undefined, undefined]);

    expect(announced(layer)).toEqual(X);
    expect(typeof layer.selectors).toBe('string');
  });

  it('leaves one alone when a single position is missing', () => {
    // A partial answer is not a safer answer: the bar with no position would
    // have to be put somewhere, and any choice would be a guess.
    const layer = layerFor([2, undefined, 1]);

    expect(announced(layer)).toEqual(X);
    expect(typeof layer.selectors).toBe('string');
  });
});
