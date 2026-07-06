import type { NotificationService } from '@service/notification';
import type { MaidrLayer } from '@type/grammar';
import type { PlotState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * Regression coverage for the "arrow navigation is silent to screen readers"
 * bug. TextService only announces terse/verbose navigation text through the
 * revision-keyed role="alert" region when Redux `text.announce` is true. That
 * flag starts false (the initial instruction is shown without announcing) and
 * is flipped to true by the `first_navigation` event.
 *
 * The event used to fire ONLY for figure-type states, so single-subplot plots
 * — which start navigation at the trace level and never emit a figure state —
 * left `announce` false forever and their navigation text was never spoken.
 * These tests lock in that the event now fires on the first navigation at any
 * level.
 */

/**
 * Builds a single-layer bar layer for trace-level navigation tests.
 * @returns A bar layer definition with three points.
 */
function createBarLayer(): MaidrLayer {
  return {
    id: 'bar-layer',
    type: TraceType.BAR,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    data: [
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
      { x: 'C', y: 3 },
    ],
  };
}

/**
 * Minimal NotificationService stub whose notify is a jest mock.
 * @returns A NotificationService-shaped object sufficient for these tests.
 */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
}

/**
 * Produces a real, non-empty trace state for a single-layer bar plot, as a
 * trace emits when the user navigates to a data point.
 * @returns A non-empty trace-type PlotState.
 */
function createTraceState(): TraceState {
  const trace = new BarTrace(createBarLayer());
  const state = trace.getStateAt(0, 1);
  expect(state.empty).toBe(false);
  return state;
}

describe('textService first-navigation announcement gate', () => {
  test('fires first_navigation on the first trace-level navigation', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    text.update(createTraceState());

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'first_navigation' });
  });

  test('still emits the formatted navigation text on that first update', () => {
    const text = new TextService(createMockNotificationService());
    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(createTraceState());

    expect(changeListener).toHaveBeenCalledTimes(1);
    const arg = changeListener.mock.calls[0][0] as { value: string };
    expect(typeof arg.value).toBe('string');
    expect(arg.value.length).toBeGreaterThan(0);
  });

  test('fires first_navigation only once across repeated navigation', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    text.update(createTraceState());
    text.update(createTraceState());
    text.update(createTraceState());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('does not fire first_navigation for an out-of-bounds empty trace state', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    // Pure out-of-bounds events are empty trace states with no `warning`.
    const emptyState: TraceState = {
      empty: true,
      type: 'trace',
      traceType: TraceType.BAR,
      audio: { y: 0, x: 0, rows: 0, cols: 0 },
    };
    text.update(emptyState);

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not fire first_navigation for a warning empty trace state', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    // Warning empties bypass the top-of-method out-of-bounds early return, so
    // the `!state.empty` guard is what keeps them from un-gating announcements.
    const warningState: TraceState = {
      empty: true,
      type: 'trace',
      traceType: TraceType.BAR,
      audio: { y: 0, x: 0, rows: 0, cols: 0 },
      warning: true,
    };
    text.update(warningState);

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not fire first_navigation while text mode is off', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    // VERBOSE -> TERSE -> OFF. Navigating while off must not un-gate; the flag
    // stays armed for when the user turns text back on and navigates.
    text.toggle();
    text.toggle();
    expect(text.isOff()).toBe(true);

    text.update(createTraceState());

    expect(listener).not.toHaveBeenCalled();
  });

  test('still fires first_navigation for a figure-type first navigation', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    // Multi-panel plots start at figure level; removing the old figure-only
    // block must not regress their first-navigation announcement.
    const figureState = {
      empty: false,
      type: 'figure',
      title: '',
      subtitle: '',
      caption: '',
      size: 2,
      index: 1,
      traceTypes: ['bar'],
    } as unknown as PlotState;
    text.update(figureState);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'first_navigation' });
  });
});
