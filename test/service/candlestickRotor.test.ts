import type { Context } from '@model/context';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import {
  BEARISH_POINT_MODE,
  BULLISH_POINT_MODE,
  Candlestick,
  NEUTRAL_POINT_MODE,
} from '@model/candlestick';
import { RotorNavigationService } from '@service/rotor';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';

/**
 * Builds a candle; the constructor derives the trend from open/close.
 * @param value - The x label
 * @param open - Opening price
 * @param close - Closing price
 * @returns A candlestick point
 */
function candle(value: string, open: number, close: number): CandlestickPoint {
  const high = Math.max(open, close) + 1;
  const low = Math.min(open, close) - 1;
  return { value, open, high, low, close, volume: 100, trend: 'Bull', volatility: high - low };
}

/**
 * Creates a candlestick trace: Bull, Bear, Neutral, Bull, Bear.
 * @returns The trace under test
 */
function createTrace(): Candlestick {
  const data: CandlestickPoint[] = [
    candle('2026-01-01', 10, 14),
    candle('2026-01-02', 14, 12),
    candle('2026-01-03', 12, 12),
    candle('2026-01-04', 12, 16),
    candle('2026-01-05', 16, 13),
  ];
  const layer: MaidrLayer = {
    id: 'candle-layer',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
  return new Candlestick(layer);
}

/**
 * Minimal Context stub exposing only what RotorNavigationService touches.
 * @param active - The active trace returned by context.active
 * @returns A Context-shaped object
 */
function createMockContext(active: unknown): Context {
  return {
    active,
    setRotorEnabled: jest.fn(),
  } as unknown as Context;
}

/**
 * Minimal TextService stub for message formatting.
 * @returns A TextService-shaped object (verbose, not off)
 */
function createMockTextService(): TextService {
  return {
    isOff: () => false,
    isTerse: () => false,
  } as unknown as TextService;
}

/**
 * Minimal NotificationService stub.
 * @returns A NotificationService-shaped object with a jest notify mock
 */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/**
 * Collect every rotor mode by cycling forward until it wraps.
 * @param service - The rotor service to cycle
 * @returns The ordered list of unique modes
 */
function collectModes(service: RotorNavigationService): string[] {
  const first = service.getMode();
  const modes = [first];
  for (let i = 0; i < 10; i++) {
    service.moveToNextRotorUnit();
    const mode = service.getMode();
    if (mode === first) {
      break;
    }
    modes.push(mode);
  }
  return modes;
}

describe('candlestick rotor service integration', () => {
  test('cycle offers data plus the three trend units and no compare units', () => {
    const service = new RotorNavigationService(
      createMockContext(createTrace()),
      createMockTextService(),
      createMockNotificationService(),
    );

    const modes = collectModes(service);
    expect(modes).toEqual([
      Constant.DATA_MODE,
      BULLISH_POINT_MODE,
      BEARISH_POINT_MODE,
      NEUTRAL_POINT_MODE,
    ]);
    expect(modes).not.toContain(Constant.LOWER_VALUE_MODE);
    expect(modes).not.toContain(Constant.HIGHER_VALUE_MODE);
  });

  test('moveRight in the bullish unit jumps the trace to the next bullish candle', () => {
    const trace = createTrace();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      createMockNotificationService(),
    );

    service.moveToNextRotorUnit(); // -> bullish unit
    expect(service.getMode()).toBe(BULLISH_POINT_MODE);

    expect(service.moveRight()).toBeNull();
    expect(trace.col).toBe(3);
  });

  test('moveRight at the last matching candle returns a boundary message and re-announces each press', () => {
    const trace = createTrace();
    const notification = createMockNotificationService();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      notification,
    );

    // Neutral unit: only candle index 2 is neutral.
    service.moveToNextRotorUnit();
    service.moveToNextRotorUnit();
    service.moveToNextRotorUnit();
    expect(service.getMode()).toBe(NEUTRAL_POINT_MODE);

    expect(service.moveRight()).toBeNull();
    expect(trace.col).toBe(2);

    const bounded = service.moveRight();
    expect(bounded).not.toBeNull();
    expect(bounded).toMatch(/neutral point/i);

    // Boundary messages route through notification.notify so the aria-live
    // alert region re-mounts and screen readers re-announce every repeat hit.
    const callsBefore = (notification.notify as jest.Mock).mock.calls.length;
    service.moveRight();
    service.moveRight();
    expect((notification.notify as jest.Mock).mock.calls.length).toBe(callsBefore + 2);
  });

  test('moveUp in a trend unit is unavailable and does not move the candle', () => {
    const trace = createTrace();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      createMockNotificationService(),
    );

    service.moveToNextRotorUnit(); // bullish unit
    const result = service.moveUp();

    expect(result).not.toBeNull();
    expect(result).toMatch(/bullish point/i);
    expect(trace.col).toBe(0);
  });
});
