import type { Context } from '@model/context';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
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

describe('RotorNavigationService compare-mode boundary re-announcement', () => {
  /**
   * Single ascending line so that, sitting on the maximum, HIGHER_VALUE_MODE
   * has no further higher value to the right — a reliable compare boundary.
   * @returns A single-line LineTrace with values [1, 2, 3]
   */
  function createAscendingLine(): LineTrace {
    return new LineTrace(createLineLayer([
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 3 },
      ],
    ]));
  }

  test('compare-mode boundary routes through notification.notify and re-announces each press', () => {
    // Regression: the intersection path already re-announces on repeat presses
    // by routing through notification.notify (the alert region is keyed by a
    // revision counter). The compare-mode boundary path historically returned
    // the message to the rotor area only, so repeated identical hits went
    // silent for screen readers. This asserts compare mode now re-announces
    // the same way.
    const trace = createAscendingLine();
    trace.col = 2; // sit on the maximum (value 3)
    const notification = createMockNotificationService();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      notification,
    );
    cycleTo(service, Constant.HIGHER_VALUE_MODE);

    const result = service.moveRight();
    expect(result).not.toBeNull();
    expect(notification.notify).toHaveBeenCalledWith(
      expect.stringMatching(/higher value/i),
    );
    expect(trace.col).toBe(2); // did not move

    // Each repeat hit must call notify so the alert region re-mounts.
    const callsBefore = (notification.notify as jest.Mock).mock.calls.length;
    service.moveRight();
    service.moveRight();
    expect((notification.notify as jest.Mock).mock.calls.length).toBe(callsBefore + 2);
  });

  test('the left/lower fallback path also re-announces the boundary', () => {
    // moveLeft in LOWER_VALUE_MODE exercises a different message branch than
    // the moveRight/higher case above: LineTrace does not override
    // moveLeftRotor, so moveLeft throws and falls back to
    // callMoveToNextCompareMethod('left'), which is the fifth wrapped site.
    const trace = createAscendingLine();
    trace.col = 0; // leftmost — no lower value further left
    const notification = createMockNotificationService();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      notification,
    );
    cycleTo(service, Constant.LOWER_VALUE_MODE);

    const result = service.moveLeft();
    expect(result).not.toBeNull();
    expect(notification.notify).toHaveBeenCalledWith(
      expect.stringMatching(/lower value/i),
    );
    expect(trace.col).toBe(0);

    const callsBefore = (notification.notify as jest.Mock).mock.calls.length;
    service.moveLeft();
    service.moveLeft();
    expect((notification.notify as jest.Mock).mock.calls.length).toBe(callsBefore + 2);
  });

  test('the inline vertical compare branch (heatmap moveUp) re-announces too', () => {
    // Heatmap overrides moveUpRotor to delegate to a compare search that can
    // return false, so its boundary flows through the INLINE moveUp branch
    // rather than the callMoveToNextCompareMethod fallback the line cases hit.
    // No selectors → no DOM needed (highlightValues stays null).
    const data: HeatmapData = { x: ['a', 'b'], y: ['p', 'q'], points: [[1, 2], [3, 4]] };
    const layer: MaidrLayer = {
      id: 'hm',
      type: TraceType.HEATMAP,
      title: 'rotor heatmap',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data,
    };
    const trace = new Heatmap(layer);
    // The model reverses rows, so trace row 0 = points row 1 = [3, 4]; sitting
    // on col 0 (value 3) there is no higher value further up its column.
    trace.row = 0;
    trace.col = 0;
    const notification = createMockNotificationService();
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService(),
      notification,
    );
    cycleTo(service, Constant.HIGHER_VALUE_MODE);

    const result = service.moveUp();
    expect(result).not.toBeNull();
    expect(notification.notify).toHaveBeenCalledWith(
      expect.stringMatching(/higher value/i),
    );

    const callsBefore = (notification.notify as jest.Mock).mock.calls.length;
    service.moveUp();
    service.moveUp();
    expect((notification.notify as jest.Mock).mock.calls.length).toBe(callsBefore + 2);
  });

  test('text-off mode still suppresses the compare boundary message', () => {
    const trace = createAscendingLine();
    trace.col = 2;
    const service = new RotorNavigationService(
      createMockContext(trace),
      createMockTextService({ off: true }),
      createMockNotificationService(),
    );
    cycleTo(service, Constant.HIGHER_VALUE_MODE);

    expect(service.moveRight()).toBe('');
  });
});
