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

/**
 * Builds the pure out-of-bounds trace state that AbstractTrace.notifyOutOfBounds()
 * pushes when arrow navigation hits an edge (far left/right/top/bottom): an empty
 * trace state with no `warning` field.
 * @returns An out-of-bounds trace-type PlotState.
 */
function createOutOfBoundsState(): TraceState {
  return {
    empty: true,
    type: 'trace',
    traceType: TraceType.BAR,
    audio: { y: 0, x: 0, rows: 0, cols: 0 },
  };
}

/**
 * Builds the warning/rotor-bounds trace state that AbstractTrace.notifyRotorBounds()
 * pushes at a rotor/section boundary: an empty trace state WITH `warning: true`.
 * Distinct from a pure out-of-bounds edge event, and deliberately excluded from
 * the edge-alert branch's terse/verbose wording split.
 * @returns A warning trace-type PlotState.
 */
function createWarningState(): TraceState {
  return {
    empty: true,
    type: 'trace',
    traceType: TraceType.BAR,
    audio: { y: 0, x: 0, rows: 0, cols: 0 },
    warning: true,
  };
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
    text.update(createOutOfBoundsState());

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not fire first_navigation for a warning empty trace state', () => {
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);

    // Warning empties bypass the top-of-method out-of-bounds early return, so
    // the `!state.empty` guard is what keeps them from un-gating announcements.
    text.update(createWarningState());

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

  test('flips the gate on the first key press even in a boundary direction', () => {
    // Refutes the "first interaction is out-of-bounds -> silent" concern: the
    // model's initial-entry guard (MovableGrid/MovableGraph/LineTrace moveOnce)
    // makes the FIRST move succeed with a non-empty state regardless of
    // direction, so first_navigation fires and announcements un-gate. A genuine
    // boundary (empty) event can therefore only occur after >=1 successful move,
    // by which point `announce` is already true.
    const trace = new BarTrace(createBarLayer()); // single row of bars
    const text = new TextService(createMockNotificationService());
    const listener = jest.fn();
    text.onNavigation(listener);
    trace.addObserver(text);

    // UPWARD is a boundary direction for a single-row bar plot, yet the very
    // first press lands on a valid point via handleInitialEntry (non-empty).
    trace.moveOnce('UPWARD');

    expect(listener).toHaveBeenCalledWith({ type: 'first_navigation' });
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

/**
 * Regression coverage for the "no text alert at plot edges" bug. A guard added
 * in #557 turned the out-of-bounds branch of TextService.update() into a bare
 * `return`, silently swallowing the boundary alert. These tests lock in that
 * the alert is emitted again with mode-appropriate wording (verbose: "No plot
 * info to display"; terse: "No info"; off: silent) while `currentState` (used
 * by the AI chat) is still preserved.
 */
describe('textService out-of-bounds edge alert', () => {
  test('emits "No plot info to display" on out-of-bounds in verbose mode', () => {
    const text = new TextService(createMockNotificationService());
    expect(text.isVerbose()).toBe(true); // default mode

    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(createOutOfBoundsState());

    expect(changeListener).toHaveBeenCalledTimes(1);
    expect(changeListener).toHaveBeenCalledWith({ value: 'No plot info to display' });
  });

  test('emits the terser "No info" on out-of-bounds in terse mode', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    expect(text.isTerse()).toBe(true);

    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(createOutOfBoundsState());

    // Terse gets its own shorter wording, distinct from verbose.
    expect(changeListener).toHaveBeenCalledTimes(1);
    expect(changeListener).toHaveBeenCalledWith({ value: 'No info' });
  });

  test('keeps the warning/rotor-bounds wording mode-independent in terse mode', () => {
    // The terse "No info" split is scoped to the pure out-of-bounds edge path.
    // Warning states (rotor/section bounds) are excluded by `!state.warning` and
    // flow through format() unchanged, so they must NOT become "No info" in
    // terse mode — that feature is out of this fix's scope.
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    expect(text.isTerse()).toBe(true);

    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(createWarningState());

    expect(changeListener).toHaveBeenCalledWith({ value: 'No plot info to display' });
  });

  test('stays silent on out-of-bounds while text mode is off', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    text.toggle(); // TERSE -> OFF
    expect(text.isOff()).toBe(true);

    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(createOutOfBoundsState());

    expect(changeListener).not.toHaveBeenCalled();
  });

  test('re-emits the boundary alert on repeated edge presses', () => {
    const text = new TextService(createMockNotificationService());
    const changeListener = jest.fn();
    text.onChange(changeListener);

    // Holding a direction key against an edge fires the out-of-bounds state
    // repeatedly; each must re-emit so the alert region re-announces.
    text.update(createOutOfBoundsState());
    text.update(createOutOfBoundsState());

    expect(changeListener).toHaveBeenCalledTimes(2);
    expect(changeListener).toHaveBeenNthCalledWith(1, { value: 'No plot info to display' });
    expect(changeListener).toHaveBeenNthCalledWith(2, { value: 'No plot info to display' });
  });

  test('preserves the last valid currentState (AI chat position) on out-of-bounds', () => {
    const text = new TextService(createMockNotificationService());

    // Navigate to a real point, then hit an edge.
    text.update(createTraceState());
    const coordinateAtPoint = text.getCoordinateText();
    expect(coordinateAtPoint).not.toBeNull();

    text.update(createOutOfBoundsState());

    // The out-of-bounds event must NOT overwrite currentState, so the AI chat
    // still reports the user's last valid coordinate rather than null.
    expect(text.getCoordinateText()).toBe(coordinateAtPoint);
  });
});
