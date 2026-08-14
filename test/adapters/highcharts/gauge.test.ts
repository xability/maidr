import type { GaugePoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

describe('highcharts gauge series', () => {
  it('reads the dial ends from the value axis and names the measure', () => {
    const yAxis = fakeAxis({
      getExtremes: () => ({ min: 0, max: 200 }),
      options: { title: { text: 'km/h' } },
    });
    const chart = fakeChart({
      title: 'Speedometer',
      type: 'gauge',
      renderToId: 'gauge-chart',
      series: [fakeSeries({ index: 0, type: 'gauge', name: 'Speed', yAxis, data: [{ y: 73 }] })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.GAUGE);
    // A single object, not an array of one: the chart draws exactly one
    // measure.
    expect(layer.data as GaugePoint).toEqual({
      value: 73,
      min: 0,
      max: 200,
      label: 'Speed',
    });
    // A dial carries no point class at all — Highcharts builds it with
    // `addClass('highcharts-dial')`.
    expect(layer.selectors).toBe(
      '#gauge-chart .highcharts-series-group .highcharts-series-0 .highcharts-dial',
    );
    expect(layer.axes?.x?.label).toBe('Measure');
    expect(layer.axes?.y?.label).toBe('km/h');
  });

  it('carries a bullet chart\'s target and its axis bands, lowest first', () => {
    const yAxis = fakeAxis({
      getExtremes: () => ({ min: 0, max: 300 }),
      options: {
        plotBands: [
          { from: 225, to: 300, label: { text: 'good' } },
          { from: 0, to: 150, label: { text: 'poor' } },
          { from: 150, to: 225, label: { text: 'ok' } },
        ],
      },
    });
    const chart = fakeChart({
      type: 'bullet',
      renderToId: 'bullet-chart',
      series: [fakeSeries({
        index: 0,
        type: 'bullet',
        name: 'Revenue',
        yAxis,
        data: [{ y: 275, target: 250 }],
      })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    // A band is carried by its upper edge alone, so the list has to ascend:
    // a band starts where the previous one ended.
    expect(layer.data as GaugePoint).toEqual({
      value: 275,
      min: 0,
      max: 300,
      label: 'Revenue',
      target: 250,
      bands: [
        { to: 150, label: 'poor' },
        { to: 225, label: 'ok' },
        { to: 300, label: 'good' },
      ],
    });
    // The target marker carries the point class too, and is announced rather
    // than highlighted.
    expect(layer.selectors).toBe(
      '#bullet-chart .highcharts-series-group .highcharts-series-0 '
      + '.highcharts-point:not(.highcharts-bullet-target)',
    );
  });

  it('numbers an unnamed band by its position in the partition', () => {
    const yAxis = fakeAxis({
      getExtremes: () => ({ min: 0, max: 100 }),
      options: { plotBands: [{ from: 0, to: 40 }, { from: 40, to: 100 }] },
    });
    const chart = fakeChart({
      type: 'bullet',
      series: [fakeSeries({ index: 0, type: 'bullet', yAxis, data: [{ y: 55 }] })],
    });

    const point = highchartsToMaidr(chart).subplots[0][0].layers[0].data as GaugePoint;

    // Highcharts bands are usually drawn in colour and named nowhere; the
    // position says where the reading landed without inventing a meaning.
    expect(point.bands).toEqual([
      { to: 40, label: 'Band 1' },
      { to: 100, label: 'Band 2' },
    ]);
  });

  it('highlights a solid gauge through its arc, which is an ordinary point', () => {
    const chart = fakeChart({
      type: 'solidgauge',
      renderToId: 'solid-chart',
      series: [fakeSeries({ index: 0, type: 'solidgauge', data: [{ y: 12 }] })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.GAUGE);
    expect(layer.selectors).toBe(
      '#solid-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
  });

  it('skips a gauge with no numeric reading', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart({
      type: 'gauge',
      series: [fakeSeries({ index: 0, type: 'gauge', data: [{ y: null }] })],
    });

    expect(highchartsToMaidr(chart).subplots[0][0].layers).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no numeric value'));
    warn.mockRestore();
  });
});
