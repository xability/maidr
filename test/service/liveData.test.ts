import type { BarPoint, CandlestickPoint, LinePoint, Maidr } from '@type/grammar';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { appendPointToMaidr, cloneMaidrData, LiveDataManager } from '@service/liveData';
import { TraceType } from '@type/grammar';

/**
 * Creates a minimal bar-chart Maidr config for live data tests.
 * @param id - The chart identifier
 * @param maxWidth - Optional sliding window size
 * @returns A Maidr config with a single bar layer
 */
function createBarMaidr(id = 'bar-chart', maxWidth?: number): Maidr {
  return {
    id,
    ...(maxWidth !== undefined && { maxWidth }),
    live: true,
    subplots: [[
      {
        layers: [
          {
            id: 'layer-0',
            type: TraceType.BAR,
            axes: { x: { label: 'X' }, y: { label: 'Y' } },
            data: [
              { x: 'A', y: 1 },
              { x: 'B', y: 2 },
            ] as BarPoint[],
          },
        ],
      },
    ]],
  };
}

/**
 * Creates a minimal multiline Maidr config for live data tests.
 * @param id - The chart identifier
 * @returns A Maidr config with a single line layer containing two groups
 */
function createLineMaidr(id = 'line-chart'): Maidr {
  return {
    id,
    live: true,
    subplots: [[
      {
        layers: [
          {
            id: 'line-layer',
            type: TraceType.LINE,
            axes: { x: { label: 'X' }, y: { label: 'Y' } },
            data: [
              [{ x: 1, y: 10 }, { x: 2, y: 20 }],
              [{ x: 1, y: 5 }],
            ] as LinePoint[][],
          },
        ],
      },
    ]],
  };
}

/**
 * Creates a minimal candlestick Maidr config for live data tests.
 * @param id - The chart identifier
 * @returns A Maidr config with a single candlestick layer (two candles)
 */
function createCandlestickMaidr(id = 'candle-chart'): Maidr {
  return {
    id,
    live: true,
    subplots: [[
      {
        layers: [
          {
            id: 'candle-layer',
            type: TraceType.CANDLESTICK,
            axes: { x: { label: 'Date' }, y: { label: 'Price' } },
            data: [
              { value: '2026-01-01', open: 10, high: 15, low: 9, close: 14, volume: 100, trend: 'Bull', volatility: 6 },
              { value: '2026-01-02', open: 14, high: 18, low: 13, close: 17, volume: 120, trend: 'Bull', volatility: 5 },
            ] as CandlestickPoint[],
          },
        ],
      },
    ]],
  };
}

