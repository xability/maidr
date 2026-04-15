import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import { Emitter, Scope } from '@type/event';

const SETTINGS_KEY = 'maidr-settings';

/**
 * Deep-merges `override` into `defaults`, filling any keys that are present
 * in `defaults` but absent from `override`. This ensures that newly added
 * settings are available even when the user has an older saved settings object
 * in localStorage that predates the new keys.
 *
 * null override values are treated as absent and fall back to defaults.
 */
export function deepMerge<T extends object>(defaults: T, override: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const overrideVal = override[key];
    const defaultVal = defaults[key];
    if (
      overrideVal !== null
      && overrideVal !== undefined
      && typeof overrideVal === 'object'
      && !Array.isArray(overrideVal)
      && typeof defaultVal === 'object'
      && defaultVal !== null
    ) {
      result[key] = deepMerge(defaultVal as object, overrideVal as Partial<object>) as T[keyof T];
    } else if (overrideVal !== undefined && overrideVal !== null) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

function getValue<T>(settings: any, key: string): T | undefined {
  return key.split('.').reduce((acc, part) => {
    return acc && acc[part];
  }, settings);
}

function getSettingValue<T>(settings: any, key: string): T {
  const value = getValue(settings, key);
  if (value === undefined) {
    throw new Error(`Setting not found: ${key}`);
  }
  return value as T;
}

class SettingsChangedEvent {
  public readonly oldSettings: Settings;
  public readonly newSettings: Settings;

  public constructor(oldSettings: Settings, newSettings: Settings) {
    this.oldSettings = oldSettings;
    this.newSettings = newSettings;
  }

  public affectsSetting(id: string): boolean {
    const oldValue = getSettingValue(this.oldSettings, id);
    const newValue = getSettingValue(this.newSettings, id);
    return JSON.stringify(oldValue) !== JSON.stringify(newValue);
  }

  public get<T>(settingPath: string): T {
    return getSettingValue<T>(this.newSettings, settingPath);
  }
}

export class SettingsService implements Disposable {
  private readonly storage: StorageService;
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;
  private observers: Observer<Settings>[];

  private readonly onChangeEmitter: Emitter<SettingsChangedEvent>;
  public readonly onChange: Event<SettingsChangedEvent>;

  public constructor(storage: StorageService, display: DisplayService) {
    this.storage = storage;
    this.display = display;
    this.observers = [];

    this.defaultSettings = {
      general: {
        volume: 50,
        highlightColor: '#03c809',
        highContrastMode: false,
        highContrastLevels: 2,
        highContrastLightColor: '#ffffff',
        highContrastDarkColor: '#000000',
        brailleDisplaySize: 32,
        brailleDisplayLines: 1,
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
    this.onChangeEmitter = new Emitter<SettingsChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
    const saved = this.storage.load<Settings>(SETTINGS_KEY);
    // Deep-merge so that newly added default settings are available even when
    // the user has an older saved object in localStorage that lacks the new keys.
    this.currentSettings = saved ? deepMerge(this.defaultSettings, saved) : this.defaultSettings;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public loadSettings(): Settings {
    return this.currentSettings;
  }

  public saveSettings(newSettings: Settings): void {
    const oldSettings = this.currentSettings;
    this.currentSettings = newSettings;

    this.storage.save(SETTINGS_KEY, this.currentSettings);
    this.onChangeEmitter.fire(new SettingsChangedEvent(oldSettings, newSettings));
  }

  public resetSettings(): Settings {
    const oldSettings = this.currentSettings;
    this.currentSettings = this.defaultSettings;

    this.storage.remove(SETTINGS_KEY);
    this.onChangeEmitter.fire(new SettingsChangedEvent(oldSettings, this.currentSettings));
    return this.currentSettings;
  }

  public get<T>(settingPath: string): T {
    return getSettingValue<T>(this.currentSettings, settingPath);
  }

  public toggle(): void {
    this.display.toggleFocus(Scope.SETTINGS);
  }

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
}
