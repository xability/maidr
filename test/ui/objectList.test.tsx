/**
 * @jest-environment jsdom
 */

/**
 * Component tests for the object list (`o`).
 *
 * What is asserted is what a screen reader depends on: the dialog's name and
 * description, the listbox's name and positions, where focus is after each
 * kind of change, and that what focus cannot say reaches the dialog's live
 * region -- once per press, and not on top of a focus move.
 *
 * The view model is the real one over a stub service, so a key's effect on
 * the store reaches the component the way it does at runtime.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ObjectListRow, ObjectListService, ObjectListView } from '@service/objectList';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ObjectListViewModel } from '@state/viewModel/objectListViewModel';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ObjectList from '@ui/component/ObjectList';
import { Provider } from 'react-redux';
// The `/jest-globals` entry point augments the imported `expect`; the bare
// one only augments the ambient global.
import '@testing-library/jest-dom/jest-globals';

const ROWS: ObjectListRow[] = [
  { key: 'Ada', label: 'Ada', detail: 'Links: 5', current: false },
  { key: 'Grace', label: 'Grace', detail: 'Links: 3', current: true },
  { key: 'Tim', label: 'Tim', detail: '', current: false },
];

/**
 * A view of the given rows.
 * @param rows - The rows
 * @param overrides - Anything else to set
 * @returns The view
 */
function view(rows: ObjectListRow[], overrides: Partial<ObjectListView> = {}): ObjectListView {
  return {
    title: 'Nodes',
    description: 'Up and Down arrows choose, Enter goes there, Escape closes.',
    summary: `${rows.length} nodes, Name, A to Z`,
    sortLabel: 'Name, A to Z',
    filterLabel: 'All',
    canSort: true,
    canFilter: true,
    rows,
    currentIndex: Math.max(0, rows.findIndex(row => row.current)),
    ...overrides,
  };
}

interface Rendered {
  viewModel: ObjectListViewModel;
  service: { [K in keyof ObjectListService]: jest.Mock };
}

/**
 * Opens the list and renders the dialog over it.
 * @param opened - The view the service opens with
 * @returns The view model and the stub service
 */
function renderList(opened: ObjectListView = view(ROWS)): Rendered {
  const store = createMaidrStore();
  const service = {
    isAvailable: jest.fn(() => true),
    open: jest.fn(() => opened),
    enterScope: jest.fn(),
    close: jest.fn(),
    cycleSort: jest.fn(),
    cycleFilter: jest.fn(),
    moveToObject: jest.fn(),
    dispose: jest.fn(),
  } as { [K in keyof ObjectListService]: jest.Mock };
  const viewModel = new ObjectListViewModel(store, service as unknown as ObjectListService);
  const registry = new ViewModelRegistry();
  registry.register('objectList', viewModel);

  // The plot has focus when `o` is pressed.
  const plot = document.createElement('div');
  plot.tabIndex = 0;
  document.body.appendChild(plot);
  plot.focus();

  viewModel.open();
  render(
    <Provider store={store}>
      <MaidrContext.Provider value={{ viewModelRegistry: registry, commandExecutor: {} as unknown as CommandExecutor }}>
        <ObjectList />
      </MaidrContext.Provider>
    </Provider>,
  );
  return { viewModel, service };
}

