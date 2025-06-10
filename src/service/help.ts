import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { HelpMenuItem } from '@type/help';
import { Scope } from '@type/event';
import { Platform } from '@util/platform';

const TRACE_HELP_MENU = [
  // Navigation Group - Always start the description with "Move"
  { description: 'Move across data points', key: 'arrow keys' },
  { description: 'Move to Next Layer', key: 'page up' },
  { description: 'Move to Previous Layer', key: 'page down' },
  { description: 'Move to Left/Right/Top/Bottom Extreme Point', key: `${Platform.ctrl} + arrow keys` },
  { description: 'Play Current Point', key: 'space' },

  // Mode Group - Always start the description with "Toggle"
  { description: 'Toggle Braille Mode', key: 'b' },
  { description: 'Toggle Text Mode', key: 't' },
  { description: 'Toggle Sonification Mode', key: 's' },
  { description: 'Toggle Review Mode', key: 'r' },

  // Autoplay Group - Always start the description with "Start" or "Stop" and include "Autoplay" in the description
  { description: 'Start Autoplay Outward', key: `${Platform.ctrl} + shift + arrow keys` },
  { description: 'Stop Autoplay', key: `${Platform.ctrl}` },
  { description: 'Speed Up Autoplay', key: '. (period)' },
  { description: 'Speed Down Autoplay', key: ', (comma)' },
  { description: 'Reset Autoplay Speed', key: '/ (slash)' },

  // Announcement Group - Always start the description with "Announce"
  { description: 'Announce Plot Title', key: 'l t' },
  { description: 'Announce X Label', key: 'l x' },
  { description: 'Announce Y Label', key: 'l y' },
  { description: 'Announce Fill (Z) Label', key: 'l f' },

  // General Group - All other items should be added here
  { description: 'Open Settings', key: `${Platform.ctrl} + ,` },
  { description: 'Open Chat', key: `shift + /` },
  { description: 'Open Help', key: `${Platform.ctrl} + /` },
];

const SUBPLOT_HELP_MENU = [
  // Navigation Group - Always start the description with "Move"
  { description: 'Move around Subplot', key: 'arrow keys' },
  { description: 'Activate Current Subplot', key: `${Platform.enter}` },

  // Announcement Group - Always start the description with "Announce"
  { description: 'Announce Plot Title', key: 'l t' },
  { description: 'Announce Subtitle', key: 'l s' },
  { description: 'Announce Caption', key: 'l c' },

  // General Group - All other items should be added here
  { description: 'Open Settings', key: `${Platform.ctrl} + ,` },
];

export class HelpService {
  private readonly context: Context;
  private readonly display: DisplayService;

  private readonly scopedMenuItems: Partial<Record<Scope, HelpMenuItem[]>>;

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

  public getMenuItems(): HelpMenuItem[] {
    return this.scopedMenuItems[this.context.scope] ?? [];
  }

  public toggle(): void {
    this.display.toggleFocus(Scope.HELP);
  }
}
