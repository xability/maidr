/**
 * @jest-environment jsdom
 */

/**
 * Component test for changing a shortcut from the help dialog (#189).
 *
 * The dialog has to offer the change on the rows that can take one, name the
 * action in each button so a screen reader user knows which shortcut they
 * are changing, capture the next key rather than run it, and let Escape
 * keep the old shortcut instead of closing the dialog.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { HelpMenuItem } from '@type/help';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import Help from '@ui/component/Help';
import { Provider } from 'react-redux';
// The `/jest-globals` entry point augments the imported `expect`; the bare
// one only augments the ambient global.
import '@testing-library/jest-dom/jest-globals';

type HelpStub = Pick<HelpViewModel, 'toggle' | 'rebind' | 'resetBinding' | 'resetAllBindings' | 'announce'>;

const ITEMS: HelpMenuItem[] = [
  { description: 'Toggle Braille Mode', key: 'b', commandKey: 'TOGGLE_BRAILLE' },
  { description: 'Toggle Text Mode', key: 'shift + t', commandKey: 'TOGGLE_TEXT', isCustom: true, defaultKey: 't' },
  { description: 'Open/Close Help', key: 'ctrl + /' },
  { description: 'Announce X Label', key: 'l x' },
];

function renderHelp(items: HelpMenuItem[] = ITEMS, status = ''): HelpStub {
  const help: HelpStub = {
    toggle: jest.fn(),
    rebind: jest.fn(),
    resetBinding: jest.fn(),
    resetAllBindings: jest.fn(),
    announce: jest.fn(),
  };
  const registry = new ViewModelRegistry();
  registry.register('help', help as HelpViewModel);

  const store = createMaidrStore();
  store.dispatch({ type: 'help/setHelpItems', payload: items });
  if (status) {
    store.dispatch({ type: 'help/setStatus', payload: status });
  }

  render(
    <Provider store={store}>
      <MaidrContext.Provider
        value={{ viewModelRegistry: registry, commandExecutor: {} as unknown as CommandExecutor }}
      >
        <Help />
      </MaidrContext.Provider>
    </Provider>,
  );
  return help;
}

describe('the rows a reader may change', () => {
  it('offers a named Change button on each, and none on the rest', () => {
    renderHelp();

    expect(screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change shortcut for Toggle Text Mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open\/Close Help/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Announce X Label/ })).not.toBeInTheDocument();
  });

  it('shows a changed row\'s default beside its key, with a way back', () => {
    renderHelp();

    expect(screen.getByText('shift + t (custom, default t)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore the default shortcut for Toggle Text Mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore all default shortcuts' })).toBeInTheDocument();
  });

  it('offers no restore-all when nothing is changed', () => {
    renderHelp([ITEMS[0], ITEMS[2]]);

    expect(screen.queryByRole('button', { name: 'Restore all default shortcuts' })).not.toBeInTheDocument();
  });
});

describe('recording a new shortcut', () => {
  it('prompts, then hands the next key to the view model as a combo', () => {
    const help = renderHelp();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    expect(help.announce).toHaveBeenCalledWith(
      'Press the new shortcut for Toggle Braille Mode. Escape cancels; Backspace restores the default.',
    );
    expect(screen.getByText('Press keys…')).toBeInTheDocument();

    fireEvent.keyDown(change, { key: 'X', code: 'KeyX', shiftKey: true });

    expect(help.rebind).toHaveBeenCalledWith('TOGGLE_BRAILLE', 'shift+x');
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
  });

  it('waits through a modifier on its own', () => {
    const help = renderHelp();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Shift', code: 'ShiftLeft', shiftKey: true });

    expect(help.rebind).not.toHaveBeenCalled();
    expect(screen.getByText('Press keys…')).toBeInTheDocument();
  });

  it('keeps the old shortcut on Escape, and keeps the dialog open', () => {
    const help = renderHelp();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Escape', code: 'Escape' });

    expect(help.rebind).not.toHaveBeenCalled();
    expect(help.announce).toHaveBeenLastCalledWith('Shortcut unchanged.');
    expect(help.toggle).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restores the default on Backspace', () => {
    const help = renderHelp();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Text Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Backspace', code: 'Backspace' });

    expect(help.resetBinding).toHaveBeenCalledWith('TOGGLE_TEXT');
    expect(help.rebind).not.toHaveBeenCalled();
  });

  it('refuses a key no shortcut may take and keeps waiting', () => {
    const help = renderHelp();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'F5', code: 'F5' });

    expect(help.rebind).not.toHaveBeenCalled();
    expect(help.announce).toHaveBeenLastCalledWith('That key cannot be used as a shortcut.');
    expect(screen.getByText('Press keys…')).toBeInTheDocument();
  });

  it('does not capture a key when nothing is being recorded', () => {
    const help = renderHelp();
    const change = screen.getByRole('button', { name: 'Change shortcut for Toggle Braille Mode' });

    fireEvent.keyDown(change, { key: 'x', code: 'KeyX' });

    expect(help.rebind).not.toHaveBeenCalled();
  });
});

describe('the status region', () => {
  it('is a live region carrying the last outcome', () => {
    renderHelp(ITEMS, 'Toggle Braille Mode is now shift + b.');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Toggle Braille Mode is now shift + b.');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('routes the reset buttons to the view model', () => {
    const help = renderHelp();

    fireEvent.click(screen.getByRole('button', { name: 'Restore the default shortcut for Toggle Text Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore all default shortcuts' }));

    expect(help.resetBinding).toHaveBeenCalledWith('TOGGLE_TEXT');
    expect(help.resetAllBindings).toHaveBeenCalledTimes(1);
  });
});
