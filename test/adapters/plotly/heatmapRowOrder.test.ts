/**
 * @jest-environment jsdom
 */

/**
 * A plotly heatmap has to arrive top-first (#971).
 *
 * `HeatmapData` runs top-first and `Heatmap` turns it over so its own row 0
 * is the bottom of the drawn grid, which is what makes ArrowUp move visually
 * up. Plotly numbers a heatmap's rows from the *bottom*, so passing its `y`
 * and `z` through unchanged stood the chart on its head: the cursor entered
 * at the top and ArrowUp walked down it.
 *
 * Measured from plotly.js 3.7.0 in Chromium, for
 * `y: ['first','second','third']` — `yaxis.c2p(0) = 266.67` against
 * `c2p(2) = 53.33`, and a smaller pixel is higher on screen, so 'first' is
 * the bottom row. The ranges below are what plotly resolved for each case.
 */
import type { PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Plotly draws y[0] at the bottom; the range runs low to high. */
const UPWARD = [-0.5, 2.5];
/** A reversed axis: plotly draws y[0] at the top, and the range runs high to low. */
const REVERSED = [2.5, -0.5];

/** Row labels bottom-first, the order plotly hands them over in. */
const Y = ['first', 'second', 'third'];
/** `z[0]` is 'first', plotly's bottom row. */
const Z = [[1, 2], [3, 4], [5, 6]];

/**
 * A rendered plotly div holding one heatmap.
 * @param range - The y axis's resolved range
 * @returns The graph div
 */
function graphDiv(range: number[]): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = [
    { type: 'heatmap', x: ['c1', 'c2'], y: Y, z: Z } as unknown as PlotlyTrace,
  ];
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: { type: 'category', range: [-0.5, 1.5] },
    yaxis: { type: 'category', range, autorange: true },
  };
  return gd;
}

/**
 * The heatmap data a plotly div converts to.
 * @param range - The y axis's resolved range
 * @returns The emitted data
 */
function dataFor(range: number[]): HeatmapData {
  const layer = extractPlotlyData(graphDiv(range))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer.data as HeatmapData;
}

/**
 * Where the cursor lands, and where one ArrowUp takes it.
 * @param range - The y axis's resolved range
 * @returns The row label at entry and after moving up
 */
function walkUp(range: number[]): { entry: unknown; afterUp: unknown } {
  const layer = extractPlotlyData(graphDiv(range))?.subplots[0][0].layers[0];
  const trace = TraceFactory.create(layer as MaidrLayer) as unknown as {
    state: { text?: { cross?: { value?: unknown } } };
    moveOnce: (direction: string) => boolean;
  };
  const entry = trace.state.text?.cross?.value;
  // The first move only settles the cursor, so step twice to actually travel.
  trace.moveOnce('UPWARD');
  trace.moveOnce('UPWARD');
  return { entry, afterUp: trace.state.text?.cross?.value };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an ordinary plotly heatmap', () => {
  it('is emitted top row first', () => {
    // Plotly hands over 'first', 'second', 'third' bottom-up; the top row is
    // 'third', so that is what the layer has to lead with.
    expect(dataFor(UPWARD).y).toEqual(['third', 'second', 'first']);
  });

  it('turns the values over with their labels', () => {
    expect(dataFor(UPWARD).points).toEqual([[5, 6], [3, 4], [1, 2]]);
  });

  it('leaves the columns alone', () => {
    expect(dataFor(UPWARD).x).toEqual(['c1', 'c2']);
  });

  it('enters at the bottom row and moves up from there', () => {
    // Before the fix the cursor entered at 'third' — the top — and ArrowUp
    // took it to 'second', walking down the chart.
    const { entry, afterUp } = walkUp(UPWARD);

    expect(entry).toBe('first');
    expect(afterUp).toBe('second');
  });
});

describe('a plotly heatmap on a reversed y axis', () => {
  it('is left as plotly gave it', () => {
    // A reversed axis draws y[0] at the top already, which is the order the
    // grammar asks for. Reversing here would put it back upside down.
    expect(dataFor(REVERSED).y).toEqual(['first', 'second', 'third']);
    expect(dataFor(REVERSED).points).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('still enters at the bottom row', () => {
    // 'third' is drawn at the bottom when the axis is reversed.
    const { entry, afterUp } = walkUp(REVERSED);

    expect(entry).toBe('third');
    expect(afterUp).toBe('second');
  });
});

describe('either way round', () => {
  it('keeps every value on its own label', () => {
    // The pairing survived the bug too — both arrays were reversed together —
    // so it is the part a fix must not break rather than the part it fixes.
    for (const range of [UPWARD, REVERSED]) {
      const { y, points } = dataFor(range);
      const valueOf = (label: string): (number | null)[] => points[y.indexOf(label)];

      expect(valueOf('first')).toEqual([1, 2]);
      expect(valueOf('second')).toEqual([3, 4]);
      expect(valueOf('third')).toEqual([5, 6]);
    }
  });
});
