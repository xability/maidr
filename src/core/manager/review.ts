import hotkeys from 'hotkeys-js';

import {EventType} from '../../index';
import {PlotState} from '../../model/state';
import {Observer} from '../interface';
import {DisplayManager} from './display';
import {Scope} from './keymap';
import {NotificationManager} from './notification';
import {TextManager} from './text';

export class ReviewManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;
  private readonly text: TextManager;

  private readonly reviewInput?: HTMLInputElement;
  private readonly reviewKeyHandler?: (event: KeyboardEvent) => void;

  public constructor(
    notification: NotificationManager,
    display: DisplayManager,
    text: TextManager
  ) {
    this.enabled = false;

    this.notification = notification;
    this.display = display;
    this.text = text;

    if (!display.reviewInput) {
      return;
    }

    this.reviewKeyHandler = (e: KeyboardEvent) => {
      const isNavigationKey =
        e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isModifierKey = isCtrlKey || e.shiftKey;

      if (
        !isNavigationKey && // Navigate next character with Arrow keys.
        !(isModifierKey && isNavigationKey) && // Navigate to Start and End.
        !(isCtrlKey && e.key === 'a') && // Select text.
        !(isCtrlKey && e.key === 'c') && // Copy text.
        !(e.key === 'Tab') // Allow blur after focussed.
      ) {
        e.preventDefault();
      }
    };
    this.reviewInput = display.reviewInput;
    this.reviewInput.addEventListener(
      EventType.KEY_DOWN,
      this.reviewKeyHandler
    );
  }

  public destroy(): void {
    if (this.reviewInput && this.reviewKeyHandler) {
      this.reviewInput.removeEventListener(
        EventType.KEY_DOWN,
        this.reviewKeyHandler
      );
    }
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    this.reviewInput!.value = this.text.formatText(state);
  }

  public toggle(state: PlotState): void {
    if (this.enabled) {
      this.enabled = false;
      hotkeys.setScope(Scope.DEFAULT);
    } else {
      this.enabled = true;
      this.update(state);
      hotkeys.setScope(Scope.REVIEW);
    }
    this.display.toggleReviewFocus();

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
