/**
 * A Highcharts bell curve emitted no layer at all (#1138).
 *
 * `buildSubplot` sorts series into buckets by type and `bellcurve` is in
 * none of them, so it reached `convertSeries` as an unsupported type and was
 * declined. On a chart that is only the curve, that is silence.
 *
 * It reads as a **smooth** rather than as a line, and the distinction is not
 * cosmetic: a bell curve fits a normal distribution to another series and
 * evaluates it wherever the renderer chose to, so its points are not
 * observations and their number is a drawing parameter. Measured on
 * Highcharts 11.4.8 plus `modules/histogram-bellcurve.js` in Chromium, the
 * same nine observations:
 *
 *   options                  points in series.data
 *   (default)                19
 *   pointsInInterval: 5      31
 *   intervals: 5             31
 *
 * The count moves with a rendering option and with nothing else. Announcing
 * those nineteen as a line of data would hand a reader a sample size the
 * chart invented — the same reading `stat_function` gets in
 * xability/r-maidr#202.
 *
 * Measured too: the curve draws `path.highcharts-area` and
 * `path.highcharts-graph` and **zero** `.highcharts-point`, so the graph is
 * the handle, exactly as for every other line-family layer. The
 * observations are a separate series, reachable as `series.baseSeries`, and
 * the adapter reads that on its own terms.
 *
 * **A reversed axis read the curve backwards** — the same defect #1007 fixed
 * for lines, filed for this one as #1151, and nothing about the curve being
 * generated* exempted it. Measured on a fifteen-value sample, once plain
 * and once with `xAxis.reversed`:
 *
 *   plain      payload x   2.46 … 4.18    chart draws  2.46 → 4.18
 *   reversed   payload x   2.46 … 4.18    chart draws  4.18 → 2.46
 *
 * The payload did not move; the chart did. `SmoothTrace extends LineTrace`,
 * so it consumes `domMapping.pointOrder` without anything being added to it.
 */
import type { LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/** Four samples of a fitted curve, as the module leaves them. */
const CURVE = [
  { x: 2.36, y: 0.013 },
  { x: 2.48, y: 0.033 },
  { x: 2.59, y: 0.075 },
  { x: 2.71, y: 0.155 },
];

/**
 * A bell curve over a hidden sample, the way the documentation draws one.
 *
 * The curve is bound to a **secondary** axis pair — that is the convention,
 * since a density and a count do not share a scale — so the axis titles here
 * are the curve's own rather than the sample's.
 *
 * @param withSample - Whether the base scatter is on the chart as well
 * @param reversed - Whether the curve's x axis is drawn from its far end
 * @returns The fake chart
 */
function bellChart(
  withSample = false,
  reversed = false,
): ReturnType<typeof fakeChart> {
  const curveX = fakeAxis({
    reversed,
    options: { title: { text: 'Bell curve' } },
  });
  const curveY = fakeAxis({ options: { title: { text: 'Density' } } });
  const series = [fakeSeries({
    index: 0,
    type: 'bellcurve',
    name: 'Bell curve',
    xAxis: curveX,
    yAxis: curveY,
    data: CURVE,
  })];

  if (withSample) {
    series.push(fakeSeries({
      index: 1,
      type: 'scatter',
      name: 'Data',
      xAxis: fakeAxis({ options: { title: { text: 'Data' } } }),
      yAxis: fakeAxis({ options: { title: { text: 'Count' } } }),
      data: [{ x: 0, y: 3.5 }, { x: 1, y: 3.0 }],
    }));
  }

  return fakeChart({ renderToId: 'bell-chart', series });
}

describe('highcharts bellcurve', () => {
  it('reads a bell curve as a smooth rather than declining it', () => {
    const layer = highchartsToMaidr(bellChart()).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SMOOTH);
    expect(layer.title).toBe('Bell curve');
  });

  it('carries the curve as the samples it was evaluated at', () => {
    const layer = highchartsToMaidr(bellChart()).subplots[0][0].layers[0];

    expect(layer.data as LinePoint[][]).toEqual([CURVE]);
  });

  it('reads a reversed axis in the order the curve is drawn', () => {
    // Measured: the payload came out 2.46 → 4.18 over a chart drawn
    // 4.18 → 2.46, so a reader sweeping left to right was handed the curve
    // back to front.
    const layer = highchartsToMaidr(bellChart(false, true)).subplots[0][0].layers[0];

    expect((layer.data as LinePoint[][])[0]).toEqual([...CURVE].reverse());
  });

  it('tells the trace to pair the path back up when reversed', () => {
    // Reversing the payload is half of it: the path's vertices still come out
    // of Highcharts in the library's order. `SmoothTrace` inherits
    // `LineTrace`'s handling of this, so nothing in the trace changed.
    expect(highchartsToMaidr(bellChart(false, true)).subplots[0][0].layers[0].domMapping)
      .toEqual({ pointOrder: 'reverse' });
    expect(highchartsToMaidr(bellChart()).subplots[0][0].layers[0].domMapping)
      .toBeUndefined();
  });

  it('is not read as a line', () => {
    // The whole point of the choice. `LINE` would announce a fitted curve's
    // renderer-chosen samples as a series of observations, and the count of
    // them as a sample size.
    const layer = highchartsToMaidr(bellChart()).subplots[0][0].layers[0];

    expect(layer.type).not.toBe(TraceType.LINE);
  });

  it('takes the graph path, which is all the curve draws', () => {
    // Measured: `highcharts-area` plus `highcharts-graph`, and no point
    // marks at all. `SmoothTrace` parses the graph's vertices.
    const layer = highchartsToMaidr(bellChart()).subplots[0][0].layers[0];

    expect(layer.selectors).toEqual([
      '#bell-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
    ]);
  });

  it('names the axes the curve is drawn against, not the sample its', () => {
    // A bell curve is conventionally bound to a secondary pair, since a
    // density and a count do not share a scale. Reading the base series'
    // titles would name the curve after a scale it is not drawn on.
    const layer = highchartsToMaidr(bellChart(true)).subplots[0][0].layers[0];

    expect(layer.axes).toEqual({
      x: { label: 'Bell curve' },
      y: { label: 'Density' },
    });
  });

  it('leaves the observations to the series that holds them', () => {
    // The sample is its own series and the adapter already reads it. A
    // chart drawing both gets both, and the curve claims neither the
    // points nor their axes.
    const layers = highchartsToMaidr(bellChart(true)).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([
      TraceType.SMOOTH,
      TraceType.SCATTER,
    ]);
    expect(layers[1].axes).toEqual({
      x: { label: 'Data' },
      y: { label: 'Count' },
    });
  });

  it('drops a sample the curve has no value at', () => {
    const chart = fakeChart({
      renderToId: 'gappy-bell',
      series: [fakeSeries({
        index: 0,
        type: 'bellcurve',
        data: [{ x: 1, y: 0.1 }, { x: 2, y: null }, { x: 3, y: 0.3 }],
      })],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].data)
      .toEqual([[{ x: 1, y: 0.1 }, { x: 3, y: 0.3 }]]);
  });
});
