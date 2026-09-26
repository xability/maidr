import type { CandlestickPoint, LinePoint } from '@type/grammar';
import {
  defaultTimeFormatter,
  fromLightweightChart,
  kindOf,
  readLightweightChart,
} from '@adapters/lightweight-charts/converters';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { day, fakeChart, fakeSeries } from './helpers';

const ohlc = [
  { time: day(2), open: 10, high: 12, low: 9, close: 11 },
  { time: day(3), open: 11, high: 11.5, low: 8, close: 9 },
  { time: day(6), open: 9, high: 10, low: 9, close: 9 },
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('kindOf', () => {
  it.each([
    ['Candlestick', 'candlestick'],
    ['Bar', 'candlestick'],
    ['Line', 'line'],
    ['Area', 'line'],
    ['Baseline', 'line'],
    ['Histogram', 'bar'],
    ['Custom', null],
  ])('reads a %s series as %s', (type, kind) => {
    expect(kindOf(type)).toBe(kind);
  });
});

describe('defaultTimeFormatter', () => {
  it('writes a daily chart\'s timestamps as dates', () => {
    const label = defaultTimeFormatter([day(2), day(3)]);

    expect(label(day(2))).toBe('2025-01-02');
  });

  it('adds the time of day to every bar once any bar is intraday', () => {
    const noon = day(2) + 12 * 3600;
    const label = defaultTimeFormatter([day(2), noon]);

    expect(label(day(2))).toBe('2025-01-02 00:00');
    expect(label(noon)).toBe('2025-01-02 12:00');
  });

  it('adds seconds once any bar falls between minutes', () => {
    const label = defaultTimeFormatter([day(2) + 5]);

    expect(label(day(2) + 5)).toBe('2025-01-02 00:00:05');
  });

  it('writes a business day and passes a string through', () => {
    const label = defaultTimeFormatter([]);

    expect(label({ year: 2025, month: 3, day: 7 })).toBe('2025-03-07');
    expect(label('2025-03-07')).toBe('2025-03-07');
  });
});

describe('readLightweightChart', () => {
  it('reads each series type as its layer', () => {
    const chart = fakeChart([{
      series: [
        fakeSeries('Candlestick', ohlc),
        fakeSeries('Bar', ohlc),
        fakeSeries('Line', [{ time: day(2), value: 1 }]),
        fakeSeries('Area', [{ time: day(2), value: 1 }]),
        fakeSeries('Baseline', [{ time: day(2), value: 1 }]),
        fakeSeries('Histogram', [{ time: day(2), value: 1 }]),
      ],
    }]);

    const { maidr } = readLightweightChart(chart);

    expect(maidr.subplots[0][0].layers.map(layer => layer.type)).toEqual([
      TraceType.CANDLESTICK,
      TraceType.CANDLESTICK,
      TraceType.LINE,
      TraceType.LINE,
      TraceType.LINE,
      TraceType.BAR,
    ]);
  });

  it('reads a candle with its trend and range', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }]);

    const data = readLightweightChart(chart).maidr.subplots[0][0].layers[0].data as CandlestickPoint[];

    expect(data[0]).toEqual({ value: '2025-01-02', open: 10, high: 12, low: 9, close: 11, volatility: 3, trend: 'Bull' });
    expect(data[1].trend).toBe('Bear');
    expect(data[2].trend).toBe('Neutral');
  });

  it('stacks the panes bottom-first, so Up moves to the pane above', () => {
    const chart = fakeChart([
      { series: [fakeSeries('Candlestick', ohlc), fakeSeries('Line', [{ time: day(2), value: 10 }])] },
      { series: [fakeSeries('Histogram', [{ time: day(2), value: 500 }])] },
    ]);

    const { maidr, series } = readLightweightChart(chart);

    expect(maidr.subplots.map(row => row[0].layers.map(layer => layer.id))).toEqual([
      ['pane1-series0'],
      ['pane0-series0', 'pane0-series1'],
    ]);
    expect(series.map(reading => [reading.layerId, reading.paneIndex, reading.subplotRow])).toEqual([
      ['pane1-series0', 1, 0],
      ['pane0-series0', 0, 1],
      ['pane0-series1', 0, 1],
    ]);
  });

  it('reads across whitespace, which the chart leaves out of its data', () => {
    const rows = [{ time: day(2), value: 1 }, { time: day(3) }, { time: day(6), value: 3 }];
    const chart = fakeChart([{ series: [fakeSeries('Line', rows), fakeSeries('Histogram', rows)] }]);

    const { maidr, series } = readLightweightChart(chart);
    const [line, bars] = maidr.subplots[0][0].layers;

    expect((line.data as LinePoint[][])[0]).toEqual([{ x: '2025-01-02', y: 1 }, { x: '2025-01-06', y: 3 }]);
    expect(bars.data).toEqual([{ x: '2025-01-02', y: 1 }, { x: '2025-01-06', y: 3 }]);
    expect(series[1].items.map(item => item.time)).toEqual([day(2), day(6)]);
  });

  it('labels the y axis by series title, then the chart option, then the type', () => {
    const chart = fakeChart([{
      series: [
        fakeSeries('Candlestick', ohlc, { title: 'ACME' }),
        fakeSeries('Candlestick', ohlc),
        fakeSeries('Line', [{ time: day(2), value: 1 }]),
      ],
    }]);

    const plain = readLightweightChart(chart).maidr.subplots[0][0].layers;
    const labelled = readLightweightChart(chart, { axes: { x: 'Date', y: 'USD' } }).maidr.subplots[0][0].layers;

    expect(plain.map(layer => [layer.title, layer.axes?.x, layer.axes?.y])).toEqual([
      ['ACME', { label: 'Time' }, { label: 'ACME' }],
      ['Candlestick series', { label: 'Time' }, { label: 'Price' }],
      ['Line series', { label: 'Time' }, { label: 'Value' }],
    ]);
    expect(labelled.map(layer => layer.axes?.y)).toEqual([{ label: 'ACME' }, { label: 'USD' }, { label: 'USD' }]);
    expect(labelled[0].axes?.x).toEqual({ label: 'Date' });
  });

  it('carries the series price format where MAIDR has the same one', () => {
    const chart = fakeChart([{
      series: [
        fakeSeries('Line', [{ time: day(2), value: 1 }], { priceFormat: { type: 'price', precision: 3 } }),
        fakeSeries('Histogram', [{ time: day(2), value: 1 }], { priceFormat: { type: 'volume' } }),
        fakeSeries('Line', [{ time: day(2), value: 1 }], { priceFormat: { type: 'percent', precision: 2 } }),
      ],
    }]);

    const layers = readLightweightChart(chart).maidr.subplots[0][0].layers;

    // A volume is shown to its precision without trailing zeros, which no
    // fixed decimal count matches; rounding it to whole numbers read 0.4 as 0.
    expect(layers.map(layer => layer.axes?.y?.format)).toEqual([
      { type: 'number', decimals: 3 },
      undefined,
      undefined,
    ]);
  });

  it('leaves out hidden, empty and custom series, and panes left with none', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart([
      { series: [fakeSeries('Candlestick', ohlc), fakeSeries('Line', [{ time: day(2), value: 1 }], { visible: false })] },
      { series: [fakeSeries('Histogram', []), fakeSeries('Custom', [{ time: day(2), value: 1 }])] },
    ]);

    const { maidr } = readLightweightChart(chart);

    expect(maidr.subplots).toHaveLength(1);
    expect(maidr.subplots[0][0].layers.map(layer => layer.id)).toEqual(['pane0-series0']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Custom"'));
  });

  it('throws when there is nothing to read', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', [])] }]);

    expect(() => readLightweightChart(chart)).toThrow(/Bind after calling series\.setData/);
  });

  it('keeps the newest maxWidth points of each series', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }]);

    const { maidr, series } = readLightweightChart(chart, { maxWidth: 2 });

    expect((maidr.subplots[0][0].layers[0].data as CandlestickPoint[]).map(point => point.value))
      .toEqual(['2025-01-03', '2025-01-06']);
    expect(series[0].total).toBe(3);
    expect(series[0].items.map(item => item.time)).toEqual([day(3), day(6)]);
    expect(maidr.maxWidth).toBe(2);
  });

  it('uses a formatTime option for every label', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }]);

    const { maidr } = readLightweightChart(chart, { formatTime: time => `t${String(time)}` });

    expect((maidr.subplots[0][0].layers[0].data as CandlestickPoint[])[0].value).toBe(`t${day(2)}`);
  });

  it('takes the figure id from the option, then the container', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }], { containerId: 'prices' });
    const anonymous = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }]);

    expect(readLightweightChart(chart, { id: 'mine' }).maidr.id).toBe('mine');
    expect(readLightweightChart(chart).maidr.id).toBe('prices');
    expect(readLightweightChart(anonymous).maidr.id).toMatch(/^maidr-lightweight-chart-\d+$/);
  });

  it('marks the figure live unless told not to', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }]);

    expect(readLightweightChart(chart).maidr.live).toBe(true);
    expect(readLightweightChart(chart, { live: false }).maidr.live).toBeUndefined();
  });
});

describe('fromLightweightChart', () => {
  it('is not live unless asked, since nothing keeps the JSON in step', () => {
    const chart = fakeChart([{ series: [fakeSeries('Candlestick', ohlc)] }]);

    expect(fromLightweightChart(chart, { title: 'ACME' })).toMatchObject({ title: 'ACME' });
    expect(fromLightweightChart(chart).live).toBeUndefined();
    expect(fromLightweightChart(chart, { live: true }).live).toBe(true);
  });
});
