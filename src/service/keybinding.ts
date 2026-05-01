import type { CommandContext } from '@command/command';
import type { DisplayService } from '@service/display';
import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { KeybindingEntry, Keys } from '@type/event';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import { CommandFactory } from '@command/factory';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';
import { Platform } from '@util/platform';
import hotkeys from 'hotkeys-js';

/**
 * Helper to create a keybinding entry with required fields.
 */
function key(hotkey: string, description: string, options?: Partial<KeybindingEntry>): KeybindingEntry {
  return {
    hotkey,
    description,
    ...options,
  };
}

/**
 * Keymap configuration for braille mode interactions.
 */
const BRAILLE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: key(`l`, 'Access Labels', { showInHelp: false }),
  EXIT_BRAILLE_AND_SUBPLOT: key(`esc`, 'Exit Braille Mode', { showInHelp: false }),

  // Autoplay
  AUTOPLAY_UPWARD: key(`${Platform.ctrl}+shift+up`, 'Autoplay Upward', { helpKey: `${Platform.ctrl} + shift + up` }),
  AUTOPLAY_DOWNWARD: key(`${Platform.ctrl}+shift+down`, 'Autoplay Downward', { helpKey: `${Platform.ctrl} + shift + down` }),
  AUTOPLAY_FORWARD: key(`${Platform.ctrl}+shift+right`, 'Autoplay Forward', { helpKey: `${Platform.ctrl} + shift + right` }),
  AUTOPLAY_BACKWARD: key(`${Platform.ctrl}+shift+left`, 'Autoplay Backward', { helpKey: `${Platform.ctrl} + shift + left` }),

  STOP_AUTOPLAY: key(`${Platform.ctrl}, up, down, left, right`, 'Stop Autoplay', { helpKey: `${Platform.ctrl}` }),
  SPEED_UP_AUTOPLAY: key(`.`, 'Speed Up Autoplay', { helpKey: '. (period)' }),
  SPEED_DOWN_AUTOPLAY: key(`,`, 'Speed Down Autoplay', { helpKey: ', (comma)' }),
  RESET_AUTOPLAY_SPEED: key(`/`, 'Reset Autoplay Speed', { helpKey: '/ (slash)' }),

  // Navigation
  MOVE_UP: key(`up`, 'Navigate Up'),
  MOVE_DOWN: key(`down`, 'Navigate Down'),
  MOVE_RIGHT: key(`right`, 'Navigate Right'),
  MOVE_LEFT: key(`left`, 'Navigate Left'),

  MOVE_TO_TOP_EXTREME: key(`${Platform.ctrl}+up`, 'Go to Top Extreme', { helpKey: `${Platform.ctrl} + up` }),
  MOVE_TO_BOTTOM_EXTREME: key(`${Platform.ctrl}+down`, 'Go to Bottom Extreme', { helpKey: `${Platform.ctrl} + down` }),
  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'Go to Left Extreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'Go to Right Extreme', { helpKey: `${Platform.ctrl} + right` }),

  MOVE_TO_NEXT_TRACE: key(`pageup`, 'Move to Next Layer'),
  MOVE_TO_PREV_TRACE: key(`pagedown`, 'Move to Previous Layer'),

  // Modes
  TOGGLE_BRAILLE: key(`b`, 'Toggle Braille Mode'),
  TOGGLE_TEXT: key(`t`, 'Toggle Text Mode'),
  TOGGLE_AUDIO: key(`s`, 'Toggle Sonification Mode'),
  TOGGLE_REVIEW: key(`r`, 'Toggle Review Mode'),
  TOGGLE_HIGH_CONTRAST: key(`c`, 'Toggle High Contrast Mode'),

  // Misc
  TOGGLE_HELP: key(`${Platform.ctrl}+/`, 'Open/Close Help', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'Open Chat', { helpKey: '?' }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'Open Settings', { helpKey: `${Platform.ctrl} + ,` }),

  // Description
  ANNOUNCE_POINT: key(`space`, 'Replay Current Point'),
  ANNOUNCE_POSITION: key(`p`, 'Announce Position'),

  // Chart description
  TOGGLE_DESCRIPTION: key(`d`, 'Open Chart Description'),

  // rotor functionality
  ROTOR_NEXT_NAV: key(`${Platform.alt}+shift+up`, 'Next Navigation Mode (Rotor)', { helpKey: `${Platform.alt} + shift + up` }),
  ROTOR_PREV_NAV: key(`${Platform.alt}+shift+down`, 'Previous Navigation Mode (Rotor)', { helpKey: `${Platform.alt} + shift + down` }),
} as const;

