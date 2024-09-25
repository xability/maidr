import {BrailleState} from '../../plot/state';
import Constant from '../../util/constant';
import NotificationManager from './notification';

export default class BrailleManager {
  private enabled: boolean;
  private readonly notification: NotificationManager;

  private readonly brailleDiv?: HTMLElement;
  private readonly brailleInput?: HTMLElement;

  constructor(
    notification: NotificationManager,
    state: BrailleState,
    brailleDiv?: HTMLElement,
    brailleInput?: HTMLElement
  ) {
    this.enabled = false;
    this.notification = notification;

    if (!brailleDiv || !brailleInput) {
      return;
    }

    this.brailleDiv = brailleDiv;
    this.brailleInput = brailleInput;

    this.initBraille(state);
  }

  private initBraille(state: BrailleState): void {
    const anchorElements = this.getAnchorElements(state.braille);
    this.brailleInput!.append(...anchorElements);
  }

  public show(state: BrailleState): void {
    if (!this.enabled) {
      return;
    }

    this.brailleInput!.innerHTML = Constant.EMPTY;

    const anchorElements = this.getAnchorElements(state.braille);
    this.brailleInput!.append(...anchorElements);

    const currentElement = document.getElementById(
      Constant.BRAILLE_POINT_ID + '-' + state.index
    );
    currentElement!.setAttribute(
      Constant.STYLE,
      [
        Constant.BACKGROUND_COLOR,
        Constant.COLON,
        Constant.BRAILLE_POINT_BACKGROUND_COLOR,
      ].join(Constant.EMPTY)
    );
  }

  private getAnchorElements(brailleArray: string[]): HTMLElement[] {
    return brailleArray.map((char, i) => {
      const brailleA = document.createElement(Constant.A);
      brailleA.id = `${Constant.BRAILLE_POINT_ID}-${i}`;
      brailleA.textContent = char;
      return brailleA;
    });
  }

  public toggle(): void {
    this.enabled = !this.enabled;

    if (this.enabled) {
      this.brailleDiv?.classList.remove(Constant.HIDDEN);
    } else {
      this.brailleDiv?.classList.add(Constant.HIDDEN);
    }

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
