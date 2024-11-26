import Constant from '../../util/constant';
import {EventType} from '../../index';
import NotificationManager from './notification';
import {Movable, Observer} from '../interface';
import {PlotState} from '../../model/state';
import DisplayManager from './display';

export default class BrailleManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;

  private readonly brailleInput?: HTMLInputElement;
  private readonly selectionChangeHandler?: (event: Event) => void;

  constructor(
    notification: NotificationManager,
    display: DisplayManager,
    movable: Movable,
    state: PlotState
  ) {
    this.enabled = false;

    this.notification = notification;
    this.display = display;

    if (!display.brailleDiv || !display.brailleInput) {
      return;
    }

    this.brailleInput = display.brailleInput;

    this.selectionChangeHandler = (event: Event) => {
      event.preventDefault();
      movable.moveToIndex(this.brailleInput!.selectionStart || -1);
    };
    this.brailleInput.addEventListener(
      EventType.SELECTION_CHANGE,
      this.selectionChangeHandler
    );

    this.setBraille(state);
  }

  public destroy(): void {
    if (this.brailleInput && this.selectionChangeHandler) {
      this.brailleInput.removeEventListener(
        EventType.SELECTION_CHANGE,
        this.selectionChangeHandler
      );
    }
  }

  private setBraille(state: PlotState): void {
    if (state.empty) {
      return;
    }

    this.brailleInput!.value = state.braille.values.join(Constant.EMPTY);
    this.brailleInput!.setSelectionRange(
      state.braille.index,
      state.braille.index
    );
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
    if (!this.brailleInput) {
      return;
    }

    this.enabled = !this.enabled;
    this.display.toggleInputFocus(this.brailleInput);

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
