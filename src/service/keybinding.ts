import type { CommandContext } from '@command/command';
import { CommandFactory } from '@command/factory';
import { Constant } from '@util/constant';
import hotkeys from 'hotkeys-js';

enum DefaultKey {
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

  MOVE_TO_TOP_EXTREME = 'command+up, ctrl+up',
  MOVE_TO_BOTTOM_EXTREME = 'command+down, ctrl+down',
  MOVE_TO_LEFT_EXTREME = 'command+left, ctrl+left',
  MOVE_TO_RIGHT_EXTREME = 'command+right, ctrl+right',

  // Modes
  TOGGLE_BRAILLE = 'b',
  TOGGLE_TEXT = 't',
  TOGGLE_AUDIO = 's',
  TOGGLE_REVIEW = 'r',

  // Description
  DESCRIBE_POINT = 'space',
}

enum LabelKey {
  ACTIVATE_DEFAULT_SCOPE = 'esc',

  // Description
  DESCRIBE_X = 'x',
  DESCRIBE_Y = 'y',
  DESCRIBE_TITLE = 't',
  DESCRIBE_SUBTITLE = 's',
  DESCRIBE_CAPTION = 'c',
}

enum ReviewKey {
  // Modes
  TOGGLE_BRAILLE = 'b',
  TOGGLE_REVIEW = 'r',
}

export enum Scope {
  DEFAULT = 'DEFAULT',
  LABEL = 'LABEL',
  REVIEW = 'REVIEW',
}

const scopedKeymap = {
  [Scope.DEFAULT]: DefaultKey,
  [Scope.LABEL]: LabelKey,
  [Scope.REVIEW]: ReviewKey,
} as const;

type Keymap = {
  [K in Scope]: (typeof scopedKeymap)[K];
};
export type Keys = keyof Keymap[Scope];

export class KeybindingService {
  private readonly commandFactory: CommandFactory;

  public constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
  }

  public register(): void {
    hotkeys.filter = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName.toLowerCase() === Constant.INPUT) {
        // Allow keybindings for MAIDR review input.
        return target.id.startsWith(Constant.REVIEW_INPUT);
      } else if (target.tagName.toLowerCase() === Constant.TEXT_AREA) {
        // Allow keybindings only for MAIDR braille text area.
        return target.id.startsWith(Constant.BRAILLE_TEXT_AREA);
      } else {
        // Allow keybindings for all other non-editable elements.
        return true;
      }
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

        hotkeys(key, { scope }, (event: KeyboardEvent): void => {
          event.preventDefault();
          command.execute(event);
        });
      }
    }

    // Set the initial scope.
    hotkeys.setScope(Scope.DEFAULT);
  }

  public unregister(): void {
    hotkeys.unbind();
  }
}
