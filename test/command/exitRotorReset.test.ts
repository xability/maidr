import type { SubplotCue } from '@command/subplotCue';
import type { Context } from '@model/context';
import type { CandlestickDeltaService } from '@service/candlestickDelta';
import type { DisplayService } from '@service/display';
import type { RotorNavigationService } from '@service/rotor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { PlotState } from '@type/state';
import { ExitBrailleAndSubplotCommand, MoveToSubplotContextCommand } from '@command/move';
import { describe, expect, jest, test } from '@jest/globals';
import { Scope } from '@type/event';

/**
 * A rotor mode is an index on {@link RotorNavigationService} but a boolean on
 * the trace, and `Context.isRotorEnabled()` decides whether an arrow key is a
 * move or a rotor step. Leaving a trace for the multi-panel lobby with the
 * rotor still on hands every arrow key to the rotor, which has no trace to
 * act on and swallows them -- and the lobby binds no key that could switch the
 * rotor back off. So the exit has to return the rotor to data mode first,
 * while the outgoing trace is still active and its own flag is the one
 * cleared, the same as a PageUp/PageDown trace switch already does.
 */
describe('leaving a trace for the lobby returns the rotor to data mode', () => {
  function createHarness(): {
    calls: string[];
    context: Context;
    rotor: RotorNavigationService;
    displayService: DisplayService;
    cue: SubplotCue;
  } {
    const calls: string[] = [];
    const figureState = { type: 'figure', empty: false, index: 1, size: 2 } as unknown as PlotState;
    const context = {
      scope: Scope.TRACE,
      state: figureState,
      isMultiPanel: true,
      exitSubplot: jest.fn(() => {
        calls.push('exitSubplot');
        (context as { scope: Scope }).scope = Scope.SUBPLOT;
      }),
    } as unknown as Context;
    const rotor = {
      resetToDataMode: jest.fn(() => {
        calls.push('resetToDataMode');
      }),
    } as unknown as RotorNavigationService;
    const displayService = {
      syncFocusStack: jest.fn(),
      dismissModalScope: jest.fn(),
      notifyFocusChange: jest.fn(),
    } as unknown as DisplayService;
    const cue = { announceExit: jest.fn() } as unknown as SubplotCue;
    return { calls, context, rotor, displayService, cue };
  }

  test('Esc from trace scope resets the rotor before exiting the subplot', () => {
    const { calls, context, rotor, displayService, cue } = createHarness();

    new MoveToSubplotContextCommand(context, displayService, cue, rotor).execute();

    expect(calls).toEqual(['resetToDataMode', 'exitSubplot']);
    expect(cue.announceExit).toHaveBeenCalled();
  });

  test('Esc from braille mode on a multi-panel figure resets the rotor before exiting', () => {
    const { calls, context, rotor, displayService, cue } = createHarness();
    const brailleViewModel = { toggle: jest.fn() } as unknown as BrailleViewModel;
    const delta = { discardActiveLayer: jest.fn() } as unknown as CandlestickDeltaService;

    new ExitBrailleAndSubplotCommand(
      context,
      displayService,
      brailleViewModel,
      delta,
      cue,
      rotor,
    ).execute();

    expect(calls).toEqual(['resetToDataMode', 'exitSubplot']);
    expect(brailleViewModel.toggle).not.toHaveBeenCalled();
  });

  test('Esc from braille mode on a single-panel figure leaves the rotor alone', () => {
    // There is no lobby to be stranded at: the trace stays active, so its
    // rotor mode is still the one the reader chose.
    const { context, rotor, displayService, cue } = createHarness();
    (context as { isMultiPanel: boolean }).isMultiPanel = false;
    const traceState = { type: 'trace', empty: false } as unknown as PlotState;
    (context as { state: PlotState }).state = traceState;
    const brailleViewModel = { toggle: jest.fn() } as unknown as BrailleViewModel;
    const delta = { discardActiveLayer: jest.fn() } as unknown as CandlestickDeltaService;

    new ExitBrailleAndSubplotCommand(
      context,
      displayService,
      brailleViewModel,
      delta,
      cue,
      rotor,
    ).execute();

    expect(rotor.resetToDataMode).not.toHaveBeenCalled();
    expect(brailleViewModel.toggle).toHaveBeenCalledWith(traceState);
  });
});
