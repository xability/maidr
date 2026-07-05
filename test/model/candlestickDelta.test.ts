import type { CandlestickDeltaPoint } from '@model/candlestickDelta';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import {
  ABOVE_LINE_MODE,
  BELOW_LINE_MODE,
  CandlestickDeltaTrace,
  DELTA_POINT_MODE,
  deltaTrend,
  roundDelta,
} from '@model/candlestickDelta';
import { TraceType } from '@type/grammar';

/**
 * Builds a delta point with the trend derived from the delta sign.
 * @param x - The shared x value
 * @param fieldValue - The OHLC value at x
 * @param reference - The reference line value at x
 * @returns A delta point
 */
function point(x: string, fieldValue: number, reference: number): CandlestickDeltaPoint {
  const delta = roundDelta(fieldValue - reference);
  return { x, fieldValue, reference, delta, trend: deltaTrend(delta) };
}

/**
 * Creates a synthetic layer definition for the virtual delta trace.
 * @returns A candlestick-delta layer definition
 */
function createLayer(): MaidrLayer {
  return {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK_DELTA,
    title: 'close price vs MA 3',
    axes: { x: { label: 'Date' }, y: { label: 'Price delta' } },
    data: [],
  };
}

/**
 * Creates a delta trace with deltas +2, -1.5, 0, +0.5 over four dates.
 * @returns The trace under test
 */
function createTrace(): CandlestickDeltaTrace {
  return new CandlestickDeltaTrace(createLayer(), {
    points: [
      point('2026-01-01', 12, 10), // +2 (above)
      point('2026-01-02', 8.5, 10), // -1.5 (below)
      point('2026-01-03', 10, 10), // 0 (on line)
      point('2026-01-04', 10.5, 10), // +0.5 (above)
    ],
    field: 'close',
    referenceLabel: 'Moving Average 3 days',
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
    // A ~2e-3 residual on a ~1.6e9 instrument is averaging noise: on line.
    // The old fixed 1e-9 grid both overflowed here and reported it as nonzero.
    expect(roundDelta(2e-3, 1.6e9)).toBe(0);
    // The same residual on a ~10 instrument is a real, meaningful delta.
    expect(roundDelta(2e-3, 10)).toBe(0.002);
    // A genuinely large delta on a large instrument survives (no overflow).
    expect(roundDelta(1500, 1.6e9)).toBe(1500);
  });

  test('preserves precision at large magnitude instead of overflowing', () => {
    // Math.round(1.6e9 * 1e9) overflows MAX_SAFE_INTEGER and returns garbage;
    // the magnitude-aware version returns the delta faithfully.
    expect(roundDelta(12.5, 1.6e9)).toBe(12.5);
  });

  test('maps delta sign to bull, bear, and neutral trends', () => {
    expect(deltaTrend(0.01)).toBe('Bull');
    expect(deltaTrend(-0.01)).toBe('Bear');
    expect(deltaTrend(0)).toBe('Neutral');
  });
});

describe('candlestickDelta navigation', () => {
  test('moves left and right through the delta points', () => {
    const trace = createTrace();
    enter(trace);
    expect(trace.col).toBe(0);

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.col).toBe(1);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect(trace.col).toBe(0);
  });

  test('reports out of bounds for vertical movement (single-row layer)', () => {
    const trace = createTrace();
    enter(trace);

    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
  });

  test('setInitialPosition places the cursor without entering initial entry', () => {
    const trace = createTrace();
    trace.setInitialPosition(2);

    expect(trace.isInitialEntry).toBe(false);
    expect(trace.col).toBe(2);
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

describe('candlestickDelta state', () => {
  test('text describes direction and magnitude', () => {
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

  test('audio encodes |delta| as pitch, trend as timbre, and opts into the zero click', () => {
    const trace = createTrace();
    trace.setInitialPosition(1);
    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.audio.freq.raw).toBe(1.5);
      expect(state.audio.freq.min).toBe(0);
      expect(state.audio.freq.max).toBe(2);
      expect(state.audio.trend).toBe('Bear');
      expect(state.audio.zeroClick).toBe(true);
      expect(state.audio.panning).toEqual({ x: 1, y: 0, rows: 1, cols: 4 });
    }
  });

  test('braille exposes |delta| heights with bearish markers for below-line points', () => {
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
    }
  });

  test('braille returns stable array references across navigation', () => {
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

  test('autoplay spans the point count in horizontal directions', () => {
    const trace = createTrace();
    enter(trace);
    const state = trace.state;

    expect(!state.empty && state.autoplay.FORWARD).toBe(4);
    expect(!state.empty && state.autoplay.BACKWARD).toBe(4);
  });

  test('never highlights (virtual layer)', () => {
    const trace = createTrace();
    enter(trace);
    const state = trace.state;

    expect(!state.empty && state.highlight.empty).toBe(true);
  });

  test('description summarizes reference, counts, and data table', () => {
    const trace = createTrace();
    const description = trace.description;

    expect(description.chartType).toBe('Candlestick Reference Delta');
    expect(description.stats).toContainEqual({
      label: 'Reference line',
      value: 'Moving Average 3 days',
    });
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
  test('exposes max and min signed delta targets', () => {
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

  test('above-line unit skips to the next point above the reference', () => {
    const trace = createTrace();
    enter(trace); // col 0 (+2)

    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
    expect(trace.col).toBe(3); // skips -1.5 and 0

    // No further above-line point to the right.
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

  test('vertical compare navigation is out of bounds', () => {
    const trace = createTrace();
    enter(trace);

    expect(trace.moveToNextCompareValue('up', 'higher')).toBe(false);
    expect(trace.moveToNextCompareValue('down', 'lower')).toBe(false);
  });
});
