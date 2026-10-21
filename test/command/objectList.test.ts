import type { CommandContext } from '@command/command';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { NotificationService } from '@service/notification';
import type { ObjectListViewModel } from '@state/viewModel/objectListViewModel';
import type { Keys } from '@type/event';
import { CommandFactory } from '@command/factory';
import {
  ObjectListCloseCommand,
  ObjectListFilterCommand,
  ObjectListMoveCommand,
  ObjectListSelectCommand,
  ObjectListSortCommand,
  ObjectListToggleCommand,
} from '@command/objectList';
import { describe, expect, jest, test } from '@jest/globals';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';
import { t } from '@util/i18n';

interface Fixture {
  command: ObjectListToggleCommand;
  viewModel: { state: { visible: boolean }; isAvailable: jest.Mock; open: jest.Mock; hide: jest.Mock };
  notify: jest.Mock;
  warn: jest.Mock;
  stopAutoplay: jest.Mock;
}

/**
 * The toggle over stubs.
 * @param options - The list's state
 * @param options.visible - Whether it is open
 * @param options.available - Whether the layer has one
 * @returns The command and its stubs
 */
function fixture({ visible = false, available = true } = {}): Fixture {
  const viewModel = {
    state: { visible },
    isAvailable: jest.fn(() => available),
    open: jest.fn(() => available),
    hide: jest.fn(),
  };
  const notify = jest.fn();
  const warn = jest.fn();
  const stopAutoplay = jest.fn();
  const command = new ObjectListToggleCommand(
    viewModel as unknown as ObjectListViewModel,
    { notify } as unknown as NotificationService,
    { playWarningToneIfEnabled: warn } as unknown as AudioService,
    { stop: stopAutoplay } as unknown as AutoplayService,
  );
  return { command, viewModel, notify, warn, stopAutoplay };
}

describe('ObjectListToggleCommand', () => {
  test('should open the list on a chart that has one, stopping autoplay first', () => {
    const { command, viewModel, notify, stopAutoplay } = fixture();
    stopAutoplay.mockImplementation(() => {
      expect(viewModel.open).not.toHaveBeenCalled();
    });

    command.execute();

    expect(stopAutoplay).toHaveBeenCalledTimes(1);
    expect(viewModel.open).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  test('should say a chart walked along its axes has no list, rather than nothing', () => {
    const { command, viewModel, notify, warn, stopAutoplay } = fixture({ available: false });

    command.execute();

    expect(notify).toHaveBeenCalledWith('No object list for this layer. Move through it with the arrow keys.');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(viewModel.open).not.toHaveBeenCalled();
    expect(stopAutoplay).not.toHaveBeenCalled();
  });

  test('should close the list when it is open', () => {
    const { command, viewModel } = fixture({ visible: true });

    command.execute();

    expect(viewModel.hide).toHaveBeenCalledTimes(1);
    expect(viewModel.open).not.toHaveBeenCalled();
  });
});

describe('object list key wiring', () => {
  // A keymap name and its `CommandFactory` case are matched by string alone,
  // and `create` throws only when the key is pressed, so a rename on one side
  // would ship green without this.
  test.each([Scope.TRACE, Scope.BRAILLE, Scope.OBJECT_LIST])('%s binds o to the object list', (scope) => {
    expect(getKeymapForScope(scope).OBJECT_LIST_TOGGLE?.hotkey).toBe('o');
  });

  test('o is listed in the help menu where the reader opens the list, and only there', () => {
    const trace = getKeymapForScope(Scope.TRACE);

    expect(t(trace.OBJECT_LIST_TOGGLE.description)).toBe('Open the object list');
    expect(trace.OBJECT_LIST_TOGGLE.showInHelp).not.toBe(false);
    expect(getKeymapForScope(Scope.OBJECT_LIST).OBJECT_LIST_TOGGLE.showInHelp).toBe(false);
  });

  test('the multi-panel lobby leaves o to the unassigned-key warning', () => {
    expect(getKeymapForScope(Scope.SUBPLOT).OBJECT_LIST_TOGGLE).toBeUndefined();
  });

  test('the factory resolves every object list key to its command', () => {
    const factory = new CommandFactory({} as unknown as CommandContext);
    const expected: Record<string, unknown> = {
      OBJECT_LIST_TOGGLE: ObjectListToggleCommand,
      OBJECT_LIST_MOVE_UP: ObjectListMoveCommand,
      OBJECT_LIST_MOVE_DOWN: ObjectListMoveCommand,
      OBJECT_LIST_MOVE_FIRST: ObjectListMoveCommand,
      OBJECT_LIST_MOVE_LAST: ObjectListMoveCommand,
      OBJECT_LIST_PAGE_UP: ObjectListMoveCommand,
      OBJECT_LIST_PAGE_DOWN: ObjectListMoveCommand,
      OBJECT_LIST_SELECT: ObjectListSelectCommand,
      OBJECT_LIST_CLOSE: ObjectListCloseCommand,
      OBJECT_LIST_NEXT_SORT: ObjectListSortCommand,
      OBJECT_LIST_PREVIOUS_SORT: ObjectListSortCommand,
      OBJECT_LIST_NEXT_FILTER: ObjectListFilterCommand,
      OBJECT_LIST_PREVIOUS_FILTER: ObjectListFilterCommand,
    };

    // Every name the dialog's keymap binds has a case, and no case is missing
    // from the expectation.
    expect(Object.keys(getKeymapForScope(Scope.OBJECT_LIST)).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, type] of Object.entries(expected)) {
      // `Keys` narrows to `never` (one keymap is empty), so cast at the same
      // boundary KeybindingService does.
      expect(factory.create(name as Keys)).toBeInstanceOf(type as new (...args: never[]) => unknown);
    }
  });

  test('each movement key moves the selection the way it says', () => {
    const viewModel = {
      moveUp: jest.fn(),
      moveDown: jest.fn(),
      moveToFirst: jest.fn(),
      moveToLast: jest.fn(),
      pageUp: jest.fn(),
      pageDown: jest.fn(),
      cycleSort: jest.fn(),
      cycleFilter: jest.fn(),
    };
    const vm = viewModel as unknown as ObjectListViewModel;

    new ObjectListMoveCommand(vm, 'up').execute();
    new ObjectListMoveCommand(vm, 'down').execute();
    new ObjectListMoveCommand(vm, 'first').execute();
    new ObjectListMoveCommand(vm, 'last').execute();
    new ObjectListMoveCommand(vm, 'pageUp').execute();
    new ObjectListMoveCommand(vm, 'pageDown').execute();
    new ObjectListSortCommand(vm, -1).execute();
    new ObjectListFilterCommand(vm, 1).execute();

    for (const method of ['moveUp', 'moveDown', 'moveToFirst', 'moveToLast', 'pageUp', 'pageDown'] as const) {
      expect(viewModel[method]).toHaveBeenCalledTimes(1);
    }
    expect(viewModel.cycleSort).toHaveBeenCalledWith(-1);
    expect(viewModel.cycleFilter).toHaveBeenCalledWith(1);
  });
});
