import DisplayManager from './display';
import NotificationManager from './notification';
import TextManager from './text';
import {Observer} from '../interface';
import {PlotState} from '../../model/state';

export default class ReviewManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;
  private readonly text: TextManager;

  private readonly reviewInput?: HTMLInputElement;

  constructor(
    notification: NotificationManager,
    display: DisplayManager,
    text: TextManager
  ) {
    this.enabled = false;

    this.notification = notification;
    this.display = display;
    this.text = text;

    if (!display.reviewInput) {
      return;
    }

    this.reviewInput = display.reviewInput;
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    this.reviewInput!.value = 'Test';
  }

  public toggle(): void {
    if (!this.reviewInput) {
      return;
    }

    this.enabled = !this.enabled;
    this.display.toggleInputFocus(this.reviewInput);

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
