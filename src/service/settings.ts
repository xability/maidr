import type { DisplayService } from '@service/display';
import type { Settings } from '@type/settings';
import { Scope } from '@type/event';

export class SettingsService {
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;

  public constructor(display: DisplayService) {
    this.display = display;

    this.defaultSettings = {
      general: {
        volume: 50,
        highlightColor: '#03c809',
        brailleDisplaySize: 32,
        minFrequency: 200,
        maxFrequency: 1000,
        autoplayDuration: 4000,
        ariaMode: 'assertive',
      },
      llm: {
        expertiseLevel: 'basic',
        customInstruction: '',
        models: {
          GPT: {
            name: 'GPT',
            apiKey: '',
            enabled: false,
            version: 'gpt-4-turbo',
          },
          CLAUDE: {
            name: 'CLAUDE',
            apiKey: '',
            enabled: false,
            version: 'claude-3-sonnet',
          },
          GEMINI: {
            name: 'GEMINI',
            apiKey: '',
            enabled: false,
            version: 'gemini-1.5-pro',
          },
        },
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

  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus(Scope.SETTINGS);
    return !oldState;
  }
}
