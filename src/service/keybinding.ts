import type { CommandContext } from '@command/command';
import type { Keys } from '@type/event';
import { CommandFactory } from '@command/factory';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';
import { Platform } from '@util/platform';
import hotkeys from 'hotkeys-js';

const BRAILLE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: `l`,

  // Autoplay
  AUTOPLAY_UPWARD: `${Platform.ctrl}+shift+up`,
  AUTOPLAY_DOWNWARD: `${Platform.ctrl}+shift+down`,
  AUTOPLAY_FORWARD: `${Platform.ctrl}+shift+right`,
  AUTOPLAY_BACKWARD: `${Platform.ctrl}+shift+left`,

  STOP_AUTOPLAY: `${Platform.ctrl}, up, down, left, right`,
  SPEED_UP_AUTOPLAY: `.`,
  SPEED_DOWN_AUTOPLAY: `,`,
  RESET_AUTOPLAY_SPEED: `/`,

  // Navigation
  MOVE_UP: `up`,
  MOVE_DOWN: `down`,
  MOVE_RIGHT: `right`,
  MOVE_LEFT: `left`,

  MOVE_TO_TOP_EXTREME: `${Platform.ctrl}+up`,
  MOVE_TO_BOTTOM_EXTREME: `${Platform.ctrl}+down`,
  MOVE_TO_LEFT_EXTREME: `${Platform.ctrl}+left`,
  MOVE_TO_RIGHT_EXTREME: `${Platform.ctrl}+right`,

  MOVE_TO_NEXT_TRACE: `pageup`,
  MOVE_TO_PREV_TRACE: `pagedown`,

  // Modes
  TOGGLE_BRAILLE: `b`,
  TOGGLE_TEXT: `t`,
  TOGGLE_AUDIO: `s`,
  TOGGLE_REVIEW: `r`,

  // Misc
  TOGGLE_HELP: `${Platform.ctrl}+/`,
  TOGGLE_CHAT: `shift+/`,
  TOGGLE_SETTINGS: `${Platform.ctrl}+,`,

  // Description
  DESCRIBE_POINT: `space`,
} as const;

const CHAT_KEYMAP = {
  // Misc
  TOGGLE_CHAT: `esc`,
} as const;

const FIGURE_LABEL_KEYMAP = {
  DEACTIVATE_FIGURE_LABEL_SCOPE: `escape`,

  // Description
  DESCRIBE_TITLE: `t`,
  DESCRIBE_SUBTITLE: `s`,
  DESCRIBE_CAPTION: `c`,

  // Misc
  TOGGLE_HELP: `${Platform.ctrl}+/`,
} as const;

const HELP_KEYMAP = {
  // Misc
  TOGGLE_HELP: `esc`,
} as const;

const SUBPLOT_KEYMAP = {
  ACTIVATE_FIGURE_LABEL_SCOPE: `l`,

  // Description
  DESCRIBE_TITLE: `t`,
  DESCRIBE_POINT: `space`,

  // Navigation
  MOVE_UP: `up`,
  MOVE_DOWN: `down`,
  MOVE_RIGHT: `right`,
  MOVE_LEFT: `left`,

  MOVE_TO_TOP_EXTREME: `${Platform.ctrl}+up`,
  MOVE_TO_BOTTOM_EXTREME: `${Platform.ctrl}+down`,
  MOVE_TO_LEFT_EXTREME: `${Platform.ctrl}+left`,
  MOVE_TO_RIGHT_EXTREME: `${Platform.ctrl}+right`,

  MOVE_TO_TRACE_CONTEXT: `${Platform.enter}`,

  // Misc
  TOGGLE_HELP: `${Platform.ctrl}+/`,
  TOGGLE_CHAT: `shift+/`,
  TOGGLE_SETTINGS: `${Platform.ctrl}+,`,
} as const;

const TRACE_LABEL_KEYMAP = {
  DEACTIVATE_TRACE_LABEL_SCOPE: `escape`,

  // Description
  DESCRIBE_X: `x`,
  DESCRIBE_Y: `y`,
  DESCRIBE_FILL: `f`,
  DESCRIBE_TITLE: `t`,
  DESCRIBE_SUBTITLE: `s`,
  DESCRIBE_CAPTION: `c`,

  // Misc
  TOGGLE_HELP: `${Platform.ctrl}+/`,
} as const;

const REVIEW_KEYMAP = {
  // Modes
  TOGGLE_BRAILLE: `b`,
  TOGGLE_REVIEW: `r`,

  // Allowed actions
  ALLOW_DEFAULT:
    `up, down, left, right,
    ${Platform.ctrl}+up, ${Platform.ctrl}+down,
    ${Platform.ctrl}+left, ${Platform.ctrl}+right,
    pageup, pagedown, home, end,
    tab, ${Platform.ctrl}+a, ${Platform.ctrl}+c`,
} as const;

