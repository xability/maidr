import type { Context } from '@model/context';
import type { CandlestickDeltaService } from '@service/candlestickDelta';
import type { RotorNavigationService } from '@service/rotor';
import { MoveToNextTraceCommand, MoveToPrevTraceCommand } from '@command/move';
import { describe, expect, jest, test } from '@jest/globals';

/**
 * A rotor mode is an index on {@link RotorNavigationService} but a boolean on
 * the trace itself, and PageUp/PageDown swap the trace underneath both. If the
 * rotor is not handed back to data mode first, it keeps routing arrow keys into
 * a mode the incoming trace never entered — dead, silent keys in POINT
 * NAVIGATION, and a false "no intersection" on every point in INTERSECTING
 * POINT NAVIGATION. The reset has to run while the outgoing trace is still
 * active, so that its flag is the one cleared.
 */
describe('trace switching returns the rotor to data mode', () => {
  function createHarness(): {
    calls: string[];
    context: Context;
    delta: CandlestickDeltaService;
    rotor: RotorNavigationService;
  } {
    const calls: string[] = [];
    const context = {
      stepTrace: jest.fn(() => {
        calls.push('stepTrace');
      }),
    } as unknown as Context;
    const delta = {
      deactivateIfActive: jest.fn(() => {
        calls.push('deactivateIfActive');
      }),
    } as unknown as CandlestickDeltaService;
    const rotor = {
      resetToDataMode: jest.fn(() => {
        calls.push('resetToDataMode');
      }),
    } as unknown as RotorNavigationService;
    return { calls, context, delta, rotor };
  }

  test('PageUp resets the rotor before stepping to the next trace', () => {
    const { calls, context, delta, rotor } = createHarness();

    new MoveToNextTraceCommand(context, delta, rotor).execute();

    expect(calls).toEqual(['deactivateIfActive', 'resetToDataMode', 'stepTrace']);
    expect(context.stepTrace).toHaveBeenCalledWith('UPWARD');
  });

  test('PageDown resets the rotor before stepping to the previous trace', () => {
    const { calls, context, delta, rotor } = createHarness();

    new MoveToPrevTraceCommand(context, delta, rotor).execute();

    expect(calls).toEqual(['deactivateIfActive', 'resetToDataMode', 'stepTrace']);
    expect(context.stepTrace).toHaveBeenCalledWith('DOWNWARD');
  });
});
