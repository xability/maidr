import type { NotificationService } from '@service/notification';
import type { LinePoint, Maidr, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How the text layer announces the uncertainty around a value (#919).
 *
 * A fitted curve's band is a *second fact about a real reading*, so it is
 * announced after the value rather than in place of it. That is what separates
 * it from `state.range`, which replaces the main value — right for a histogram
 * bin ("X is 5 through 10"), wrong for a reading that also has an interval.
 *
 * These cover the rendering rather than the model, so the cross-axis formatter
 * is exercised on the same path: a chart whose y axis is money has to announce
 * its bounds as money too, or the interval reads as two bare numbers beside a
 * formatted value.
 */

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/** Builds a line layer over one series. */
function lineLayer(points: LinePoint[], axes?: MaidrLayer['axes']): MaidrLayer {
  return {
    id: 'fit',
    type: TraceType.LINE,
    title: 'Fitted trend',
    axes: axes ?? { x: { label: 'Year' }, y: { label: 'Value' } },
    data: [points],
  } as MaidrLayer;
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

describe('announcing an interval around a value', () => {
  test('reads the value first and the band after it', () => {
    const trace = new LineTrace(lineLayer([{ x: 2020, y: 3, yMin: 2, yMax: 4 }]));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 0)))
      .toBe('Year is 2020, Value is 3, interval 2 through 4');
  });

  test('a chart with no band announces exactly as it did before', () => {
    // The whole feature has to be invisible to every line chart that draws no
    // band, which is most of them.
    const trace = new LineTrace(lineLayer([{ x: 2020, y: 3 }]));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 0)))
      .toBe('Year is 2020, Value is 3');
  });

  test('sends both bounds through the cross-axis formatter', () => {
    // The reason the bounds travel as two numbers rather than a pre-joined
    // string: a formatted y axis would otherwise announce a formatted value
    // beside two raw ones.
    const layer = lineLayer([{ x: 2020, y: 3, yMin: 2, yMax: 4 }], {
      x: { label: 'Year' },
      y: {
        label: 'Value',
        // A function *body* the formatter compiles at runtime, so it is
        // written as concatenation — a template literal here would be
        // interpolated by our own source instead.
        format: { function: 'return "$" + Number(value).toFixed(2)' },
      },
    });
    const trace = new LineTrace(layer);
    const text = new TextService(
      createMockNotificationService(),
      new FormatterService(figureOf(layer)),
    );

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).toContain('interval $2.00 through $4.00');
    expect(spoken).not.toContain('interval 2 through 4');
  });
});

describe('a one-sided interval', () => {
  test('names only the bound the chart drew', () => {
    const lower = new LineTrace(lineLayer([{ x: 2020, y: 3, yMin: 2 }]));
    const upper = new LineTrace(lineLayer([{ x: 2020, y: 3, yMax: 4 }]));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, lower.getStateAt(0, 0)))
      .toBe('Year is 2020, Value is 3, interval from 2');
    expect(announce(new TextService(createMockNotificationService()), upper.getStateAt(0, 0)))
      .toBe('Year is 2020, Value is 3, interval up to 4');
  });
});
