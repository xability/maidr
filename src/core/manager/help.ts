import Constant from '../../util/constant';
import {Observer} from '../observer';

export default class HelpManager implements Observer {
  private enabled: boolean;
  private helpMenu?: HTMLElement;
  constructor(helpMenu?: HTMLElement) {
    this.enabled = false;
    this.helpMenu = helpMenu;
  }
  public toggle(): void {
    this.enabled = !this.enabled;
    this.update();
  }

  public update(): void {
    if (!this.helpMenu) {
      console.error('Help menu not found');
      return;
    }
    if (this.enabled) {
      this.helpMenu.classList.remove(Constant.HIDDEN);
    } else {
      this.helpMenu.classList.add(Constant.HIDDEN);
    }
  }
}
