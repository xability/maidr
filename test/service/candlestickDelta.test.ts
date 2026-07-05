import type { Trace } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { CandlestickPoint, LinePoint, Maidr } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import {
  ABOVE_LINE_MODE,
  BELOW_LINE_MODE,
  CandlestickDeltaTrace,
  DELTA_POINT_MODE,
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

    expect(service.activate('ma-layer:0', 'close')).toBe(true);

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
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('close price minus Moving Average 3 days'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Escape'));
    expect(service.isActive).toBe(true);
  });

  test('starts on the candle the user was on when it exists in the delta domain', () => {
    const { context, service } = createHarness();
    (context.active as Trace).moveToXValue('2026-01-03');

    service.activate('ma-layer:0', 'close');

    expect((context.active as CandlestickDeltaTrace).getCurrentXValue()).toBe('2026-01-03');
  });

  test('computes signed deltas including exact zeros', () => {
    const { context, service } = createHarness();
    service.activate('ma-layer:0', 'close');
    const trace = context.active as CandlestickDeltaTrace;

    // close - MA3: 12-11=+1, 9-10=-1, 11-11=0
    trace.moveToXValue('2026-01-02');
    let state = trace.state;
    expect(!state.empty && state.audio.freq.raw).toBe(1);
    expect(!state.empty && state.audio.trend).toBe('Bull');

    trace.moveToXValue('2026-01-03');
    state = trace.state;
    expect(!state.empty && state.audio.trend).toBe('Bear');

    trace.moveToXValue('2026-01-04');
    state = trace.state;
    expect(!state.empty && state.audio.freq.raw).toBe(0);
    expect(!state.empty && state.audio.trend).toBe('Neutral');
    expect(!state.empty && state.audio.zeroClick).toBe(true);
  });

  test('reconfiguring while active replaces the layer and keeps the anchor', () => {
    const { context, service } = createHarness();
    service.activate('ma-layer:0', 'close');
    const firstTrace = context.active;

    expect(service.activate('ma-layer:1', 'open')).toBe(true);
    expect(context.active).not.toBe(firstTrace);
    expect((context.active as CandlestickDeltaTrace).reference).toBe('Moving Average 6 days');

    // Deactivation must still restore the original candlestick anchor.
    service.deactivate();
    expect(context.active.constructor.name).toBe('Candlestick');
  });

  test('reconfiguring preserves the current delta-layer x, not the pre-activation candle', () => {
    const { context, service } = createHarness();
    // User was on the first candle before activating.
    service.activate('ma-layer:0', 'close');
    // Navigate deep inside the delta layer.
    (context.active as CandlestickDeltaTrace).moveToXValue('2026-01-04');

    // Reconfigure to a different reference that still covers that x.
    service.activate('ma-layer:1', 'close');

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

    expect(service.activate('ma-layer:0', 'close')).toBe(false);
    expect(service.isActive).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('No matching x values'));
  });
});

describe('candlestickDeltaService deactivation', () => {
  test('restores the candlestick layer and syncs its position to the delta x', () => {
    const { context, service, toggleFocus } = createHarness();
    service.activate('ma-layer:0', 'close');
    (context.active as CandlestickDeltaTrace).moveToXValue('2026-01-03');
    toggleFocus.mockClear();

    expect(service.deactivate()).toBe(true);

    expect(context.active.constructor.name).toBe('Candlestick');
    expect((context.active as Trace).getCurrentXValue()).toBe('2026-01-03');
    expect(toggleFocus).toHaveBeenCalledWith(Scope.CANDLESTICK_DELTA);
    expect(service.isActive).toBe(false);
  });

  test('deactivate is a no-op when nothing is active', () => {
    const { service } = createHarness();
    expect(service.deactivate()).toBe(false);
  });

  test('deactivateIfActive silently restores the anchor before layer switching', () => {
    const { context, service, notify } = createHarness();
    service.activate('ma-layer:0', 'close');
    notify.mockClear();

    service.deactivateIfActive();

    expect(context.active.constructor.name).toBe('Candlestick');
    expect(notify).not.toHaveBeenCalled();
  });

  test('discardActiveLayer tears down state and resets the rotor without touching focus or the stack', () => {
    const { context, service, rotor, toggleFocus, notify } = createHarness();
    service.activate('ma-layer:0', 'close');
    const deltaTrace = context.active;
    rotor.moveToNextRotorUnit(); // leave data mode
    expect(context.isRotorEnabled()).toBe(true);
    toggleFocus.mockClear();
    notify.mockClear();

    service.discardActiveLayer();

    // Internal state is cleared and the rotor is reset...
    expect(service.isActive).toBe(false);
    expect(context.isRotorEnabled()).toBe(false);
    expect(rotor.getCurrentUnit()).toBe(0);
    // ...but the caller owns the stack and focus, so neither is touched here.
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
  test('cycles delta point, below line, and above line units', () => {
    const { service, rotor } = createHarness();
    service.activate('ma-layer:0', 'close');

    expect(rotor.getMode()).toBe(DELTA_POINT_MODE);
    expect(rotor.moveToNextRotorUnit()).toBe(BELOW_LINE_MODE);
    expect(rotor.getCompareType()).toBe('lower');
    expect(rotor.moveToNextRotorUnit()).toBe(ABOVE_LINE_MODE);
    expect(rotor.getCompareType()).toBe('higher');
    expect(rotor.moveToNextRotorUnit()).toBe(DELTA_POINT_MODE);
  });

  test('right arrow in above-line mode jumps to the next above-line point', () => {
    const { context, service, rotor } = createHarness();
    service.activate('ma-layer:0', 'close');
    const trace = context.active as CandlestickDeltaTrace;
    trace.setInitialPosition(0); // 2026-01-02, delta +1

    rotor.moveToNextRotorUnit(); // below line
    rotor.moveToNextRotorUnit(); // above line

    // Only point 0 is above the line, so moving right reports a boundary.
    const message = rotor.moveRight();
    expect(message).toContain('point above the line');
    expect(trace.getCurrentXValue()).toBe('2026-01-02');

    // From the right edge, moving left in below-line mode lands on -1.
    trace.setInitialPosition(2);
    rotor.moveToNextRotorUnit(); // wraps to delta point
    rotor.moveToNextRotorUnit(); // below line
    expect(rotor.moveLeft()).toBeNull();
    expect(trace.getCurrentXValue()).toBe('2026-01-03');
  });

  test('activation and deactivation reset the rotor to the data unit', () => {
    const { context, service, rotor } = createHarness();
    service.activate('ma-layer:0', 'close');
    rotor.moveToNextRotorUnit(); // below line
    expect(context.isRotorEnabled()).toBe(true);

    service.deactivate();

    expect(context.isRotorEnabled()).toBe(false);
    expect(rotor.getCurrentUnit()).toBe(0);
  });
});
