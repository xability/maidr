import type { ContextService } from '@service/context';
import { notify } from '@redux/slice/notificationSlice';
import { store } from '@redux/store';

export class NotificationService {
  public constructor(context: ContextService) {
    this.notify(context.getInstruction(false));
  }

  public notify(message: string): void {
    store.dispatch(notify(message));
  }
}
