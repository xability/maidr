/**
 * @jest-environment jsdom
 */

/**
 * The description dialog's "About this chart type" section.
 *
 * A reader who has never seen the kind of chart being described is told its
 * name and nothing else by the rest of the dialog. This section explains the
 * type, and it has to do so without costing the readers who already know it:
 * collapsed until asked for, announced as expandable, and operable from the
 * keyboard like any other disclosure.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import type { DescriptionState } from '@type/state';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { chartGuide, chartTypeLabel } from '@model/abstract';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import Description from '@ui/component/Description';
import { DEFAULT_LOCALE, setLocale } from '@util/i18n';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

/**
 * A bar chart's description, built with the real guide so the test reads the
 * dictionaries rather than a stand-in for them.
 * @returns The description the dialog is handed
 */
function barDescription(): DescriptionState {
  return {
    chartType: chartTypeLabel(TraceType.BAR),
    title: 'Sales by quarter',
    axes: { x: 'Quarter', y: 'Sales' },
    stats: [],
    guide: chartGuide(TraceType.BAR),
    dataTable: { headers: ['Quarter', 'Sales'], rows: [['Q1', 10]] },
  };
}

/**
 * Renders the description dialog the way `App` does, with a stub view model.
 * @param data - The description to show
 */
function renderDescription(data: DescriptionState): void {
  const registry = new ViewModelRegistry();
  registry.register('description', { toggle: jest.fn() } as unknown as DescriptionViewModel);

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

describe('chart type guide in the description dialog', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  it('should start collapsed, naming the chart type it explains', () => {
    renderDescription(barDescription());

    const toggle = screen.getByRole('button', { name: 'About this chart type: Bar Chart' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(chartGuide(TraceType.BAR).definition)).not.toBeVisible();
  });

  it('should be reachable by heading', () => {
    renderDescription(barDescription());

    expect(screen.getByRole('heading', { name: 'About this chart type: Bar Chart' })).toBeInTheDocument();
  });

  it('should reveal what the chart is, what it is for and what it looks like when expanded', () => {
    renderDescription(barDescription());
    const guide = chartGuide(TraceType.BAR);

    const toggle = screen.getByRole('button', { name: 'About this chart type: Bar Chart' });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel).toBeVisible();
    for (const heading of ['What it is', 'What it is used for', 'What it looks like']) {
      expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    }
    expect(screen.getByText(guide.definition)).toBeVisible();
    expect(screen.getByText(guide.purpose)).toBeVisible();
    expect(screen.getByText(guide.appearance)).toBeVisible();
  });

  it('should collapse again when toggled a second time', () => {
    renderDescription(barDescription());

    const toggle = screen.getByRole('button', { name: 'About this chart type: Bar Chart' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(chartGuide(TraceType.BAR).definition)).not.toBeVisible();
  });

  it('should render nothing when the description carries no guide', () => {
    renderDescription({ ...barDescription(), guide: undefined });

    expect(screen.queryByRole('button', { name: /About this chart type/ })).not.toBeInTheDocument();
  });

  it('should speak the reader\'s language', () => {
    setLocale('ko');
    renderDescription(barDescription());

    const toggle = screen.getByRole('button', { name: '이 차트 종류 알아보기: 막대 그래프' });
    fireEvent.click(toggle);

    expect(screen.getByText(chartGuide(TraceType.BAR).definition)).toBeVisible();
  });
});
