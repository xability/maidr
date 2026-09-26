import type { DisplayService } from '@service/display';
import type { StorageService } from '@service/storage';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  readAgentToolsChoice,
  rememberAgentToolsChoice,
  SETTINGS_KEY,
  SettingsService,
} from '@service/settings';

// `jest-environment-jsdom` does not expose `structuredClone`, which
// `SettingsService` uses to clone the default settings.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

/** Storage that keeps what it is given. */
function workingStorage(saved?: unknown): StorageService {
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

/** Storage that keeps nothing, as in a private window. */
function brokenStorage(): StorageService {
  return {
    save: (): void => {},
    load: <T>(): T | null => null,
    remove: (): void => {},
  };
}

const display = { toggleFocus: (): void => {} } as unknown as DisplayService;

describe('SettingsService agentTools', () => {
  afterEach(() => {
    rememberAgentToolsChoice(null);
  });

  it('should show the default when the reader has chosen nothing on this page', () => {
    expect(new SettingsService(brokenStorage(), display).loadSettings().general.agentTools).toBe(true);
    expect(readAgentToolsChoice(brokenStorage())).toBe(true);
  });

  it('should read a saved choice from storage', () => {
    const storage = workingStorage({ general: { agentTools: false } });

    expect(new SettingsService(storage, display).loadSettings().general.agentTools).toBe(false);
    expect(readAgentToolsChoice(storage)).toBe(false);
  });

  it('should show the choice made in another chart on this page when storage kept nothing', () => {
    // The first chart's dialog turned the tools off; saving went nowhere.
    rememberAgentToolsChoice(false);

    // The second chart builds its settings from storage when it gains focus.
    const next = new SettingsService(brokenStorage(), display);

    expect(next.loadSettings().general.agentTools).toBe(false);
    expect(readAgentToolsChoice(brokenStorage())).toBe(false);
  });

  it('should prefer the choice made on this page over an older saved one', () => {
    rememberAgentToolsChoice(true);
    const storage = workingStorage({ general: { agentTools: false } });

    expect(new SettingsService(storage, display).loadSettings().general.agentTools).toBe(true);
  });

  it('should leave the defaults untouched for a reset', () => {
    rememberAgentToolsChoice(false);
    const service = new SettingsService(brokenStorage(), display);

    expect(service.resetSettings().general.agentTools).toBe(true);
  });
});
