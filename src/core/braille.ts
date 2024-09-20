import NotificationManager from './notification';
import {BrailleState} from '../plot/state';

export default class BrailleManager {
  private enabled: boolean;
  private readonly notification: NotificationManager;

  constructor(notification: NotificationManager) {
    this.enabled = false;
    this.notification = notification;
  }

  public destroy(): void {}
  private transform(coordinate: Coordinate): string[] {
    return [];
  }

  public show(state: BrailleState): void {
    if (!this.enabled) {
      return;
    }
  }

  public toggle(): void {
    this.enabled = !this.enabled;
  }
}
