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
