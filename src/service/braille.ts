import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import { Emitter, Scope } from '@type/event';
import { Constant } from '@util/constant';

interface BrailleChangedEvent {
  value: string;
  index: number;
}

export class BrailleService implements Observer<TraceState>, Disposable {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  private enabled: boolean;

  private readonly onChangeEmitter: Emitter<BrailleChangedEvent>;
  public readonly onChange: Event<BrailleChangedEvent>;

  public constructor(context: Context, notification: NotificationService, display: DisplayService) {
    this.context = context;
    this.notification = notification;
    this.display = display;

    this.enabled = false;

    this.onChangeEmitter = new Emitter<BrailleChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public update(state: TraceState): void {
    if (!this.enabled || state.empty || state.braille.empty) {
      return;
    }

    const braille = state.braille;
    const value = braille.values
      .map(row => row.join(Constant.EMPTY))
      .join(Constant.NEW_LINE);
    const index = braille.col + braille.values
      .map(row => row.join(Constant.EMPTY).length + 1)
      .slice(0, braille.row)
      .reduce((acc, length) => acc + length, 0);
    this.onChangeEmitter.fire({ value, index });
  }

  public moveToIndex(index: number): void {
    if (this.enabled) {
      this.context.moveToIndex(index);
    }
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
