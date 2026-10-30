/**
 * @jest-environment jsdom
 */

/**
 * The description dialog's list of a figure's subplots.
 *
 * A grid cell no layer occupies -- the corner a seaborn clustermap leaves for
 * its colour bar -- arrives as a subplot with no layers. The dialog listed it
 * as "1. unknown (current)", as if MAIDR had failed to recognise a chart,
 * where the lobby announces the same cell as empty.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import type { DisplayDescriptionState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { render, screen } from '@testing-library/react';
import Description from '@ui/component/Description';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';

const FIGURE: DisplayDescriptionState = {
  chartType: 'Figure',
  title: 'Clustered heat map',
  axes: {},
  stats: [],
  dataTable: { headers: [], rows: [] },
  subplots: [
    { index: 1, title: '', traceTypes: [], isActive: true },
    { index: 2, title: 'Columns', traceTypes: ['Tree'], isActive: false },
    { index: 3, title: 'Scores', traceTypes: ['Heatmap'], isActive: false },
  ],
};

/** The `DescriptionViewModel` surface `Description` actually calls. */
type DescriptionStub = Pick<
  DescriptionViewModel,
  'toggle' | 'selectLayer' | 'focusPrevLayer' | 'focusNextLayer'
>;

/**
 * Renders the dialog against a real store seeded with the given description.
 * @param data - The description the dialog shows.
 */
function renderDescription(data: DisplayDescriptionState): void {
  const viewModel: DescriptionStub = {
    toggle: jest.fn(),
    selectLayer: jest.fn(),
    focusPrevLayer: jest.fn(),
    focusNextLayer: jest.fn(),
  };
  const registry = new ViewModelRegistry();
  registry.register('description', viewModel as DescriptionViewModel);

  const store = createMaidrStore();
  store.dispatch({ type: 'description/setDescription', payload: data });

  render(
    <Provider store={store}>
      <MaidrContext.Provider
        value={{
          viewModelRegistry: registry,
          commandExecutor: {} as unknown as CommandExecutor,
        }}
      >
        <Description />
      </MaidrContext.Provider>
    </Provider>,
  );
}

describe('the description dialog\'s subplot list', () => {
  it('lists a subplot with no layers as empty, not unknown', () => {
    renderDescription(FIGURE);

    expect(screen.getByText(/^1\. empty \(current\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/unknown/)).not.toBeInTheDocument();
  });

  it('lists the others by their chart types', () => {
    renderDescription(FIGURE);

    expect(screen.getByText(/^2\. Tree — Columns$/)).toBeInTheDocument();
  });
});
