import type { NotificationService } from '@service/notification';
import type { GanttPoint, Maidr, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How the text layer announces a span on the cross axis.
 *
 * `state.range` has always replaced the main value, so a histogram bin reads
 * "X is 5 through 10" rather than naming one edge. `crossRange` is the same
 * statement about the other axis, and until a gantt needed it nothing emitted
 * one -- the field existed but was rendered only on the grid path.
 *
 * A gantt interval is the case that requires it: what the chart draws is a
 * start and an end, and announcing either alone names one edge of a bar as
 * though it were the bar. These tests cover the rendering rather than the
 * trace, so the axis formatter -- which is what turns a schedule's numbers
 * into dates -- is exercised through the same path.
 */

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
}

/** Builds a gantt layer over the given lanes. */
function ganttLayer(points: GanttPoint[][], format?: MaidrLayer['axes']): MaidrLayer {
  return {
    id: 'schedule',
    type: TraceType.GANTT,
    title: 'Project schedule',
    axes: format ?? { x: { label: 'Task' }, y: { label: 'Day' } },
    data: { points, unit: 'days' },
  };
}

/** A figure carrying one layer, as the formatter service reads it. */
function figureOf(layer: MaidrLayer): Maidr {
  return {
    id: 'figure',
    title: 'Figure',
    subplots: [[{ layers: [layer] }]],
  } as unknown as Maidr;
}

/** The text a service emits for one trace state, in the current text mode. */
function announce(text: TextService, state: TraceState): string {
  const changeListener = jest.fn();
  const disposable = text.onChange(changeListener);

  text.update(state);
  disposable.dispose();
  const event = changeListener.mock.calls[0][0] as { value: string };
  return event.value;
}

const LANES: GanttPoint[][] = [
  [{ x: 'Design', start: 5, end: 45, label: 'Wireframes' }],
];

describe('announcing a span on the cross axis', () => {
  test('reads both ends rather than naming one of them', () => {
    const trace = new GanttTrace(ganttLayer(LANES));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 0)))
      .toBe('Task is Design, Wireframes, Day is 5 through 45, Length is 40 days');
  });

  test('sends both ends through the cross-axis formatter', () => {
    // The reason the span is two numbers in the state rather than one
    // pre-joined string: a schedule's axis is commonly a date format, and a
    // string assembled in the model would arrive here already flattened and
    // be announced as two bare day counts.
    const layer = ganttLayer(LANES, {
      x: { label: 'Task' },
      y: {
        label: 'Day',
        // Written as concatenation rather than as a template literal: this is
        // a function *body* the formatter compiles at runtime, and a `${...}`
        // inside our own source would be interpolated here instead.
        format: { function: 'return "day " + (Number(value) + 1)' },
      },
    });
    const trace = new GanttTrace(layer);
    const text = new TextService(
      createMockNotificationService(),
      new FormatterService(figureOf(layer)),
    );

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).toContain('Day is day 6 through day 46');
    expect(spoken).not.toContain('Day is 5 through 45');
  });

  test('reads both ends in terse mode too', () => {
    // The mode that was missed the first time: terse fell through to
    // `cross.value`, which for a gantt is the start alone -- so the shorter
    // announcement silently dropped the end, which is the exact failure the
    // span exists to prevent.
    const trace = new GanttTrace(ganttLayer(LANES));
    const text = new TextService(createMockNotificationService());
    // Verbose is the default; one toggle reaches terse.
    text.toggle();
    expect(text.isTerse()).toBe(true);

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).toContain('5-45');
    expect(spoken).not.toBe('Design, Wireframes, 5');
  });

  test('leaves a trace carrying one cross value alone', () => {
    // Every other trace emits no `crossRange`, so the single-value branch is
    // the one they reach and nothing about their announcement changes.
    const trace = new GanttTrace(ganttLayer(LANES));
    const state = trace.getStateAt(0, 0);
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }

    const withoutSpan: TraceState = {
      ...state,
      text: { ...state.text, crossRange: undefined },
    };
    const text = new TextService(createMockNotificationService());

    expect(announce(text, withoutSpan))
      .toBe('Task is Design, Wireframes, Day is 5, Length is 40 days');
  });
});
