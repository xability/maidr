import type { Context } from '@model/context';
import type { NotificationService } from '@service/notification';
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
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
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
 * Minimal NotificationService stub. Returns a jest mock for notify so tests
 * can verify it was called (the alert-region re-mount path depends on it).
 * @returns A NotificationService-shaped object whose notify is a jest mock
 */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
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
      createMockNotificationService(),
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
      createMockNotificationService(),
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
      createMockNotificationService(),
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
      createMockNotificationService(),
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
      createMockNotificationService(),
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
      createMockNotificationService(),
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
      createMockNotificationService(),
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    expect(service.moveRight()).toBe('');
  });

  test('intersection bound and vertical-unavailable paths route through notification.notify (SR re-announce)', () => {
    // Regression: aria-live regions only re-announce when their content
    // changes. The text alert region in Text.tsx is keyed by a revision
    // counter that increments every time TextViewModel receives a notify
    // event, so identical messages still re-mount and re-announce. The
    // rotor area is plain aria-live with no key, so messages dispatched
    // only there announce once and stay silent on repeat presses. The
    // intersection paths must therefore push the message through
    // notification.notify too — this test asserts that wiring exists.
    const trace = createTraceWithIntersections();
    trace.col = 3; // at the last point intersection
    const notification = createMockNotificationService();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      notification,
    );
    cycleTo(service, Constant.INTERSECTION_MODE);

    // Right at boundary -> bound message goes through notify.
    service.moveRight();
    expect(notification.notify).toHaveBeenCalledWith(
      expect.stringMatching(/No intersection.*right/i),
    );

    // Up in intersection mode -> vertical-unavailable goes through notify.
    service.moveUp();
    expect(notification.notify).toHaveBeenCalledWith(
      expect.stringMatching(/intersection.*mode/i),
    );

    // Repeated identical hits must each call notify, so the alert region
    // remounts each time and the SR re-announces.
    const callsBefore = (notification.notify as jest.Mock).mock.calls.length;
    service.moveUp();
    service.moveUp();
    expect((notification.notify as jest.Mock).mock.calls.length).toBe(callsBefore + 2);
  });

  test('INTERSECTION_MODE is absent from the rotor cycle for a single-line trace', () => {
    // supportsIntersectionMode() returns false when there is only one line,
    // so getAvailableModes() must exclude INTERSECTION_MODE. Cycle the rotor
    // enough times to hit every available mode at least once and assert it
    // never appears. This closes the loop on the
    // supportsIntersectionMode -> getAvailableModes wiring.
    const singleLine = new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    ]));
    const service = new RotorNavigationService(
      createMockContext(singleLine),
      createMockTextService(),
      createMockNotificationService(),
    );

    const seen = new Set<string>();
    seen.add(service.getMode());
    // Cycle more than the plausible mode count to guarantee full coverage.
    for (let i = 0; i < 10; i++) {
      service.moveToNextRotorUnit();
      seen.add(service.getMode());
    }

    expect(seen.has(Constant.INTERSECTION_MODE)).toBe(false);
  });
});
