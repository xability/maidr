import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { Emitter, Scope } from '@type/event';

interface ReviewChangedEvent {
  value: string;
}

export class ReviewService implements Observer<TraceState>, Disposable {
  private readonly notification: NotificationService;
  private readonly display: DisplayService;
  private readonly text: TextService;

  private readonly onChangeEmitter: Emitter<ReviewChangedEvent>;
  public readonly onChange: Event<ReviewChangedEvent>;

  public constructor(notification: NotificationService, display: DisplayService, text: TextService) {
    this.notification = notification;
    this.display = display;
    this.text = text;

    this.onChangeEmitter = new Emitter<ReviewChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public update(state: TraceState): void {
    const review = this.text.format(state);
    if (review) {
      this.onChangeEmitter.fire({ value: review });
    }
  }

  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus(Scope.REVIEW);

    const newState = !oldState;
    const message = `Review is ${newState ? 'on' : 'off'}`;
    this.notification.notify(message);

    return newState;
  }
}
