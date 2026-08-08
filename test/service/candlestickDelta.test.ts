import type { Trace } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { CandlestickPoint, LinePoint, Maidr } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import {
  ABOVE_LINE_MODE,
  BELOW_LINE_MODE,
  CandlestickDeltaTrace,
  DELTA_POINT_MODE,
  ON_LINE_MODE,
} from '@model/candlestickDelta';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { CandlestickDeltaService } from '@service/candlestickDelta';
import { NotificationService } from '@service/notification';
import { RotorNavigationService } from '@service/rotor';
import { TextService } from '@service/text';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

jest.mock('hotkeys-js', () => ({
  __esModule: true,
  default: { setScope: jest.fn() },
}));

/**
 * Builds a candle whose close price is the given value.
 * @param value - The date string
 * @param close - The close price
 * @returns A candlestick point
 */
function candle(value: string, close: number): CandlestickPoint {
  return {
    value,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100,
    trend: 'Bull',
    volatility: 4,
  };
}

/**
 * Creates a single-subplot Maidr config with a candlestick layer and a line
 * layer holding two moving-average series. The averages intentionally start
 * one day later than the candles, like real moving averages do.
 * @returns A Maidr config
 */
function createMaidr(): Maidr {
  const candles: CandlestickPoint[] = [
    candle('2026-01-01', 10),
    candle('2026-01-02', 12),
    candle('2026-01-03', 9),
    candle('2026-01-04', 11),
  ];
  const ma3: LinePoint[] = [
    { x: '2026-01-02', y: 11, z: 'Moving Average 3 days' },
    { x: '2026-01-03', y: 10, z: 'Moving Average 3 days' },
    { x: '2026-01-04', y: 11, z: 'Moving Average 3 days' },
  ];
  const ma6: LinePoint[] = [
    { x: '2026-01-02', y: 12, z: 'Moving Average 6 days' },
    { x: '2026-01-03', y: 11, z: 'Moving Average 6 days' },
    { x: '2026-01-04', y: 10, z: 'Moving Average 6 days' },
  ];
  return {
    id: 'delta-test',
    subplots: [[
      {
        layers: [
          {
            id: 'candle-layer',
            type: TraceType.CANDLESTICK,
            axes: { x: { label: 'Date' }, y: { label: 'Price' } },
            data: candles,
          },
          {
            id: 'ma-layer',
            type: TraceType.LINE,
            axes: { x: { label: 'Date' }, y: { label: 'Price' } },
            data: [ma3, ma6],
          },
        ],
      },
    ]],
  };
}

interface Harness {
  context: Context;
  service: CandlestickDeltaService;
  rotor: RotorNavigationService;
  notify: jest.Mock;
  toggleFocus: jest.Mock;
}

/**
 * Builds a context over the candlestick+MA fixture with the delta service
 * wired against stubbed display focus handling.
 * @returns The test harness
 */
function createHarness(): Harness {
  const context = new Context(new Figure(createMaidr()));
  const notification = new NotificationService();
  const notify = jest.fn();
  notification.onChange(event => notify(event.value));
  const text = new TextService(notification);
  const rotor = new RotorNavigationService(context, text, notification);
  const toggleFocus = jest.fn();
  const display = { toggleFocus } as unknown as DisplayService;
  const service = new CandlestickDeltaService(context, notification, display, rotor);
  // The moving averages start one day after the candles (2026-01-01 is
  // uncovered), and the delta layer only activates where the current candle
  // has a delta. Park the candlestick on the first covered candle so the
  // activation tests exercise the success path; the refusal tests move back to
  // 2026-01-01 explicitly.
  (context.active as Trace).moveToXValue('2026-01-02');
  return { context, service, rotor, notify, toggleFocus };
}

describe('candlestickDeltaService references', () => {
  test('lists every series of every line layer in the subplot', () => {
    const { service } = createHarness();

    expect(service.getReferences()).toEqual([
      { id: 'ma-layer:0', label: 'Moving Average 3 days' },
      { id: 'ma-layer:1', label: 'Moving Average 6 days' },
    ]);
  });

  test('is unavailable when the active trace is not a candlestick', () => {
    const { context, service } = createHarness();
    context.stepTrace('UPWARD'); // switch to the line layer

    expect(service.getReferences()).toBeNull();
  });
});

