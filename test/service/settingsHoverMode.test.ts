import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import type { Settings } from '@type/settings';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SETTINGS_KEY, SettingsService } from '@service/settings';

// `jest-environment-jsdom` does not expose `structuredClone`, which
// `SettingsService` uses to clone the default settings.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

/** Storage that keeps what it is given. */
function workingStorage(saved?: unknown): { storage: StorageService; stored: () => Settings | undefined } {
  const store = new Map<string, unknown>();
  if (saved !== undefined) {
    store.set(SETTINGS_KEY, saved);
  }
  return {
    storage: {
      save: <T>(key: string, value: T): void => {
        store.set(key, value);
      },
      load: <T>(key: string): T | null => (store.get(key) as T) ?? null,
      remove: (key: string): void => {
        store.delete(key);
      },
    },
    stored: () => store.get(SETTINGS_KEY) as Settings | undefined,
  };
}

const display = { toggleFocus: (): void => {} } as unknown as DisplayService;

/** Saves the settings with one general setting changed, as the dialog does. */
function saveGeneral(service: SettingsService, change: Partial<Settings['general']>): void {
  const settings = service.loadSettings();
  service.saveSettings({ ...settings, general: { ...settings.general, ...change } });
}

describe('SettingsService hoverMode from the chart', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should hover by default when the chart gives no mode', () => {
    const { storage } = workingStorage();
    expect(new SettingsService(storage, display).loadSettings().general.hoverMode).toBe('pointermove');
  });

  it('should start the chart in the mode it gives', () => {
    const { storage } = workingStorage();
    const service = new SettingsService(storage, display, { hoverMode: 'off' });

    expect(service.loadSettings().general.hoverMode).toBe('off');
    expect(service.get<string>('general.hoverMode')).toBe('off');
  });

  it('should keep a mode the reader chose over the chart\'s', () => {
    const { storage } = workingStorage({ general: { hoverMode: 'click' } });

    expect(new SettingsService(storage, display, { hoverMode: 'off' }).loadSettings().general.hoverMode)
      .toBe('click');
  });

  it('should not save the chart\'s mode as the reader\'s when another setting is saved', () => {
    const { storage, stored } = workingStorage();
    const service = new SettingsService(storage, display, { hoverMode: 'off' });

    saveGeneral(service, { volume: 20 });

    expect(service.loadSettings().general.hoverMode).toBe('off');
    expect(stored()?.general.volume).toBe(20);
    expect(stored()?.general.hoverMode).toBe('pointermove');
    expect(new SettingsService(storage, display).loadSettings().general.hoverMode).toBe('pointermove');
  });

  it('should save a mode the reader picks on the chart as theirs', () => {
    const { storage, stored } = workingStorage();
    const service = new SettingsService(storage, display, { hoverMode: 'off' });

    saveGeneral(service, { hoverMode: 'click' });

    expect(stored()?.general.hoverMode).toBe('click');
    expect(new SettingsService(storage, display, { hoverMode: 'off' }).loadSettings().general.hoverMode)
      .toBe('click');
  });

  it('should keep the default when the reader picks it over the chart\'s', () => {
    const { storage, stored } = workingStorage();
    const service = new SettingsService(storage, display, { hoverMode: 'off' });

    saveGeneral(service, { hoverMode: 'pointermove' });

    expect(stored()?.general.hoverMode).toBe('pointermove');
    expect(new SettingsService(storage, display, { hoverMode: 'off' }).loadSettings().general.hoverMode)
      .toBe('pointermove');
  });

  it('should keep the reader\'s mode through later saves', () => {
    const { storage, stored } = workingStorage();
    const service = new SettingsService(storage, display, { hoverMode: 'off' });

    saveGeneral(service, { hoverMode: 'click' });
    saveGeneral(service, { volume: 20 });

    expect(stored()?.general.hoverMode).toBe('click');
    expect(new SettingsService(storage, display).loadSettings().general.hoverMode).toBe('click');
  });

  it('should keep a mode saved before the reader\'s choice was marked', () => {
    const { storage } = workingStorage({ general: { hoverMode: 'off' } });

    expect(new SettingsService(storage, display, { hoverMode: 'click' }).loadSettings().general.hoverMode)
      .toBe('off');
  });

  it('should not write over a mode the reader picked on another chart since', () => {
    const { storage, stored } = workingStorage();
    const chartA = new SettingsService(storage, display, { hoverMode: 'off' });
    const chartB = new SettingsService(storage, display);

    saveGeneral(chartB, { hoverMode: 'click' });
    saveGeneral(chartA, { volume: 20 });

    expect(stored()?.general.hoverMode).toBe('click');
    expect(stored()?.general.volume).toBe(20);
    expect(new SettingsService(storage, display, { hoverMode: 'off' }).loadSettings().general.hoverMode)
      .toBe('click');
  });

  it('should come back to the chart\'s mode when the settings are reset', () => {
    const { storage, stored } = workingStorage({ general: { hoverMode: 'click' } });
    const service = new SettingsService(storage, display, { hoverMode: 'off' });

    expect(service.resetSettings().general.hoverMode).toBe('off');
    expect(stored()).toBeUndefined();
    expect(new SettingsService(storage, display, { hoverMode: 'off' }).loadSettings().general.hoverMode)
      .toBe('off');
  });

  it('should ignore a mode it does not know, with a warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { storage } = workingStorage();

    const service = new SettingsService(storage, display, { hoverMode: 'hover' });

    expect(service.loadSettings().general.hoverMode).toBe('pointermove');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hoverMode'));
  });
});
