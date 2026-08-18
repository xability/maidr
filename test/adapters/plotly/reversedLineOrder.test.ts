/**
 * @jest-environment jsdom
 */

/**
 * A plotly line, step or area drawn on a reversed axis has to be emitted in
 * the order plotly draws it (#1039).
 *
 * `extractMultiLineLayer` read `trace.x` and `trace.y` straight through and
 * never asked which way the axis runs, so the layer was navigated back to
 * front: `Right` walked leftwards across the chart. The bar family already
 * asked the same question of the same helper (#987, #989), and so did the
 * heatmap (#985); the line family was the one that did not.
 *
 * Measured on plotly 2.35.2 in Chromium for `x: ['A','B','C','D']`, reading
 * the centre of each mark the layer's own selector resolves, in DOM order:
 *
 *   lines+markers, plain x      114, 243, 373, 502   rightwards
 *   lines+markers, reversed x   502, 373, 243, 114   leftwards
 *   fill: 'tozeroy', reversed   (no markers — the path is parsed instead)
 *   two traces, reversed x      496, 368, 241, 113   twice over
 *
 * The marks come out of the DOM in the trace's order — plotly adds them in
 * data order and moves them by transform — so reversing the points alone
 * would trade a correct highlight for a wrong one. A plotly line has no
 * per-mark selector to permute (one selector covers the whole subplot), so
 * the layer says `domMapping.pointOrder: 'reverse'` and `LineTrace` turns the
 * elements it resolved over instead (#1026). That matters in both of its
 * branches: a `lines+markers` trace resolves through `mapViaDomElements` and a
 * filled area has no `.point` elements at all and falls through to
 * `mapViaPathParsing`.
 *
 * `autorange: 'reversed'` reads back as plain `true`, which is why
 * `axisRunsBackwards` asks the resolved range rather than the setting.
 */

import type { PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An axis drawn from its low end, left to right. */
const FORWARD = [-0.5, 3.5];
/** A reversed axis, which plotly resolves to a high-to-low range. */
const BACKWARD = [3.5, -0.5];

/** Categories in the order the trace names them. */
const X = ['A', 'B', 'C', 'D'];
/** Their values, in that same order. */
const Y = [10, 40, 20, 30];

/**
 * A rendered plotly div holding the given scatter traces.
 * @param traces - The traces, already shaped as plotly would resolve them
 * @param range  - The x axis's resolved range
 * @returns The graph div
 */
function graphDiv(traces: Partial<PlotlyTrace>[], range: number[]): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = traces;
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: { type: 'category', range },
    yaxis: { type: 'linear', range: [0, 45] },
  };
  (gd as unknown as { calcdata: unknown }).calcdata = traces.map(() => []);
  return gd;
}

/** A scatter trace of the given mode over the shared categories. */
function scatter(mode: string, extra: Partial<PlotlyTrace> = {}): Partial<PlotlyTrace> {
  return { type: 'scatter', mode, x: X, y: Y, name: 'S', ...extra };
}

/**
 * The layer a set of traces converts to.
 * @param traces - The traces to convert
 * @param range  - The x axis's resolved range
 * @returns The emitted layer
 */
function layerFor(traces: Partial<PlotlyTrace>[], range: number[]): MaidrLayer {
  const layer = extractPlotlyData(graphDiv(traces, range))?.subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('Expected the traces to emit a layer');
  }
  return layer;
}

/** The x values of one series of a line-shaped layer. */
function seriesX(layer: MaidrLayer, at = 0): (string | number)[] {
  const rows = layer.data as LinePoint[][];
  return rows[at].map(point => point.x);
}

describe('plotly reversed axis line order', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves a line on a plain axis in the order the trace names', () => {
    const layer = layerFor([scatter('lines+markers')], FORWARD);
    expect(layer.type).toBe('line');
    expect(seriesX(layer)).toEqual(X);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads a line on a reversed axis from the left of the chart', () => {
    const layer = layerFor([scatter('lines+markers')], BACKWARD);
    expect(seriesX(layer)).toEqual(['D', 'C', 'B', 'A']);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('reads an area on a reversed axis from the left of the chart', () => {
    const layer = layerFor([scatter('lines', { fill: 'tozeroy' })], BACKWARD);
    expect(layer.type).toBe('area');
    expect(seriesX(layer)).toEqual(['D', 'C', 'B', 'A']);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('reads a staircase on a reversed axis from the left of the chart', () => {
    const layer = layerFor(
      [scatter('lines', { line: { shape: 'hv' } } as Partial<PlotlyTrace>)],
      BACKWARD,
    );
    expect(layer.type).toBe('step');
    expect(seriesX(layer)).toEqual(['D', 'C', 'B', 'A']);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns every series of a multi-series line over together', () => {
    const layer = layerFor(
      [
        scatter('lines+markers', { name: 'one' }),
        scatter('lines+markers', { name: 'two', y: [5, 15, 25, 10] }),
      ],
      BACKWARD,
    );
    expect(seriesX(layer, 0)).toEqual(['D', 'C', 'B', 'A']);
    expect(seriesX(layer, 1)).toEqual(['D', 'C', 'B', 'A']);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('keeps a gapped series in step with itself after the reversal', () => {
    // A null y is a line gap: plotly omits the point from the DOM and the
    // extractor skips it, so the payload holds three samples and the marks
    // three elements. Reversing is order-preserving under that filter, so the
    // two stay paired whichever way round the axis runs.
    const layer = layerFor(
      [scatter('lines+markers', { y: [10, 40, null, 30] } as Partial<PlotlyTrace>)],
      BACKWARD,
    );
    expect(seriesX(layer)).toEqual(['D', 'B', 'A']);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('leaves a line alone when only the value axis is reversed', () => {
    const div = graphDiv([scatter('lines+markers')], FORWARD);
    (div as unknown as { _fullLayout: { yaxis: { range: number[] } } })
      ._fullLayout
      .yaxis
      .range = [45, 0];
    const layer = extractPlotlyData(div)?.subplots[0][0].layers[0];
    expect(seriesX(layer as MaidrLayer)).toEqual(X);
    expect((layer as MaidrLayer).domMapping?.pointOrder).toBeUndefined();
  });
});
