import hotkeys from 'hotkeys-js';
import Action from './action';
import Command from './command';

enum Keymap {
  // Navigation
  MOVE_UP = 'up',
  MOVE_DOWN = 'down',
  MOVE_RIGHT = 'right',
  MOVE_LEFT = 'left',

  // BTS
  TOGGLE_BRAILLE = 'b',
  TOGGLE_TEXT = 't',
  TOGGLE_SOUND = 's',

  // Plot Actions
  REPEAT_POINT = 'space',
  SHOW_X_LABEL = 'l+x',
  SHOW_Y_LABEL = 'l+y',
}

export default class KeyBinding {
  private readonly action: Action;
  private readonly bindings: Map<string, Command>;

  constructor(action: Action) {
    this.action = action;
    this.bindings = this.createBindings();
  }

  private createBindings(): Map<string, Command> {
    const bindings = new Map<string, Command>();

    for (const key of Object.values(Keymap)) {
      const action = this.getAction(key);
      bindings.set(key, new Command(action));
    }

    return bindings;
  }

  private getAction(key: string): () => void {
    switch (key) {
      case Keymap.MOVE_UP:
        return () => this.action.moveUp();
      case Keymap.MOVE_DOWN:
        return () => this.action.moveDown();
      case Keymap.MOVE_RIGHT:
        return () => this.action.moveRight();
      case Keymap.MOVE_LEFT:
        return () => this.action.moveLeft();

      case Keymap.TOGGLE_BRAILLE:
        return () => this.action.toggleBraille();
      case Keymap.TOGGLE_TEXT:
        return () => this.action.toggleText();
      case Keymap.TOGGLE_SOUND:
        return () => this.action.toggleSound();

      case Keymap.REPEAT_POINT:
        return () => this.action.repeatPoint();
      case Keymap.SHOW_X_LABEL:
        return () => this.action.showXLabel();
      case Keymap.SHOW_Y_LABEL:
        return () => this.action.showYLabel();

      default:
        throw new Error(`Unsupported key: ${key}`);
    }
  }

  public register(): void {
    for (const [key, command] of this.bindings.entries()) {
      hotkeys(key, (event: KeyboardEvent): void => {
        event.preventDefault();
        command.execute();
      });
    }
  }

  public unregister(): void {
    this.bindings.clear();
    hotkeys.unbind();
  }
}
