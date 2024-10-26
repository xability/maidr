import {Command} from '../command/command';
import Constant from '../../util/constant';

export class ToggleHelpMenu implements Command {
  private enabled: boolean;
  private helpMenu: HTMLElement;
  constructor() {
    this.enabled = false;
    this.helpMenu = document.getElementById(Constant.HELP_MENU_ID)!;
  }
  public execute(): void {
    this.enabled = !this.enabled;
    this.toggleHelpMenu();
  }

  private toggleHelpMenu(): void {
    if (!this.helpMenu) {
      return;
    }
    if (this.enabled) {
      this.helpMenu.classList.remove(Constant.HIDDEN);
    } else {
      this.helpMenu.classList.add(Constant.HIDDEN);
    }
  }
}
