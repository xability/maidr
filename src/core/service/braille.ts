import { EventType } from "../../index";
import { PlotState } from "../../model/state";
import { Constant } from "../../util/constant";
import { Movable, Observer } from "../interface";
import { DisplayService } from "./display";
import { NotificationService } from "./notification";

export class BrailleService implements Observer {
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  private enabled: boolean;

  private readonly brailleTextArea?: HTMLTextAreaElement;
  private readonly selectionChangeHandler?: (event: Event) => void;

  public constructor(
    notification: NotificationService,
    display: DisplayService,
    movable: Movable,
  ) {
    this.notification = notification;
    this.display = display;

    this.enabled = false;
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
      this.selectionChangeHandler,
    );
  }

  public destroy(): void {
    if (this.brailleTextArea && this.selectionChangeHandler) {
      this.brailleTextArea.removeEventListener(
        EventType.SELECTION_CHANGE,
        this.selectionChangeHandler,
      );
    }
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty || state.braille.empty) {
      return;
    }

    const braille = state.braille;
    this.brailleTextArea!.value = braille.values
      .map((row) => row.join(Constant.EMPTY))
      .join(Constant.NEW_LINE);

    const index =
      braille.values
        .map((row) => row.join(Constant.EMPTY).length + 1)
        .slice(0, braille.row)
        .reduce((acc, length) => acc + length, 0) + braille.col;
    this.brailleTextArea!.setSelectionRange(index, index);
  }

  public toggle(state: PlotState): void {
    if (state.empty || state.braille.empty) {
      const notSupported = "Braille is not supported";
      this.notification.notify(notSupported);
      return;
    }

    if (!this.enabled) {
      this.enabled = true;
      this.update(state);
    } else {
      this.enabled = false;
    }
    this.display.toggleBrailleFocus();

    const message = `Braille is ${this.enabled ? "on" : "off"}`;
    this.notification.notify(message);
  }
}