describe('candlestickDeltaService activation', () => {
  test('activates a virtual delta layer matched by x value', () => {
    const { context, service, notify, toggleFocus } = createHarness();

    expect(service.activate('ma-layer:0')).toBe(true);

    const active = context.active;
    expect(active).toBeInstanceOf(CandlestickDeltaTrace);
    const trace = active as CandlestickDeltaTrace;
    // 2026-01-01 has no MA value and must be skipped.
    expect(trace.size).toBe(3);
    expect(trace.getAvailableXValues()).toEqual([
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(toggleFocus).toHaveBeenCalledWith(Scope.CANDLESTICK_DELTA);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('OHLC price minus Moving Average 3 days'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Escape'));
    expect(service.isActive).toBe(true);
    expect(service.selectedReference).toBe('ma-layer:0');
  });

  test('activate with no argument uses the remembered reference', () => {
    const { context, service } = createHarness();
    service.setSelectedReference('ma-layer:1');

    expect(service.activate()).toBe(true);
    expect((context.active as CandlestickDeltaTrace).reference).toBe('Moving Average 6 days');
  });

  test('activate with no reference chosen is a no-op', () => {
    const { service } = createHarness();
    expect(service.activate()).toBe(false);
    expect(service.isActive).toBe(false);
  });

  test('a failed activation leaves the remembered reference untouched', () => {
    const { service } = createHarness();
    service.activate('ma-layer:0');
    expect(service.selectedReference).toBe('ma-layer:0');

    // An unresolvable reference must not clobber the working selection.
    expect(service.activate('ma-layer:9')).toBe(false);
    expect(service.selectedReference).toBe('ma-layer:0');
  });

  test('refuses and alerts when the current candle has no reference value', () => {
    const { context, service, notify, toggleFocus } = createHarness();
    // 2026-01-01 is before the moving average starts — no delta there.
    (context.active as Trace).moveToXValue('2026-01-01');

    expect(service.activate('ma-layer:0')).toBe(false);
    expect(service.isActive).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('does not reach this candle'),
    );
    // The virtual layer must not have been swapped in.
    expect(context.active.constructor.name).toBe('Candlestick');
    expect(toggleFocus).not.toHaveBeenCalledWith(Scope.CANDLESTICK_DELTA);
    // The reference is still remembered so a later Alt L can use it.
    expect(service.selectedReference).toBe('ma-layer:0');
  });

  test('activates from a covered candle after a refusal on an uncovered one', () => {
    const { context, service } = createHarness();
    (context.active as Trace).moveToXValue('2026-01-01');
    expect(service.activate('ma-layer:0')).toBe(false);

    // Move onto a covered candle and toggle on via the remembered reference.
    (context.active as Trace).moveToXValue('2026-01-03');
    expect(service.activate()).toBe(true);
    expect(service.isActive).toBe(true);
    expect((context.active as CandlestickDeltaTrace).getCurrentXValue()).toBe('2026-01-03');
  });

  test('starts on the candle the user was on when it exists in the delta domain', () => {
    const { context, service } = createHarness();
    (context.active as Trace).moveToXValue('2026-01-03');

    service.activate('ma-layer:0');

    expect((context.active as CandlestickDeltaTrace).getCurrentXValue()).toBe('2026-01-03');
  });

  test('computes signed deltas including exact zeros on the close field', () => {
    const { context, service } = createHarness();
    service.activate('ma-layer:0');
    const trace = context.active as CandlestickDeltaTrace;

    // close - MA3: 12-11=+1 (above), 9-10=-1 (below), 11-11=0 (on line)
    trace.moveToXValue('2026-01-02');
    let state = trace.state;
    expect(!state.empty && state.audio.freq.raw).toBe(1);
    expect(!state.empty && state.audio.glide).toBe('up');

    trace.moveToXValue('2026-01-03');
    state = trace.state;
    expect(!state.empty && state.audio.glide).toBe('down');

    trace.moveToXValue('2026-01-04');
    state = trace.state;
    expect(!state.empty && state.audio.freq.raw).toBe(0);
    expect(!state.empty && state.audio.zeroClick).toBe(true);
  });

  test('reconfiguring while active replaces the layer and keeps the anchor', () => {
    const { context, service } = createHarness();
    service.activate('ma-layer:0');
    const firstTrace = context.active;

    expect(service.activate('ma-layer:1')).toBe(true);
    expect(context.active).not.toBe(firstTrace);
    expect((context.active as CandlestickDeltaTrace).reference).toBe('Moving Average 6 days');

    // Deactivation must still restore the original candlestick anchor.
    service.deactivate();
    expect(context.active.constructor.name).toBe('Candlestick');
  });

  test('reconfiguring to a reference that misses the current candle keeps the current comparison', () => {
    // A third moving average that only covers the last two candles.
    const maidr = createMaidr();
    const lineLayer = maidr.subplots[0][0].layers[1];
    (lineLayer.data as LinePoint[][]).push([
      { x: '2026-01-03', y: 10, z: 'Moving Average 9 days' },
      { x: '2026-01-04', y: 11, z: 'Moving Average 9 days' },
    ]);
    const context = new Context(new Figure(maidr));
    const notification = new NotificationService();
    const notify = jest.fn();
    notification.onChange(event => notify(event.value));
    const text = new TextService(notification);
    const rotor = new RotorNavigationService(context, text, notification);
    const service = new CandlestickDeltaService(
      context,
      notification,
      { toggleFocus: jest.fn() } as unknown as DisplayService,
      rotor,
    );

    // On 2026-01-02, activate MA3 (which covers it).
    (context.active as Trace).moveToXValue('2026-01-02');
    expect(service.activate('ma-layer:0')).toBe(true);
    expect((context.active as CandlestickDeltaTrace).getCurrentXValue()).toBe('2026-01-02');
    notify.mockClear();

    // Reconfigure to MA9 (ma-layer:2), which does NOT reach 2026-01-02.
    expect(service.activate('ma-layer:2')).toBe(false);

    // The old MA3 comparison stays active on the same candle; the remembered
    // reference is unchanged.
    expect(service.isActive).toBe(true);
    expect((context.active as CandlestickDeltaTrace).reference).toBe('Moving Average 3 days');
    expect((context.active as CandlestickDeltaTrace).getCurrentXValue()).toBe('2026-01-02');
    expect(service.selectedReference).toBe('ma-layer:0');
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Keeping the current comparison'),
    );
  });

  test('reconfiguring preserves the current delta-layer x, not the pre-activation candle', () => {
    const { context, service } = createHarness();
    service.activate('ma-layer:0');
    (context.active as CandlestickDeltaTrace).moveToXValue('2026-01-04');

    service.activate('ma-layer:1');

    expect((context.active as CandlestickDeltaTrace).getCurrentXValue()).toBe('2026-01-04');
  });

  test('refuses to activate when no x values match', () => {
    const maidr = createMaidr();
    const lineLayer = maidr.subplots[0][0].layers[1];
    lineLayer.data = [[{ x: '1999-01-01', y: 1, z: 'MA' }]];
    const context = new Context(new Figure(maidr));
    const notification = new NotificationService();
    const notify = jest.fn();
    notification.onChange(event => notify(event.value));
    const text = new TextService(notification);
    const rotor = new RotorNavigationService(context, text, notification);
    const display = { toggleFocus: jest.fn() } as unknown as DisplayService;
    const service = new CandlestickDeltaService(context, notification, display, rotor);

    expect(service.activate('ma-layer:0')).toBe(false);
    expect(service.isActive).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('No matching x values'));
  });
});

