import type { CandlestickDeltaCandle } from '@model/candlestickDelta';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import {
  ABOVE_LINE_MODE,
  BELOW_LINE_MODE,
  CandlestickDeltaTrace,
  DELTA_POINT_MODE,
  deltaTrend,
  ON_LINE_MODE,
  roundDelta,
} from '@model/candlestickDelta';
import { TraceType } from '@type/grammar';

/**
 * Creates a synthetic layer definition for the virtual delta trace.
 * @returns A candlestick-delta layer definition
 */
function createLayer(): MaidrLayer {
  return {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK_DELTA,
    title: 'OHLC price vs MA 3',
    axes: { x: { label: 'Date' }, y: { label: 'Price delta' } },
    data: [],
  };
}

/**
 * Four candles over a flat reference line of 10. Close deltas are
 * +2, -1.5, 0, +0.5 (above, below, on line, above); the largest |delta|
 * across every field is the high of 2026-01-01 (+3).
 */
const CANDLES: CandlestickDeltaCandle[] = [
  { x: '2026-01-01', reference: 10, open: 11, high: 13, low: 9, close: 12 },
  { x: '2026-01-02', reference: 10, open: 9, high: 11, low: 8, close: 8.5 },
  { x: '2026-01-03', reference: 10, open: 10, high: 10.5, low: 9.5, close: 10 },
  { x: '2026-01-04', reference: 10, open: 10.2, high: 11, low: 10, close: 10.5 },
];

/**
 * Creates a delta trace over {@link CANDLES}, starting on the close field.
 * @returns The trace under test
 */
function createTrace(): CandlestickDeltaTrace {
  return new CandlestickDeltaTrace(createLayer(), {
    candles: CANDLES.map(candle => ({ ...candle })),
    referenceLabel: 'Moving Average 3 days',
    initialField: 'close',
  });
}

/**
 * Enters the trace (consumes the initial-entry move) so subsequent moves
 * actually navigate.
 * @param trace - The trace to enter
 */
function enter(trace: CandlestickDeltaTrace): void {
  trace.moveOnce('FORWARD');
}

describe('roundDelta and deltaTrend', () => {
  test('suppresses binary float noise so on-line points compare to zero', () => {
    expect(roundDelta(0.1 + 0.2 - 0.3)).toBe(0);
    expect(roundDelta(10.75 - 10.5)).toBe(0.25);
  });

  test('scales the zero tolerance to operand magnitude for large prices', () => {
    expect(roundDelta(2e-3, 1.6e9)).toBe(0);
    expect(roundDelta(2e-3, 10)).toBe(0.002);
    expect(roundDelta(1500, 1.6e9)).toBe(1500);
  });

  test('preserves precision at large magnitude instead of overflowing', () => {
    expect(roundDelta(12.5, 1.6e9)).toBe(12.5);
  });

  test('maps delta sign to bull, bear, and neutral trends', () => {
    expect(deltaTrend(0.01)).toBe('Bull');
    expect(deltaTrend(-0.01)).toBe('Bear');
    expect(deltaTrend(0)).toBe('Neutral');
  });
});

describe('candlestickDelta candle navigation', () => {
  test('moves left and right through the candles, starting on close', () => {
    const trace = createTrace();
    enter(trace);
    expect(trace.col).toBe(0);
    expect(trace.comparedField).toBe('close');
    expect(trace.getCurrentXValue()).toBe('2026-01-01');

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.col).toBe(1);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect(trace.col).toBe(0);
  });

  test('setInitialPosition places the cursor on a candle without initial entry', () => {
    const trace = createTrace();
    trace.setInitialPosition(2);

    expect(trace.isInitialEntry).toBe(false);
    expect(trace.col).toBe(2);
    expect(trace.comparedField).toBe('close');
    expect(trace.getCurrentXValue()).toBe('2026-01-03');
  });

  test('moveToXValue jumps to the matching date and rejects unknown dates', () => {
    const trace = createTrace();
    enter(trace);

    expect(trace.moveToXValue('2026-01-04')).toBe(true);
    expect(trace.col).toBe(3);
    expect(trace.moveToXValue('1999-01-01')).toBe(false);
    expect(trace.col).toBe(3);
  });
});

describe('candlestickDelta field navigation', () => {
  test('up and down move through the OHLC fields value-sorted per candle', () => {
    const trace = createTrace();
    enter(trace); // 2026-01-01, close (sorted: low, open, close, high)

    // Up from close reaches high (the top field).
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(trace.comparedField).toBe('high');
    // Already at the top: another up is out of bounds.
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.comparedField).toBe('high');

    // Down walks high -> close -> open -> low, then bottoms out.
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(trace.comparedField).toBe('close');
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(trace.comparedField).toBe('open');
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(trace.comparedField).toBe('low');
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.comparedField).toBe('low');
  });

  test('the compared field is preserved when moving between candles', () => {
    const trace = createTrace();
    enter(trace);
    trace.moveOnce('UPWARD'); // high on 2026-01-01
    trace.moveOnce('FORWARD'); // still high, now 2026-01-02

    expect(trace.comparedField).toBe('high');
    expect(trace.getCurrentXValue()).toBe('2026-01-02');
  });

  test('moveToIndex (braille cursor) preserves the compared field', () => {
    const trace = createTrace();
    enter(trace);
    trace.moveOnce('UPWARD'); // high field
    expect(trace.comparedField).toBe('high');

    // Braille collapses fields to a single row (row 0); moving the cursor must
    // not snap the field back to the candle's lowest value.
    expect(trace.moveToIndex(0, 3)).toBe(true);
    expect(trace.col).toBe(3);
    expect(trace.comparedField).toBe('high');
  });
});

