/**
 * @jest-environment jsdom
 */

/**
 * The description dialog's layer tab strip.
 *
 * A multi-layer subplot is several charts drawn over one another, and pressing
 * `d` used to describe whichever one the reader happened to be on without
 * saying the others existed. What is asserted here is the accessibility
 * contract, not the markup: that the strip is a tablist whose tabs point at the
 * panel they open, that exactly one tab is a tab stop (roving tabindex) and it
 * is the cursor's rather than the selected one, that the cursor's tab holds
 * focus so a screen reader reads it, and that the strip does not appear at all
 * when there is no layer choice to offer.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import type { DisplayDescriptionState } from '@type/state';
import type { ReactElement } from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import Description from '@ui/component/Description';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';

const LAYERED: DisplayDescriptionState = {
  chartType: 'Bar Chart',
  title: 'Fits',
  axes: { x: 'Year' },
  stats: [{ label: 'Max', value: 42 }],
  dataTable: { headers: ['Year', 'Value'], rows: [['2020', 1]] },
  layers: [
    { index: 0, label: 'Observed', isActive: true },
    { index: 1, label: 'Fitted', isActive: false },
    { index: 2, label: 'Residual', isActive: false },
  ],
};

const UNLAYERED: DisplayDescriptionState = {
  chartType: 'Bar Chart',
  title: 'Sales',
  axes: { x: 'Quarter' },
  stats: [],
  dataTable: { headers: ['Quarter', 'Sales'], rows: [['Q1', 10]] },
};

/** The `DescriptionViewModel` surface `Description` actually calls. */
type DescriptionStub = Pick<
  DescriptionViewModel,
  'toggle' | 'selectLayer' | 'focusPrevLayer' | 'focusNextLayer'
>;

/**
 * Renders the dialog against a real store seeded with the given description
 * and tab cursor, the way `App` wires it.
 * @param data - The description the dialog shows.
 * @param focusedLayerIndex - Where the tab cursor sits.
 * @returns The stub view model, so a test can assert what the dialog called.
 */
function renderDescription(
  data: DisplayDescriptionState,
  focusedLayerIndex?: number,
): DescriptionStub {
  const viewModel: DescriptionStub = {
    toggle: jest.fn(),
    selectLayer: jest.fn(),
    focusPrevLayer: jest.fn(),
    focusNextLayer: jest.fn(),
  };
  const registry = new ViewModelRegistry();
  registry.register('description', viewModel as DescriptionViewModel);

  const store = createMaidrStore();
  // Dispatched by action type: the slice's creators are module-private. A
  // drift in the type string is not silent — the dialog renders nothing.
  store.dispatch({ type: 'description/setDescription', payload: data });
  if (focusedLayerIndex !== undefined) {
    store.dispatch({ type: 'description/setFocusedLayer', payload: focusedLayerIndex });
  }

  const ui: ReactElement = (
    <Provider store={store}>
      <MaidrContext.Provider
        value={{
          viewModelRegistry: registry,
          commandExecutor: {} as unknown as CommandExecutor,
        }}
      >
        <Description />
      </MaidrContext.Provider>
    </Provider>
  );
  render(ui);
  return viewModel;
}

