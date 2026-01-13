import type { CommandContext } from '@command/command';
import type { DisplayService } from '@service/display';
import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { Keys } from '@type/event';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import { CommandFactory } from '@command/factory';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';
import { Platform } from '@util/platform';
import hotkeys from 'hotkeys-js';

/**
 * Keymap configuration for braille mode interactions.
 */
const BRAILLE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: `l`,

  // Mark and recall (scope activation)
  ACTIVATE_MARK_SET_SCOPE: `shift+m`,
  ACTIVATE_MARK_PLAY_SCOPE: `m`,
  ACTIVATE_MARK_JUMP_SCOPE: `j`,

  // Mark and recall (chord shortcuts for simultaneous key press)
  // Note: Jump chords (j+#) removed - now opens dialog
  SET_MARK_0: `shift+m+0`,
  SET_MARK_1: `shift+m+1`,
  SET_MARK_2: `shift+m+2`,
  SET_MARK_3: `shift+m+3`,
  SET_MARK_4: `shift+m+4`,
  SET_MARK_5: `shift+m+5`,
  SET_MARK_6: `shift+m+6`,
  SET_MARK_7: `shift+m+7`,
  SET_MARK_8: `shift+m+8`,
  SET_MARK_9: `shift+m+9`,
  PLAY_MARK_0: `m+0`,
  PLAY_MARK_1: `m+1`,
  PLAY_MARK_2: `m+2`,
  PLAY_MARK_3: `m+3`,
  PLAY_MARK_4: `m+4`,
  PLAY_MARK_5: `m+5`,
  PLAY_MARK_6: `m+6`,
  PLAY_MARK_7: `m+7`,
  PLAY_MARK_8: `m+8`,
  PLAY_MARK_9: `m+9`,

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

  // rotor functionality
  ROTOR_NEXT_NAV: `${Platform.alt}+shift+up`,
  ROTOR_PREV_NAV: `${Platform.alt}+shift+down`,

} as const;

/**
 * Keymap configuration for chat interface interactions.
 */
const CHAT_KEYMAP = {
  // Misc
  TOGGLE_CHAT: `esc`,
} as const;

/**
 * Keymap configuration for figure label scope interactions.
 */
const FIGURE_LABEL_KEYMAP = {
  DEACTIVATE_FIGURE_LABEL_SCOPE: `escape`,

  // Description
  DESCRIBE_TITLE: `t`,
  DESCRIBE_SUBTITLE: `s`,
  DESCRIBE_CAPTION: `c`,

  // Misc
  TOGGLE_HELP: `${Platform.ctrl}+/`,
} as const;

/**
 * Keymap configuration for help menu interactions.
 */
const HELP_KEYMAP = {
  // Misc
  TOGGLE_HELP: `esc`,
} as const;

/**
 * Keymap configuration for subplot scope interactions.
 */
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

/**
 * Keymap configuration for trace label scope interactions.
 */
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

/**
 * Keymap configuration for review mode interactions.
 */
const REVIEW_KEYMAP = {
  // Modes
  TOGGLE_BRAILLE: `b`,
  TOGGLE_REVIEW: `r`,

  // Allowed actions
  ALLOW_DEFAULT: `up, down, left, right,
    ${Platform.ctrl}+up, ${Platform.ctrl}+down,
    ${Platform.ctrl}+left, ${Platform.ctrl}+right,
    pageup, pagedown, home, end,
    tab, ${Platform.ctrl}+a, ${Platform.ctrl}+c`,
} as const;

/**
 * Keymap configuration for settings interface interactions.
 */
const SETTINGS_KEYMAP = {
  // Misc
  TOGGLE_SETTINGS: `esc`,
} as const;

/**
 * Keymap configuration for trace scope interactions and navigation.
 */
