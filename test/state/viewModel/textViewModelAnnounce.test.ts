import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { TextViewModel } from '@state/viewModel/textViewModel';
import { Emitter } from '@type/event';

/**
 * Behavioral tests for how TextViewModel wires the `first_navigation` and
 * autoplay events onto the Redux `text.announce` flag. `announce` gates
 * terse/verbose navigation text out of the screen-reader alert region until
 * the user's first navigation; autoplay separately suppresses per-point
 * announcements while it runs.
 */
describe('textViewModel announce coordination', () => {
  let onChange: Emitter<{ value: string }>;
  let onNavigation: Emitter<{ type: 'first_navigation' }>;
  let notificationChange: Emitter<{ value: string }>;
  let autoplayChange: Emitter<{ type: 'start' | 'stop' }>;
  let store: ReturnType<typeof createMaidrStore>;
  let viewModel: TextViewModel;

  beforeEach(() => {
    onChange = new Emitter();
    onNavigation = new Emitter();
    notificationChange = new Emitter();
    autoplayChange = new Emitter();

    const text = {
      onChange: onChange.event,
      onNavigation: onNavigation.event,
      format: (value: string) => value,
    } as unknown as TextService;
    const notification = {
      onChange: notificationChange.event,
    } as unknown as NotificationService;
    const autoplay = {
      onChange: autoplayChange.event,
    } as unknown as AutoplayService;
    const audio = {} as unknown as AudioService;

    store = createMaidrStore();
    viewModel = new TextViewModel(store, text, notification, autoplay, audio);
  });

  afterEach(() => {
    viewModel.dispose();
  });

  test('first_navigation enables announcements', () => {
    // Mirrors focus-in: the initial instruction is shown with announcements off.
    viewModel.setAnnounce(false);
    expect(store.getState().text.announce).toBe(false);

    onNavigation.fire({ type: 'first_navigation' });

    expect(store.getState().text.announce).toBe(true);
  });

  test('first_navigation during autoplay does not re-enable announcements', () => {
    // Autoplay-as-first-action: autoplay suppresses announcements, and the
    // first navigation it drives must not override that suppression.
    autoplayChange.fire({ type: 'start' });
    expect(store.getState().text.announce).toBe(false);

    onNavigation.fire({ type: 'first_navigation' });
    expect(store.getState().text.announce).toBe(false);

    // When autoplay stops, announcements resume as usual.
    autoplayChange.fire({ type: 'stop' });
    expect(store.getState().text.announce).toBe(true);
  });
});
