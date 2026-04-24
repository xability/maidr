import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { RotorNavigationService } from '@service/rotor';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';

/**
 * Build a minimal multiline layer suitable for a LineTrace unit test.
 * @param data Multiline data points for the trace
 * @returns Line layer definition
 */
function createLineLayer(data: MaidrLayer['data']): MaidrLayer {
  return {
    id: 'rotor-test-line-layer',
    type: TraceType.LINE,
    title: 'Rotor test layer',
    axes: { x: 'X', y: 'Y' },
    data,
  };
}

/**
 * Create a trace whose row 0 has point intersections with the other two lines
 * at col 1 and col 3. Used to exercise rotor intersection dispatch.
 * @returns LineTrace with a known intersection layout
 */
function createTraceWithIntersections(): LineTrace {
  return new LineTrace(createLineLayer([
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ],
    [
      { x: 0, y: 2 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 3, y: 3 },
    ],
  ]));
}

/**
 * Minimal Context stub exposing only what RotorNavigationService touches.
 * @param active The active plot/trace returned by context.active
 * @returns A Context-shaped object sufficient for these tests
 */
function createMockContext(active: unknown): Context {
  return {
    active,
    setRotorEnabled: jest.fn(),
  } as unknown as Context;
}

/**
 * Minimal TextService stub exposing isOff/isTerse.
 * @param options Toggle flags to control message formatting
 * @param options.off When true, isOff() returns true (suppresses messages)
 * @param options.terse When true, isTerse() returns true (short phrasing)
 * @returns A TextService-shaped object sufficient for these tests
 */
function createMockTextService(options: { off?: boolean; terse?: boolean } = {}): TextService {
  return {
    isOff: () => options.off ?? false,
    isTerse: () => options.terse ?? false,
  } as unknown as TextService;
}

/**
 * Advance the rotor until getMode() returns the target mode name.
 * @param service The rotor service to cycle
 * @param target Expected mode name
 * @param max Safety cap on iteration count
 */
function cycleTo(service: RotorNavigationService, target: string, max = 10): void {
  for (let i = 0; i < max; i++) {
    if (service.getMode() === target) {
      return;
    }
    service.moveToNextRotorUnit();
  }
  throw new Error(`Rotor did not reach mode "${target}"`);
}

describe('RotorNavigationService intersection dispatch', () => {
  test('moveRight in intersection mode advances to next point intersection', () => {
    const trace = createTraceWithIntersections();
    trace.col = 0;
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
    );

    cycleTo(service, Constant.INTERSECTION_MODE);

    expect(service.moveRight()).toBeNull();
    expect(trace.col).toBe(1);
  });

  test('moveLeft in intersection mode retreats to previous point intersection', () => {
    const trace = createTraceWithIntersections();
    trace.col = 3;
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
    );

    cycleTo(service, Constant.INTERSECTION_MODE);

    expect(service.moveLeft()).toBeNull();
    expect(trace.col).toBe(1);
  });

  test('moveRight at the last intersection returns a bound message', () => {
    const trace = createTraceWithIntersections();
    trace.col = 3;
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    const result = service.moveRight();

    expect(result).not.toBeNull();
    expect(result).toMatch(/No intersection/i);
    expect(result).toMatch(/right/i);
    expect(trace.col).toBe(3);
  });

  test('moveUp in intersection mode returns the vertical-unavailable message', () => {
    const trace = createTraceWithIntersections();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    const result = service.moveUp();

    expect(result).not.toBeNull();
    expect(result).toMatch(/intersection (?:point )?mode/i);
  });

  test('moveDown in intersection mode returns the vertical-unavailable message', () => {
    const trace = createTraceWithIntersections();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    const result = service.moveDown();

    expect(result).not.toBeNull();
    expect(result).toMatch(/intersection (?:point )?mode/i);
  });

  test('terse text mode yields terse bound phrasing', () => {
    const trace = createTraceWithIntersections();
    trace.col = 3;
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService({ terse: true }),
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    expect(service.moveRight()).toBe('No intersection to the right');
  });

  test('text-off mode suppresses messages', () => {
    const trace = createTraceWithIntersections();
    trace.col = 3;
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService({ off: true }),
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    expect(service.moveRight()).toBe('');
  });
});
