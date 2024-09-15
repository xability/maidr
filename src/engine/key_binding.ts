import hotkeys from "hotkeys-js";
import {
  Command,
  MoveDownCommand,
  MoveLeftCommand,
  MoveRightCommand,
  MoveUpCommand, ToggleBrailleCommand,
  ToggleSoundCommand,
  ToggleTextCommand
} from "./command";
import Action from "./Action";

enum Keymap {
  // Navigation
  MOVE_UP = 'up',
  MOVE_DOWN = 'down',
  MOVE_RIGHT = 'right',
  MOVE_LEFT = 'left',

  // BTS
  TOGGLE_BRAILLE = "b",
  TOGGLE_TEXT = 't',
  TOGGLE_SOUND = 's',
}

export default class KeyBinding {
  private bindings: Map<string, Command>;

  private readonly action: Action;

  constructor(action: Action) {
    this.action = action;

    this.bindings = this.createBindings();
  }

  private createBindings(): Map<string, Command> {
    const bindings = new Map<string, Command>();

    for (const key of Object.values(Keymap)) {
      const command = this.createCommand(key);
      this.bindings.set(key, command);
    }

    return bindings;
  }

  private createCommand(key: string): Command {
    switch (key) {
      case Keymap.MOVE_UP:
        return new MoveUpCommand(this.action);
      case Keymap.MOVE_DOWN:
        return new MoveDownCommand(this.action);
      case Keymap.MOVE_RIGHT:
        return new MoveRightCommand(this.action);
      case Keymap.MOVE_LEFT:
        return new MoveLeftCommand(this.action);

      case Keymap.TOGGLE_BRAILLE:
        return new ToggleBrailleCommand(this.action);
      case Keymap.TOGGLE_TEXT:
        return new ToggleTextCommand(this.action);
      case Keymap.TOGGLE_SOUND:
        return new ToggleSoundCommand(this.action);

      default:
        throw new Error(`Unsupported key: ${key}`);
    }
  }

  public register(): void {
    for (const [key, command] of this.bindings.entries()) {
      hotkeys(key, (event: KeyboardEvent): void => {
        event.preventDefault();
        command.execute(event);
      });
    }
  }

  public unregister(): void {
    hotkeys.unbind();
  }
}
