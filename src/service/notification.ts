import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import { Emitter } from '@type/event';

/**
 * Event payload for notification changes.
 */
interface NotificationChangedEvent {
  /** The notification message content */
  value: string;
}

/**
 * Service for managing and broadcasting notification messages throughout the application.
 */
export class NotificationService implements Disposable {
  private readonly onChangeEmitter: Emitter<NotificationChangedEvent>;
  /** Event that fires when a notification is triggered */
  public readonly onChange: Event<NotificationChangedEvent>;

  /**
   * Creates a new NotificationService instance and initializes the event emitter.
   */
  public constructor() {
    this.onChangeEmitter = new Emitter<NotificationChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  /**
   * Disposes of the notification service and cleans up event listeners.
   */
  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  /**
   * Broadcasts a notification message to all registered listeners.
   * @param message - The notification message to broadcast
   */
  public notify(message: string): void {
    if (!message) {
      return;
    }

    this.onChangeEmitter.fire({ value: message });
  }
}
