import type { DisplayService } from '@service/display';
import { Focus } from '@type/event';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class SettingsService {
  private readonly display: DisplayService;

  public constructor(display: DisplayService) {
    this.display = display;
  }

  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus(Focus.SETTINGS);

    const newState = !oldState;
    if (newState) {
      hotkeys.setScope(Scope.SETTINGS);
    }

    return newState;
  }
}
