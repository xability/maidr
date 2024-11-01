import Constant from '../../util/constant';
import {Observer} from '../observer';

export default class HelpManager implements Observer {
  private enabled: boolean;
  private helpMenu?: HTMLElement;
  constructor(helpMenu?: HTMLElement) {
    this.enabled = false;
    this.helpMenu = helpMenu;
    console.log('Help menu is now ' + (this.enabled ? 'enabled' : 'disabled'));
  }
  public toggle(): void {
    this.enabled = !this.enabled;
    console.log('Help menu is now ' + (this.enabled ? 'enabled' : 'disabled'));
    this.update();
  }

  public update(): void {
    if (!this.helpMenu) {
      console.error('Help menu not found');
      return;
    }
    if (this.enabled) {
      console.log('Showing help menu');
      this.helpMenu.classList.remove(Constant.HIDDEN);
    } else {
      console.log('Hiding help menu');
      this.helpMenu.classList.add(Constant.HIDDEN);
    }
  }
}