const TRACE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: `l`,

  // Mark and recall (scope activation)
  ACTIVATE_MARK_SET_SCOPE: `shift+m`,
  ACTIVATE_MARK_PLAY_SCOPE: `m`,
  ACTIVATE_MARK_JUMP_SCOPE: `j`,

  // Mark and recall (chord shortcuts for simultaneous key press)
  // Note: Jump chords (j+#) removed - now opens dialog
  SET_MARK_0: `shift+m+0`,
  SET_MARK_1: `shift+m+1`,
  SET_MARK_2: `shift+m+2`,
  SET_MARK_3: `shift+m+3`,
  SET_MARK_4: `shift+m+4`,
  SET_MARK_5: `shift+m+5`,
  SET_MARK_6: `shift+m+6`,
  SET_MARK_7: `shift+m+7`,
  SET_MARK_8: `shift+m+8`,
  SET_MARK_9: `shift+m+9`,
  PLAY_MARK_0: `m+0`,
  PLAY_MARK_1: `m+1`,
  PLAY_MARK_2: `m+2`,
  PLAY_MARK_3: `m+3`,
  PLAY_MARK_4: `m+4`,
  PLAY_MARK_5: `m+5`,
  PLAY_MARK_6: `m+6`,
  PLAY_MARK_7: `m+7`,
  PLAY_MARK_8: `m+8`,
  PLAY_MARK_9: `m+9`,

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
  TOGGLE_COMMAND_PALETTE: `${Platform.ctrl}+shift+p`,
  TOGGLE_SETTINGS: `${Platform.ctrl}+,`,

  // Description
  DESCRIBE_POINT: `space`,

  // Go To functionality
  GO_TO_EXTREMA_TOGGLE: `g`,

  // Go to point
  MOVE_TO_INDEX: `click`,

  // rotor functionality
  ROTOR_NEXT_NAV: `${Platform.alt}+shift+up`,
  ROTOR_PREV_NAV: `${Platform.alt}+shift+down`,
} as const;

/**
 * Keymap configuration for extrema navigation modal interactions.
 */
const GO_TO_EXTREMA_KEYMAP = {
  // Navigation within the modal
  GO_TO_EXTREMA_MOVE_UP: 'up',
  GO_TO_EXTREMA_MOVE_DOWN: 'down',
  GO_TO_EXTREMA_SELECT: 'enter',
  GO_TO_EXTREMA_CLOSE: 'esc',
  GO_TO_EXTREMA_TOGGLE: 'g',
} as const;

/**
 * Keymap configuration for command palette modal interactions.
 */
const COMMAND_PALETTE_KEYMAP = {
  // Navigation within the modal
  COMMAND_PALETTE_MOVE_UP: 'up',
  COMMAND_PALETTE_MOVE_DOWN: 'down',
  COMMAND_PALETTE_SELECT: 'enter',
  COMMAND_PALETTE_CLOSE: 'esc',
} as const;

/**
 * Keymap configuration for mark set scope interactions (setting marks).
 */
const MARK_SET_KEYMAP = {
  DEACTIVATE_MARK_SCOPE: 'escape',
  SET_MARK_0: '0',
  SET_MARK_1: '1',
  SET_MARK_2: '2',
  SET_MARK_3: '3',
  SET_MARK_4: '4',
  SET_MARK_5: '5',
  SET_MARK_6: '6',
  SET_MARK_7: '7',
  SET_MARK_8: '8',
  SET_MARK_9: '9',
  // Catch chord overlaps (user still holding shift+m when pressing number) - just deactivate
  DEACTIVATE_MARK_SCOPE_CHORD_0: 'shift+m+0',
  DEACTIVATE_MARK_SCOPE_CHORD_1: 'shift+m+1',
  DEACTIVATE_MARK_SCOPE_CHORD_2: 'shift+m+2',
  DEACTIVATE_MARK_SCOPE_CHORD_3: 'shift+m+3',
  DEACTIVATE_MARK_SCOPE_CHORD_4: 'shift+m+4',
  DEACTIVATE_MARK_SCOPE_CHORD_5: 'shift+m+5',
  DEACTIVATE_MARK_SCOPE_CHORD_6: 'shift+m+6',
  DEACTIVATE_MARK_SCOPE_CHORD_7: 'shift+m+7',
  DEACTIVATE_MARK_SCOPE_CHORD_8: 'shift+m+8',
  DEACTIVATE_MARK_SCOPE_CHORD_9: 'shift+m+9',
  TOGGLE_HELP: `${Platform.ctrl}+/`,
} as const;

