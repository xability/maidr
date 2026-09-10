/**
 * @jest-environment jsdom
 */

/**
 * Component test for the settings dialog's language selector.
 *
 * The dialog is the only place a reader can choose the language MAIDR speaks,
 * which puts two things at risk that nothing else covers:
 *
 * - **The choice has to reach the settings service.** The selector is bound to
 *   `general.language` and saved through the ordinary Save path; a picker that
 *   renders but persists nothing leaves the reader in a language they did not
 *   ask for, with no other way to change it.
 * - **The dialog has to speak the active language itself.** Every string in it
 *   is rendered through `useLocale`, so a locale change has to rename the
 *   dialog rather than leaving the reader who just chose Korean looking at an
 *   English dialog that claims to have applied their choice.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { Settings as SettingsState } from '@type/settings';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Settings from '@ui/component/Settings';
import { setLocale } from '@util/i18n';
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

const SAVE_BUTTON_NAME = 'Save & Close Settings';

/**
 * Renders the settings dialog with stub view models.
 *
 * Only the leaves are stubbed: the registry is the production one, so the
 * component reaches its view models the same way it does at runtime.
 * @param state - The settings the dialog opens with.
 * @returns The `saveAndClose` stub, which carries what would be persisted.
 */
function renderSettings(
  state: SettingsState = DEFAULT_SETTINGS,
): jest.Mock<SettingsViewModel['saveAndClose']> {
  const saveAndClose = jest.fn<SettingsViewModel['saveAndClose']>();
  const settings: SettingsStub = {
    state,
    load: jest.fn(),
    reset: jest.fn(),
    toggle: jest.fn(),
    saveAndClose,
    // The tactile-display picker sits on another tab. Nothing here exercises
    // it, but the component reads its state on every render and subscribes on
    // mount, so the stub has to answer both.
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

// The active locale is module state shared by every suite in this worker, so
// a test that switches it has to hand it back.
afterEach(() => {
  setLocale('en');
});

describe('settings language selector', () => {
  it('should offer the language as the General tab\'s first row, following the browser by default', () => {
    renderSettings();

    // On the tab the dialog opens on, so a reader who cannot read the current
    // language does not have to navigate a tablist they cannot read to find
    // the control that fixes that.
    const combobox = screen.getByRole('combobox', { name: 'Language' });
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveTextContent('Browser default');

    // First of the panel's rows: the labels are read in order, and this one
    // has to come before the settings it renames.
    const labels = Array.from(
      screen.getByRole('tabpanel').querySelectorAll('.settings-grid-container'),
    ).map(row => row.textContent ?? '');
    expect(labels[0]).toContain('Language');
  });

  it('should name each language in itself', () => {
    renderSettings();

    // A reader who does not read English has to be able to find their own
    // language in the list, so the options are not translated.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Language' }));

    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '한국어' })).toBeInTheDocument();
  });

  it('should send the chosen language to the settings service on save', () => {
    const saveAndClose = renderSettings();

    // A MUI `Select`, so it opens on mousedown and commits on the option
    // click rather than taking a value the way a native select would.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Language' }));
    fireEvent.click(screen.getByRole('option', { name: '한국어' }));
    fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON_NAME }));

    // `SettingsService` resolves and applies the locale on save, so reaching
    // it with the preference is the whole of the dialog's part.
    const [saved] = saveAndClose.mock.calls[0];
    expect(saved.general.language).toBe('ko');
  });

  it('should show the stored language rather than the browser default', () => {
    renderSettings({
      ...DEFAULT_SETTINGS,
      general: { ...DEFAULT_SETTINGS.general, language: 'ko' },
    });

    expect(
      screen.getByRole('combobox', { name: 'Language' }),
    ).toHaveTextContent('한국어');
  });

  it('should render the dialog in the active language', () => {
    setLocale('ko');

    renderSettings({
      ...DEFAULT_SETTINGS,
      general: { ...DEFAULT_SETTINGS.general, language: 'ko' },
    });

    // The dialog's name is the one thing a reader hears on arrival, so it is
    // the first place an untranslated string would strand them.
    expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '설정', level: 2 }),
    ).toBeInTheDocument();
    // The label is translated while the options stay in their own languages.
    expect(
      screen.getByRole('combobox', { name: '언어' }),
    ).toHaveTextContent('한국어');
  });
});
