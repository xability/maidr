import NotificationManager from './notification';
import {BrailleState} from '../plot/state';
import Constant from '../util/constant';

export default class BrailleManager {
  private enabled: boolean;
  private readonly notification: NotificationManager;
  public readonly brailleDiv: HTMLElement;
  private brailleInput: HTMLElement;

  constructor(notification: NotificationManager) {
    this.enabled = false;
    this.notification = notification;
    this.brailleInput = this.createBrailleInput([]);
    this.brailleDiv = this.createBrailleContainer();
  }

  private createBrailleInput(brailleArray: string[]): HTMLElement {
    const brailleInput = document.createElement(Constant.DIV);
    brailleInput.id = Constant.BRAILLE_INPUT_ID;
    brailleInput.className = Constant.BRAILLE_INPUT_CLASS;
    const brailleAs = brailleArray.map((char, i) => {
      const brailleA = document.createElement(Constant.A);
      brailleA.id = `${Constant.BRAILLE_POINT_ID}-${i}`;
      brailleA.textContent = char;
      return brailleA;
    });
    brailleInput.ariaBrailleRoleDescription = '';
    brailleInput.append(...brailleAs);
    return brailleInput;
  }

  private createBrailleContainer(): HTMLElement {
    const brailleDiv = document.createElement(Constant.DIV);
    brailleDiv.id = Constant.BRAILLE_CONTAINER_ID;
    if (this.enabled) {
      brailleDiv.appendChild(this.brailleInput);
    }
    return brailleDiv;
  }

  public destroy(): void {
    this.brailleDiv.remove();
  }

  public show(state: BrailleState): void {
    const prevElement = document.getElementById(
      Constant.BRAILLE_POINT_ID + '-' + (state.index - 1).toString()
    );
    const currentElement = document.getElementById(
      Constant.BRAILLE_POINT_ID + '-' + state.index.toString()
    );
    const nextElement = document.getElementById(
      Constant.BRAILLE_POINT_ID + '-' + (state.index + 1).toString()
    );
    prevElement?.removeAttribute(Constant.STYLE);
    currentElement?.setAttribute(
      Constant.STYLE,
      Constant.BACKGROUND_COLOR + ': ' + Constant.BRAILLE_POINT_BACKGROUND_COLOR
    );
    nextElement?.removeAttribute(Constant.STYLE);
  }

  public toggle(state: BrailleState): void {
    this.enabled = !this.enabled;
    if (!this.enabled && this.brailleDiv) {
      this.brailleInput.remove();
    } else {
      this.brailleInput = this.createBrailleInput(state.brailleArray ?? []);
      this.brailleDiv.appendChild(this.brailleInput);
    }
    this.notification.notify('Braille is: ' + (this.enabled ? 'on' : 'off'));
  }
}
