import hotkeys from 'hotkeys-js';
import Constant from '../../util/constant';
import DisplayManager from './display';
import {EventType} from '../../index';
import NotificationManager from './notification';
import {Observer} from '../interface';
import {PlotState} from '../../model/state';
import {Scope} from './keymap';
import TextManager from './text';

export default class ReviewManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;
  private readonly text: TextManager;

  private readonly reviewTextArea?: HTMLTextAreaElement;
  private readonly reviewKeyHandler?: (event: KeyboardEvent) => void;

  constructor(
    notification: NotificationManager,
    display: DisplayManager,
    text: TextManager
  ) {
    this.enabled = false;

    this.notification = notification;
    this.display = display;
    this.text = text;

    if (!display.brailleAndReviewTextArea) {
      return;
    }

    // Prevent default behavior for all keys except navigation keys, Home, End, Control,a, c and Tab keys.
    // Build review container if r is prepared and switch focus to review container
    this.reviewKeyHandler = (e: KeyboardEvent) => {
      const isNavigationKey =
        e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isModifierKey = isCtrlKey || e.shiftKey;

      if (
        !isNavigationKey &&
        !(isModifierKey && isNavigationKey) &&
        !(isCtrlKey && e.key === 'a') &&
        !(isCtrlKey && e.key === 'c') &&
        !(e.key === 'Tab')
      ) {
        e.preventDefault();
      }
    };
    this.reviewTextArea = display.brailleAndReviewTextArea;
    this.reviewTextArea.addEventListener(
      EventType.KEY_DOWN,
      this.reviewKeyHandler
    );
  }

  public destroy(): void {
    if (this.reviewTextArea && this.reviewKeyHandler) {
      this.reviewTextArea.removeEventListener(
        EventType.KEY_DOWN,
        this.reviewKeyHandler
      );
    }
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    const existingText = this.reviewTextArea!.value.split(Constant.NEW_LINE);
    if (existingText.length === 0) {
      this.reviewTextArea!.value = this.text.formatText(state);
    } else {
      existingText[state.braille.row] = this.text.formatText(state);
      this.reviewTextArea!.value = existingText.join(Constant.EMPTY);

      const index = state.braille.values
        .slice(0, state.braille.row)
        .reduce((acc, row) => acc + row.join(Constant.EMPTY).length + 1, 0);
      this.reviewTextArea!.setSelectionRange(index, index);
    }
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
    this.display.toggleTextAreaFocus();

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
