/**
 * @jest-environment jsdom
 */

/**
 * A plotly histogram binned up the y axis was read as an upright one.
 *
 * `extractHistogramLayer` took the bin position from `cd.p` and the count
 * from `cd.s` — both of which plotly fills the same way whichever axis the
 * samples were binned along — and then wrote them into `x` and `y` as though
 * the bins always ran across the page. It declared no `orientation` either,
 * so the layer said `vert` by omission.
 *
 * Measured in Chromium on plotly.js 2.35.2, twenty petal lengths, once as
 * `{x: samples}` and once as `{y: samples}`:
 *
 *   trace          _fullData.orientation   bins in   calcdata[0]
 *   {x: samples}   'v'                     xbins     {p: 1, s: 3, x: 1, y: 3}
 *   {y: samples}   'h'                     ybins     {p: 1, s: 3, x: 3, y: 1}
 *
 * `p` is the bin and `s` the count in both rows; only which screen axis they
 * belong to moves. Read the vertical way, the sideways chart announced
 * "Count is 0.5 through 1.5, Petal Length is 3" — every number on the chart,
 * each one against the other one's axis, which is the failure
 * {@link MaidrLayer.orientation} exists to prevent. Nothing threw and nothing
 * was missing; the reader was simply told a different chart.
 *
 * The bin size moves with the samples, so `xbins` is empty for a horizontal
 * histogram and the edges silently fell back to the neighbour-gap inference.
 * That is a fallback for a chart plotly has not sized, not the answer for one
 * it has, so the size is read from the axis the bins are actually on.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The samples, and the three bins of width 2 plotly resolves them into. */
const CENTERS = [1, 3, 5];
const COUNTS = [4, 33, 12];
const BIN_SIZE = 2;

/**
 * A rendered plotly div holding one histogram trace.
 *
 * @param horizontal - Whether the samples were given on `y` rather than `x`
 * @param sized      - Whether plotly resolved a bin size (it always does on a
 *                     drawn chart; without one the edges are inferred)
 * @returns The graph div
 */
function graphDiv(horizontal: boolean, sized = true): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const samples = { [horizontal ? 'y' : 'x']: CENTERS };
  const bins = sized ? { [horizontal ? 'ybins' : 'xbins']: { size: BIN_SIZE } } : {};

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = [
    {
      type: 'histogram',
      orientation: horizontal ? 'h' : 'v',
      ...samples,
      ...bins,
    } as unknown as PlotlyTrace,
  ];
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: { type: 'linear', title: { text: horizontal ? 'Count' : 'Petal Length' } },
    yaxis: { type: 'linear', title: { text: horizontal ? 'Petal Length' : 'Count' } },
  };
  (gd as unknown as { calcdata: PlotlyCalcData[][] }).calcdata = [
    CENTERS.map((center, index) => ({
      p: center,
      s: COUNTS[index],
    }) as PlotlyCalcData),
  ];
  return gd;
}

/**
 * The layer a histogram trace converts to.
 * @param horizontal - Whether the samples were given on `y`
 * @param sized      - Whether plotly resolved a bin size
 * @returns The emitted layer
 */
function layerFor(horizontal: boolean, sized = true): MaidrLayer {
  const layer = extractPlotlyData(graphDiv(horizontal, sized))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a plotly histogram binned along x', () => {
  it('is read as an upright one', () => {
    expect(layerFor(false).orientation).toBeUndefined();
  });

  it('puts the bin on x and the count on y', () => {
    const points = layerFor(false).data as HistogramPoint[];

    expect(points[0]).toEqual({ x: 1, y: 4, xMin: 0, xMax: 2, yMin: 0, yMax: 4 });
  });
});

describe('a plotly histogram binned up y', () => {
  it('says it is drawn sideways', () => {
    expect(layerFor(true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('takes the bin bounds from the axis the bins run along', () => {
    // `yMin`/`yMax`, not `xMin`/`xMax`. Read the upright way this announced
    // the count's own extent as the bin — a number on the chart, and not the
    // one the bin is.
    const points = layerFor(true).data as HistogramPoint[];

    expect(points[0]).toEqual({ x: 4, y: 1, xMin: 0, xMax: 4, yMin: 0, yMax: 2 });
  });

  it('sizes the bins from ybins rather than inferring them', () => {
    // The last bin is where the two disagree: inferred from its one neighbour
    // it spans the gap between centres (2), which happens to match here, so
    // the middle bin's *edges* are what a wrong lookup would still get right
    // and the check is that the size was found at all.
    const points = layerFor(true).data as HistogramPoint[];

    expect(points.map(point => [point.yMin, point.yMax])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
    ]);
  });

  it('still infers the edges when plotly resolved no bin size', () => {
    const points = layerFor(true, false).data as HistogramPoint[];

    expect(points[1]).toEqual({ x: 33, y: 3, xMin: 0, xMax: 33, yMin: 2, yMax: 4 });
  });
});
