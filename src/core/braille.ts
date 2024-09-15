import Coordinate from '../plot/coordinate';
import Notification from './notification';

export default class Braille {
  private enabled: boolean;
  private readonly notification: Notification;

  private data;
  private readonly coordinate: Coordinate;

  constructor(notification: Notification, coordinate: Coordinate) {
    this.enabled = false;
    this.notification = notification;
    this.coordinate = coordinate;
    this.data = this.transform(coordinate);
  }

  public destroy(): void {

  }

  private transform(coordinate: Coordinate): string[] {
    return [];
  }

  public show(): void {
    if (!this.enabled) {
      return;
    }
  }

  public toggle(): void {
    this.enabled = !this.enabled;
  }
}
