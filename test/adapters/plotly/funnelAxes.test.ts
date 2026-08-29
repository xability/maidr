/**
 * @jest-environment jsdom
 */

/**
 * A plotly funnel announced its count as "X".
 *
 * A funnel is drawn on a panel plotly gives no axis titles, so the `axes` the
 * extractor is handed arrive empty and the core falls back to naming the two
 * dimensions after coordinates the chart does not have. Measured in Chromium
 * on plotly.js 2.35.2, the first stage of `{y: stages, x: counts}`:
 *
 *   before   "Stage is Visits, X is 100"
 *   after    "Stage is Visits, Count is 100"
 *
 * The Highcharts, amCharts and ECharts adapters all name the same two
 * dimensions `Stage` and `Count` for the same reason.
 *
 * The pair is written in the order the payload puts them: `axes.x` names
 * whichever axis the point's `x` lies on, and a funnel drawn with its stages
 * down the page carries the count there. That is the same rule the rest of the
 * grammar's `orientation` table follows, and plotly resolves the orientation
 * itself -- `{y: stages, x: counts}` comes back as `orientation: 'h'`.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

const STAGES = ['Visits', 'Signups', 'Buys'];
const COUNTS = [100, 60, 20];

/**
 * A rendered plotly div holding one funnel trace.
 *
 * @param horizontal - Whether the stages run down the page, which is plotly's
 *                     own default and what it resolves `orientation: 'h'` for
 * @param titled     - Whether the layout names its axes, which a funnel's
 *                     panel normally does not
 * @returns The graph div
 */
function graphDiv(horizontal: boolean, titled = false): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = [
    {
      type: 'funnel',
      orientation: horizontal ? 'h' : 'v',
      x: horizontal ? COUNTS : STAGES,
      y: horizontal ? STAGES : COUNTS,
    } as unknown as PlotlyTrace,
  ];
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: titled ? { title: { text: 'People' } } : {},
    yaxis: titled ? { title: { text: 'Step' } } : {},
  };
  (gd as unknown as { calcdata: PlotlyCalcData[][] }).calcdata = [
    COUNTS.map(count => ({ s: count }) as PlotlyCalcData),
  ];
  return gd;
}

/**
 * The layer a funnel trace converts to.
 * @param horizontal - Whether the stages run down the page
 * @param titled     - Whether the layout names its axes
 * @returns The emitted layer
 */
function layerFor(horizontal: boolean, titled = false): MaidrLayer {
  const layer = extractPlotlyData(graphDiv(horizontal, titled))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a plotly funnel with its stages down the page', () => {
  it('is read as a horizontal one, which is where its bars run', () => {
    expect(layerFor(true).orientation).toBe(Orientation.HORIZONTAL);
  });

  it('names the count axis rather than leaving it as "X"', () => {
    expect(layerFor(true).axes).toEqual({
      x: { label: 'Count' },
      y: { label: 'Stage' },
    });
  });
});

describe('a plotly funnel with its stages across the page', () => {
  it('names the two the other way round, as the payload puts them', () => {
    const layer = layerFor(false);

    expect(layer.orientation).toBeUndefined();
    expect(layer.axes).toEqual({
      x: { label: 'Stage' },
      y: { label: 'Count' },
    });
  });
});

describe('a plotly funnel whose layout names its axes', () => {
  it('keeps the author\'s names', () => {
    // A fallback is for a chart that named nothing. An author who titled the
    // axes meant those titles.
    expect(layerFor(true, true).axes).toEqual({
      x: { label: 'People' },
      y: { label: 'Step' },
    });
  });
});
