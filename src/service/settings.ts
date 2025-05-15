import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Settings } from '@type/settings';
import { Scope } from '@type/event';

const SETTINGS_KEY = 'maidr-settings';

export class SettingsService {
  private readonly storage: StorageService;
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;

  public constructor(storage: StorageService, display: DisplayService) {
    this.storage = storage;
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
            enabled: false,
            apiKey: '',
            name: 'GPT',
            version: 'gpt-4o',
          },
          CLAUDE: {
            enabled: false,
            apiKey: '',
            name: 'Claude',
            version: 'claude-3.5-haiku-latest',
          },
          GEMINI: {
            enabled: false,
            apiKey: '',
            name: 'Gemini',
            version: 'gemini-2.0-flash',
          },
        },
      },
    };

    const saved = this.storage.load<Settings>(SETTINGS_KEY);
    this.currentSettings = saved ?? this.defaultSettings;
  }

  public loadSettings(): Settings {
    return this.currentSettings;
  }

  public saveSettings(newSettings: Settings): void {
    this.currentSettings = newSettings;
    this.storage.save(SETTINGS_KEY, this.currentSettings);
  }

  public resetSettings(): Settings {
    this.currentSettings = this.defaultSettings;
    this.storage.remove(SETTINGS_KEY);
    return this.currentSettings;
  }

  public toggle(): void {
    this.display.toggleFocus(Scope.SETTINGS);
  }
}
