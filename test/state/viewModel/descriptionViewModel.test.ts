/**
 * Tests for DescriptionViewModel.toggle() covering the open/close dispatch
 * flow and, in particular, the guard that avoids entering the DESCRIPTION
 * scope (via descriptionService.toggle()) when there is nothing to describe
 * — otherwise the user would be trapped in a modal that renders nothing.
 */
import type { DescriptionService } from '@service/description';
import type { DescriptionState, DisplayDescriptionState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';

function createServiceStub(
  description: DescriptionState | null,
): DescriptionService {
  return {
    getDescription: jest.fn(() => description),
    selectLayer: jest.fn(() => null),
    announcePendingLayerSwitch: jest.fn(),
    dispose: jest.fn(),
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

/** A three-layer subplot, opened on its middle layer. */
const LAYERED_DESCRIPTION: DisplayDescriptionState = {
  chartType: 'Line Chart',
  title: 'Fits',
  axes: { x: 'Year' },
  stats: [],
  dataTable: { headers: [], rows: [] },
  layers: [
    { index: 0, label: 'Observed', isActive: false },
    { index: 1, label: 'Fitted', isActive: true },
    { index: 2, label: 'Residual', isActive: false },
  ],
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

  test('speaks a layer switch on the way out, and only then', () => {
    const store = createMaidrStore();
    const service = createServiceStub(LAYERED_DESCRIPTION);
    const vm = new DescriptionViewModel(store, service);

    vm.toggle();

    expect(service.announcePendingLayerSwitch).not.toHaveBeenCalled();

    vm.toggle();

    expect(service.announcePendingLayerSwitch).toHaveBeenCalledTimes(1);
  });
});

describe('the layer tab cursor', () => {
  /**
   * Manual activation: arrowing along the strip moves the cursor and nothing
   * else. Without the cursor and the described layer being separate, every
   * arrow keypress would relocate the reader in the chart behind the dialog.
   */
  function openOnLayers(): { store: ReturnType<typeof createMaidrStore>; vm: DescriptionViewModel; service: DescriptionService } {
    const store = createMaidrStore();
    const service = createServiceStub(LAYERED_DESCRIPTION);
    const vm = new DescriptionViewModel(store, service);
    vm.toggle();
    return { store, vm, service };
  }

  test('starts on the layer the description is describing', () => {
    const { store } = openOnLayers();

    expect(store.getState().description.focusedLayerIndex).toBe(1);
  });

  test('is nowhere to point when the subplot has no layer strip', () => {
    const store = createMaidrStore();
    const vm = new DescriptionViewModel(store, createServiceStub(FIGURE_DESCRIPTION));

    vm.toggle();

    expect(store.getState().description.focusedLayerIndex).toBe(-1);
  });

  test('steps without touching the described layer', () => {
    const { store, vm, service } = openOnLayers();

    vm.focusNextLayer();

    expect(store.getState().description.focusedLayerIndex).toBe(2);
    expect(service.selectLayer).not.toHaveBeenCalled();
  });

  test('stops at the ends rather than wrapping past them', () => {
    // A cursor that silently jumps from the last layer back to the first costs
    // a reader who cannot see the strip their place in it.
    const { store, vm } = openOnLayers();

    vm.focusNextLayer();
    vm.focusNextLayer();

    expect(store.getState().description.focusedLayerIndex).toBe(2);

    vm.focusPrevLayer();
    vm.focusPrevLayer();
    vm.focusPrevLayer();

    expect(store.getState().description.focusedLayerIndex).toBe(0);
  });

  test('confirming the cursor switches the layer and re-renders against it', () => {
    const { store, vm, service } = openOnLayers();
    const switched: DisplayDescriptionState = {
      ...LAYERED_DESCRIPTION,
      chartType: 'Line Chart',
      layers: [
        { index: 0, label: 'Observed', isActive: false },
        { index: 1, label: 'Fitted', isActive: false },
        { index: 2, label: 'Residual', isActive: true },
      ],
    };
    (service.selectLayer as jest.Mock).mockReturnValue(switched);

    vm.focusNextLayer();
    vm.selectFocusedLayer();

    expect(service.selectLayer).toHaveBeenCalledWith(2);
    expect(store.getState().description.data).toEqual(switched);
    expect(store.getState().description.focusedLayerIndex).toBe(2);
  });

  test('leaves the dialog as it was when the service refuses the switch', () => {
    const { store, vm, service } = openOnLayers();
    (service.selectLayer as jest.Mock).mockReturnValue(null);

    vm.focusNextLayer();
    vm.selectFocusedLayer();

    expect(store.getState().description.data).toEqual(LAYERED_DESCRIPTION);
  });

  test('a click selects the layer it landed on, wherever the cursor was', () => {
    const { vm, service } = openOnLayers();

    vm.selectLayer(0);

    expect(service.selectLayer).toHaveBeenCalledWith(0);
  });

  test('has nothing to confirm when there is no strip', () => {
    const store = createMaidrStore();
    const service = createServiceStub(FIGURE_DESCRIPTION);
    const vm = new DescriptionViewModel(store, service);
    vm.toggle();

    vm.selectFocusedLayer();

    expect(service.selectLayer).not.toHaveBeenCalled();
  });
});
