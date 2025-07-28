import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Event } from '@type/event';
import type { Settings } from '@type/settings';
import { Emitter, Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';

const SETTINGS_KEY = 'maidr-settings';

export enum BrailleSettings {
  SIZE = 'braille.size',
}

function getSettingValue<T>(settings: any, key: string): T | undefined {
  return key.split('.').reduce((acc, part) => {
    return acc && acc[part];
  }, settings);
}

class SettingsChangeEvent {
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
    const value = getSettingValue<T>(this.newSettings, settingPath);
    if (value === undefined) {
      throw new Error(`Setting not found: ${settingPath}`);
    }
    return value;
  }
}

export class SettingsService {
  private readonly storage: StorageService;
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;

  private readonly onChangeEmitter: Emitter<SettingsChangeEvent>;
  public readonly onChange: Event<SettingsChangeEvent>;

  public constructor(storage: StorageService, display: DisplayService) {
    this.storage = storage;
    this.display = display;

    this.defaultSettings = DEFAULT_SETTINGS;

    this.onChangeEmitter = new Emitter<SettingsChangeEvent>();
    this.onChange = this.onChangeEmitter.event;

    const saved = this.storage.load<Settings>(SETTINGS_KEY);
    this.currentSettings = saved ?? this.defaultSettings;
  }

  public loadSettings(): Settings {
    return this.currentSettings;
  }

  public saveSettings(newSettings: Settings): void {
    const oldSettings = this.currentSettings;
    this.currentSettings = newSettings;

    this.storage.save(SETTINGS_KEY, this.currentSettings);
    this.onChangeEmitter.fire(new SettingsChangeEvent(oldSettings, newSettings));
  }

  public resetSettings(): Settings {
    const oldSettings = this.currentSettings;
    this.currentSettings = this.defaultSettings;

    this.storage.remove(SETTINGS_KEY);
    this.onChangeEmitter.fire(new SettingsChangeEvent(oldSettings, this.currentSettings));
    return this.currentSettings;
  }

  public get<T>(settingPath: string): T {
    const value = getSettingValue<T>(this.currentSettings, settingPath);
    if (value === undefined) {
      throw new Error(`Setting not found: ${settingPath}`);
    }
    return value;
  }

  public toggle(): void {
    this.display.toggleFocus(Scope.SETTINGS);
  }
}
