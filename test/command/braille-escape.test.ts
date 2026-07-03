import type { Context } from '@model/context';
import type { BrailleService } from '@service/braille';
import type { DisplayService } from '@service/display';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import { ExitBrailleAndSubplotCommand, MoveToTraceContextCommand } from '@command/move';
import { describe, expect, jest, test } from '@jest/globals';
import { Scope } from '@type/event';

/**
 * Creates a mock Context with enterSubplot and exitSubplot stubs.
 */
function createMockContext(overrides: Record<string, unknown> = {}): Context {
  return {
    enterSubplot: jest.fn(),
    exitSubplot: jest.fn(),
    active: { notifyStateUpdate: jest.fn() },
    state: { type: 'trace', empty: false },
    ...overrides,
  } as unknown as Context;
}

/**
 * Creates a mock DisplayService with dismissModalScope, notifyFocusChange,
 * and toggleFocus stubs.
 */
function createMockDisplayService(overrides: Record<string, unknown> = {}): DisplayService {
  return {
    dismissModalScope: jest.fn(),
    notifyFocusChange: jest.fn(),
    toggleFocus: jest.fn(),
    syncFocusStack: jest.fn(),
    ...overrides,
  } as unknown as DisplayService;
}

/**
 * Creates a mock BrailleService with a configurable isEnabled getter.
 */
function createMockBrailleService(enabled: boolean): BrailleService {
  return {
    get isEnabled() {
      return enabled;
    },
    refreshDisplay: jest.fn(),
  } as unknown as BrailleService;
}

/**
 * Creates a mock BrailleViewModel with a toggle stub.
 */
function createMockBrailleViewModel(overrides: Record<string, unknown> = {}): BrailleViewModel {
  return {
    toggle: jest.fn(),
    ...overrides,
  } as unknown as BrailleViewModel;
}

describe('ExitBrailleAndSubplotCommand', () => {
  describe('multi-panel figure', () => {
    test('executes the three-step sequence in correct order', () => {
      const callOrder: string[] = [];
      const context = createMockContext({
        isMultiPanel: true,
        exitSubplot: jest.fn<() => void>().mockImplementation(() => {
          callOrder.push('exitSubplot');
        }),
      });
      const displayService = createMockDisplayService({
        dismissModalScope: jest.fn<() => void>().mockImplementation(() => {
          callOrder.push('dismissModalScope');
        }),
        notifyFocusChange: jest.fn<() => void>().mockImplementation(() => {
          callOrder.push('notifyFocusChange');
        }),
      });
      const brailleViewModel = createMockBrailleViewModel();

      const command = new ExitBrailleAndSubplotCommand(context, displayService, brailleViewModel);
      command.execute();

      expect(callOrder).toEqual([
        'dismissModalScope',
        'exitSubplot',
        'notifyFocusChange',
      ]);
    });

    test('calls dismissModalScope with SUBPLOT as the target scope', () => {
      const context = createMockContext({ isMultiPanel: true });
      const displayService = createMockDisplayService();
      const brailleViewModel = createMockBrailleViewModel();

      const command = new ExitBrailleAndSubplotCommand(context, displayService, brailleViewModel);
      command.execute();

      expect(displayService.dismissModalScope).toHaveBeenCalledWith(Scope.SUBPLOT);
    });

    test('calls notifyFocusChange with SUBPLOT', () => {
      const context = createMockContext({ isMultiPanel: true });
      const displayService = createMockDisplayService();
      const brailleViewModel = createMockBrailleViewModel();

      const command = new ExitBrailleAndSubplotCommand(context, displayService, brailleViewModel);
      command.execute();

      expect(displayService.notifyFocusChange).toHaveBeenCalledWith(Scope.SUBPLOT);
    });

    test('calls context.exitSubplot()', () => {
      const context = createMockContext({ isMultiPanel: true });
      const displayService = createMockDisplayService();
      const brailleViewModel = createMockBrailleViewModel();

      const command = new ExitBrailleAndSubplotCommand(context, displayService, brailleViewModel);
      command.execute();

      expect(context.exitSubplot).toHaveBeenCalled();
    });

    test('does not toggle braille off', () => {
      const context = createMockContext({ isMultiPanel: true });
      const displayService = createMockDisplayService();
      const brailleViewModel = createMockBrailleViewModel();

      const command = new ExitBrailleAndSubplotCommand(context, displayService, brailleViewModel);
      command.execute();

      expect(brailleViewModel.toggle).not.toHaveBeenCalled();
    });
  });

  describe('single-panel figure', () => {
    test('toggles braille off instead of exiting the subplot', () => {
      const traceState = { type: 'trace', empty: false };
      const context = createMockContext({ isMultiPanel: false, state: traceState });
      const displayService = createMockDisplayService();
      const brailleViewModel = createMockBrailleViewModel();

      const command = new ExitBrailleAndSubplotCommand(context, displayService, brailleViewModel);
      command.execute();

      expect(brailleViewModel.toggle).toHaveBeenCalledWith(traceState);
      expect(context.exitSubplot).not.toHaveBeenCalled();
      expect(displayService.dismissModalScope).not.toHaveBeenCalled();
      expect(displayService.notifyFocusChange).not.toHaveBeenCalled();
    });
  });
});

describe('MoveToTraceContextCommand', () => {
  test('calls enterSubplot', () => {
    const context = createMockContext();
    const brailleService = createMockBrailleService(false);
    const displayService = createMockDisplayService();

    const command = new MoveToTraceContextCommand(context, brailleService, displayService);
    command.execute();

    expect(context.enterSubplot).toHaveBeenCalled();
  });

  test('toggles braille focus when braille is enabled', () => {
    const context = createMockContext();
    const brailleService = createMockBrailleService(true);
    const displayService = createMockDisplayService();

    const command = new MoveToTraceContextCommand(context, brailleService, displayService);
    command.execute();

    expect(displayService.toggleFocus).toHaveBeenCalledWith(Scope.BRAILLE);
  });

  test('does not toggle braille focus when braille is disabled', () => {
    const context = createMockContext();
    const brailleService = createMockBrailleService(false);
    const displayService = createMockDisplayService();

    const command = new MoveToTraceContextCommand(context, brailleService, displayService);
    command.execute();

    expect(displayService.toggleFocus).not.toHaveBeenCalled();
  });

  test('does not call refreshDisplay when state type is not trace', () => {
    const context = createMockContext({
      state: { type: 'subplot', empty: false },
    });
    const brailleService = createMockBrailleService(true);
    const displayService = createMockDisplayService();

    const command = new MoveToTraceContextCommand(context, brailleService, displayService);
    command.execute();

    expect(brailleService.refreshDisplay).not.toHaveBeenCalled();
    // toggleFocus should still be called so braille UI renders
    expect(displayService.toggleFocus).toHaveBeenCalledWith(Scope.BRAILLE);
  });
});
