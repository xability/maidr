/**
 * @jest-environment jsdom
 */

/**
 * Component test for what the settings dialog persists as the pitch range.
 *
 * The two frequency fields are free-typed numbers, and the audio service maps
 * every data point into `[minFrequency, maxFrequency]` with no clamp of its
 * own. A range that does not rise carries no pitch information at all: with a
 * max of 0 the tones are sub-audible, and with a min above the max higher
 * values sound *lower*. Either one survives a reload, because it is written to
 * localStorage — only "Reset" clears it.
 *
 * The assertions are on the range's properties (audible, increasing) rather
 * than on a particular fallback, because those are what the sonification
 * actually depends on.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { Settings as SettingsState } from '@type/settings';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Settings from '@ui/component/Settings';
// The `/jest-globals` entry point augments the imported `expect`; the bare
// one only augments the ambient global.
import '@testing-library/jest-dom/jest-globals';

/** The `SettingsViewModel` surface `Settings` actually calls. */
type SettingsStub = Pick<
  SettingsViewModel,
  | 'state'
  | 'load'
  | 'reset'
  | 'toggle'
  | 'saveAndClose'
  | 'tactileDisplayState'
  | 'onTactileDisplayStateChange'
  | 'supportsTactileTransport'
  | 'connectTactileDisplay'
  | 'disconnectTactileDisplay'
  | 'preloadTactileDisplay'
>;

/** The `ChatViewModel` surface `Settings` actually calls. */
type ChatStub = Pick<ChatViewModel, 'updateWelcomeMessage'>;

/** The lowest pitch a listener can be expected to hear. */
const AUDIBLE_FLOOR_HZ = 20;

/**
 * Renders the settings dialog with stub view models.
 *
 * Only the leaves are stubbed: the registry is the production one, so the
 * component reaches its view models the same way it does at runtime.
 * @returns The `saveAndClose` stub, which carries what would be persisted.
 */
function renderSettings(): jest.Mock<SettingsViewModel['saveAndClose']> {
  const saveAndClose = jest.fn<SettingsViewModel['saveAndClose']>();
  const settings: SettingsStub = {
    state: DEFAULT_SETTINGS,
    load: jest.fn(),
    reset: jest.fn(),
    toggle: jest.fn(),
    saveAndClose,
    // The tactile-display picker sits in the same dialog. Nothing here
    // exercises it, but the component reads its state on every render and
    // subscribes on mount, so the stub has to answer both.
    tactileDisplayState: {
      status: 'disconnected',
      deviceName: null,
      transport: null,
      geometry: null,
      message: '',
    },
    onTactileDisplayStateChange: jest.fn(() => ({ dispose: jest.fn() })),
    supportsTactileTransport: jest.fn(() => false),
    connectTactileDisplay: jest.fn(async () => ({
      status: 'disconnected' as const,
      deviceName: null,
      transport: null,
      geometry: null,
      message: '',
    })),
    disconnectTactileDisplay: jest.fn(),
    preloadTactileDisplay: jest.fn(),
  };
  const chat: ChatStub = { updateWelcomeMessage: jest.fn() };

  const registry = new ViewModelRegistry();
  registry.register('settings', settings as SettingsViewModel);
  registry.register('chat', chat as ChatViewModel);

  render(
    <MaidrContext.Provider
      value={{
        viewModelRegistry: registry,
        commandExecutor: {} as unknown as CommandExecutor,
      }}
    >
      <Settings />
    </MaidrContext.Provider>,
  );

  return saveAndClose;
}

/**
 * Types the two frequency fields, saves, and reports what was persisted.
 * @param minFrequency - What to type into the Min Frequency field.
 * @param maxFrequency - What to type into the Max Frequency field.
 * @returns The general settings handed to `saveAndClose`.
 */
function savedGeneral(minFrequency: string, maxFrequency: string): SettingsState['general'] {
  const saveAndClose = renderSettings();

  fireEvent.change(screen.getByLabelText('Minimum Frequency'), {
    target: { value: minFrequency },
  });
  fireEvent.change(screen.getByLabelText('Maximum Frequency'), {
    target: { value: maxFrequency },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save & Close Settings' }));

  const [saved] = saveAndClose.mock.calls[0];
  return saved.general;
}

describe('settings pitch range', () => {
  it('should not persist a cleared max frequency as silence', () => {
    const general = savedGeneral('200', '');

    expect(general.maxFrequency).toBeGreaterThanOrEqual(AUDIBLE_FLOOR_HZ);
    expect(general.maxFrequency).toBeGreaterThan(general.minFrequency);
  });

  it('should not persist a cleared min frequency as silence', () => {
    const general = savedGeneral('', '1000');

    expect(general.minFrequency).toBeGreaterThanOrEqual(AUDIBLE_FLOOR_HZ);
    expect(general.maxFrequency).toBeGreaterThan(general.minFrequency);
  });

  it('should not persist a range that runs backwards', () => {
    const general = savedGeneral('900', '300');

    expect(general.maxFrequency).toBeGreaterThan(general.minFrequency);
  });

  it('should keep a range the user typed correctly', () => {
    const general = savedGeneral('300', '900');

    expect(general.minFrequency).toBe(300);
    expect(general.maxFrequency).toBe(900);
  });
});