const SETTINGS_KEYMAP = {
  // Misc
  TOGGLE_SETTINGS: `esc`,
} as const;

const TRACE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: `l`,

  // Autoplay
  AUTOPLAY_UPWARD: `${Platform.ctrl}+shift+up`,
  AUTOPLAY_DOWNWARD: `${Platform.ctrl}+shift+down`,
  AUTOPLAY_FORWARD: `${Platform.ctrl}+shift+right`,
  AUTOPLAY_BACKWARD: `${Platform.ctrl}+shift+left`,

  STOP_AUTOPLAY: `${Platform.ctrl}, up, down, left, right`,
  SPEED_UP_AUTOPLAY: `.`,
  SPEED_DOWN_AUTOPLAY: `,`,
  RESET_AUTOPLAY_SPEED: `/`,

  // Navigation
  MOVE_UP: `up`,
  MOVE_DOWN: `down`,
  MOVE_RIGHT: `right`,
  MOVE_LEFT: `left`,

  MOVE_TO_TOP_EXTREME: `${Platform.ctrl}+up`,
  MOVE_TO_BOTTOM_EXTREME: `${Platform.ctrl}+down`,
  MOVE_TO_LEFT_EXTREME: `${Platform.ctrl}+left`,
  MOVE_TO_RIGHT_EXTREME: `${Platform.ctrl}+right`,

  MOVE_TO_SUBPLOT_CONTEXT: `esc`,
  MOVE_TO_NEXT_TRACE: `pageup`,
  MOVE_TO_PREV_TRACE: `pagedown`,

  // Modes
  TOGGLE_BRAILLE: `b`,
  TOGGLE_TEXT: `t`,
  TOGGLE_AUDIO: `s`,
  TOGGLE_REVIEW: `r`,

  // Misc
  TOGGLE_HELP: `${Platform.ctrl}+/`,
  TOGGLE_CHAT: `shift+/`,
  TOGGLE_SETTINGS: `${Platform.ctrl}+,`,

  // Description
  DESCRIBE_POINT: `space`,
} as const;

export const SCOPED_KEYMAP = {
  [Scope.BRAILLE]: BRAILLE_KEYMAP,
  [Scope.CHAT]: CHAT_KEYMAP,
  [Scope.FIGURE_LABEL]: FIGURE_LABEL_KEYMAP,
  [Scope.HELP]: HELP_KEYMAP,
  [Scope.REVIEW]: REVIEW_KEYMAP,
  [Scope.SETTINGS]: SETTINGS_KEYMAP,
  [Scope.SUBPLOT]: SUBPLOT_KEYMAP,
  [Scope.TRACE]: TRACE_KEYMAP,
  [Scope.TRACE_LABEL]: TRACE_LABEL_KEYMAP,
} as const;

export type Keymap = {
  [K in Scope]: (typeof SCOPED_KEYMAP)[K];
};

export class KeybindingService {
  private readonly commandFactory: CommandFactory;

  public constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
  }

  public register(initialScope: Scope): void {
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
    for (const [scope, keymap] of Object.entries(SCOPED_KEYMAP) as [
      Scope,
      Keymap[Scope],
    ][]) {
      for (const [commandName, key] of Object.entries(keymap) as [
        Keys,
        string,
      ][]) {
        // https://github.com/jaywcjlove/hotkeys-js/issues/172
        // Need to remove once the issue is resolved.
        if (commandName === 'STOP_AUTOPLAY') {
          hotkeys('*', Scope.TRACE, (event: KeyboardEvent): void => {
            if (hotkeys.command || hotkeys.ctrl) {
              const command = this.commandFactory.create(commandName);
              command.execute(event);
            }
          });
        }

        hotkeys(key, { scope }, (event: KeyboardEvent): void => {
          if (commandName !== 'ALLOW_DEFAULT') {
            event.preventDefault();
            const command = this.commandFactory.create(commandName);
            command.execute(event);
          }
        });
      }
    }

    // Register command palette hotkeys
    hotkeys(`${Platform.ctrl}+shift+p`, (event: KeyboardEvent): void => {
      event.preventDefault();
      // Dispatch a custom event to open the command palette
      window.dispatchEvent(new CustomEvent('openCommandPalette'));
    });

    hotkeys.setScope(initialScope);
  }

  public unregister(): void {
    hotkeys.unbind();
  }
}
