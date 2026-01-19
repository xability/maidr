import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { HelpMenuItem } from '@type/help';
import { Scope } from '@type/event';
import { Platform } from '@util/platform';

/**
 * Help menu items for trace scope navigation and interactions.
 */
const TRACE_HELP_MENU = [
  { description: 'Navigate Data Points', key: 'arrow keys' },
  { description: 'Move to Next Layer', key: 'page up' },
  { description: 'Move to Previous Layer', key: 'page down' },
  { description: 'Go to Left/Right/Top/Bottom Extreme Point', key: `${Platform.ctrl} + arrow keys` },

  { description: 'Toggle Braille Mode', key: 'b' },
  { description: 'Toggle Text Mode', key: 't' },
  { description: 'Toggle Sonification Mode', key: 's' },
  { description: 'Toggle Review Mode', key: 'r' },
  { description: 'Toggle High Contrast Mode', key: 'c' },

  { description: 'Autoplay Outward', key: `${Platform.ctrl} + shift + arrow keys` },
  { description: 'Stop Autoplay', key: `${Platform.ctrl}` },
  { description: 'Speed Up Autoplay', key: '. (period)' },
  { description: 'Speed Down Autoplay', key: ', (comma)' },
  { description: 'Reset Autoplay Speed', key: '/ (slash)' },
  { description: 'Replay Current Point', key: 'space' },

  { description: 'Announce Plot Title', key: 'l t' },
  { description: 'Announce X Label', key: 'l x' },
  { description: 'Announce Y Label', key: 'l y' },
  { description: 'Announce Fill (Z) Label', key: 'l f' },

  { description: 'Open Settings', key: `${Platform.ctrl} + ,` },
  { description: 'Open Chat', key: `?` },

  { description: 'Move to next navigation mode in Rotor', key: `${Platform.alt}+shift+up` },
  { description: 'Move to previous navigation mode in Rotor', key: `${Platform.alt}+shift+down` },

];

/**
 * Help menu items for subplot scope navigation and interactions.
 */
const SUBPLOT_HELP_MENU = [
  { description: 'Move around Subplot', key: 'arrow keys' },
  { description: 'Activate Current Subplot', key: `${Platform.enter}` },

  { description: 'Announce Plot Title', key: 'l t' },
  { description: 'Announce Subtitle', key: 'l s' },
  { description: 'Announce Caption', key: 'l c' },

  { description: 'Open Settings', key: `${Platform.ctrl} + ,` },
];

/**
 * Service for managing context-sensitive help menus across different application scopes.
 */
export class HelpService {
  private readonly context: Context;
  private readonly display: DisplayService;

  private readonly scopedMenuItems: Partial<Record<Scope, HelpMenuItem[]>>;

  /**
   * Creates a new HelpService instance with scoped menu configurations.
   * @param context - The application context for determining current scope
   * @param display - The display service for toggling help UI
   */
  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;

    this.scopedMenuItems = {
      [Scope.TRACE]: TRACE_HELP_MENU,
      [Scope.TRACE_LABEL]: TRACE_HELP_MENU,
      [Scope.BRAILLE]: TRACE_HELP_MENU,
      [Scope.SUBPLOT]: SUBPLOT_HELP_MENU,
      [Scope.FIGURE_LABEL]: SUBPLOT_HELP_MENU,
    };
  }

  /**
   * Retrieves help menu items for the current application scope.
   * @returns Array of help menu items or empty array if no items for current scope
   */
  public getMenuItems(): HelpMenuItem[] {
    return this.scopedMenuItems[this.context.scope] ?? [];
  }

  /**
   * Toggles the visibility of the help menu interface.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.HELP);
  }
}
