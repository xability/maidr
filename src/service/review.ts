import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { Emitter, Scope } from '@type/event';

/**
 * Event data emitted when the review content changes.
 */
interface ReviewChangedEvent {
  value: string;
}

/**
 * Manages review mode functionality for trace data, generating formatted review text.
 */
export class ReviewService implements Observer<TraceState>, Disposable {
  private readonly notification: NotificationService;
  private readonly display: DisplayService;
  private readonly text: TextService;

  private enabled: boolean;

  private readonly onChangeEmitter: Emitter<ReviewChangedEvent>;
  public readonly onChange: Event<ReviewChangedEvent>;

  /**
   * Creates a new ReviewService instance.
   * @param notification - Service for displaying notifications
   * @param display - Service for managing display focus
   * @param text - Service for formatting text output
   */
  public constructor(notification: NotificationService, display: DisplayService, text: TextService) {
    this.notification = notification;
    this.display = display;
    this.text = text;

    this.enabled = false;

    this.onChangeEmitter = new Emitter<ReviewChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  /**
   * Disposes of the review service and cleans up event emitters.
   */
  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  /**
   * Updates the review content based on the current trace state.
   * @param state - The current trace state to generate review from
   */
  public update(state: TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    const review = this.text.format(state);
    if (review) {
      this.onChangeEmitter.fire({ value: review });
    }
  }

  /**
   * Toggles review mode on or off and updates the display focus.
   * @param state - The current trace state to review
   */
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