describe('appendPointToMaidr', () => {
  test('appends a point to flat (bar) layer data', () => {
    const maidr = createBarMaidr();
    const result = appendPointToMaidr(maidr, { x: 'C', y: 3 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as BarPoint[];
    expect(data).toHaveLength(3);
    expect(data[2]).toEqual({ x: 'C', y: 3 });
    expect(result!.appended).toEqual({
      subplotRow: 0,
      subplotCol: 0,
      layerIndex: 0,
      layerId: 'layer-0',
      row: 0,
      col: 2,
      trimmed: 0,
      nested: false,
      trimShift: 'col',
    });
  });

  test('does not mutate the original maidr data', () => {
    const maidr = createBarMaidr();
    appendPointToMaidr(maidr, { x: 'C', y: 3 });

    expect(maidr.subplots[0][0].layers[0].data).toHaveLength(2);
  });

  test('appends to the default group (0) of nested (line) layer data', () => {
    const maidr = createLineMaidr();
    const result = appendPointToMaidr(maidr, { x: 3, y: 30 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as LinePoint[][];
    expect(data[0]).toHaveLength(3);
    expect(data[0][2]).toEqual({ x: 3, y: 30 });
    expect(data[1]).toHaveLength(1);
    expect(result!.appended.row).toBe(0);
    expect(result!.appended.col).toBe(2);
  });

  test('appends to a specific group via groupIndex', () => {
    const maidr = createLineMaidr();
    const result = appendPointToMaidr(maidr, { x: 2, y: 6 }, { groupIndex: 1 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as LinePoint[][];
    expect(data[1]).toHaveLength(2);
    expect(result!.appended.row).toBe(1);
    expect(result!.appended.col).toBe(1);
  });

  test('marks nested (line) appends with nested: true', () => {
    const maidr = createLineMaidr();
    const result = appendPointToMaidr(maidr, { x: 3, y: 30 });

    expect(result!.appended.nested).toBe(true);
    expect(result!.appended.trimShift).toBe('col');
  });

  test('appends a full OHLC candle to a candlestick layer', () => {
    const maidr = createCandlestickMaidr();
    const candle: CandlestickPoint = {
      value: '2026-01-03',
      open: 17,
      high: 19,
      low: 12,
      close: 13,
      volume: 90,
      trend: 'Bear',
      volatility: 7,
    };

    const result = appendPointToMaidr(maidr, candle);

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as CandlestickPoint[];
    expect(data).toHaveLength(3);
    expect(data[2]).toEqual(candle);
    // Announce coordinates target the close section of the new candle
    // (vertical layout: row = section index, col = candle index).
    expect(result!.appended.row).toBe(4);
    expect(result!.appended.col).toBe(2);
    expect(result!.appended.nested).toBe(false);
    expect(result!.appended.trimShift).toBe('col');
  });

  test('applies the maxWidth sliding window to candlestick data', () => {
    const maidr = createCandlestickMaidr();
    maidr.maxWidth = 2;
    const candle: CandlestickPoint = {
      value: '2026-01-03',
      open: 17,
      high: 19,
      low: 12,
      close: 13,
      volume: 90,
      trend: 'Bear',
      volatility: 7,
    };

    const result = appendPointToMaidr(maidr, candle);

    const data = result!.maidr.subplots[0][0].layers[0].data as CandlestickPoint[];
    expect(data).toHaveLength(2);
    expect(data[1]).toEqual(candle);
    expect(result!.appended.trimmed).toBe(1);
    expect(result!.appended.col).toBe(1);
  });

  test('resolves the target layer by layerId', () => {
    const maidr = createBarMaidr();
    const result = appendPointToMaidr(maidr, { x: 'C', y: 3 }, { layerId: 'layer-0' });

    expect(result).not.toBeNull();
    expect(result!.appended.layerId).toBe('layer-0');
  });

  test('treats an empty nested-data layer (line with data: []) as nested', () => {
    const maidr = createLineMaidr();
    maidr.subplots[0][0].layers[0].data = [];

    const result = appendPointToMaidr(maidr, { x: 1, y: 10 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as LinePoint[][];
    expect(data).toEqual([[{ x: 1, y: 10 }]]);
    expect(result!.appended.row).toBe(0);
    expect(result!.appended.col).toBe(0);
  });

  test('creates a new group when groupIndex equals the current group count', () => {
    const maidr = createLineMaidr();
    const result = appendPointToMaidr(maidr, { x: 1, y: 99 }, { groupIndex: 2 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as LinePoint[][];
    expect(data).toHaveLength(3);
    expect(data[2]).toEqual([{ x: 1, y: 99 }]);
    expect(result!.appended.row).toBe(2);
    expect(result!.appended.col).toBe(0);
  });

  test('returns null for an unknown layerId', () => {
    const maidr = createBarMaidr();
    const result = appendPointToMaidr(maidr, { x: 'C', y: 3 }, { layerId: 'missing' });

    expect(result).toBeNull();
  });

  test('returns null for a groupIndex beyond the next new group', () => {
    const maidr = createLineMaidr();
    const result = appendPointToMaidr(maidr, { x: 3, y: 30 }, { groupIndex: 5 });

    expect(result).toBeNull();
  });

  test('returns null for an out-of-range subplot position', () => {
    const maidr = createBarMaidr();
    const result = appendPointToMaidr(maidr, { x: 'C', y: 3 }, { subplotRow: 3 });

    expect(result).toBeNull();
  });

  test('returns null for non-array (heatmap) layer data', () => {
    const maidr = createBarMaidr();
    maidr.subplots[0][0].layers[0].type = TraceType.HEATMAP;
    maidr.subplots[0][0].layers[0].data = { x: ['a'], y: ['b'], points: [[1]] };

    const result = appendPointToMaidr(maidr, { x: 'C', y: 3 });

    expect(result).toBeNull();
  });

  test('applies the maxWidth sliding window to flat data', () => {
    const maidr = createBarMaidr('bar-chart', 2);
    const result = appendPointToMaidr(maidr, { x: 'C', y: 3 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as BarPoint[];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ x: 'B', y: 2 });
    expect(data[1]).toEqual({ x: 'C', y: 3 });
    expect(result!.appended.trimmed).toBe(1);
    expect(result!.appended.col).toBe(1);
  });

  test('applies the maxWidth sliding window per group for nested data', () => {
    const maidr = createLineMaidr();
    maidr.maxWidth = 2;
    const result = appendPointToMaidr(maidr, { x: 3, y: 30 });

    expect(result).not.toBeNull();
    const data = result!.maidr.subplots[0][0].layers[0].data as LinePoint[][];
    expect(data[0]).toHaveLength(2);
    expect(data[0][0]).toEqual({ x: 2, y: 20 });
    expect(data[0][1]).toEqual({ x: 3, y: 30 });
    expect(result!.appended.trimmed).toBe(1);
  });
});

describe('cloneMaidrData', () => {
  test('deep-clones the data so mutations do not affect the original', () => {
    const maidr = createBarMaidr();
    const clone = cloneMaidrData(maidr);

    (clone.subplots[0][0].layers[0].data as BarPoint[]).push({ x: 'C', y: 3 });

    expect(maidr.subplots[0][0].layers[0].data).toHaveLength(2);
    expect(clone.subplots[0][0].layers[0].data).toHaveLength(3);
  });

  test('preserves the non-serializable onNavigate callback by reference', () => {
    const maidr = createBarMaidr();
    const onNavigate = jest.fn();
    maidr.onNavigate = onNavigate;

    const clone = cloneMaidrData(maidr);

    expect(clone.onNavigate).toBe(onNavigate);
  });

  test('omits onNavigate when the original has none', () => {
    const clone = cloneMaidrData(createBarMaidr());

    expect(clone.onNavigate).toBeUndefined();
  });
});

describe('liveDataManager', () => {
  let manager: LiveDataManager;

  beforeEach(() => {
    manager = new LiveDataManager();
  });

  test('setData notifies the registered listener and updates stored data', () => {
    const initial = createBarMaidr();
    const listener = jest.fn();
    manager.register(initial, listener);

    const replacement = createBarMaidr();
    (replacement.subplots[0][0].layers[0].data as BarPoint[]).push({ x: 'C', y: 3 });

    expect(manager.setData(replacement)).toBe(true);
    expect(listener).toHaveBeenCalledWith({ maidr: replacement });
    expect(manager.getData(initial.id)).toBe(replacement);
  });

  test('setData returns false for an unregistered chart id', () => {
    expect(manager.setData(createBarMaidr('unknown'))).toBe(false);
  });

  test('appendData merges the point into stored data and notifies with append info', () => {
    const initial = createBarMaidr();
    const listener = jest.fn();
    manager.register(initial, listener);

    expect(manager.appendData({ x: 'C', y: 3 }, { id: initial.id })).toBe(true);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as {
      maidr: Maidr;
      appended: { col: number };
    };
    expect((event.maidr.subplots[0][0].layers[0].data as BarPoint[])).toHaveLength(3);
    expect(event.appended.col).toBe(2);
  });

  test('consecutive appendData calls accumulate', () => {
    const initial = createBarMaidr();
    manager.register(initial, jest.fn());

    manager.appendData({ x: 'C', y: 3 }, { id: initial.id });
    manager.appendData({ x: 'D', y: 4 }, { id: initial.id });

    const stored = manager.getData(initial.id)!;
    expect(stored.subplots[0][0].layers[0].data as BarPoint[]).toHaveLength(4);
  });

  test('appendData defaults to the only registered chart when id is omitted', () => {
    const initial = createBarMaidr();
    const listener = jest.fn();
    manager.register(initial, listener);

    expect(manager.appendData({ x: 'C', y: 3 })).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('appendData without id fails when multiple charts are registered', () => {
    manager.register(createBarMaidr('one'), jest.fn());
    manager.register(createLineMaidr('two'), jest.fn());

    expect(manager.appendData({ x: 'C', y: 3 })).toBe(false);
  });

  test('disposing a stale registration does not evict a newer one for the same id', () => {
    const first = jest.fn();
    const second = jest.fn();
    const staleDisposable = manager.register(createBarMaidr(), first);
    manager.register(createBarMaidr(), second);

    // Disposing the replaced (stale) registration must not unregister the
    // chart: the listener-identity guard keeps the newer registration alive.
    staleDisposable.dispose();

    expect(manager.setData(createBarMaidr())).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  test('register returns a disposable that unregisters the chart', () => {
    const initial = createBarMaidr();
    const listener = jest.fn();
    const disposable = manager.register(initial, listener);

    disposable.dispose();

    expect(manager.setData(createBarMaidr())).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  test('updateStoredData replaces stored data without notifying', () => {
    const initial = createBarMaidr();
    const listener = jest.fn();
    manager.register(initial, listener);

    const replacement = createBarMaidr();
    manager.updateStoredData(replacement);

    expect(manager.getData(initial.id)).toBe(replacement);
    expect(listener).not.toHaveBeenCalled();
  });
});
