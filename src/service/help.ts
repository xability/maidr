import type { HelpMenuItem } from '@redux/helpMenuSlice';
import type { DisplayService } from '@service/display';
import { loadHelpMenu } from '@redux/helpMenuSlice';
import { store } from '@redux/store';
import { Scope } from '@service/keybinding';
import hotkeys from 'hotkeys-js';

export class HelpService {
  private readonly display: DisplayService;

  private enabled: boolean;
  private readonly unsubscribe: () => void;
  private readonly menuItems: HelpMenuItem[];

  public constructor(display: DisplayService) {
    this.display = display;

    this.enabled = store.getState().helpMenu.enabled;
    this.unsubscribe = store.subscribe(() => {
      const enabled = store.getState().helpMenu.enabled;
      if (this.enabled !== enabled) {
        this.enabled = enabled;
        this.toggle();
      }
    });

    this.menuItems = [
      { description: 'Move around plot', key: 'arrow key' },
      { description: 'Go to Left/Right/Top/Bottom Extreme Point', key: 'command + arrow key' },

      { description: 'Toggle Braille Mode', key: 'b' },
      { description: 'Toggle Text Mode', key: 't' },
      { description: 'Toggle Sonification Mode', key: 's' },
      { description: 'Toggle Review Mode', key: 'r' },

      { description: 'Autoplay Outward', key: 'command + shift + arrow key' },
      { description: 'Stop Autoplay', key: 'command' },
      { description: 'Speed Up Autoplay', key: '.(period)' },
      { description: 'Speed Down Autoplay', key: ',(comma)' },
      { description: 'Reset Autoplay Speed', key: '/(slash)' },

      { description: 'Describe Current Point', key: 'space' },
      { description: 'Describe Plot Title', key: 'l t' },
      { description: 'Describe X Axis', key: 'l x' },
      { description: 'Describe Y Axis', key: 'l y' },
      { description: 'Describe Fill(Z) Axis', key: 'l f' },
      { description: 'Describe Subtitle', key: 'l s' },
      { description: 'Describe Caption', key: 'l c' },
    ];

    store.dispatch(loadHelpMenu(this.menuItems));
  }

  public destroy(): void {
    this.unsubscribe();
  }

  public toggle(): void {
    this.display.toggleHelpFocus();
    if (this.enabled) {
      hotkeys.setScope(Scope.HELP);
    } else {
      hotkeys.setScope(Scope.DEFAULT);
    }
  }
}
