import type { HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import type { SurvivalPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** The declaration a Kaplan-Meier curve carries, in Highcharts' own slot. */
function declaring(
  maidr: NonNullable<NonNullable<HighchartsSeries['options']['custom']>['maidr']>,
  extra: HighchartsSeries['options'] = {},
): HighchartsSeries['options'] {
  return { custom: { maidr }, ...extra };
}

/** One arm of a survival figure: a stepped line series. */
function arm(
  index: number,
  name: string,
  times: Partial<HighchartsPoint>[],
  options: HighchartsSeries['options'] = {},
): HighchartsSeries {
  return fakeSeries({
    index,
    type: 'line',
    name,
    data: times,
    options: { step: 'left', ...options },
  });
}

describe('highcharts survival declaration', () => {
  it('reads a declared stepped line as a survival curve rather than a step chart', () => {
    const chart = fakeChart({
      title: 'Overall survival',
      renderToId: 'survival-chart',
      series: [arm(0, 'Treated', [
        { x: 0, y: 1 },
        { x: 6, y: 0.82 },
        { x: 12, y: 0.61 },
      ], declaring({ type: TraceType.SURVIVAL }))],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    // Undeclared, this is the STEP layer the same series produces today.
    expect(layers[0].type).toBe(TraceType.SURVIVAL);
    expect(layers[0].stepDirection).toBe('hv');
    expect(layers[0].data as SurvivalPoint[][]).toEqual([[
      { x: 0, y: 1, z: 'Treated' },
      { x: 6, y: 0.82, z: 'Treated' },
      { x: 12, y: 0.61, z: 'Treated' },
    ]]);
    expect(layers[0].selectors).toEqual([
      '#survival-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
    ]);
  });

  it('absorbs a linked scatter as the censoring ticks', () => {
    const curve = arm(0, 'Treated', [
      { x: 0, y: 1 },
      { x: 6, y: 0.82 },
      { x: 12, y: 0.82 },
    ], declaring({ type: TraceType.SURVIVAL }, { id: 'treated' }));
    const ticks = fakeSeries({
      index: 1,
      type: 'scatter',
      name: 'Censored',
      linkedParent: curve,
      options: { linkedTo: 'treated' },
      data: [{ x: 12, y: 0.82 }],
    });
    const chart = fakeChart({ series: [curve, ticks] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // The ticks are half of one figure, not a scatter of their own: read as a
    // layer they would announce a second copy of the same probability.
    expect(layers).toHaveLength(1);
    const data = layers[0].data as SurvivalPoint[][];
    expect(data[0].map(point => point.censored)).toEqual([undefined, undefined, true]);
  });

  it('absorbs a linked arearange as the confidence band', () => {
    const curve = arm(0, 'Treated', [
      { x: 0, y: 1 },
      { x: 6, y: 0.82 },
    ], declaring({ type: TraceType.SURVIVAL }, { id: 'treated' }));
    const band = fakeSeries({
      index: 1,
      type: 'arearange',
      name: '95% CI',
      linkedParent: curve,
      options: { linkedTo: 'treated' },
      data: [
        { x: 0, low: 1, high: 1 },
        { x: 6, low: 0.71, high: 0.93 },
      ],
    });
    const chart = fakeChart({ series: [curve, band] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect((layers[0].data as SurvivalPoint[][])[0][1]).toEqual({
      x: 6,
      y: 0.82,
      z: 'Treated',
      yMin: 0.71,
      yMax: 0.93,
    });
  });

  it('reads censoring off the curve rows under the name the author gave', () => {
    const chart = fakeChart({
      series: [arm(0, 'Treated', [
        { x: 0, y: 1, options: { cens: 0 } },
        { x: 6, y: 0.82, options: { cens: 1 } },
      ], declaring({ type: TraceType.SURVIVAL, censored: 'cens' }))],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as SurvivalPoint[][];

    // A 0/1 indicator, read strictly: `0` raises nothing even though a truthy
    // reading of the string `'0'` would.
    expect(data[0].map(point => point.censored)).toEqual([undefined, true]);
  });

  it('merges a following undeclared curve as a second arm', () => {
    const chart = fakeChart({
      series: [
        arm(0, 'Treated', [{ x: 0, y: 1 }, { x: 6, y: 0.82 }], declaring({ type: TraceType.SURVIVAL })),
        arm(1, 'Control', [{ x: 0, y: 1 }, { x: 6, y: 0.64 }]),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // Treated and control are read against each other; two layers would put
    // the comparison the figure exists for behind a layer switch.
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('0-1');
    expect(layers[0].title).toBe('Treated, Control');
    expect((layers[0].data as SurvivalPoint[][]).map(curve => curve.length)).toEqual([2, 2]);
    expect(layers[0].selectors).toEqual([
      expect.stringContaining('highcharts-series-0'),
      expect.stringContaining('highcharts-series-1'),
    ]);
  });

  it('keeps the arms apart when the declaration turns merging off', () => {
    const chart = fakeChart({
      series: [
        arm(0, 'Treated', [{ x: 0, y: 1 }], declaring({ type: TraceType.SURVIVAL, merge: false })),
        arm(1, 'Control', [{ x: 0, y: 1 }]),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SURVIVAL, TraceType.STEP]);
  });

  it('falls back to the undeclared chart when the series cannot draw a curve', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'pie',
        name: 'Arms',
        options: { custom: { maidr: { type: TraceType.SURVIVAL } } },
        data: [{ x: 0, y: 4, name: 'Treated' }],
      })],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // A declaration says what a drawing means; it cannot supply one.
    expect(layers.map(layer => layer.type)).toEqual([TraceType.PIE]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('needs a "line" or "spline" series, and this is a "pie" series'),
    );
    warn.mockRestore();
  });

  it('re-reads a declaration the author corrected on the series in place', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // `Series#update` rewrites a series' options without replacing the series,
    // so a corrected block arrives on the object a previous conversion already
    // read. It has to be read again, not answered from the earlier reading.
    const series = arm(0, 'Treated', [
      { x: 0, y: 1 },
      { x: 6, y: 0.82 },
    ], declaring({ type: 'kaplan-meier' } as never));
    const chart = fakeChart({ series: [series] });

    const before = highchartsToMaidr(chart).subplots[0][0].layers;
    expect(before.map(layer => layer.type)).toEqual([TraceType.STEP]);
    expect(warn).toHaveBeenCalled();

    warn.mockClear();
    series.options.custom = { maidr: { type: TraceType.SURVIVAL } };

    const after = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(after.map(layer => layer.type)).toEqual([TraceType.SURVIVAL]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('takes the step convention from the declaration when the curve is interpolated', () => {
    const chart = fakeChart({
      series: [fakeSeries({
        index: 0,
        type: 'line',
        name: 'Treated',
        options: { custom: { maidr: { type: TraceType.SURVIVAL, stepDirection: 'hv' } } },
        data: [{ x: 0, y: 1 }],
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SURVIVAL);
    expect(layer.stepDirection).toBe('hv');
  });
});
