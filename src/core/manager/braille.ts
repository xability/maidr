import {Constant} from '../../util/constant';
import {DisplayManager} from './display';
import {EventType} from '../../index';
import {NotificationManager} from './notification';
import {Movable, Observer} from '../interface';
import {PlotState} from '../../model/state';

export class BrailleManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;

  private readonly brailleTextArea?: HTMLTextAreaElement;
  private readonly selectionChangeHandler?: (event: Event) => void;

  public constructor(
    notification: NotificationManager,
    display: DisplayManager,
    movable: Movable
  ) {
    this.enabled = false;

    this.notification = notification;
    this.display = display;

    if (!display.brailleDiv || !display.brailleTextArea) {
      return;
    }

    this.selectionChangeHandler = (event: Event) => {
      event.preventDefault();
      if (this.enabled) {
        movable.moveToIndex(this.brailleTextArea!.selectionStart || -1);
      }
    };
    this.brailleTextArea = display.brailleTextArea;
    this.brailleTextArea.addEventListener(
      EventType.SELECTION_CHANGE,
      this.selectionChangeHandler
    );
  }

  public destroy(): void {
    if (this.brailleTextArea && this.selectionChangeHandler) {
      this.brailleTextArea.removeEventListener(
        EventType.SELECTION_CHANGE,
        this.selectionChangeHandler
      );
    }
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    this.brailleTextArea!.value = state.braille.values
      .map(row => row.join(Constant.EMPTY))
      .join(Constant.NEW_LINE);

    const index =
      state.braille.values
        .map(row => row.join(Constant.EMPTY).length + 1)
        .slice(0, state.braille.row)
        .reduce((acc, length) => acc + length, 0) + state.braille.col;
    this.brailleTextArea!.setSelectionRange(index, index);
  }

  public toggle(state: PlotState): void {
    if (!this.enabled) {
      this.enabled = true;
      this.update(state);
    } else {
      this.enabled = false;
    }
    this.display.toggleBrailleFocus();

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
