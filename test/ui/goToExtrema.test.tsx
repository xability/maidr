/**
 * @jest-environment jsdom
 */

/**
 * Component tests for the Go To dialog.
 *
 * The dialog is the only place a reader can jump to a named point of interest
 * without walking the whole trace, so what is asserted here is the contract a
 * screen reader depends on: that a selection goes out through the view model's
 * guarded path rather than the component driving the model itself.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { ExtremaTarget } from '@type/extrema';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GoToExtrema } from '@ui/components/GoToExtrema';
import { Provider } from 'react-redux';
// The `/jest-globals` entry point augments the imported `expect`; the bare
// one only augments the ambient global.
import '@testing-library/jest-dom/jest-globals';

/** The `GoToExtremaViewModel` surface `GoToExtrema` actually calls. */
type GoToExtremaStub = Pick<
  GoToExtremaViewModel,
  | 'getAvailableXValueOptions'
  | 'hide'
  | 'moveUp'
  | 'moveDown'
  | 'moveToIndex'
  | 'moveToXValue'
  | 'selectTarget'
>;

/** Builds a min/max target the dialog can render. */
function createTarget(label: string, value: number): ExtremaTarget {
  return {
    label,
    value,
    pointIndex: 0,
    segment: 'bar',
    type: 'max',
    navigationType: 'point',
  };
}

const TARGETS = [
  createTarget('Max Bar at Q1', 8),
  createTarget('Min Bar at Q3', 2),
];

interface Rendered {
  viewModel: { [K in keyof GoToExtremaStub]: jest.Mock };
  store: ReturnType<typeof createMaidrStore>;
}

/**
 * Renders the dialog over a real store with a stub view model.
 *
 * The store is the production one so the component reads its state through
 * `useViewModelState` exactly as it does at runtime; only the view model's
 * own methods are stubbed.
 * @param options - Test options.
 * @param options.xValues - The X-value search options the trace offers.
 * @param options.targets - The extrema targets to list.
 * @returns The stub view model, for asserting what the component called.
 */
function renderDialog(options: {
  xValues?: { value: number; label: string }[];
  targets?: ExtremaTarget[];
} = {}): Rendered {
  const viewModel = {
    getAvailableXValueOptions: jest.fn(() => options.xValues ?? []),
    hide: jest.fn(),
    moveUp: jest.fn(),
    moveDown: jest.fn(),
    moveToIndex: jest.fn(),
    moveToXValue: jest.fn(() => true),
    selectTarget: jest.fn(),
  };

  const store = createMaidrStore();
  store.dispatch({
    type: 'goToExtrema/show',
    payload: { targets: options.targets ?? TARGETS, description: 'Go somewhere' },
  });

  const registry = new ViewModelRegistry();
  registry.register('goToExtrema', viewModel as unknown as GoToExtremaViewModel);

  render(
    <Provider store={store}>
      <MaidrContext.Provider
        value={{
          viewModelRegistry: registry,
          commandExecutor: {} as unknown as CommandExecutor,
        }}
      >
        <GoToExtrema />
      </MaidrContext.Provider>
    </Provider>,
  );

  return { viewModel: viewModel as unknown as Rendered['viewModel'], store };
}

/** The dialog's extrema listbox. */
function targetListbox(): HTMLElement {
  return screen.getByRole('listbox', { name: 'Navigation targets' });
}

/**
 * The dialog's assertive live region.
 * @returns The region element.
 * @throws When the dialog rendered without one.
 */
function liveRegion(): HTMLElement {
  const region = document.getElementById('sr-active-option-announcer');
  if (region === null) {
    throw new Error('the dialog rendered no live region');
  }
  return region;
}