describe('candlestickDelta state', () => {
  test('text describes the field, magnitude and position', () => {
    const trace = createTrace();
    enter(trace);
    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.text.main.value).toBe('2026-01-01');
      expect(state.text.cross.value).toBe(2);
      expect(state.text.section).toBe('close');
      expect(state.text.z?.value).toBe('above line');
    }
  });

  test('text reports below line and on line positions', () => {
    const trace = createTrace();
    trace.setInitialPosition(1);
    const below = trace.state;
    expect(!below.empty && below.text.z?.value).toBe('below line');
    expect(!below.empty && below.text.cross.value).toBe(1.5);

    trace.setInitialPosition(2);
    const onLine = trace.state;
    expect(!onLine.empty && onLine.text.z?.value).toBe('on line');
    expect(!onLine.empty && onLine.text.cross.value).toBe(0);
  });

  test('audio encodes |delta| as pitch and glides up for above-line points', () => {
    const trace = createTrace();
    enter(trace); // 2026-01-01 close: +2 (above)
    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.audio.freq.raw).toBe(2);
      expect(state.audio.freq.min).toBe(0);
      expect(state.audio.freq.max).toBe(3); // global max |delta| (high +3)
      expect(state.audio.glide).toBe('up');
      expect(state.audio.zeroClick).toBeUndefined();
      expect(state.audio.panning).toEqual({ x: 0, y: 2, rows: 4, cols: 4 });
    }
  });

  test('audio glides down for below-line points', () => {
    const trace = createTrace();
    trace.setInitialPosition(1); // close -1.5 (below)
    const state = trace.state;
    expect(!state.empty && state.audio.freq.raw).toBe(1.5);
    expect(!state.empty && state.audio.glide).toBe('down');
  });

  test('audio opts into the zero click on the line with no glide', () => {
    const trace = createTrace();
    trace.setInitialPosition(2); // close 0 (on line)
    const state = trace.state;
    expect(!state.empty && state.audio.freq.raw).toBe(0);
    expect(!state.empty && state.audio.zeroClick).toBe(true);
    expect(!state.empty && state.audio.glide).toBeUndefined();
  });

  test('braille exposes |delta| heights for the current field with bearish markers', () => {
    const trace = createTrace();
    enter(trace);
    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty && !state.braille.empty) {
      expect((state.braille as { values: number[][] }).values).toEqual([
        [2, 1.5, 0, 0.5],
      ]);
      expect(state.braille.custom).toEqual(['Bull', 'Bear', 'Neutral', 'Bull']);
      expect(state.braille.row).toBe(0);
      expect(state.braille.col).toBe(0);
      expect((state.braille as { max: number[] }).max).toEqual([2]);
    }
  });

  test('braille reflects the field after moving up to high', () => {
    const trace = createTrace();
    enter(trace);
    trace.moveOnce('UPWARD'); // high field
    const state = trace.state;

    if (!state.empty && !state.braille.empty) {
      // high deltas: +3, +1, +0.5, +1 (all above the line -> all Bull)
      expect((state.braille as { values: number[][] }).values).toEqual([
        [3, 1, 0.5, 1],
      ]);
      expect(state.braille.custom).toEqual(['Bull', 'Bull', 'Bull', 'Bull']);
    }
  });

  test('braille returns stable array references across candle navigation', () => {
    const trace = createTrace();
    enter(trace);
    const first = trace.state;
    trace.moveOnce('FORWARD');
    const second = trace.state;

    if (!first.empty && !second.empty && !first.braille.empty && !second.braille.empty) {
      expect((second.braille as { values: number[][] }).values)
        .toBe((first.braille as { values: number[][] }).values);
    }
  });

  test('autoplay spans candles horizontally and fields vertically', () => {
    const trace = createTrace();
    enter(trace);
    const state = trace.state;

    expect(!state.empty && state.autoplay.FORWARD).toBe(4);
    expect(!state.empty && state.autoplay.BACKWARD).toBe(4);
    expect(!state.empty && state.autoplay.UPWARD).toBe(4);
    expect(!state.empty && state.autoplay.DOWNWARD).toBe(4);
  });

  test('never highlights (virtual layer)', () => {
    const trace = createTrace();
    enter(trace);
    const state = trace.state;

    expect(!state.empty && state.highlight.empty).toBe(true);
  });

  test('description summarizes the current field, counts, and data table', () => {
    const trace = createTrace();
    const description = trace.description;

    expect(description.chartType).toBe('Candlestick Reference Delta');
    expect(description.stats).toContainEqual({
      label: 'Reference line',
      value: 'Moving Average 3 days',
    });
    expect(description.stats).toContainEqual({ label: 'Compared value', value: 'close' });
    expect(description.stats).toContainEqual({ label: 'Points above line', value: 2 });
    expect(description.stats).toContainEqual({ label: 'Points below line', value: 1 });
    expect(description.stats).toContainEqual({ label: 'Points on line', value: 1 });
    expect(description.dataTable.rows).toHaveLength(4);
    expect(description.dataTable.rows[1]).toEqual([
      '2026-01-02',
      8.5,
      10,
      -1.5,
      'below line',
    ]);
  });
});

