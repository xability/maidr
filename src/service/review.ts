import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { EventType, Scope } from '@type/event';

export class ReviewService implements Observer<TraceState>, Disposable {
  private readonly notification: NotificationService;
  private readonly display: DisplayService;
  private readonly text: TextService;

  private enabled: boolean;

  private readonly reviewInput?: HTMLInputElement;
  private readonly reviewKeyHandler?: (event: KeyboardEvent) => void;

  public constructor(
    notification: NotificationService,
    display: DisplayService,
    text: TextService,
  ) {
    this.notification = notification;
    this.display = display;
    this.text = text;

    this.enabled = false;
    if (!display.reviewInput) {
      return;
    }

    this.reviewKeyHandler = (e: KeyboardEvent) => {
      const isNavigationKey
        = e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isModifierKey = isCtrlKey || e.shiftKey;

      if (
        !isNavigationKey // Navigate next character with Arrow keys.
        && !(isModifierKey && isNavigationKey) // Navigate to Start and End.
        && !(isCtrlKey && e.key === 'a') // Select text.
        && !(isCtrlKey && e.key === 'c') // Copy text.
        && !(e.key === 'Tab') // Allow blur after focussed.
      ) {
        e.preventDefault();
      }
    };
    this.reviewInput = display.reviewInput;
    this.reviewInput.addEventListener(EventType.KEY_DOWN, this.reviewKeyHandler);
  }

  public dispose(): void {
    if (this.reviewInput && this.reviewKeyHandler) {
      this.reviewInput.removeEventListener(EventType.KEY_DOWN, this.reviewKeyHandler);
    }
  }

  public update(state: TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    this.reviewInput!.value = this.text.format(state);
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      const noInfo = 'No info for review';
      this.notification.notify(noInfo);
      return;
    }

    this.enabled = !this.enabled;
    this.enabled && this.update(state);
    this.display.toggleFocus(Scope.REVIEW);

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
