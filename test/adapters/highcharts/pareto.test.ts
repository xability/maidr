/**
 * A Highcharts Pareto curve emitted no layer at all (#1138).
 *
 * `buildSubplot` sorts series into buckets by type and `pareto` is in none
 * of them, so it reached `convertSeries` as an unsupported type and was
 * declined. The columns beneath it still read, so the chart came out as
 * half of itself: the bars without the cumulative curve that is the whole
 * reason a Pareto chart is drawn rather than a bar chart.
 *
 * **The curve's numbers are percentages.** That is the part this file
 * exists to pin, and it is measured rather than assumed. Highcharts 11.4.8
 * in Chromium, over a base whose total is not 100 so that the two candidate
 * readings differ:
 *
 *   base column counts   80, 60, 40, 20    (total 200)
 *   pareto series.data   40, 70, 90, 100
 *   a running total would be   80, 140, 180, 200
 *
 * So nothing may convert the values back into counts — the chart does not
 * draw counts — and the axis they are bound to is the secondary one the
 * author titled, conventionally "Cumulative %".
 *
 * Measured too: the curve draws one `highcharts-graph` path — the handle
 * every line-family layer takes — and, at four, five and twenty points
 * alike, one marker per step in a `highcharts-markers` group *beside* the
 * series group. Those are the decoration an ordinary `line` draws as well,
 * and `convertLineSeries` does not address them either.
 *
 * `series.linkedParent` is null, and the columns are reached through
 * `series.baseSeries`, which the adapter reads on its own terms.
 *
 * **A reversed axis reads the curve backwards** — the same defect #1007
 * fixed for lines, and nothing about the curve being *generated* exempts it.
 * Measured in Chromium on the same four causes, once plain and once with
 * `xAxis.reversed`:
 *
 *   plain      bar layer  A B C D    curve  A B C D  (40, 70, 90, 100)
 *   reversed   bar layer  D C B A    curve  A B C D  (40, 70, 90, 100)
 *
 * Highcharts still accumulates in declared order and still lays the path's
 * vertices down in that order, so left to right the curve descends from 100
 * to 40 while the bar layer beneath it — which the adapter already re-pairs
 * (#995) — reads D, C, B, A. One chart, two layers, opposite orders.
 */
