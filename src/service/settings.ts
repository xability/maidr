import type { DisplayService } from '@service/display';
import type { GeneralSettings } from '@type/settings';
import { Focus } from '@type/event';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class SettingsService {
  private readonly display: DisplayService;

  private readonly defaultSettings: GeneralSettings;
  private currentSettings: GeneralSettings;

  public constructor(display: DisplayService) {
    this.display = display;

    this.defaultSettings = {
      volume: 50,
      highlightColor: '#03c809',
      brailleDisplaySize: 32,
      minFrequency: 200,
      maxFrequency: 1000,
      autoplayDuration: 4000,
      ariaMode: 'assertive',
    };
    this.currentSettings = this.defaultSettings;
  }

  public loadSettings(): GeneralSettings {
    return this.currentSettings;
  }

  public saveSettings(newSettings: GeneralSettings): void {
    this.currentSettings = newSettings;
  }

  public resetSettings(): void {
    this.currentSettings = this.defaultSettings;
  }

  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus(Focus.SETTINGS);

    const newState = !oldState;
    if (newState) {
      hotkeys.setScope(Scope.SETTINGS);
    } else {
      hotkeys.setScope(Scope.DEFAULT);
    }

    return newState;
  }
}
