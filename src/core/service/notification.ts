import {Constant} from '../../util/constant';

export class NotificationService {
  private readonly enabled: boolean;
  private readonly notificationDiv?: HTMLElement;

  public constructor(notificationDiv?: HTMLElement) {
    if (!notificationDiv) {
      this.enabled = false;
      return;
    }

    this.notificationDiv = notificationDiv;
    this.enabled = true;
  }

  public notify(message: string): void {
    if (!this.enabled || !message) {
      return;
    }

    const paragraph = document.createElement(Constant.P);
    paragraph.innerHTML = message;

    this.notificationDiv!.innerHTML = Constant.EMPTY;
    this.notificationDiv!.append(paragraph);
  }
}
