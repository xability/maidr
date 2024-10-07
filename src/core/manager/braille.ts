import Constant from '../../util/constant';
import NotificationManager from './notification';
import {Observer} from '../observer';
import {PlotState} from '../../plot/state';
import {EventType} from '../..';

export default class BrailleManager implements Observer {
  private enabled: boolean;
  private readonly notification: NotificationManager;

  private readonly brailleDiv?: HTMLElement;
  private readonly brailleInput?: HTMLInputElement;

  private readonly selectionChangeHandler?: (event: Event) => void;

  constructor(
    notification: NotificationManager,
    state: PlotState,
    moveToIndex: (index: number) => void,
    brailleDiv?: HTMLElement,
    brailleInput?: HTMLInputElement
  ) {
    this.enabled = false;
    this.notification = notification;

    if (!brailleDiv || !brailleInput) {
      return;
    }

    this.brailleDiv = brailleDiv;
    this.brailleInput = brailleInput;

    this.selectionChangeHandler = (event: Event) => {
      event.preventDefault();
      moveToIndex(this.brailleInput?.selectionStart || 0);
    };
    this.brailleInput.addEventListener(
      EventType.SELECTION_CHANGE,
      this.selectionChangeHandler
    );

    this.setBraille(state);
  }

  private setBraille(state: PlotState): void {
    this.brailleInput!.value = state.braille.values.join(Constant.EMPTY);

    // Show the braille caret only if available.
    if (!state.empty) {
      this.brailleInput!.setSelectionRange(
        state.braille.index,
        state.braille.index
      );
    }
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty) {
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

  public destroy(): void {
    if (this.brailleInput && this.selectionChangeHandler) {
      this.brailleInput?.removeEventListener(
        EventType.SELECTION_CHANGE,
        this.selectionChangeHandler
      );
    }
  }
}
