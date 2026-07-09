/**
 * Tests for DescriptionViewModel.toggle() covering the open/close dispatch
 * flow and, in particular, the guard that avoids entering the DESCRIPTION
 * scope (via descriptionService.toggle()) when there is nothing to describe
 * — otherwise the user would be trapped in a modal that renders nothing.
 */
import type { DescriptionService } from '@service/description';
import type { DescriptionState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';

function createServiceStub(
  description: DescriptionState | null,
): DescriptionService {
  return {
    getDescription: jest.fn(() => description),
    toggle: jest.fn(),
  } as unknown as DescriptionService;
}

const FIGURE_DESCRIPTION: DescriptionState = {
  chartType: 'Multi-panel figure',
  title: 'My Figure',
  axes: {},
  stats: [{ label: 'Subplots', value: 2 }],
  dataTable: { headers: [], rows: [] },
};

describe('descriptionViewModel.toggle', () => {
  test('opens the modal and switches scope when there is a description', () => {
    const store = createMaidrStore();
    const service = createServiceStub(FIGURE_DESCRIPTION);
    const vm = new DescriptionViewModel(store, service);

    vm.toggle();

    expect(store.getState().description.data).toEqual(FIGURE_DESCRIPTION);
    expect(service.toggle).toHaveBeenCalledTimes(1);
  });

  test('does not dispatch or switch scope when there is nothing to describe', () => {
    const store = createMaidrStore();
    const service = createServiceStub(null);
    const vm = new DescriptionViewModel(store, service);

    vm.toggle();

    // No data was stored, so the modal stays closed...
    expect(store.getState().description.data).toBeNull();
    // ...and the scope was never switched into the empty DESCRIPTION modal.
    expect(service.toggle).not.toHaveBeenCalled();
  });

  test('closing an open modal clears the data and switches scope back', () => {
    const store = createMaidrStore();
    const service = createServiceStub(FIGURE_DESCRIPTION);
    const vm = new DescriptionViewModel(store, service);

    vm.toggle(); // open
    vm.toggle(); // close

    expect(store.getState().description.data).toBeNull();
    // Once to enter the modal scope, once to leave it.
    expect(service.toggle).toHaveBeenCalledTimes(2);
    // getDescription is only consulted when opening, not when closing.
    expect(service.getDescription).toHaveBeenCalledTimes(1);
  });
});
