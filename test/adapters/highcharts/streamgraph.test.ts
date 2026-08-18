/**
 * A Highcharts streamgraph is a stacked area, and used to be nothing at all
 * (#1046).
 *
 * `buildSubplot` sorts series into buckets by type, and `areaTypes` named only
 * `area` and `areaspline`. Highcharts' streamgraph module registers
 * `series.type = 'streamgraph'`, which fell into no bucket, reached
 * `convertSeries` as an unsupported type and was declined — so the chart
 * emitted **zero layers** and was not navigable at all.
 *
 * Measured on real Highcharts 11 plus `modules/streamgraph.js` in Chromium,
 * four categories and two series:
 *
 *   chart                                 series.type   options.stacking  layers
 *   type: 'streamgraph', two series       streamgraph   stream            (none)
 *   type: 'streamgraph', one series       streamgraph   stream            (none)
 *   type: 'area', stacking: 'normal'      area          normal            stacked_area
 *
 * and the values were already the right ones:
 *
 *   series   point.y             point.stackY
 *   one      10, 40, 20, 30      7.5, 27.5, 22.5, 20
 *   two      5, 15, 25, 10       -2.5, -12.5, 2.5, -10
 *
 * `point.y` is each band's own value — the field `convertAreaSeries` already
 * reads. The centred offsets live on `stackY`, and nothing needs them: they
 * are where the bands were drawn, not what they say. `AreaTrace` announces
 * each band's value and its share of the column total, and both hold at any
 * baseline, which is why #788 could write that "only the baseline resolution
 * differs" and be exactly right.
 */
import type { LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { categoryPoints, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['A', 'B'];

/**
 * A chart of `count` streamgraph series, the way the module leaves them.
 * @param count - How many bands the stream carries
 * @returns The fake chart
 */
function streamChart(count: number): ReturnType<typeof fakeChart> {
  const bands = [
    { name: 'one', values: [10, 40] },
    { name: 'two', values: [5, 15] },
  ].slice(0, count);

  return fakeChart({
    type: 'streamgraph',
    renderToId: 'stream-chart',
    series: bands.map((band, index) => fakeSeries({
      index,
      type: 'streamgraph',
      name: band.name,
      // What the module sets, measured: the stacking mode is `'stream'`
      // rather than `'normal'`, and it is on the series' own options.
      options: { stacking: 'stream' },
      data: categoryPoints(band.values, CATEGORIES),
    })),
  });
}

describe('highcharts streamgraph', () => {
  it('reads a stream of several bands as a stacked area', () => {
    const layer = highchartsToMaidr(streamChart(2)).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.STACKED_AREA);
    // Each band's OWN height, never the centred edge Highcharts drew it at:
    // `AreaTrace` sums the rows itself to announce the column total.
    expect(layer.data as LinePoint[][]).toEqual([
      [{ x: 'A', y: 10, z: 'one' }, { x: 'B', y: 40, z: 'one' }],
      [{ x: 'A', y: 5, z: 'two' }, { x: 'B', y: 15, z: 'two' }],
    ]);
  });

  it('reads a stream of one band as a plain area', () => {
    // One band has nothing to stack on whatever the chart's stacking says —
    // the same call `convertAreaSeries` already makes for a single `area`.
    const layer = highchartsToMaidr(streamChart(1)).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.data as LinePoint[][]).toEqual([
      [{ x: 'A', y: 10, z: 'one' }, { x: 'B', y: 40, z: 'one' }],
    ]);
  });

  it('does not announce a stream as a share of a constant total', () => {
    // `'stream'` stacks but does not rescale, so NORMALIZED_AREA — which tells
    // a reader every column sums to 100 — would be a different chart.
    const layer = highchartsToMaidr(streamChart(2)).subplots[0][0].layers[0];
    expect(layer.type).not.toBe(TraceType.NORMALIZED_AREA);
  });

  it('emits the band selectors a stacked area emits', () => {
    // The stream is filled from a floated baseline, but its top edge is still
    // the `highcharts-graph` path `AreaTrace` parses for the highlight.
    const layer = highchartsToMaidr(streamChart(2)).subplots[0][0].layers[0];
    expect(layer.selectors).toEqual([
      '#stream-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
      '#stream-chart .highcharts-series-group .highcharts-series-1 path.highcharts-graph',
    ]);
  });
});
