import type { NotificationService } from '@service/notification';
import type { PlotState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TextService } from '@service/text';

/**
 * Coverage for the figure-lobby out-of-bounds cue added to TextService.update:
 * arrowing past the first/last subplot at the multi-panel lobby fires an empty
 * figure state (no `warning`), which should announce a subplot-worded edge cue,
 * respecting text mode (OFF silent, TERSE short, VERBOSE full) — mirroring the
 * trace-level "No more data" branch.
 */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/** The empty figure state Figure.notifyOutOfBounds() pushes at a lobby edge. */
const OUT_OF_BOUNDS_FIGURE = { empty: true, type: 'figure' } as unknown as PlotState;

describe('TextService figure-lobby boundary cue', () => {
  test('verbose: announces "No more subplots to display"', () => {
    const text = new TextService(createMockNotificationService()); // defaults to VERBOSE
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(OUT_OF_BOUNDS_FIGURE);

    expect(onChange).toHaveBeenCalledWith({ value: 'No more subplots to display' });
  });

  test('terse: announces "No more subplots"', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(OUT_OF_BOUNDS_FIGURE);

    expect(onChange).toHaveBeenCalledWith({ value: 'No more subplots' });
  });

  test('off: stays silent', () => {
    const text = new TextService(createMockNotificationService());
    text.toggle(); // VERBOSE -> TERSE
    text.toggle(); // TERSE -> OFF
    const onChange = jest.fn();
    text.onChange(onChange);

    text.update(OUT_OF_BOUNDS_FIGURE);

    expect(onChange).not.toHaveBeenCalled();
  });
});
