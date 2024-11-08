import hotkeys from 'hotkeys-js';
import Constant from '../../util/constant';
import {CommandFactory} from '../command/factory';
import {CommandContext} from '../command/command';

export enum DefaultKey {
  ACTIVATE_LABEL_SCOPE = 'l',

  // Autoplay
  AUTOPLAY_UPWARD = 'command+shift+up, ctrl+shift+up',
  AUTOPLAY_DOWNWARD = 'command+shift+down, ctrl+shift+down',
  AUTOPLAY_FORWARD = 'command+shift+right, ctrl+shift+right',
  AUTOPLAY_BACKWARD = 'command+shift+left, ctrl+shift+left',
  STOP_AUTOPLAY = 'command, ctrl',
  SPEED_UP_AUTOPLAY = '.',
  SPEED_DOWN_AUTOPLAY = ',',
  RESET_AUTOPLAY_SPEED = '/',

  // Navigation
  MOVE_UP = 'up',
  MOVE_DOWN = 'down',
  MOVE_RIGHT = 'right',
  MOVE_LEFT = 'left',

  // BTS
  TOGGLE_BRAILLE = 'b',
  TOGGLE_TEXT = 't',
  TOGGLE_AUDIO = 's',

  // Description
  DESCRIBE_POINT = 'space',
}

export enum LabelKey {
  ACTIVATE_DEFAULT_SCOPE = 'esc',

  // Description
  DESCRIBE_X = 'x',
  DESCRIBE_Y = 'y',
  DESCRIBE_TITLE = 't',
  DESCRIBE_SUBTITLE = 's',
  DESCRIBE_CAPTION = 'c',
}

const scopedKeymap = {
  DEFAULT: DefaultKey,
  LABEL: LabelKey,
} as const;

export type Scope = keyof typeof scopedKeymap;
export type Keymap = {
  [K in Scope]: (typeof scopedKeymap)[K];
};
export type Keys = keyof Keymap[Scope];

export default class KeymapManager {
  private readonly commandFactory: CommandFactory;

  constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
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
    for (const [scope, keymap] of Object.entries(scopedKeymap) as [
      Scope,
      Keymap[Scope],
    ][]) {
      for (const [commandName, key] of Object.entries(keymap) as [
        Keys,
        string,
      ][]) {
        const command = this.commandFactory.create(commandName);

        // https://github.com/jaywcjlove/hotkeys-js/issues/172
        // Need to remove once the issue is resolved.
        if (commandName === 'STOP_AUTOPLAY') {
          hotkeys('*', 'DEFAULT', (event: KeyboardEvent): void => {
            if (hotkeys.command || hotkeys.ctrl) {
              command.execute(event);
            }
          });
        }

        hotkeys(key, {scope: scope}, (event: KeyboardEvent): void => {
          event.preventDefault();
          command.execute(event);
        });
      }
    }

    // Set the initial scope.
    hotkeys.setScope('DEFAULT');
  }

  public unregister(): void {
    hotkeys.unbind();
  }
}
