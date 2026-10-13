/**
 * The settings in the store follow the settings service, whoever saves them.
 *
 * The dialog saves through the view model, which dispatches as it saves. High
 * contrast mode is saved by its key, through HighContrastService, which no
 * view model sits in front of: the store kept the old mode, and the braille
 * and review fields, which re-check their colours when it changes, never
 * heard of it.
 */
import type { DisplayService } from '@service/display';
import type { HelpService } from '@service/help';
import type { StorageService } from '@service/storage';
import { describe, expect, it } from '@jest/globals';
import { SettingsService } from '@service/settings';
import { createMaidrStore } from '@state/store';
import { SettingsViewModel } from '@state/viewModel/settingsViewModel';

// The node environment has `structuredClone`; this keeps the suite working if
// it moves to jsdom, which does not.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

/** Storage that keeps nothing. */
const storage: StorageService = {
  save: (): void => {},
  load: <T>(): T | null => null,
  remove: (): void => {},
};

const display = { toggleFocus: (): void => {} } as unknown as DisplayService;
const help = {} as Pick<HelpService, never> as HelpService;

/** Saves high contrast mode as HighContrastService does: on the service. */
function toggleHighContrast(service: SettingsService): void {
  const settings = service.loadSettings();
  service.saveSettings({
    ...settings,
    general: { ...settings.general, highContrastMode: !settings.general.highContrastMode },
  });
}

describe('settingsViewModel', () => {
  it('should put settings saved on the service into the store', () => {
    const store = createMaidrStore();
    const service = new SettingsService(storage, display);
    const viewModel = new SettingsViewModel(store, service, help);

    toggleHighContrast(service);

    expect(store.getState().settings.general.highContrastMode).toBe(true);
    viewModel.dispose();
  });

  it('should stop following the service once disposed', () => {
    const store = createMaidrStore();
    const service = new SettingsService(storage, display);
    const viewModel = new SettingsViewModel(store, service, help);
    viewModel.dispose();

    toggleHighContrast(service);

    expect(store.getState().settings.general.highContrastMode).toBe(false);
  });
});