/**
 * Keymap configuration for mark play scope interactions (describing marks).
 */
const MARK_PLAY_KEYMAP = {
  DEACTIVATE_MARK_SCOPE: 'escape',
  PLAY_MARK_0: '0',
  PLAY_MARK_1: '1',
  PLAY_MARK_2: '2',
  PLAY_MARK_3: '3',
  PLAY_MARK_4: '4',
  PLAY_MARK_5: '5',
  PLAY_MARK_6: '6',
  PLAY_MARK_7: '7',
  PLAY_MARK_8: '8',
  PLAY_MARK_9: '9',
  // Catch chord overlaps (user still holding m when pressing number) - just deactivate
  DEACTIVATE_MARK_SCOPE_CHORD_0: 'm+0',
  DEACTIVATE_MARK_SCOPE_CHORD_1: 'm+1',
  DEACTIVATE_MARK_SCOPE_CHORD_2: 'm+2',
  DEACTIVATE_MARK_SCOPE_CHORD_3: 'm+3',
  DEACTIVATE_MARK_SCOPE_CHORD_4: 'm+4',
  DEACTIVATE_MARK_SCOPE_CHORD_5: 'm+5',
  DEACTIVATE_MARK_SCOPE_CHORD_6: 'm+6',
  DEACTIVATE_MARK_SCOPE_CHORD_7: 'm+7',
  DEACTIVATE_MARK_SCOPE_CHORD_8: 'm+8',
  DEACTIVATE_MARK_SCOPE_CHORD_9: 'm+9',
  TOGGLE_HELP: `${Platform.ctrl}+/`,
} as const;

/**
 * Keymap configuration for mark jump dialog interactions.
 * Now operates as a dialog with list navigation.
 */
const MARK_JUMP_KEYMAP = {
  // Dialog navigation
  JUMP_TO_MARK_MOVE_UP: 'up',
  JUMP_TO_MARK_MOVE_DOWN: 'down',
  JUMP_TO_MARK_SELECT: 'enter',
  JUMP_TO_MARK_CLOSE: 'esc',

  // Direct slot jumping via number keys
  JUMP_TO_SLOT_0: '0',
  JUMP_TO_SLOT_1: '1',
  JUMP_TO_SLOT_2: '2',
  JUMP_TO_SLOT_3: '3',
  JUMP_TO_SLOT_4: '4',
  JUMP_TO_SLOT_5: '5',
  JUMP_TO_SLOT_6: '6',
  JUMP_TO_SLOT_7: '7',
  JUMP_TO_SLOT_8: '8',
  JUMP_TO_SLOT_9: '9',

  TOGGLE_HELP: `${Platform.ctrl}+/`,
} as const;

/**
 * Maps each application scope to its corresponding keymap configuration.
 */
export const SCOPED_KEYMAP = {
  [Scope.BRAILLE]: BRAILLE_KEYMAP,
  [Scope.CHAT]: CHAT_KEYMAP,
  [Scope.COMMAND_PALETTE]: COMMAND_PALETTE_KEYMAP,
  [Scope.FIGURE_LABEL]: FIGURE_LABEL_KEYMAP,
  [Scope.GO_TO_EXTREMA]: GO_TO_EXTREMA_KEYMAP,
  [Scope.HELP]: HELP_KEYMAP,
  [Scope.MARK_JUMP]: MARK_JUMP_KEYMAP,
  [Scope.MARK_PLAY]: MARK_PLAY_KEYMAP,
  [Scope.MARK_SET]: MARK_SET_KEYMAP,
  [Scope.REVIEW]: REVIEW_KEYMAP,
  [Scope.SETTINGS]: SETTINGS_KEYMAP,
  [Scope.SUBPLOT]: SUBPLOT_KEYMAP,
  [Scope.TRACE]: TRACE_KEYMAP,
  [Scope.TRACE_LABEL]: TRACE_LABEL_KEYMAP,
} as const;

