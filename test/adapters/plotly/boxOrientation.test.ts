/**
 * @jest-environment jsdom
 */

/**
 * A plotly box plot given its samples on `x` was read as an upright one.
 *
 * Plotly turns a box plot on its side the same way it turns a histogram or a
 * bar: the samples go on the other axis, and it resolves that to
 * `orientation: 'h'` on the full trace whether or not the author wrote one.
 * `extractMultiBoxLayer` never asked, so a sideways chart came out declaring
 * nothing, which resolves to `vert`.
 *
 * Measured in Chromium on plotly.js 2.35.2, two species of petal lengths, once
 * as `{y: samples}` and once as `{x: samples}` with the axes titled to match:
 *
 *   trace          _fullData.orientation   announced on the first box
 *   {y: samples}   'v'                     "Species is Setosa, no Lower outlier(s) for Petal Length"
 *   {x: samples}   'h'                     "Petal Length is Setosa, no Lower outlier(s) for Species"
 *
 * The second row names the species as a petal length and the petal length as a
 * species: `BoxTrace` takes the group off `axes.x` unless the layer says
 * `horz`, and the axis titles had already moved with the chart.
 *
 * Nothing in the payload moves with the key -- a `BoxPoint` carries no `x` or
 * `y` -- and the axis titles are left as plotly's layout has them, since
 * plotly's `xaxis` is the axis it draws across the page in both orientations.
 * What moves is the reading, and the walk: the arrow keys cross the sections
 * of one distribution rather than crossing the distributions.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { BoxPoint, MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Two summaries, as plotly computes them into calcdata. */
const SUMMARIES = [
  { name: 'Setosa', min: 1, q1: 2, med: 3, q3: 4, max: 5 },
  { name: 'Virginica', min: 3, q1: 4, med: 5, q3: 6, max: 7 },
];

/**
 * A rendered plotly div holding two box traces.
 *
 * @param horizontal - Whether the samples were given on `x` rather than `y`
 * @returns The graph div
 */
function graphDiv(horizontal: boolean): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const traces = SUMMARIES.map(summary => ({
    type: 'box',
    name: summary.name,
    orientation: horizontal ? 'h' : 'v',
    [horizontal ? 'x' : 'y']: [summary.min, summary.q1, summary.med, summary.q3, summary.max],
  }) as unknown as PlotlyTrace);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = traces;
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: {
      type: horizontal ? 'linear' : 'category',
      title: { text: horizontal ? 'Petal Length' : 'Species' },
    },
    yaxis: {
      type: horizontal ? 'category' : 'linear',
      title: { text: horizontal ? 'Species' : 'Petal Length' },
    },
  };
  (gd as unknown as { calcdata: PlotlyCalcData[][] }).calcdata = SUMMARIES.map(
    summary => [summary as unknown as PlotlyCalcData],
  );
  return gd;
}

/**
 * The layer two box traces converge into.
 * @param horizontal - Whether the samples were given on `x`
 * @returns The emitted layer
 */
function layerFor(horizontal: boolean): MaidrLayer {
  const layer = extractPlotlyData(graphDiv(horizontal))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an upright plotly box plot', () => {
  it('says nothing about orientation, which is `vert`', () => {
    const layer = layerFor(false);

    expect(layer.type).toBe(TraceType.BOX);
    expect(layer.orientation).toBeUndefined();
  });
});

describe('a plotly box plot given its samples on x', () => {
  it('says it is drawn sideways', () => {
    expect(layerFor(true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('names each box the same way round either way', () => {
    // The summary is not what moves. Read the upright way, this chart still
    // announced every number it holds -- against the wrong axis each time.
    const sideways = layerFor(true).data as BoxPoint[];

    expect(sideways.map(box => box.z)).toEqual(['Setosa', 'Virginica']);
    expect(sideways).toEqual(layerFor(false).data as BoxPoint[]);
  });

  it('keeps the axis titles plotly drew', () => {
    // Plotly's `xaxis` is the axis it draws across the page in both
    // orientations, so the titles already name the axes as drawn --
    // `BoxTrace` reads the group off `axes.y` for a horizontal layer.
    expect(layerFor(true).axes).toEqual({
      x: { label: 'Petal Length' },
      y: { label: 'Species' },
    });
  });
});
