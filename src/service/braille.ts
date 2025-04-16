import type { ContextService } from '@service/context';
import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import { DomEventType, Scope } from '@type/event';
import { Constant } from '@util/constant';

export class BrailleService implements Observer<TraceState>, Disposable {
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  private enabled: boolean;

  private readonly brailleTextArea?: HTMLTextAreaElement;
  private readonly selectionChangeHandler?: (event: Event) => void;

  public constructor(
    context: ContextService,
    notification: NotificationService,
    display: DisplayService,
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
        context.moveToIndex(this.brailleTextArea!.selectionStart || -1);
      }
    };
    this.brailleTextArea = display.brailleTextArea;
    this.brailleTextArea.addEventListener(
      DomEventType.SELECTION_CHANGE,
      this.selectionChangeHandler,
    );
  }

  public dispose(): void {
    if (this.brailleTextArea && this.selectionChangeHandler) {
      this.brailleTextArea.removeEventListener(
        DomEventType.SELECTION_CHANGE,
        this.selectionChangeHandler,
      );
    }
  }

  public update(state: TraceState): void {
    if (!this.enabled || state.empty || state.braille.empty) {
      return;
    }

    const braille = state.braille;
    this.brailleTextArea!.value = braille.values
      .map(row => row.join(Constant.EMPTY))
      .join(Constant.NEW_LINE);

    const index = braille.col + braille.values
      .map(row => row.join(Constant.EMPTY).length + 1)
      .slice(0, braille.row)
      .reduce((acc, length) => acc + length, 0);
    this.brailleTextArea!.setSelectionRange(index, index);
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      const noInfo = 'No info for braille';
      this.notification.notify(noInfo);
      return;
    }

    if (state.braille.empty) {
      const notSupported = `Braille is not supported for plot type: ${state.braille.traceType}`;
      this.notification.notify(notSupported);
      return;
    }

    this.enabled = !this.enabled;
    this.update(state);
    this.display.toggleFocus(Scope.BRAILLE);

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
