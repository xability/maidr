/**
 * @jest-environment jsdom
 */

/**
 * Component test for what the LLM credential field reports after a probe.
 *
 * `LlmValidationService.probeProvider` answers with a reason, and the dialog
 * used to drop it: every failure rendered as "<Provider> API key is invalid"
 * and disabled the model dropdown. A rate limit or a provider outage then told
 * a user with a working key to go and replace it, and the status region — the
 * element the credential field's `aria-describedby` points at, and the only
 * part of this a screen reader hears — announced the same wrong thing.
 *
 * The assertions go through that status region rather than the visible helper
 * text for exactly that reason.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { Settings as SettingsState } from '@type/settings';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Settings from '@ui/component/Settings';
// The `/jest-globals` entry point, not the bare one: it augments the `expect`
// imported from @jest/globals rather than the ambient global.
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

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

/** Settings with one enabled provider, so exactly one probe runs. */
const SETTINGS_WITH_OPENAI_KEY: SettingsState = {
  ...DEFAULT_SETTINGS,
  llm: {
    ...DEFAULT_SETTINGS.llm,
    models: {
      ...DEFAULT_SETTINGS.llm.models,
      OPENAI: { ...DEFAULT_SETTINGS.llm.models.OPENAI, enabled: true, apiKey: 'sk-test' },
    },
  },
};

/**
 * Renders the settings dialog with stub view models.
 *
 * Only the leaves are stubbed: the registry is the production one, so the
 * component reaches its view models the same way it does at runtime.
 */
function renderSettings(): void {
  const settings: SettingsStub = {
    state: SETTINGS_WITH_OPENAI_KEY,
    load: jest.fn(),
    reset: jest.fn(),
    toggle: jest.fn(),
    saveAndClose: jest.fn(),
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
  const chat: ChatStub = {
    updateWelcomeMessage: jest.fn(),
  };

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
}

/**
 * Waits for the OpenAI credential status region to report a settled result.
 *
 * The probe is debounced by 500 ms, so the region is empty and then
 * "Validating API key" before it carries an outcome.
 * @returns The announcement the status region ends up carrying.
 */
async function settledAnnouncement(): Promise<string> {
  // The label sits on the MUI wrapper and the description on the native
  // input inside it, so the region is reached the way the input names it.
  const field = await screen.findByLabelText('OpenAI API Key');
  const statusId = field.querySelector('input')?.getAttribute('aria-describedby');
  expect(statusId).toBeTruthy();

  const status = document.getElementById(statusId as string);
  expect(status).not.toBeNull();

  await waitFor(
    () => {
      const label = status?.getAttribute('aria-label') ?? '';
      expect(label).not.toBe('');
      expect(label).not.toBe('Validating API key');
    },
    { timeout: 3000 },
  );

  return status?.getAttribute('aria-label') ?? '';
}

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  fetchMock.mockReset();
});

// Restore the real fetch so the mock cannot leak into other suites sharing
// this worker environment.
afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('settings LLM section: what a failed probe reports', () => {
  it('should name the status a provider returned rather than blaming the key', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 } as Response);
    renderSettings();

    const announcement = await settledAnnouncement();

    expect(announcement).toContain('429');
    expect(announcement).not.toContain('invalid');
  });

  it('should still report a rejected credential as an invalid key', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
    renderSettings();

    const announcement = await settledAnnouncement();

    expect(announcement.toLowerCase()).toContain('invalid');
  });
});
