/**
 * @jest-environment jsdom
 */

/**
 * The description dialog speaks the reader's language.
 *
 * Every string in this dialog reaches the reader through `useLocale`, and the
 * failure mode of routing one of them any other way is silent: the dialog
 * still renders, in English, for a reader who asked for Korean. Two strings
 * are checked — the title, which also names the dialog, and the close button,
 * which is the way out of it — because between them they cover both halves of
 * the wiring: the dictionary having the key, and the component reading it
 * through the hook rather than from a literal.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import type { DescriptionState } from '@type/state';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { render, screen } from '@testing-library/react';
import Description from '@ui/component/Description';
import { DEFAULT_LOCALE, setLocale } from '@util/i18n';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

const DESCRIPTION_DATA: DescriptionState = {
  chartType: 'Bar Chart',
  title: 'Sales by quarter',
  axes: { x: 'Quarter', y: 'Sales' },
  stats: [{ label: 'Max', value: 42 }],
  dataTable: {
    headers: ['Quarter', 'Sales'],
    rows: [['Q1', 10], ['Q2', 42]],
  },
};

/** The `DescriptionViewModel` surface `Description` actually calls. */
type DescriptionStub = Pick<DescriptionViewModel, 'toggle'>;

/**
 * Renders the description dialog the way `App` does, with a stub view model.
 */
function renderDescription(): void {
  const description: DescriptionStub = { toggle: jest.fn() };

  const registry = new ViewModelRegistry();
  registry.register('description', description as DescriptionViewModel);

  const store = createMaidrStore();
  store.dispatch({ type: 'description/setDescription', payload: DESCRIPTION_DATA });

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

describe('description dialog in korean', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  it('should name itself in korean', () => {
    setLocale('ko');

    renderDescription();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('차트 설명');
  });

  it('should label the close button in korean', () => {
    setLocale('ko');

    renderDescription();

    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });
});
