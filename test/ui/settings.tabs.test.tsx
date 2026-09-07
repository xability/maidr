/**
 * @jest-environment jsdom
 */

/**
 * Component test for the settings dialog's tabs.
 *
 * The dialog used to render every setting in one scroll — roughly thirty rows
 * deep — so finding one meant paging past all the others. The rows are now
 * split across six tabs, which puts three things at risk that the flat list
 * could not get wrong:
 *
 * - **Edits have to survive a tab switch.** Only the selected panel is
 *   mounted, so an edit typed on one tab is no longer backed by a field in
 *   the DOM when Save is pressed from another. It has to be saved anyway.
 * - **The tablist has to be operable and named.** It is the only way to reach
 *   five of the six panels, by keyboard as much as by pointer.
 * - **A blocked Save has to stay explainable.** Save is disabled while the
 *   custom instruction is too short, and that field is on a tab the reader
 *   may not be looking at.
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

const TAB_LABELS = [
  'General',
  'Audio',
  'Visual',
  'Braille & Tactile',
  'AI',
  'About',
];

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
    // The tactile-display picker sits on one of the tabs. Nothing here
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
 * Selects a tab the way a pointer user does.
 * @param name - The tab's accessible name.
 */
function openTab(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('settings tabs', () => {
  it('should offer every section as a named tab', () => {
    renderSettings();

    // Named, because the tablist is the dialog's table of contents: a reader
    // arrowing through it hears these and nothing else.
    expect(
      screen.getAllByRole('tab').map(tab => tab.textContent),
    ).toEqual(TAB_LABELS);
    expect(screen.getByRole('tablist')).toHaveAccessibleName(
      'Settings sections',
    );
  });

  it('should open on General with only that panel mounted', () => {
    renderSettings();

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // One panel, not six hidden ones: the rows of the other five must not sit
    // in the accessibility tree waiting to be tabbed into.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByLabelText('Autoplay Duration')).toBeInTheDocument();
    expect(screen.queryByLabelText('Volume')).not.toBeInTheDocument();
  });

  it('should name each panel after the tab that opens it', () => {
    renderSettings();

    for (const label of TAB_LABELS) {
      openTab(label === 'AI' ? /^AI/ : label);

      const panel = screen.getByRole('tabpanel');
      const tab = screen.getByRole('tab', { selected: true });
      // Resolved through the DOM the way assistive technology resolves it, so
      // a reference that points at nothing fails here rather than passing on
      // the markup that was meant to produce it.
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel).toHaveAccessibleName(label);

      // The unselected tabs have no panel in the document, so they must not
      // name one: an `aria-controls` pointing at an absent id is a dangling
      // reference.
      for (const other of screen.getAllByRole('tab')) {
        if (other !== tab) {
          expect(other).not.toHaveAttribute('aria-controls');
        }
      }
    }
  });

  it('should keep an edit made on a tab the reader has left', () => {
    const saveAndClose = renderSettings();

    openTab('Audio');
    fireEvent.change(screen.getByLabelText('Volume'), {
      target: { value: '35' },
    });

    // The field that carried the edit is unmounted by this point, so what is
    // saved can only come from the dialog's own state.
    openTab('Visual');
    fireEvent.change(screen.getByLabelText('High Contrast Levels'), {
      target: { value: '7' },
    });
    openTab('General');
    fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON_NAME }));

    const [saved] = saveAndClose.mock.calls[0];
    expect(saved.general.volume).toBe(35);
    expect(saved.general.highContrastLevels).toBe(7);
  });

  it('should say where the edit blocking Save is when its tab is closed', () => {
    renderSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        expertiseLevel: 'custom',
        customInstruction: 'too short',
      },
    });

    // Disabled, and — now that the field can be several tabs away — with no
    // way to reach the reason from where the reader is standing. The hint and
    // the tab's badge are that way back.
    expect(screen.getByRole('button', { name: SAVE_BUTTON_NAME })).toBeDisabled();

    const hint = screen.getByText(
      'Custom instructions on the AI tab must be at least 10 characters long',
    );
    // A live region, so it reaches a reader who is on another tab when Save
    // goes disabled rather than only one who happens to read the footer.
    expect(hint).toHaveAttribute('role', 'status');
    // The visible label stays inside the accessible name rather than being
    // replaced by it, so "AI" is still what a reader hears the tab called.
    expect(
      screen.getByRole('tab', { name: 'AI needs attention' }),
    ).toBeInTheDocument();
  });

  it('should drop the footer hint on the tab that already shows the reason', () => {
    renderSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        expertiseLevel: 'custom',
        customInstruction: 'too short',
      },
    });

    openTab(/^AI/);

    // The panel's own warning sits beside the field. Repeating it in the
    // footer would announce the same sentence twice to a reader who is
    // already looking at the field it is about.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Custom instructions must be at least',
    );
    expect(
      screen.queryByText(/Custom instructions on the AI tab/),
    ).not.toBeInTheDocument();
  });
});
