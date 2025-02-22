import type { DisplayService } from '@service/display';
import type { GeneralSettings, Settings } from '@type/settings';
import { Focus } from '@type/event';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class SettingsService {
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;

  public constructor(display: DisplayService) {
    this.display = display;

    this.defaultSettings = {
      general: {
        volume: 50,
        minFrequency: 200,
        maxFrequency: 1000,
        autoplayDuration: 4000,

        highlightColor: '#03c809',
        brailleDisplaySize: 32,
        ariaMode: 'assertive',
      },
    };
    this.currentSettings = this.defaultSettings;
  }

  public loadSettings(): Settings {
    return this.currentSettings;
  }

  public saveSettings(newSettings: Settings): void {
    this.currentSettings = newSettings;
  }

  public resetSettings(): void {
    this.currentSettings = this.defaultSettings;
  }

  public getSetting(key: keyof GeneralSettings): string | number {
    return this.currentSettings.general[key];
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
