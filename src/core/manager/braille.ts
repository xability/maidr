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

  private readonly brailleDiv?: HTMLElement;
  private readonly brailleInput?: HTMLTextAreaElement;

  private readonly selectionChangeHandler?: (event: Event) => void;

  private readonly plotState: PlotState;

  constructor(
    notification: NotificationManager,
    display: DisplayManager,
    movable: Movable,
    state: PlotState
  ) {
    this.enabled = false;
    this.notification = notification;
    this.display = display;
    this.plotState = state;

    if (!display.brailleReviewDiv || !display.brailleReviewTextArea) {
      return;
    }

    this.brailleDiv = display.brailleReviewDiv;
    this.brailleInput = display.brailleReviewTextArea;

    this.selectionChangeHandler = (event: Event) => {
      event.preventDefault();
      movable.moveToIndex(this.brailleInput!.selectionStart || -1);
    };
    this.brailleInput.addEventListener(
      EventType.SELECTION_CHANGE,
      this.selectionChangeHandler
    );
    if (this.enabled) {
      this.setBraille(state);
    }
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
    if (!this.brailleInput) {
      return;
    }
    const brailleReviewInputSplit = this.brailleInput?.value.split('\n') || [];
    if (brailleReviewInputSplit.length > 1) {
      brailleReviewInputSplit[this.display.brailleLinesStart] =
        state.braille.values.join(Constant.EMPTY);
      this.brailleInput.value = brailleReviewInputSplit.join('\n');
    } else {
      this.brailleInput!.value = state.braille.values.join(Constant.EMPTY);
    }
    console.log(state, state.braille.index);
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
    this.enabled = !this.enabled;

    if (this.enabled) {
      this.setBraille(this.plotState);
    } else {
      const brailleReviewInputSplit = this.brailleInput!.value.split('\n');
      if (brailleReviewInputSplit.length > 1) {
        this.brailleInput!.value =
          '\n' + brailleReviewInputSplit[this.display.reviewLineStart];
      } else {
        this.brailleInput!.value = '';
      }
    }
    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
    this.display.toggleBrailleReviewFocus();
  }
}
