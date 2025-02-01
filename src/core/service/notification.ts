import { Constant } from "../../util/constant";
import { DisplayService } from "./display";

export class NotificationService {
  private readonly enabled: boolean;
  private readonly notificationDiv?: HTMLElement;

  public constructor(display: DisplayService) {
    if (!display.notificationDiv) {
      this.enabled = false;
      return;
    }

    this.notificationDiv = display.notificationDiv;
    this.enabled = true;
    this.notify(display.getInstruction(false));
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
