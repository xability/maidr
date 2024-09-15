import Constant from '../util/constant';

export default class Notification {
  public readonly notificationDiv!: HTMLElement;

  constructor() {
    this.notificationDiv = document.createElement(Constant.DIV);
    this.notificationDiv.id = Constant.NOTIFICATION_CONTAINER_ID;
    this.notificationDiv.classList.add(Constant.MB_3);
    this.notificationDiv.setAttribute(Constant.ARIA_LIVE, Constant.ASSERTIVE);
    this.notificationDiv.setAttribute(Constant.ARIA_ATOMIC, Constant.TRUE);
  }

  public destroy(): void {
    this.notificationDiv.remove();
  }

  public notify(message: string): void {
    if (!message) {
      return;
    }

    const paragraph = document.createElement(Constant.P);
    paragraph.innerHTML = message;

    this.notificationDiv.innerHTML = Constant.EMPTY;
    this.notificationDiv.append(paragraph);
  }
}
