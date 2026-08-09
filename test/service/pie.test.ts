import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { PieTrace } from '@model/pie';
import { BrailleService } from '@service/braille';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * The two services a pie has to be registered with by hand, exercised against
 * states a real {@link PieTrace} produced.
 *
 * Braille is the one that fails quietly: `BrailleService.update` returns early
 * for a trace type with no encoder in its map, so an unregistered pie leaves
 * braille users with an empty display and no error anywhere to explain it.
 */

const SLICE_LABELS = ['Apples', 'Bananas', 'Cherries'];

/** Builds a three-slice pie layer. A gap is passed as `null`. */
function pieLayer(values: (number | null)[]): MaidrLayer {
  return {
    id: 'slices',
    type: TraceType.PIE,
    title: 'Fruit sales',
    axes: { x: { label: 'Fruit' }, y: { label: 'Units' } },
    data: values.map((y, index) => ({ x: SLICE_LABELS[index], y: y as number })),
  };
}

/** The state a real pie trace reports with the cursor on one slice. */
function pieStateAt(values: (number | null)[], col: number): TraceState {
  const trace = new PieTrace(pieLayer(values));
  const state = trace.getStateAt(0, col);
  expect(state.empty).toBe(false);
  return state;
}

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return {
    notify: jest.fn(),
  } as unknown as NotificationService;
}

/**
 * Builds a BrailleService with lightweight dependency mocks.
 * @param displaySize - Braille display size setting to use
 * @returns Service instance and a context `moveToIndex` spy
 */
function createBrailleService(displaySize: number): {
  service: BrailleService;
  contextMoveToIndex: ReturnType<typeof jest.fn>;
} {
  const contextMoveToIndex = jest.fn<(row: number, col: number) => void>();
  const context = {
    moveToIndex: contextMoveToIndex,
  } as unknown as Context;

  const notification = {
    notify: jest.fn<(message: string) => void>(),
  } as unknown as NotificationService;

  const display = {
    toggleFocus: jest.fn(),
  } as unknown as DisplayService;

  const settings = {
    get: <T>(settingPath: string): T => {
      if (settingPath === 'general.brailleDisplayLines')
        return 1 as T;
      return displaySize as T;
    },
    onChange: () => ({ dispose: () => {} }),
  } as unknown as SettingsService;

  const service = new BrailleService(context, notification, display, settings);
  return { service, contextMoveToIndex };
}

describe('braille output for a pie', () => {
  test('encodes the slices instead of leaving the display empty', () => {
    const { service } = createBrailleService(10);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(pieStateAt([30, 50, 20], 0));

    // Bands over 20..50: 30 falls in the second quarter, 50 is the top of the
    // range, 20 is the bottom. An unregistered encoder emits nothing at all,
    // so the assertion that matters most here is that anything came out.
    expect(emitted.replace(/\n/g, '')).toBe('⠤⠉⣀');

    disposable.dispose();
    service.dispose();
  });

  test('maps a braille cell back to the slice it stands for', () => {
    const { service, contextMoveToIndex } = createBrailleService(10);

    let cursorIndex = -1;
    const disposable = service.onChange((event) => {
      cursorIndex = event.index;
    });

    service.toggle(pieStateAt([30, 50, 20], 2));

    // Routing a cursor move back to the model is what makes the braille
    // display an input as well as an output.
    service.moveToIndex(cursorIndex);
    expect(contextMoveToIndex).toHaveBeenLastCalledWith(0, 2);

    disposable.dispose();
    service.dispose();
  });

  test('leaves a gap blank rather than drawing it as the tallest slice', () => {
    const { service } = createBrailleService(10);

    let emitted = '';
    const disposable = service.onChange((event) => {
      emitted = event.value;
    });

    service.toggle(pieStateAt([30, null, 20], 0));

    // The gap is excluded from the range, so the two measured slices sit at
    // the top and the bottom of a 20..30 scale; the gap itself is a blank.
    expect(emitted.replace(/\n/g, '')).toBe('⠉ ⣀');

    disposable.dispose();
    service.dispose();
  });
});

describe('text announcement for a pie', () => {
  test('reads the label, the value and the share in verbose mode', () => {
    const text = new TextService(createMockNotificationService());
    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(pieStateAt([30, 50, 20], 0));

    // The percentage rides the optional z slot, which is what puts it after
    // the value rather than in place of it.
    const event = changeListener.mock.calls[0][0] as { value: string };
    expect(event.value).toBe('Fruit is Apples, Units is 30, Percentage is 30.0%');
  });

  test('drops the labels but keeps the share in terse mode', () => {
    const text = new TextService(createMockNotificationService());
    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.toggle(); // VERBOSE -> TERSE
    text.update(pieStateAt([30, 50, 20], 1));

    const event = changeListener.mock.calls[0][0] as { value: string };
    expect(event.value).toBe('Bananas, 50, 50.0%');
  });

  test('says a gap is missing rather than announcing a share of NaN percent', () => {
    const text = new TextService(createMockNotificationService());
    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(pieStateAt([30, null, 20], 1));

    const event = changeListener.mock.calls[0][0] as { value: string };
    expect(event.value).toContain('Percentage is missing');
    expect(event.value).not.toContain('NaN%');
  });

  test('says zero percent for every slice of a pie that totals zero', () => {
    const text = new TextService(createMockNotificationService());
    const changeListener = jest.fn();
    text.onChange(changeListener);

    text.update(pieStateAt([0, 0, 0], 0));

    // 0 / 0 is NaN, and the whole point of the zero-total branch is that no
    // screen reader ever has to say "Percentage is NaN percent".
    const event = changeListener.mock.calls[0][0] as { value: string };
    expect(event.value).toContain('Percentage is 0%');
  });
});
