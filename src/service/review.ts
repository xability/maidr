import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
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
 * Manages review mode functionality, generating formatted review text for the
 * active plot element. Works at trace level (data descriptions) and at the
 * multi-panel figure lobby (subplot navigation text).
 */
export class ReviewService implements Observer<PlotState>, Disposable {
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
   * Updates the review content based on the current plot state.
   * @param state - The current plot state to generate review from
   */
  public update(state: PlotState): void {
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
   * @param state - The current plot state to review
   */
  public toggle(state: PlotState): void {
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
