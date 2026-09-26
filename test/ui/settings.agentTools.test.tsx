/**
 * @jest-environment jsdom
 */

/**
 * Component test for the reader's WebMCP setting on the General tab.
 *
 * The row is offered only where the browser has WebMCP: anywhere else the
 * toggle could do nothing, and a reader who turned it on would be told
 * something false. Where it is offered, it is a named checkbox carrying its
 * explanation as its description, and what it saves is what the tools follow.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
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
  | 'supportsAgentTools'
>;

/** The `ChatViewModel` surface `Settings` actually calls. */
type ChatStub = Pick<ChatViewModel, 'updateWelcomeMessage'>;

/**
 * Renders the settings dialog with stub view models.
 *
 * Only the leaves are stubbed: the registry is the production one, so the
 * component reaches its view models the same way it does at runtime.
 * @param supportsAgentTools - Whether the browser offers WebMCP.
 * @returns The `saveAndClose` stub, which carries what would be persisted.
 */
function renderSettings(supportsAgentTools: boolean): jest.Mock<SettingsViewModel['saveAndClose']> {
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
    supportsAgentTools,
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

describe('settings agent tools toggle', () => {
  it('should offer a named, described checkbox, on by default, where the browser has WebMCP', () => {
    renderSettings(true);

    const checkbox = screen.getByRole('checkbox', { name: 'Browser AI Agent Access' });

    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(/AI assistant built into your browser/);
  });

  it('should save the reader\'s choice to turn the tools off', () => {
    const saveAndClose = renderSettings(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Browser AI Agent Access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Close Settings' }));

    const [saved] = saveAndClose.mock.calls[0];
    expect(saved.general.agentTools).toBe(false);
  });

  it('should not offer the toggle where the browser has no WebMCP', () => {
    renderSettings(false);

    expect(screen.queryByRole('checkbox', { name: 'Browser AI Agent Access' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  });
});
