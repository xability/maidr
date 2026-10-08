import type { HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import type { PrCurvePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** The declaration a precision-recall curve carries, in Highcharts' own slot. */
function declaring(
  maidr: NonNullable<NonNullable<HighchartsSeries['options']['custom']>['maidr']>,
): HighchartsSeries['options'] {
  return { custom: { maidr } };
}

/** One classifier's curve: recall along x, precision up y. */
function curve(
  index: number,
  name: string,
  points: Partial<HighchartsPoint>[],
  options: HighchartsSeries['options'] = {},
  type = 'line',
): HighchartsSeries {
  return fakeSeries({ index, type, name, data: points, options });
}

/** A curve whose rows carry the threshold each point was scored at. */
const LOGISTIC: Partial<HighchartsPoint>[] = [
  { x: 0, y: 1, options: { x: 0, y: 1 } },
  { x: 0.6, y: 0.8, options: { x: 0.6, y: 0.8, threshold: 0.5 } },
  { x: 1, y: 0.3, options: { x: 1, y: 0.3, threshold: 0 } },
];

describe('highcharts precision-recall declaration', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads a declared line as a precision-recall curve with the line s own selector', () => {
    const chart = fakeChart({
      renderToId: 'pr-chart',
      series: [curve(0, 'Logistic', LOGISTIC, declaring({ type: TraceType.PR_CURVE }))],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PR_CURVE);
    expect(layers[0].data as PrCurvePoint[][]).toEqual([[
      { x: 0, y: 1, z: 'Logistic' },
      { x: 0.6, y: 0.8, z: 'Logistic', threshold: 0.5 },
      { x: 1, y: 0.3, z: 'Logistic', threshold: 0 },
    ]]);
    expect(layers[0].selectors).toEqual([
      '#pr-chart .highcharts-series-group .highcharts-series-0 path.highcharts-graph',
    ]);
  });

  it('stays a line when nothing declares it', () => {
    const chart = fakeChart({ series: [curve(0, 'Logistic', LOGISTIC)] });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].type).toBe(TraceType.LINE);
  });

  it('puts the declared prevalence and average precision on the curve s first point', () => {
    const chart = fakeChart({
      series: [curve(0, 'Logistic', LOGISTIC, declaring({
        type: TraceType.PR_CURVE,
        prevalence: 0.3,
        ap: 0.71,
      }))],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as PrCurvePoint[][];

    expect(data[0][0]).toEqual({ x: 0, y: 1, z: 'Logistic', prevalence: 0.3, ap: 0.71 });
    expect(data[0][1].prevalence).toBeUndefined();
  });

  it('reads the threshold from the column the block names', () => {
    const chart = fakeChart({
      series: [curve(0, 'Logistic', [
        { x: 0.5, y: 0.9, options: { x: 0.5, y: 0.9, cut: 0.7, threshold: 99 } },
      ], declaring({ type: TraceType.PR_CURVE, threshold: 'cut' }))],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as PrCurvePoint[][];

    expect(data[0][0].threshold).toBe(0.7);
  });

  it('says so when the named threshold column is on no row, and leaves it out', () => {
    const chart = fakeChart({
      series: [curve(0, 'Logistic', LOGISTIC, declaring({
        type: TraceType.PR_CURVE,
        threshold: 'cutof',
      }))],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as PrCurvePoint[][];

    expect(data[0].every(point => point.threshold === undefined)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "cutof" for threshold'));
  });

  it('merges following curves into one layer, each keeping only its own block s facts', () => {
    const chart = fakeChart({
      renderToId: 'pr-chart',
      series: [
        curve(0, 'Logistic', LOGISTIC, declaring({ type: TraceType.PR_CURVE, prevalence: 0.3 })),
        curve(1, 'Forest', [{ x: 0, y: 1 }, { x: 1, y: 0.3 }]),
        curve(2, 'Boosted', [{ x: 0, y: 1 }, { x: 1, y: 0.3 }], declaring({
          type: TraceType.PR_CURVE,
          prevalence: 0.3,
          ap: 0.9,
        })),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    const data = layers[0].data as PrCurvePoint[][];
    expect(data.map(one => one[0].z)).toEqual(['Logistic', 'Forest', 'Boosted']);
    // The undeclared curve said nothing about its data, so it borrows nothing.
    expect(data.map(one => one[0].prevalence)).toEqual([0.3, undefined, 0.3]);
    expect(data.map(one => one[0].ap)).toEqual([undefined, undefined, 0.9]);
    expect(layers[0].selectors).toHaveLength(3);
  });

  it('keeps following curves apart when the block says not to merge', () => {
    const chart = fakeChart({
      series: [
        curve(0, 'Logistic', LOGISTIC, declaring({ type: TraceType.PR_CURVE, merge: false })),
        curve(1, 'Forest', [{ x: 0, y: 1 }, { x: 1, y: 0.3 }]),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([TraceType.PR_CURVE, TraceType.LINE]);
  });

  it('refuses a declaration on a series that draws no curve', () => {
    const chart = fakeChart({
      series: [curve(0, 'Operating points', LOGISTIC, declaring({ type: TraceType.PR_CURVE }), 'scatter')],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers[0].type).not.toBe(TraceType.PR_CURVE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a "line" or "spline" series'));
  });
});
