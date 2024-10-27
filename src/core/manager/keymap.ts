import hotkeys from 'hotkeys-js';
import {CommandContext} from '../command/command';
import Constant from '../../util/constant';
import {CommandFactory} from "../command/factory";

export enum Scope {
  DEFAULT = 'default',
  LABEL = 'label',
}

export type Keymap =
  typeof DefaultKey |
  typeof LabelKey;

abstract class ScopeFactory {
  public static getKeymap(scopeName: string): Keymap {
    switch (scopeName) {
      case Scope.LABEL: return LabelKey;

      case Scope.DEFAULT: return DefaultKey;

      default:
        throw new Error(`Invalid scope: ${scopeName}`);
    }
  }
}

export default class KeymapManager {
  private readonly scopedBindings: Map<Scope, Keymap>;
  private readonly commandFactory: CommandFactory;

  constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
    this.scopedBindings = new Map<Scope, Keymap>;
    for (const scopeName of Object.values(Scope)) {
      this.scopedBindings.set(scopeName as Scope, ScopeFactory.getKeymap(scopeName));
    }
  }

  public register(): void {
    hotkeys.filter = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Allow keybindings only for MAIDR braille input.
      if (target.isContentEditable) {
        return target.id.startsWith(Constant.BRAILLE_INPUT);
      }

      // Allow keybindings for all other non-editable elements.
      return true;
    };

    // Register all bindings.
    for (const [scope, keymap] of this.scopedBindings.entries()) {
      for (const [commandName, key] of Object.entries(keymap) as [keyof Keymap, string][]) {
        const command = this.commandFactory.create(commandName);
        hotkeys(
          key,
          { scope: scope },
          (event: KeyboardEvent): void => {
            event.preventDefault();
            command.execute(event);
          }
        );
      }
    }

    // Set the initial scope.
    hotkeys.setScope(Scope.DEFAULT);
  }

  public unregister(): void {
    this.scopedBindings.clear();
    hotkeys.unbind();
  }
}

export enum DefaultKey {
  ACTIVATE_LABEL_SCOPE = 'l',

  MOVE_UP = 'up',
  MOVE_DOWN = 'down',
  MOVE_RIGHT = 'right',
  MOVE_LEFT = 'left',

  TOGGLE_BRAILLE = 'b',
  TOGGLE_TEXT = 't',
  TOGGLE_AUDIO = 's',
}

export enum LabelKey {
  // BTS
  ACTIVATE_DEFAULT_SCOPE = 'esc',

  // Description
  DESCRIBE_X = 'x',
  DESCRIBE_Y = 'y',
  DESCRIBE_POINT = 'space',
}