describe('the description dialog layer strip', () => {
  it('offers one tab per layer, named the way the layer names itself', () => {
    renderDescription(LAYERED);

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Observed',
      'Fitted',
      'Residual',
    ]);
  });

  it('says how many layers there are and which one is being described', () => {
    renderDescription(LAYERED);

    expect(screen.getByText('Showing layer 1 of 3: Observed')).toBeInTheDocument();
  });

  it('marks the described layer selected, and only it', () => {
    renderDescription(LAYERED);

    expect(
      screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-selected')),
    ).toEqual(['true', 'false', 'false']);
  });

  it('points every tab at the panel it opens', () => {
    renderDescription(LAYERED);

    const panel = screen.getByRole('tabpanel');
    screen.getAllByRole('tab').forEach((tab) => {
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    });
    expect(panel.getAttribute('aria-labelledby')).toBe(screen.getAllByRole('tab')[0].id);
  });

  it('makes only the cursor a tab stop, so Tab leaves the strip', () => {
    renderDescription(LAYERED, 2);

    expect(
      screen.getAllByRole('tab').map(tab => tab.getAttribute('tabindex')),
    ).toEqual(['-1', '-1', '0']);
  });

  it('holds focus on the cursor, so a screen reader reads the tab it is on', () => {
    renderDescription(LAYERED, 1);

    expect(document.activeElement).toBe(screen.getAllByRole('tab')[1]);
  });

  it('leaves the cursor free to sit somewhere other than the described layer', () => {
    // Manual activation: arrowing along the strip must not relocate the reader
    // in the chart behind the dialog.
    renderDescription(LAYERED, 2);

    const tabs = screen.getAllByRole('tab');

    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[2].getAttribute('tabindex')).toBe('0');
  });

  it('walks the strip with the arrow keys', () => {
    // The strip owns these rather than binding them in the DESCRIPTION scope:
    // a scoped binding fires wherever focus is in the dialog and would take
    // the arrows off everything else focusable here.
    const viewModel = renderDescription(LAYERED);

    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowRight' });

    expect(viewModel.focusNextLayer).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowLeft' });

    expect(viewModel.focusPrevLayer).toHaveBeenCalledTimes(1);
  });

  it('confirms the cursor with Space', () => {
    const viewModel = renderDescription(LAYERED, 2);

    fireEvent.keyDown(screen.getAllByRole('tab')[2], { key: ' ' });

    expect(viewModel.selectLayer).toHaveBeenCalledWith(2);
  });

  it('leaves Escape for the scope that closes the dialog', () => {
    // Escape is bound in the DESCRIPTION scope and reaches it as an ordinary
    // keydown. Consuming it here would make it a dead key whenever a tab has
    // focus — which is every time the dialog opens on a layered chart.
    // `fireEvent` returns false when the handler called `preventDefault`.
    renderDescription(LAYERED);

    const notConsumed = fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'Escape' });

    expect(notConsumed).toBe(true);
  });

  it('consumes the keys it does own, so the browser does not act on them too', () => {
    // A tab is a real <button>: an unprevented Space would activate it
    // natively as well, selecting the layer twice.
    renderDescription(LAYERED);

    expect(fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowRight' })).toBe(false);
  });

  it('leaves a key it does not own alone', () => {
    const viewModel = renderDescription(LAYERED);

    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowDown' });

    expect(viewModel.focusNextLayer).not.toHaveBeenCalled();
    expect(viewModel.selectLayer).not.toHaveBeenCalled();
  });

  it('selects the layer a click landed on', () => {
    const viewModel = renderDescription(LAYERED);

    fireEvent.click(screen.getAllByRole('tab')[2]);

    expect(viewModel.selectLayer).toHaveBeenCalledWith(2);
  });

  it('announces the panel change without repeating the tab', () => {
    renderDescription(LAYERED);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Description updated for layer 1 of 3',
    );
  });

  it('draws no strip at all when the subplot has one layer', () => {
    renderDescription(UNLAYERED);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });
});

describe('the description dialog data table', () => {
  it('names its scroll container and makes it reachable without a mouse', () => {
    // Named by the heading above it rather than by a label of its own, so the
    // truncation sentence is said once rather than by a heading, a region name
    // and a caption in turn.
    renderDescription({
      ...UNLAYERED,
      dataTable: { headers: ['Quarter', 'Sales'], rows: [['Q1', 10]] },
    });

    const region = screen.getByRole('region', { name: 'Data: 1 row' });

    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('says the truncation once, not once per element that could carry it', () => {
    const rows = Array.from({ length: 150 }, (_, i) => [`Q${i}`, i]);
    renderDescription({ ...UNLAYERED, dataTable: { headers: ['Quarter', 'Sales'], rows } });

    expect(screen.getAllByText('Data: showing 100 of 150 rows')).toHaveLength(1);
  });

  it('marks the first cell of each row as the row header', () => {
    renderDescription(UNLAYERED);

    expect(screen.getByRole('rowheader', { name: 'Q1' })).toBeInTheDocument();
  });
});

describe('the description dialog title', () => {
  it('names a multi-panel figure title for what it is', () => {
    // `l t` announces the same precedence as "Subplot title" / "Figure title";
    // a bare "Title" left a reader unable to tell whether they were being told
    // about this panel or about the whole figure.
    renderDescription({
      ...UNLAYERED,
      title: 'Quarterly revenue',
      titleSource: 'figure',
      subplots: [
        { index: 1, title: 'Left', traceTypes: ['Bar Chart'], isActive: true },
        { index: 2, title: 'Right', traceTypes: ['Line Chart'], isActive: false },
      ],
    });

    expect(screen.getByText('Figure title: Quarterly revenue')).toBeInTheDocument();
  });

  it('leaves a single-panel figure saying plainly "Title"', () => {
    renderDescription({ ...UNLAYERED, title: 'Sales', titleSource: 'layer' });

    expect(screen.getByText('Title: Sales')).toBeInTheDocument();
  });
});
