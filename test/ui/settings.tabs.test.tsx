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

  it('should move focus along the tablist without selecting as it goes', () => {
    renderSettings();

    // `docs/BRAILLE.md` tells blind readers to Tab to the tablist, arrow to
    // "Braille & Tactile" and press Enter. This covers the arrow half of that
    // sequence: focus has to move without selecting, or a reader arrowing
    // past a tab would open every panel they cross — which for the AI panel
    // means contacting a provider they were only passing.
    //
    // The Enter half is deliberately not asserted here. `Tab` is a `<button>`,
    // so Enter reaches it as a synthesised click, and jsdom does not
    // synthesise one. `dialogAccessibility.spec.ts` walks the whole documented
    // sequence in a real browser instead.
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    }

    expect(document.activeElement).toHaveTextContent('Braille & Tactile');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('General');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('General');
  });

  it('should keep a visited panel mounted so re-entering it costs nothing', () => {
    renderSettings();

    openTab(/^AI/);
    const field = screen.getByLabelText('OpenAI API Key');

    openTab('General');

    // Still the same element, not a replacement: `useCredentialProbe` keys
    // its result to the hook instance, so a remount would drop back to
    // "unknown" — re-sending the key and disabling the model dropdown the
    // reader had already been given.
    openTab(/^AI/);
    expect(screen.getByLabelText('OpenAI API Key')).toBe(field);
  });

  it('should keep an unvisited panel out of the document entirely', () => {
    renderSettings();

    // The other side of that bargain: nothing of the AI panel exists until
    // the reader asks for it, so no provider is contacted for a reader who
    // never opens it.
    expect(screen.queryByLabelText('OpenAI API Key')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    openTab(/^AI/);
    openTab('General');

    // Visited and now hidden, so it is out of the accessibility tree even
    // though it is still in the DOM.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(
      screen.getByRole('tabpanel'),
    ).toHaveAccessibleName('General');
  });

  it('should keep an LLM edit made on a tab the reader has left', () => {
    const saveAndClose = renderSettings();

    openTab(/^AI/);
    // The label names the MUI wrapper, so the field itself is the input
    // inside it — the same shape `settings.probeStatus.test.tsx` reaches for.
    const field = screen
      .getByLabelText('OpenAI API Key')
      .querySelector('input') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'sk-typed-on-the-ai-tab' } });

    openTab('About');
    fireEvent.click(screen.getByRole('button', { name: SAVE_BUTTON_NAME }));

    const [saved] = saveAndClose.mock.calls[0];
    expect(saved.llm.models.OPENAI.apiKey).toBe('sk-typed-on-the-ai-tab');
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

    // Marked unavailable rather than `disabled`, so it keeps its place in the
    // tab order and the reason stays reachable from the button itself.
    const save = screen.getByRole('button', { name: SAVE_BUTTON_NAME });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toBeDisabled();

    // Two nodes carry the reason, and each has a job the other cannot do.
    // The footer's is a live region: it announces the moment Save becomes
    // unavailable, to a reader who is looking elsewhere.
    const hint = document.querySelector('.settings-footer-hint');
    expect(hint).toHaveAttribute('role', 'status');
    expect(hint).toHaveTextContent(
      'Custom instructions on the AI tab must be at least 10 characters long',
    );

    // The button's is a description, read when the reader arrives at it —
    // which a live region fired minutes earlier would not be.
    const describedBy = save.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'Custom instructions on the AI tab must be at least 10 characters long',
    );
    // The visible label stays inside the accessible name rather than being
    // replaced by it, so "AI" is still what a reader hears the tab called.
    expect(
      screen.getByRole('tab', { name: 'AI needs attention' }),
    ).toBeInTheDocument();
  });

  it('should announce the footer hint by mutating a region that was already there', async () => {
    renderSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        expertiseLevel: 'custom',
        customInstruction: 'too short',
      },
    });

    openTab(/^AI/);

    // The region has to exist before its text does. Observed rather than
    // asserted on the text, because the text alone reads the same whether the
    // region was mutated or created holding it — and only the mutation is
    // what a screen reader announces.
    const region = document.querySelector('.settings-footer-hint');
    expect(region).not.toBeNull();

    const mutations: string[] = [];
    const observer = new MutationObserver(() => {
      mutations.push((region as HTMLElement).textContent ?? '');
    });
    observer.observe(region as HTMLElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    // Leaving the AI tab is the only way the hint can appear: the fields that
    // invalidate the instruction are on the tab that suppresses it.
    openTab('General');
    // `MutationObserver` delivers on a microtask, so the records are not in
    // hand until the queue drains.
    await Promise.resolve();
    observer.disconnect();

    expect(mutations).not.toHaveLength(0);
    expect(mutations[mutations.length - 1]).toBe(
      'Custom instructions on the AI tab must be at least 10 characters long',
    );
  });

  it('should open the tab holding the reason when a blocked Alt+S is pressed', () => {
    renderSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        expertiseLevel: 'custom',
        customInstruction: 'too short',
      },
    });

    // The dialog advertises Alt+S on the Save button, and `docs/BRAILLE.md`
    // tells readers to use it. Swallowing the keypress leaves someone who
    // took that advice with no response of any kind — so it takes them to
    // the field instead.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 's', altKey: true });

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('AI');
    // The panel is named by the badged tab, so entering it repeats why the
    // reader was sent here.
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('AI needs attention');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Custom instructions must be at least',
    );
  });

  it('should keep an unavailable Save reachable and answering', () => {
    const saveAndClose = renderSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        expertiseLevel: 'custom',
        customInstruction: 'too short',
      },
    });

    const save = screen.getByRole('button', { name: SAVE_BUTTON_NAME });
    // In the tab order, which `disabled` would have taken it out of — the
    // whole point, since a button a reader never reaches cannot explain
    // itself however good its description is.
    expect(save).not.toHaveAttribute('tabindex', '-1');
    save.focus();
    expect(document.activeElement).toBe(save);

    fireEvent.click(save);

    // Answers rather than doing nothing, and answers the same way the
    // shortcut does — the two go through one path.
    expect(saveAndClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'AI needs attention' }),
    );
  });

  it('should move focus to that tab every time a save is refused', () => {
    renderSettings({
      ...DEFAULT_SETTINGS,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        expertiseLevel: 'custom',
        customInstruction: 'too short',
      },
    });

    // Open the AI tab first, which is the ordinary case: it is where the
    // instruction was typed. Its panel — and the warning inside it — is
    // mounted from then on, so selecting it again changes nothing in the DOM
    // and announces nothing on its own. Moving focus is the whole response.
    openTab(/^AI/);
    openTab('General');

    // Twice, because a second refusal must answer as loudly as the first. It
    // is the repeat that a state flag would have swallowed.
    for (let attempt = 1; attempt <= 2; attempt++) {
      (screen.getByLabelText('Autoplay Duration') as HTMLElement).focus();

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 's', altKey: true });

      expect(document.activeElement).toBe(
        screen.getByRole('tab', { name: 'AI needs attention' }),
      );
      // Selected before focus arrives, so the tab is not announced as an
      // unselected one the reader has merely landed on.
      expect(document.activeElement).toHaveAttribute('aria-selected', 'true');

      openTab('General');
    }
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
    // The footer's own region specifically: the Save button's description
    // carries similar words and is meant to be there on every tab.
    expect(document.querySelector('.settings-footer-hint')).toHaveTextContent('');
  });
});
