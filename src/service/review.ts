import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { EventType } from '@type/event';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class ReviewService implements Observer<TraceState> {
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

  public destroy(): void {
    if (this.reviewInput && this.reviewKeyHandler) {
      this.reviewInput.removeEventListener(EventType.KEY_DOWN, this.reviewKeyHandler);
    }
  }

  public update(state: TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    this.reviewInput!.value = this.text.formatText(state);
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      const noInfo = 'No info for review';
      this.notification.notify(noInfo);
      return;
    }

    if (this.enabled) {
      this.enabled = false;
      hotkeys.setScope(Scope.SUBPLOT);
    } else {
      this.enabled = true;
      this.update(state);
      hotkeys.setScope(Scope.REVIEW);
    }
    this.display.toggleFocus('REVIEW');

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
