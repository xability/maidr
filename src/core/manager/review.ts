import hotkeys from 'hotkeys-js';
import DisplayManager from './display';
import {EventType} from '../../index';
import NotificationManager from './notification';
import {Observer} from '../interface';
import {PlotState} from '../../model/state';
import TextManager from './text';

export default class ReviewManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;
  private readonly text: TextManager;

  private readonly reviewInput?: HTMLInputElement;
  private readonly reviewKeyHandler?: (event: KeyboardEvent) => void;

  constructor(
    notification: NotificationManager,
    display: DisplayManager,
    text: TextManager,
    state: PlotState
  ) {
    this.enabled = false;

    this.notification = notification;
    this.display = display;
    this.text = text;

    if (!display.reviewInput) {
      return;
    }

    this.reviewKeyHandler = (e: KeyboardEvent) => {
      const isNavigationKey =
        e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isModifierKey = isCtrlKey || e.shiftKey;

      if (
        !isNavigationKey &&
        !(isModifierKey && isNavigationKey) &&
        !(isCtrlKey && e.key === 'a') &&
        !(isCtrlKey && e.key === 'c') &&
        !(e.key === 'Tab')
      ) {
        e.preventDefault();
      }
    };
    this.reviewInput = display.reviewInput;
    this.reviewInput.addEventListener(
      EventType.KEY_DOWN,
      this.reviewKeyHandler
    );

    this.reviewInput.value = this.text.format(state);
  }

  public destroy(): void {
    if (this.reviewInput && this.reviewKeyHandler) {
      this.reviewInput.removeEventListener(
        EventType.KEY_DOWN,
        this.reviewKeyHandler
      );
    }
  }

  public update(state: PlotState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    this.reviewInput!.value = this.text.format(state);
  }

  public toggle(): void {
    if (!this.reviewInput) {
      return;
    }

    if (this.enabled) {
      this.enabled = false;
      hotkeys.setScope('DEFAULT');
    } else {
      this.enabled = true;
      hotkeys.setScope('REVIEW');
    }
    this.display.toggleInputFocus(this.reviewInput);

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