/** The dialog's own live region. */
function liveRegion(): HTMLElement {
  const region = screen.getByRole('dialog').querySelector('[aria-live="assertive"]');
  if (!(region instanceof HTMLElement)) {
    throw new TypeError('no live region');
  }
  return region;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ObjectList', () => {
  it('should name the dialog by its heading alone, and describe it by its keys', () => {
    renderList();

    const dialog = screen.getByRole('dialog', { name: 'Object list' });

    expect(dialog).toHaveAccessibleDescription('Up and Down arrows choose, Enter goes there, Escape closes.');
    expect(screen.getByRole('heading', { level: 2, name: 'Object list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close object list' })).toBeInTheDocument();
  });

  it('should name the list by what it shows and in what order', () => {
    renderList();

    expect(screen.getByRole('listbox', { name: '3 nodes, Name, A to Z' })).toBeInTheDocument();
  });

  it('should give every row its position and mark the reader\'s place', () => {
    renderList();

    const options = screen.getAllByRole('option');

    expect(options.map(option => option.getAttribute('aria-posinset'))).toEqual(['1', '2', '3']);
    expect(options.every(option => option.getAttribute('aria-setsize') === '3')).toBe(true);
    expect(options[1]).toHaveAttribute('aria-current', 'true');
    expect(options[0]).not.toHaveAttribute('aria-current');
    expect(options[0]).toHaveAccessibleName('Ada, Links: 5');
    expect(options[2]).toHaveAccessibleName('Tim');
  });

  it('should open with focus on the reader\'s place', () => {
    renderList();

    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Grace, Links: 3' }));
  });

  it('should follow the selection with focus', () => {
    const { viewModel } = renderList();

    act(() => viewModel.moveDown());

    expect(document.activeElement).toHaveAccessibleName('Tim');
    expect(document.activeElement).toHaveAttribute('aria-selected', 'true');
  });

  it('should say a new order with the first row it focuses, and not in the live region', () => {
    const { viewModel, service } = renderList();
    service.cycleSort.mockReturnValue(view(ROWS, { summary: '3 nodes, Links, highest first' }));
    const observer = new MutationObserver(() => {});
    observer.observe(liveRegion(), { childList: true, subtree: true, characterData: true });

    act(() => viewModel.cycleSort(1));

    expect(document.activeElement).toHaveAccessibleName('3 nodes, Links, highest first: Ada, Links: 5');
    expect(document.activeElement).toHaveAttribute('aria-posinset', '1');
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('should move focus to a new first row even when row 0 was already selected', () => {
    const { viewModel, service } = renderList();
    act(() => viewModel.moveToFirst());
    const before = document.activeElement;
    service.cycleFilter.mockReturnValue(view(ROWS.slice(0, 2), { summary: 'Group 1: 2 of 3 nodes, Name, A to Z' }));

    act(() => viewModel.cycleFilter(1));

    expect(document.activeElement).not.toBe(before);
    expect(document.activeElement).toHaveAccessibleName('Group 1: 2 of 3 nodes, Name, A to Z: Ada, Links: 5');
  });

  it('should drop the summary from the row once the reader moves on', () => {
    const { viewModel, service } = renderList();
    service.cycleSort.mockReturnValue(view(ROWS, { summary: '3 nodes, Links, highest first' }));
    act(() => viewModel.cycleSort(1));

    act(() => viewModel.moveDown());
    act(() => viewModel.moveUp());

    expect(document.activeElement).toHaveAccessibleName('Ada, Links: 5');
  });

  it('should keep focus on the order button and say the new order there', async () => {
    const { service } = renderList();
    service.cycleSort.mockReturnValue(view(ROWS, { summary: '3 nodes, Links, highest first', sortLabel: 'Links, highest first' }));
    const button = screen.getByRole('button', { name: 'Order: Name, A to Z' });
    await act(async () => button.focus());

    fireEvent.click(button);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Order: Links, highest first' }));
    expect(liveRegion()).toHaveTextContent('3 nodes, Links, highest first');
  });

  it('should take focus to the list for a key pressed while a button has it', async () => {
    const { viewModel, service } = renderList();
    service.cycleSort.mockReturnValue(view(ROWS, { summary: '3 nodes, Links, highest first' }));
    await act(async () => screen.getByRole('button', { name: 'Close object list' }).focus());

    // `s` from the keyboard, though focus was on a button.
    await act(async () => viewModel.cycleSort(1));

    expect(document.activeElement).toHaveAccessibleName('3 nodes, Links, highest first: Ada, Links: 5');

    await act(async () => screen.getByRole('button', { name: 'Close object list' }).focus());
    await act(async () => viewModel.moveDown());

    expect(document.activeElement).toHaveAccessibleName('Grace, Links: 3');
  });

  it('should take focus to the list for a move after the order button was pressed', () => {
    const { viewModel, service } = renderList();
    service.cycleSort.mockReturnValue(view(ROWS, { summary: '3 nodes, Links, highest first' }));
    fireEvent.click(screen.getByRole('button', { name: 'Order: Name, A to Z' }));

    act(() => viewModel.moveDown());

    expect(document.activeElement).toHaveAccessibleName('Grace, Links: 3');
  });

  it('should keep Enter and Space on a button away from the list\'s key bindings', () => {
    renderList();
    const reached = jest.fn();
    document.addEventListener('keydown', reached);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Close object list' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Showing: All' }), { key: ' ' });

    expect(reached).not.toHaveBeenCalled();
    document.removeEventListener('keydown', reached);
  });

  it('should leave the arrows to the list\'s key bindings', () => {
    renderList();
    const reached = jest.fn();
    document.addEventListener('keydown', reached);

    fireEvent.keyDown(screen.getByRole('option', { name: 'Grace, Links: 3' }), { key: 'ArrowDown' });

    expect(reached).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', reached);
  });

  it('should say each press at an end of the list, the same message twice included', () => {
    const { viewModel } = renderList();
    act(() => viewModel.moveToFirst());
    const observer = new MutationObserver(() => {});
    observer.observe(liveRegion(), { childList: true });

    act(() => viewModel.moveUp());
    act(() => viewModel.moveUp());

    const added = observer.takeRecords().flatMap(record => Array.from(record.addedNodes));
    expect(added.map(node => node.textContent)).toEqual(['Top of the list', 'Top of the list']);
    observer.disconnect();
  });

  it('should leave out the controls a chart has nothing for', () => {
    renderList(view(ROWS, { canSort: false, canFilter: false }));

    expect(screen.queryByRole('button', { name: /^Order/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Showing/ })).not.toBeInTheDocument();
  });

  it('should jump to a clicked row', () => {
    const { service } = renderList();

    fireEvent.click(screen.getByRole('option', { name: 'Tim' }));

    expect(service.close).toHaveBeenCalledTimes(1);
    expect(service.moveToObject).toHaveBeenCalledWith('Tim', 'Tim');
  });

  it('should keep Tab inside the dialog', async () => {
    renderList();
    const row = screen.getByRole('option', { name: 'Grace, Links: 3' });

    // Async, so the focus ripple a button starts on focus settles inside act.
    await act(async () => fireEvent.keyDown(row, { key: 'Tab' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close object list' }));
    await act(async () => fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(row);
  });
});