import type { BarPoint, LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const CAUSES = ['A', 'B', 'C', 'D'];
/** The measured base counts, whose total is 200 rather than 100. */
const COUNTS = [80, 60, 40, 20];
/** What Highcharts put on the pareto series for those counts. */
const CUMULATIVE = [40, 70, 90, 100];

/**
 * A Pareto chart: the cumulative curve on a secondary axis, over columns.
 *
 * @param withColumns - Whether the base column series is on the chart too
 * @param reversed - Whether the category axis is drawn from its far end
 * @returns The fake chart
 */
function paretoChart(
  withColumns = true,
  reversed = false,
): ReturnType<typeof fakeChart> {
  const categories = fakeAxis({
    categories: [...CAUSES],
    reversed,
    options: { title: { text: 'Cause' } },
  });
  const percent = fakeAxis({ options: { title: { text: 'Cumulative %' } } });
  const counts = fakeAxis({ options: { title: { text: 'Count' } } });

  const series = [fakeSeries({
    index: 0,
    type: 'pareto',
    name: 'Pareto',
    xAxis: categories,
    yAxis: percent,
    data: CUMULATIVE.map((y, i) => ({ x: i, y, category: CAUSES[i] })),
  })];

  if (withColumns) {
    series.push(fakeSeries({
      index: 1,
      type: 'column',
      name: 'Counts',
      xAxis: categories,
      yAxis: counts,
      data: COUNTS.map((y, i) => ({ x: i, y, category: CAUSES[i] })),
    }));
  }

  return fakeChart({ renderToId: 'pareto-chart', series });
}

/** The pareto layer of a chart. */
function curve(chart: ReturnType<typeof fakeChart>): ReturnType<typeof fakeChart> extends never
  ? never
  : { [key: string]: unknown } {
  const layers = highchartsToMaidr(chart).subplots[0][0].layers;
  return layers.find(layer => layer.type === TraceType.LINE) as never;
}

describe('highcharts pareto', () => {
  it('reads a Pareto curve as a line rather than declining it', () => {
    const layer = curve(paretoChart(false));

    expect(layer.type).toBe(TraceType.LINE);
    expect(layer.title).toBe('Pareto');
  });

  it('carries the cumulative percentages, not a running total', () => {
    // The measured values. A reading that summed the base counts would give
    // 80, 140, 180, 200 — numbers the chart does not draw, on an axis whose
    // maximum is 100.
    const layer = curve(paretoChart());

    expect((layer.data as LinePoint[][])[0].map(point => point.y))
      .toEqual(CUMULATIVE);
    expect((layer.data as LinePoint[][])[0].map(point => point.y))
      .not
      .toEqual([80, 140, 180, 200]);
  });

  it('names the categories the columns are named by', () => {
    const layer = curve(paretoChart());

    expect((layer.data as LinePoint[][])[0].map(point => point.x))
      .toEqual(CAUSES);
  });

  it('is bound to the axis the percentages are drawn against', () => {
    // A Pareto chart puts its curve on a secondary axis, because a count and
    // a percentage do not share a scale. Reading the columns' axis would
    // name the curve after a scale it is not drawn on.
    const layer = curve(paretoChart());

    expect(layer.axes).toEqual({
      x: { label: 'Cause' },
      y: { label: 'Cumulative %' },
    });
  });

  it('is a second layer beside the columns, which keep their own', () => {
    const layers = highchartsToMaidr(paretoChart()).subplots[0][0].layers;

    // Columns first, then the curve over them, which is the order they are
    // drawn in and the order `buildSubplot` already sorts its buckets into.
    expect(layers.map(layer => layer.type)).toEqual([
      TraceType.BAR,
      TraceType.LINE,
    ]);
    expect((layers[0].data as BarPoint[]).map(point => point.y)).toEqual(COUNTS);
    expect(layers[0].axes).toEqual({
      x: { label: 'Cause' },
      y: { label: 'Count' },
    });
  });

  it('takes the graph path, which is what a line layer is read from', () => {
    // The curve draws markers as well, measured, but they are the same
    // decoration an ordinary line draws and the graph is what `LineTrace`
    // parses for its vertices.
    const layer = curve(paretoChart());

    expect(layer.selectors).toEqual([
      '#pareto-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
    ]);
  });

  it('reads a reversed axis in the order it is drawn', () => {
    // Measured: the payload came out A, B, C, D over a chart drawn D, C, B,
    // A. Re-paired, the curve descends from 100 the way a reader sweeping
    // left to right hears it.
    const layer = curve(paretoChart(true, true));

    expect((layer.data as LinePoint[][])[0].map(point => point.x))
      .toEqual([...CAUSES].reverse());
    expect((layer.data as LinePoint[][])[0].map(point => point.y))
      .toEqual([...CUMULATIVE].reverse());
  });

  it('reads a reversed chart\'s two layers in one order', () => {
    // The point of the previous test, said about the chart rather than the
    // curve: a Pareto chart's columns and its curve are the same categories,
    // and a reader moving through one must not be moving backwards through
    // the other.
    const layers = highchartsToMaidr(paretoChart(true, true)).subplots[0][0].layers;

    const columns = (layers[0].data as BarPoint[]).map(point => point.x);
    const cumulative = (layers[1].data as LinePoint[][])[0].map(point => point.x);
    expect(columns).toEqual([...CAUSES].reverse());
    expect(cumulative).toEqual(columns);
  });

  it('tells the trace to pair the path back up when reversed', () => {
    // Reversing the payload is only half of it: the path's vertices still
    // come out of Highcharts in the library's order, so highlighting would
    // outline the mirror-image step without this.
    expect(curve(paretoChart(true, true)).domMapping)
      .toEqual({ pointOrder: 'reverse' });
    expect(curve(paretoChart()).domMapping).toBeUndefined();
  });

  it('drops a step the curve has no value at', () => {
    const chart = fakeChart({
      renderToId: 'gappy-pareto',
      series: [fakeSeries({
        index: 0,
        type: 'pareto',
        name: 'Pareto',
        data: [{ x: 0, y: 50 }, { x: 1, y: null }, { x: 2, y: 100 }],
      })],
    });

    expect((curve(chart).data as LinePoint[][])[0].map(point => point.y))
      .toEqual([50, 100]);
  });
});