/**
 * Keymap configuration for chat interface interactions.
 */
const CHAT_KEYMAP = {
  // Misc
  TOGGLE_CHAT: key(`esc`, 'Close Chat', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for figure label scope interactions.
 */
const FIGURE_LABEL_KEYMAP = {
  DEACTIVATE_FIGURE_LABEL_SCOPE: key(`escape`, 'Exit Label Mode', { showInHelp: false }),

  // Description
  ANNOUNCE_TITLE: key(`t`, 'Announce Plot Title'),
  ANNOUNCE_SUBTITLE: key(`s`, 'Announce Subtitle'),
  ANNOUNCE_CAPTION: key(`c`, 'Announce Caption'),

  // Misc
  TOGGLE_HELP: key(`${Platform.ctrl}+/`, 'Open/Close Help', { helpKey: `${Platform.ctrl} + /` }),
} as const;

/**
 * Keymap configuration for help menu interactions.
 */
const HELP_KEYMAP = {
  // Misc
  TOGGLE_HELP: key(`esc`, 'Close Help', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for subplot scope interactions.
 */
const SUBPLOT_KEYMAP = {
  ACTIVATE_FIGURE_LABEL_SCOPE: key(`l`, 'Access Labels', { showInHelp: false }),

  // Description
  ANNOUNCE_TITLE: key(`t`, 'Announce Title'),
  ANNOUNCE_POINT: key(`space`, 'Announce Current Subplot'),
  ANNOUNCE_POSITION: key(`p`, 'Announce Position'),

  // Navigation
  MOVE_UP: key(`up`, 'Move Up'),
  MOVE_DOWN: key(`down`, 'Move Down'),
  MOVE_RIGHT: key(`right`, 'Move Right'),
  MOVE_LEFT: key(`left`, 'Move Left'),

  MOVE_TO_TOP_EXTREME: key(`${Platform.ctrl}+up`, 'Go to Top Extreme', { helpKey: `${Platform.ctrl} + up` }),
  MOVE_TO_BOTTOM_EXTREME: key(`${Platform.ctrl}+down`, 'Go to Bottom Extreme', { helpKey: `${Platform.ctrl} + down` }),
  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'Go to Left Extreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'Go to Right Extreme', { helpKey: `${Platform.ctrl} + right` }),

  MOVE_TO_TRACE_CONTEXT: key(`${Platform.enter}`, 'Activate Current Subplot', { helpKey: `${Platform.enter}` }),

  TOGGLE_HIGH_CONTRAST: key(`c`, 'Toggle High Contrast Mode'),

  // Misc
  TOGGLE_HELP: key(`${Platform.ctrl}+/`, 'Open/Close Help', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'Open Chat', { helpKey: '?' }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'Open Settings', { helpKey: `${Platform.ctrl} + ,` }),
} as const;

/**
 * Keymap configuration for trace label scope interactions.
 */
const TRACE_LABEL_KEYMAP = {
  DEACTIVATE_TRACE_LABEL_SCOPE: key(`escape`, 'Exit Label Mode', { showInHelp: false }),

  // Description
  ANNOUNCE_X: key(`x`, 'Announce X Label'),
  ANNOUNCE_Y: key(`y`, 'Announce Y Label'),
  ANNOUNCE_Z: key(`z`, 'Announce Z Label'),
  ANNOUNCE_TITLE: key(`t`, 'Announce Plot Title'),
  ANNOUNCE_SUBTITLE: key(`s`, 'Announce Subtitle'),
  ANNOUNCE_CAPTION: key(`c`, 'Announce Caption'),

  // Misc
  TOGGLE_HELP: key(`${Platform.ctrl}+/`, 'Open/Close Help', { helpKey: `${Platform.ctrl} + /` }),
} as const;

/**
 * Keymap configuration for review mode interactions.
 */
const REVIEW_KEYMAP = {
  // Modes
  TOGGLE_BRAILLE: key(`b`, 'Toggle Braille Mode'),
  TOGGLE_REVIEW: key(`r`, 'Exit Review Mode'),

  // Allowed actions
  ALLOW_DEFAULT: key(`up, down, left, right,
    ${Platform.ctrl}+up, ${Platform.ctrl}+down,
    ${Platform.ctrl}+left, ${Platform.ctrl}+right,
    pageup, pagedown, home, end,
    tab, ${Platform.ctrl}+a, ${Platform.ctrl}+c`, 'Standard Text Selection', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for settings interface interactions.
 */
const SETTINGS_KEYMAP = {
  // Misc
  TOGGLE_SETTINGS: key(`esc`, 'Close Settings', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for trace scope interactions and navigation.
 */
const TRACE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: key(`l`, 'Access Labels', { showInHelp: false }),

  // Autoplay
  AUTOPLAY_UPWARD: key(`${Platform.ctrl}+shift+up`, 'Autoplay Upward', { helpKey: `${Platform.ctrl} + shift + up` }),
  AUTOPLAY_DOWNWARD: key(`${Platform.ctrl}+shift+down`, 'Autoplay Downward', { helpKey: `${Platform.ctrl} + shift + down` }),
  AUTOPLAY_FORWARD: key(`${Platform.ctrl}+shift+right`, 'Autoplay Forward', { helpKey: `${Platform.ctrl} + shift + right` }),
  AUTOPLAY_BACKWARD: key(`${Platform.ctrl}+shift+left`, 'Autoplay Backward', { helpKey: `${Platform.ctrl} + shift + left` }),

  STOP_AUTOPLAY: key(`${Platform.ctrl}, up, down, left, right`, 'Stop Autoplay', { helpKey: `${Platform.ctrl}` }),
  SPEED_UP_AUTOPLAY: key(`.`, 'Speed Up Autoplay', { helpKey: '. (period)' }),
  SPEED_DOWN_AUTOPLAY: key(`,`, 'Speed Down Autoplay', { helpKey: ', (comma)' }),
  RESET_AUTOPLAY_SPEED: key(`/`, 'Reset Autoplay Speed', { helpKey: '/ (slash)' }),

  // Navigation
  MOVE_UP: key(`up`, 'Navigate Up'),
  MOVE_DOWN: key(`down`, 'Navigate Down'),
  MOVE_RIGHT: key(`right`, 'Navigate Right'),
  MOVE_LEFT: key(`left`, 'Navigate Left'),

  MOVE_TO_TOP_EXTREME: key(`${Platform.ctrl}+up`, 'Go to Top Extreme', { helpKey: `${Platform.ctrl} + up` }),
  MOVE_TO_BOTTOM_EXTREME: key(`${Platform.ctrl}+down`, 'Go to Bottom Extreme', { helpKey: `${Platform.ctrl} + down` }),
  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'Go to Left Extreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'Go to Right Extreme', { helpKey: `${Platform.ctrl} + right` }),

  MOVE_TO_SUBPLOT_CONTEXT: key(`esc`, 'Return to Subplot', { showInHelp: false }),
  MOVE_TO_NEXT_TRACE: key(`pageup`, 'Move to Next Layer'),
  MOVE_TO_PREV_TRACE: key(`pagedown`, 'Move to Previous Layer'),

  // Modes
  TOGGLE_BRAILLE: key(`b`, 'Toggle Braille Mode'),
  TOGGLE_TEXT: key(`t`, 'Toggle Text Mode'),
  TOGGLE_AUDIO: key(`s`, 'Toggle Sonification Mode'),
  TOGGLE_REVIEW: key(`r`, 'Toggle Review Mode'),
  TOGGLE_HIGH_CONTRAST: key(`c`, 'Toggle High Contrast Mode'),

  // Misc
  TOGGLE_HELP: key(`${Platform.ctrl}+/`, 'Open/Close Help', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'Open Chat', { helpKey: '?' }),
  TOGGLE_COMMAND_PALETTE: key(`${Platform.ctrl}+shift+p`, 'Open Command Palette', { helpKey: `${Platform.ctrl} + shift + p` }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'Open Settings', { helpKey: `${Platform.ctrl} + ,` }),

  // Description
  ANNOUNCE_POINT: key(`space`, 'Replay Current Point'),
  ANNOUNCE_POSITION: key(`p`, 'Announce Position'),

  // Go To functionality
  GO_TO_EXTREMA_TOGGLE: key(`g`, 'Go To Extrema'),

  // Chart description
  TOGGLE_DESCRIPTION: key(`d`, 'Open Chart Description'),

  // rotor functionality
  ROTOR_NEXT_NAV: key(`${Platform.alt}+shift+up`, 'Next Navigation Mode (Rotor)', { helpKey: `${Platform.alt} + shift + up` }),
  ROTOR_PREV_NAV: key(`${Platform.alt}+shift+down`, 'Previous Navigation Mode (Rotor)', { helpKey: `${Platform.alt} + shift + down` }),

  // Grid cell navigation (enter grid cell when in GRID_MODE)
  ENTER_GRID_CELL: key(`${Platform.enter}`, 'Enter Grid Cell', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for extrema navigation modal interactions.
 */
const GO_TO_EXTREMA_KEYMAP = {
  // Navigation within the modal (standard UI, not shown in help)
  GO_TO_EXTREMA_MOVE_UP: key('up', 'Navigate Up', { showInHelp: false }),
  GO_TO_EXTREMA_MOVE_DOWN: key('down', 'Navigate Down', { showInHelp: false }),
  GO_TO_EXTREMA_SELECT: key('enter', 'Select', { showInHelp: false }),
  GO_TO_EXTREMA_CLOSE: key('esc', 'Close', { showInHelp: false }),
  GO_TO_EXTREMA_TOGGLE: key('g', 'Go To Extrema', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for chart description modal interactions.
 */
const DESCRIPTION_KEYMAP = {
  TOGGLE_DESCRIPTION: key(`esc`, 'Close Chart Description', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for command palette modal interactions.
 */
const COMMAND_PALETTE_KEYMAP = {
  // Navigation within the modal (standard UI, not shown in help)
  COMMAND_PALETTE_MOVE_UP: key('up', 'Navigate Up', { showInHelp: false }),
  COMMAND_PALETTE_MOVE_DOWN: key('down', 'Navigate Down', { showInHelp: false }),
  COMMAND_PALETTE_SELECT: key('enter', 'Select', { showInHelp: false }),
  COMMAND_PALETTE_CLOSE: key('esc', 'Close', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for grid cell point navigation.
 */
const GRID_CELL_KEYMAP = {
  // Navigation within grid cell points
  GRID_CELL_MOVE_LEFT: key('left', 'Navigate Left in Cell', { showInHelp: false }),
  GRID_CELL_MOVE_RIGHT: key('right', 'Navigate Right in Cell', { showInHelp: false }),
  EXIT_GRID_CELL: key('esc', 'Exit Grid Cell', { showInHelp: false }),
} as const;

/**
 * Maps each application scope to its corresponding keymap configuration.
 */
export const SCOPED_KEYMAP = {
  [Scope.BRAILLE]: BRAILLE_KEYMAP,
  [Scope.CHAT]: CHAT_KEYMAP,
  [Scope.COMMAND_PALETTE]: COMMAND_PALETTE_KEYMAP,
  [Scope.DESCRIPTION]: DESCRIPTION_KEYMAP,
  [Scope.FIGURE_LABEL]: FIGURE_LABEL_KEYMAP,
  [Scope.GO_TO_EXTREMA]: GO_TO_EXTREMA_KEYMAP,
  [Scope.GRID_CELL]: GRID_CELL_KEYMAP,
  [Scope.HELP]: HELP_KEYMAP,
  [Scope.REVIEW]: REVIEW_KEYMAP,
  [Scope.SETTINGS]: SETTINGS_KEYMAP,
  [Scope.SUBPLOT]: SUBPLOT_KEYMAP,
  [Scope.TRACE]: TRACE_KEYMAP,
  [Scope.TRACE_LABEL]: TRACE_LABEL_KEYMAP,
} as const;

/**
 * Type representing a scope's keymap (command key to keybinding entry mapping).
 */
export type ScopeKeymap = Record<string, KeybindingEntry>;

/**
 * Type representing the complete keymap structure for all scopes.
 */
export type Keymap = {
  [K in Scope]: (typeof SCOPED_KEYMAP)[K];
};

/**
 * Gets the keymap for a specific scope with proper typing.
 * @param scope - The scope to get the keymap for.
 * @returns The keymap for the scope.
 */
export function getKeymapForScope(scope: Scope): ScopeKeymap {
  return SCOPED_KEYMAP[scope] as ScopeKeymap;
}

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
      for (const [commandName, entry] of Object.entries(keymap as Record<string, KeybindingEntry>) as [
        Keys,
        KeybindingEntry,
      ][]) {
        const hotkey = entry.hotkey;

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

        hotkeys(hotkey, { scope }, (event: KeyboardEvent): void => {
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
