import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import { Emitter, Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';

const SETTINGS_KEY = 'maidr-settings';

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

    this.defaultSettings = DEFAULT_SETTINGS;

    this.onChangeEmitter = new Emitter<SettingsChangedEvent>();
    this.onChange = this.onChangeEmitter.event;

    const saved = this.storage.load<Settings>(SETTINGS_KEY);
    this.currentSettings = saved ?? this.defaultSettings;
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

  public removeObserver(observer: Observer<Settings>): void {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  public notifyStateUpdate(): void {
    for (const observer of this.observers) {
      observer.update(this.currentSettings);
    }
  }
}
