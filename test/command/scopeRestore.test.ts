import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import { AnnounceXCommand } from '@command/describe';
import { EnterGridCellCommand } from '@command/gridCell';
import { MoveToSubplotContextCommand } from '@command/move';
import { describe, expect, jest, test } from '@jest/globals';
import { Scope } from '@type/event';

/**
 * Creates a mock Context whose scope can change when exitSubplot runs,
 * mirroring the real Context (exitSubplot toggles the scope only when the
 * plot stack is deep enough, i.e. on multi-layer/multi-subplot figures).
 */
function createMockContext(overrides: Record<string, unknown> = {}): Context {
  return {
    scope: Scope.TRACE,
    exitSubplot: jest.fn(),
    active: {},
    state: { type: 'trace', empty: false, xAxis: 'Month' },
    enterGridCell: jest.fn(() => true),
    ...overrides,
  } as unknown as Context;
}

function createMockDisplayService(): DisplayService {
  return {
    syncFocusStack: jest.fn(),
    exitLabelScope: jest.fn(),
  } as unknown as DisplayService;
}

describe('MoveToSubplotContextCommand', () => {
  test('syncs the focus stack when exitSubplot actually changed scope', () => {
    const context = createMockContext();
    // Simulate a successful exit: the scope flips to SUBPLOT.
    (context.exitSubplot as jest.Mock).mockImplementation(() => {
      (context as { scope: Scope }).scope = Scope.SUBPLOT;
    });
    const displayService = createMockDisplayService();

    new MoveToSubplotContextCommand(context, displayService).execute();

    expect(displayService.syncFocusStack).toHaveBeenCalledWith(Scope.SUBPLOT);
  });

  test('does not sync the focus stack when exitSubplot was a no-op (single-subplot chart)', () => {
    // exitSubplot is a no-op: scope stays TRACE.
    const context = createMockContext();
    const displayService = createMockDisplayService();

    new MoveToSubplotContextCommand(context, displayService).execute();

    expect(context.exitSubplot).toHaveBeenCalled();
    expect(displayService.syncFocusStack).not.toHaveBeenCalled();
  });
});

describe('AnnounceCommand.restoreScope (via AnnounceXCommand)', () => {
  function createAnnounceCommand(scope: Scope): {
    command: AnnounceXCommand;
    displayService: DisplayService;
  } {
    const context = createMockContext({ scope });
    const displayService = createMockDisplayService();
    const textViewModel = { update: jest.fn() } as unknown as TextViewModel;
    const audioService = { playWarningToneIfEnabled: jest.fn() } as unknown as AudioService;
    const textService = { isTerse: jest.fn(() => false) } as unknown as TextService;
    const command = new AnnounceXCommand(
      context,
      textViewModel,
      audioService,
      textService,
      displayService,
    );
    return { command, displayService };
  }

  test.each([Scope.TRACE_LABEL, Scope.FIGURE_LABEL])(
    'exits label scope when announcing from %s',
    (scope) => {
      const { command, displayService } = createAnnounceCommand(scope);

      command.execute();

      expect(displayService.exitLabelScope).toHaveBeenCalled();
    },
  );

  test.each([Scope.TRACE, Scope.SUBPLOT])(
    'leaves the scope untouched when announcing from %s (t pressed outside label mode)',
    (scope) => {
      const { command, displayService } = createAnnounceCommand(scope);

      command.execute();

      expect(displayService.exitLabelScope).not.toHaveBeenCalled();
    },
  );
});

describe('EnterGridCellCommand', () => {
  function createNotification(): NotificationService {
    return { notify: jest.fn() } as unknown as NotificationService;
  }

  test('stays silent on traces without grid navigation support', () => {
    // Plain trace: no supportsGridMode method, so isGridNavigable is false.
    const context = createMockContext({ active: {} });
    const notification = createNotification();

    new EnterGridCellCommand(context, notification).execute();

    expect(context.enterGridCell).not.toHaveBeenCalled();
    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('stays silent when the trace supports the interface but grid mode is off', () => {
    const context = createMockContext({
      active: { supportsGridMode: jest.fn(() => false) },
    });
    const notification = createNotification();

    new EnterGridCellCommand(context, notification).execute();

    expect(context.enterGridCell).not.toHaveBeenCalled();
    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('announces an empty cell only for genuinely grid-capable traces', () => {
    const context = createMockContext({
      active: { supportsGridMode: jest.fn(() => true) },
      enterGridCell: jest.fn(() => false),
    });
    const notification = createNotification();

    new EnterGridCellCommand(context, notification).execute();

    expect(notification.notify).toHaveBeenCalledWith('No points in this cell');
  });

  test('does not announce when entering a populated cell succeeds', () => {
    const context = createMockContext({
      active: { supportsGridMode: jest.fn(() => true) },
      enterGridCell: jest.fn(() => true),
    });
    const notification = createNotification();

    new EnterGridCellCommand(context, notification).execute();

    expect(notification.notify).not.toHaveBeenCalled();
  });
});
