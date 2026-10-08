import type { HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import type { PercentileBandRef } from '@type/declaration';
import type { PercentileBandPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/** A fan chart's two bands, nested, declared from the outside in or not. */
const BANDS = [
  { series: 'p25-75', lower: 0.25, upper: 0.75 },
  { series: 'p5-95', lower: 0.05, upper: 0.95 },
];

function band(index: number, id: string, spread: number, type = 'arearange'): HighchartsSeries {
  const data: Partial<HighchartsPoint>[] = [0, 1, 2].map(x =>
    ({ x, low: x - spread, high: x + spread, options: { x } }));
  return fakeSeries({ index, type, name: id, data, options: { id } });
}

function median(index: number, bands: PercentileBandRef[] = BANDS, type = 'line'): HighchartsSeries {
  const data: Partial<HighchartsPoint>[] = [0, 1, 2].map(x => ({ x, y: x, options: { x, y: x } }));
  return fakeSeries({
    index,
    type,
    name: 'Median',
    data,
    options: { custom: { maidr: { type: TraceType.PERCENTILE_BAND, bands } } },
  });
}

describe('highcharts percentile band declaration', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads a median and the range series it names as one fan chart', () => {
    const chart = fakeChart({
      renderToId: 'fan',
      series: [band(0, 'p5-95', 2), band(1, 'p25-75', 1, 'areasplinerange'), median(2)],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PERCENTILE_BAND);
    expect((layers[0].data as PercentileBandPoint[])[1]).toEqual({
      x: 1,
      quantiles: [
        { level: 0.5, value: 1 },
        { level: 0.05, value: -1 },
        { level: 0.95, value: 3 },
        { level: 0.25, value: 0 },
        { level: 0.75, value: 2 },
      ],
    });
    // One area per band, outermost first, then the median's own line --
    // measured against Highcharts 12.6.2 in Chromium.
    expect(layers[0].selectors).toEqual([
      '#fan .highcharts-series-group .highcharts-series-0 path.highcharts-area',
      '#fan .highcharts-series-group .highcharts-series-1 path.highcharts-area',
      '#fan .highcharts-series-group .highcharts-series-2 path.highcharts-graph',
    ]);
  });

  it('leaves the bands to their own layers when nothing declares them', () => {
    const plain = median(2);
    plain.options = {};
    const chart = fakeChart({ series: [band(0, 'p5-95', 2), band(1, 'p25-75', 1), plain] });

    const types = highchartsToMaidr(chart).subplots[0][0].layers.map(layer => layer.type);

    expect(types).not.toContain(TraceType.PERCENTILE_BAND);
  });

  it('keeps the bands it can resolve and reports the one it cannot', () => {
    const chart = fakeChart({ series: [band(0, 'p5-95', 2), median(1)] });

    const [layer] = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.PERCENTILE_BAND);
    expect((layer.data as PercentileBandPoint[])[0].quantiles.map(q => q.level))
      .toEqual([0.5, 0.05, 0.95]);
    expect(layer.selectors).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names series "p25-75", which this chart does not have'));
  });

  it('refuses a band drawn as something other than a range', () => {
    const chart = fakeChart({ series: [band(0, 'p5-95', 2, 'line'), band(1, 'p25-75', 1), median(2)] });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers.find(layer => layer.type === TraceType.PERCENTILE_BAND)?.selectors).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs an "arearange" or "areasplinerange" series'));
  });

  it('refuses a declaration on a series that draws no median line', () => {
    const chart = fakeChart({ series: [band(0, 'p5-95', 2), median(1, BANDS, 'column')] });

    const types = highchartsToMaidr(chart).subplots[0][0].layers.map(layer => layer.type);

    expect(types).not.toContain(TraceType.PERCENTILE_BAND);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a "line" or "spline" series drawing the median'));
  });

  it('refuses bands that do not nest', () => {
    const chart = fakeChart({
      series: [band(0, 'a', 2), band(1, 'b', 1), median(2, [
        { series: 'a', lower: 0.05, upper: 0.75 },
        { series: 'b', lower: 0.25, upper: 0.95 },
      ])],
    });

    const types = highchartsToMaidr(chart).subplots[0][0].layers.map(layer => layer.type);

    expect(types).not.toContain(TraceType.PERCENTILE_BAND);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('do not nest'));
  });
});
