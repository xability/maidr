import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import { RotorNavigationNextNavUnitCommand, RotorNavigationPrevNavUnitCommand } from '@command/rotorNavigation';
import { describe, expect, it, jest } from '@jest/globals';

/**
 * Cycling the rotor plays its ratchet cue in the direction of the cycle,
 * after the view model has moved, so the cue rides along with the
 * announcement of the new mode rather than replacing it.
 */
describe('rotor cycle commands', () => {
  function createDeps(): {
    calls: string[];
    viewModel: RotorNavigationViewModel;
    audio: AudioService;
  } {
    const calls: string[] = [];
    const viewModel = {
      moveToNextNavUnit: jest.fn(() => calls.push('vm:next')),
      moveToPrevNavUnit: jest.fn(() => calls.push('vm:prev')),
    } as unknown as RotorNavigationViewModel;
    const audio = {
      playRotorTick: jest.fn((direction: string) => calls.push(`tick:${direction}`)),
    } as unknown as AudioService;
    return { calls, viewModel, audio };
  }

  it('plays the forward ratchet after moving to the next mode', () => {
    const { calls, viewModel, audio } = createDeps();

    new RotorNavigationNextNavUnitCommand({} as Context, viewModel, audio).execute();

    expect(calls).toEqual(['vm:next', 'tick:next']);
  });

  it('plays the backward ratchet after moving to the previous mode', () => {
    const { calls, viewModel, audio } = createDeps();

    new RotorNavigationPrevNavUnitCommand({} as Context, viewModel, audio).execute();

    expect(calls).toEqual(['vm:prev', 'tick:prev']);
  });
});
