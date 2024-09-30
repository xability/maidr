import {BrailleState} from '../../plot/state';
import Constant from '../../util/constant';
import NotificationManager from './notification';

export default class BrailleManager {
  private enabled: boolean;
  private readonly notification: NotificationManager;

  private readonly brailleDiv?: HTMLElement;
  private readonly brailleInput?: HTMLInputElement;

  constructor(
    notification: NotificationManager,
    state: BrailleState,
    brailleDiv?: HTMLElement,
    brailleInput?: HTMLInputElement,
    moveToIndex?: (index: number) => void
  ) {
    this.enabled = false;
    this.notification = notification;

    if (!brailleDiv || !brailleInput) {
      return;
    }

    this.brailleDiv = brailleDiv;
    this.brailleInput = brailleInput;

    this.brailleInput.addEventListener('selectionchange', e => {
      e.preventDefault();
      moveToIndex ? moveToIndex(this.brailleInput?.selectionStart || 0) : null;
    });

    this.setBraille(state);
  }

  private setBraille(state: BrailleState): void {
    this.brailleInput!.value = state.braille.join(Constant.EMPTY);
    this.brailleInput!.setSelectionRange(state.index, state.index);
  }

  public show(state: BrailleState): void {
    if (!this.enabled) {
      return;
    }

    this.setBraille(state);
    // Scroll to the current caret position.
    // Focus will be lost when disabled.
    this.brailleInput!.focus();
  }

  public toggle(): void {
    this.enabled = !this.enabled;

    if (this.enabled) {
      // Show the Braille input and focus on it when enabled.
      this.brailleDiv?.classList.remove(Constant.HIDDEN);
      this.brailleInput?.focus();
    } else {
      // Remove the focus and then hide the Braille input.
      this.brailleInput?.blur();
      this.brailleDiv?.classList.add(Constant.HIDDEN);
    }

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
