import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Observable, Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import { Scope } from '@type/event';

const SETTINGS_KEY = 'maidr-settings';

export class SettingsService implements Observable<Settings> {
  private readonly storage: StorageService;
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;
  private observers: Observer<Settings>[];

  public constructor(storage: StorageService, display: DisplayService) {
    this.storage = storage;
    this.display = display;
    this.observers = [];

    this.defaultSettings = {
      general: {
        volume: 50,
        highlightColor: '#03c809',
        highContrastLevels: 2,
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
          OPENAI: {
            enabled: false,
            apiKey: '',
            name: 'OpenAI',
            version: 'gpt-4o',
          },
          ANTHROPIC_CLAUDE: {
            enabled: false,
            apiKey: '',
            name: 'Anthropic Claude',
            version: 'claude-3-7-sonnet-latest',
          },
          GOOGLE_GEMINI: {
            enabled: false,
            apiKey: '',
            name: 'Google Gemini',
            version: 'gemini-2.0-flash',
          },
        },
      },
    };

    const saved = this.storage.load<Settings>(SETTINGS_KEY);
    this.currentSettings = saved ?? this.defaultSettings;
  }

  public get state(): Settings {
    return this.currentSettings;
  }

  public addObserver(observer: Observer<Settings>): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: Observer<Settings>): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  public notifyStateUpdate(): void {
    for (const observer of this.observers) {
      observer.update(this.currentSettings);
    }
  }

  public loadSettings(): Settings {
    return this.currentSettings;
  }

  public saveSettings(newSettings: Settings): void {
    this.currentSettings = newSettings;
    this.storage.save(SETTINGS_KEY, this.currentSettings);
    this.notifyStateUpdate();
  }

  public resetSettings(): Settings {
    this.currentSettings = this.defaultSettings;
    this.storage.remove(SETTINGS_KEY);
    this.notifyStateUpdate();
    return this.currentSettings;
  }

  public toggle(): void {
    this.display.toggleFocus(Scope.SETTINGS);
  }
}
