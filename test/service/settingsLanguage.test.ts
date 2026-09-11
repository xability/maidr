import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Settings } from '@type/settings';
import { afterEach, describe, expect, it } from '@jest/globals';
import { applyStoredLanguage, SETTINGS_KEY, SettingsService } from '@service/settings';
import { DEFAULT_SETTINGS } from '@type/settings';
import { getLocale, setLocale } from '@util/i18n';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

// `jest-environment-jsdom` does not expose `structuredClone`, which
// `SettingsService` uses to clone the default settings.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

function createStorage(saved?: unknown): StorageService {
  const store = new Map<string, unknown>();
  if (saved !== undefined) {
    store.set(SETTINGS_KEY, saved);
  }
  return {
    save: <T>(key: string, value: T): void => {
      store.set(key, value);
    },
    load: <T>(key: string): T | null => (store.get(key) as T) ?? null,
    remove: (key: string): void => {
      store.delete(key);
    },
  };
}

const display = { toggleFocus: (): void => {} } as unknown as DisplayService;

function withLanguage(language: string): Settings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.general.language = language as Settings['general']['language'];
  return settings;
}

describe('SettingsService language', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('should speak the saved language from page load', () => {
    const service = new SettingsService(createStorage(withLanguage('ko')), display);

    expect(service.loadSettings().general.language).toBe('ko');
    expect(getLocale()).toBe('ko');
  });

  it('should switch languages when settings are saved', () => {
    const service = new SettingsService(createStorage(), display);

    service.saveSettings(withLanguage('ko'));

    expect(getLocale()).toBe('ko');
  });

  it('should return to the default language on reset', () => {
    const service = new SettingsService(createStorage(withLanguage('ko')), display);

    service.resetSettings();

    expect(service.loadSettings().general.language).toBe('auto');
    expect(getLocale()).toBe('en');
  });

  it('should fall back to following the browser when the saved language is unknown', () => {
    const service = new SettingsService(createStorage(withLanguage('tlh')), display);

    expect(service.loadSettings().general.language).toBe('auto');
    expect(getLocale()).toBe('en');
  });

  it('should offer the language to readers with settings saved before it existed', () => {
    const legacy = structuredClone(DEFAULT_SETTINGS) as { general: Partial<Settings['general']> };
    delete legacy.general.language;
    const service = new SettingsService(createStorage(legacy), display);

    expect(service.loadSettings().general.language).toBe('auto');
  });

  describe('applyStoredLanguage', () => {
    it('should speak the stored language before a settings service exists', () => {
      applyStoredLanguage(createStorage(withLanguage('ko')));

      expect(getLocale()).toBe('ko');
    });

    it('should follow the browser when nothing or something unknown is stored', () => {
      setLocale('ko');
      applyStoredLanguage(createStorage());
      expect(getLocale()).toBe('en');

      setLocale('ko');
      applyStoredLanguage(createStorage(withLanguage('tlh')));
      expect(getLocale()).toBe('en');
    });
  });
});
