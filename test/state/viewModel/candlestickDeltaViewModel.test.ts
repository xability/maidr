import type {
  CandlestickDeltaReference,
  CandlestickDeltaService,
} from '@service/candlestickDelta';
import type { NotificationService } from '@service/notification';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { CandlestickDeltaViewModel } from '@state/viewModel/candlestickDeltaViewModel';

const REFERENCES: CandlestickDeltaReference[] = [
  { id: 'ma-layer:0', label: 'Moving Average 3 days' },
  { id: 'ma-layer:1', label: 'Moving Average 6 days' },
];

/**
 * A mutable stub of CandlestickDeltaService. isActive/selectedReference are
 * plain properties the tests flip; the rest are jest mocks.
 */
interface ServiceStub {
  isActive: boolean;
  selectedReference: string | null;
  getReferences: jest.Mock;
  activate: jest.Mock;
  deactivate: jest.Mock;
  openSettings: jest.Mock;
  closeSettings: jest.Mock;
  setSelectedReference: jest.Mock;
}

interface Harness {
  vm: CandlestickDeltaViewModel;
  service: ServiceStub;
  notify: jest.Mock;
}

function setup(): Harness {
  const store = createMaidrStore();
  const service: ServiceStub = {
    isActive: false,
    selectedReference: null,
    getReferences: jest.fn(() => REFERENCES),
    activate: jest.fn(() => true),
    deactivate: jest.fn(() => true),
    openSettings: jest.fn(),
    closeSettings: jest.fn(),
    setSelectedReference: jest.fn(),
  };
  const notify = jest.fn();
  const notification = { notify } as unknown as NotificationService;
  const vm = new CandlestickDeltaViewModel(
    store,
    service as unknown as CandlestickDeltaService,
    notification,
  );
  return { vm, service, notify };
}

describe('CandlestickDeltaViewModel.toggleLayer', () => {
  let h: Harness;
  beforeEach(() => {
    h = setup();
  });

  test('deactivates when the layer is already active', () => {
    h.service.isActive = true;

    h.vm.toggleLayer();

    expect(h.service.deactivate).toHaveBeenCalledTimes(1);
    expect(h.service.activate).not.toHaveBeenCalled();
    expect(h.vm.state.visible).toBe(false);
  });

  test('re-activates the remembered reference without opening the picker', () => {
    h.service.isActive = false;
    h.service.selectedReference = 'ma-layer:0';

    h.vm.toggleLayer();

    expect(h.service.activate).toHaveBeenCalledTimes(1);
    expect(h.service.getReferences).not.toHaveBeenCalled();
    expect(h.vm.state.visible).toBe(false);
  });

  test('first use with no reference warns and opens the picker', () => {
    h.service.isActive = false;
    h.service.selectedReference = null;

    h.vm.toggleLayer();

    expect(h.vm.state.visible).toBe(true);
    expect(h.vm.state.references).toEqual(REFERENCES);
    expect(h.service.openSettings).toHaveBeenCalledTimes(1);
    expect(h.service.activate).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(
      expect.stringContaining('No reference line chosen yet'),
    );
  });

  test('first use on an unsupported chart announces and does not open the picker', () => {
    h.service.isActive = false;
    h.service.selectedReference = null;
    h.service.getReferences.mockReturnValue(null);

    h.vm.toggleLayer();

    expect(h.vm.state.visible).toBe(false);
    expect(h.service.openSettings).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(
      expect.stringContaining('only available on candlestick charts'),
    );
  });
});

describe('CandlestickDeltaViewModel reference picker', () => {
  let h: Harness;
  beforeEach(() => {
    h = setup();
  });

  test('opens preselecting the remembered reference', () => {
    h.service.selectedReference = 'ma-layer:1';

    expect(h.vm.openReferencePicker()).toBe(true);
    expect(h.vm.state.visible).toBe(true);
    expect(h.vm.state.selectedIndex).toBe(1);
    expect(h.service.openSettings).toHaveBeenCalledTimes(1);
  });

  test('opening while already open cancels (toggle behavior)', () => {
    h.vm.openReferencePicker();
    expect(h.vm.state.visible).toBe(true);

    expect(h.vm.openReferencePicker()).toBe(false);
    expect(h.vm.state.visible).toBe(false);
    expect(h.service.closeSettings).toHaveBeenCalledTimes(1);
  });

  test('does not open on an unsupported chart', () => {
    h.service.getReferences.mockReturnValue(null);

    expect(h.vm.openReferencePicker()).toBe(false);
    expect(h.vm.state.visible).toBe(false);
    expect(h.notify).toHaveBeenCalledWith(
      expect.stringContaining('only available on candlestick charts'),
    );
  });

  test('move selection clamps at both ends', () => {
    h.vm.openReferencePicker(); // selectedIndex 0, two references
    h.vm.moveSelectionUp();
    expect(h.vm.state.selectedIndex).toBe(0);

    h.vm.moveSelectionDown();
    expect(h.vm.state.selectedIndex).toBe(1);
    h.vm.moveSelectionDown();
    expect(h.vm.state.selectedIndex).toBe(1);

    h.vm.moveSelectionUp();
    expect(h.vm.state.selectedIndex).toBe(0);
  });

  test('setSelectedIndex ignores out-of-range indices', () => {
    h.vm.openReferencePicker();
    h.vm.setSelectedIndex(1);
    expect(h.vm.state.selectedIndex).toBe(1);

    h.vm.setSelectedIndex(5);
    expect(h.vm.state.selectedIndex).toBe(1);
    h.vm.setSelectedIndex(-1);
    expect(h.vm.state.selectedIndex).toBe(1);
  });

  test('confirm activates the highlighted reference and closes the picker', () => {
    h.vm.openReferencePicker();
    h.vm.setSelectedIndex(1);

    h.vm.confirmSelection();

    expect(h.vm.state.visible).toBe(false);
    expect(h.service.closeSettings).toHaveBeenCalled();
    expect(h.service.activate).toHaveBeenCalledWith('ma-layer:1');
  });

  test('confirm with nothing to select cancels without activating', () => {
    // Picker never opened: no references, not visible.
    h.vm.confirmSelection();

    expect(h.service.activate).not.toHaveBeenCalled();
    expect(h.vm.state.visible).toBe(false);
  });

  test('cancel while closed is a no-op', () => {
    h.vm.cancel();
    expect(h.service.closeSettings).not.toHaveBeenCalled();
  });
});
