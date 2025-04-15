import type { ContextService } from '@service/context';
import type { DisplayService } from '@service/display';
import type { HelpMenuItem } from '@type/help';
import { Scope } from '@type/event';
import { Platform } from '@util/platform';

const TRACE_HELP_MENU = [
  { description: 'Move around Layer', key: 'arrow keys' },
  { description: 'Move to Next Layer', key: 'page up' },
  { description: 'Move to Previous Layer', key: 'page down' },
  { description: 'Go to Left/Right/Top/Bottom Extreme Point', key: `${Platform.ctrl} + arrow keys` },

  { description: 'Toggle Braille Mode', key: 'b' },
  { description: 'Toggle Text Mode', key: 't' },
  { description: 'Toggle Sonification Mode', key: 's' },
  { description: 'Toggle Review Mode', key: 'r' },

  { description: 'Autoplay Outward', key: `${Platform.ctrl} + shift + arrow keys` },
  { description: 'Stop Autoplay', key: `${Platform.ctrl}` },
  { description: 'Speed Up Autoplay', key: '. (period)' },
  { description: 'Speed Down Autoplay', key: ', (comma)' },
  { description: 'Reset Autoplay Speed', key: '/ (slash)' },

  { description: 'Describe Current Point', key: 'space' },
  { description: 'Describe Subplot Title', key: 'l t' },
  { description: 'Describe X Axis', key: 'l x' },
  { description: 'Describe Y Axis', key: 'l y' },
  { description: 'Describe Fill (Z) Axis', key: 'l f' },
];

const SUBPLOT_HELP_MENU = [
  { description: 'Move around Subplot', key: 'arrow keys' },
  { description: 'Activate Current Subplot', key: `${Platform.enter}` },

  { description: 'Describe Current Subplot', key: 'space' },
  { description: 'Describe Figure Title', key: 'l s' },
  { description: 'Describe Subtitle', key: 'l s' },
  { description: 'Describe Caption', key: 'l c' },
];

export class HelpService {
  private readonly context: ContextService;
  private readonly display: DisplayService;

  private readonly scopedMenuItems: Partial<Record<Scope, HelpMenuItem[]>>;

  public constructor(context: ContextService, display: DisplayService) {
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
