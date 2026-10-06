/**
 * @jest-environment jsdom
 */

/**
 * Component test for the Tactile Graphics Display row on the Braille & Tactile
 * tab, now that it offers two kinds of device reached two different ways.
 *
 * A DotPad is connected over Bluetooth or USB, a Monarch over WebHID, which
 * finds it on a cable or paired over Bluetooth alike. So the connect buttons
 * follow the device picked, picking one opens its own picker at once, and the
 * status line says how the display was reached without naming a transport the
 * page cannot know.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsState, SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { DotPadState, DotPadTransport } from '@type/dotPad';
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

const DISCONNECTED: DotPadState = {
  status: 'disconnected',
  deviceName: null,
  transport: null,
  geometry: null,
  message: '',
};

/**
 * Renders the settings dialog on its Braille & Tactile tab.
 * @param options - What the dialog opens with
 * @param options.state - The saved settings
 * @param options.tactile - The tactile display's connection state
 * @param options.reachable - The transports the page can use
 * @returns The stub view model, for its recorded calls
 */
function renderSettings(options: {
  state?: SettingsState;
  tactile?: DotPadState;
  reachable?: DotPadTransport[];
} = {}): SettingsStub {
  const settings: SettingsStub = {
    state: options.state ?? DEFAULT_SETTINGS,
    load: jest.fn(),
    reset: jest.fn(),
    toggle: jest.fn(),
    saveAndClose: jest.fn(),
    tactileDisplayState: options.tactile ?? DISCONNECTED,
    onTactileDisplayStateChange: jest.fn(() => ({ dispose: jest.fn() })),
    supportsTactileTransport: jest.fn((transport: DotPadTransport) =>
      (options.reachable ?? ['bluetooth', 'serial', 'hid']).includes(transport)),
    connectTactileDisplay: jest.fn(async () => DISCONNECTED),
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
  fireEvent.click(screen.getByRole('tab', { name: 'Braille & Tactile' }));
  return settings;
}

/**
 * The Tactile Graphics Display menu: the combobox the connection status
 * describes.
 */
function deviceMenu(): HTMLElement {
  const menu = screen.getAllByRole('combobox')
    .find(box => box.getAttribute('aria-describedby')?.endsWith('-tactile-status'));
  if (menu === undefined) {
    throw new Error('no tactile display menu');
  }
  return menu;
}

/**
 * Picks a device from the Tactile Graphics Display menu.
 * @param name - The option's accessible name
 */
function pickDevice(name: string): void {
  // A MUI `Select`: it opens on mousedown and commits on the option click.
  fireEvent.mouseDown(deviceMenu());
  fireEvent.click(screen.getByRole('option', { name }));
}

/**
 * The settings with a tactile display already chosen.
 * @param deviceId - The device
 */
function withDevice(deviceId: string): SettingsState {
  return { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, tactileDisplayDeviceId: deviceId } };
}

describe('settings tactile display', () => {
  it('should offer the Monarch beside the Dot Pad', () => {
    renderSettings();

    fireEvent.mouseDown(deviceMenu());

    expect(screen.getByRole('option', { name: 'Dot Pad X — Dot Inc.' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Monarch — APH / HumanWare' })).toBeInTheDocument();
  });

  it('should open the Monarch\'s picker as soon as the Monarch is picked', () => {
    // Picking is the click the browser's picker needs; asking for a second
    // click would only be a step where the reader can get lost.
    const settings = renderSettings();

    pickDevice('Monarch — APH / HumanWare');

    expect(settings.connectTactileDisplay).toHaveBeenCalledWith('hid');
  });

  it('should still open the Bluetooth picker when the Dot Pad is picked', () => {
    const settings = renderSettings();

    pickDevice('Dot Pad X — Dot Inc.');

    expect(settings.connectTactileDisplay).toHaveBeenCalledWith('bluetooth');
  });

  it('should offer one Connect button for the Monarch', () => {
    // WebHID finds a Monarch on a cable and over Bluetooth alike, so a button
    // naming one would send a reader with the other looking for a button that
    // is not there.
    const settings = renderSettings({ state: withDevice('monarch') });

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(settings.connectTactileDisplay).toHaveBeenCalledWith('hid');
    expect(screen.queryByRole('button', { name: 'Connect over Bluetooth' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect over USB' })).toBeNull();
  });

  it('should keep the Bluetooth and USB buttons for the Dot Pad, and before any device is picked', () => {
    renderSettings();

    expect(screen.getByRole('button', { name: 'Connect over Bluetooth' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect over USB' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  });

  it('should grey out the Monarch\'s button where the page cannot use WebHID', () => {
    renderSettings({ state: withDevice('monarch'), reachable: ['bluetooth', 'serial'] });

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('should say a Monarch is connected without naming a transport', () => {
    renderSettings({
      state: withDevice('monarch'),
      tactile: { status: 'connected', deviceName: 'Monarch', transport: 'hid', geometry: null, message: '' },
    });

    // The status describes the device menu, so it is read with it.
    expect(deviceMenu()).toHaveAccessibleDescription('Connected to Monarch. Press b on the chart to show it.');
  });

  it('should preload for the device that was picked', () => {
    const settings = renderSettings({ state: withDevice('monarch') });

    expect(settings.preloadTactileDisplay).toHaveBeenCalledWith('monarch');
  });
});
