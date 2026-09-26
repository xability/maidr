import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { GeneralSettings, Settings } from '@type/settings';
import type { Locale } from '@util/i18n';
import { Emitter, Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';
import { normalizeBrailleDisplay } from '@util/braillePreset';
import { deepMerge } from '@util/deepMerge';
import { isLanguageSetting, resolveLocale, setLocale } from '@util/i18n';
import { ensureLocalePack } from '@util/i18n/localePack';

export const SETTINGS_KEY = 'maidr-settings';

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

/**
 * Reads the general settings the reader saved, for code that runs before, or
 * without, a `SettingsService`.
 *
 * Nothing is merged or validated: a key the reader never saved is absent, and
 * every value is `unknown` until the caller checks it.
 * @param storage - Where settings are persisted
 * @returns The saved general settings, or an empty object when none are saved
 */
export function loadStoredGeneralSettings(
  storage: StorageService,
): Partial<Record<keyof GeneralSettings, unknown>> {
  const general = storage.load<{ general?: unknown }>(SETTINGS_KEY)?.general;
  return typeof general === 'object' && general !== null ? general : {};
}

/**
 * The reader's latest `general.agentTools` choice on this page, or `null`
 * before they have made one here.
 *
 * Kept in memory because saving can fail -- a private window, an iframe
 * whose storage is blocked -- and each chart builds its own
 * `SettingsService` from storage when it gains focus: without this, the next
 * chart's dialog would read the default back and show the tools as on while
 * they are off.
 */
let agentToolsOnThisPage: boolean | null = null;

/**
 * Records the reader's `general.agentTools` choice for the rest of the page's
 * life, whatever storage manages to keep.
 *
 * @param enabled - The choice, or `null` to forget it (tests only)
 */
export function rememberAgentToolsChoice(enabled: boolean | null): void {
  agentToolsOnThisPage = enabled;
}

/**
 * Whether the reader allows the WebMCP tools: their latest choice on this
 * page, else what their saved settings say, else the default.
 *
 * @param storage - Where settings are persisted
 * @returns The `general.agentTools` setting
 */
export function readAgentToolsChoice(storage: StorageService): boolean {
  if (agentToolsOnThisPage !== null) {
    return agentToolsOnThisPage;
  }
  const stored = loadStoredGeneralSettings(storage).agentTools;
  return typeof stored === 'boolean' ? stored : DEFAULT_SETTINGS.general.agentTools;
}

/**
 * Speaks the stored language before any controller exists.
 *
 * A `SettingsService` is built on the chart's first focus, but the reader
 * meets the chart before that: the activation instruction is its accessible
 * name from page load. Without this, a reader whose settings say Korean
 * would hear that first sentence in English.
 * @param storage - Where settings are persisted
 */
export function applyStoredLanguage(storage: StorageService): void {
  const language = loadStoredGeneralSettings(storage).language;
  speak(resolveLocale(
    isLanguageSetting(language) ? language : DEFAULT_SETTINGS.general.language,
  ));
}

/**
 * Makes a locale the active one and fetches its pack if the page lacks it.
 *
 * The switch is immediate so nothing waits on the network: until the pack
 * registers, messages render in English, and registration re-renders them.
 * @param locale - The locale to speak
 */
function speak(locale: Locale): void {
  setLocale(locale);
  void ensureLocalePack(locale);
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

    this.defaultSettings = structuredClone(DEFAULT_SETTINGS);
    this.onChangeEmitter = new Emitter<SettingsChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
    const saved = this.storage.load<Settings>(SETTINGS_KEY);
    // Deep-merge so that newly added default settings are available even when
    // the user has an older saved object in localStorage that lacks the new keys.
    const merged = saved ? deepMerge(this.defaultSettings, saved) : this.defaultSettings;
    // Repair stale braille display kind / preset id before any consumer
    // (BrailleService, UI) reads the settings, so they see a coherent state
    // from page load — not just after the settings dialog opens.
    this.currentSettings = { ...merged, general: normalizeBrailleDisplay(merged.general) };
    // A choice made in another chart's dialog on this page outranks storage,
    // which may not have kept it.
    if (agentToolsOnThisPage !== null) {
      this.currentSettings.general = { ...this.currentSettings.general, agentTools: agentToolsOnThisPage };
    }
    // A saved language that is no longer offered falls back to following the
    // browser rather than to whatever string was stored.
    if (!isLanguageSetting(this.currentSettings.general.language)) {
      this.currentSettings.general.language = DEFAULT_SETTINGS.general.language;
    }
    this.applyLanguage();
  }

  /**
   * Switches the dictionary every message is rendered from to the language
   * the settings ask for. Called whenever the settings change, so a reader
   * who picks a language hears the next announcement in it.
   */
  private applyLanguage(): void {
    speak(resolveLocale(this.currentSettings.general.language));
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
    this.applyLanguage();

    this.storage.save(SETTINGS_KEY, this.currentSettings);
    this.onChangeEmitter.fire(new SettingsChangedEvent(oldSettings, newSettings));
    // Notify Observer<Settings> registrants (e.g. Mousebindingservice) so that
    // observer-based consumers such as hover-mode react immediately. This is a
    // separate audience from the onChange emitter, so no double-notification.
    this.notifyStateUpdate();
  }

  public resetSettings(): Settings {
    const oldSettings = this.currentSettings;
    this.currentSettings = this.defaultSettings;
    this.applyLanguage();

    this.storage.remove(SETTINGS_KEY);
    this.onChangeEmitter.fire(new SettingsChangedEvent(oldSettings, this.currentSettings));
    this.notifyStateUpdate();
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