describe('go to dialog: selecting a target', () => {
  it('should send a clicked target to the view model rather than navigating itself', () => {
    const { viewModel } = renderDialog();

    fireEvent.click(screen.getByLabelText('Max Bar Value: 8.00 at Q1'));

    expect(viewModel.selectTarget).toHaveBeenCalledWith(TARGETS[0]);
  });

  it('should send an Enter on the selected target to the view model', () => {
    const { viewModel } = renderDialog();

    fireEvent.keyDown(targetListbox(), { key: 'Enter' });

    expect(viewModel.selectTarget).toHaveBeenCalledWith(TARGETS[0]);
  });

  it('should leave the dialog to close itself, so the close cue sounds once', () => {
    // The view model hides before it navigates, which is what keeps the scope
    // change and its close cue ahead of the move. A component that hides on
    // its own account would sound it a second time.
    const { viewModel } = renderDialog();

    fireEvent.click(screen.getByLabelText('Max Bar Value: 8.00 at Q1'));

    expect(viewModel.hide).not.toHaveBeenCalled();
  });
});

describe('go to dialog: selecting an X value', () => {
  it('should send a chosen X value to the view model rather than moving the trace', () => {
    const { viewModel } = renderDialog({
      xValues: [{ value: 3, label: 'Q3' }],
    });

    fireEvent.click(screen.getByLabelText('Search and select X value'));
    fireEvent.click(screen.getByRole('option', { name: 'Q3' }));

    expect(viewModel.moveToXValue).toHaveBeenCalledWith(3);
    expect(viewModel.hide).not.toHaveBeenCalled();
  });
});

describe('go to dialog: what the listbox announces', () => {
  it('should keep a live region mounted for a trace with no X-value search', () => {
    // The region used to live inside the search option, which only exists for
    // the three traces that offer getAvailableXValues. For a bar or a heatmap
    // there was no region at all, so every message written to it was dropped.
    renderDialog({ xValues: [] });

    expect(liveRegion()).toBeInTheDocument();
  });

  it('should announce the first-option boundary on a trace with no X-value search', () => {
    renderDialog({ xValues: [] });

    fireEvent.keyDown(targetListbox(), { key: 'ArrowUp' });

    expect(liveRegion()).toHaveTextContent('At first extrema option');
  });

  it('should move focus onto the selected option, which is what announces it', () => {
    const { store } = renderDialog();

    act(() => {
      store.dispatch({ type: 'goToExtrema/updateSelectedIndex', payload: 1 });
    });

    expect(document.activeElement).toBe(screen.getByLabelText('Min Bar Value: 2.00 at Q3'));
  });

  it('should not also write the moved-to label into the live region', () => {
    // Focus lands on the option and the screen reader reads its label and
    // position; writing the same label to an assertive region says it twice.
    // Observed as a mutation, because the region carrying no new text and the
    // region never being written are the same assertion otherwise.
    // A trace that offers the X-value search, so the region existed even
    // before it was hoisted out of that block: the failure this pins is the
    // duplicate write, not a missing region.
    const { viewModel } = renderDialog({ xValues: [{ value: 3, label: 'Q3' }] });
    const observer = new MutationObserver(() => {});
    observer.observe(liveRegion(), { childList: true, characterData: true, subtree: true });

    fireEvent.keyDown(targetListbox(), { key: 'ArrowDown' });
    const records = observer.takeRecords();
    observer.disconnect();

    expect(records).toHaveLength(0);
    expect(viewModel.moveDown).toHaveBeenCalledTimes(1);
  });

  it('should not repeat the label on a Home jump either', () => {
    const { viewModel } = renderDialog({ xValues: [{ value: 3, label: 'Q3' }] });
    const observer = new MutationObserver(() => {});
    observer.observe(liveRegion(), { childList: true, characterData: true, subtree: true });

    fireEvent.keyDown(targetListbox(), { key: 'Home' });
    const records = observer.takeRecords();
    observer.disconnect();

    expect(records).toHaveLength(0);
    expect(viewModel.moveToIndex).toHaveBeenCalledWith(0);
  });
});
