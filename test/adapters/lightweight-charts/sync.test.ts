import type { LwcDataItem } from '@adapters/lightweight-charts/types';
import { readLightweightChart } from '@adapters/lightweight-charts/converters';
import { planAppends } from '@adapters/lightweight-charts/sync';
import { describe, expect, it } from '@jest/globals';
import { day, fakeChart, fakeSeries } from './helpers';

function candle(n: number, close: number): LwcDataItem {
  return { time: day(n), open: 10, high: 12, low: 9, close };
}

describe('planAppends', () => {
  const setup = (maxWidth?: number): {
    candles: ReturnType<typeof fakeSeries>;
    volume: ReturnType<typeof fakeSeries>;
    read: () => ReturnType<typeof readLightweightChart>;
  } => {
    const candles = fakeSeries('Candlestick', [candle(2, 11), candle(3, 10)]);
    const volume = fakeSeries('Histogram', [{ time: day(2), value: 5 }, { time: day(3), value: 6 }]);
    const chart = fakeChart([{ series: [candles] }, { series: [volume] }]);
    return { candles, volume, read: () => readLightweightChart(chart, { maxWidth }) };
  };

  it('finds nothing to do when nothing changed', () => {
    const { read } = setup();

    expect(planAppends(read(), read())).toEqual([]);
  });

  it('hands a new bar at the end of each series over as an append', () => {
    const { candles, volume, read } = setup();
    const before = read();
    candles.setRows([...candles.data(), candle(6, 12)]);
    volume.setRows([...volume.data(), { time: day(6), value: 7 }]);

    const appends = planAppends(before, read());

    expect(appends?.map(append => [append.reading.layerId, append.point])).toEqual([
      ['pane1-series0', { x: '2025-01-06', y: 7 }],
      ['pane0-series0', expect.objectContaining({ value: '2025-01-06', close: 12 })],
    ]);
  });

  it('replaces the figure when the forming bar is revised in place', () => {
    const { candles, read } = setup();
    const before = read();
    candles.setRows([candle(2, 11), candle(3, 10.5)]);

    expect(planAppends(before, read())).toBeNull();
  });

  it('replaces the figure when a bar arrives and an older one changes with it', () => {
    const { candles, read } = setup();
    const before = read();
    candles.setRows([candle(2, 11), candle(3, 10.5), candle(6, 12)]);

    expect(planAppends(before, read())).toBeNull();
  });

  it('replaces the figure on a reload of a different length', () => {
    const { candles, read } = setup();
    const before = read();
    candles.setRows([candle(2, 11)]);

    expect(planAppends(before, read())).toBeNull();
  });

  it('replaces the figure when a series joins it', () => {
    const empty = fakeSeries('Line', []);
    const candles = fakeSeries('Candlestick', [candle(2, 11)]);
    const chart = fakeChart([{ series: [candles, empty] }]);
    const before = readLightweightChart(chart);
    empty.setRows([{ time: day(2), value: 1 }]);

    expect(planAppends(before, readLightweightChart(chart))).toBeNull();
  });

  it('still appends once the maxWidth window is full and drops the oldest bar', () => {
    const { candles, read } = setup(2);
    const before = read();
    candles.setRows([...candles.data(), candle(6, 12)]);

    const appends = planAppends(before, read());

    expect(appends?.map(append => append.reading.layerId)).toEqual(['pane0-series0']);
  });
});
