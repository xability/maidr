import type { NotificationService } from '@service/notification';
import type { PlotState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TextService } from '@service/text';

/**
 * Coverage for the multi-panel lobby navigation text produced by
 * TextService.formatFigureText (via update -> format). Arrowing between
 * subplots in terse mode should read back the focused subplot's own title
 * when authored, and otherwise a concise "Subplot N, <types>" without the
 * "of N" framing or the "Press ENTER" prompt. Verbose keeps the full form.
 */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/**
 * A non-empty multi-panel figure state whose focused subplot carries the
 * given title (pass the model default 'unavailable' or '' for "no title").
 */
function figureState(subplotTitle: string): PlotState {
  return {
    empty: false,
    type: 'figure',
    index: 2,
    size: 3,
    traceTypes: ['bar'],
    subplot: {
      empty: false,
      type: 'subplot',
      trace: { empty: false, type: 'trace', title: subplotTitle },
    },
  } as unknown as PlotState;
}

describe('TextService figure-lobby navigation text', () => {
  test('terse: reads back just the focused subplot title when authored', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(figureState('Sales in North'));

    expect(onChange).toHaveBeenCalledWith({ value: 'Sales in North' });
  });

  test('terse: falls back to the bare "Subplot N" when the subplot has no title', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    const onChange = jest.fn();
    text.onChange(onChange);

    // 'unavailable' is the model's placeholder default -> treated as no title.
    text.update(figureState('unavailable'));

    expect(onChange).toHaveBeenCalledWith({ value: 'Subplot 2' });
  });

  test('terse: a blank subplot title is also treated as no title', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(figureState('   '));

    expect(onChange).toHaveBeenCalledWith({ value: 'Subplot 2' });
  });

  test('verbose: full position + "Press ENTER" prompt, now including the title', () => {
    const text = new TextService(createMockNotificationService()); // defaults to VERBOSE
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(figureState('Sales in North'));

    expect(onChange).toHaveBeenCalledWith({
      value: 'Subplot 2 of 3, Sales in North: This is a bar plot. Press \'ENTER\' to select this subplot.',
    });
  });

  test('verbose: omits the title when the subplot has none', () => {
    const text = new TextService(createMockNotificationService()); // defaults to VERBOSE
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(figureState('unavailable'));

    expect(onChange).toHaveBeenCalledWith({
      value: 'Subplot 2 of 3: This is a bar plot. Press \'ENTER\' to select this subplot.',
    });
  });
});
