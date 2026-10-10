import type { RotorNavigationService } from '@service/rotor';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';

/**
 * Builds a RotorNavigationService stub exposing only the methods the view
 * model calls. Move methods default to a successful (null) result; override
 * to simulate a boundary by returning a message string.
 * @param overrides - Per-method return-value overrides
 * @returns A service-shaped stub with jest mocks
 */
function createMockService(
  overrides: Partial<Record<'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight', string | null>> = {},
): RotorNavigationService {
  return {
    moveUp: jest.fn(() => overrides.moveUp ?? null),
    moveDown: jest.fn(() => overrides.moveDown ?? null),
    moveLeft: jest.fn(() => overrides.moveLeft ?? null),
    moveRight: jest.fn(() => overrides.moveRight ?? null),
    moveToNextRotorUnit: jest.fn(() => 'HIGHER VALUE NAVIGATION'),
    moveToPrevRotorUnit: jest.fn(() => 'LOWER VALUE NAVIGATION'),
    getModeLabels: jest.fn(() => ({ labels: ['DATA', 'LOWER', 'HIGHER'], index: 1 })),
  } as unknown as RotorNavigationService;
}

// This suite verifies the view-model half of the fix (rotor_value is not
// written with the boundary message). The complementary half — that the
// boundary message is still announced exactly once via notification.notify
// inside the service, re-announcing on each repeat press — is covered in
// test/service/rotor.test.ts.
describe('RotorNavigationViewModel boundary announcement (#630 item 3)', () => {
  test('a boundary move runs the service but does NOT write the message to rotor_value', () => {
    const store = createMaidrStore();
    const service = createMockService({ moveRight: 'No higher value found to the right' });
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveRight();

    // The service still runs — its notification path announces the boundary
    // through the revision-keyed alert region.
    expect(service.moveRight).toHaveBeenCalledTimes(1);
    // rotor_value must NOT carry the boundary text, otherwise the ROTOR_AREA
    // aria-live region announces the same message a second time on first hit.
    expect(store.getState().rotor.rotor_value).toBeNull();
  });

  test('a successful move clears rotor_value (unchanged behaviour)', () => {
    const store = createMaidrStore();
    const service = createMockService();
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveUp();

    expect(service.moveUp).toHaveBeenCalledTimes(1);
    expect(store.getState().rotor.rotor_value).toBeNull();
  });

  test('cycling navigation units still announces the mode name via rotor_value', () => {
    const store = createMaidrStore();
    const service = createMockService();
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveToNextNavUnit();
    expect(store.getState().rotor.rotor_value).toBe('HIGHER VALUE NAVIGATION');

    vm.moveToPrevNavUnit();
    expect(store.getState().rotor.rotor_value).toBe('LOWER VALUE NAVIGATION');
  });
});

describe('RotorNavigationViewModel rotor dial', () => {
  /**
   * A service stub whose current mode follows the cycles, over a fixed ring.
   * @param labels - The modes around the ring
   * @returns The stub, and a setter for swapping the ring as a trace change would
   */
  function createCyclingService(labels: string[]): {
    service: RotorNavigationService;
    setLabels: (next: string[]) => void;
  } {
    let ring = labels;
    let index = 0;
    const service = {
      moveToNextRotorUnit: jest.fn(() => {
        index = (index + 1) % ring.length;
        return ring[index];
      }),
      moveToPrevRotorUnit: jest.fn(() => {
        index = (index - 1 + ring.length) % ring.length;
        return ring[index];
      }),
      getModeLabels: jest.fn(() => ({ labels: ring, index })),
    } as unknown as RotorNavigationService;
    return {
      service,
      setLabels: (next) => {
        ring = next;
        index = 0;
      },
    };
  }

  test('has no dial until the rotor is cycled', () => {
    const store = createMaidrStore();
    expect(store.getState().rotor.dial).toBeNull();
  });

  test('turns the ring one step per cycle, the way the reader turned it', () => {
    const store = createMaidrStore();
    const { service } = createCyclingService(['DATA', 'LOWER', 'HIGHER']);
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveToNextNavUnit();
    expect(store.getState().rotor.dial).toMatchObject({ labels: ['DATA', 'LOWER', 'HIGHER'], index: 1, turn: 1 });

    vm.moveToNextNavUnit();
    vm.moveToNextNavUnit();
    // Wrapped back to DATA, but the ring keeps turning forward rather than
    // spinning back the long way.
    expect(store.getState().rotor.dial).toMatchObject({ index: 0, turn: 3 });

    vm.moveToPrevNavUnit();
    expect(store.getState().rotor.dial).toMatchObject({ index: 2, turn: 2, direction: -1 });
  });

  test('bumps the revision on every cycle, so the dial reappears', () => {
    const store = createMaidrStore();
    const { service } = createCyclingService(['DATA']);
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveToNextNavUnit();
    vm.moveToNextNavUnit();

    expect(store.getState().rotor.dial?.revision).toBe(2);
  });

  test('starts a fresh ring at the current mode when the modes change', () => {
    const store = createMaidrStore();
    const { service, setLabels } = createCyclingService(['DATA', 'LOWER', 'HIGHER']);
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveToNextNavUnit();
    vm.moveToNextNavUnit();
    setLabels(['ROW', 'GRID']);
    vm.moveToNextNavUnit();

    expect(store.getState().rotor.dial).toMatchObject({ labels: ['ROW', 'GRID'], index: 1, turn: 1 });
  });

  test('clears the dial on dispose', () => {
    const store = createMaidrStore();
    const { service } = createCyclingService(['DATA', 'LOWER']);
    const vm = new RotorNavigationViewModel(store, service);

    vm.moveToNextNavUnit();
    vm.dispose();

    expect(store.getState().rotor.dial).toBeNull();
  });
});
