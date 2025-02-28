import type { DisplayService } from '@service/display';
import type { Settings } from '@type/settings';
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
          CHAT_GPT: {
            enabled: false,
            apiKey: '',
            name: 'ChatGPT',
          },
          CLAUDE: {
            enabled: false,
            apiKey: '',
            name: 'Claude',
          },
          GEMINI: {
            enabled: false,
            apiKey: '',
            name: 'Gemini',
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
    this.display.toggleFocus('SETTINGS');

    const newState = !oldState;
    if (newState) {
      hotkeys.setScope(Scope.SETTINGS);
    } else {
      hotkeys.setScope(Scope.DEFAULT);
    }

    return newState;
  }
}
