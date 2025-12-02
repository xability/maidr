import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Observable, Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import { Scope } from '@type/event';

const SETTINGS_KEY = 'maidr-settings';

/**
 * Manages application settings including storage, retrieval, and observer notifications.
 */
export class SettingsService implements Observable<Settings> {
  private readonly storage: StorageService;
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;
  private observers: Observer<Settings>[];

  /**
   * Creates a new SettingsService instance with default settings.
   * @param storage - Service for persisting settings to storage
   * @param display - Service for managing display focus
   */
  public constructor(storage: StorageService, display: DisplayService) {
    this.storage = storage;
    this.display = display;
    this.observers = [];

    this.defaultSettings = {
      general: {
        volume: 50,
        highlightColor: '#03c809',
        brailleDisplaySize: 32,
        minFrequency: 200,
        maxFrequency: 1000,
        autoplayDuration: 4000,
        ariaMode: 'assertive',
        hoverMode: 'pointermove',
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

  /**
   * Gets the current settings state.
   * @returns The current settings object
   */
  public get state(): Settings {
    return this.currentSettings;
  }

  /**
   * Registers an observer to be notified of settings changes.
   * @param observer - The observer to add to the notification list
   */
  public addObserver(observer: Observer<Settings>): void {
    this.observers.push(observer);
  }

  /**
   * Unregisters an observer from settings change notifications.
   * @param observer - The observer to remove from the notification list
   */
  public removeObserver(observer: Observer<Settings>): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  /**
   * Notifies all registered observers of the current settings state.
   */
  public notifyStateUpdate(): void {
    for (const observer of this.observers) {
      observer.update(this.currentSettings);
    }
  }

  /**
   * Loads and returns the current settings.
   * @returns The current settings object
   */
  public loadSettings(): Settings {
    return this.currentSettings;
  }

  /**
   * Saves new settings to storage and notifies observers.
   * @param newSettings - The new settings object to save
   */
  public saveSettings(newSettings: Settings): void {
    this.currentSettings = newSettings;
    this.storage.save(SETTINGS_KEY, this.currentSettings);
    this.notifyStateUpdate();
  }

  /**
   * Resets settings to default values and clears storage.
   * @returns The default settings object
   */
  public resetSettings(): Settings {
    this.currentSettings = this.defaultSettings;
    this.storage.remove(SETTINGS_KEY);
    this.notifyStateUpdate();
    return this.currentSettings;
  }

  /**
   * Toggles the settings display focus.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.SETTINGS);
  }
}