/**
 * Type representing the complete keymap structure for all scopes.
 */
export type Keymap = {
  [K in Scope]: (typeof SCOPED_KEYMAP)[K];
};

/**
 * Service for registering and managing keyboard bindings across application scopes.
 */
export class KeybindingService {
  private readonly commandFactory: CommandFactory;

  /**
   * Creates a new KeybindingService instance with command factory.
   * @param commandContext - The context for creating and executing commands
   */
  public constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
  }

  /**
   * Registers all keyboard bindings and sets the initial scope.
   * @param initialScope - The initial application scope to activate
   */
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
      for (const [commandName, key] of Object.entries(keymap as Record<string, string>) as [
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

    hotkeys.setScope(initialScope);
  }

  /**
   * Unregisters all keyboard bindings.
   */
  public unregister(): void {
    hotkeys.unbind();
  }
}

/**
 * Service for managing mouse interactions with plot elements based on hover settings.
 */
export class Mousebindingservice implements Observer<Settings>, Disposable {
  private mouseListener!: (event: MouseEvent) => void;

  private readonly commandContext: CommandContext;
  private hoverMode: string = 'none';
  private readonly plot: HTMLElement;
  private readonly settingsService: SettingsService;

  /**
   * Creates a new Mousebindingservice instance and registers as a settings observer.
   * @param commandContext - The command context for executing navigation commands
   * @param settingsService - The settings service to observe for hover mode changes
   * @param displayService - The display service providing the plot element
   */
  public constructor(
    commandContext: CommandContext,
    settingsService: SettingsService,
    displayService: DisplayService,
  ) {
    this.commandContext = commandContext;
    this.settingsService = settingsService;
    const initialSettings = settingsService.loadSettings();
    this.hoverMode = initialSettings.general.hoverMode;
    this.plot = displayService.plot;

    // Register as observer to listen for settings changes
    this.settingsService.addObserver(this);
  }

  /**
   * Registers mouse event listeners based on the current hover mode setting.
   */
  public registerEvents(): void {
    // Create the mouse listener if it doesn't exist
    if (!this.mouseListener) {
      this.mouseListener = (event: MouseEvent) => {
        const x = event.clientX;
        const y = event.clientY;

        this.commandContext.context.moveToPoint(x, y);
      };
    }

    // Remove any existing listeners first to avoid duplicates
    this.removeEventListeners();

    // Add appropriate listeners based on hover mode
    if (this.hoverMode === 'pointermove') {
      this.plot.addEventListener('pointermove', this.mouseListener);
    } else if (this.hoverMode === 'click') {
      this.plot.addEventListener('click', this.mouseListener);
    }
  }

  /**
   * Removes all mouse event listeners from the plot element.
   */
  private removeEventListeners(): void {
    if (this.mouseListener) {
      this.plot.removeEventListener('pointermove', this.mouseListener);
      this.plot.removeEventListener('click', this.mouseListener);
    }
  }

  /**
   * Unregisters all mouse event listeners.
   */
  public unregister(): void {
    this.removeEventListeners();
  }

  /**
   * Updates mouse bindings when settings change, particularly hover mode.
   * @param settings - The updated settings object
   */
  public update(settings: Settings): void {
    const newHoverMode = settings.general.hoverMode;

    // Only update if the hover mode has changed
    if (this.hoverMode !== newHoverMode) {
      this.hoverMode = newHoverMode;

      // Re-register events with the new hover mode
      this.registerEvents();
    }
  }

  /**
   * Cleans up event listeners and removes observer registration.
   */
  public dispose(): void {
    this.unregister();
    this.settingsService.removeObserver(this);
  }
}
