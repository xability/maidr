import type { NotificationService } from '@service/notification';
import type { Maidr, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { PieTrace } from '@model/pie';
import { FormatterService } from '@service/formatter';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How the text layer announces a data point the producer had no measurement
 * for, across the traces that carry gaps.
 *
 * The wire sentinel differs by trace — a bar arrives as the `null` the producer
 * emitted, a pie as the `NaN` its model normalizes that to — and neither is a
 * value to read out. `TextService` names both, so a trace does not have to
 * pre-render its own value slot to be announced correctly, and so the wording
 * does not depend on a formatter being wired up to catch it:
 * `FormatUtil.wrapFormat` only sees a value for a layer the formatter service
 * has an entry for.
 */

const BAR_LAYER_ID = 'bars';

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
}

/** Builds a two-bar layer whose second bar carries the given value. */
function barLayer(second: number | null): MaidrLayer {
  return {
    id: BAR_LAYER_ID,
    type: TraceType.BAR,
    title: 'Monthly revenue',
    axes: { x: { label: 'Month' }, y: { label: 'Revenue' } },
    data: [
      { x: 'Jan', y: 10 },
      { x: 'Feb', y: second as number },
    ],
  };
}

/** Builds a two-slice pie layer whose second slice carries the given value. */
function pieLayer(second: number | null): MaidrLayer {
  return {
    id: 'slices',
    type: TraceType.PIE,
    title: 'Fruit sales',
    axes: { x: { label: 'Fruit' }, y: { label: 'Units' } },
    data: [
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: second as number },
    ],
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

describe('announcing an absent value', () => {
  test('names a null bar rather than reading the wire sentinel out', () => {
    const trace = new BarTrace(barLayer(null));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 1))).toBe('Month is Feb, Revenue is missing');
  });

  test('names it in terse mode too', () => {
    const trace = new BarTrace(barLayer(null));
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE

    expect(announce(text, trace.getStateAt(0, 1))).toBe('Feb, missing');
  });

  test('names a gapped pie slice, so one sentence does not use both words', () => {
    const trace = new PieTrace(pieLayer(null));
    const text = new TextService(createMockNotificationService());

    // The share already said 'missing'; the value slot said 'NaN' beside it.
    expect(announce(text, trace.getStateAt(0, 1)))
      .toBe('Fruit is Bananas, Units is missing, Percentage is missing');
  });

  test('names it even for a layer the formatter service has no entry for', () => {
    // `FormatterService.getFormatter` answers an unknown layer id with the
    // bare `defaultFormat`, which is not wrapped and renders a null as 'null'.
    // This is the path that reaches a reader in a wired-up figure.
    const layer = barLayer(null);
    const trace = new BarTrace(layer);
    const formatter = new FormatterService(figureOf({ ...layer, id: 'other' }));
    const text = new TextService(createMockNotificationService(), formatter);

    expect(announce(text, trace.getStateAt(0, 1))).toBe('Month is Feb, Revenue is missing');
  });

  test('names an infinity, which the formatter wrapper lets through', () => {
    const layer = barLayer(Number.POSITIVE_INFINITY);
    const trace = new BarTrace(layer);
    const text = new TextService(
      createMockNotificationService(),
      new FormatterService(figureOf(layer)),
    );

    expect(announce(text, trace.getStateAt(0, 1))).toBe('Month is Feb, Revenue is missing');
  });
});

describe('values that only look absent', () => {
  test('still announces a bar measured at zero as zero', () => {
    // The discriminator the guard must not blur: a measured 0 is a reading.
    const trace = new BarTrace(barLayer(0));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 1))).toBe('Month is Feb, Revenue is 0');
  });

  test('leaves an empty category label as the empty label it is', () => {
    const layer: MaidrLayer = {
      id: BAR_LAYER_ID,
      type: TraceType.BAR,
      title: 'Monthly revenue',
      axes: { x: { label: 'Month' }, y: { label: 'Revenue' } },
      data: [{ x: '', y: 10 }],
    };
    const trace = new BarTrace(layer);
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(0, 0))).toBe('Month is , Revenue is 10');
  });
});