describe('candlestickDeltaService deactivation', () => {
  test('restores the candlestick layer and syncs its position to the delta x', () => {
    const { context, service, toggleFocus } = createHarness();
    service.activate('ma-layer:0');
    (context.active as CandlestickDeltaTrace).moveToXValue('2026-01-03');
    toggleFocus.mockClear();

    expect(service.deactivate()).toBe(true);

    expect(context.active.constructor.name).toBe('Candlestick');
    expect((context.active as Trace).getCurrentXValue()).toBe('2026-01-03');
    expect(toggleFocus).toHaveBeenCalledWith(Scope.CANDLESTICK_DELTA);
    expect(service.isActive).toBe(false);
  });

  test('keeps the remembered reference after deactivation for re-toggling', () => {
    const { service } = createHarness();
    service.activate('ma-layer:0');
    service.deactivate();

    expect(service.selectedReference).toBe('ma-layer:0');
    // A bare activate() re-enables the same comparison.
    expect(service.activate()).toBe(true);
  });

  test('deactivate is a no-op when nothing is active', () => {
    const { service } = createHarness();
    expect(service.deactivate()).toBe(false);
  });

  test('deactivateIfActive silently restores the anchor before layer switching', () => {
    const { context, service, notify } = createHarness();
    service.activate('ma-layer:0');
    notify.mockClear();

    service.deactivateIfActive();

    expect(context.active.constructor.name).toBe('Candlestick');
    expect(notify).not.toHaveBeenCalled();
  });

  test('discardActiveLayer tears down state and resets the rotor without touching focus or the stack', () => {
    const { context, service, rotor, toggleFocus, notify } = createHarness();
    service.activate('ma-layer:0');
    const deltaTrace = context.active;
    rotor.moveToNextRotorUnit(); // leave data mode
    expect(context.isRotorEnabled()).toBe(true);
    toggleFocus.mockClear();
    notify.mockClear();

    service.discardActiveLayer();

    expect(service.isActive).toBe(false);
    expect(context.isRotorEnabled()).toBe(false);
    expect(rotor.getCurrentUnit()).toBe(0);
    expect(context.active).toBe(deltaTrace);
    expect(toggleFocus).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  test('discardActiveLayer is a no-op when nothing is active', () => {
    const { service } = createHarness();
    expect(() => service.discardActiveLayer()).not.toThrow();
  });
});

describe('candlestickDelta rotor integration', () => {
  test('cycles delta point, below line, above line, and on line units', () => {
    const { service, rotor } = createHarness();
    service.activate('ma-layer:0');

    expect(rotor.getMode()).toBe(DELTA_POINT_MODE);
    expect(rotor.moveToNextRotorUnit()).toBe(BELOW_LINE_MODE);
    expect(rotor.getCompareType()).toBe('lower');
    expect(rotor.moveToNextRotorUnit()).toBe(ABOVE_LINE_MODE);
    expect(rotor.getCompareType()).toBe('higher');
    expect(rotor.moveToNextRotorUnit()).toBe(ON_LINE_MODE);
    expect(rotor.moveToNextRotorUnit()).toBe(DELTA_POINT_MODE);
  });

  test('right arrow in above-line mode jumps to the next above-line point', () => {
    const { context, service, rotor } = createHarness();
    service.activate('ma-layer:0');
    const trace = context.active as CandlestickDeltaTrace;
    trace.setInitialPosition(0); // 2026-01-02, close delta +1

    rotor.moveToNextRotorUnit(); // below line
    rotor.moveToNextRotorUnit(); // above line

    // Only point 0 is above the line on close, so moving right hits a boundary.
    const message = rotor.moveRight();
    expect(message).toContain('point above the line');
    expect(trace.getCurrentXValue()).toBe('2026-01-02');

    // From the right edge, moving left in below-line mode lands on -1.
    trace.setInitialPosition(2);
    rotor.resetToDataMode();
    rotor.moveToNextRotorUnit(); // below line
    expect(rotor.moveLeft()).toBeNull();
    expect(trace.getCurrentXValue()).toBe('2026-01-03');
  });

  test('up/down in above-line mode switches OHLC fields, not candles', () => {
    const { context, service, rotor } = createHarness();
    service.activate('ma-layer:0');
    const trace = context.active as CandlestickDeltaTrace;
    trace.setInitialPosition(0); // 2026-01-02, close (sorted: low, open, close, high)
    expect(trace.comparedField).toBe('close');

    rotor.moveToNextRotorUnit(); // below line
    rotor.moveToNextRotorUnit(); // above line
    expect(rotor.getMode()).toBe(ABOVE_LINE_MODE);

    // Up must move to the field above close (high) on the SAME candle, not fall
    // through to a right/candle jump (the pre-fix behaviour).
    rotor.moveUp();
    expect(trace.getCurrentXValue()).toBe('2026-01-02');
    expect(trace.comparedField).toBe('high');

    // Down returns to close, still on the same candle.
    rotor.moveDown();
    expect(trace.getCurrentXValue()).toBe('2026-01-02');
    expect(trace.comparedField).toBe('close');
  });

  test('activation and deactivation reset the rotor to the data unit', () => {
    const { context, service, rotor } = createHarness();
    service.activate('ma-layer:0');
    rotor.moveToNextRotorUnit(); // below line
    expect(context.isRotorEnabled()).toBe(true);

    service.deactivate();

    expect(context.isRotorEnabled()).toBe(false);
    expect(rotor.getCurrentUnit()).toBe(0);
  });
});
