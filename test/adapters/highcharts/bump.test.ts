import type { LinePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const MATCHDAYS = ['MD1', 'MD2', 'MD3'];

/**
 * The Highcharts bump-chart pattern: ordinary `line` series whose y is a rank,
 * drawn on a reversed axis so first place sits at the top.
 */
function standingsChart(
  table: Record<string, number[]>,
  reversed = true,
): ReturnType<typeof fakeChart> {
  const xAxis = fakeAxis({ categories: MATCHDAYS });
  const yAxis = fakeAxis({
    reversed,
    options: { title: { text: 'Position' } },
  });

  return fakeChart({
    title: 'League table',
    renderToId: 'bump-chart',
    type: 'line',
    series: Object.entries(table).map(([name, ranks], index) => fakeSeries({
      index,
      type: 'line',
      name,
      xAxis,
      yAxis,
      data: ranks.map((y, i) => ({ x: i, y, category: MATCHDAYS[i] })),
    })),
  });
}

describe('highcharts bump charts', () => {
  it('reads reversed-axis rank permutations as a bump layer', () => {
    const chart = standingsChart({
      Ajax: [1, 2, 1],
      PSV: [2, 1, 3],
      Feyenoord: [3, 3, 2],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.BUMP);
    expect(layer.data as LinePoint[][]).toEqual([
      [
        { x: 'MD1', y: 1, z: 'Ajax' },
        { x: 'MD2', y: 2, z: 'Ajax' },
        { x: 'MD3', y: 1, z: 'Ajax' },
      ],
      [
        { x: 'MD1', y: 2, z: 'PSV' },
        { x: 'MD2', y: 1, z: 'PSV' },
        { x: 'MD3', y: 3, z: 'PSV' },
      ],
      [
        { x: 'MD1', y: 3, z: 'Feyenoord' },
        { x: 'MD2', y: 3, z: 'Feyenoord' },
        { x: 'MD3', y: 2, z: 'Feyenoord' },
      ],
    ]);
    // One path per competitor, as any line layer has.
    expect(layer.selectors).toEqual([
      '#bump-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
      '#bump-chart .highcharts-series-group .highcharts-series-1 path.highcharts-graph',
      '#bump-chart .highcharts-series-group .highcharts-series-2 path.highcharts-graph',
    ]);
    expect(layer.axes?.y).toEqual({ label: 'Position' });
  });

  it('is one layer, not one per competitor', () => {
    const chart = standingsChart({ Ajax: [1, 2], PSV: [2, 1] });

    expect(highchartsToMaidr(chart).subplots[0][0].layers).toHaveLength(1);
  });

  it('leaves a reversed-axis chart of measurements as a line chart', () => {
    // A depth profile sits on a reversed axis too, and its numbers are
    // magnitudes — reading them as ranks would sonify every one upside down.
    const chart = standingsChart({
      'Station A': [12, 40, 65],
      'Station B': [18, 33, 71],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.LINE);
  });

  it('leaves ranks on an ordinary axis alone', () => {
    const chart = standingsChart({ Ajax: [1, 2], PSV: [2, 1] }, false);

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.LINE);
  });

  it('does not fire on a single series', () => {
    // With nothing to be ranked against, every value is trivially rank 1.
    const chart = standingsChart({ Ajax: [1, 1, 1] });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.LINE);
  });

  it('does not fire when a period ties', () => {
    const chart = standingsChart({
      Ajax: [1, 1],
      PSV: [2, 1],
      Feyenoord: [3, 3],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.LINE);
  });

  it('reads a ragged table, where a competitor joined late', () => {
    const xAxis = fakeAxis({ categories: MATCHDAYS });
    const yAxis = fakeAxis({ reversed: true, options: {} });
    const chart = fakeChart({
      renderToId: 'bump-ragged',
      type: 'line',
      series: [
        fakeSeries({
          index: 0,
          type: 'line',
          name: 'Ajax',
          xAxis,
          yAxis,
          data: MATCHDAYS.map((category, i) => ({ x: i, y: 1, category })),
        }),
        fakeSeries({
          index: 1,
          type: 'line',
          name: 'PSV',
          xAxis,
          yAxis,
          // Absent on MD1: that period is a permutation of 1..1.
          data: [
            { x: 1, y: 2, category: 'MD2' },
            { x: 2, y: 2, category: 'MD3' },
          ],
        }),
      ],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.BUMP);
  });

  it('does not fire when no period ever ranks two competitors', () => {
    const xAxis = fakeAxis({ categories: ['Q1', 'Q2', 'Q3', 'Q4'] });
    const yAxis = fakeAxis({ reversed: true, options: {} });
    const chart = fakeChart({
      renderToId: 'bump-disjoint',
      type: 'line',
      series: [
        fakeSeries({
          index: 0,
          type: 'line',
          name: 'North',
          xAxis,
          yAxis,
          data: [
            { x: 0, y: 1, category: 'Q1' },
            { x: 1, y: 1, category: 'Q2' },
          ],
        }),
        fakeSeries({
          index: 1,
          type: 'line',
          name: 'South',
          xAxis,
          yAxis,
          // A different half of the year entirely, so the two never share a
          // period. Every period is then a permutation of 1..1 by default.
          data: [
            { x: 2, y: 1, category: 'Q3' },
            { x: 3, y: 1, category: 'Q4' },
          ],
        }),
      ],
    });

    // Nothing here is a rank -- no two values were ever ordered against each
    // other -- and reading it as a bump would invert the pitch of an ordinary
    // line chart, which is worse than reading it plainly.
    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.LINE);
  });

  it('is forced on by `bump: true` where the heuristic declines', () => {
    // Ranks that skip after a tie — 1, 1, 3 — are a real standings table and
    // no permutation.
    const chart = standingsChart({
      Ajax: [1, 1],
      PSV: [1, 3],
      Feyenoord: [3, 1],
    });

    expect(highchartsToMaidr(chart, { bump: true }).subplots[0][0].layers[0].type)
      .toBe(TraceType.BUMP);
  });

  it('is suppressed by `bump: false` where the heuristic accepts', () => {
    const chart = standingsChart({ Ajax: [1, 2], PSV: [2, 1] });

    expect(highchartsToMaidr(chart, { bump: false }).subplots[0][0].layers[0].type)
      .toBe(TraceType.LINE);
  });

  it('reads the reversal Highcharts left on the axis options', () => {
    // A chart object the adapter is handed before render carries the declared
    // option rather than the resolved flag.
    const chart = standingsChart({ Ajax: [1, 2], PSV: [2, 1] }, false);
    chart.yAxis[0].options.reversed = true;

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type)
      .toBe(TraceType.BUMP);
  });
});
