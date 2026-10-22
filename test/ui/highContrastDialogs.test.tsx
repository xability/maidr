/**
 * @jest-environment jsdom
 */

/**
 * MAIDR's hand-rolled dialogs under high contrast.
 *
 * High contrast paints the backdrop behind the chart -- the chart's article,
 * or the body of a page the chart has to itself -- dark, and sets its `color`
 * to the reader's light colour so the chart's own HTML text reads on it. The
 * object list, the Go To list and the candlestick delta picker are drawn in
 * that article on a light paper of their own, and text in them that sets no
 * colour inherited the light colour: white on white. MUI's Dialog sets the
 * paper's text colour itself, so the description and help dialogs never did.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ObjectListService, ObjectListView } from '@service/objectList';
import type { CandlestickDeltaViewModel } from '@state/viewModel/candlestickDeltaViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { ExtremaTarget } from '@type/extrema';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ObjectListViewModel } from '@state/viewModel/objectListViewModel';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { cleanup, render, screen } from '@testing-library/react';
import CandlestickDeltaSettings from '@ui/component/CandlestickDeltaSettings';
import ObjectList from '@ui/component/ObjectList';
import { GoToExtrema } from '@ui/components/GoToExtrema';
import { Provider } from 'react-redux';

// jsdom lays nothing out, and has no scrollIntoView for the picker to call.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = (): void => {};
}

/** The colour high contrast gives the backdrop's text by default. */
const BACKDROP_TEXT = 'rgb(255, 255, 255)';

/**
 * Renders a dialog inside a backdrop painted as high contrast paints it.
 * @param dialog - The dialog to render
 * @param store - The store it reads its state from
 * @param registry - The view models it reaches
 */
function renderOnBackdrop(
  dialog: ReactElement,
  store: ReturnType<typeof createMaidrStore>,
  registry: ViewModelRegistry,
): void {
  const backdrop = document.createElement('article');
  backdrop.style.backgroundColor = 'rgb(0, 0, 0)';
  backdrop.style.color = BACKDROP_TEXT;
  document.body.appendChild(backdrop);
  render(
    <Provider store={store}>
      <MaidrContext.Provider value={{ viewModelRegistry: registry, commandExecutor: {} as unknown as CommandExecutor }}>
        {dialog}
      </MaidrContext.Provider>
    </Provider>,
    { container: backdrop },
  );
}

/**
 * The colours of the given text and of the paper of the dialog it is in.
 * @param text - Text in an open dialog
 * @returns The text's colour and the dialog's background
 */
function colours(text: HTMLElement): { text: string; paper: string } {
  const dialog = text.closest('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new TypeError('not in a dialog');
  }
  return {
    text: window.getComputedStyle(text).color,
    paper: window.getComputedStyle(dialog).backgroundColor,
  };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('a dialog drawn on its own paper in high contrast', () => {
  it('draws the object list\'s title, summary and rows in the paper\'s text colour', () => {
    const opened: ObjectListView = {
      title: 'Nodes',
      description: 'Up and Down arrows choose, Enter goes there, Escape closes.',
      summary: '2 nodes, Hierarchy order',
      sortLabel: 'Hierarchy order',
      filterLabel: 'All',
      canSort: false,
      canFilter: false,
      rows: [
        { key: 'src', label: 'src/', detail: '', current: true },
        { key: 'docs', label: 'docs/', detail: '', current: false },
      ],
      currentIndex: 0,
    };
    const service = {
      isAvailable: jest.fn(() => true),
      open: jest.fn(() => opened),
      enterScope: jest.fn(),
      close: jest.fn(),
      cycleSort: jest.fn(),
      cycleFilter: jest.fn(),
      moveToObject: jest.fn(),
      dispose: jest.fn(),
    };
    const store = createMaidrStore();
    const viewModel = new ObjectListViewModel(store, service as unknown as ObjectListService);
    const registry = new ViewModelRegistry();
    registry.register('objectList', viewModel);
    viewModel.open();

    renderOnBackdrop(<ObjectList />, store, registry);

    const texts = [
      screen.getByRole('heading', { name: 'Object list' }),
      screen.getByText('2 nodes, Hierarchy order'),
      screen.getByText('docs/'),
    ].map(colours);
    expect(texts.map(colour => colour.paper)).toEqual(Array.from({ length: 3 }, () => 'rgb(255, 255, 255)'));
    expect(texts.map(colour => colour.text)).not.toContain(BACKDROP_TEXT);
  });

  it('draws the Go To list\'s title in the paper\'s text colour', () => {
    const target: ExtremaTarget = {
      label: 'Max Bar at Q1',
      display: { name: 'Max Bar', x: 'Q1' },
      value: 8,
      pointIndex: 0,
      segment: 'bar',
      type: 'max',
      navigationType: 'point',
    };
    const store = createMaidrStore();
    store.dispatch({ type: 'goToExtrema/show', payload: { targets: [target], description: 'Go somewhere' } });
    const registry = new ViewModelRegistry();
    registry.register('goToExtrema', {
      getAvailableXValueOptions: jest.fn(() => []),
      hide: jest.fn(),
    } as unknown as GoToExtremaViewModel);

    renderOnBackdrop(<GoToExtrema />, store, registry);

    const title = colours(screen.getByRole('heading', { level: 3 }));
    expect(title.paper).toBe('rgb(255, 255, 255)');
    expect(title.text).not.toBe(BACKDROP_TEXT);
  });

  it('draws the candlestick delta picker\'s title and options in the paper\'s text colour', () => {
    const store = createMaidrStore();
    store.dispatch({
      type: 'candlestickDelta/show',
      payload: { references: [{ id: 'ma:0', label: 'Moving Average 3 days' }], selectedIndex: 0 },
    });
    const registry = new ViewModelRegistry();
    registry.register('candlestickDelta', {
      cancel: jest.fn(),
      setSelectedIndex: jest.fn(),
      confirmSelection: jest.fn(),
    } as unknown as CandlestickDeltaViewModel);

    renderOnBackdrop(<CandlestickDeltaSettings />, store, registry);

    const texts = [
      screen.getByRole('heading', { level: 2 }),
      screen.getByText('Moving Average 3 days'),
    ].map(colours);
    expect(texts.map(colour => colour.paper)).toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
    expect(texts.map(colour => colour.text)).not.toContain(BACKDROP_TEXT);
  });
});
