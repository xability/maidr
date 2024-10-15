import hotkeys from 'hotkeys-js';
import Constant from '../util/constant';
import {Command} from './command/command';
import TextManager from './manager/text';

abstract class KeyScope implements Command {
  protected readonly text: TextManager;
  protected constructor(text: TextManager) {
    this.text = text;
  }
  public abstract execute(event?: Event): void;
}
export class DefaultKeyScope extends KeyScope {
  constructor(text: TextManager) {
    super(text);
  }
  public execute(): void {
    console.log('In DefaultKeyScope - Current scope is ', hotkeys.getScope());
    hotkeys.setScope(Constant.HOTKEYS_SCOPE_DEFAULT);
    if (hotkeys.getScope() === Constant.HOTKEYS_SCOPE_DEFAULT) {
      const message = 'Scope set to ' + Constant.HOTKEYS_SCOPE_DEFAULT;
      this.text.update(message);
      console.log('After Change Scope set to ', hotkeys.getScope());
    } else {
      const message = 'Scope not set to ' + Constant.HOTKEYS_SCOPE_DEFAULT;
      this.text.update(message);
    }
  }
}

export class LabelKeyScope extends KeyScope {
  constructor(text: TextManager) {
    super(text);
  }
  public execute(): void {
    console.log('In LabelKeyScope - Current scope is ', hotkeys.getScope());
    hotkeys.setScope(Constant.HOTKEYS_SCOPE_LABEL);
    if (hotkeys.getScope() === Constant.HOTKEYS_SCOPE_LABEL) {
      const message = 'Scope set to ' + Constant.HOTKEYS_SCOPE_LABEL;
      console.log('After Change Scope set to ', hotkeys.getScope());
      this.text.update(message);
    } else {
      const message = 'Scope not set to ' + Constant.HOTKEYS_SCOPE_LABEL;
      this.text.update(message);
    }
  }
}
