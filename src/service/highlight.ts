import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';

export class HighlightService implements Observer<PlotState> {
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  public constructor(notification: NotificationService, display: DisplayService) {
    this.notification = notification;
    this.display = display;
  }

  public destroy(): void {}

  public update(_: PlotState): void {}
}