describe('candlestickDelta extrema', () => {
  test('exposes max and min signed delta targets for the current field', () => {
    const trace = createTrace();
    const targets = trace.getExtremaTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      label: 'Max Delta at 2026-01-01',
      value: 2,
      pointIndex: 0,
      type: 'max',
      xValue: '2026-01-01',
    });
    expect(targets[1]).toMatchObject({
      label: 'Min Delta at 2026-01-02',
      value: -1.5,
      pointIndex: 1,
      type: 'min',
    });
  });

  test('navigateToExtrema moves the cursor and notifies observers', () => {
    const trace = createTrace();
    enter(trace);
    const observer = { update: jest.fn() };
    trace.addObserver(observer);

    trace.navigateToExtrema(trace.getExtremaTargets()[1]);

    expect(trace.col).toBe(1);
    expect(observer.update).toHaveBeenCalled();
  });

  test('supports extrema navigation (G key gate)', () => {
    const trace = createTrace();
    expect(trace.supportsExtremaNavigation()).toBe(true);
  });
});

describe('candlestickDelta rotor', () => {
  test('renames the default unit and the compare units', () => {
    const trace = createTrace();

    expect(trace.dataModeName()).toBe(DELTA_POINT_MODE);
    const info = trace.compareModeInfo();
    expect(info.higher.label).toBe(ABOVE_LINE_MODE);
    expect(info.lower.label).toBe(BELOW_LINE_MODE);
  });

  test('always offers the on-line filter unit, regardless of the current field', () => {
    const trace = createTrace();
    const closeUnits = trace.getRotorFilterUnits();
    expect(closeUnits).toHaveLength(1);
    expect(closeUnits[0].label).toBe(ON_LINE_MODE);

    // high never touches the line (deltas +3, +1, +0.5, +1), but the unit
    // stays offered so the above/on/below trichotomy is stable as the user
    // moves between fields; moving simply reports no point on the line.
    enter(trace);
    trace.moveOnce('UPWARD'); // high field
    expect(trace.getRotorFilterUnits()).toHaveLength(1);
    expect(trace.moveToRotorFilter('onLine', 'right')).toBe(false);
    expect(trace.moveToRotorFilter('onLine', 'left')).toBe(false);
  });

  test('offers the on-line unit even when no candle sits exactly on the line', () => {
    // Every field of every candle is strictly above or below the reference,
    // as real moving-average data usually is.
    const trace = new CandlestickDeltaTrace(createLayer(), {
      candles: [
        { x: 'a', reference: 10, open: 11, high: 12, low: 10.5, close: 11.5 },
        { x: 'b', reference: 10, open: 9, high: 9.5, low: 8, close: 8.8 },
      ],
      referenceLabel: 'Moving Average 3 days',
      initialField: 'close',
    });

    expect(trace.getRotorFilterUnits()).toHaveLength(1);
    enter(trace);
    expect(trace.moveToRotorFilter('onLine', 'right')).toBe(false);
  });

  test('above-line unit skips to the next point above the reference', () => {
    const trace = createTrace();
    enter(trace); // col 0 (+2)

    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(trace.col).toBe(3); // skips -1.5 and 0 to reach +0.5

    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(false);
    expect(trace.col).toBe(3);
  });

  test('below-line unit finds the bearish point in either direction', () => {
    const trace = createTrace();
    trace.setInitialPosition(3);

    expect(trace.moveToNextCompareValue('left', 'lower')).toBe(true);
    expect(trace.col).toBe(1);
    expect(trace.moveToNextCompareValue('left', 'lower')).toBe(false);
  });

  test('on-line filter jumps between points exactly on the reference line', () => {
    const trace = createTrace();
    enter(trace); // col 0

    expect(trace.moveToRotorFilter('onLine', 'right')).toBe(true);
    expect(trace.col).toBe(2); // 2026-01-03 close is exactly on the line
    expect(trace.moveToRotorFilter('onLine', 'right')).toBe(false);
    expect(trace.col).toBe(2);
  });

  test('vertical compare navigation is out of bounds', () => {
    const trace = createTrace();
    enter(trace);

    expect(trace.moveToNextCompareValue('up', 'higher')).toBe(false);
    expect(trace.moveToNextCompareValue('down', 'lower')).toBe(false);
  });
});
