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

  private enabled: boolean;

  private readonly onChangeEmitter: Emitter<ReviewChangedEvent>;
  public readonly onChange: Event<ReviewChangedEvent>;

  public constructor(notification: NotificationService, display: DisplayService, text: TextService) {
    this.notification = notification;
    this.display = display;
    this.text = text;

    this.enabled = false;

    this.onChangeEmitter = new Emitter<ReviewChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public update(state: TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    const review = this.text.format(state);
    if (review) {
      this.onChangeEmitter.fire({ value: review });
    }
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      const noInfo = 'No info for review';
      this.notification.notify(noInfo);
      return;
    }

    this.enabled = !this.enabled;
    this.update(state);
    this.display.toggleFocus(Scope.REVIEW);

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
