import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { PlotState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { ReviewService } from '@service/review';
import { Scope } from '@type/event';

/**
 * Coverage for ReviewService, focused on the multi-panel lobby support this
 * PR added: the service was widened from Observer<TraceState> to
 * Observer<PlotState> so review mode (R) works at the figure lobby too. These
 * tests exercise the figure-state path (previously only trace states were
 * accepted) plus the enable/disable and empty-state behavior.
 */
function createMocks(): {
  notification: NotificationService;
  display: DisplayService;
  text: TextService;
} {
  return {
    notification: { notify: jest.fn() } as unknown as NotificationService,
    display: { toggleFocus: jest.fn() } as unknown as DisplayService,
    // Echoes a marker so we can assert the figure state was formatted (not
    // rejected) without depending on TextService's exact lobby wording.
    text: {
      format: jest.fn((state: string | PlotState) =>
        (typeof state === 'string' ? state : 'LOBBY REVIEW TEXT')),
    } as unknown as TextService,
  };
}

/** A non-empty multi-panel figure lobby state. */
const FIGURE_LOBBY = { empty: false, type: 'figure', index: 2, size: 4 } as unknown as PlotState;

describe('ReviewService at the figure lobby', () => {
  test('toggling review on formats and announces the figure lobby state', () => {
    const { notification, display, text } = createMocks();
    const service = new ReviewService(notification, display, text);
    const onChange = jest.fn();
    service.onChange(onChange);

    service.toggle(FIGURE_LOBBY);

    // The figure state is accepted and formatted (the PlotState widening).
    expect(text.format).toHaveBeenCalledWith(FIGURE_LOBBY);
    expect(onChange).toHaveBeenCalledWith({ value: 'LOBBY REVIEW TEXT' });
    expect(display.toggleFocus).toHaveBeenCalledWith(Scope.REVIEW);
    expect(notification.notify).toHaveBeenCalledWith('Review is on');

    service.dispose();
  });

  test('update does nothing while review mode is disabled', () => {
    const { notification, display, text } = createMocks();
    const service = new ReviewService(notification, display, text);
    const onChange = jest.fn();
    service.onChange(onChange);

    service.update(FIGURE_LOBBY);

    expect(onChange).not.toHaveBeenCalled();
    expect(text.format).not.toHaveBeenCalled();

    service.dispose();
  });

  test('re-emits formatted lobby text on update once enabled', () => {
    const { notification, display, text } = createMocks();
    const service = new ReviewService(notification, display, text);
    const onChange = jest.fn();
    service.onChange(onChange);

    service.toggle(FIGURE_LOBBY); // enable
    onChange.mockClear();

    service.update({ empty: false, type: 'figure', index: 3, size: 4 } as unknown as PlotState);

    expect(onChange).toHaveBeenCalledWith({ value: 'LOBBY REVIEW TEXT' });

    service.dispose();
  });

  test('an empty lobby state warns and does not enable review', () => {
    const { notification, display, text } = createMocks();
    const service = new ReviewService(notification, display, text);

    service.toggle({ empty: true, type: 'figure' } as unknown as PlotState);

    expect(notification.notify).toHaveBeenCalledWith('No info for review');
    expect(display.toggleFocus).not.toHaveBeenCalled();
    expect(text.format).not.toHaveBeenCalled();

    service.dispose();
  });

  test('toggling review off announces the off state', () => {
    const { notification, display } = createMocks();
    const service = new ReviewService(notification, display, createMocks().text);

    service.toggle(FIGURE_LOBBY); // on
    service.toggle(FIGURE_LOBBY); // off

    expect(notification.notify).toHaveBeenLastCalledWith('Review is off');

    service.dispose();
  });
});
