import type { HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import type { ForestPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { Orientation, TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const STUDIES = ['Adams 2016', 'Brown 2019', 'Pooled'];

/** The estimate series of a forest plot: one marker per study. */
function estimates(
  maidr: NonNullable<NonNullable<HighchartsSeries['options']['custom']>['maidr']>,
  data: Partial<HighchartsPoint>[],
): HighchartsSeries {
  return fakeSeries({
    index: 0,
    type: 'scatter',
    name: 'Odds ratio',
    xAxis: fakeAxis({ categories: STUDIES }),
    yAxis: fakeAxis({ options: { title: { text: 'Odds ratio' } } }),
    options: { id: 'effects', custom: { maidr } },
    data,
  });
}

/** The `errorbar` Highcharts draws the confidence intervals with. */
function intervals(
  parent: HighchartsSeries,
  data: Partial<HighchartsPoint>[],
  index = 1,
): HighchartsSeries {
  return fakeSeries({
    index,
    type: 'errorbar',
    name: 'CI',
    xAxis: parent.xAxis,
    yAxis: parent.yAxis,
    linkedParent: parent,
    options: { id: `ci-${index}`, linkedTo: 'effects' },
    data,
  });
}

describe('highcharts forest declaration', () => {
  it('reads a declared estimate series and its error bar as one forest layer', () => {
    const effects = estimates({ type: TraceType.FOREST, nullValue: 1 }, [
      { x: 0, y: 1.2, category: STUDIES[0] },
      { x: 1, y: 0.8, category: STUDIES[1] },
    ]);
    const chart = fakeChart({
      title: 'Meta-analysis',
      renderToId: 'forest-chart',
      inverted: true,
      series: [effects, intervals(effects, [
        { x: 0, category: STUDIES[0], low: 0.9, high: 1.6 },
        { x: 1, category: STUDIES[1], low: 0.6, high: 1.1 },
      ])],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.FOREST);
    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
    expect(layers[0].forestOptions).toEqual({ nullValue: 1 });
    expect(layers[0].data as ForestPoint[]).toEqual([
      { x: STUDIES[0], y: 1.2, yMin: 0.9, yMax: 1.6 },
      { x: STUDIES[1], y: 0.8, yMin: 0.6, yMax: 1.1 },
    ]);
    // The whip spans the interval the trace announces, and MAIDR highlights
    // the same element from all three of its sections.
    expect(layers[0].selectors).toBe(
      '#forest-chart .highcharts-series-group .highcharts-series-1 g.highcharts-point',
    );
  });

  it('reads the weight and the pooled row off the studies own columns', () => {
    const effects = estimates({ type: TraceType.FOREST }, [
      { x: 0, y: 1.2, category: STUDIES[0], options: { weight: 0.35 } },
      { x: 1, y: 0.8, category: STUDIES[1], options: { weight: 0.65 } },
      { x: 2, y: 0.94, category: STUDIES[2], options: { pooled: true } },
    ]);
    const chart = fakeChart({ series: [effects] });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ForestPoint[];

    // Weight is drawn as marker AREA and stated nowhere in the chart object;
    // the pooled row is not evidence but what the evidence came to.
    expect(data).toEqual([
      { x: STUDIES[0], y: 1.2, weight: 0.35 },
      { x: STUDIES[1], y: 0.8, weight: 0.65 },
      { x: STUDIES[2], y: 0.94, pooled: true },
    ]);
  });

  it('leaves out a weight that is a percentage rather than a share', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const effects = estimates({ type: TraceType.FOREST }, [
      { x: 0, y: 1.2, category: STUDIES[0], options: { weight: 35 } },
    ]);
    const chart = fakeChart({ series: [effects] });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ForestPoint[];

    // Dividing by a hundred would guess that the column sums to one;
    // announcing it untouched says the study weighs 3500%.
    expect(data).toEqual([{ x: STUDIES[0], y: 1.2 }]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('weights outside 0 to 1'),
    );
    warn.mockRestore();
  });

  it('counts pooledIndex over the rows as authored, dropped ones included', () => {
    const effects = estimates({ type: TraceType.FOREST, pooledIndex: 2 }, [
      { x: 0, y: 1.2, category: STUDIES[0] },
      // A study the chart drew no mark for — it has no estimate and no bounds.
      { x: 1, y: null, category: STUDIES[1] },
      { x: 2, y: 0.94, category: STUDIES[2] },
    ]);
    const chart = fakeChart({ series: [effects] });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ForestPoint[];

    // Counting the emitted rows instead would mark Adams as the summary.
    expect(data).toEqual([
      { x: STUDIES[0], y: 1.2 },
      { x: STUDIES[2], y: 0.94, pooled: true },
    ]);
  });

  it('makes no claim about the null line when the declaration names none', () => {
    const effects = estimates({ type: TraceType.FOREST }, [
      { x: 0, y: 1.2, category: STUDIES[0] },
    ]);
    // The reference line a forest plot draws is on the axis, and reading it
    // would report every study as not crossing on the chart that drew a line
    // for some other reason.
    effects.xAxis = fakeAxis({ categories: STUDIES, options: { plotLines: [{ value: 1 }] } });
    const chart = fakeChart({ series: [effects] });

    expect(highchartsToMaidr(chart).subplots[0][0].layers[0].forestOptions).toBeUndefined();
  });

  it('reads a declaration written on the error bar itself', () => {
    const effects = fakeSeries({
      index: 0,
      type: 'scatter',
      name: 'Odds ratio',
      xAxis: fakeAxis({ categories: STUDIES }),
      options: { id: 'effects' },
      data: [
        { x: 0, y: 1.2, category: STUDIES[0] },
        { x: 1, y: 0.8, category: STUDIES[1] },
      ],
    });
    const whips = intervals(effects, [
      { x: 0, category: STUDIES[0], low: 0.9, high: 1.6 },
      { x: 1, category: STUDIES[1], low: 0.6, high: 1.1 },
    ]);
    whips.options.custom = { maidr: { type: TraceType.FOREST, nullValue: 1 } };
    const chart = fakeChart({ series: [effects, whips] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    // The whip carries only the interval; Highcharts leaves the estimate in
    // the series it is linked to, and that series must not become a second
    // layer announcing the same numbers without them.
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.FOREST);
    expect(layers[0].data as ForestPoint[]).toEqual([
      { x: STUDIES[0], y: 1.2, yMin: 0.9, yMax: 1.6 },
      { x: STUDIES[1], y: 0.8, yMin: 0.6, yMax: 1.1 },
    ]);
  });

  it('normalises an interval declared as an offset, and prefers stated bounds', () => {
    const effects = estimates({ type: TraceType.FOREST, error: 'se' }, [
      { x: 0, y: 1.5, category: STUDIES[0], options: { se: 0.25 } },
      { x: 1, y: 1, category: STUDIES[1], options: { se: [0.25, 0.5] } },
      { x: 2, y: 0.94, category: STUDIES[2], options: { se: 0.5, yMin: 0.9, yMax: 1 } },
    ]);
    const chart = fakeChart({ series: [effects] });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as ForestPoint[];

    // Both forms are positive magnitudes, as `yerr` is; stated bounds win
    // because they need no arithmetic.
    expect(data).toEqual([
      { x: STUDIES[0], y: 1.5, yMin: 1.25, yMax: 1.75 },
      { x: STUDIES[1], y: 1, yMin: 0.75, yMax: 1.5 },
      { x: STUDIES[2], y: 0.94, yMin: 0.9, yMax: 1 },
    ]);
  });

  it('absorbs the series drawing the pooled summary and puts it last', () => {
    const effects = estimates({ type: TraceType.FOREST, pooledSeries: 'summary' }, [
      { x: 0, y: 1.2, category: STUDIES[0] },
      { x: 1, y: 0.8, category: STUDIES[1] },
    ]);
    const summary = fakeSeries({
      index: 1,
      type: 'scatter',
      name: 'Pooled',
      xAxis: effects.xAxis,
      options: { id: 'summary' },
      data: [{ x: 2, y: 0.94, category: STUDIES[2] }],
    });
    const chart = fakeChart({ renderToId: 'pooled-chart', series: [effects, summary] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].data as ForestPoint[]).toEqual([
      { x: STUDIES[0], y: 1.2 },
      { x: STUDIES[1], y: 0.8 },
      { x: STUDIES[2], y: 0.94, pooled: true },
    ]);
    // The diamond is drawn by its own series, so its rows are highlighted
    // through their own marks, appended in the order the rows were.
    expect(layers[0].selectors).toEqual([
      expect.stringContaining('highcharts-series-0'),
      expect.stringContaining('highcharts-series-1'),
    ]);
  });

  it('emits the layer without a companion the chart does not have', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const effects = estimates({ type: TraceType.FOREST, intervalSeries: 'whips' }, [
      { x: 0, y: 1.2, category: STUDIES[0] },
    ]);
    const chart = fakeChart({ series: [effects] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers[0].type).toBe(TraceType.FOREST);
    expect(layers[0].data as ForestPoint[]).toEqual([{ x: STUDIES[0], y: 1.2 }]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('names series "whips", which this chart does not have'),
    );
    warn.mockRestore();
  });
});
