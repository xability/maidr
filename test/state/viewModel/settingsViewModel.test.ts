import type { HelpService } from '@service/help';
import type { SettingsService } from '@service/settings';
import type { Settings } from '@type/settings';
import { describe, expect, it, jest } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { DEFAULT_SETTINGS } from '@type/settings';

/**
 * Settings change outside the dialog too: the C key toggles high contrast
 * through the service directly. The view reads settings from the store, so
 * the store has to follow every change the service announces, or the view
 * keeps drawing for the mode the reader just left.
 */
describe('SettingsViewModel', () => {
  function createService(): {
    service: SettingsService;
    fire: (settings: Settings) => void;
    disposed: jest.Mock;
  } {
    let listener: ((event: { oldSettings: Settings; newSettings: Settings }) => void) | null = null;
    const disposed = jest.fn();
    const service = {
      loadSettings: () => DEFAULT_SETTINGS,
      onChange: (l: typeof listener) => {
        listener = l;
        return { dispose: disposed };
      },
    } as unknown as SettingsService;
    return {
      service,
      fire: settings => listener?.({ oldSettings: DEFAULT_SETTINGS, newSettings: settings }),
      disposed,
    };
  }

  it('follows a change the service makes outside the dialog', () => {
    const store = createMaidrStore();
    const { service, fire } = createService();
    const vm = new SettingsViewModel(store, service, {} as HelpService);

    fire({ ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, highContrastMode: true } });

    expect(store.getState().settings.general.highContrastMode).toBe(true);
    vm.dispose();
  });

  it('stops following the service once disposed', () => {
    const store = createMaidrStore();
    const { service, disposed } = createService();
    const vm = new SettingsViewModel(store, service, {} as HelpService);

    vm.dispose();

    expect(disposed).toHaveBeenCalled();
  });
});
