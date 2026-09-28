/**
 * @jest-environment jsdom
 */

/**
 * Component tests for changing a shortcut (#189), which is done in the
 * settings dialog's Keyboard Shortcuts tab, and for the help dialog, which
 * only lists the keys.
 *
 * The panel has to name the action in each button so a screen reader user
 * knows which shortcut they are changing, capture the next key rather than
 * run it, let Escape keep the old shortcut, and hand the result to the
 * dialog as an unsaved edit rather than saving it.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { HelpMenuItem, RebindResult } from '@type/help';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import Help from '@ui/component/Help';
import ShortcutSettings from '@ui/component/ShortcutSettings';
import { Provider } from 'react-redux';
// The `/jest-globals` entry point augments the imported `expect`; the bare
// one only augments the ambient global.
import '@testing-library/jest-dom/jest-globals';

type Overrides = Readonly<Record<string, string>>;
type SettingsStub = Pick<SettingsViewModel, 'shortcuts' | 'rebindShortcut' | 'resetShortcut' | 'resetAllShortcuts'>;

const ITEMS: HelpMenuItem[] = [
  { description: 'Toggle Braille Mode', key: 'b', commandKey: 'TOGGLE_BRAILLE', section: 'modes' },
  { description: 'Toggle Text Mode', key: 'shift + t', commandKey: 'TOGGLE_TEXT', isCustom: true, defaultKey: 't', section: 'modes' },
];

interface Harness {
  settings: { [K in keyof SettingsStub]: jest.Mock<SettingsStub[K]> };
  onOverridesChange: jest.Mock<(overrides: Overrides) => void>;
  onRecordingChange: jest.Mock<(recording: boolean) => void>;
}

function result(changed: boolean, message: string, overrides: Overrides = {}): RebindResult {
  return { changed, message, overrides };
}

function renderPanel(items: HelpMenuItem[] = ITEMS, overrides: Overrides = { TOGGLE_TEXT: 'shift+t' }): Harness {
  const settings = {
    shortcuts: jest.fn<SettingsStub['shortcuts']>(() => items),
    rebindShortcut: jest.fn<SettingsStub['rebindShortcut']>(() => result(true, 'Toggle Braille Mode is now shift + x.', { TOGGLE_BRAILLE: 'shift+x' })),
    resetShortcut: jest.fn<SettingsStub['resetShortcut']>(() => result(true, 'Toggle Text Mode restored to t.')),
    resetAllShortcuts: jest.fn<SettingsStub['resetAllShortcuts']>(() => result(true, 'All shortcuts restored to their defaults.')),
  };
  const onOverridesChange = jest.fn<(overrides: Overrides) => void>();
  const onRecordingChange = jest.fn<(recording: boolean) => void>();
  const registry = new ViewModelRegistry();
  registry.register('settings', settings as unknown as SettingsViewModel);

  render(
    <MaidrContext.Provider
      value={{ viewModelRegistry: registry, commandExecutor: {} as unknown as CommandExecutor }}
    >
      <ShortcutSettings
        overrides={overrides}
        onOverridesChange={onOverridesChange}
        onRecordingChange={onRecordingChange}
      />
    </MaidrContext.Provider>,
  );
  return { settings, onOverridesChange, onRecordingChange };
}

describe('the Keyboard Shortcuts tab', () => {
  it('offers a Change button named after each action', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change shortcut for Toggle Text Mode' })).toBeInTheDocument();
  });

  it('shows a changed row\'s default beside its key, with a way back', () => {
    renderPanel();

    expect(screen.getByText('shift + t (custom, default t)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore the default shortcut for Toggle Text Mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore all default shortcuts' })).toBeInTheDocument();
  });

  it('offers no restore-all when nothing is changed', () => {
    renderPanel([ITEMS[0]], {});

    expect(screen.queryByRole('button', { name: 'Restore all default shortcuts' })).not.toBeInTheDocument();
  });

  it('names each group of shortcuts', () => {
    renderPanel();

    expect(screen.getByRole('group', { name: 'Modes' })).toBeInTheDocument();
  });
});

describe('recording a new shortcut', () => {
  it('prompts, then hands the next key over as a combo and keeps the result as an edit', () => {
    const harness = renderPanel();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Press the new shortcut for Toggle Braille Mode. Escape cancels; Backspace restores the default.',
    );
    expect(screen.getByText('Press keys…')).toBeInTheDocument();
    expect(harness.onRecordingChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(change, { key: 'X', code: 'KeyX', shiftKey: true });

    expect(harness.settings.rebindShortcut).toHaveBeenCalledWith('TOGGLE_BRAILLE', 'shift+x', { TOGGLE_TEXT: 'shift+t' });
    expect(harness.onOverridesChange).toHaveBeenCalledWith({ TOGGLE_BRAILLE: 'shift+x' });
    expect(harness.onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('status')).toHaveTextContent('Toggle Braille Mode is now shift + x.');
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
  });

  it('announces a refusal and changes nothing', () => {
    const harness = renderPanel();
    harness.settings.rebindShortcut.mockReturnValue(result(false, 'b is already used by Toggle Braille Mode.'));
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Text Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'b', code: 'KeyB' });

    expect(harness.onOverridesChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('b is already used by Toggle Braille Mode.');
  });

  it('waits through a modifier on its own', () => {
    const harness = renderPanel();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Shift', code: 'ShiftLeft', shiftKey: true });

    expect(harness.settings.rebindShortcut).not.toHaveBeenCalled();
    expect(screen.getByText('Press keys…')).toBeInTheDocument();
  });

  it('keeps the old shortcut on Escape, without the key reaching the dialog', () => {
    const harness = renderPanel();
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Escape', code: 'Escape' });
    document.removeEventListener('keydown', outer);

    expect(harness.settings.rebindShortcut).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Shortcut unchanged.');
    expect(harness.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it('restores the default on Backspace', () => {
    const harness = renderPanel();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Text Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Backspace', code: 'Backspace' });

    expect(harness.settings.resetShortcut).toHaveBeenCalledWith('TOGGLE_TEXT', { TOGGLE_TEXT: 'shift+t' });
    expect(harness.settings.rebindShortcut).not.toHaveBeenCalled();
  });

  it('refuses a key no shortcut may take and keeps waiting', () => {
    const harness = renderPanel();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'F5', code: 'F5' });

    expect(harness.settings.rebindShortcut).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('That key cannot be used as a shortcut.');
    expect(screen.getByText('Press keys…')).toBeInTheDocument();
  });

  it('does not capture a key when nothing is being recorded', () => {
    const harness = renderPanel();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.keyDown(change, { key: 'x', code: 'KeyX' });

    expect(harness.settings.rebindShortcut).not.toHaveBeenCalled();
  });

  it('stops recording when focus leaves the panel', () => {
    const harness = renderPanel();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.blur(change, { relatedTarget: document.body });

    expect(harness.onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
  });
});

describe('the restore buttons', () => {
  it('keep their result as an edit', () => {
    const harness = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Restore the default shortcut for Toggle Text Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore all default shortcuts' }));

    expect(harness.settings.resetShortcut).toHaveBeenCalledWith('TOGGLE_TEXT', { TOGGLE_TEXT: 'shift+t' });
    expect(harness.settings.resetAllShortcuts).toHaveBeenCalledTimes(1);
    expect(harness.onOverridesChange).toHaveBeenLastCalledWith({});
  });
});

describe('the help dialog', () => {
  it('lists the keys as text, with no way to change them there', () => {
    const help: Pick<HelpViewModel, 'toggle'> = { toggle: jest.fn() };
    const registry = new ViewModelRegistry();
    registry.register('help', help as HelpViewModel);
    const store = createMaidrStore();
    store.dispatch({ type: 'help/setHelpItems', payload: ITEMS });

    render(
      <Provider store={store}>
        <MaidrContext.Provider
          value={{ viewModelRegistry: registry, commandExecutor: {} as unknown as CommandExecutor }}
        >
          <Help />
        </MaidrContext.Provider>
      </Provider>,
    );

    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('shift + t (custom, default t)')).toBeInTheDocument();
    expect(screen.getByText('To change a shortcut, open Settings and choose the Keyboard Shortcuts tab.')).toBeInTheDocument();
    // Close is the only control.
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Close']);
  });
});
