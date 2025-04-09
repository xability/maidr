import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import { Emitter } from '@type/event';

interface NotificationChangedEvent {
  value: string;
}

export class NotificationService implements Disposable {
  private readonly onChangeEmitter: Emitter<NotificationChangedEvent>;
  public readonly onChange: Event<NotificationChangedEvent>;

  public constructor() {
    this.onChangeEmitter = new Emitter<NotificationChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public notify(message: string): void {
    if (!message) {
      return;
    }

    this.onChangeEmitter.fire({ value: message });
  }
}
